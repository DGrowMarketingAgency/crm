import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { istNow } from './shootTime.js';

/** "Full day" is stored as a real time range so it can be compared with shoot times later. */
const FULL_DAY = { start: '06:00', end: '22:00' };
/** Videographers can plan this month and the next two. */
const MONTHS_AHEAD = 2;
/** Next month's availability is due by this day of the current month. */
const DUE_DAY = 25;
const VIDEO_ROLES = ['video-exec', 'freelance-videographer'];

const fail = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

const pad = (n) => String(n).padStart(2, '0');
/** Today in IST (the production server runs in UTC). */
const todayYmd = () => istNow().date;
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const isValidDate = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const perms = (user) => user.permissions || [];
const slugs = (user) => (user.roles || []).map((r) => r.slug);

export class ShootsService {
  static isManager(user) {
    return Boolean(user.isOwner || perms(user).includes('shoots.manage'));
  }

  static canView(user) {
    return Boolean(this.isManager(user) || perms(user).includes('shoots.view'));
  }

  /** The months a videographer may fill in: this month and the next two. */
  static planningWindow() {
    const today = todayYmd();
    const first = today.slice(0, 7);
    return { today, months: Array.from({ length: MONTHS_AHEAD + 1 }, (_, i) => addMonths(first, i)) };
  }

