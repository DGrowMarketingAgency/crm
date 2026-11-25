import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectFlowService } from '../project-flow/projectFlow.service.js';
import { ShootsService } from './shoots.service.js';
import { ShootSlotsService, fmtWhen } from './shootSlots.service.js';
import { hoursUntil, istNow } from './shootTime.js';

/**
 * Phase 4 — after the shoot:
 *  • Footage handoff: the videographer hands in the footage link; if the shoot is linked to the client's video
 *    project, its "Shoot" stage completes and the project moves on to post-production (the editor's stage).
 *  • Payouts: an attended freelancer gets a pending "Client Shoot Expense" for the shoot's pay; the admin marks it
 *    paid (it shows in Expenses & Purchases too). In-house staff are salaried — no payout.
 */
const fail = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

async function notify(userIds, actorId, { type, title, message, slotId, url }) {
  for (const uid of [...new Set(userIds.map(Number))].filter((u) => u && u !== Number(actorId))) {
    try {
      await NotificationsService.createNotification({ recipientUserId: uid, actorUserId: actorId, type, title, message, entityType: 'shoot_slot', entityId: slotId, actionUrl: url });
    } catch (e) {
      console.error('shoot delivery notification failed:', e.message);
    }
  }
}

async function slotRow(id) {
  const [[s]] = await pool.query(
    `SELECT ss.*, DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS d, TIME_FORMAT(ss.start_time, '%H:%i') AS s,
            TIME_FORMAT(ss.end_time, '%H:%i') AS e, COALESCE(c.company_name, c.name) AS client_name
     FROM shoot_slots ss JOIN clients c ON c.id = ss.client_id WHERE ss.id = ?`,
    [id]
  );
  if (!s) throw fail(404, 'That shoot no longer exists');
  return s;
}

async function shootExpenseCategory() {
  const [[row]] = await pool.query(
    `SELECT s.id AS subcategory_id, s.category_id FROM expense_subcategories s
     WHERE s.name = 'Client Shoot Expense' ORDER BY s.id LIMIT 1`
  );
  if (row) return row;
  const [[cat]] = await pool.query("SELECT id FROM expense_categories WHERE name = 'Client-Related Expenses' LIMIT 1");
  if (!cat) throw fail(500, 'Expense category "Client-Related Expenses" is missing — open Finance → Expenses settings');
  return { category_id: cat.id, subcategory_id: null };
}

