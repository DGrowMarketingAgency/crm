import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShootsService } from './shoots.service.js';
import { istNow, hoursUntil as hoursUntilIst } from './shootTime.js';

/** A videographer can drop a shoot themselves only this long before it starts; after that the admin decides. */
export const WITHDRAW_HOURS = 48;
export const SHOOT_TYPES = ['Reels', 'Photo', 'Product', 'Event', 'Interview', 'Other'];

const fail = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};
const pad = (n) => String(n).padStart(2, '0');
/** Now in IST — shoot dates/times are agency-local and the production server runs in UTC. */
const nowParts = () => istNow();
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const hoursUntil = (slot) => hoursUntilIst(slot.d, slot.s);
export const fmtWhen = (slot) =>
  `${new Date(`${slot.d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${slot.s}–${slot.e}`;

const SLOT_SELECT = `
  SELECT ss.*, DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS d, TIME_FORMAT(ss.start_time, '%H:%i') AS s,
         TIME_FORMAT(ss.end_time, '%H:%i') AS e, COALESCE(c.company_name, c.name) AS client_name, pj.name AS project_name
  FROM shoot_slots ss JOIN clients c ON c.id = ss.client_id
  LEFT JOIN projects pj ON pj.id = ss.project_id`;

export class ShootSlotsService {
  // ── helpers ────────────────────────────────────────────────────────────────

  static async #slot(id, db = pool, { lock = false } = {}) {
    const [[row]] = await db.query(`${SLOT_SELECT} WHERE ss.id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!row) throw fail(404, 'That shoot no longer exists');
    return row;
  }

  static async #bookings(slotIds, db = pool) {
    if (!slotIds.length) return [];
    const [rows] = await db.query(
      `SELECT sb.id, sb.slot_id, sb.user_id, u.name, u.phone, vp.kind, sb.assigned_by, sb.attendance,
              DATE_FORMAT(sb.booked_at, '%Y-%m-%d %H:%i') AS booked_at,
              sb.footage_url, sb.footage_notes, DATE_FORMAT(sb.footage_at, '%Y-%m-%d %H:%i') AS footage_at,
              sb.expense_id, e.amount AS payout_amount, e.status AS payout_status, DATE_FORMAT(e.paid_date, '%Y-%m-%d') AS payout_paid_on
       FROM shoot_bookings sb JOIN users u ON u.id = sb.user_id
       LEFT JOIN videographer_profiles vp ON vp.user_id = sb.user_id
       LEFT JOIN expenses e ON e.id = sb.expense_id
       WHERE sb.slot_id IN (?) AND sb.status = 'booked' ORDER BY sb.booked_at`,
      [slotIds]
    );
    return rows;
  }

  /** Full view (managers and the booked videographer). */
  static #full(slot, crew) {
    return {
      id: slot.id,
      client_id: slot.client_id,
      client_name: slot.client_name,
      title: slot.title,
      shoot_type: slot.shoot_type,
      date: slot.d,
      start: slot.s,
      end: slot.e,
      area: slot.area,
      address: slot.address,
      map_url: slot.map_url,
      brief: slot.brief,
      pay_amount: slot.pay_amount != null ? Number(slot.pay_amount) : null,
      people_needed: slot.people_needed,
      status: slot.status,
      cancel_reason: slot.cancel_reason,
      calendar_event_id: slot.calendar_event_id,
      project_id: slot.project_id || null,
      project_name: slot.project_name || null,
      crew: crew.map((b) => ({
        user_id: b.user_id,
        name: b.name,
        phone: b.phone,
        kind: b.kind,
        assigned: Boolean(b.assigned_by),
        booked_at: b.booked_at,
        attendance: b.attendance || null,
        footage_url: b.footage_url || null,
        footage_notes: b.footage_notes || null,
        footage_at: b.footage_at || null,
        payout: b.expense_id
          ? { expense_id: b.expense_id, amount: Number(b.payout_amount), status: b.payout_status, paid_on: b.payout_paid_on }
          : null
      })),
      started: hoursUntilIst(slot.d, slot.s) <= 0,
      ended: hoursUntilIst(slot.d, slot.e) <= 0,
      spots_left: Math.max(0, slot.people_needed - crew.length)
    };
  }

  /** What a videographer sees before booking: no client name, address or brief. */
  static #teaser(slot, crewCount) {
    return {
      id: slot.id,
      title: slot.title,
      shoot_type: slot.shoot_type,
      date: slot.d,
      start: slot.s,
      end: slot.e,
      area: slot.area,
      pay_amount: slot.pay_amount != null ? Number(slot.pay_amount) : null,
      people_needed: slot.people_needed,
      spots_left: Math.max(0, slot.people_needed - crewCount)
    };
  }

  /** Active videographers whose marked availability covers the whole shoot and who have no clashing shoot. */
  static async freeFor({ date, start, end, excludeSlotId = 0 }, db = pool) {
    const [rows] = await db.query(
      `SELECT DISTINCT u.id, u.name, vp.kind
       FROM videographer_profiles vp
       JOIN users u ON u.id = vp.user_id AND u.status = 'active'
       JOIN videographer_availability va ON va.user_id = vp.user_id AND va.avail_date = ?
            AND va.start_time <= ? AND va.end_time >= ?
       WHERE vp.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM shoot_bookings sb JOIN shoot_slots s2 ON s2.id = sb.slot_id
           WHERE sb.user_id = vp.user_id AND sb.status = 'booked' AND s2.status IN ('open', 'booked')
             AND s2.id <> ? AND s2.shoot_date = ? AND s2.start_time < ? AND s2.end_time > ?)
       ORDER BY vp.kind, u.name`,
      [date, start, end, excludeSlotId, date, end, start]
    );
    return rows;
  }

  static async #notify(userIds, { actor, type, title, message, slotId, url }) {
    for (const uid of [...new Set(userIds.map(Number))].filter((u) => u && u !== Number(actor?.id))) {
      try {
        await NotificationsService.createNotification({
          recipientUserId: uid,
          actorUserId: actor?.id || null,
          type,
          title,
          message,
          entityType: 'shoot_slot',
          entityId: slotId,
          actionUrl: url
        });
      } catch (e) {
        console.error('shoot notification failed:', e.message);
      }
    }
  }

  static async #tellFree(slot, actor, exceptIds = []) {
    const free = await this.freeFor({ date: slot.d, start: slot.s, end: slot.e, excludeSlotId: slot.id });
    await this.#notify(
      free.map((f) => f.id).filter((id) => !exceptIds.includes(id)),
      {
        actor,
        type: 'shoot_open',
        title: `Shoot open: ${fmtWhen(slot)}`,
        message: `${slot.shoot_type} shoot in ${slot.area}${slot.pay_amount != null ? ` · ₹${Number(slot.pay_amount).toLocaleString('en-IN')}` : ''}. You marked this time as free — first to accept gets it.`,
        slotId: slot.id,
        url: '/shoots/open'
      }
    );
    return free;
  }

  static #assertFuture(slot) {
    const now = nowParts();
    if (slot.d < now.date || (slot.d === now.date && slot.s <= now.time)) throw fail(409, 'This shoot has already started or passed');
  }

  static async #activeProfile(userId, db = pool, { lock = false } = {}) {
    const [[p]] = await db.query(
      `SELECT vp.user_id, vp.is_active, u.status, u.name FROM videographer_profiles vp JOIN users u ON u.id = vp.user_id
       WHERE vp.user_id = ?${lock ? ' FOR UPDATE' : ''}`,
      [userId]
    );
    return p || null;
  }

  /**
   * The booking itself. Locks the videographer's profile row and then the slot row, so two people clicking
   * "Accept" at the same moment are served one after the other: the second sees the slot already full.
   */
  static async #book(slotId, userId, { assignedBy = null } = {}) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const profile = await this.#activeProfile(userId, conn, { lock: true });
      if (!profile || !profile.is_active || profile.status !== 'active') {
        throw fail(assignedBy ? 404 : 403, assignedBy ? 'Pick an active videographer' : 'Your videographer profile is not active — ask an admin');
      }
      const slot = await this.#slot(slotId, conn, { lock: true });
      if (slot.status === 'cancelled') throw fail(409, 'This shoot was cancelled', 'SHOOT_CANCELLED');
      if (slot.status === 'completed') throw fail(409, 'This shoot is already done');
      this.#assertFuture(slot);
      const [crew] = await conn.query("SELECT user_id FROM shoot_bookings WHERE slot_id = ? AND status = 'booked'", [slotId]);
      if (crew.some((c) => Number(c.user_id) === Number(userId))) {
        throw fail(409, assignedBy ? `${profile.name} is already on this shoot` : 'You already have this shoot', 'ALREADY_BOOKED');
      }
      if (crew.length >= slot.people_needed) {
        throw fail(409, 'Already taken — someone else accepted this shoot first', 'SHOOT_TAKEN');
      }
      const [[clash]] = await conn.query(
        `SELECT s2.id, TIME_FORMAT(s2.start_time, '%H:%i') AS s, TIME_FORMAT(s2.end_time, '%H:%i') AS e
         FROM shoot_bookings sb JOIN shoot_slots s2 ON s2.id = sb.slot_id
         WHERE sb.user_id = ? AND sb.status = 'booked' AND s2.status IN ('open', 'booked')
           AND s2.shoot_date = ? AND s2.start_time < ? AND s2.end_time > ? LIMIT 1`,
        [userId, slot.d, slot.e, slot.s]
      );
      if (clash) {
        throw fail(
          409,
          assignedBy
            ? `${profile.name} already has a shoot ${clash.s}–${clash.e} that day`
            : `You already have a shoot ${clash.s}–${clash.e} that day`,
          'SHOOT_CLASH'
        );
      }
      await conn.query(
        "INSERT INTO shoot_bookings (slot_id, user_id, status, assigned_by, booked_at) VALUES (?, ?, 'booked', ?, NOW())",
        [slotId, userId, assignedBy]
      );
      const full = crew.length + 1 >= slot.people_needed;
      if (full) await conn.query("UPDATE shoot_slots SET status = 'booked' WHERE id = ?", [slotId]);
      if (slot.calendar_event_id && !crew.length) {
        await conn.query('UPDATE calendar_events SET assigned_to = ? WHERE id = ?', [userId, slot.calendar_event_id]);
      }
      await conn.commit();
      return { slot: { ...slot, status: full ? 'booked' : slot.status }, profile };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /** Ends a booking (withdrawn by the videographer or removed by a manager) and reopens the slot. */
  static async #endBooking(slotId, userId, status, reason, db) {
    const [res] = await db.query(
      "UPDATE shoot_bookings SET status = ?, ended_at = NOW(), end_reason = ? WHERE slot_id = ? AND user_id = ? AND status = 'booked'",
      [status, reason || null, slotId, userId]
    );
    if (!res.affectedRows) throw fail(404, 'That person is not on this shoot');
    await db.query("UPDATE shoot_slots SET status = 'open' WHERE id = ? AND status = 'booked'", [slotId]);
    const [[next]] = await db.query(
      "SELECT user_id FROM shoot_bookings WHERE slot_id = ? AND status = 'booked' ORDER BY booked_at LIMIT 1",
      [slotId]
    );
    await db.query(
      'UPDATE calendar_events ce JOIN shoot_slots ss ON ss.calendar_event_id = ce.id SET ce.assigned_to = ? WHERE ss.id = ?',
      [next?.user_id || null, slotId]
    );
  }

  static async #assertClientProject(projectId, clientId) {
    const [[p]] = await pool.query('SELECT id FROM projects WHERE id = ? AND client_id = ?', [projectId, clientId]);
    if (!p) throw fail(400, "That project doesn't belong to this client");
  }

  static #assertManage(actor) {
    if (!ShootsService.isManager(actor)) throw fail(403, 'Only admins and project managers can manage shoots');
  }

  // ── managers ───────────────────────────────────────────────────────────────

  static async listSlots(actor, { month, status } = {}) {
    if (!ShootsService.canView(actor)) throw fail(403, 'You do not have access to shoots');
    const m = month || nowParts().date.slice(0, 7);
    const where = ['ss.shoot_date BETWEEN ? AND ?'];
    const params = [`${m}-01`, lastDay(m)];
    if (status) {
      where.push('ss.status = ?');
      params.push(status);
    }
    const [rows] = await pool.query(`${SLOT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ss.shoot_date, ss.start_time`, params);
    const crew = await this.#bookings(rows.map((r) => r.id));
    const canSeePay = ShootsService.isManager(actor);
    return {
      month: m,
      can_manage: canSeePay,
      shoot_types: SHOOT_TYPES,
      slots: rows.map((r) => {
        const s = this.#full(r, crew.filter((c) => c.slot_id === r.id));
        if (!canSeePay) s.pay_amount = null;
        return s;
      })
    };
  }

  static async getSlot(actor, id) {
    const slot = await this.#slot(id);
    const crew = await this.#bookings([slot.id]);
    const mine = crew.some((c) => Number(c.user_id) === Number(actor.id));
    if (!ShootsService.canView(actor) && !mine) throw fail(403, 'You can only see shoots you are on');
    const full = this.#full(slot, crew);
    return {
      ...full,
      free_now: ShootsService.isManager(actor) && slot.status === 'open' ? await this.freeFor({ date: slot.d, start: slot.s, end: slot.e, excludeSlotId: slot.id }) : undefined
    };
  }

  /** Who could take a shoot at this date/time (used live in the "New shoot" form). */
  static async whoIsFree(actor, { date, start, end }) {
    if (!ShootsService.canView(actor)) throw fail(403, 'You do not have access to shoots');
    return this.freeFor({ date, start, end });
  }

  static async createSlot(actor, data, req = null) {
    this.#assertManage(actor);
    return this.postSlot(actor, data, req);
  }

  /**
   * Posts a slot without the manager check — callers decide who may (createSlot for managers; a client picking
   * one of the proposed dates posts it on behalf of the team member who proposed them).
   */
  static async postSlot(actor, data, req = null) {
    const [[client]] = await pool.query("SELECT id, COALESCE(company_name, name) AS name FROM clients WHERE id = ?", [data.clientId]);
    if (!client) throw fail(404, 'Client not found');
    if (data.projectId) await this.#assertClientProject(data.projectId, data.clientId);
    const now = nowParts();
    if (data.date < now.date || (data.date === now.date && data.start <= now.time)) throw fail(400, 'The shoot date and time must be in the future');

    const conn = await pool.getConnection();
    let slotId;
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO shoot_slots (client_id, project_id, title, shoot_type, shoot_date, start_time, end_time, area, address, map_url, brief,
                                  pay_amount, people_needed, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        [
          data.clientId, data.projectId || null, data.title, data.shootType, data.date, data.start, data.end, data.area, data.address || null,
          data.mapUrl || null, data.brief || null, data.payAmount ?? null, data.peopleNeeded, actor.id
        ]
      );
      slotId = ins.insertId;
      // The shoot also goes on the client's content calendar (and the client portal unless hidden).
      const [ev] = await conn.query(
        `INSERT INTO calendar_events (client_id, title, description, event_type, event_category, event_date, start_time, end_time,
                                      is_all_day, department, status, priority, is_client_visible, created_by)
         VALUES (?, ?, ?, 'Video Shoot', 'content_production', ?, ?, ?, 0, 'Video', 'planned', 'high', ?, ?)`,
        [data.clientId, `Video shoot — ${data.title}`, `${data.shootType} shoot · ${data.area}`, data.date, data.start, data.end,
          data.clientVisible !== false, actor.id]
      );
      await conn.query('UPDATE shoot_slots SET calendar_event_id = ? WHERE id = ?', [ev.insertId, slotId]);
      await AuditService.log({
        db: conn,
        actorId: actor.id,
        action: 'shoots.slot_created',
        entityType: 'shoot_slot',
        entityId: slotId,
        details: { clientId: data.clientId, date: data.date, start: data.start, end: data.end },
        req
      });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    const slot = await this.#slot(slotId);
    const notified = await this.#tellFree(slot, actor);
    return { ...this.#full(slot, []), notified: notified.map((n) => ({ id: n.id, name: n.name, kind: n.kind })) };
  }

  static async updateSlot(actor, id, data, req = null) {
    this.#assertManage(actor);
    const slot = await this.#slot(id);
    if (['cancelled', 'completed'].includes(slot.status)) throw fail(409, `This shoot is ${slot.status} and can't be edited`);
    const crew = await this.#bookings([slot.id]);
    const moving =
      (data.date && data.date !== slot.d) || (data.start && data.start !== slot.s) || (data.end && data.end !== slot.e);
    if (moving && crew.length) {
      throw fail(409, 'Someone is booked on this shoot — remove them before changing the date or time, then reopen it');
    }
    if (data.peopleNeeded != null && data.peopleNeeded < crew.length) {
      throw fail(409, `${crew.length} people are already booked — remove someone first`);
    }
    const next = { date: data.date || slot.d, start: data.start || slot.s, end: data.end || slot.e };
    if (next.start >= next.end) throw fail(400, 'End time must be after the start time');
    if (moving) {
      const now = nowParts();
      if (next.date < now.date || (next.date === now.date && next.start <= now.time)) throw fail(400, 'The shoot date and time must be in the future');
    }
    const map = {
      title: 'title', shootType: 'shoot_type', date: 'shoot_date', start: 'start_time', end: 'end_time', area: 'area',
      address: 'address', mapUrl: 'map_url', brief: 'brief', payAmount: 'pay_amount', peopleNeeded: 'people_needed',
      projectId: 'project_id'
    };
    if (data.projectId) await this.#assertClientProject(data.projectId, slot.client_id);
    const sets = [];
    const params = [];
    for (const [k, col] of Object.entries(map)) {
      if (data[k] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(data[k] === '' ? null : data[k]);
      }
    }
    if (data.peopleNeeded != null) {
      sets.push('status = ?');
      params.push(crew.length >= data.peopleNeeded ? 'booked' : 'open');
    }
    if (sets.length) await pool.query(`UPDATE shoot_slots SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (slot.calendar_event_id) {
      const u = await this.#slot(id);
      await pool.query(
        'UPDATE calendar_events SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ? WHERE id = ?',
        [`Video shoot — ${u.title}`, `${u.shoot_type} shoot · ${u.area}`, u.d, u.s, u.e, slot.calendar_event_id]
      );
    }
    await AuditService.log({ actorId: actor.id, action: 'shoots.slot_updated', entityType: 'shoot_slot', entityId: Number(id), details: data, req });
    const updated = await this.#slot(id);
    if (moving && updated.status === 'open') await this.#tellFree(updated, actor);
    return this.#full(updated, await this.#bookings([updated.id]));
  }

  static async cancelSlot(actor, id, { reason }, req = null) {
    this.#assertManage(actor);
    const slot = await this.#slot(id);
    if (slot.status === 'cancelled') throw fail(409, 'Already cancelled');
    if (slot.status === 'completed') throw fail(409, 'This shoot is already done');
    const crew = await this.#bookings([slot.id]);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE shoot_slots SET status = 'cancelled', cancel_reason = ? WHERE id = ?", [reason || null, id]);
      await conn.query(
        "UPDATE shoot_bookings SET status = 'removed', ended_at = NOW(), end_reason = 'shoot cancelled' WHERE slot_id = ? AND status = 'booked'",
        [id]
      );
      if (slot.calendar_event_id) await conn.query("UPDATE calendar_events SET status = 'cancelled' WHERE id = ?", [slot.calendar_event_id]);
      await AuditService.log({ db: conn, actorId: actor.id, action: 'shoots.slot_cancelled', entityType: 'shoot_slot', entityId: Number(id), details: { reason }, req });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await this.#notify(crew.map((c) => c.user_id), {
      actor,
      type: 'shoot_cancelled',
      title: `Shoot cancelled: ${fmtWhen(slot)}`,
      message: `The ${slot.shoot_type} shoot in ${slot.area} is cancelled${reason ? `: ${reason}` : ''}. You're free that time again.`,
      slotId: slot.id,
      url: '/shoots/mine'
    });
    return { cancelled: true };
  }

  static async assign(actor, id, userId, req = null) {
    this.#assertManage(actor);
    const { slot, profile } = await this.#book(id, userId, { assignedBy: actor.id });
    await AuditService.log({ actorId: actor.id, action: 'shoots.assigned', entityType: 'shoot_slot', entityId: Number(id), details: { userId }, req });
    await this.#notify([userId], {
      actor,
      type: 'shoot_assigned',
      title: `You're booked: ${fmtWhen(slot)}`,
      message: `${slot.shoot_type} shoot for ${slot.client_name} in ${slot.area}. Open My Shoots for the address and brief.`,
      slotId: slot.id,
      url: '/shoots/mine'
    });
    return { ...(await this.getSlot(actor, id)), booked_user: profile.name };
  }

  static async unassign(actor, id, userId, { reason } = {}, req = null) {
    this.#assertManage(actor);
    const slot = await this.#slot(id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.#endBooking(id, userId, 'removed', reason, conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'shoots.unassigned', entityType: 'shoot_slot', entityId: Number(id), details: { userId, reason }, req });
    await this.#notify([userId], {
      actor,
      type: 'shoot_removed',
      title: `Taken off a shoot: ${fmtWhen(slot)}`,
      message: `You're no longer on the ${slot.shoot_type} shoot in ${slot.area}${reason ? `: ${reason}` : ''}.`,
      slotId: slot.id,
      url: '/shoots/mine'
    });
    const after = await this.#slot(id);
    if (after.status === 'open' && hoursUntil(after) > 0) await this.#tellFree(after, actor, [Number(userId)]);
    return this.getSlot(actor, id);
  }

  /**
   * After the shoot: mark each booked person attended or no-show. When everyone is marked, the shoot is done.
   * No-shows count against the videographer (shown on the Videographers list).
   */
  static async markAttendance(actor, id, { userId, attendance }, req = null) {
    this.#assertManage(actor);
    const slot = await this.#slot(id);
    if (slot.status === 'cancelled') throw fail(409, 'This shoot was cancelled');
    if (hoursUntilIst(slot.d, slot.e) > 0) throw fail(409, 'You can mark attendance once the shoot has ended');
    await this.recordAttendance(slot, userId, attendance, actor, req);
    return this.getSlot(actor, id);
  }

  /**
   * Shared by "mark attendance" (manager) and "hand in footage" (videographer, which means they attended).
   * Attended freelancers get a pending payout; a no-show removes an unpaid one.
   */
  static async recordAttendance(slot, userId, attendance, actor, req = null) {
    const id = slot.id;
    const { ShootDeliveryService } = await import('./shootDelivery.service.js');
    if (attendance === 'no_show') await ShootDeliveryService.dropPayout(id, userId); // refuses if already paid
    const [res] = await pool.query(
      "UPDATE shoot_bookings SET attendance = ?, attendance_by = ?, attendance_at = NOW() WHERE slot_id = ? AND user_id = ? AND status = 'booked'",
      [attendance, actor.id, id, userId]
    );
    if (!res.affectedRows) throw fail(404, 'That person is not on this shoot');
    const [[left]] = await pool.query(
      "SELECT COUNT(*) AS n FROM shoot_bookings WHERE slot_id = ? AND status = 'booked' AND attendance IS NULL",
      [id]
    );
    if (!Number(left.n)) {
      await pool.query("UPDATE shoot_slots SET status = 'completed' WHERE id = ?", [id]);
      if (slot.calendar_event_id) await pool.query("UPDATE calendar_events SET status = 'completed' WHERE id = ?", [slot.calendar_event_id]);
    }
    await AuditService.log({ actorId: actor.id, action: 'shoots.attendance', entityType: 'shoot_slot', entityId: Number(id), details: { userId, attendance }, req });
    if (attendance === 'no_show') {
      await this.#notify([userId], {
        actor,
        type: 'shoot_no_show',
        title: `Marked as no-show: ${fmtWhen(slot)}`,
        message: `You were marked as not showing up for the ${slot.shoot_type} shoot in ${slot.area}. Talk to the admin if this is wrong.`,
        slotId: slot.id,
        url: '/shoots/mine'
      });
    } else {
      await ShootDeliveryService.ensurePayout(id, userId, actor);
    }
  }

  // ── videographers ──────────────────────────────────────────────────────────

  /** Open shoots from now on, the ones that fit my marked availability first. Client details stay hidden. */
  static async openSlots(actor) {
    const profile = await this.#activeProfile(actor.id);
    if (!profile) throw fail(403, 'Your login is not set up as a videographer yet — ask an admin to add you');
    const now = nowParts();
    const [rows] = await pool.query(
      `${SLOT_SELECT}
       WHERE ss.status = 'open' AND (ss.shoot_date > ? OR (ss.shoot_date = ? AND ss.start_time > ?))
         AND NOT EXISTS (SELECT 1 FROM shoot_bookings sb WHERE sb.slot_id = ss.id AND sb.user_id = ? AND sb.status = 'booked')
       ORDER BY ss.shoot_date, ss.start_time`,
      [now.date, now.date, now.time, actor.id]
    );
    const ids = rows.map((r) => r.id);
    const crew = await this.#bookings(ids);
    const dates = [...new Set(rows.map((r) => r.d))];
    const [avail] = dates.length
      ? await pool.query(
          `SELECT DATE_FORMAT(avail_date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS s, TIME_FORMAT(end_time, '%H:%i') AS e
           FROM videographer_availability WHERE user_id = ? AND avail_date IN (?)`,
          [actor.id, dates]
        )
      : [[]];
    const [mine] = dates.length
      ? await pool.query(
          `SELECT DATE_FORMAT(s2.shoot_date, '%Y-%m-%d') AS d, TIME_FORMAT(s2.start_time, '%H:%i') AS s, TIME_FORMAT(s2.end_time, '%H:%i') AS e
           FROM shoot_bookings sb JOIN shoot_slots s2 ON s2.id = sb.slot_id
           WHERE sb.user_id = ? AND sb.status = 'booked' AND s2.status IN ('open', 'booked') AND s2.shoot_date IN (?)`,
          [actor.id, dates]
        )
      : [[]];
    const list = rows.map((r) => ({
      ...this.#teaser(r, crew.filter((c) => c.slot_id === r.id).length),
      fits: avail.some((a) => a.d === r.d && a.s <= r.s && a.e >= r.e),
      clash: mine.some((m) => m.d === r.d && m.s < r.e && m.e > r.s)
    }));
    list.sort((a, b) => Number(a.clash) - Number(b.clash) || Number(b.fits) - Number(a.fits) || (a.date + a.start).localeCompare(b.date + b.start));
    return { active: Boolean(profile.is_active), slots: list };
  }

  /** My booked shoots with full details (client, address, map, brief, crew). */
  static async mySlots(actor, { scope = 'upcoming' } = {}) {
    const now = nowParts();
    const [rows] = await pool.query(
      `${SLOT_SELECT}
       JOIN shoot_bookings mb ON mb.slot_id = ss.id AND mb.user_id = ? AND mb.status = 'booked'
       WHERE ss.status IN ('open', 'booked', 'completed') AND ss.shoot_date ${scope === 'past' ? '<' : '>='} ?
       ORDER BY ss.shoot_date ${scope === 'past' ? 'DESC' : 'ASC'}, ss.start_time
       LIMIT 200`,
      [actor.id, now.date]
    );
    const crew = await this.#bookings(rows.map((r) => r.id));
    return {
      withdraw_hours: WITHDRAW_HOURS,
      slots: rows.map((r) => ({
        ...this.#full(r, crew.filter((c) => c.slot_id === r.id)),
        can_withdraw: hoursUntil(r) >= WITHDRAW_HOURS
      }))
    };
  }

  static async accept(actor, id, req = null) {
    const { slot } = await this.#book(id, actor.id);
    await AuditService.log({ actorId: actor.id, action: 'shoots.accepted', entityType: 'shoot_slot', entityId: Number(id), details: {}, req });
    await this.#notify([slot.created_by], {
      actor,
      type: 'shoot_booked',
      title: `Shoot booked: ${fmtWhen(slot)}`,
      message: `${actor.name || 'A videographer'} took the ${slot.shoot_type} shoot for ${slot.client_name} in ${slot.area}.`,
      slotId: slot.id,
      url: '/shoots?tab=shoots'
    });
    const crew = await this.#bookings([slot.id]);
    return { ...this.#full(await this.#slot(id), crew), can_withdraw: hoursUntil(slot) >= WITHDRAW_HOURS };
  }

  static async withdraw(actor, id, { reason } = {}, req = null) {
    const slot = await this.#slot(id);
    const crew = await this.#bookings([slot.id]);
    if (!crew.some((c) => Number(c.user_id) === Number(actor.id))) throw fail(404, "You're not on this shoot");
    if (hoursUntil(slot) < WITHDRAW_HOURS) {
      throw fail(409, `Less than ${WITHDRAW_HOURS} hours to the shoot — call the admin if you can't make it`, 'TOO_LATE_TO_WITHDRAW');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.#endBooking(id, actor.id, 'withdrawn', reason, conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'shoots.withdrawn', entityType: 'shoot_slot', entityId: Number(id), details: { reason }, req });
    await this.#notify([slot.created_by], {
      actor,
      type: 'shoot_withdrawn',
      title: `Videographer dropped a shoot: ${fmtWhen(slot)}`,
      message: `${actor.name || 'A videographer'} can't do the ${slot.shoot_type} shoot for ${slot.client_name}${reason ? ` (${reason})` : ''}. It's open again.`,
      slotId: slot.id,
      url: '/shoots?tab=shoots'
    });
    const after = await this.#slot(id);
    if (after.status === 'open') await this.#tellFree(after, actor, [Number(actor.id)]);
    return { withdrawn: true };
  }
}