  static async #roleId(slug, db = pool) {
    const [[row]] = await db.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (!row) throw fail(500, `Role ${slug} is missing — restart the server so roles are seeded`);
    return row.id;
  }

  /** Every video-exec / freelance-videographer gets a profile row, so they show up for managers. */
  static async syncProfiles(db = pool) {
    await db.query(
      `INSERT IGNORE INTO videographer_profiles (user_id, kind)
       SELECT ur.user_id, IF(MAX(r.slug = 'freelance-videographer'), 'freelance', 'in_house')
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE r.slug IN (?)
       GROUP BY ur.user_id`,
      [VIDEO_ROLES]
    );
  }

  static async #profile(userId) {
    const [[row]] = await pool.query(
      `SELECT vp.*, u.name, u.email, u.phone, u.status AS user_status
       FROM videographer_profiles vp JOIN users u ON u.id = vp.user_id WHERE vp.user_id = ?`,
      [userId]
    );
    return row || null;
  }

  /**
   * Whose availability this request is about. Videographers edit their own; managers may pass `userId`
   * to fill it in for someone (e.g. an in-house shooter who phoned it in).
   */
  static async #target(actor, userId) {
    const id = Number(userId || actor.id);
    if (id !== Number(actor.id) && !this.isManager(actor)) {
      throw fail(403, 'You can only change your own availability');
    }
    if (id === Number(actor.id)) await this.syncProfiles();
    const profile = await this.#profile(id);
    if (!profile) {
      throw fail(id === Number(actor.id) ? 403 : 404, id === Number(actor.id)
        ? 'Your login is not set up as a videographer yet — ask an admin to add you'
        : 'This person is not set up as a videographer');
    }
    return profile;
  }

  static #checkEditableDate(date, { today, months }) {
    if (!isValidDate(date)) throw fail(400, `${date} is not a real date`);
    if (date < today) throw fail(400, `${date} is in the past — availability can only be changed from today onward`);
    if (!months.includes(date.slice(0, 7))) {
      throw fail(400, `${date} is too far ahead — you can plan up to ${months[months.length - 1]}`);
    }
  }

  static #fmtSlot(r) {
    return {
      id: r.id,
      date: r.d,
      start: r.s,
      end: r.e,
      full_day: Boolean(r.full_day),
      note: r.note || null
    };
  }

  static async #monthSlots(userIds, month) {
    if (!userIds.length) return [];
    const [rows] = await pool.query(
      `SELECT id, user_id, DATE_FORMAT(avail_date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS s,
              TIME_FORMAT(end_time, '%H:%i') AS e, full_day, note
       FROM videographer_availability
       WHERE user_id IN (?) AND avail_date BETWEEN ? AND ?
       ORDER BY avail_date, start_time`,
      [userIds, `${month}-01`, lastDay(month)]
    );
    return rows;
  }

  /** Shoots this person is booked on (optionally one date, optionally only those overlapping a time range). */
  static async #bookedShoots(userId, { from, to, start = null, end = null }) {
    const [rows] = await pool.query(
      `SELECT ss.id, DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS date, TIME_FORMAT(ss.start_time, '%H:%i') AS start,
              TIME_FORMAT(ss.end_time, '%H:%i') AS end, ss.shoot_type, ss.area, ss.title
       FROM shoot_bookings sb JOIN shoot_slots ss ON ss.id = sb.slot_id
       WHERE sb.user_id = ? AND sb.status = 'booked' AND ss.status IN ('open', 'booked', 'completed')
         AND ss.shoot_date BETWEEN ? AND ?
         ${start ? 'AND ss.start_time < ? AND ss.end_time > ?' : ''}
       ORDER BY ss.shoot_date, ss.start_time`,
      start ? [userId, from, to, end, start] : [userId, from, to]
    );
    return rows;
  }

  /** Free time that a booked shoot sits in can't be removed — the videographer has to drop the shoot first. */
  static async #assertNotBooked(userId, date, start, end) {
    const [shoot] = await this.#bookedShoots(userId, { from: date, to: date, start, end });
    if (shoot) {
      throw fail(
        409,
        `You're booked for a shoot ${shoot.start}–${shoot.end} that day — drop the shoot first (My Shoots) before removing this time`,
        'BOOKED_TIME'
      );
    }
  }

  /** My (or, for managers, someone's) availability for one month. */
  static async getAvailability(actor, { month, userId } = {}) {
    const profile = await this.#target(actor, userId);
    const window = this.planningWindow();
    const m = month || window.months[0];
    const rows = await this.#monthSlots([profile.user_id], m);
    const [[status]] = await pool.query(
      "SELECT DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i') AS at FROM videographer_month_status WHERE user_id = ? AND month = ?",
      [profile.user_id, m]
    );
    return {
      videographer: { id: profile.user_id, name: profile.name, kind: profile.kind, is_active: Boolean(profile.is_active) },
      month: m,
      today: window.today,
      months: window.months,
      editable: window.months.includes(m),
      due_date: `${addMonths(m, -1)}-${DUE_DAY}`,
      submitted_at: status?.at || null,
      full_day: FULL_DAY,
      slots: rows.map((r) => this.#fmtSlot(r)),
      shoots: await this.#bookedShoots(profile.user_id, { from: `${m}-01`, to: lastDay(m) })
    };
  }

  /** Add the same free time to one or many dates. Dates where it clashes with an existing range are skipped. */
  static async addAvailability(actor, data, req = null) {
    const profile = await this.#target(actor, data.userId);
    const window = this.planningWindow();
    const dates = [...new Set(data.dates)].sort();
    dates.forEach((d) => this.#checkEditableDate(d, window));
    const start = data.fullDay ? FULL_DAY.start : data.start;
    const end = data.fullDay ? FULL_DAY.end : data.end;

    const [existing] = await pool.query(
      `SELECT DATE_FORMAT(avail_date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS s, TIME_FORMAT(end_time, '%H:%i') AS e
       FROM videographer_availability WHERE user_id = ? AND avail_date IN (?)`,
      [profile.user_id, dates]
    );
    const added = [];
    const skipped = [];
    for (const date of dates) {
      const clash = existing.find((x) => x.d === date && x.s < end && x.e > start);
      if (clash) {
        skipped.push({ date, reason: `already free ${clash.s}–${clash.e} that day` });
        continue;
      }
      added.push([profile.user_id, date, start, end, Boolean(data.fullDay), data.note || null, actor.id]);
    }
    if (added.length) {
      await pool.query(
        `INSERT INTO videographer_availability (user_id, avail_date, start_time, end_time, full_day, note, created_by) VALUES ?`,
        [added]
      );
      await AuditService.log({
        actorId: actor.id,
        action: 'shoots.availability_added',
        entityType: 'user',
        entityId: profile.user_id,
        details: { dates: added.map((a) => a[1]), start, end, fullDay: Boolean(data.fullDay) },
        req
      });
    }
    return { added: added.length, skipped };
  }

  static async #ownedSlot(actor, id) {
    const [[row]] = await pool.query(
      `SELECT id, user_id, DATE_FORMAT(avail_date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS s,
              TIME_FORMAT(end_time, '%H:%i') AS e FROM videographer_availability WHERE id = ?`,
      [id]
    );
    if (!row) throw fail(404, 'That time slot no longer exists');
    await this.#target(actor, row.user_id);
    return row;
  }

  static async removeAvailability(actor, id, req = null) {
    const row = await this.#ownedSlot(actor, id);
    this.#checkEditableDate(row.d, this.planningWindow());
    await this.#assertNotBooked(row.user_id, row.d, row.s, row.e);
    await pool.query('DELETE FROM videographer_availability WHERE id = ?', [id]);
    await AuditService.log({
      actorId: actor.id,
      action: 'shoots.availability_removed',
      entityType: 'user',
      entityId: row.user_id,
      details: { date: row.d },
      req
    });
    return { removed: 1 };
  }

  static async clearDay(actor, { userId, date }, req = null) {
    const profile = await this.#target(actor, userId);
    this.#checkEditableDate(date, this.planningWindow());
    await this.#assertNotBooked(profile.user_id, date, '00:00', '23:59');
    const [res] = await pool.query('DELETE FROM videographer_availability WHERE user_id = ? AND avail_date = ?', [
      profile.user_id,
      date
    ]);
    if (res.affectedRows) {
      await AuditService.log({
        actorId: actor.id,
        action: 'shoots.availability_removed',
        entityType: 'user',
        entityId: profile.user_id,
        details: { date, cleared: res.affectedRows },
        req
      });
    }
    return { removed: res.affectedRows };
  }

  /** "I'm done filling this month" (or undo it). */
  static async submitMonth(actor, { userId, month, done }) {
    const profile = await this.#target(actor, userId);
    if (done) {
      await pool.query(
        `INSERT INTO videographer_month_status (user_id, month, submitted_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE submitted_at = NOW()`,
        [profile.user_id, month]
      );
    } else {
      await pool.query('DELETE FROM videographer_month_status WHERE user_id = ? AND month = ?', [profile.user_id, month]);
    }
    return this.getAvailability(actor, { month, userId: profile.user_id });
  }

  // ── Managers ──────────────────────────────────────────────────────────────

  static #assertView(actor) {
    if (!this.canView(actor)) throw fail(403, 'You do not have access to videographer availability');
  }

  static #assertManage(actor) {
    if (!this.isManager(actor)) throw fail(403, 'Only admins and project managers can manage videographers');
  }

  /** All videographers with their month summary (free days, done or not, invite pending). */
  static async listVideographers(actor, { month } = {}) {
    this.#assertView(actor);
    await this.syncProfiles();
    const m = month || this.planningWindow().months[0];
    const [rows] = await pool.query(
      `SELECT vp.user_id AS id, u.name, u.email, u.phone, u.status AS user_status, vp.kind, vp.rate_amount, vp.rate_unit,
              vp.kit, vp.areas, vp.notes, vp.is_active,
              DATE_FORMAT(ms.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at,
              (SELECT COUNT(DISTINCT va.avail_date) FROM videographer_availability va
                WHERE va.user_id = vp.user_id AND va.avail_date BETWEEN ? AND ?) AS free_days,
              (SELECT COUNT(*) FROM shoot_bookings sb WHERE sb.user_id = vp.user_id AND sb.attendance = 'attended') AS shoots_done,
              (SELECT COUNT(*) FROM shoot_bookings sb WHERE sb.user_id = vp.user_id AND sb.attendance = 'no_show') AS no_shows,
              (SELECT COUNT(*) FROM shoot_bookings sb WHERE sb.user_id = vp.user_id AND sb.status = 'withdrawn') AS dropped
       FROM videographer_profiles vp
       JOIN users u ON u.id = vp.user_id
       LEFT JOIN videographer_month_status ms ON ms.user_id = vp.user_id AND ms.month = ?
       ORDER BY vp.is_active DESC, vp.kind, u.name`,
      [`${m}-01`, lastDay(m), m]
    );
    const isManager = this.isManager(actor);
    return {
      month: m,
      due_date: `${addMonths(m, -1)}-${DUE_DAY}`,
      can_manage: isManager,
      videographers: rows.map((r) => ({
        ...r,
        is_active: Boolean(r.is_active),
        invite_pending: r.user_status === 'inactive',
        free_days: Number(r.free_days || 0),
        shoots_done: Number(r.shoots_done || 0),
        no_shows: Number(r.no_shows || 0),
        dropped: Number(r.dropped || 0),
        // Reliability: share of booked shoots they actually turned up for (drops and no-shows count against).
        reliability: (() => {
          const done = Number(r.shoots_done || 0);
          const total = done + Number(r.no_shows || 0) + Number(r.dropped || 0);
          return total ? Math.round((100 * done) / total) : null;
        })(),
        // Rates are for the people who manage videographers.
        rate_amount: isManager && r.rate_amount != null ? Number(r.rate_amount) : null,
        rate_unit: isManager ? r.rate_unit : null
      }))
    };
  }

  /** Who is free when, for one month — what a manager looks at before fixing a client's shoot day. */
  static async board(actor, { month } = {}) {
    this.#assertView(actor);
    await this.syncProfiles();
    const m = month || this.planningWindow().months[0];
    const [people] = await pool.query(
      `SELECT vp.user_id AS id, u.name, vp.kind, vp.areas,
              DATE_FORMAT(ms.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at
       FROM videographer_profiles vp
       JOIN users u ON u.id = vp.user_id
       LEFT JOIN videographer_month_status ms ON ms.user_id = vp.user_id AND ms.month = ?
       WHERE vp.is_active = TRUE AND u.status = 'active'
       ORDER BY vp.kind, u.name`,
      [m]
    );
    const rows = await this.#monthSlots(people.map((p) => p.id), m);
    return {
      month: m,
      today: todayYmd(),
      due_date: `${addMonths(m, -1)}-${DUE_DAY}`,
      videographers: people,
      slots: rows.map((r) => ({ ...this.#fmtSlot(r), user_id: r.user_id }))
    };
  }

  /** Add a videographer: an existing staff member (in-house) or a new freelancer login (invite link). */
  static async addVideographer(actor, data, req = null) {
    this.#assertManage(actor);
    const profile = [data.rateAmount ?? null, data.rateUnit || 'shoot', data.kit || null, data.areas || null, data.notes || null];

    if (data.kind === 'in_house') {
      const [[u]] = await pool.query(
        `SELECT u.id, u.name, u.status FROM users u
         WHERE u.id = ? AND u.role <> 'client' AND u.client_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM user_roles cur JOIN roles cr ON cr.id = cur.role_id
                           WHERE cur.user_id = u.id AND cr.slug IN ('client', 'freelance-videographer'))`,
        [data.userId]
      );
      if (!u) throw fail(404, 'Pick an active staff member');
      // They need the availability calendar: give them the Video Executive role if no role grants it yet.
      const { resolveUserPermissions } = await import('../../middleware/authorize.js');
      const { permissions, isOwner } = await resolveUserPermissions(u.id);
      if (!isOwner && !permissions.includes('shoots.availability')) {
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)', [
          u.id,
          await this.#roleId('video-exec'),
          actor.id
        ]);
      }
      await pool.query(
        `INSERT INTO videographer_profiles (user_id, kind, rate_amount, rate_unit, kit, areas, notes, is_active, created_by)
         VALUES (?, 'in_house', ?, ?, ?, ?, ?, TRUE, ?)
         ON DUPLICATE KEY UPDATE kind = 'in_house', rate_amount = COALESCE(VALUES(rate_amount), rate_amount), rate_unit = VALUES(rate_unit),
           kit = COALESCE(VALUES(kit), kit), areas = COALESCE(VALUES(areas), areas), notes = COALESCE(VALUES(notes), notes), is_active = TRUE`,
        [u.id, ...profile, actor.id]
      );
      await AuditService.log({
        actorId: actor.id,
        action: 'shoots.videographer_added',
        entityType: 'user',
        entityId: u.id,
        details: { kind: 'in_house' },
        req
      });
      return { id: u.id, name: u.name, kind: 'in_house' };
    }

    // Freelancer: a login with only the freelance-videographer role, activated through the invite link.
    const invitation = await UsersService.createInvitation(
      {
        name: data.name,
        email: data.email,
        phone: data.phone || '',
        department: 'Video',
        designations: ['Freelance Videographer'],
        roleIds: [await this.#roleId('freelance-videographer')]
      },
      actor,
      req
    );
    await pool.query(
      `INSERT INTO videographer_profiles (user_id, kind, rate_amount, rate_unit, kit, areas, notes, is_active, created_by)
       VALUES (?, 'freelance', ?, ?, ?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE kind = 'freelance', rate_amount = COALESCE(VALUES(rate_amount), rate_amount), rate_unit = VALUES(rate_unit),
         kit = COALESCE(VALUES(kit), kit), areas = COALESCE(VALUES(areas), areas), notes = COALESCE(VALUES(notes), notes), is_active = TRUE`,
      [invitation.userId, ...profile, actor.id]
    );
    await AuditService.log({
      actorId: actor.id,
      action: 'shoots.videographer_added',
      entityType: 'user',
      entityId: invitation.userId,
      details: { kind: 'freelance', email: invitation.email },
      req
    });
    return {
      id: invitation.userId,
      name: data.name,
      kind: 'freelance',
      invite_url: invitation.inviteUrl,
      invite_expires_at: invitation.expiresAt
    };
  }

  static async updateVideographer(actor, userId, data, req = null) {
    this.#assertManage(actor);
    const existing = await this.#profile(userId);
    if (!existing) throw fail(404, 'This person is not set up as a videographer');
    const map = { rateAmount: 'rate_amount', rateUnit: 'rate_unit', kit: 'kit', areas: 'areas', notes: 'notes', isActive: 'is_active' };
    const sets = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(data[key] === '' ? null : data[key]);
      }
    }
    if (sets.length) {
      await pool.query(`UPDATE videographer_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
      await AuditService.log({
        actorId: actor.id,
        action: 'shoots.videographer_updated',
        entityType: 'user',
        entityId: Number(userId),
        details: data,
        req
      });
    }
    return this.#profile(userId);
  }

  /** Staff who could be added as in-house videographers (not yet on the list). */
  static async candidateStaff(actor) {
    this.#assertManage(actor);
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.department FROM users u
       WHERE u.status = 'active' AND u.role <> 'client' AND u.client_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_roles cur JOIN roles cr ON cr.id = cur.role_id
                         WHERE cur.user_id = u.id AND cr.slug IN ('client', 'freelance-videographer'))
         AND NOT EXISTS (SELECT 1 FROM videographer_profiles vp WHERE vp.user_id = u.id AND vp.is_active = TRUE)
       ORDER BY (u.department = 'Video') DESC, u.name`
    );
    return rows;
  }
}
