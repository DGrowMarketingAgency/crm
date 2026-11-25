import { pool } from '../../config/db.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { fmtWhen } from './shootSlots.service.js';
import { istNow, hoursUntil } from './shootTime.js';

/** Records a reminder; true only the first time, so nobody is reminded twice. */
async function claim(kind, refId, userId, periodKey = '') {
  const [r] = await pool.query(
    'INSERT IGNORE INTO shoot_reminder_log (kind, ref_id, user_id, period_key) VALUES (?, ?, ?, ?)',
    [kind, refId, userId, periodKey]
  );
  return r.affectedRows === 1;
}

async function send(userId, { type, title, message, entityType = 'shoot_slot', entityId = 0, url }) {
  try {
    await NotificationsService.createNotification({ recipientUserId: userId, type, title, message, entityType, entityId, actionUrl: url });
    return 1;
  } catch (e) {
    console.error('shoot reminder failed:', e.message);
    return 0;
  }
}

const addMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const longMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Runs every few minutes (all times IST):
 *  • booked videographers: "shoot tomorrow" (within 24h) and "shoot in 2 hours"
 *  • whoever posted a shoot: still unfilled 48h before; and "mark attendance" once it has ended
 *  • videographers: next month's availability is due — on the 20th and the 24th, from 9 AM, if not marked done
 */
export class ShootRemindersService {
  static AVAILABILITY_REMINDER_DAYS = [20, 24];
  static AVAILABILITY_REMINDER_HOUR = 9;

  static async run(now = new Date()) {
    const shoots = await this.shootReminders(now);
    const availability = await this.availabilityReminders(now);
    return { sent: shoots + availability, shoots, availability };
  }

  static async shootReminders(now) {
    const today = istNow(now).date;
    // Shoots from yesterday (attendance reminders) to two days ahead (unfilled alerts).
    const [slots] = await pool.query(
      `SELECT ss.id, ss.title, ss.shoot_type, ss.area, ss.address, ss.status, ss.people_needed, ss.created_by,
              DATE_FORMAT(ss.shoot_date, '%Y-%m-%d') AS d, TIME_FORMAT(ss.start_time, '%H:%i') AS s, TIME_FORMAT(ss.end_time, '%H:%i') AS e,
              COALESCE(c.company_name, c.name) AS client_name
       FROM shoot_slots ss JOIN clients c ON c.id = ss.client_id
       WHERE ss.status IN ('open', 'booked') AND ss.shoot_date BETWEEN ? - INTERVAL 1 DAY AND ? + INTERVAL 3 DAY`,
      [today, today]
    );
    if (!slots.length) return 0;
    const [crew] = await pool.query(
      `SELECT slot_id, user_id, attendance FROM shoot_bookings WHERE status = 'booked' AND slot_id IN (?)`,
      [slots.map((s) => s.id)]
    );
    let sent = 0;
    for (const s of slots) {
      const toStart = hoursUntil(s.d, s.s, now);
      const toEnd = hoursUntil(s.d, s.e, now);
      const people = crew.filter((c) => c.slot_id === s.id);

      for (const p of people) {
        if (toStart > 0 && toStart <= 2) {
          if (await claim('shoot_2h', s.id, p.user_id)) {
            sent += await send(p.user_id, {
              type: 'shoot_reminder',
              title: `Shoot in under 2 hours: ${s.s}`,
              message: `${s.title} for ${s.client_name} — ${s.address || s.area}.`,
              entityId: s.id,
              url: '/shoots/mine'
            });
          }
        } else if (toStart > 2 && toStart <= 24) {
          if (await claim('shoot_24h', s.id, p.user_id)) {
            sent += await send(p.user_id, {
              type: 'shoot_reminder',
              title: `Shoot coming up: ${fmtWhen(s)}`,
              message: `${s.title} for ${s.client_name} in ${s.area}. Check the brief and your kit.`,
              entityId: s.id,
              url: '/shoots/mine'
            });
          }
        }
      }

      // Still not fully booked 48h before → tell whoever posted it.
      if (s.status === 'open' && toStart > 0 && toStart <= 48 && people.length < s.people_needed) {
        if (await claim('shoot_unfilled', s.id, s.created_by)) {
          sent += await send(s.created_by, {
            type: 'shoot_unfilled',
            title: `Nobody has taken this shoot yet: ${fmtWhen(s)}`,
            message: `${s.title} for ${s.client_name} needs ${s.people_needed - people.length} more videographer${s.people_needed - people.length === 1 ? '' : 's'}. Assign someone from the Shoot Planner.`,
            entityId: s.id,
            url: '/shoots'
          });
        }
      }

      // Ended with people booked but attendance not marked → ask whoever posted it.
      if (toEnd < 0 && people.some((p) => !p.attendance)) {
        if (await claim('shoot_attendance', s.id, s.created_by)) {
          sent += await send(s.created_by, {
            type: 'shoot_attendance',
            title: `Did the shoot happen? ${fmtWhen(s)}`,
            message: `Mark who attended ${s.title} for ${s.client_name} (or no-show) in the Shoot Planner.`,
            entityId: s.id,
            url: '/shoots'
          });
        }
      }
    }
    return sent;
  }

  /** `onlyUserIds` limits who is considered (tests use it so real staff are never reminded). */
  static async availabilityReminders(now, { onlyUserIds = null } = {}) {
    const t = istNow(now);
    if (!this.AVAILABILITY_REMINDER_DAYS.includes(t.day) || t.hour < this.AVAILABILITY_REMINDER_HOUR) return 0;
    const next = addMonth(t.date.slice(0, 7));
    const [people] = await pool.query(
      `SELECT vp.user_id FROM videographer_profiles vp JOIN users u ON u.id = vp.user_id
       WHERE vp.is_active = TRUE AND u.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM videographer_month_status ms WHERE ms.user_id = vp.user_id AND ms.month = ?)
         ${onlyUserIds ? 'AND vp.user_id IN (?)' : ''}`,
      onlyUserIds ? [next, onlyUserIds.length ? onlyUserIds : [0]] : [next]
    );
    let sent = 0;
    for (const p of people) {
      if (await claim('availability_due', t.day, p.user_id, next)) {
        sent += await send(p.user_id, {
          type: 'availability_due',
          title: `Mark your ${longMonth(next)} shoot availability`,
          message: `Please fill in the dates and times you're free in ${longMonth(next)} by the 25th, then tap "I'm done". Shoots are offered to people who are free.`,
          entityType: 'videographer_availability',
          url: `/shoots/availability?month=${next}`
        });
      }
    }
    return sent;
  }
}
