import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { httpError, round2, todayIst, dstr } from './expenses.service.js';

/**
 * Borrowed money: cash the agency borrowed from a person and returns whenever it can, in any amounts.
 * Balance = amount − returns. Paying the balance off settles it; removing a return reopens it.
 */
const audit = (actor, action, id, details, req) =>
  AuditService.log({ actorId: actor.id, action, entityType: 'borrowing', entityId: id, details, req });

const SELECT = `
  SELECT b.*, u.name AS created_by_name,
         COALESCE((SELECT SUM(r.amount) FROM borrowing_repayments r WHERE r.borrowing_id = b.id), 0) AS returned,
         (SELECT MAX(r.paid_on) FROM borrowing_repayments r WHERE r.borrowing_id = b.id) AS last_returned_on,
         (SELECT COUNT(*) FROM borrowing_repayments r WHERE r.borrowing_id = b.id) AS returns_count
  FROM borrowings b LEFT JOIN users u ON u.id = b.created_by`;

function shape(b, today = todayIst()) {
  const amount = Number(b.amount);
  const returned = Number(b.returned || 0);
  const balance = round2(amount - returned);
  const returnBy = b.return_by ? dstr(b.return_by) : null;
  return {
    id: b.id,
    lender_name: b.lender_name,
    lender_phone: b.lender_phone,
    amount,
    returned,
    balance,
    borrowed_on: dstr(b.borrowed_on),
    received_mode: b.received_mode,
    purpose: b.purpose,
    return_by: returnBy,
    overdue: b.status === 'open' && Boolean(returnBy) && returnBy < today && balance > 0,
    status: b.status,
    settled_on: b.settled_on ? dstr(b.settled_on) : null,
    notes: b.notes,
    last_returned_on: b.last_returned_on ? dstr(b.last_returned_on) : null,
    returns_count: Number(b.returns_count || 0),
    created_by_name: b.created_by_name
  };
}

export class BorrowingsService {
  static async list({ status = '', search = '' } = {}) {
    const where = [];
    const params = [];
    if (status === 'open' || status === 'settled') {
      where.push('b.status = ?');
      params.push(status);
    }
    if (search.trim()) {
      where.push('(b.lender_name LIKE ? OR b.purpose LIKE ? OR b.lender_phone LIKE ?)');
      params.push(...Array(3).fill(`%${search.trim()}%`));
    }
    const [rows] = await pool.query(
      `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY b.status = 'open' DESC, COALESCE(b.return_by, '9999-12-31'), b.borrowed_on DESC LIMIT 500`,
      params
    );
    const list = rows.map((r) => shape(r));
    // Totals across everything (not just the filtered list).
    const [[t]] = await pool.query(
      `SELECT COALESCE(SUM(b.amount), 0) AS borrowed,
              COALESCE((SELECT SUM(r.amount) FROM borrowing_repayments r), 0) AS returned,
              COALESCE(SUM(CASE WHEN b.status = 'open' THEN 1 END), 0) AS open_count
       FROM borrowings b`
    );
    const [[o]] = await pool.query(
      `SELECT COUNT(*) AS n FROM borrowings b
       WHERE b.status = 'open' AND b.return_by IS NOT NULL AND b.return_by < ?`,
      [todayIst()]
    );
    // Who we owe, grouped by person (open balances only).
    const byLender = {};
    list
      .filter((b) => b.status === 'open')
      .forEach((b) => {
        const k = b.lender_name.trim().toLowerCase();
        byLender[k] = byLender[k] || { lender_name: b.lender_name, balance: 0, count: 0 };
        byLender[k].balance = round2(byLender[k].balance + b.balance);
        byLender[k].count += 1;
      });
    return {
      totals: {
        borrowed: Number(t.borrowed),
        returned: Number(t.returned),
        outstanding: round2(Number(t.borrowed) - Number(t.returned)),
        open_count: Number(t.open_count),
        overdue_count: Number(o.n)
      },
      lenders: Object.values(byLender).sort((a, b) => b.balance - a.balance),
      borrowings: list
    };
  }

  static async get(id) {
    const [[b]] = await pool.query(`${SELECT} WHERE b.id = ?`, [id]);
    if (!b) throw httpError(404, 'Not found', 'NOT_FOUND');
    const [returns] = await pool.query(
      `SELECT r.id, r.amount, r.paid_on, r.payment_mode, r.reference, r.notes, u.name AS recorded_by
       FROM borrowing_repayments r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.borrowing_id = ? ORDER BY r.paid_on DESC, r.id DESC`,
      [id]
    );
    return {
      borrowing: shape(b),
      returns: returns.map((r) => ({ ...r, amount: Number(r.amount), paid_on: dstr(r.paid_on) }))
    };
  }

