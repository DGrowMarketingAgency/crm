import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export const httpError = (status, message, code = 'BAD_REQUEST') => Object.assign(new Error(message), { status, code });
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
// DATE columns arrive as UTC-midnight Date objects (pool timezone 'Z'), so format in UTC.
export const dstr = (v) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

/** Period → [from, to] (inclusive, IST dates). */
export function periodRange(period = 'month', from, to) {
  const t = todayIst();
  if (period === 'custom' && from && to) return [from, to];
  if (period === 'today') return [t, t];
  if (period === 'week') {
    const d = new Date(`${t}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return [d.toLocaleDateString('en-CA'), t];
  }
  if (period === 'all') return ['2000-01-01', '2999-12-31'];
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    return [`${period}-01`, new Date(y, m, 0).toLocaleDateString('en-CA')];
  }
  return [`${t.slice(0, 7)}-01`, t];
}

const audit = (actor, action, entityType, entityId, details, req) => AuditService.log({ actorId: actor.id, action, entityType, entityId, details, req });

export class ExpensesService {
  /** Pick-lists for the forms: active clients and active staff. */
  static async lookups() {
    const [clients] = await pool.query("SELECT id, COALESCE(company_name, name) AS name FROM clients WHERE status <> 'archived' ORDER BY name");
    const [staff] = await pool.query("SELECT id, name FROM users WHERE status = 'active' AND client_id IS NULL ORDER BY name");
    return { clients, staff };
  }

  // ───────────── categories ─────────────

  static async categories() {
    const [cats] = await pool.query('SELECT id, name, kind, sort_order FROM expense_categories WHERE is_active = 1 ORDER BY sort_order, name');
    const [subs] = await pool.query('SELECT id, category_id, name FROM expense_subcategories WHERE is_active = 1 ORDER BY name');
    return cats.map((c) => ({ ...c, subcategories: subs.filter((s) => s.category_id === c.id) }));
  }

  static async addCategory({ name, kind = 'expense' }, actor, req) {
    const [r] = await pool.query('INSERT INTO expense_categories (name, kind, sort_order) VALUES (?, ?, 900)', [name.trim(), kind]).catch((e) => {
      if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'That category already exists', 'DUPLICATE');
      throw e;
    });
    await audit(actor, 'expense_category.create', 'expense_category', r.insertId, { name }, req);
    return this.categories();
  }

  static async addSubcategory(categoryId, { name }, actor, req) {
    const [[cat]] = await pool.query('SELECT id FROM expense_categories WHERE id = ?', [categoryId]);
    if (!cat) throw httpError(404, 'Category not found', 'NOT_FOUND');
    await pool.query('INSERT INTO expense_subcategories (category_id, name) VALUES (?, ?)', [categoryId, name.trim()]).catch((e) => {
      if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'That sub-category already exists', 'DUPLICATE');
      throw e;
    });
    await audit(actor, 'expense_subcategory.create', 'expense_category', categoryId, { name }, req);
    return this.categories();
  }

  // ───────────── expenses & purchases ─────────────

  static async #assertCategory(categoryId, subcategoryId) {
    const [[c]] = await pool.query('SELECT id, kind FROM expense_categories WHERE id = ?', [categoryId]);
    if (!c) throw httpError(400, 'Choose a category', 'INVALID_CATEGORY');
    if (subcategoryId) {
      const [[s]] = await pool.query('SELECT id FROM expense_subcategories WHERE id = ? AND category_id = ?', [subcategoryId, categoryId]);
      if (!s) throw httpError(400, 'That sub-category belongs to another category', 'INVALID_SUBCATEGORY');
    }
    return c;
  }

  static #values(d) {
    const purchase = Boolean(d.isPurchase);
    const gst = purchase ? round2(d.gstAmount || 0) : null;
    return {
      expense_date: d.expenseDate,
      category_id: d.categoryId,
      subcategory_id: d.subcategoryId || null,
      description: d.description.trim(),
      amount: round2(d.amount),
      payment_mode: d.paymentMode || null,
      status: d.status || 'paid',
      paid_date: (d.status || 'paid') === 'paid' ? d.paidDate || d.expenseDate : null,
      client_id: d.clientId || null,
      payee: d.payee || null,
      reference: d.reference || null,
      is_purchase: purchase,
      vendor_gstin: purchase ? (d.vendorGstin || '').toUpperCase() || null : null,
      bill_number: purchase ? d.billNumber || null : null,
      gst_amount: gst,
      taxable_amount: purchase ? round2(d.amount - (gst || 0)) : null,
      notes: d.notes || null
    };
  }

  static async create(d, actor, req) {
    await this.#assertCategory(d.categoryId, d.subcategoryId);
    if (d.isPurchase && d.gstAmount && Number(d.gstAmount) > Number(d.amount)) throw httpError(400, 'GST cannot be more than the bill amount', 'GST_TOO_HIGH');
    const v = this.#values(d);
    const cols = Object.keys(v);
    const [r] = await pool.query(
      `INSERT INTO expenses (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?)`,
      [...cols.map((c) => v[c]), actor.id]
    );
    await audit(actor, 'expense.create', 'expense', r.insertId, { amount: v.amount }, req);
    return this.get(r.insertId);
  }

  static async update(id, d, actor, req) {
    const cur = await this.get(id);
    if (cur.loan_id) throw httpError(409, 'This is an EMI payment. Change it from EMI & Loans (undo the payment there).', 'FROM_LOAN');
    await this.#assertCategory(d.categoryId, d.subcategoryId);
    const v = this.#values(d);
    const cols = Object.keys(v);
    await pool.query(`UPDATE expenses SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => v[c]), id]);
    await audit(actor, 'expense.update', 'expense', id, { amount: v.amount }, req);
    return this.get(id);
  }

  static async markPaid(id, { paidDate, paymentMode, reference }, actor, req) {
    const cur = await this.get(id);
    if (cur.status === 'paid') throw httpError(409, 'Already paid', 'ALREADY_PAID');
    await pool.query("UPDATE expenses SET status = 'paid', paid_date = ?, payment_mode = COALESCE(?, payment_mode), reference = COALESCE(?, reference) WHERE id = ?",
      [paidDate || todayIst(), paymentMode || null, reference || null, id]);
    await audit(actor, 'expense.paid', 'expense', id, null, req);
    return this.get(id);
  }

  static async remove(id, actor, req) {
    const cur = await this.get(id);
    if (cur.loan_id) throw httpError(409, 'This is an EMI payment. Undo it from EMI & Loans instead.', 'FROM_LOAN');
    await pool.query('DELETE FROM expenses WHERE id = ?', [id]);
    await audit(actor, 'expense.delete', 'expense', id, { description: cur.description, amount: Number(cur.amount) }, req);
    return { deleted: true, id };
  }

  static async get(id) {
    const [[e]] = await pool.query(
      `SELECT e.*, c.name AS category_name, c.kind AS category_kind, s.name AS subcategory_name,
              COALESCE(cl.company_name, cl.name) AS client_name, u.name AS created_by_name
       FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN expense_subcategories s ON s.id = e.subcategory_id
       LEFT JOIN clients cl ON cl.id = e.client_id LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?`,
      [id]
    );
    if (!e) throw httpError(404, 'Expense not found', 'NOT_FOUND');
    return this.#num(e);
  }

  static #num(e) {
    return { ...e, amount: Number(e.amount), gst_amount: e.gst_amount == null ? null : Number(e.gst_amount), taxable_amount: e.taxable_amount == null ? null : Number(e.taxable_amount), is_purchase: Boolean(e.is_purchase), expense_date: dstr(e.expense_date), paid_date: dstr(e.paid_date) };
  }

  static async list({ period = 'month', from, to, categoryId, subcategoryId, clientId, status, purchase, search } = {}) {
    const [start, end] = periodRange(period, from, to);
    const where = ['e.expense_date BETWEEN ? AND ?'];
    const params = [start, end];
    if (categoryId) { where.push('e.category_id = ?'); params.push(Number(categoryId)); }
    if (subcategoryId) { where.push('e.subcategory_id = ?'); params.push(Number(subcategoryId)); }
    if (clientId === 'agency') where.push('e.client_id IS NULL');
    else if (clientId) { where.push('e.client_id = ?'); params.push(Number(clientId)); }
    if (status) { where.push('e.status = ?'); params.push(status); }
    if (purchase === 'true') where.push('e.is_purchase = 1');
    if (search && search.trim()) {
      where.push('(e.description LIKE ? OR e.payee LIKE ? OR e.reference LIKE ? OR e.bill_number LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }
    const W = where.join(' AND ');
    const [rows] = await pool.query(
      `SELECT e.*, c.name AS category_name, c.kind AS category_kind, s.name AS subcategory_name, COALESCE(cl.company_name, cl.name) AS client_name
       FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN expense_subcategories s ON s.id = e.subcategory_id
       LEFT JOIN clients cl ON cl.id = e.client_id
       WHERE ${W} ORDER BY e.expense_date DESC, e.id DESC LIMIT 1000`,
      params
    );
    const [byCat] = await pool.query(
      `SELECT c.id, c.name, c.kind, COUNT(*) AS n, SUM(e.amount) AS total FROM expenses e JOIN expense_categories c ON c.id = e.category_id
       WHERE ${W} GROUP BY c.id, c.name, c.kind ORDER BY total DESC`,
      params
    );
    const [[k]] = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(e.amount), 0) AS total, COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount END), 0) AS paid,
              COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount END), 0) AS pending,
              COALESCE(SUM(CASE WHEN e.is_purchase = 1 THEN e.gst_amount END), 0) AS gst_input,
              COALESCE(SUM(CASE WHEN e.loan_id IS NOT NULL THEN e.amount END), 0) AS emi_paid,
              COALESCE(SUM(CASE WHEN e.client_id IS NOT NULL THEN e.amount END), 0) AS client_related
       FROM expenses e WHERE ${W}`,
      params
    );
    const [[ads]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS spend FROM ad_fund_transactions WHERE txn_type = 'spend' AND txn_date BETWEEN ? AND ?",
      [start, end]
    );
    const num = (o) => Object.fromEntries(Object.entries(o).map(([key, val]) => [key, Number(val || 0)]));
    return {
      range: { from: start, to: end },
      expenses: rows.map((e) => this.#num(e)),
      byCategory: byCat.map((c) => ({ ...c, n: Number(c.n), total: Number(c.total) })),
      totals: { ...num(k), adSpend: Number(ads.spend || 0) }
    };
  }
}