export class ShootDeliveryService {
  /** Client projects a shoot can feed (newest first; ones with a "Shoot" stage on top). */
  static async clientProjects(actor, clientId) {
    if (!ShootsService.canView(actor)) throw fail(403, 'You do not have access to shoots');
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.status, p.cycle_month,
              (SELECT ps.name FROM project_steps ps WHERE ps.project_id = p.id AND ps.name LIKE '%shoot%' ORDER BY ps.step_order LIMIT 1) AS shoot_stage,
              (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.name LIKE '%shoot%' ORDER BY ps.step_order LIMIT 1) AS shoot_stage_status
       FROM projects p
       WHERE p.client_id = ? AND p.is_archived = 0 AND p.status IN ('planning', 'active', 'on_hold')
       ORDER BY (shoot_stage IS NOT NULL) DESC, p.created_at DESC
       LIMIT 50`,
      [clientId]
    );
    return rows;
  }

  // ── footage ────────────────────────────────────────────────────────────────

  static async submitFootage(actor, slotId, { url, notes }, req = null) {
    const slot = await slotRow(slotId);
    const [[mine]] = await pool.query(
      "SELECT id, footage_url, attendance FROM shoot_bookings WHERE slot_id = ? AND user_id = ? AND status = 'booked'",
      [slotId, actor.id]
    );
    if (!mine) throw fail(404, "You're not on this shoot");
    if (slot.status === 'cancelled') throw fail(409, 'This shoot was cancelled');
    if (hoursUntil(slot.d, slot.s) > 0) throw fail(409, 'You can hand in footage once the shoot has started');
    if (mine.attendance === 'no_show') throw fail(409, 'You were marked as a no-show for this shoot — talk to the admin');

    const [[{ n: before }]] = await pool.query(
      "SELECT COUNT(*) AS n FROM shoot_bookings WHERE slot_id = ? AND status = 'booked' AND footage_url IS NOT NULL",
      [slotId]
    );
    await pool.query('UPDATE shoot_bookings SET footage_url = ?, footage_notes = ?, footage_at = NOW() WHERE id = ?', [url, notes || null, mine.id]);
    // Handing in footage means they were there.
    if (!mine.attendance) await ShootSlotsService.recordAttendance(slot, actor.id, 'attended', actor, req);
    await AuditService.log({ actorId: actor.id, action: 'shoots.footage_submitted', entityType: 'shoot_slot', entityId: Number(slotId), details: { url }, req });

    const handoff = await this.#handoffToProject(slot, actor, url, { firstFootage: !Number(before) });
    await notify([slot.created_by], actor.id, {
      type: 'shoot_footage',
      title: `Footage in: ${slot.title}`,
      message: `${actor.name || 'The videographer'} handed in footage for ${slot.client_name} (${fmtWhen(slot)}).${
        handoff === 'stage_completed' ? ' The project moved on to post-production.' : ''
      }`,
      slotId: slot.id,
      url: '/shoots'
    });
    return { handoff, slot: await ShootSlotsService.getSlot(actor, slotId).catch(() => null) };
  }

  /**
   * If the shoot is linked to a client project: note the footage on its "Shoot" stage, and on the first footage
   * complete that stage's open tasks (with the link) so the project advances to the editor's stage.
   */
  static async #handoffToProject(slot, actor, url, { firstFootage }) {
    if (!slot.project_id) return 'none';
    const [[step]] = await pool.query(
      `SELECT id, status, notes FROM project_steps WHERE project_id = ? AND name LIKE '%shoot%' AND step_type = 'work'
       ORDER BY step_order LIMIT 1`,
      [slot.project_id]
    );
    if (!step) return 'none';
    const line = `Footage (${istNow().date}, ${actor.name || 'videographer'}): ${url}`;
    await pool.query('UPDATE project_steps SET notes = ? WHERE id = ?', [step.notes ? `${step.notes}\n${line}` : line, step.id]);
    if (!firstFootage || step.status !== 'in_progress') return 'noted';
    const [open] = await pool.query(
      "SELECT id FROM tasks WHERE project_step_id = ? AND is_archived = 0 AND status <> 'completed' ORDER BY id",
      [step.id]
    );
    if (!open.length) return 'noted';
    await pool.query(
      `UPDATE tasks SET status = 'completed', column_status = 'done', completed_at = NOW(),
              deliverable_url = COALESCE(deliverable_url, ?) WHERE id IN (?)`,
      [url.slice(0, 1000), open.map((t) => t.id)]
    );
    const advanced = await ProjectFlowService.afterTaskChange(open[open.length - 1].id, actor.id);
    return advanced ? 'stage_completed' : 'noted';
  }

  // ── payouts ────────────────────────────────────────────────────────────────

  /** Pending payout for an attended freelancer (once per booking; needs a pay amount on the shoot). */
  static async ensurePayout(slotId, userId, actor) {
    const [[b]] = await pool.query(
      `SELECT sb.id, sb.expense_id, vp.kind, u.name FROM shoot_bookings sb
       JOIN users u ON u.id = sb.user_id LEFT JOIN videographer_profiles vp ON vp.user_id = sb.user_id
       WHERE sb.slot_id = ? AND sb.user_id = ? AND sb.status = 'booked'`,
      [slotId, userId]
    );
    if (!b || b.expense_id || b.kind !== 'freelance') return null;
    const slot = await slotRow(slotId);
    if (slot.pay_amount == null || Number(slot.pay_amount) <= 0) return null;
    const cat = await shootExpenseCategory();
    const [ins] = await pool.query(
      `INSERT INTO expenses (expense_date, category_id, subcategory_id, description, amount, status, client_id, payee, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        slot.d, cat.category_id, cat.subcategory_id, `Shoot payout — ${b.name}: ${slot.title}`.slice(0, 255), Number(slot.pay_amount),
        slot.client_id, b.name.slice(0, 150), `SHOOT-${slot.id}`, `Freelance videographer payout for the ${slot.shoot_type} shoot on ${slot.d} (${slot.s}–${slot.e}).`,
        actor?.id || slot.created_by
      ]
    );
    await pool.query('UPDATE shoot_bookings SET expense_id = ? WHERE id = ?', [ins.insertId, b.id]);
    return ins.insertId;
  }

  /** A no-show gets no payout: remove the unpaid one; refuse if it was already paid. */
  static async dropPayout(slotId, userId) {
    const [[b]] = await pool.query(
      `SELECT sb.id, sb.expense_id, e.status FROM shoot_bookings sb LEFT JOIN expenses e ON e.id = sb.expense_id
       WHERE sb.slot_id = ? AND sb.user_id = ? AND sb.status = 'booked'`,
      [slotId, userId]
    );
    if (!b?.expense_id) return;
    if (b.status === 'paid') throw fail(409, 'This person was already paid for the shoot — sort it out in Expenses first', 'ALREADY_PAID');
    await pool.query('UPDATE shoot_bookings SET expense_id = NULL WHERE id = ?', [b.id]);
    await pool.query("DELETE FROM expenses WHERE id = ? AND status = 'pending'", [b.expense_id]);
  }

  static #assertManage(actor) {
    if (!ShootsService.isManager(actor)) throw fail(403, 'Only admins and project managers can manage shoot payouts');
  }

  static async listPayouts(actor, { status } = {}) {
    this.#assertManage(actor);
    const [rows] = await pool.query(
      `SELECT sb.id AS booking_id, sb.user_id, u.name, u.phone, ss.id AS slot_id, ss.title, ss.shoot_type,
              DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS date, TIME_FORMAT(ss.start_time, '%H:%i') AS start, TIME_FORMAT(ss.end_time, '%H:%i') AS end,
              COALESCE(c.company_name, c.name) AS client_name, e.id AS expense_id, e.amount, e.status,
              DATE_FORMAT(e.paid_date, '%Y-%m-%d') AS paid_on, e.payment_mode, e.reference, sb.footage_url
       FROM shoot_bookings sb
       JOIN expenses e ON e.id = sb.expense_id
       JOIN shoot_slots ss ON ss.id = sb.slot_id
       JOIN clients c ON c.id = ss.client_id
       JOIN users u ON u.id = sb.user_id
       ${status ? 'WHERE e.status = ?' : ''}
       ORDER BY e.status = 'pending' DESC, ss.shoot_date DESC
       LIMIT 300`,
      status ? [status] : []
    );
    // Totals cover every shoot payout, whatever the list filter.
    const [[t]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount END), 0) AS pending,
              COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount END), 0) AS paid,
              COUNT(CASE WHEN e.status = 'pending' THEN 1 END) AS pending_count
       FROM shoot_bookings sb JOIN expenses e ON e.id = sb.expense_id`
    );
    return {
      totals: { pending: Number(t.pending), paid: Number(t.paid), pending_count: Number(t.pending_count) },
      payouts: rows.map((r) => ({ ...r, amount: Number(r.amount) }))
    };
  }

  static async markPaid(actor, bookingId, { paidDate, paymentMode, reference, amount }, req = null) {
    this.#assertManage(actor);
    const [[b]] = await pool.query(
      `SELECT sb.id, sb.user_id, sb.slot_id, sb.expense_id, e.status, e.amount FROM shoot_bookings sb
       LEFT JOIN expenses e ON e.id = sb.expense_id WHERE sb.id = ?`,
      [bookingId]
    );
    if (!b?.expense_id) throw fail(404, 'No payout for this booking');
    if (b.status === 'paid') throw fail(409, 'Already paid', 'ALREADY_PAID');
    const paid = paidDate || istNow().date;
    const finalAmount = amount != null ? Number(amount) : Number(b.amount);
    await pool.query(
      "UPDATE expenses SET status = 'paid', paid_date = ?, payment_mode = ?, reference = COALESCE(?, reference), amount = ? WHERE id = ?",
      [paid, paymentMode || null, reference || null, finalAmount, b.expense_id]
    );
    await AuditService.log({ actorId: actor.id, action: 'shoots.payout_paid', entityType: 'expense', entityId: b.expense_id, details: { bookingId, amount: finalAmount, paymentMode }, req });
    const slot = await slotRow(b.slot_id);
    await notify([b.user_id], actor.id, {
      type: 'shoot_paid',
      title: `Paid ₹${finalAmount.toLocaleString('en-IN')} for ${slot.title}`,
      message: `Your payout for the shoot on ${fmtWhen(slot)} was paid on ${paid}${paymentMode ? ` via ${paymentMode}` : ''}.`,
      slotId: slot.id,
      url: '/shoots/payments'
    });
    return { paid: true, amount: finalAmount, paid_on: paid };
  }

  /** A videographer's own payment history. */
  static async myPayouts(actor) {
    const [rows] = await pool.query(
      `SELECT ss.id AS slot_id, ss.title, COALESCE(c.company_name, c.name) AS client_name,
              DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS date, e.amount, e.status, DATE_FORMAT(e.paid_date, '%Y-%m-%d') AS paid_on, e.payment_mode
       FROM shoot_bookings sb
       JOIN expenses e ON e.id = sb.expense_id
       JOIN shoot_slots ss ON ss.id = sb.slot_id
       JOIN clients c ON c.id = ss.client_id
       WHERE sb.user_id = ?
       ORDER BY ss.shoot_date DESC LIMIT 200`,
      [actor.id]
    );
    const list = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
    return {
      totals: {
        pending: list.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0),
        paid: list.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
      },
      payouts: list
    };
  }
}
