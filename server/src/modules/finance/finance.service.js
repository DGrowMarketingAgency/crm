import crypto from 'crypto';
import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import {
  INDIAN_STATES,
  stateByCode,
  stateCodeFromGstin,
  calculateInvoice,
  financialYear,
  formatDocNumber,
  round2
} from './gst.js';

function httpError(status, message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

const SETTINGS_FIELDS = [
  'agency_name', 'legal_name', 'gstin', 'pan', 'phone', 'email', 'website', 'address', 'city', 'state', 'state_code',
  'pincode', 'bank_name', 'account_name', 'account_number', 'ifsc', 'branch', 'upi_id', 'gpay_number',
  'signatory_name', 'signatory_title', 'terms_scope', 'terms_payment', 'terms_third_party', 'terms_confidentiality',
  'terms_cancellation', 'default_payment_terms_days'
];

const addDays = (dateStr, days) => {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const audit = (actor, action, entityType, entityId, details, req) =>
  AuditService.log({ actorId: actor.id, action, entityType, entityId, details, req });

export class FinanceService {
  // ───────────────────────── Settings & series ─────────────────────────

  static async getSettings() {
    const [[row]] = await pool.query('SELECT * FROM agency_settings WHERE id = 1');
    if (!row) {
      await pool.query('INSERT IGNORE INTO agency_settings (id) VALUES (1)');
      return this.getSettings();
    }
    return row;
  }

  static async updateSettings(data, actor, req) {
    const before = await this.getSettings();
    const next = {};
    for (const f of SETTINGS_FIELDS) if (data[f] !== undefined) next[f] = data[f] === '' ? null : data[f];
    if (next.gstin) {
      const code = stateCodeFromGstin(next.gstin);
      if (!code) throw httpError(400, 'Agency GSTIN is not a valid 15-character GSTIN', 'INVALID_GSTIN');
      // The registration state decides intra- vs inter-state tax, so it must match the GSTIN.
      next.state_code = code;
      next.state = stateByCode(code)?.name || next.state;
    } else if (next.state_code) {
      const st = stateByCode(next.state_code);
      if (!st) throw httpError(400, 'Unknown state code', 'INVALID_STATE');
      next.state = st.name;
    }
    if (Object.keys(next).length === 0) return before;
    const cols = Object.keys(next);
    await pool.query(
      `UPDATE agency_settings SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ? WHERE id = 1`,
      [...cols.map((c) => next[c]), actor.id]
    );
    const after = await this.getSettings();
    const changed = Object.fromEntries(cols.filter((c) => String(before[c] ?? '') !== String(after[c] ?? '')).map((c) => [c, { from: before[c], to: after[c] }]));
    await audit(actor, 'finance.settings.update', 'agency_settings', 1, { changed }, req);
    return after;
  }

  static async listSeries() {
    const [rows] = await pool.query('SELECT * FROM invoice_number_series ORDER BY FIELD(code, "INV", "INC", "IND", "CN")');
    const fy = financialYear(new Date().toISOString().slice(0, 10));
    return rows.map((r) => ({
      ...r,
      fy_reset: Boolean(r.fy_reset),
      is_tax: Boolean(r.is_tax),
      preview: formatDocNumber({ prefix: r.prefix, padding: r.padding, fyReset: Boolean(r.fy_reset) }, r.fy_reset && r.current_fy !== fy ? 1 : r.next_number, fy)
    }));
  }

  static async updateSeries(code, data, actor, req) {
    const [[row]] = await pool.query('SELECT * FROM invoice_number_series WHERE code = ?', [code]);
    if (!row) throw httpError(404, 'Number series not found', 'NOT_FOUND');
    await pool.query(
      'UPDATE invoice_number_series SET prefix = ?, next_number = ?, padding = ?, fy_reset = ? WHERE code = ?',
      [data.prefix ?? row.prefix, data.nextNumber ?? row.next_number, data.padding ?? row.padding, data.fyReset ?? row.fy_reset, code]
    );
    await audit(actor, 'finance.series.update', 'invoice_number_series', code, { from: row, to: data }, req);
    return this.listSeries();
  }

  /** Public wrapper for other modules (e.g. quotations use the QUO series). Call inside a transaction. */
  static takeSeriesNumber(conn, code, docDate) {
    return this.#takeNumber(conn, code, docDate);
  }

  /** Takes the next number of a series inside the caller's transaction (row-locked, gap-free). */
  static async #takeNumber(conn, code, docDate) {
    const [[s]] = await conn.query('SELECT * FROM invoice_number_series WHERE code = ? FOR UPDATE', [code]);
    if (!s) throw httpError(500, `Number series ${code} is missing`, 'SERIES_MISSING');
    const fy = financialYear(docDate);
    let n = s.next_number;
    if (s.fy_reset && s.current_fy !== fy) n = 1;
    const number = formatDocNumber({ prefix: s.prefix, padding: s.padding, fyReset: Boolean(s.fy_reset) }, n, fy);
    await conn.query('UPDATE invoice_number_series SET next_number = ?, current_fy = ? WHERE code = ?', [n + 1, fy, code]);
    return number;
  }

  // ───────────────────────── Masters (client & service tax fields) ─────────────────────────

  static async listBillingClients({ search = '' } = {}) {
    const params = [];
    let where = "c.status <> 'offboarded'";
    if (search.trim()) {
      where += ' AND (c.name LIKE ? OR c.company_name LIKE ? OR c.gstin LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.company_name, c.email, c.phone, c.gstin, c.pan, c.address, c.billing_address, c.city,
              c.state, c.state_code, c.pincode, c.payment_terms_days, c.status,
              (SELECT COALESCE(SUM(i.outstanding_balance), 0) FROM invoices i WHERE i.client_id = c.id AND i.status IN ('issued','partially_paid','overdue')) AS outstanding
       FROM clients c WHERE ${where} ORDER BY COALESCE(c.company_name, c.name)`,
      params
    );
    return rows.map((r) => ({ ...r, outstanding: Number(r.outstanding) }));
  }

  static async updateClientBilling(clientId, data, actor, req) {
    const [[client]] = await pool.query('SELECT * FROM clients WHERE id = ?', [clientId]);
    if (!client) throw httpError(404, 'Client not found', 'NOT_FOUND');
    const gstin = data.gstin ? data.gstin.toUpperCase() : null;
    let stateCode = data.stateCode || null;
    if (gstin) {
      stateCode = stateCodeFromGstin(gstin);
      if (!stateCode) throw httpError(400, 'Client GSTIN is not a valid 15-character GSTIN', 'INVALID_GSTIN');
    }
    if (stateCode && !stateByCode(stateCode)) throw httpError(400, 'Unknown state code', 'INVALID_STATE');
    const values = {
      gstin,
      pan: data.pan ? data.pan.toUpperCase() : null,
      billing_address: data.billingAddress ?? client.billing_address,
      city: data.city ?? client.city,
      state_code: stateCode,
      state: stateCode ? stateByCode(stateCode).name : null,
      pincode: data.pincode ?? client.pincode,
      payment_terms_days: data.paymentTermsDays ?? null
    };
    const cols = Object.keys(values);
    await pool.query(`UPDATE clients SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => values[c]), clientId]);
    await audit(actor, 'finance.client_billing.update', 'client', clientId, { gstin: values.gstin, state: values.state }, req);
    const [list] = await pool.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    return (await this.listBillingClients()).find((c) => c.id === list[0].id);
  }

  static async listServiceTaxes() {
    const [rows] = await pool.query(
      `SELECT id, service_code, name, category, sac_code, default_rate, gst_rate, billing_details, status
       FROM services WHERE status <> 'archived' ORDER BY category, name`
    );
    return rows.map((r) => ({ ...r, default_rate: r.default_rate == null ? null : Number(r.default_rate), gst_rate: Number(r.gst_rate) }));
  }

  static async updateServiceTax(serviceId, data, actor, req) {
    const [[svc]] = await pool.query('SELECT id FROM services WHERE id = ?', [serviceId]);
    if (!svc) throw httpError(404, 'Service not found', 'NOT_FOUND');
    await pool.query(
      'UPDATE services SET sac_code = ?, default_rate = ?, gst_rate = ?, billing_details = ? WHERE id = ?',
      [data.sacCode || null, data.defaultRate ?? null, data.gstRate ?? 18, data.billingDetails || null, serviceId]
    );
    await audit(actor, 'finance.service_tax.update', 'service', serviceId, data, req);
    return (await this.listServiceTaxes()).find((s) => s.id === Number(serviceId));
  }

  static async getLookups() {
    const [settings, clients, services, series] = await Promise.all([
      this.getSettings(), this.listBillingClients(), this.listServiceTaxes(), this.listSeries()
    ]);
    return { states: INDIAN_STATES, settings, clients, services, series };
  }

  static async clientProjects(clientId) {
    const [rows] = await pool.query(
      `SELECT id, name, project_code, project_category, cycle_month, billing_amount, status
       FROM projects WHERE client_id = ? AND is_archived = 0
         AND NOT (project_category = 'regular' AND parent_project_id IS NULL)
       ORDER BY created_at DESC LIMIT 100`,
      [clientId]
    );
    return rows;
  }

  // ───────────────────────── GST invoices ─────────────────────────

  static async #resolve(conn, data) {
    const [[client]] = await conn.query('SELECT id, gstin, state_code, payment_terms_days FROM clients WHERE id = ?', [data.clientId]);
    if (!client) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    if (data.invoiceType === 'INC' && !client.gstin) {
      throw httpError(400, 'An INC invoice is for GST-registered clients: add the client\'s GSTIN first', 'CLIENT_GSTIN_REQUIRED');
    }
    const [[settings]] = await conn.query('SELECT * FROM agency_settings WHERE id = 1');
    const placeStateCode = data.placeStateCode || client.state_code || settings.state_code;
    const place = stateByCode(placeStateCode);
    if (!place) throw httpError(400, 'Choose a valid place of supply', 'INVALID_PLACE');

    const ids = [...new Set(data.items.map((i) => i.serviceId).filter(Boolean))];
    const [svcRows] = ids.length ? await conn.query('SELECT id, sac_code, gst_rate FROM services WHERE id IN (?)', [ids]) : [[]];
    const items = data.items.map((it) => {
      const svc = svcRows.find((s) => s.id === Number(it.serviceId));
      return {
        ...it,
        sacCode: it.sacCode || svc?.sac_code || null,
        gstRate: it.gstRate ?? (svc ? Number(svc.gst_rate) : 18)
      };
    });
    const calc = calculateInvoice({ invoiceType: data.invoiceType, placeStateCode: place.code, agencyStateCode: settings.state_code, items });
    const terms = client.payment_terms_days ?? settings.default_payment_terms_days;
    const dueDate = data.dueDate || addDays(data.invoiceDate, terms);
    if (dueDate < data.invoiceDate) throw httpError(400, 'Due date cannot be before the invoice date', 'INVALID_DUE');
    if (data.projectId) {
      const [[p]] = await conn.query('SELECT id FROM projects WHERE id = ? AND client_id = ?', [data.projectId, data.clientId]);
      if (!p) throw httpError(400, 'That project does not belong to this client', 'INVALID_PROJECT');
    }
    return { client, settings, place, calc, dueDate };
  }

  static async #writeItems(conn, invoiceId, lines) {
    await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    let order = 1;
    for (const l of lines) {
      await conn.query(
        `INSERT INTO invoice_items
          (invoice_id, service_master_id, item_description, details, sac_code, quantity, unit_price, discount_percent,
           discount_amount, taxable_amount, tax_rate, cgst_amount, sgst_amount, igst_amount, line_total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId, l.serviceId || null, l.description.trim(), l.details || null, l.sacCode || null, l.quantity, l.unitPrice,
          l.discountPercent, l.discountAmount, l.taxableAmount, l.gstRate, l.cgst, l.sgst, l.igst, l.lineTotal, order++
        ]
      );
    }
  }

  static #headerValues(data, r) {
    return {
      client_id: data.clientId,
      project_id: data.projectId || null,
      invoice_type: data.invoiceType,
      place_of_supply: r.place.name,
      place_state_code: r.place.code,
      supply_type: r.calc.supplyType,
      invoice_date: data.invoiceDate,
      due_date: r.dueDate,
      currency: 'INR',
      subtotal: r.calc.subtotal,
      discount_amount: r.calc.discount,
      taxable_amount: r.calc.taxable,
      tax_rate: 0,
      tax_amount: r.calc.tax,
      cgst_amount: r.calc.cgst,
      sgst_amount: r.calc.sgst,
      igst_amount: r.calc.igst,
      round_off: r.calc.roundOff,
      total_amount: r.calc.total,
      outstanding_balance: r.calc.total,
      payment_terms: data.paymentTerms || null,
      notes: data.notes || null
    };
  }

  static async createDraft(data, actor, req) {
    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const r = await this.#resolve(conn, data);
      const v = this.#headerValues(data, r);
      // Drafts carry a temporary number; the real, gap-free number is assigned when issued.
      const draftNo = `DRAFT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const cols = Object.keys(v);
      const [res] = await conn.query(
        `INSERT INTO invoices (invoice_number, created_by, status, amount_paid, ${cols.join(', ')})
         VALUES (?, ?, 'draft', 0, ${cols.map(() => '?').join(', ')})`,
        [draftNo, actor.id, ...cols.map((c) => v[c])]
      );
      id = res.insertId;
      await this.#writeItems(conn, id, r.calc.lines);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'invoice.draft_create', 'invoice', id, { type: data.invoiceType, clientId: data.clientId }, req);
    if (data.issue) return this.issue(id, actor, req);
    return this.getInvoice(id);
  }

  static async updateDraft(id, data, actor, req) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query('SELECT id, status FROM invoices WHERE id = ? FOR UPDATE', [id]);
      if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
      if (inv.status !== 'draft') throw httpError(409, 'Only draft invoices can be edited; cancel an issued invoice with a credit note instead', 'NOT_DRAFT');
      const r = await this.#resolve(conn, data);
      const v = this.#headerValues(data, r);
      const cols = Object.keys(v);
      await conn.query(`UPDATE invoices SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => v[c]), id]);
      await this.#writeItems(conn, id, r.calc.lines);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'invoice.draft_update', 'invoice', id, null, req);
    if (data.issue) return this.issue(id, actor, req);
    return this.getInvoice(id);
  }

  static async issue(id, actor, req) {
    const conn = await pool.getConnection();
    let number;
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);
      if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
      if (inv.status !== 'draft') throw httpError(409, 'Only draft invoices can be issued', 'NOT_DRAFT');
      if (!inv.invoice_type) throw httpError(409, 'This invoice was created in the old billing screen; issue it there', 'LEGACY_INVOICE');
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id = ?', [id]);
      if (!Number(n)) throw httpError(409, 'Add at least one line before issuing', 'NO_ITEMS');
      number = await this.#takeNumber(conn, inv.invoice_type, String(inv.invoice_date instanceof Date ? inv.invoice_date.toISOString() : inv.invoice_date).slice(0, 10));
      await conn.query("UPDATE invoices SET invoice_number = ?, status = 'issued', issued_at = NOW() WHERE id = ?", [number, id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        throw httpError(409, 'That invoice number already exists. Adjust the next number in Finance settings → Number series.', 'NUMBER_TAKEN');
      }
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'invoice.issue', 'invoice', id, { number }, req);
    return this.getInvoice(id);
  }

  /** Drafts are deleted; issued invoices are cancelled by a credit note (GST rule: no deleting issued invoices). */
  static async cancel(id, reason, actor, req) {
    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);
      if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
      if (inv.status === 'draft') {
        await conn.query('DELETE FROM invoices WHERE id = ?', [id]);
        result = { deleted: true };
      } else {
        if (inv.status === 'void') throw httpError(409, 'This invoice is already cancelled', 'ALREADY_CANCELLED');
        const [[{ paid }]] = await conn.query(
          "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND payment_status = 'completed'",
          [id]
        );
        if (Number(paid) > 0) throw httpError(409, 'This invoice has payments recorded. Refund or reverse them before cancelling.', 'HAS_PAYMENTS');
        const today = new Date().toISOString().slice(0, 10);
        const cn = await this.#takeNumber(conn, 'CN', today);
        await conn.query(
          `INSERT INTO credit_notes (credit_note_number, invoice_id, client_id, note_date, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, reason, issued_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cn, id, inv.client_id, today, inv.taxable_amount, inv.cgst_amount, inv.sgst_amount, inv.igst_amount, inv.total_amount, reason, actor.id]
        );
        await conn.query(
          "UPDATE invoices SET status = 'void', outstanding_balance = 0, cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ? WHERE id = ?",
          [actor.id, reason, id]
        );
        result = { deleted: false, creditNote: cn };
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, result.deleted ? 'invoice.draft_delete' : 'invoice.cancel', 'invoice', id, { reason, ...result }, req);
    return result.deleted ? result : { ...result, invoice: await this.getInvoice(id) };
  }

  /**
   * Copy any invoice (draft, issued, paid or cancelled) into a new draft dated today.
   * Issued invoices are never edited: cancel with a credit note, then duplicate and correct.
   */
  static async duplicate(id, actor, req) {
    const [[inv]] = await pool.query('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
    if (!inv.invoice_type) throw httpError(409, 'Older invoices without GST details cannot be duplicated. Create a new GST invoice instead.', 'LEGACY');
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const doc = await this.createDraft({
      invoiceType: inv.invoice_type, clientId: inv.client_id, projectId: inv.project_id || null, invoiceDate: today, dueDate: null,
      placeStateCode: inv.place_state_code || null, paymentTerms: inv.payment_terms || null, notes: inv.notes || null,
      items: items.map((i) => ({
        serviceId: i.service_master_id || null, description: i.item_description || i.description, details: i.details || null, sacCode: i.sac_code || null,
        quantity: Number(i.quantity), unitPrice: Number(i.unit_price), discountAmount: Number(i.discount_amount || 0), gstRate: Number(i.gst_rate ?? i.tax_rate ?? 0)
      }))
    }, actor, req);
    await AuditService.log({ actorId: actor.id, action: 'invoice.duplicate', entityType: 'invoices', entityId: doc.invoice.id, details: { from: id, fromNumber: inv.invoice_number }, req });
    return doc;
  }

  /**
   * Reverse a payment recorded by mistake (wrong amount, bounced cheque…). The payment stays on record as
   * "reversed" with who/when/why, and the invoice balance and status are recalculated.
   */
  static async reversePayment(invoiceId, paymentId, reason, actor, req) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [invoiceId]);
      if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
      if (inv.status === 'void') throw httpError(409, 'This invoice is cancelled', 'CANCELLED');
      const [[pay]] = await conn.query('SELECT * FROM payments WHERE id = ? AND invoice_id = ? FOR UPDATE', [paymentId, invoiceId]);
      if (!pay) throw httpError(404, 'Payment not found on this invoice', 'NOT_FOUND');
      if (pay.payment_status !== 'completed') throw httpError(409, 'This payment is already reversed', 'ALREADY_REVERSED');
      await conn.query(
        "UPDATE payments SET payment_status = 'reversed', reversed_at = NOW(), reversed_by = ?, reversal_reason = ? WHERE id = ?",
        [actor.id, reason, paymentId]
      );
      const [[{ paid }]] = await conn.query("SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND payment_status = 'completed'", [invoiceId]);
      const amountPaid = round2(paid);
      const balance = round2(Number(inv.total_amount) - amountPaid);
      const status = amountPaid <= 0 ? 'issued' : balance <= 0 ? 'paid' : 'partially_paid';
      await conn.query('UPDATE invoices SET amount_paid = ?, outstanding_balance = ?, status = ? WHERE id = ?', [amountPaid, balance, status, invoiceId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'payment.reverse', entityType: 'payments', entityId: paymentId, details: { invoiceId, reason }, req });
    return this.getInvoice(invoiceId);
  }

  static async getInvoice(id) {
    const [[inv]] = await pool.query(
      `SELECT i.*, c.name AS client_name, c.company_name AS client_company, c.gstin AS client_gstin, c.pan AS client_pan,
              c.billing_address AS client_billing_address, c.address AS client_address, c.city AS client_city,
              c.state AS client_state, c.state_code AS client_state_code, c.pincode AS client_pincode,
              c.email AS client_email, c.phone AS client_phone,
              p.name AS project_name, p.project_code, u.name AS created_by_name, cu.name AS cancelled_by_name,
              (SELECT credit_note_number FROM credit_notes cn WHERE cn.invoice_id = i.id ORDER BY cn.id DESC LIMIT 1) AS credit_note_number
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN users u ON u.id = i.created_by
       LEFT JOIN users cu ON cu.id = i.cancelled_by
       WHERE i.id = ?`,
      [id]
    );
    if (!inv) throw httpError(404, 'Invoice not found', 'NOT_FOUND');
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]);
    const [payments] = await pool.query(
      `SELECT p.id, p.payment_reference, p.amount, p.payment_date, p.payment_method, p.transaction_reference, p.payment_status, p.notes, u.name AS recorded_by_name,
              p.reversed_at, p.reversal_reason, ru.name AS reversed_by_name
       FROM payments p LEFT JOIN users u ON u.id = p.recorded_by LEFT JOIN users ru ON ru.id = p.reversed_by
       WHERE p.invoice_id = ? ORDER BY p.payment_date DESC, p.id DESC`,
      [id]
    );
    return { invoice: inv, items, payments };
  }

  static async listInvoices({ search = '', type = '', status = '', month = '', year = '', clientId = '' } = {}) {
    const where = ['1=1'];
    const params = [];
    if (search.trim()) {
      where.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    if (type === 'legacy') where.push('i.invoice_type IS NULL');
    else if (type) {
      where.push('i.invoice_type = ?');
      params.push(type);
    }
    if (status === 'overdue') {
      where.push("i.status IN ('issued','partially_paid','overdue') AND i.due_date < CURDATE()");
    } else if (status) {
      where.push('i.status = ?');
      params.push(status);
    }
    if (year) {
      where.push('YEAR(i.invoice_date) = ?');
      params.push(Number(year));
    }
    if (month) {
      where.push('MONTH(i.invoice_date) = ?');
      params.push(Number(month));
    }
    if (clientId) {
      where.push('i.client_id = ?');
      params.push(Number(clientId));
    }
    const [rows] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_type, i.status, i.invoice_date, i.due_date, i.place_of_supply, i.supply_type,
              i.taxable_amount, i.tax_amount, i.total_amount, i.amount_paid, i.outstanding_balance, i.project_id,
              c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name, c.gstin AS client_gstin,
              p.name AS project_name,
              (i.status IN ('issued','partially_paid','overdue') AND i.due_date < CURDATE()) AS is_overdue
       FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN projects p ON p.id = i.project_id
       WHERE ${where.join(' AND ')}
       ORDER BY i.invoice_date DESC, i.id DESC`,
      params
    );
    const active = rows.filter((r) => !['void', 'draft'].includes(r.status));
    const sum = (k) => round2(active.reduce((a, r) => a + Number(r[k] || 0), 0));
    return {
      invoices: rows.map((r) => ({ ...r, is_overdue: Boolean(r.is_overdue) })),
      totals: {
        count: rows.length,
        billed: sum('total_amount'),
        collected: sum('amount_paid'),
        outstanding: sum('outstanding_balance'),
        tax: sum('tax_amount'),
        overdue: round2(active.filter((r) => r.is_overdue).reduce((a, r) => a + Number(r.outstanding_balance), 0))
      }
    };
  }
}
