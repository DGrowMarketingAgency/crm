import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { httpError, round2, todayIst, dstr } from './expenses.service.js';

const audit = (actor, action, id, details, req) => AuditService.log({ actorId: actor.id, action, entityType: 'loan', entityId: id, details, req });
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** Due dates from the first to the last EMI month, on the due day (or the month's last day if shorter). */
export function buildSchedule(firstDue, lastDue, dueDay) {
  const [fy, fm] = firstDue.split('-').map(Number);
  const [ly, lm] = lastDue.split('-').map(Number);
  const out = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? (y += 1, m = 1) : (m += 1)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(dueDay, last)).padStart(2, '0')}`);
    if (out.length > 600) break; // 50 years is plenty
  }
  return out;
}

/**
 * Due state used everywhere (colour on screen, reminders):
 *  paid · overdue (red) · due_today (orange) · due_soon (orange, inside the reminder window) · upcoming
 */
export function dueState(inst, reminderDays, today = todayIst()) {
  if (inst.status === 'paid') return 'paid';
  if (inst.status === 'skipped') return 'skipped';
  const due = dstr(inst.due_date);
  const d = daysBetween(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'due_today';
  if (d <= reminderDays) return 'due_soon';
  return 'upcoming';
}

export class LoansService {
  static async #syncSchedule(conn, loanId) {
    const [[l]] = await conn.query('SELECT * FROM loans WHERE id = ?', [loanId]);
    const dates = buildSchedule(dstr(l.first_due_date), dstr(l.last_due_date), l.due_day);
    const [existing] = await conn.query('SELECT installment_no, status FROM loan_installments WHERE loan_id = ?', [loanId]);
    const paid = new Set(existing.filter((e) => e.status === 'paid').map((e) => e.installment_no));
    for (let i = 0; i < dates.length; i += 1) {
      if (paid.has(i + 1)) continue; // never rewrite a paid EMI
      await conn.query(
        `INSERT INTO loan_installments (loan_id, installment_no, due_date, amount) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE due_date = VALUES(due_date), amount = VALUES(amount)`,
        [loanId, i + 1, dates[i], l.emi_amount]
      );
    }
    await conn.query("DELETE FROM loan_installments WHERE loan_id = ? AND installment_no > ? AND status <> 'paid'", [loanId, dates.length]);
    await this.#refreshStatus(conn, loanId);
  }

  /** A loan closes when every EMI is paid, and reopens if one is undone. */
  static async #refreshStatus(conn, loanId) {
    const [[s]] = await conn.query(
      "SELECT COUNT(*) AS n, SUM(status = 'paid') AS paid FROM loan_installments WHERE loan_id = ?",
      [loanId]
    );
    const done = Number(s.n) > 0 && Number(s.paid) === Number(s.n);
    await conn.query(
      `UPDATE loans SET status = ?, closed_at = ${done ? 'COALESCE(closed_at, NOW())' : 'NULL'} WHERE id = ?`,
      [done ? 'closed' : 'active', loanId]
    );
  }

  static #check(d) {
    if (d.lastDueDate < d.firstDueDate) throw httpError(400, 'The last EMI date must be after the first', 'BAD_DATES');
    if (buildSchedule(d.firstDueDate, d.lastDueDate, d.dueDay).length > 600) throw httpError(400, 'That schedule is too long', 'TOO_LONG');
  }

  static async create(d, actor, req) {
    this.#check(d);
    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO loans (lender, title, loan_type, principal_amount, emi_amount, due_day, first_due_date, last_due_date, payment_mode,
                            account_ref, reminder_days_before, owner_user_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.lender.trim(), d.title.trim(), d.loanType || 'emi', d.principalAmount ?? null, round2(d.emiAmount), d.dueDay, d.firstDueDate, d.lastDueDate,
          d.paymentMode || null, d.accountRef || null, d.reminderDaysBefore ?? 3, d.ownerUserId || actor.id, d.notes || null, actor.id]
      );
      id = r.insertId;
      await this.#syncSchedule(conn, id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'loan.create', id, { lender: d.lender, emi: d.emiAmount }, req);
    return this.get(id);
  }

  static async update(id, d, actor, req) {
    await this.get(id);
    this.#check(d);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE loans SET lender = ?, title = ?, loan_type = ?, principal_amount = ?, emi_amount = ?, due_day = ?, first_due_date = ?, last_due_date = ?,
                          payment_mode = ?, account_ref = ?, reminder_days_before = ?, owner_user_id = ?, notes = ? WHERE id = ?`,
        [d.lender.trim(), d.title.trim(), d.loanType || 'emi', d.principalAmount ?? null, round2(d.emiAmount), d.dueDay, d.firstDueDate, d.lastDueDate,
          d.paymentMode || null, d.accountRef || null, d.reminderDaysBefore ?? 3, d.ownerUserId || actor.id, d.notes || null, id]
      );
      await this.#syncSchedule(conn, id); // unpaid EMIs follow the new amount / dates; paid ones are kept
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'loan.update', id, null, req);
    return this.get(id);
  }

  static async remove(id, actor, req) {
    const { loan } = await this.get(id);
    if (loan.paid_count > 0) throw httpError(409, 'This loan has EMI payments on record. Mark it closed instead, or undo those payments first.', 'HAS_PAYMENTS');
    await pool.query('DELETE FROM loans WHERE id = ?', [id]);
    await audit(actor, 'loan.delete', id, { lender: loan.lender, title: loan.title }, req);
    return { deleted: true, id };
  }

  /** Close early (e.g. foreclosed / prepaid): remaining EMIs are marked skipped. */
  static async close(id, { note }, actor, req) {
    await this.get(id);
    await pool.query("UPDATE loan_installments SET status = 'skipped' WHERE loan_id = ? AND status = 'upcoming'", [id]);
    await pool.query("UPDATE loans SET status = 'closed', closed_at = NOW(), notes = CONCAT_WS('\\n', notes, ?) WHERE id = ?", [note ? `Closed early: ${note}` : 'Closed early', id]);
    await audit(actor, 'loan.close', id, { note }, req);
    return this.get(id);
  }

  static async reopen(id, actor, req) {
    await pool.query("UPDATE loan_installments SET status = 'upcoming' WHERE loan_id = ? AND status = 'skipped'", [id]);
    const conn = await pool.getConnection();
    try { await this.#refreshStatus(conn, id); } finally { conn.release(); }
    await audit(actor, 'loan.reopen', id, null, req);
    return this.get(id);
  }

  /** Pay one EMI: recorded on the schedule and as an expense (EMI & Loans), so expense totals include it. */
  static async pay(installmentId, { paidDate, amount, paymentMode, reference }, actor, req) {
    const conn = await pool.getConnection();
    let loanId;
    try {
      await conn.beginTransaction();
      const [[i]] = await conn.query(
        'SELECT i.*, l.lender, l.title, l.payment_mode AS loan_mode FROM loan_installments i JOIN loans l ON l.id = i.loan_id WHERE i.id = ? FOR UPDATE',
        [installmentId]
      );
      if (!i) throw httpError(404, 'EMI not found', 'NOT_FOUND');
      if (i.status === 'paid') throw httpError(409, 'This EMI is already paid', 'ALREADY_PAID');
      loanId = i.loan_id;
      const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM loan_installments WHERE loan_id = ?', [loanId]);
      const [[cat]] = await conn.query("SELECT id FROM expense_categories WHERE kind = 'emi' ORDER BY sort_order LIMIT 1");
      const paidOn = paidDate || todayIst();
      const amt = round2(amount ?? i.amount);
      const mode = paymentMode || i.loan_mode || null;
      const [e] = await conn.query(
        `INSERT INTO expenses (expense_date, category_id, description, amount, payment_mode, status, paid_date, payee, reference, loan_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`,
        [paidOn, cat.id, `${i.lender} — ${i.title} (EMI ${i.installment_no}/${total})`, amt, mode, paidOn, i.lender, reference || null, loanId, actor.id]
      );
      await conn.query(
        "UPDATE loan_installments SET status = 'paid', paid_date = ?, paid_amount = ?, payment_mode = ?, reference = ?, expense_id = ?, paid_by = ? WHERE id = ?",
        [paidOn, amt, mode, reference || null, e.insertId, actor.id, installmentId]
      );
      await this.#refreshStatus(conn, loanId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await audit(actor, 'loan.emi_paid', loanId, { installmentId }, req);
    return this.get(loanId);
  }

  static async undoPayment(installmentId, actor, req) {
    const conn = await pool.getConnection();
    let loanId;
    try {
      await conn.beginTransaction();
      const [[i]] = await conn.query('SELECT * FROM loan_installments WHERE id = ? FOR UPDATE', [installmentId]);
      if (!i) throw httpError(404, 'EMI not found', 'NOT_FOUND');
      if (i.status !== 'paid') throw httpError(409, 'This EMI is not paid', 'NOT_PAID');
      loanId = i.loan_id;
      await conn.query(
        "UPDATE loan_installments SET status = 'upcoming', paid_date = NULL, paid_amount = NULL, reference = NULL, expense_id = NULL, paid_by = NULL WHERE id = ?",
        [installmentId]
      );
      if (i.expense_id) await conn.query('DELETE FROM expenses WHERE id = ?', [i.expense_id]);
      await this.#refreshStatus(conn, loanId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await audit(actor, 'loan.emi_undo', loanId, { installmentId }, req);
    return this.get(loanId);
  }

  // ───────────── read ─────────────

  static #summarise(l, insts, today) {
    const paid = insts.filter((i) => i.status === 'paid');
    const open = insts.filter((i) => i.status === 'upcoming');
    const next = open[0] || null;
    const remaining = round2(open.reduce((a, i) => a + Number(i.amount), 0));
    const overdue = open.filter((i) => dueState(i, l.reminder_days_before, today) === 'overdue');
    return {
      ...l,
      emi_amount: Number(l.emi_amount),
      principal_amount: l.principal_amount == null ? null : Number(l.principal_amount),
      first_due_date: dstr(l.first_due_date),
      last_due_date: dstr(l.last_due_date),
      total_count: insts.length,
      paid_count: paid.length,
      remaining_count: open.length,
      paid_amount: round2(paid.reduce((a, i) => a + Number(i.paid_amount ?? i.amount), 0)),
      remaining_amount: remaining,
      progress: insts.length ? Math.round((paid.length / insts.length) * 100) : 0,
      overdue_count: overdue.length,
      overdue_amount: round2(overdue.reduce((a, i) => a + Number(i.amount), 0)),
      // Orange "closing soon" band: the last 3 EMIs of the loan.
      final_phase: l.status === 'active' && open.length > 0 && open.length <= 3,
      next_due: next ? { id: next.id, no: next.installment_no, date: dstr(next.due_date), amount: Number(next.amount), state: dueState(next, l.reminder_days_before, today), is_last: open.length === 1 } : null
    };
  }

  static async list({ status = '' } = {}) {
    const today = todayIst();
    const where = status ? 'WHERE l.status = ?' : '';
    const [loans] = await pool.query(
      `SELECT l.*, u.name AS owner_name FROM loans l LEFT JOIN users u ON u.id = l.owner_user_id ${where} ORDER BY l.status, l.due_day, l.lender`,
      status ? [status] : []
    );
    if (!loans.length) return { loans: [], totals: { monthlyEmi: 0, remaining: 0, overdue: 0, active: 0, closed: 0 } };
    const [insts] = await pool.query('SELECT * FROM loan_installments WHERE loan_id IN (?) ORDER BY installment_no', [loans.map((l) => l.id)]);
    const out = loans.map((l) => this.#summarise(l, insts.filter((i) => i.loan_id === l.id), today));
    const active = out.filter((l) => l.status === 'active');
    return {
      loans: out,
      totals: {
        monthlyEmi: round2(active.reduce((a, l) => a + l.emi_amount, 0)),
        remaining: round2(active.reduce((a, l) => a + l.remaining_amount, 0)),
        overdue: round2(out.reduce((a, l) => a + l.overdue_amount, 0)),
        active: active.length,
        closed: out.length - active.length
      }
    };
  }

  static async get(id) {
    const [[l]] = await pool.query('SELECT l.*, u.name AS owner_name FROM loans l LEFT JOIN users u ON u.id = l.owner_user_id WHERE l.id = ?', [id]);
    if (!l) throw httpError(404, 'Loan not found', 'NOT_FOUND');
    const [insts] = await pool.query(
      'SELECT i.*, u.name AS paid_by_name FROM loan_installments i LEFT JOIN users u ON u.id = i.paid_by WHERE i.loan_id = ? ORDER BY i.installment_no',
      [id]
    );
    const today = todayIst();
    return {
      loan: this.#summarise(l, insts, today),
      installments: insts.map((i) => ({
        ...i, amount: Number(i.amount), paid_amount: i.paid_amount == null ? null : Number(i.paid_amount),
        due_date: dstr(i.due_date), paid_date: dstr(i.paid_date), state: dueState(i, l.reminder_days_before, today),
        is_last: i.installment_no === insts.length
      }))
    };
  }

  /** The month's EMI roster plus anything still overdue from earlier months. */
  static async dues({ month } = {}) {
    const today = todayIst();
    const m = /^\d{4}-\d{2}$/.test(month || '') ? month : today.slice(0, 7);
    const [y, mm] = m.split('-').map(Number);
    const from = `${m}-01`;
    const to = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT i.*, l.lender, l.title, l.reminder_days_before, l.payment_mode AS loan_mode, l.status AS loan_status,
              (SELECT COUNT(*) FROM loan_installments x WHERE x.loan_id = i.loan_id) AS total_count
       FROM loan_installments i JOIN loans l ON l.id = i.loan_id
       WHERE (i.due_date BETWEEN ? AND ?) OR (i.status = 'upcoming' AND i.due_date < ? AND l.status = 'active')
       ORDER BY i.due_date, l.lender`,
      [from, to, from]
    );
    const items = rows.filter((r) => r.status !== 'skipped').map((r) => ({
      ...r, amount: Number(r.amount), paid_amount: r.paid_amount == null ? null : Number(r.paid_amount), due_date: dstr(r.due_date), paid_date: dstr(r.paid_date),
      total_count: Number(r.total_count), is_last: r.installment_no === Number(r.total_count), state: dueState(r, r.reminder_days_before, today),
      carried_over: dstr(r.due_date) < from
    }));
    const sum = (f) => round2(items.filter(f).reduce((a, i) => a + i.amount, 0));
    return {
      month: m,
      items,
      totals: {
        due: sum(() => true),
        paid: sum((i) => i.state === 'paid'),
        pending: sum((i) => i.state !== 'paid'),
        overdue: sum((i) => i.state === 'overdue'),
        dueSoon: sum((i) => ['due_today', 'due_soon'].includes(i.state)),
        count: items.length,
        paidCount: items.filter((i) => i.state === 'paid').length,
        overdueCount: items.filter((i) => i.state === 'overdue').length
      }
    };
  }
}
