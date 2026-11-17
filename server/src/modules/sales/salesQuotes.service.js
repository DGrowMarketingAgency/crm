import crypto from 'crypto';
import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { calculateInvoice } from '../finance/gst.js';
import { assertLeadAccess, leadScope, isSalesGlobal, SalesService } from './sales.service.js';
import { ProjectFlowService } from '../project-flow/projectFlow.service.js';

/**
 * Quotations (Phase B)
 *  1. A marketing person requests a quotation: the services the client wants, no prices.
 *  2. The admin adds prices, GST, discount and validity, then sends it — the client gets a link.
 *  3. The client accepts, declines, or asks to negotiate (with a message / their figure).
 *  4. The admin sends a revised price as a new round. Every step is kept in the round history.
 */

const httpError = (status, message, code = 'BAD_REQUEST') => Object.assign(new Error(message), { status, code });
const has = (u, key) => Boolean(u.isOwner || (Array.isArray(u.permissions) ? u.permissions.includes(key) : u.permissions?.has?.(key)));
export const canPriceQuotes = (u) => has(u, 'sales_quotes.price');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dateStr = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);
const OPEN = ['sent', 'viewed', 'negotiating'];
const EARLY_STAGES = ['New', 'Contacted', 'DiscoveryCallDone'];

const audit = (actor, action, id, details, req) => AuditService.log({ actorId: actor?.id || null, action, entityType: 'sales_quotation', entityId: id, details, req });

async function notify(userIds, { title, message, quoteId, actorId }) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))].filter((id) => id !== Number(actorId));
  for (const id of ids) {
    try {
      await NotificationsService.createNotification({
        recipientUserId: id, actorUserId: actorId || null, type: 'quotation', title, message,
        entityType: 'sales_quotation', entityId: quoteId, actionUrl: `/sales/quotes/${quoteId}`
      });
    } catch (e) {
      console.error('[quotes] notification failed:', e.message);
    }
  }
}

