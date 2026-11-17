import crypto from 'crypto';
import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LeadsService, BD_PIPELINE_STAGES } from '../leads/leads.service.js';
import { ProjectFlowService } from '../project-flow/projectFlow.service.js';
import { FinanceService } from '../finance/finance.service.js';

export const LEAD_SOURCES = ['Website', 'Phone Call', 'Google My Business', 'Paid Ads', 'Marketing Person', 'Referral', 'Other'];
const OPEN_STAGES_SQL = "l.stage NOT IN ('Won','Lost')";
const CYCLE_TO_CATEGORY = { one_time: 'one_time', monthly: 'regular', quarterly: 'regular', half_yearly: 'regular', annual: 'regular' };

function httpError(status, message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

const slugs = (u) => (u.roles || []).map((r) => r.slug);
/** Owner / admin see every lead; field executives and account managers see their own (as the existing leads list does). */
export const isSalesGlobal = (u) => Boolean(u.isOwner || ['owner', 'admin'].some((s) => slugs(u).includes(s)) || ['owner', 'admin'].includes(u.role));
const isScoped = (u) => !isSalesGlobal(u) && (slugs(u).includes('field-executive') || slugs(u).includes('account-manager'));

/** SQL predicate limiting leads `alias` to what the actor may see. Returns [sql, params]. */
export function leadScope(actor, alias = 'l') {
  if (!isScoped(actor)) return ['1=1', []];
  return [`(${alias}.owner_user_id = ? OR ${alias}.created_by = ? OR ${alias}.rep_user_id = ?)`, [actor.id, actor.id, actor.id]];
}

export async function assertLeadAccess(leadId, actor) {
  const [where, params] = leadScope(actor);
  const [[row]] = await pool.query(`SELECT l.id FROM leads l WHERE l.id = ? AND ${where}`, [leadId, ...params]);
  if (row) return;
  const [[any]] = await pool.query('SELECT id FROM leads WHERE id = ?', [leadId]);
  throw any ? httpError(403, 'This lead is assigned to someone else', 'FORBIDDEN') : httpError(404, 'Lead not found', 'NOT_FOUND');
}

const periodRange = (period, from, to) => {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (period === 'custom' && from && to) return [from, to];
  if (period === 'today') return [iso(today), iso(today)];
  if (period === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return [iso(d), iso(today)];
  }
  if (period === 'all') return ['2000-01-01', '2999-12-31'];
  return [`${iso(today).slice(0, 7)}-01`, iso(today)]; // month to date
};

const audit = (actor, action, entityType, entityId, details, req) =>
  AuditService.log({ actorId: actor.id, action, entityType, entityId, details, req });

export class SalesService {
  // ───────────────────────── Leads ─────────────────────────

  static async dashboard(actor, { period = 'month', from, to } = {}) {
    const [start, end] = periodRange(period, from, to);
    const [scope, sp] = leadScope(actor);
    const [[k]] = await pool.query(
      `SELECT COUNT(*) AS leads,
              SUM(l.stage = 'Won') AS won,
              SUM(l.stage IN ('Negotiation','ProposalSent')) AS negotiating,
              COALESCE(SUM(CASE WHEN ${OPEN_STAGES_SQL} THEN l.estimated_value END), 0) AS pipeline_value,
              COALESCE(SUM(CASE WHEN l.stage = 'Won' THEN l.estimated_value END), 0) AS won_value
       FROM leads l WHERE ${scope} AND DATE(l.created_at) BETWEEN ? AND ?`,
      [...sp, start, end]
    );
    const [bySource] = await pool.query(
      `SELECT COALESCE(NULLIF(l.source, ''), 'Other') AS source, COUNT(*) AS leads, SUM(l.stage = 'Won') AS won
       FROM leads l WHERE ${scope} AND DATE(l.created_at) BETWEEN ? AND ? GROUP BY 1 ORDER BY leads DESC`,
      [...sp, start, end]
    );
    const [byStage] = await pool.query(
      `SELECT l.stage, COUNT(*) AS n, COALESCE(SUM(l.estimated_value), 0) AS value FROM leads l
       WHERE ${scope} AND l.pipeline_entity <> 'Mediqora' GROUP BY l.stage`,
      sp
    );
    const [due] = await pool.query(
      `SELECT l.id, l.title, l.company_name, l.next_followup_date, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_user_id
       WHERE ${scope} AND ${OPEN_STAGES_SQL} AND l.next_followup_date IS NOT NULL AND l.next_followup_date <= CURDATE()
       ORDER BY l.next_followup_date LIMIT 20`,
      sp
    );
    const leads = Number(k.leads || 0);
    const won = Number(k.won || 0);
    return {
      range: { start, end },
      kpis: {
        leads,
        won,
        conversionRate: leads ? Math.round((won / leads) * 1000) / 10 : 0,
        negotiating: Number(k.negotiating || 0),
        pipelineValue: Number(k.pipeline_value),
        wonValue: Number(k.won_value)
      },
      bySource: LEAD_SOURCES.map((s) => {
        const r = bySource.find((x) => x.source === s) || { leads: 0, won: 0 };
        return { source: s, leads: Number(r.leads), won: Number(r.won), winRate: Number(r.leads) ? Math.round((Number(r.won) / Number(r.leads)) * 100) : 0 };
      }),
      byStage: byStage.map((r) => ({ stage: r.stage, count: Number(r.n), value: Number(r.value) })),
      followupsDue: due
    };
  }

  static async listLeads(actor, { search = '', stage = '', source = '', ownerId = '', repId = '', pipeline = 'D-Grow', period = '', from, to } = {}) {
    const [scope, sp] = leadScope(actor);
    const where = [scope];
    const params = [...sp];
    if (pipeline) { where.push('l.pipeline_entity = ?'); params.push(pipeline); }
    // Same period as the KPI cards: enquiries received in that window.
    if (period && period !== 'all') {
      const [start, end] = periodRange(period, from, to);
      where.push('DATE(l.created_at) BETWEEN ? AND ?');
      params.push(start, end);
    }
    if (stage) { where.push('l.stage = ?'); params.push(stage); }
    if (source) { where.push("COALESCE(NULLIF(l.source, ''), 'Other') = ?"); params.push(source); }
    if (ownerId === 'none') where.push('l.owner_user_id IS NULL');
    else if (ownerId) { where.push('l.owner_user_id = ?'); params.push(Number(ownerId)); }
    if (repId === 'none') where.push('l.rep_user_id IS NULL');
    else if (repId) { where.push('l.rep_user_id = ?'); params.push(Number(repId)); }
    if (search.trim()) {
      where.push('(l.title LIKE ? OR l.company_name LIKE ? OR l.contact_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.services_interested LIKE ? OR l.referrer_name LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.pipeline_entity, l.stage, l.title, l.company_name, l.contact_name, l.phone, l.email, l.source, l.referrer_name,
              l.services_interested, l.estimated_value, l.owner_user_id, u.name AS owner_name, l.rep_user_id, rp.name AS rep_name,
              l.next_followup_date, l.last_activity_at, l.converted_client_id, l.created_at,
              (SELECT COUNT(*) FROM lead_interactions i WHERE i.lead_id = l.id AND i.interaction_type = 'call') AS calls,
              (SELECT COUNT(*) FROM lead_interactions i WHERE i.lead_id = l.id AND i.interaction_type = 'negotiation') AS negotiations,
              (SELECT COUNT(*) FROM proposals p WHERE p.lead_id = l.id) AS proposals,
              (SELECT COUNT(*) FROM sales_meetings m WHERE m.lead_id = l.id) AS meetings
       FROM leads l LEFT JOIN users u ON u.id = l.owner_user_id LEFT JOIN users rp ON rp.id = l.rep_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY (l.next_followup_date IS NULL), l.next_followup_date, l.created_at DESC
       LIMIT 500`,
      params
    );
    return { leads: rows.map((r) => ({ ...r, calls: Number(r.calls), negotiations: Number(r.negotiations), proposals: Number(r.proposals), meetings: Number(r.meetings) })), stages: BD_PIPELINE_STAGES[pipeline] || BD_PIPELINE_STAGES['D-Grow'], sources: LEAD_SOURCES };
  }

  static async getLead360(leadId, actor) {
    await assertLeadAccess(leadId, actor);
    const lead = await LeadsService.getLeadById(leadId, actor);
    const [interactions] = await pool.query(
      `SELECT i.*, u.name AS created_by_name FROM lead_interactions i LEFT JOIN users u ON u.id = i.created_by
       WHERE i.lead_id = ? ORDER BY i.created_at DESC, i.id DESC`,
      [leadId]
    );
    const [meetings] = await pool.query(
      `SELECT m.*, u.name AS owner_name FROM sales_meetings m LEFT JOIN users u ON u.id = m.owner_user_id WHERE m.lead_id = ? ORDER BY m.starts_at DESC`,
      [leadId]
    );
    const [proposals] = await pool.query('SELECT id, proposal_code, title, status, billing_cycle, created_at FROM proposals WHERE lead_id = ? ORDER BY id DESC', [leadId]);
    const [[extra]] = await pool.query(
      `SELECT l.referrer_name, cu.name AS created_by_name FROM leads l LEFT JOIN users cu ON cu.id = l.created_by WHERE l.id = ?`,
      [leadId]
    );
    const calls = interactions.filter((i) => i.interaction_type === 'call');
    const negotiations = interactions.filter((i) => i.interaction_type === 'negotiation');
    const stats = {
      calls: calls.length,
      callMinutes: calls.reduce((a, i) => a + Number(i.duration_minutes || 0), 0),
      negotiations: negotiations.length,
      proposals: proposals.length,
      meetings: meetings.length,
      lastNegotiationAmount: negotiations.find((i) => i.amount != null)?.amount ?? null
    };
    return {
      lead: { ...lead, referrer_name: extra?.referrer_name || null, created_by_name: extra?.created_by_name || null },
      interactions: interactions.map((i) => ({ ...i, amount: i.amount == null ? null : Number(i.amount) })),
      meetings, proposals, stats,
      stages: BD_PIPELINE_STAGES[lead.pipeline_entity] || BD_PIPELINE_STAGES['D-Grow'], sources: LEAD_SOURCES
    };
  }

  /** Remove an enquiry entirely. Onboarded leads are kept: they are the client's origin record. */
  static async deleteLead(leadId, actor, req) {
    if (!isSalesGlobal(actor) && !(actor.permissions || []).includes('leads.delete')) {
      throw httpError(403, 'Only owners and admins can remove enquiries', 'FORBIDDEN');
    }
    await assertLeadAccess(leadId, actor);
    const [[lead]] = await pool.query('SELECT id, title, company_name, converted_client_id FROM leads WHERE id = ?', [leadId]);
    if (lead.converted_client_id) {
      throw httpError(409, 'This enquiry was onboarded as a client, so it is kept as the client’s history. Mark it Lost instead if needed.', 'LEAD_ONBOARDED');
    }
    // Follow-ups and meetings are removed with it; proposals stay, unlinked from the lead.
    await pool.query('DELETE FROM leads WHERE id = ?', [leadId]);
    await audit(actor, 'lead.delete', 'lead', leadId, { title: lead.company_name || lead.title }, req);
    return { deleted: true, id: Number(leadId) };
  }

  static async #touchLead(conn, leadId, { stageTo, nextFollowupDate, lostReason } = {}) {
    const sets = ['last_activity_at = NOW()'];
    const params = [];
    if (stageTo) { sets.push('stage = ?'); params.push(stageTo); }
    if (nextFollowupDate !== undefined) { sets.push('next_followup_date = ?'); params.push(nextFollowupDate || null); }
    if (lostReason) { sets.push('lost_reason = ?'); params.push(lostReason); }
    await conn.query(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, [...params, leadId]);
  }

  static async logInteraction(leadId, data, actor, req) {
    await assertLeadAccess(leadId, actor);
    const [[lead]] = await pool.query('SELECT id, stage, pipeline_entity, converted_client_id FROM leads WHERE id = ?', [leadId]);
    const stages = BD_PIPELINE_STAGES[lead.pipeline_entity] || BD_PIPELINE_STAGES['D-Grow'];
    let stageTo = data.stageTo || null;
    if (stageTo && !stages.includes(stageTo)) throw httpError(400, 'Unknown stage for this pipeline', 'INVALID_STAGE');
    if (stageTo === 'Won' && !lead.converted_client_id) {
      throw httpError(409, 'Use “Onboard as client” to mark a lead Won, so the client record is created', 'USE_ONBOARD');
    }
    if (stageTo === lead.stage) stageTo = null;
    if (data.type === 'stage_change' && !stageTo) throw httpError(400, 'Pick a different status', 'NO_STAGE_CHANGE');
    const isNegotiation = data.type === 'negotiation';
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Negotiations are numbered per lead: Round 1, Round 2…
      let round = null;
      if (isNegotiation) {
        const [[{ n }]] = await conn.query(
          "SELECT COUNT(*) AS n FROM lead_interactions WHERE lead_id = ? AND interaction_type = 'negotiation' FOR UPDATE",
          [leadId]
        );
        round = Number(n) + 1;
      }
      const revisedBudget = isNegotiation && data.revisedBudget != null ? data.revisedBudget : null;
      await conn.query(
        `INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, duration_minutes, negotiation_round, amount,
                                        stage_from, stage_to, next_followup_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [leadId, data.type, data.title, data.outcome || null, data.type === 'call' ? data.durationMinutes ?? null : null, round, revisedBudget,
          stageTo ? lead.stage : null, stageTo, data.nextFollowupDate || null, actor.id]
      );
      // A revised budget from a negotiation becomes the deal value.
      if (revisedBudget != null) await conn.query('UPDATE leads SET estimated_value = ? WHERE id = ?', [Math.round(revisedBudget), leadId]);
      await this.#touchLead(conn, leadId, { stageTo, nextFollowupDate: data.nextFollowupDate ?? undefined, lostReason: stageTo === 'Lost' ? data.outcome || data.title : null });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'lead.interaction', 'lead', leadId, { type: data.type, stageTo }, req);
    return this.getLead360(leadId, actor);
  }

  static async updateLeadDetails(leadId, data, actor, req) {
    await assertLeadAccess(leadId, actor);
    if (data.source && !LEAD_SOURCES.includes(data.source)) throw httpError(400, 'Unknown lead source', 'INVALID_SOURCE');
    await pool.query(
      `UPDATE leads SET title = ?, company_name = ?, contact_name = ?, email = ?, phone = ?, source = ?, referrer_name = ?, services_interested = ?,
              estimated_value = ?, notes = ?, last_activity_at = NOW() WHERE id = ?`,
      [data.title, data.companyName || null, data.contactName || null, data.email || null, data.phone || null, data.source || null,
        data.referrerName || null, data.servicesInterested || null, data.estimatedValue ?? null, data.notes || null, leadId]
    );
    // Only managers decide who the REP is.
    if (!isScoped(actor) && data.repUserId !== undefined) {
      if (data.repUserId) await this.#assertMarketer(data.repUserId);
      await pool.query('UPDATE leads SET rep_user_id = ? WHERE id = ?', [data.repUserId || null, leadId]);
    }
    await audit(actor, 'lead.update', 'lead', leadId, null, req);
    return this.getLead360(leadId, actor);
  }

  static async createLead(data, actor, req) {
    if (data.source && !LEAD_SOURCES.includes(data.source)) throw httpError(400, 'Unknown lead source', 'INVALID_SOURCE');
    // A marketing person (field executive) who adds an enquiry is its REP. It arrives Unassigned:
    // the admin sees every enquiry and decides which marketing person follows it up.
    // Managers may set the REP and the assignee when they enter an enquiry themselves.
    const isMarketer = isScoped(actor) && !slugs(actor).includes('account-manager');
    const ownerId = isMarketer ? null : data.ownerUserId || null;
    const repId = isMarketer ? actor.id : data.repUserId || null;
    if (ownerId && ownerId !== actor.id) await this.#assertMarketer(ownerId);
    if (repId && repId !== actor.id) await this.#assertMarketer(repId);
    const [res] = await pool.query(
      `INSERT INTO leads (pipeline_entity, stage, title, company_name, contact_name, email, phone, source, referrer_name, services_interested,
                          estimated_value, owner_user_id, rep_user_id, notes, next_followup_date, last_activity_at, created_by)
       VALUES ('D-Grow', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [data.stage || 'New', data.title, data.companyName || null, data.contactName || null, data.email || null, data.phone || null,
        data.source || null, data.referrerName || null, data.servicesInterested || null, data.estimatedValue ?? null, ownerId, repId, data.notes || null,
        data.nextFollowupDate || null, actor.id]
    );
    const leadId = res.insertId;
    // Opening entry for the history trail, like the old portal's "Enquiry Created" note.
    const [[owner]] = ownerId ? await pool.query('SELECT name FROM users WHERE id = ?', [ownerId]) : [[null]];
    const [[rep]] = repId ? await pool.query('SELECT name FROM users WHERE id = ?', [repId]) : [[null]];
    await pool.query(
      "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'note', 'Enquiry created', ?, ?)",
      [leadId, [`Source: ${data.source || 'Other'}${data.referrerName ? ` (${data.referrerName})` : ''}`, rep ? `REP: ${rep.name}` : null,
        `Status: ${data.stage || 'New'}`, owner ? `Assigned to ${owner.name}` : 'Unassigned'].filter(Boolean).join(' · '), actor.id]
    );
    // Owners and admins hear about every enquiry a marketing person sends in, so they can assign it.
    if (isMarketer) {
      try {
        const [admins] = await pool.query(
          `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
           WHERE u.status = 'active' AND r.slug IN ('owner', 'admin') AND u.id <> ?`,
          [actor.id]
        );
        for (const a of admins) {
          await NotificationsService.createNotification({
            recipientUserId: a.id, actorUserId: actor.id, type: 'lead_submitted', title: 'New enquiry to assign',
            message: `${actor.name || 'A marketing person'} sent in ${data.companyName || data.title}. Assign someone to follow it up.`,
            entityType: 'lead', entityId: leadId, actionUrl: `/sales/leads/${leadId}`
          });
        }
      } catch (e) {
        console.error('[sales] new-enquiry notification failed:', e.message);
      }
    }
    await audit(actor, 'lead.create', 'lead', leadId, { source: data.source, repId }, req);
    return this.getLead360(leadId, actor);
  }

  static async #assertMarketer(userId) {
    const [[u]] = await pool.query(
      `SELECT u.id FROM users u WHERE u.id = ? AND u.status = 'active' AND u.role <> 'client' AND u.client_id IS NULL`,
      [userId]
    );
    if (!u) throw httpError(400, 'Choose an active staff member', 'INVALID_OWNER');
  }

  static async assignLead(leadId, ownerUserId, actor, req) {
    if (isScoped(actor) && !slugs(actor).includes('account-manager')) throw httpError(403, 'Only managers can reassign leads', 'FORBIDDEN');
    await assertLeadAccess(leadId, actor);
    await this.#assertMarketer(ownerUserId);
    const [[lead]] = await pool.query('SELECT owner_user_id, title FROM leads WHERE id = ?', [leadId]);
    await pool.query('UPDATE leads SET owner_user_id = ?, last_activity_at = NOW() WHERE id = ?', [ownerUserId, leadId]);
    const [[to]] = await pool.query('SELECT name FROM users WHERE id = ?', [ownerUserId]);
    await pool.query(
      "INSERT INTO lead_interactions (lead_id, interaction_type, title, created_by) VALUES (?, 'note', ?, ?)",
      [leadId, `Assigned to ${to.name}`, actor.id]
    );
    await NotificationsService.createNotification({
      recipientUserId: ownerUserId, actorUserId: actor.id, type: 'lead_assigned', title: 'New lead assigned',
      message: `${lead.title} was assigned to you.`, entityType: 'lead', entityId: leadId, actionUrl: `/sales/leads/${leadId}`
    });
    await audit(actor, 'lead.assign', 'lead', leadId, { from: lead.owner_user_id, to: ownerUserId }, req);
    return this.getLead360(leadId, actor);
  }

  static async onboardLead(leadId, { accountManagerId }, actor, req) {
    await assertLeadAccess(leadId, actor);
    const result = await LeadsService.convertLead(leadId, { accountManagerId }, actor, req);
    await pool.query(
      "INSERT INTO lead_interactions (lead_id, interaction_type, title, stage_to, created_by) VALUES (?, 'stage_change', 'Onboarded as client', 'Won', ?)",
      [leadId, actor.id]
    );
    await pool.query('UPDATE leads SET last_activity_at = NOW(), next_followup_date = NULL WHERE id = ?', [leadId]);
    return { ...result, lead: await this.getLead360(leadId, actor) };
  }

  // ───────────────────────── Sales desk (one marketing person's day) ─────────────────────────

  /**
   * Everything one marketing person works on: enquiries they sent in (REP), leads assigned to them,
   * follow-ups by due date, upcoming meetings and proposals on their leads.
   * Owners/admins may open anyone's desk with userId.
   */
  static async desk(actor, { userId } = {}) {
    let uid = Number(actor.id);
    if (userId && Number(userId) !== uid) {
      if (!isSalesGlobal(actor)) throw httpError(403, 'You can only open your own desk', 'FORBIDDEN');
      uid = Number(userId);
    }
    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [uid]);
    if (!user) throw httpError(404, 'User not found', 'NOT_FOUND');

    const LEAD_COLS = `l.id, l.stage, l.title, l.company_name, l.contact_name, l.phone, l.email, l.source, l.referrer_name,
      l.services_interested, l.estimated_value, l.owner_user_id, ou.name AS owner_name, l.rep_user_id, rp.name AS rep_name,
      l.next_followup_date, l.last_activity_at, l.converted_client_id, l.created_at,
      (SELECT COUNT(*) FROM lead_interactions i WHERE i.lead_id = l.id AND i.interaction_type = 'call') AS calls,
      (SELECT COUNT(*) FROM lead_interactions i WHERE i.lead_id = l.id AND i.interaction_type = 'negotiation') AS negotiations,
      (SELECT COUNT(*) FROM proposals p WHERE p.lead_id = l.id) AS proposals,
      (SELECT i.title FROM lead_interactions i WHERE i.lead_id = l.id ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS last_title,
      (SELECT i.created_at FROM lead_interactions i WHERE i.lead_id = l.id ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS last_at`;
    const FROM = 'FROM leads l LEFT JOIN users ou ON ou.id = l.owner_user_id LEFT JOIN users rp ON rp.id = l.rep_user_id';
    const num = (r) => ({ ...r, calls: Number(r.calls), negotiations: Number(r.negotiations), proposals: Number(r.proposals) });

    const [assigned] = await pool.query(
      `SELECT ${LEAD_COLS} ${FROM} WHERE l.owner_user_id = ?
       ORDER BY (l.stage IN ('Won','Lost')), (l.next_followup_date IS NULL), l.next_followup_date, l.created_at DESC LIMIT 200`,
      [uid]
    );
    const [sent] = await pool.query(`SELECT ${LEAD_COLS} ${FROM} WHERE l.rep_user_id = ? ORDER BY l.created_at DESC LIMIT 200`, [uid]);
    const [due] = await pool.query(
      `SELECT l.id, l.title, l.company_name, l.contact_name, l.phone, l.stage, l.next_followup_date,
              CASE WHEN l.next_followup_date < CURDATE() THEN 'overdue' WHEN l.next_followup_date = CURDATE() THEN 'today' ELSE 'upcoming' END AS bucket
       FROM leads l
       WHERE l.owner_user_id = ? AND ${OPEN_STAGES_SQL} AND l.next_followup_date IS NOT NULL AND l.next_followup_date <= CURDATE() + INTERVAL 7 DAY
       ORDER BY l.next_followup_date`,
      [uid]
    );
    const [meetings] = await pool.query(
      `SELECT m.id, m.title, m.mode, m.status, m.starts_at, m.location, m.lead_id, m.client_id,
              COALESCE(l.company_name, l.title) AS lead_name, COALESCE(c.company_name, c.name, cc.company_name, cc.name) AS client_name,
              (m.client_id IS NOT NULL OR l.converted_client_id IS NOT NULL) AS is_client
       FROM sales_meetings m LEFT JOIN leads l ON l.id = m.lead_id
       LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN clients cc ON cc.id = l.converted_client_id
       WHERE m.status IN ('scheduled','rescheduled') AND m.starts_at >= NOW() - INTERVAL 1 HOUR
         AND (m.owner_user_id = ? OR m.created_by = ? OR l.owner_user_id = ?)
       ORDER BY m.starts_at LIMIT 30`,
      [uid, uid, uid]
    );
    const [proposals] = await pool.query(
      `SELECT p.id, p.proposal_code, p.title, p.status, p.updated_at, COALESCE(l.company_name, l.title) AS lead_name
       FROM proposals p JOIN leads l ON l.id = p.lead_id
       WHERE l.owner_user_id = ? OR l.rep_user_id = ? OR p.created_by = ?
       ORDER BY p.updated_at DESC LIMIT 30`,
      [uid, uid, uid]
    );
    const [quotes] = await pool.query(
      `SELECT q.id, q.quote_number, q.status, q.total_amount, q.updated_at, COALESCE(c.company_name, c.name, l.company_name, l.title) AS party_name
       FROM sales_quotations q LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.requested_by = ? OR l.owner_user_id = ? OR l.rep_user_id = ?
       ORDER BY q.updated_at DESC LIMIT 30`,
      [uid, uid, uid]
    ).catch(() => [[]]);
    const open = assigned.filter((l) => !['Won', 'Lost'].includes(l.stage));
    const bucket = (b) => due.filter((d) => d.bucket === b);
    return {
      user,
      kpis: {
        assignedOpen: open.length,
        sent: sent.length,
        overdue: bucket('overdue').length,
        dueToday: bucket('today').length,
        upcomingMeetings: meetings.length,
        inNegotiation: open.filter((l) => ['Negotiation', 'ProposalSent'].includes(l.stage)).length,
        won: assigned.filter((l) => l.stage === 'Won').length,
        pipelineValue: open.reduce((a, l) => a + Number(l.estimated_value || 0), 0)
      },
      assigned: assigned.map(num),
      sent: sent.map(num),
      followups: { overdue: bucket('overdue'), today: bucket('today'), upcoming: bucket('upcoming') },
      meetings: meetings.map((m) => ({ ...m, is_client: Boolean(m.is_client) })),
      proposals,
      quotes: quotes.map((q) => ({ ...q, total_amount: Number(q.total_amount) })),
      stages: BD_PIPELINE_STAGES['D-Grow']
    };
  }

  // ───────────────────────── Marketers ─────────────────────────

  static async marketers(actor, { period = 'month', from, to } = {}) {
    const [start, end] = periodRange(period, from, to);
    const own = !isSalesGlobal(actor);
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.status,
              (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id = u.id AND DATE(l.created_at) BETWEEN ? AND ?) AS leads,
              (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id = u.id AND ${OPEN_STAGES_SQL}) AS open_leads,
              (SELECT COUNT(*) FROM lead_interactions i WHERE i.created_by = u.id AND DATE(i.created_at) BETWEEN ? AND ?) AS followups,
              (SELECT COUNT(*) FROM sales_meetings m WHERE m.owner_user_id = u.id AND m.status = 'completed' AND DATE(m.starts_at) BETWEEN ? AND ?) AS meetings,
              (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id = u.id AND l.stage = 'Won' AND DATE(l.updated_at) BETWEEN ? AND ?) AS won,
              (SELECT COALESCE(SUM(l.estimated_value), 0) FROM leads l WHERE l.owner_user_id = u.id AND l.stage = 'Won' AND DATE(l.updated_at) BETWEEN ? AND ?) AS won_value,
              (SELECT COALESCE(SUM(l.estimated_value), 0) FROM leads l WHERE l.owner_user_id = u.id AND ${OPEN_STAGES_SQL}) AS pipeline_value
       FROM users u
       WHERE u.status = 'active' AND u.client_id IS NULL AND u.role <> 'client'
         AND (EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.slug IN ('field-executive','account-manager'))
              OR EXISTS (SELECT 1 FROM leads l WHERE l.owner_user_id = u.id))
         ${own ? 'AND u.id = ?' : ''}
       ORDER BY u.name`,
      [start, end, start, end, start, end, start, end, start, end, ...(own ? [actor.id] : [])]
    );
    const marketers = rows.map((r) => {
      const leads = Number(r.leads);
      const won = Number(r.won);
      return { ...r, leads, open_leads: Number(r.open_leads), followups: Number(r.followups), meetings: Number(r.meetings), won,
        won_value: Number(r.won_value), pipeline_value: Number(r.pipeline_value), conversion: leads ? Math.round((won / leads) * 100) : 0 };
    });
    return { range: { start, end }, marketers };
  }

  static async assignableOwners() {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, GROUP_CONCAT(r.slug) AS roles FROM users u
       JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.status = 'active' AND u.client_id IS NULL AND u.role <> 'client'
         AND r.slug IN ('field-executive','account-manager','admin','owner')
       GROUP BY u.id ORDER BY u.name`
    );
    return rows.map((r) => ({ id: r.id, name: r.name, isMarketer: r.roles.split(',').includes('field-executive') }));
  }

  /** Clients a sales user may link a meeting or proposal to. */
  static async selectableClients(actor) {
    let where = "c.status IN ('active','onboarding')";
    const params = [];
    if (!isSalesGlobal(actor)) {
      if (slugs(actor).includes('account-manager')) {
        where += ' AND c.account_manager_id = ?';
        params.push(actor.id);
      } else {
        where += ' AND EXISTS (SELECT 1 FROM leads l WHERE l.converted_client_id = c.id AND (l.owner_user_id = ? OR l.created_by = ? OR l.rep_user_id = ?))';
        params.push(actor.id, actor.id, actor.id);
      }
    }
    const [rows] = await pool.query(`SELECT c.id, COALESCE(c.company_name, c.name) AS name FROM clients c WHERE ${where} ORDER BY name`, params);
    return rows;
  }

  static async selectableServices() {
    const [rows] = await pool.query("SELECT id, name, category, default_rate, sac_code, gst_rate, billing_details FROM services WHERE status = 'active' ORDER BY category, name");
    return rows.map((r) => ({ ...r, default_rate: r.default_rate == null ? null : Number(r.default_rate), gst_rate: r.gst_rate == null ? 18 : Number(r.gst_rate) }));
  }

  // ───────────────────────── Meetings ─────────────────────────

  /**
   * Meetings are split by who they are with:
   *  - client:   an onboarded client (linked directly, or via an enquiry that has since been onboarded)
   *  - prospect: an enquiry that is not onboarded yet
   */
  static async listMeetings(actor, { status = '', scope: when = '', kind = '' } = {}) {
    const [ls, lp] = leadScope(actor, 'l2');
    const access = isScoped(actor) ? `(m.owner_user_id = ? OR m.created_by = ? OR (m.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads l2 WHERE l2.id = m.lead_id AND ${ls})))` : '1=1';
    const accessParams = isScoped(actor) ? [actor.id, actor.id, ...lp] : [];
    const IS_CLIENT = '(m.client_id IS NOT NULL OR l.converted_client_id IS NOT NULL)';
    const FROM = `FROM sales_meetings m LEFT JOIN leads l ON l.id = m.lead_id`;
    const where = [access];
    const params = [...accessParams];
    if (kind === 'client') where.push(IS_CLIENT);
    if (kind === 'prospect') where.push(`NOT ${IS_CLIENT}`);
    const statusWhere = [...where];
    if (status) { statusWhere.push('m.status = ?'); }
    if (when === 'upcoming') statusWhere.push("m.starts_at >= NOW() AND m.status IN ('scheduled','rescheduled')");
    const [rows] = await pool.query(
      `SELECT m.*, u.name AS owner_name, l.title AS lead_title, l.company_name AS lead_company, l.stage AS lead_stage,
              COALESCE(m.client_id, l.converted_client_id) AS meeting_client_id,
              COALESCE(c.company_name, c.name, cc.company_name, cc.name) AS client_name, p.proposal_code,
              ${IS_CLIENT} AS is_client
       ${FROM}
       LEFT JOIN users u ON u.id = m.owner_user_id
       LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN clients cc ON cc.id = l.converted_client_id
       LEFT JOIN proposals p ON p.id = m.proposal_id
       WHERE ${statusWhere.join(' AND ')} ORDER BY m.starts_at DESC LIMIT 300`,
      [...params, ...(status ? [status] : [])]
    );
    // Status counts for the chosen type, plus how many meetings each type has.
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(m.status IN ('scheduled','rescheduled') AND m.starts_at >= NOW()) AS upcoming,
              SUM(m.status = 'completed') AS completed, SUM(m.status = 'cancelled') AS cancelled
       ${FROM} WHERE ${where.join(' AND ')}`,
      params
    );
    const [[kinds]] = await pool.query(
      `SELECT SUM(${IS_CLIENT}) AS client, SUM(NOT ${IS_CLIENT}) AS prospect, COUNT(*) AS all_meetings ${FROM} WHERE ${access}`,
      accessParams
    );
    const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v || 0)]));
    return { meetings: rows.map((r) => ({ ...r, is_client: Boolean(r.is_client) })), counts: num(counts), kinds: num(kinds) };
  }

  static async #assertMeetingTarget(data, actor) {
    if (!data.leadId && !data.clientId) throw httpError(400, 'Link the meeting to a lead or a client', 'TARGET_REQUIRED');
    if (data.leadId) await assertLeadAccess(data.leadId, actor);
    if (data.clientId) {
      const [[c]] = await pool.query('SELECT id FROM clients WHERE id = ?', [data.clientId]);
      if (!c) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    }
  }

  static async createMeeting(data, actor, req) {
    await this.#assertMeetingTarget(data, actor);
    const [res] = await pool.query(
      `INSERT INTO sales_meetings (lead_id, client_id, proposal_id, title, mode, status, starts_at, location, agenda, owner_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)`,
      [data.leadId || null, data.clientId || null, data.proposalId || null, data.title, data.mode, data.startsAt.replace('T', ' '),
        data.location || null, data.agenda || null, data.ownerUserId || actor.id, actor.id]
    );
    if (data.leadId) {
      await pool.query(
        "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'meeting', ?, ?, ?)",
        [data.leadId, `Meeting scheduled: ${data.title}`, `${data.mode === 'online' ? 'Online' : 'In person'} on ${data.startsAt.replace('T', ' ')}`, actor.id]
      );
      await pool.query('UPDATE leads SET last_activity_at = NOW() WHERE id = ?', [data.leadId]);
    }
    await audit(actor, 'meeting.create', 'sales_meeting', res.insertId, { leadId: data.leadId, clientId: data.clientId }, req);
    return this.getMeeting(res.insertId, actor);
  }

  static async getMeeting(id, actor) {
    const [[m]] = await pool.query(
      `SELECT m.*, u.name AS owner_name, l.title AS lead_title, COALESCE(c.company_name, c.name) AS client_name
       FROM sales_meetings m LEFT JOIN users u ON u.id = m.owner_user_id LEFT JOIN leads l ON l.id = m.lead_id
       LEFT JOIN clients c ON c.id = m.client_id WHERE m.id = ?`,
      [id]
    );
    if (!m) throw httpError(404, 'Meeting not found', 'NOT_FOUND');
    if (isScoped(actor) && ![m.owner_user_id, m.created_by].map(Number).includes(Number(actor.id))) {
      if (!m.lead_id) throw httpError(403, 'This meeting belongs to someone else', 'FORBIDDEN');
      await assertLeadAccess(m.lead_id, actor);
    }
    return m;
  }

  static async updateMeeting(id, data, actor, req) {
    const m = await this.getMeeting(id, actor);
    const completing = data.status === 'completed' && m.status !== 'completed';
    if (completing && !String(data.decisions || m.decisions || '').trim()) {
      throw httpError(400, 'Record the key decisions and next actions before marking the meeting done', 'DECISIONS_REQUIRED');
    }
    const next = {
      title: data.title ?? m.title,
      mode: data.mode ?? m.mode,
      status: data.status ?? m.status,
      starts_at: data.startsAt ? data.startsAt.replace('T', ' ') : m.starts_at,
      location: data.location ?? m.location,
      agenda: data.agenda ?? m.agenda,
      minutes: data.minutes ?? m.minutes,
      decisions: data.decisions ?? m.decisions
    };
    await pool.query(
      `UPDATE sales_meetings SET title = ?, mode = ?, status = ?, starts_at = ?, location = ?, agenda = ?, minutes = ?, decisions = ?,
              completed_at = IF(? = 'completed', COALESCE(completed_at, NOW()), NULL) WHERE id = ?`,
      [next.title, next.mode, next.status, next.starts_at, next.location, next.agenda, next.minutes, next.decisions, next.status, id]
    );
    if (completing && m.lead_id) {
      await pool.query(
        "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'meeting', ?, ?, ?)",
        [m.lead_id, `Meeting held: ${next.title}`, next.decisions, actor.id]
      );
      await pool.query('UPDATE leads SET last_activity_at = NOW() WHERE id = ?', [m.lead_id]);
    }
    await audit(actor, completing ? 'meeting.complete' : 'meeting.update', 'sales_meeting', id, { status: next.status }, req);
    return this.getMeeting(id, actor);
  }

  // ───────────────────────── Proposals ─────────────────────────

  static async #assertProposalAccess(p, actor) {
    if (!isScoped(actor)) return;
    if (Number(p.created_by) === Number(actor.id)) return;
    if (p.lead_id) return assertLeadAccess(p.lead_id, actor);
    throw httpError(403, 'This proposal belongs to someone else', 'FORBIDDEN');
  }

  static async listProposals(actor, { status = '', search = '' } = {}) {
    const [ls, lp] = leadScope(actor);
    const where = [isScoped(actor) ? `(p.created_by = ? OR (p.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads l WHERE l.id = p.lead_id AND ${ls})))` : '1=1'];
    const params = isScoped(actor) ? [actor.id, ...lp] : [];
    if (status) { where.push('p.status = ?'); params.push(status); }
    if (search.trim()) {
      where.push('(p.proposal_code LIKE ? OR p.title LIKE ? OR l2.title LIKE ? OR l2.company_name LIKE ? OR c.company_name LIKE ? OR c.name LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.proposal_code, p.title, p.status, p.billing_cycle, p.gst_mode, p.valid_until, p.view_count, p.last_viewed_at,
              p.decided_at, p.public_token, p.lead_id, p.client_id, p.converted_project_id, p.converted_invoice_id, p.created_at,
              COALESCE(c.company_name, c.name, l2.company_name, l2.title) AS party_name,
              (SELECT GROUP_CONCAT(CONCAT(t.name, ':', t.price) ORDER BY t.sort_order SEPARATOR '|') FROM proposal_tiers t WHERE t.proposal_id = p.id) AS tiers,
              at.name AS accepted_tier, at.price AS accepted_price
       FROM proposals p LEFT JOIN leads l2 ON l2.id = p.lead_id LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN proposal_tiers at ON at.id = p.accepted_tier_id
       WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 300`,
      params
    );
    const count = (s) => rows.filter((r) => s.includes(r.status)).length;
    return {
      proposals: rows.map((r) => ({ ...r, tiers: (r.tiers || '').split('|').filter(Boolean).map((t) => { const i = t.lastIndexOf(':'); return { name: t.slice(0, i), price: Number(t.slice(i + 1)) }; }) })),
      counts: { total: rows.length, shared: count(['sent', 'viewed']), viewed: count(['viewed', 'accepted', 'converted']), accepted: count(['accepted']), converted: count(['converted']) }
    };
  }

  static async getProposal(id, actor) {
    const [[p]] = await pool.query(
      `SELECT p.*, COALESCE(c.company_name, c.name) AS client_name, l.title AS lead_title, l.company_name AS lead_company,
              l.contact_name AS lead_contact, l.phone AS lead_phone, l.converted_client_id AS lead_client_id, u.name AS created_by_name
       FROM proposals p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN leads l ON l.id = p.lead_id LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = ?`,
      [id]
    );
    if (!p) throw httpError(404, 'Proposal not found', 'NOT_FOUND');
    await this.#assertProposalAccess(p, actor);
    const [tiers] = await pool.query(
      `SELECT t.*, s.name AS service_name FROM proposal_tiers t LEFT JOIN services s ON s.id = t.service_id WHERE t.proposal_id = ? ORDER BY t.sort_order`,
      [id]
    );
    // Phase C: the quotation made from the plan the client chose (if any).
    const [[quote]] = await pool.query(
      "SELECT id, quote_number, status, total_amount FROM sales_quotations WHERE proposal_id = ? AND status NOT IN ('rejected','expired') ORDER BY id DESC LIMIT 1",
      [id]
    ).catch(() => [[null]]);
    return {
      proposal: p,
      tiers: tiers.map((t) => ({ ...t, price: Number(t.price), is_recommended: Boolean(t.is_recommended) })),
      quote: quote ? { ...quote, total_amount: Number(quote.total_amount) } : null
    };
  }

  static async #writeTiers(conn, proposalId, tiers) {
    await conn.query('UPDATE proposals SET accepted_tier_id = NULL WHERE id = ?', [proposalId]);
    await conn.query('DELETE FROM proposal_tiers WHERE proposal_id = ?', [proposalId]);
    let order = 1;
    for (const t of tiers) {
      await conn.query(
        'INSERT INTO proposal_tiers (proposal_id, name, price, service_id, inclusions, is_recommended, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [proposalId, t.name, t.price, t.serviceId || null, t.inclusions || null, Boolean(t.isRecommended), order++]
      );
    }
  }

  static async saveProposal(id, data, actor, req) {
    if (!data.leadId && !data.clientId) throw httpError(400, 'Choose a lead or an existing client', 'TARGET_REQUIRED');
    if (data.leadId) await assertLeadAccess(data.leadId, actor);
    if (data.tiers.filter((t) => t.isRecommended).length > 1) throw httpError(400, 'Mark at most one package as recommended', 'ONE_RECOMMENDED');
    const conn = await pool.getConnection();
    let pid = id;
    try {
      await conn.beginTransaction();
      if (id) {
        const [[p]] = await conn.query('SELECT * FROM proposals WHERE id = ? FOR UPDATE', [id]);
        if (!p) throw httpError(404, 'Proposal not found', 'NOT_FOUND');
        await this.#assertProposalAccess(p, actor);
        if (['accepted', 'converted', 'rejected', 'withdrawn'].includes(p.status)) {
          throw httpError(409, 'This proposal is closed (accepted, declined or withdrawn). Duplicate it to make a new version.', 'LOCKED');
        }
        await conn.query(
          'UPDATE proposals SET lead_id = ?, client_id = ?, title = ?, intro = ?, billing_cycle = ?, gst_mode = ?, valid_until = ? WHERE id = ?',
          [data.leadId || null, data.clientId || null, data.title, data.intro || null, data.billingCycle, data.gstMode, data.validUntil || null, id]
        );
      } else {
        let code;
        for (;;) {
          code = `PRP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          const [[dupe]] = await conn.query('SELECT id FROM proposals WHERE proposal_code = ?', [code]);
          if (!dupe) break;
        }
        const [res] = await conn.query(
          `INSERT INTO proposals (proposal_code, lead_id, client_id, title, intro, billing_cycle, gst_mode, valid_until, public_token, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [code, data.leadId || null, data.clientId || null, data.title, data.intro || null, data.billingCycle, data.gstMode,
            data.validUntil || null, crypto.randomBytes(16).toString('hex'), actor.id]
        );
        pid = res.insertId;
      }
      await this.#writeTiers(conn, pid, data.tiers);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, id ? 'proposal.update' : 'proposal.create', 'proposal', pid, null, req);
    return this.getProposal(pid, actor);
  }

  /** Marks the proposal shared and moves the lead to Proposal Sent. The link itself is shared by the user (copy / WhatsApp). */
  static async sendProposal(id, actor, req) {
    const { proposal: p } = await this.getProposal(id, actor);
    if (!['draft', 'sent', 'viewed'].includes(p.status)) throw httpError(409, 'This proposal has already been decided', 'LOCKED');
    if (p.status === 'draft') await pool.query("UPDATE proposals SET status = 'sent' WHERE id = ?", [id]);
    if (p.lead_id) {
      const [[lead]] = await pool.query('SELECT stage FROM leads WHERE id = ?', [p.lead_id]);
      const early = ['New', 'Contacted', 'DiscoveryCallDone'].includes(lead.stage);
      await pool.query(
        `INSERT INTO lead_interactions (lead_id, interaction_type, title, stage_from, stage_to, created_by) VALUES (?, 'proposal', ?, ?, ?, ?)`,
        [p.lead_id, `Proposal ${p.proposal_code} shared`, early ? lead.stage : null, early ? 'ProposalSent' : null, actor.id]
      );
      await pool.query(`UPDATE leads SET last_activity_at = NOW()${early ? ", stage = 'ProposalSent'" : ''} WHERE id = ?`, [p.lead_id]);
    }
    await audit(actor, 'proposal.send', 'proposal', id, null, req);
    return this.getProposal(id, actor);
  }

  // ── Proposal lifecycle: withdraw / delete / duplicate ──
  // Draft → delete. Shared but unanswered → withdraw (the client link then says so) → delete.
  // Accepted / converted proposals are kept as the record of what the client agreed; duplicate instead.

  static async withdrawProposal(id, actor, req) {
    const { proposal: p } = await this.getProposal(id, actor);
    if (!['sent', 'viewed'].includes(p.status)) throw httpError(409, 'Only a shared proposal the client has not answered can be withdrawn', 'NOT_OPEN');
    await pool.query("UPDATE proposals SET status = 'withdrawn' WHERE id = ?", [id]);
    if (p.lead_id) {
      await pool.query("INSERT INTO lead_interactions (lead_id, interaction_type, title, created_by) VALUES (?, 'proposal', ?, ?)", [p.lead_id, `Proposal ${p.proposal_code} withdrawn`, actor.id]);
    }
    await audit(actor, 'proposal.withdraw', 'proposal', id, null, req);
    return this.getProposal(id, actor);
  }

  static async deleteProposal(id, actor, req) {
    const { proposal: p, quote } = await this.getProposal(id, actor);
    if (!['draft', 'withdrawn', 'rejected'].includes(p.status)) {
      throw httpError(409, ['sent', 'viewed'].includes(p.status)
        ? 'The client may still answer this proposal. Withdraw it first, then delete.'
        : 'An accepted or converted proposal is kept as the record of what the client agreed. Duplicate it instead.', 'LOCKED');
    }
    if (quote) throw httpError(409, `Quotation ${quote.quote_number} was made from this proposal. Delete or cancel it first.`, 'HAS_QUOTE');
    await pool.query('DELETE FROM proposals WHERE id = ?', [id]); // tiers cascade
    await audit(actor, 'proposal.delete', 'proposal', id, { code: p.proposal_code, title: p.title }, req);
    return { deleted: true, id };
  }

  static async duplicateProposal(id, actor, req) {
    const { proposal: p, tiers } = await this.getProposal(id, actor);
    const copy = await this.saveProposal(null, {
      leadId: p.lead_id, clientId: p.client_id, title: `${p.title} (copy)`, intro: p.intro, billingCycle: p.billing_cycle, gstMode: p.gst_mode,
      validUntil: null,
      tiers: tiers.map((t) => ({ name: t.name, price: t.price, serviceId: t.service_id, inclusions: t.inclusions, isRecommended: Boolean(t.is_recommended) }))
    }, actor, req);
    await audit(actor, 'proposal.duplicate', 'proposal', copy.proposal.id, { from: id }, req);
    return copy;
  }

  /**
   * Accepted proposal → client (onboarding the lead if needed) → Client Project → draft GST invoice, in one step.
   * Each part reuses the module that owns it, so their own rules and permissions apply.
   */
  static async convertProposal(id, { assigneeId, invoiceDate }, actor, req) {
    const { proposal: p, tiers } = await this.getProposal(id, actor);
    if (p.status !== 'accepted') throw httpError(409, 'Only an accepted proposal can be converted', 'NOT_ACCEPTED');
    const tier = tiers.find((t) => t.id === p.accepted_tier_id);
    if (!tier) throw httpError(409, 'The accepted package no longer exists', 'NO_TIER');

    let clientId = p.client_id || p.lead_client_id;
    if (!clientId && p.lead_id) {
      const r = await this.onboardLead(p.lead_id, { accountManagerId: actor.id }, actor, req);
      clientId = r.client_id;
    }
    if (!clientId) throw httpError(409, 'This proposal has no client or lead to onboard', 'NO_CLIENT');

    const category = CYCLE_TO_CATEGORY[p.billing_cycle];
    const project = await ProjectFlowService.createProject(
      {
        clientId,
        name: `${tier.service_name || p.title} — ${tier.name}`,
        description: tier.inclusions || p.intro || null,
        category,
        serviceId: tier.service_id || null,
        pipelineId: null,
        assignmentMode: 'individual',
        assigneeId,
        priority: 'medium',
        startDate: invoiceDate,
        monthlyDeliverables: []
      },
      actor,
      req
    );
    const invoiceProjectId = category === 'regular' && project.cycles?.[0] ? project.cycles[0].id : project.id;
    if (category === 'regular') {
      // The accepted price becomes the retainer's monthly fee, so later cycles draft their own invoices.
      await pool.query(
        'UPDATE projects SET billing_amount = ?, retainer_invoice_type = ?, retainer_auto_invoice = TRUE WHERE id = ?',
        [tier.price, p.gst_mode === 'gst' ? 'INV' : 'IND', project.id]
      );
    }
    const doc = await FinanceService.createDraft(
      {
        invoiceType: p.gst_mode === 'gst' ? 'INV' : 'IND',
        clientId,
        projectId: invoiceProjectId,
        invoiceDate,
        notes: `As per proposal ${p.proposal_code} (${tier.name} package).`,
        items: [{ serviceId: tier.service_id || null, description: tier.service_name || p.title, details: tier.inclusions || null, quantity: 1, unitPrice: tier.price, discountAmount: 0 }]
      },
      actor,
      req
    );
    await pool.query(
      "UPDATE proposals SET status = 'converted', converted_client_id = ?, converted_project_id = ?, converted_invoice_id = ? WHERE id = ?",
      [clientId, project.id, doc.invoice.id, id]
    );
    await audit(actor, 'proposal.convert', 'proposal', id, { clientId, projectId: project.id, invoiceId: doc.invoice.id }, req);
    return { clientId, projectId: project.id, invoiceId: doc.invoice.id, proposal: (await this.getProposal(id, actor)).proposal };
  }

  // ───────────────────────── Public (no login) ─────────────────────────

  static async #publicLoad(token) {
    const [[p]] = await pool.query(
      `SELECT p.*, COALESCE(c.company_name, c.name, l.company_name, l.contact_name, l.title) AS party_name
       FROM proposals p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN leads l ON l.id = p.lead_id
       WHERE p.public_token = ?`,
      [token]
    );
    if (!p || p.status === 'draft') throw httpError(404, 'This proposal link is not valid', 'NOT_FOUND');
    return p;
  }

  static async publicView(token, { countView = true } = {}) {
    const p = await this.#publicLoad(token);
    if (countView) await pool.query(
      `UPDATE proposals SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, NOW()), last_viewed_at = NOW(),
              status = IF(status = 'sent', 'viewed', status) WHERE id = ?`,
      [p.id]
    );
    if (countView && p.status === 'sent') {
      await NotificationsService.createNotification({
        recipientUserId: p.created_by, type: 'proposal_viewed', title: 'Proposal opened',
        message: `${p.party_name} opened proposal ${p.proposal_code}.`, entityType: 'proposal', entityId: p.id, actionUrl: `/sales/proposals/${p.id}`
      });
    }
    const [tiers] = await pool.query('SELECT id, name, price, inclusions, is_recommended FROM proposal_tiers WHERE proposal_id = ? ORDER BY sort_order', [p.id]);
    const [[agency]] = await pool.query('SELECT agency_name, phone, email, website FROM agency_settings WHERE id = 1');
    const expired = p.valid_until && String(p.valid_until instanceof Date ? p.valid_until.toISOString() : p.valid_until).slice(0, 10) < new Date().toISOString().slice(0, 10);
    return {
      proposal: {
        code: p.proposal_code, title: p.title, intro: p.intro, billingCycle: p.billing_cycle, gstMode: p.gst_mode, validUntil: p.valid_until,
        status: p.status, partyName: p.party_name, acceptedTierId: p.accepted_tier_id, decidedAt: p.decided_at, decidedByName: p.decided_by_name, expired: Boolean(expired)
      },
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, price: Number(t.price), inclusions: t.inclusions, recommended: Boolean(t.is_recommended) })),
      agency
    };
  }

  static async publicDecide(token, { decision, tierId, name, note }) {
    const p = await this.#publicLoad(token);
    if (p.status === 'withdrawn') throw httpError(409, 'This proposal is no longer available. Please contact us for an updated one.', 'WITHDRAWN');
    if (!['sent', 'viewed'].includes(p.status)) throw httpError(409, 'This proposal has already been answered', 'ALREADY_DECIDED');
    const today = new Date().toISOString().slice(0, 10);
    if (p.valid_until && String(p.valid_until instanceof Date ? p.valid_until.toISOString() : p.valid_until).slice(0, 10) < today) {
      throw httpError(409, 'This proposal has expired. Please contact us for an updated one.', 'EXPIRED');
    }
    if (decision === 'accept') {
      const [[t]] = await pool.query('SELECT id, name FROM proposal_tiers WHERE id = ? AND proposal_id = ?', [tierId, p.id]);
      if (!t) throw httpError(400, 'Choose one of the packages', 'INVALID_TIER');
      await pool.query(
        "UPDATE proposals SET status = 'accepted', accepted_tier_id = ?, decided_at = NOW(), decided_by_name = ?, decision_note = ? WHERE id = ?",
        [t.id, name, note || null, p.id]
      );
      if (p.lead_id) {
        await pool.query(
          "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome) VALUES (?, 'proposal', ?, ?)",
          [p.lead_id, `Client accepted the ${t.name} package (${p.proposal_code})`, `${name}${note ? `: ${note}` : ''}`]
        );
        await pool.query("UPDATE leads SET stage = IF(stage IN ('Won','Lost'), stage, 'Negotiation'), last_activity_at = NOW() WHERE id = ?", [p.lead_id]);
      }
    } else {
      await pool.query("UPDATE proposals SET status = 'rejected', decided_at = NOW(), decided_by_name = ?, decision_note = ? WHERE id = ?", [name, note || null, p.id]);
      if (p.lead_id) {
        await pool.query(
          "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome) VALUES (?, 'proposal', ?, ?)",
          [p.lead_id, `Client declined proposal ${p.proposal_code}`, `${name}${note ? `: ${note}` : ''}`]
        );
      }
    }
    await NotificationsService.createNotification({
      recipientUserId: p.created_by, type: 'proposal_decided', title: decision === 'accept' ? 'Proposal accepted' : 'Proposal declined',
      message: `${p.party_name} ${decision === 'accept' ? 'accepted' : 'declined'} proposal ${p.proposal_code}.`, entityType: 'proposal', entityId: p.id,
      actionUrl: `/sales/proposals/${p.id}`
    });
    await AuditService.log({ action: `proposal.public_${decision}`, entityType: 'proposal', entityId: p.id, details: { name, tierId } });
    return this.publicView(token, { countView: false });
  }
}
