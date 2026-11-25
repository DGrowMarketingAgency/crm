import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShootsService } from './shoots.service.js';
import { ShootSlotsService, fmtWhen } from './shootSlots.service.js';
import { istNow } from './shootTime.js';

/**
 * Shoot date proposals: the team offers a client 2–3 date/time options (chosen where videographers are free),
 * the client picks one in their portal, and the shoot slot is posted automatically — videographers free at
 * that time are told straight away.
 */
const fail = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};
const isFuture = (o, now = istNow()) => o.d > now.date || (o.d === now.date && o.s > now.time);
const roleSlugs = (u) => (u.roles || []).map((r) => r.slug);
const isClientUser = (u) => Boolean(u.client_id || u.role === 'client' || roleSlugs(u).includes('client'));

const BASE = `
  SELECT sp.*, COALESCE(c.company_name, c.name) AS client_name, u.name AS proposed_by_name,
         DATE_FORMAT(sp.responded_at, '%Y-%m-%d %H:%i') AS responded_on, DATE_FORMAT(sp.created_at, '%Y-%m-%d %H:%i') AS created_on
  FROM shoot_proposals sp
  JOIN clients c ON c.id = sp.client_id
  LEFT JOIN users u ON u.id = sp.created_by`;

export class ShootProposalsService {
  static async #options(proposalIds, db = pool) {
    if (!proposalIds.length) return [];
    const [rows] = await db.query(
      `SELECT id, proposal_id, DATE_FORMAT(shoot_date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS s,
              TIME_FORMAT(end_time, '%H:%i') AS e
       FROM shoot_proposal_options WHERE proposal_id IN (?) ORDER BY shoot_date, start_time`,
      [proposalIds]
    );
    return rows;
  }

  static #shape(p, opts, { forClient = false, free = null } = {}) {
    const now = istNow();
    const base = {
      id: p.id,
      client_id: p.client_id,
      client_name: p.client_name,
      title: p.title,
      shoot_type: p.shoot_type,
      area: p.area,
      message_to_client: p.message_to_client,
      status: p.status,
      chosen_option_id: p.chosen_option_id,
      client_note: p.client_note,
      responded_on: p.responded_on,
      created_on: p.created_on,
      proposed_by: p.proposed_by_name,
      options: opts.map((o) => ({
        id: o.id,
        date: o.d,
        start: o.s,
        end: o.e,
        still_possible: isFuture(o, now),
        ...(free ? { free_now: free[o.id] ?? null } : {})
      }))
    };
    if (forClient) return base;
    return {
      ...base,
      address: p.address,
      map_url: p.map_url,
      brief: p.brief,
      pay_amount: p.pay_amount != null ? Number(p.pay_amount) : null,
      people_needed: p.people_needed,
      slot_id: p.slot_id
    };
  }

  static #assertManage(actor) {
    if (!ShootsService.isManager(actor)) throw fail(403, 'Only admins and project managers can propose shoot dates');
  }

  static async #notify(userIds, actorId, { type, title, message, id, url }) {
    for (const uid of [...new Set(userIds.map(Number))].filter((u) => u && u !== Number(actorId))) {
      try {
        await NotificationsService.createNotification({
          recipientUserId: uid, actorUserId: actorId, type, title, message, entityType: 'shoot_proposal', entityId: id, actionUrl: url
        });
      } catch (e) {
        console.error('shoot proposal notification failed:', e.message);
      }
    }
  }

  /** Active client-portal logins of a client. */
  static async #clientLogins(clientId) {
    const [rows] = await pool.query("SELECT id FROM users WHERE client_id = ? AND status = 'active'", [clientId]);
    return rows.map((r) => r.id);
  }

  // ── team ───────────────────────────────────────────────────────────────────

  static async create(actor, data, req = null) {
    this.#assertManage(actor);
    const [[client]] = await pool.query('SELECT id, COALESCE(company_name, name) AS name FROM clients WHERE id = ?', [data.clientId]);
    if (!client) throw fail(404, 'Client not found');
    const now = istNow();
    const seen = new Set();
    for (const o of data.options) {
      if (!isFuture({ d: o.date, s: o.start }, now)) throw fail(400, `${o.date} ${o.start} is in the past — every option must be in the future`);
      const key = `${o.date} ${o.start}`;
      if (seen.has(key)) throw fail(400, 'Two options have the same date and time');
      seen.add(key);
    }
    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO shoot_proposals (client_id, title, shoot_type, area, address, map_url, brief, pay_amount, people_needed,
                                      message_to_client, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [data.clientId, data.title, data.shootType, data.area, data.address || null, data.mapUrl || null, data.brief || null,
          data.payAmount ?? null, data.peopleNeeded, data.message || null, actor.id]
      );
      id = ins.insertId;
      await conn.query('INSERT INTO shoot_proposal_options (proposal_id, shoot_date, start_time, end_time) VALUES ?', [
        data.options.map((o) => [id, o.date, o.start, o.end])
      ]);
      await AuditService.log({ db: conn, actorId: actor.id, action: 'shoots.dates_proposed', entityType: 'shoot_proposal', entityId: id, details: { clientId: data.clientId, options: data.options }, req });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    const logins = await this.#clientLogins(data.clientId);
    await this.#notify(logins, actor.id, {
      type: 'shoot_dates_proposed',
      title: 'Pick a date for your video shoot',
      message: `${data.title}: we have ${data.options.length} date option${data.options.length === 1 ? '' : 's'} ready. Choose the one that suits you.`,
      id,
      url: '/shoot-dates'
    });
    return { ...(await this.get(actor, id)), client_logins_notified: logins.length };
  }

  static async get(actor, id) {
    const [[p]] = await pool.query(`${BASE} WHERE sp.id = ?`, [id]);
    if (!p) throw fail(404, 'That proposal no longer exists');
    if (isClientUser(actor)) {
      if (Number(actor.client_id) !== Number(p.client_id)) throw fail(403, 'Not your shoot');
      return this.#shape(p, await this.#options([p.id]), { forClient: true });
    }
    if (!ShootsService.canView(actor)) throw fail(403, 'You do not have access to shoots');
    const opts = await this.#options([p.id]);
    const free = {};
    if (p.status === 'pending') {
      for (const o of opts) {
        free[o.id] = isFuture(o) ? (await ShootSlotsService.freeFor({ date: o.d, start: o.s, end: o.e })).length : 0;
      }
    }
    return this.#shape(p, opts, { free: p.status === 'pending' ? free : null });
  }

  static async list(actor, { status } = {}) {
    if (!ShootsService.canView(actor)) throw fail(403, 'You do not have access to shoots');
    const where = [];
    const params = [];
    if (status) {
      where.push('sp.status = ?');
      params.push(status);
    } else {
      // Pending ones, plus anything answered in the last 30 days.
      where.push("(sp.status = 'pending' OR sp.updated_at >= NOW() - INTERVAL 30 DAY)");
    }
    const [rows] = await pool.query(`${BASE} WHERE ${where.join(' AND ')} ORDER BY sp.status = 'pending' DESC, sp.created_at DESC LIMIT 100`, params);
    const opts = await this.#options(rows.map((r) => r.id));
    return rows.map((p) => this.#shape(p, opts.filter((o) => o.proposal_id === p.id)));
  }

  static async withdraw(actor, id, req = null) {
    this.#assertManage(actor);
    const [res] = await pool.query("UPDATE shoot_proposals SET status = 'withdrawn' WHERE id = ? AND status = 'pending'", [id]);
    if (!res.affectedRows) throw fail(409, 'Only a proposal still waiting for the client can be withdrawn');
    await AuditService.log({ actorId: actor.id, action: 'shoots.proposal_withdrawn', entityType: 'shoot_proposal', entityId: Number(id), details: {}, req });
    return { withdrawn: true };
  }

  // ── client portal ──────────────────────────────────────────────────────────

  static async listForClient(actor) {
    if (!isClientUser(actor) || !actor.client_id) throw fail(403, 'Only client portal logins can see shoot date requests');
    const [rows] = await pool.query(
      `${BASE} WHERE sp.client_id = ? AND (sp.status = 'pending' OR (sp.status IN ('accepted', 'declined') AND sp.updated_at >= NOW() - INTERVAL 60 DAY))
       ORDER BY sp.status = 'pending' DESC, sp.created_at DESC`,
      [actor.client_id]
    );
    const opts = await this.#options(rows.map((r) => r.id));
    return rows.map((p) => this.#shape(p, opts.filter((o) => o.proposal_id === p.id), { forClient: true }));
  }

  /**
   * The client picks an option (→ the shoot is posted for videographers) or says none work (→ the team is told).
   * Locked so two people from the same client can't pick different dates at once.
   */
  static async respond(actor, id, { optionId, noneWork, note }, req = null) {
    if (!isClientUser(actor) || !actor.client_id) throw fail(403, 'Only client portal logins can pick a shoot date');
    const conn = await pool.getConnection();
    let p;
    let chosen = null;
    try {
      await conn.beginTransaction();
      [[p]] = await conn.query(`${BASE} WHERE sp.id = ? FOR UPDATE`, [id]);
      if (!p || Number(p.client_id) !== Number(actor.client_id)) throw fail(404, 'That shoot request no longer exists');
      if (p.status !== 'pending') throw fail(409, `This request was already ${p.status === 'accepted' ? 'answered' : p.status}`, 'ALREADY_ANSWERED');
      if (noneWork) {
        await conn.query(
          "UPDATE shoot_proposals SET status = 'declined', client_note = ?, responded_by = ?, responded_at = NOW() WHERE id = ?",
          [note || null, actor.id, id]
        );
      } else {
        const opts = await this.#options([p.id], conn);
        chosen = opts.find((o) => Number(o.id) === Number(optionId));
        if (!chosen) throw fail(400, 'Pick one of the offered dates');
        if (!isFuture(chosen)) throw fail(409, 'That date has passed — pick another or tell us none work');
        await conn.query(
          "UPDATE shoot_proposals SET status = 'accepted', chosen_option_id = ?, client_note = ?, responded_by = ?, responded_at = NOW() WHERE id = ?",
          [chosen.id, note || null, actor.id, id]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    if (noneWork) {
      await this.#notify([p.created_by], actor.id, {
        type: 'shoot_dates_declined',
        title: `${p.client_name}: none of the shoot dates work`,
        message: `${p.title}${note ? ` — "${note}"` : ''}. Propose new dates from the Shoot Planner.`,
        id: p.id,
        url: '/shoots?tab=requests'
      });
      await AuditService.log({ actorId: actor.id, action: 'shoots.dates_declined', entityType: 'shoot_proposal', entityId: Number(id), details: { note }, req });
      return this.get(actor, id);
    }

    // Post the shoot on behalf of whoever proposed the dates, so videographers free then are told now.
    const [[creator]] = await pool.query('SELECT id, name FROM users WHERE id = ?', [p.created_by]);
    const slot = await ShootSlotsService.postSlot(
      { id: creator?.id || p.created_by, name: creator?.name },
      {
        clientId: p.client_id,
        title: p.title,
        shootType: p.shoot_type,
        date: chosen.d,
        start: chosen.s,
        end: chosen.e,
        area: p.area,
        address: p.address,
        mapUrl: p.map_url,
        brief: p.brief,
        payAmount: p.pay_amount != null ? Number(p.pay_amount) : null,
        peopleNeeded: p.people_needed,
        clientVisible: true
      },
      req
    );
    await pool.query('UPDATE shoot_proposals SET slot_id = ? WHERE id = ?', [slot.id, id]);
    await AuditService.log({ actorId: actor.id, action: 'shoots.date_chosen', entityType: 'shoot_proposal', entityId: Number(id), details: { optionId: chosen.id, slotId: slot.id }, req });
    await this.#notify([p.created_by], actor.id, {
      type: 'shoot_date_chosen',
      title: `${p.client_name} picked ${fmtWhen(chosen)}`,
      message: `${p.title}: the shoot is posted. ${slot.notified.length} videographer${slot.notified.length === 1 ? ' was' : 's were'} told.`,
      id: p.id,
      url: '/shoots'
    });
    return this.get(actor, id);
  }
}