async function pricerIds() {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.status = 'active' AND u.client_id IS NULL AND p.permission_key = 'sales_quotes.price'
     UNION SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE u.status = 'active' AND u.client_id IS NULL AND r.slug = 'owner'`
  );
  return rows.map((r) => r.id);
}

/** GST totals, with a quotation-level discount spread across lines in proportion to their value. */
export function quoteTotals(items, { gstMode, discountAmount = 0, placeStateCode, agencyStateCode }) {
  const bases = items.map((it) => round2((Number(it.quantity) || 0) * (Number(it.unit_price ?? it.unitPrice) || 0)));
  const subtotal = round2(bases.reduce((a, b) => a + b, 0));
  const discount = Math.min(subtotal, Math.max(0, round2(discountAmount)));
  let left = discount;
  const lines = items.map((it, i) => {
    const share = i === items.length - 1 ? left : round2(subtotal ? (discount * bases[i]) / subtotal : 0);
    left = round2(left - share);
    return {
      quantity: it.quantity, unitPrice: Number(it.unit_price ?? it.unitPrice) || 0, discountAmount: share,
      gstRate: gstMode === 'gst' ? Number(it.gst_rate ?? it.gstRate ?? 18) : 0
    };
  });
  const t = calculateInvoice({ invoiceType: gstMode === 'gst' ? 'INV' : 'IND', placeStateCode, agencyStateCode, items: lines });
  return { subtotal: t.subtotal, discount: t.discount, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tax: t.tax, roundOff: t.roundOff, total: t.total, supplyType: t.supplyType };
}

export class SalesQuotesService {
  // ───────────── visibility ─────────────

  /** SQL limiting quotations to what the actor may see. Pricers and owners/admins see all. */
  static #scope(actor) {
    if (canPriceQuotes(actor) || isSalesGlobal(actor)) return ['1=1', []];
    const [ls, lp] = leadScope(actor, 'sl');
    return [
      `(q.requested_by = ? OR q.created_by = ?
        OR (q.lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads sl WHERE sl.id = q.lead_id AND ${ls}))
        OR (q.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM clients sc WHERE sc.id = q.client_id AND sc.account_manager_id = ?)))`,
      [actor.id, actor.id, ...lp, actor.id]
    ];
  }

  static async #load(id, actor) {
    const [scope, sp] = this.#scope(actor);
    const [[q]] = await pool.query(
      `SELECT q.*, COALESCE(c.company_name, c.name, l.company_name, l.title) AS party_name, l.stage AS lead_stage,
              l.owner_user_id AS lead_owner_id, l.rep_user_id AS lead_rep_id, l.contact_name, l.phone AS party_phone,
              COALESCE(c.email, l.email) AS party_email, c.state_code AS client_state_code, c.gstin AS client_gstin,
              ru.name AS requested_by_name, pu.name AS priced_by_name
       FROM sales_quotations q LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN users ru ON ru.id = q.requested_by LEFT JOIN users pu ON pu.id = q.priced_by
       WHERE q.id = ? AND ${scope}`,
      [id, ...sp]
    );
    if (!q) {
      const [[any]] = await pool.query('SELECT id FROM sales_quotations WHERE id = ?', [id]);
      throw any ? httpError(403, 'You do not have access to this quotation', 'FORBIDDEN') : httpError(404, 'Quotation not found', 'NOT_FOUND');
    }
    return q;
  }

  static async #agencyState() {
    const [[a]] = await pool.query('SELECT state_code FROM agency_settings WHERE id = 1');
    return a?.state_code || '33';
  }

  // ───────────── read ─────────────

  static async list(actor, { status = '', leadId, clientId } = {}) {
    const [scope, sp] = this.#scope(actor);
    const where = [scope];
    const params = [...sp];
    if (status === 'open') where.push("q.status IN ('sent','viewed','negotiating')");
    else if (status) { where.push('q.status = ?'); params.push(status); }
    if (leadId) { where.push('q.lead_id = ?'); params.push(Number(leadId)); }
    if (clientId) { where.push('q.client_id = ?'); params.push(Number(clientId)); }
    const [rows] = await pool.query(
      `SELECT q.id, q.quote_number, q.title, q.status, q.gst_mode, q.quote_date, q.valid_until, q.total_amount, q.lead_id, q.client_id,
              q.requested_by, ru.name AS requested_by_name, q.created_at, q.updated_at, q.public_token,
              COALESCE(c.company_name, c.name, l.company_name, l.title) AS party_name,
              (SELECT GROUP_CONCAT(i.description ORDER BY i.sort_order SEPARATOR ', ') FROM sales_quotation_items i WHERE i.quotation_id = q.id) AS services,
              (SELECT COUNT(*) FROM sales_quotation_rounds r WHERE r.quotation_id = q.id AND r.kind = 'revision') AS revisions
       FROM sales_quotations q LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN users ru ON ru.id = q.requested_by
       WHERE ${where.join(' AND ')} ORDER BY q.updated_at DESC LIMIT 500`,
      params
    );
    const [[k]] = await pool.query(
      `SELECT SUM(q.status = 'requested') AS awaiting_price, SUM(q.status IN ('sent','viewed')) AS sent,
              SUM(q.status = 'negotiating') AS negotiating, SUM(q.status = 'approved') AS approved, SUM(q.status = 'converted') AS converted,
              COALESCE(SUM(CASE WHEN q.status IN ('sent','viewed','negotiating','approved') THEN q.total_amount END), 0) AS pipeline,
              COALESCE(SUM(CASE WHEN q.status IN ('approved','converted') THEN q.total_amount END), 0) AS won_value
       FROM sales_quotations q WHERE ${scope}`,
      sp
    );
    const canPrice = canPriceQuotes(actor);
    return {
      quotes: rows.map((r) => ({ ...r, total_amount: Number(r.total_amount), revisions: Number(r.revisions), public_token: canPrice ? r.public_token : undefined })),
      counts: Object.fromEntries(Object.entries(k).map(([key, v]) => [key, Number(v || 0)])),
      canPrice
    };
  }

  static async get(id, actor) {
    const q = await this.#load(id, actor);
    const [items] = await pool.query('SELECT * FROM sales_quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);
    const [rounds] = await pool.query(
      `SELECT r.*, COALESCE(u.name, r.by_name) AS by_label FROM sales_quotation_rounds r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.quotation_id = ? ORDER BY r.created_at, r.id`,
      [id]
    );
    const canPrice = canPriceQuotes(actor);
    const priced = q.status !== 'requested';
    const totals = quoteTotals(items, {
      gstMode: q.gst_mode, discountAmount: q.discount_amount, placeStateCode: q.client_state_code || (await this.#agencyState()), agencyStateCode: await this.#agencyState()
    });
    const expired = OPEN.includes(q.status) && q.valid_until && dateStr(q.valid_until) < todayIso();
    return {
      quote: {
        ...q, public_token: canPrice ? q.public_token : undefined, expired: Boolean(expired),
        subtotal: Number(q.subtotal), discount_amount: Number(q.discount_amount), taxable_amount: Number(q.taxable_amount),
        tax_amount: Number(q.tax_amount), total_amount: Number(q.total_amount), round_off: Number(q.round_off)
      },
      // Prices stay hidden from requesters until the admin has priced the quotation.
      items: items.map((i) => ({ ...i, quantity: Number(i.quantity), gst_rate: Number(i.gst_rate), unit_price: priced || canPrice ? (i.unit_price == null ? null : Number(i.unit_price)) : null })),
      rounds: rounds.map((r) => ({ ...r, discount_amount: r.discount_amount == null ? null : Number(r.discount_amount), total_amount: r.total_amount == null ? null : Number(r.total_amount), client_amount: r.client_amount == null ? null : Number(r.client_amount) })),
      totals: priced || canPrice ? totals : null,
      can: {
        price: canPrice,
        editRequest: q.status === 'requested' && (canPrice || Number(q.requested_by) === Number(actor.id)),
        send: canPrice && ['requested', 'draft'].includes(q.status),
        revise: canPrice && OPEN.includes(q.status),
        logClientRequest: OPEN.includes(q.status),
        decide: canPrice && OPEN.includes(q.status),
        convert: canPrice && has(actor, 'invoices.create') && q.status === 'approved',
        editSent: canPrice && OPEN.includes(q.status),
        cancel: canPrice && ['requested', 'draft', ...OPEN].includes(q.status),
        delete: (q.status === 'requested' && (canPrice || Number(q.requested_by) === Number(actor.id)))
          || (canPrice && ['draft', 'cancelled', 'rejected', 'expired'].includes(q.status)),
        duplicate: canPrice || has(actor, 'sales_quotes.request')
      },
      links: await this.#links(q)
    };
  }

  static async #links(q) {
    const [[p]] = q.proposal_id ? await pool.query('SELECT id, proposal_code, billing_cycle FROM proposals WHERE id = ?', [q.proposal_id]) : [[null]];
    const [[inv]] = q.converted_invoice_id ? await pool.query('SELECT id, invoice_number, status, total_amount FROM invoices WHERE id = ?', [q.converted_invoice_id]) : [[null]];
    const [[lead]] = q.lead_id ? await pool.query('SELECT converted_client_id FROM leads WHERE id = ?', [q.lead_id]) : [[null]];
    return {
      proposal: p || null,
      invoice: inv ? { ...inv, total_amount: Number(inv.total_amount) } : null,
      clientId: q.client_id || lead?.converted_client_id || null,
      needsOnboarding: Boolean(q.lead_id && !q.client_id && !lead?.converted_client_id)
    };
  }

  // ───────────── write ─────────────

  static async #assertParty(data, actor) {
    if (!data.leadId && !data.clientId) throw httpError(400, 'Choose the enquiry or client this quotation is for', 'TARGET_REQUIRED');
    if (data.leadId) await assertLeadAccess(data.leadId, actor);
    if (data.clientId) {
      const [[c]] = await pool.query('SELECT id FROM clients WHERE id = ?', [data.clientId]);
      if (!c) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    }
  }

  static async #saveItems(conn, quoteId, items, keepPrices) {
    await conn.query('DELETE FROM sales_quotation_items WHERE quotation_id = ?', [quoteId]);
    const ids = items.map((i) => i.serviceId).filter(Boolean);
    const [svcs] = ids.length ? await conn.query('SELECT id, sac_code, gst_rate FROM services WHERE id IN (?)', [ids]) : [[]];
    let order = 0;
    for (const it of items) {
      const s = svcs.find((x) => x.id === it.serviceId);
      await conn.query(
        `INSERT INTO sales_quotation_items (quotation_id, service_id, description, details, sac_code, quantity, unit_price, gst_rate, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteId, it.serviceId || null, it.description, it.details || null, it.sacCode || s?.sac_code || null, it.quantity || 1,
          keepPrices && it.unitPrice != null && it.unitPrice !== '' ? it.unitPrice : null, it.gstRate ?? s?.gst_rate ?? 18, order++]
      );
    }
  }

  /** Recalculate and store totals from the saved items. */
  static async #storeTotals(conn, quoteId) {
    const [[q]] = await conn.query(
      'SELECT q.gst_mode, q.discount_amount, c.state_code FROM sales_quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = ?',
      [quoteId]
    );
    const [items] = await conn.query('SELECT quantity, unit_price, gst_rate FROM sales_quotation_items WHERE quotation_id = ?', [quoteId]);
    const agency = await this.#agencyState();
    const t = quoteTotals(items, { gstMode: q.gst_mode, discountAmount: q.discount_amount, placeStateCode: q.state_code || agency, agencyStateCode: agency });
    await conn.query(
      'UPDATE sales_quotations SET subtotal = ?, discount_amount = ?, taxable_amount = ?, tax_amount = ?, round_off = ?, total_amount = ? WHERE id = ?',
      [t.subtotal, t.discount, t.taxable, t.tax, t.roundOff, t.total, quoteId]
    );
    return { t, items };
  }

  static async create(data, actor, req) {
    if (!has(actor, 'sales_quotes.request') && !canPriceQuotes(actor)) throw httpError(403, 'You cannot request quotations', 'FORBIDDEN');
    await this.#assertParty(data, actor);
    const canPrice = canPriceQuotes(actor);
    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const number = await FinanceService.takeSeriesNumber(conn, 'QUO', todayIso());
      const [res] = await conn.query(
        `INSERT INTO sales_quotations (quote_number, lead_id, client_id, title, status, gst_mode, quote_date, valid_until, requirements, terms,
                                       discount_amount, public_token, requested_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [number, data.leadId || null, data.clientId || null, data.title, canPrice ? 'draft' : 'requested', data.gstMode || 'gst', todayIso(),
          data.validUntil || null, data.requirements || null, data.terms || null, canPrice ? data.discountAmount || 0 : 0,
          crypto.randomBytes(16).toString('hex'), actor.id, actor.id]
      );
      id = res.insertId;
      await this.#saveItems(conn, id, data.items, canPrice);
      await this.#storeTotals(conn, id);
      await conn.query(
        "INSERT INTO sales_quotation_rounds (quotation_id, round_no, kind, note, created_by) VALUES (?, 0, 'requested', ?, ?)",
        [id, canPrice ? 'Quotation drafted' : `Requested: ${data.items.map((i) => i.description).join(', ')}`, actor.id]
      );
      if (data.leadId) {
        await conn.query(
          "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'quote_followup', ?, ?, ?)",
          [data.leadId, `Quotation ${number} ${canPrice ? 'drafted' : 'requested'}`, data.requirements || null, actor.id]
        );
        await conn.query('UPDATE leads SET last_activity_at = NOW() WHERE id = ?', [data.leadId]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if (!canPrice) {
      const q = await this.#load(id, actor);
      await notify(await pricerIds(), {
        title: 'Quotation to price', actorId: actor.id, quoteId: id,
        message: `${actor.name || 'A marketing person'} requested ${q.quote_number} for ${q.party_name}: ${data.items.map((i) => i.description).join(', ')}.`
      });
    }
    await audit(actor, 'quote.create', id, { priced: canPrice }, req);
    return this.get(id, actor);
  }

  static async update(id, data, actor, req) {
    const q = await this.#load(id, actor);
    const canPrice = canPriceQuotes(actor);
    const mine = Number(q.requested_by) === Number(actor.id);
    // Admin editing a quotation the client already has = a new revision the client sees on the same link.
    const isRevision = canPrice && OPEN.includes(q.status);
    if (!(canPrice && ['requested', 'draft'].includes(q.status)) && !(mine && q.status === 'requested') && !isRevision) {
      throw httpError(409, OPEN.includes(q.status) ? 'Only the admin can change a quotation after it is sent.'
        : ['approved', 'converted'].includes(q.status) ? 'The client accepted this quotation, so it is locked. Duplicate it to make a new one.'
          : 'This quotation can no longer be edited. Duplicate it to make a new one.', 'LOCKED');
    }
    if (isRevision && data.items?.some((i) => i.unitPrice == null || i.unitPrice === '' || Number(i.unitPrice) <= 0)) {
      throw httpError(400, 'Every line on a sent quotation needs a price', 'PRICE_MISSING');
    }
    if (data.leadId !== undefined || data.clientId !== undefined) await this.#assertParty({ leadId: data.leadId ?? q.lead_id, clientId: data.clientId ?? q.client_id }, actor);
    const conn = await pool.getConnection();
    let t;
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE sales_quotations SET title = ?, gst_mode = ?, valid_until = ?, requirements = ?, terms = ?, discount_amount = ? WHERE id = ?`,
        [data.title ?? q.title, canPrice ? data.gstMode || q.gst_mode : q.gst_mode, canPrice ? data.validUntil ?? q.valid_until : q.valid_until,
          data.requirements ?? q.requirements, canPrice ? data.terms ?? q.terms : q.terms, canPrice ? data.discountAmount ?? q.discount_amount : 0, id]
      );
      if (data.items) await this.#saveItems(conn, id, data.items, canPrice);
      ({ t } = await this.#storeTotals(conn, id));
      if (isRevision) {
        const [[{ n }]] = await conn.query("SELECT COALESCE(MAX(round_no), 1) AS n FROM sales_quotation_rounds WHERE quotation_id = ? AND kind IN ('priced','revision')", [id]);
        await conn.query(
          "INSERT INTO sales_quotation_rounds (quotation_id, round_no, kind, discount_amount, total_amount, note, created_by) VALUES (?, ?, 'revision', ?, ?, ?, ?)",
          [id, Number(n) + 1, t.discount, t.total, data.revisionNote || 'Quotation updated', actor.id]
        );
        await conn.query("UPDATE sales_quotations SET status = 'sent', sent_at = NOW(), decided_at = NULL WHERE id = ?", [id]);
        if (q.lead_id) {
          await conn.query(
            "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'quote_followup', ?, ?, ?)",
            [q.lead_id, `Quotation ${q.quote_number} updated · ₹${t.total.toLocaleString('en-IN')}`, data.revisionNote || null, actor.id]
          );
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if (isRevision) {
      await notify([q.requested_by, q.lead_owner_id, q.lead_rep_id], {
        title: `${q.quote_number} updated`, actorId: actor.id, quoteId: id,
        message: `${q.party_name}: revised quotation sent (₹${t.total.toLocaleString('en-IN')})${data.revisionNote ? ` — ${data.revisionNote}` : ''}.`
      });
    }
    await audit(actor, isRevision ? 'quote.revise_edit' : 'quote.update', id, isRevision ? { total: t.total } : null, req);
    return this.get(id, actor);
  }

  // ── Quotation lifecycle: cancel / delete / duplicate ──

  /** Stop a quotation (the client link then says it is no longer valid). Accepted/converted ones are kept. */
  static async cancel(id, { reason }, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can cancel quotations', 'FORBIDDEN');
    const q = await this.#load(id, actor);
    if (!['requested', 'draft', ...OPEN].includes(q.status)) {
      throw httpError(409, ['approved', 'converted'].includes(q.status) ? 'The client accepted this quotation, so it cannot be cancelled.' : 'This quotation is already closed', 'LOCKED');
    }
    await pool.query("UPDATE sales_quotations SET status = 'cancelled', decided_at = NOW(), decision_note = ? WHERE id = ?", [reason || null, id]);
    await pool.query("INSERT INTO sales_quotation_rounds (quotation_id, kind, note, created_by) VALUES (?, 'cancelled', ?, ?)", [id, reason || 'Cancelled', actor.id]);
    if (q.lead_id) {
      await pool.query("INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'quote_followup', ?, ?, ?)",
        [q.lead_id, `Quotation ${q.quote_number} cancelled`, reason || null, actor.id]);
    }
    await notify([q.requested_by, q.lead_owner_id], { title: `${q.quote_number} cancelled`, actorId: actor.id, quoteId: id, message: `${q.party_name}${reason ? `: ${reason}` : ''}` });
    await audit(actor, 'quote.cancel', id, { reason }, req);
    return this.get(id, actor);
  }

  static async remove(id, actor, req) {
    const q = await this.#load(id, actor);
    const canPrice = canPriceQuotes(actor);
    const mine = Number(q.requested_by) === Number(actor.id);
    const deletable = (q.status === 'requested' && (canPrice || mine)) || (canPrice && ['draft', 'cancelled', 'rejected', 'expired'].includes(q.status));
    if (!deletable) {
      throw httpError(409, OPEN.includes(q.status) ? 'The client may still answer this quotation. Cancel it first, then delete.'
        : ['approved', 'converted'].includes(q.status) ? 'The client accepted this quotation, so it is kept on record.'
          : 'You cannot delete this quotation', 'LOCKED');
    }
    await pool.query('DELETE FROM sales_quotations WHERE id = ?', [id]); // items and rounds cascade
    await pool.query("DELETE FROM notifications WHERE entity_type = 'sales_quotation' AND entity_id = ?", [id]);
    await audit(actor, 'quote.delete', id, { number: q.quote_number, party: q.party_name }, req);
    return { deleted: true, id };
  }

  /** Copy into a new quotation (new number). Admins get a draft with prices; marketing people a new request. */
  static async duplicate(id, actor, req) {
    const q = await this.#load(id, actor);
    const [items] = await pool.query('SELECT * FROM sales_quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);
    const copy = await this.create({
      leadId: q.lead_id, clientId: q.lead_id ? null : q.client_id, title: q.title, requirements: q.requirements, terms: q.terms,
      gstMode: q.gst_mode, discountAmount: Number(q.discount_amount || 0),
      items: items.map((i) => ({ serviceId: i.service_id, description: i.description, details: i.details, sacCode: i.sac_code, quantity: Number(i.quantity), unitPrice: i.unit_price == null ? null : Number(i.unit_price), gstRate: Number(i.gst_rate) }))
    }, actor, req);
    await audit(actor, 'quote.duplicate', copy.quote.id, { from: id }, req);
    return copy;
  }

  /** Admin: price check, then send to the client (link) — moves the enquiry to "Quotation sent". */
  static async send(id, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can price and send quotations', 'FORBIDDEN');
    const q = await this.#load(id, actor);
    if (!['requested', 'draft'].includes(q.status)) throw httpError(409, 'This quotation was already sent', 'ALREADY_SENT');
    const [items] = await pool.query('SELECT description, unit_price FROM sales_quotation_items WHERE quotation_id = ?', [id]);
    if (!items.length) throw httpError(400, 'Add at least one service', 'NO_ITEMS');
    const missing = items.filter((i) => i.unit_price == null || Number(i.unit_price) <= 0);
    if (missing.length) throw httpError(400, `Add a price for: ${missing.map((i) => i.description).join(', ')}`, 'PRICE_MISSING');
    const conn = await pool.getConnection();
    let total;
    try {
      await conn.beginTransaction();
      const { t } = await this.#storeTotals(conn, id);
      total = t.total;
      const validUntil = q.valid_until || new Date(Date.now() + 15 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      await conn.query(
        "UPDATE sales_quotations SET status = 'sent', priced_by = ?, priced_at = COALESCE(priced_at, NOW()), sent_at = NOW(), valid_until = ? WHERE id = ?",
        [actor.id, validUntil, id]
      );
      await conn.query(
        "INSERT INTO sales_quotation_rounds (quotation_id, round_no, kind, discount_amount, total_amount, note, created_by) VALUES (?, 1, 'priced', ?, ?, ?, ?)",
        [id, t.discount, t.total, 'Priced and sent to the client', actor.id]
      );
      if (q.lead_id) {
        const moved = EARLY_STAGES.includes(q.lead_stage);
        await conn.query(
          `INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, stage_from, stage_to, created_by)
           VALUES (?, 'quote_followup', ?, ?, ?, ?, ?)`,
          [q.lead_id, `Quotation ${q.quote_number} sent · ₹${t.total.toLocaleString('en-IN')}`, null, moved ? q.lead_stage : null, moved ? 'ProposalSent' : null, actor.id]
        );
        await conn.query(`UPDATE leads SET last_activity_at = NOW()${moved ? ", stage = 'ProposalSent'" : ''} WHERE id = ?`, [q.lead_id]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await notify([q.requested_by, q.lead_owner_id, q.lead_rep_id], {
      title: `Quotation ${q.quote_number} priced`, actorId: actor.id, quoteId: id,
      message: `${q.party_name}: ₹${total.toLocaleString('en-IN')} sent to the client. Follow up with them.`
    });
    await audit(actor, 'quote.send', id, { total }, req);
    return this.get(id, actor);
  }

  /** Admin: negotiated price — a new discount and/or new line prices — sent again as the next round. */
  static async revise(id, { discountAmount, items, note }, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can change prices', 'FORBIDDEN');
    const q = await this.#load(id, actor);
    if (!OPEN.includes(q.status)) throw httpError(409, 'Only a sent quotation can be revised', 'NOT_OPEN');
    const conn = await pool.getConnection();
    let t;
    try {
      await conn.beginTransaction();
      if (items) {
        for (const it of items) {
          await conn.query('UPDATE sales_quotation_items SET unit_price = ? WHERE id = ? AND quotation_id = ?', [it.unitPrice, it.id, id]);
        }
      }
      if (discountAmount != null) await conn.query('UPDATE sales_quotations SET discount_amount = ? WHERE id = ?', [discountAmount, id]);
      ({ t } = await this.#storeTotals(conn, id));
      const [[{ n }]] = await conn.query("SELECT COALESCE(MAX(round_no), 1) AS n FROM sales_quotation_rounds WHERE quotation_id = ? AND kind IN ('priced','revision')", [id]);
      await conn.query(
        "INSERT INTO sales_quotation_rounds (quotation_id, round_no, kind, discount_amount, total_amount, note, created_by) VALUES (?, ?, 'revision', ?, ?, ?, ?)",
        [id, Number(n) + 1, t.discount, t.total, note || null, actor.id]
      );
      await conn.query("UPDATE sales_quotations SET status = 'sent', sent_at = NOW(), decided_at = NULL WHERE id = ?", [id]);
      if (q.lead_id) {
        await conn.query(
          "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, amount, created_by) VALUES (?, 'negotiation', ?, ?, ?, ?)",
          [q.lead_id, `Revised quotation ${q.quote_number} · ₹${t.total.toLocaleString('en-IN')}`, note || null, t.total, actor.id]
        );
        await conn.query("UPDATE leads SET last_activity_at = NOW(), stage = IF(stage IN ('Won','Lost'), stage, 'Negotiation') WHERE id = ?", [q.lead_id]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await notify([q.requested_by, q.lead_owner_id, q.lead_rep_id], {
      title: `Revised price for ${q.quote_number}`, actorId: actor.id, quoteId: id,
      message: `${q.party_name}: now ₹${t.total.toLocaleString('en-IN')}${note ? ` — ${note}` : ''}.`
    });
    await audit(actor, 'quote.revise', id, { total: t.total }, req);
    return this.get(id, actor);
  }

  /** Staff log the client's negotiation request (e.g. from a call). Pricers are told to revise. */
  static async logClientRequest(id, { note, clientAmount }, actor, req) {
    const q = await this.#load(id, actor);
    if (!OPEN.includes(q.status)) throw httpError(409, 'Only a sent quotation can be negotiated', 'NOT_OPEN');
    await this.#recordClientRequest(q, { note, clientAmount, byName: null, actorId: actor.id });
    await audit(actor, 'quote.client_request', id, { clientAmount }, req);
    return this.get(id, actor);
  }

  static async #recordClientRequest(q, { note, clientAmount, byName, actorId }) {
    await pool.query(
      "INSERT INTO sales_quotation_rounds (quotation_id, kind, client_amount, note, by_name, created_by) VALUES (?, 'client_request', ?, ?, ?, ?)",
      [q.id, clientAmount ?? null, note || null, byName || null, actorId || null]
    );
    await pool.query("UPDATE sales_quotations SET status = 'negotiating' WHERE id = ?", [q.id]);
    if (q.lead_id) {
      await pool.query(
        "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, amount, created_by) VALUES (?, 'negotiation', ?, ?, ?, ?)",
        [q.lead_id, `Client asked to negotiate ${q.quote_number}${clientAmount ? ` · wants ₹${Number(clientAmount).toLocaleString('en-IN')}` : ''}`,
          note || null, clientAmount ?? null, actorId || null]
      );
      await pool.query("UPDATE leads SET last_activity_at = NOW(), stage = IF(stage IN ('Won','Lost'), stage, 'Negotiation') WHERE id = ?", [q.lead_id]);
    }
    await notify([...(await pricerIds()), q.requested_by, q.lead_owner_id], {
      title: `Negotiation on ${q.quote_number}`, actorId, quoteId: q.id,
      message: `${byName || 'The client'} asked for a better price on ${q.party_name}${clientAmount ? ` (₹${Number(clientAmount).toLocaleString('en-IN')})` : ''}${note ? `: ${note}` : ''}.`
    });
  }

  /** Admin marks the outcome when the client answered outside the link (phone / WhatsApp). */
  static async decide(id, { decision, note }, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can close a quotation', 'FORBIDDEN');
    const q = await this.#load(id, actor);
    if (!OPEN.includes(q.status)) throw httpError(409, 'This quotation is not waiting for a decision', 'NOT_OPEN');
    await this.#recordDecision(q, { decision, note, byName: null, actorId: actor.id });
    await audit(actor, `quote.${decision}`, id, null, req);
    return this.get(id, actor);
  }

  static async #recordDecision(q, { decision, note, byName, actorId }) {
    const status = decision === 'accept' ? 'approved' : 'rejected';
    await pool.query('UPDATE sales_quotations SET status = ?, decided_at = NOW(), decided_by_name = ?, decision_note = ? WHERE id = ?', [status, byName, note || null, q.id]);
    await pool.query(
      'INSERT INTO sales_quotation_rounds (quotation_id, kind, total_amount, note, by_name, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [q.id, decision === 'accept' ? 'accepted' : 'rejected', q.total_amount, note || null, byName || null, actorId || null]
    );
    if (q.lead_id) {
      await pool.query(
        "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'quote_followup', ?, ?, ?)",
        [q.lead_id, `Quotation ${q.quote_number} ${decision === 'accept' ? 'accepted' : 'declined'}${byName ? ` by ${byName}` : ''}`, note || null, actorId || null]
      );
      await pool.query('UPDATE leads SET last_activity_at = NOW() WHERE id = ?', [q.lead_id]);
    }
    await notify([...(await pricerIds()), q.requested_by, q.lead_owner_id, q.lead_rep_id], {
      title: `${q.quote_number} ${decision === 'accept' ? 'accepted 🎉' : 'declined'}`, actorId, quoteId: q.id,
      message: `${q.party_name} ${decision === 'accept' ? `accepted ₹${Number(q.total_amount).toLocaleString('en-IN')}. Onboard them and convert it to an invoice.` : 'declined the quotation.'}${note ? ` “${note}”` : ''}`
    });
  }

  // ───────────── Phase C: proposal → quotation → invoice ─────────────

  /** The plan the client picked on a proposal becomes a draft quotation the admin can adjust and send. */
  static async fromProposal(proposalId, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can create quotations from proposals', 'FORBIDDEN');
    const { proposal: p, tiers } = await SalesService.getProposal(proposalId, actor);
    if (p.status !== 'accepted') throw httpError(409, 'The client has to choose a plan on the proposal first', 'NOT_ACCEPTED');
    const tier = tiers.find((t) => t.id === p.accepted_tier_id);
    if (!tier) throw httpError(409, 'The chosen plan no longer exists', 'NO_TIER');
    const [[existing]] = await pool.query(
      "SELECT id, quote_number FROM sales_quotations WHERE proposal_id = ? AND status NOT IN ('rejected','expired') LIMIT 1",
      [proposalId]
    );
    if (existing) throw httpError(409, `Quotation ${existing.quote_number} already exists for this proposal`, 'QUOTE_EXISTS');
    const CYCLE = { monthly: 'per month', quarterly: 'per quarter', half_yearly: 'per 6 months', annual: 'per year', one_time: 'one-time' };
    const doc = await this.create(
      {
        leadId: p.lead_id || null,
        clientId: p.lead_id ? null : p.client_id,
        title: `${p.title} — ${tier.name} plan`,
        requirements: `Client chose the ${tier.name} plan on proposal ${p.proposal_code} (${CYCLE[p.billing_cycle] || p.billing_cycle}).`,
        gstMode: p.gst_mode,
        items: [{
          serviceId: tier.service_id || null, description: tier.service_name || tier.name,
          details: [tier.inclusions, CYCLE[p.billing_cycle] ? `Billing: ${CYCLE[p.billing_cycle]}` : null].filter(Boolean).join('\n'), quantity: 1, unitPrice: tier.price
        }]
      },
      actor,
      req
    );
    await pool.query('UPDATE sales_quotations SET proposal_id = ? WHERE id = ?', [proposalId, doc.quote.id]);
    await audit(actor, 'quote.from_proposal', doc.quote.id, { proposalId }, req);
    return this.get(doc.quote.id, actor);
  }

  /**
   * Accepted quotation → client (onboarding the enquiry if needed) → optional project → draft GST invoice.
   * Each step goes through the module that owns it, so its own rules apply.
   * projectMode: 'auto' (from the proposal's billing cycle, else none) | 'none' | 'one_time' | 'regular'
   */
  static async convert(id, { invoiceDate, projectMode = 'auto', assigneeId }, actor, req) {
    if (!canPriceQuotes(actor)) throw httpError(403, 'Only the admin can convert quotations', 'FORBIDDEN');
    if (!has(actor, 'invoices.create')) throw httpError(403, 'You need permission to create invoices', 'FORBIDDEN');
    const q = await this.#load(id, actor);
    if (q.status === 'converted') throw httpError(409, `Already converted to an invoice`, 'ALREADY_CONVERTED');
    if (q.status !== 'approved') throw httpError(409, 'Only a quotation the client accepted can be converted', 'NOT_APPROVED');
    const [items] = await pool.query('SELECT * FROM sales_quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);

    // 1. Client: the quotation's client, the enquiry's client, or onboard the enquiry now.
    let clientId = q.client_id;
    if (!clientId && q.lead_id) {
      const [[lead]] = await pool.query('SELECT converted_client_id FROM leads WHERE id = ?', [q.lead_id]);
      clientId = lead?.converted_client_id || (await SalesService.onboardLead(q.lead_id, {}, actor, req)).client_id;
    }
    if (!clientId) throw httpError(409, 'This quotation has no client or enquiry to onboard', 'NO_CLIENT');
    const [[client]] = await pool.query('SELECT id, gstin FROM clients WHERE id = ?', [clientId]);

    // 2. Optional project. A proposal's billing cycle decides it by default (monthly etc. → retainer).
    let category = projectMode;
    if (projectMode === 'auto') {
      const [[p]] = q.proposal_id ? await pool.query('SELECT billing_cycle FROM proposals WHERE id = ?', [q.proposal_id]) : [[null]];
      category = p ? (p.billing_cycle === 'one_time' ? 'one_time' : 'regular') : 'none';
    }
    const invoiceType = q.gst_mode !== 'gst' ? 'IND' : client?.gstin ? 'INC' : 'INV';
    let project = null;
    let invoiceProjectId = null;
    if (category !== 'none') {
      if (!assigneeId) throw httpError(400, 'Choose who will run the project', 'ASSIGNEE_REQUIRED');
      project = await ProjectFlowService.createProject(
        {
          clientId, name: q.title, description: items.map((i) => `${i.description}${i.details ? ` — ${i.details}` : ''}`).join('\n'),
          category, serviceId: items.find((i) => i.service_id)?.service_id || null, pipelineId: null, assignmentMode: 'individual',
          assigneeId, priority: 'medium', startDate: invoiceDate, monthlyDeliverables: []
        },
        actor,
        req
      );
      invoiceProjectId = category === 'regular' && project.cycles?.[0] ? project.cycles[0].id : project.id;
      if (category === 'regular') {
        // The agreed (pre-GST) amount becomes the monthly fee, so later months draft their own invoices.
        await pool.query('UPDATE projects SET billing_amount = ?, retainer_invoice_type = ?, retainer_auto_invoice = TRUE WHERE id = ?', [q.taxable_amount, invoiceType, project.id]);
      }
    }

    // 3. Draft GST invoice with the same lines; the negotiated discount is spread across them.
    const bases = items.map((i) => round2(Number(i.quantity) * Number(i.unit_price || 0)));
    const subtotal = round2(bases.reduce((a, b) => a + b, 0));
    let left = Math.min(subtotal, Number(q.discount_amount || 0));
    const total = left;
    const lines = items.map((i, idx) => {
      const share = idx === items.length - 1 ? left : round2(subtotal ? (total * bases[idx]) / subtotal : 0);
      left = round2(left - share);
      return {
        serviceId: i.service_id || null, description: i.description, details: i.details || null, sacCode: i.sac_code || null,
        quantity: Number(i.quantity), unitPrice: Number(i.unit_price), discountAmount: share, gstRate: invoiceType === 'IND' ? 0 : Number(i.gst_rate)
      };
    });
    const doc = await FinanceService.createDraft(
      { invoiceType, clientId, projectId: invoiceProjectId, invoiceDate, notes: `As per quotation ${q.quote_number}${q.terms ? `\n${q.terms}` : ''}`, items: lines },
      actor,
      req
    );

    await pool.query("UPDATE sales_quotations SET status = 'converted', client_id = ?, converted_invoice_id = ? WHERE id = ?", [clientId, doc.invoice.id, id]);
    if (q.proposal_id) {
      await pool.query(
        "UPDATE proposals SET status = 'converted', converted_client_id = ?, converted_project_id = ?, converted_invoice_id = ? WHERE id = ?",
        [clientId, project?.id || null, doc.invoice.id, q.proposal_id]
      );
    }
    if (q.lead_id) {
      await pool.query(
        "INSERT INTO lead_interactions (lead_id, interaction_type, title, outcome, created_by) VALUES (?, 'quote_followup', ?, ?, ?)",
        [q.lead_id, `Quotation ${q.quote_number} converted to invoice`, project ? `Project: ${q.title}` : null, actor.id]
      );
    }
    await notify([q.requested_by, q.lead_owner_id, q.lead_rep_id], {
      title: `${q.quote_number} converted 🎉`, actorId: actor.id, quoteId: id,
      message: `${q.party_name} is onboarded and the invoice is drafted${project ? ', with the project set up' : ''}.`
    });
    await audit(actor, 'quote.convert', id, { clientId, projectId: project?.id || null, invoiceId: doc.invoice.id }, req);
    return { clientId, projectId: project?.id || null, invoiceId: doc.invoice.id, ...(await this.get(id, actor)) };
  }

  // ───────────── public client link ─────────────

  static async #publicLoad(token) {
    if (!/^[a-f0-9]{32}$/.test(token)) throw httpError(404, 'Quotation not found', 'NOT_FOUND');
    const [[q]] = await pool.query(
      `SELECT q.*, COALESCE(c.company_name, c.name, l.company_name, l.title) AS party_name, l.owner_user_id AS lead_owner_id,
              l.rep_user_id AS lead_rep_id, c.state_code AS client_state_code
       FROM sales_quotations q LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.public_token = ? AND q.status NOT IN ('requested','draft')`,
      [token]
    );
    if (!q) throw httpError(404, 'Quotation not found', 'NOT_FOUND');
    return q;
  }

  static async publicView(token, { countView = true } = {}) {
    const q = await this.#publicLoad(token);
    if (countView) await pool.query("UPDATE sales_quotations SET view_count = view_count + 1, last_viewed_at = NOW(), status = IF(status = 'sent', 'viewed', status) WHERE id = ?", [q.id]);
    if (countView && q.status === 'sent') {
      await notify([q.requested_by, q.lead_owner_id], { title: `${q.quote_number} opened`, quoteId: q.id, message: `${q.party_name} opened the quotation.` });
    }
    const [items] = await pool.query('SELECT description, details, sac_code, quantity, unit_price, gst_rate FROM sales_quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [q.id]);
    const [rounds] = await pool.query(
      "SELECT kind, round_no, total_amount, client_amount, note, created_at FROM sales_quotation_rounds WHERE quotation_id = ? AND kind IN ('priced','revision','client_request','accepted','rejected') ORDER BY created_at, id",
      [q.id]
    );
    const [[agency]] = await pool.query('SELECT agency_name, legal_name, gstin, phone, email, website, address, city, state FROM agency_settings WHERE id = 1');
    const agencyState = await this.#agencyState();
    const totals = quoteTotals(items, { gstMode: q.gst_mode, discountAmount: q.discount_amount, placeStateCode: q.client_state_code || agencyState, agencyStateCode: agencyState });
    const expired = OPEN.includes(q.status) && q.valid_until && dateStr(q.valid_until) < todayIso();
    return {
      quote: {
        number: q.quote_number, title: q.title, partyName: q.party_name, status: q.status, gstMode: q.gst_mode, quoteDate: q.quote_date,
        validUntil: q.valid_until, terms: q.terms, decidedAt: q.decided_at, decidedByName: q.decided_by_name, expired: Boolean(expired)
      },
      items: items.map((i) => ({ description: i.description, details: i.details, sac: i.sac_code, quantity: Number(i.quantity), unitPrice: Number(i.unit_price), gstRate: Number(i.gst_rate) })),
      totals,
      rounds: rounds.map((r) => ({ kind: r.kind, round: r.round_no, total: r.total_amount == null ? null : Number(r.total_amount), clientAmount: r.client_amount == null ? null : Number(r.client_amount), note: r.note, at: r.created_at })),
      agency
    };
  }

  static async publicDecide(token, { decision, name, note, amount }) {
    const q = await this.#publicLoad(token);
    if (!OPEN.includes(q.status)) throw httpError(409, 'This quotation has already been answered', 'ALREADY_DECIDED');
    if (q.valid_until && dateStr(q.valid_until) < todayIso()) throw httpError(409, 'This quotation has expired. Please contact us for an updated one.', 'EXPIRED');
    if (decision === 'negotiate') {
      if (q.status === 'negotiating') throw httpError(409, 'Your request is already with us. We will send a revised quotation soon.', 'ALREADY_REQUESTED');
      await this.#recordClientRequest(q, { note, clientAmount: amount, byName: name, actorId: null });
    } else {
      await this.#recordDecision(q, { decision, note, byName: name, actorId: null });
    }
    await AuditService.log({ action: `quote.public_${decision}`, entityType: 'sales_quotation', entityId: q.id, details: { name, amount } });
    return this.publicView(token, { countView: false });
  }
}