  static async create(data, actor, req) {
    const [res] = await pool.query(
      `INSERT INTO borrowings (lender_name, lender_phone, amount, borrowed_on, received_mode, purpose, return_by, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.lenderName.trim(), data.lenderPhone || null, round2(data.amount), data.borrowedOn, data.receivedMode || null,
        data.purpose || null, data.returnBy || null, data.notes || null, actor.id
      ]
    );
    await audit(actor, 'borrowing.create', res.insertId, { lender: data.lenderName, amount: data.amount }, req);
    return this.get(res.insertId);
  }

  static async update(id, data, actor, req) {
    const { borrowing: b } = await this.get(id);
    const amount = round2(data.amount);
    if (amount < b.returned) {
      throw httpError(409, `Already ${b.returned.toLocaleString('en-IN')} returned — the amount can't be less than that`, 'BELOW_RETURNED');
    }
    const settled = amount - b.returned <= 0;
    await pool.query(
      `UPDATE borrowings SET lender_name = ?, lender_phone = ?, amount = ?, borrowed_on = ?, received_mode = ?, purpose = ?,
              return_by = ?, notes = ?, status = ?, settled_on = ? WHERE id = ?`,
      [
        data.lenderName.trim(), data.lenderPhone || null, amount, data.borrowedOn, data.receivedMode || null, data.purpose || null,
        data.returnBy || null, data.notes || null, settled ? 'settled' : 'open', settled ? b.settled_on || todayIst() : null, id
      ]
    );
    await audit(actor, 'borrowing.update', id, { amount }, req);
    return this.get(id);
  }

  static async remove(id, actor, req) {
    const { borrowing: b } = await this.get(id);
    await pool.query('DELETE FROM borrowings WHERE id = ?', [id]);
    await audit(actor, 'borrowing.delete', id, { lender: b.lender_name, amount: b.amount, returned: b.returned }, req);
    return { deleted: true };
  }

  /** Record money given back. Can't exceed what is still owed; paying the rest settles it. */
  static async addReturn(id, data, actor, req) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[b]] = await conn.query('SELECT * FROM borrowings WHERE id = ? FOR UPDATE', [id]);
      if (!b) throw httpError(404, 'Not found', 'NOT_FOUND');
      const [[{ returned }]] = await conn.query('SELECT COALESCE(SUM(amount), 0) AS returned FROM borrowing_repayments WHERE borrowing_id = ?', [id]);
      const balance = round2(Number(b.amount) - Number(returned));
      const amount = round2(data.amount);
      if (balance <= 0) throw httpError(409, 'This is already fully returned', 'ALREADY_SETTLED');
      if (amount > balance) throw httpError(409, `Only ${balance.toLocaleString('en-IN')} is left to return`, 'MORE_THAN_BALANCE');
      if (data.paidOn < dstr(b.borrowed_on)) throw httpError(400, 'The return date is before the money was borrowed', 'BAD_DATE');
      await conn.query(
        `INSERT INTO borrowing_repayments (borrowing_id, amount, paid_on, payment_mode, reference, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, amount, data.paidOn, data.paymentMode || null, data.reference || null, data.notes || null, actor.id]
      );
      if (round2(balance - amount) <= 0) {
        await conn.query("UPDATE borrowings SET status = 'settled', settled_on = ? WHERE id = ?", [data.paidOn, id]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(actor, 'borrowing.return', id, { amount: data.amount, paidOn: data.paidOn }, req);
    return this.get(id);
  }

  /** Remove a wrongly entered return — the borrowing reopens if it was settled. */
  static async removeReturn(returnId, actor, req) {
    const [[r]] = await pool.query('SELECT id, borrowing_id, amount FROM borrowing_repayments WHERE id = ?', [returnId]);
    if (!r) throw httpError(404, 'Not found', 'NOT_FOUND');
    await pool.query('DELETE FROM borrowing_repayments WHERE id = ?', [returnId]);
    await pool.query("UPDATE borrowings SET status = 'open', settled_on = NULL WHERE id = ?", [r.borrowing_id]);
    await audit(actor, 'borrowing.return_removed', r.borrowing_id, { amount: Number(r.amount) }, req);
    return this.get(r.borrowing_id);
  }
}
