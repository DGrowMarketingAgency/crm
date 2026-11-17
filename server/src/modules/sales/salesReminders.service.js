import { pool } from '../../config/db.js';
import { NotificationsService } from '../notifications/notifications.service.js';

// Meetings are saved as Indian local time (from the date-time picker), so reminders work in IST
// regardless of the database server's own time zone (Hostinger runs in UTC).
const TZ = 'Asia/Kolkata';
const pad = (n) => String(n).padStart(2, '0');
const istParts = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return p;
};
const istDateTime = (d) => { const p = istParts(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
const istDate = (d) => { const p = istParts(d); return `${p.year}-${p.month}-${p.day}`; };
const istHour = (d) => Number(istParts(d).hour);
const timeLabel = (s) => { const t = String(s).replace('T', ' ').slice(11, 16); const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };

/** Records a reminder; returns true only the first time (so nobody is reminded twice). */
async function claim(kind, refId, userId, periodKey) {
  const [r] = await pool.query(
    'INSERT IGNORE INTO sales_reminder_log (kind, ref_id, user_id, period_key) VALUES (?, ?, ?, ?)',
    [kind, refId, userId, periodKey]
  );
  return r.affectedRows === 1;
}

export class SalesRemindersService {
  static MEETING_LEAD_MINUTES = 60;
  static FOLLOWUP_DIGEST_HOUR = 8; // 8 AM IST

  /** Run every few minutes. Returns how many reminders went out. */
  static async run(now = new Date()) {
    const meetings = await this.meetingReminders(now);
    const followups = await this.followupDigest(now);
    return { sent: meetings + followups, meetings, followups };
  }

  /** "Meeting in 45 min" to the meeting owner, whoever booked it, and the lead's assigned person. */
  static async meetingReminders(now) {
    const from = istDateTime(now);
    const to = istDateTime(new Date(now.getTime() + this.MEETING_LEAD_MINUTES * 60000));
    const [rows] = await pool.query(
      `SELECT m.id, m.title, m.mode, m.location, DATE_FORMAT(m.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at, m.owner_user_id, m.created_by,
              l.owner_user_id AS lead_owner, COALESCE(c.company_name, c.name, l.company_name, l.title) AS party
       FROM sales_meetings m LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN clients c ON c.id = m.client_id
       WHERE m.status IN ('scheduled','rescheduled') AND m.starts_at > ? AND m.starts_at <= ?`,
      [from, to]
    );
    let sent = 0;
    for (const m of rows) {
      const mins = Math.max(1, Math.round((new Date(m.starts_at.replace(' ', 'T') + '+05:30') - now) / 60000));
      const recipients = [...new Set([m.owner_user_id, m.created_by, m.lead_owner].filter(Boolean).map(Number))];
      for (const uid of recipients) {
        if (!(await claim('meeting_soon', m.id, uid, 'once'))) continue;
        await NotificationsService.createNotification({
          recipientUserId: uid, type: 'meeting_reminder', title: `Meeting in ${mins} min: ${m.title}`,
          message: `${m.party ? `With ${m.party} · ` : ''}${timeLabel(m.starts_at)} · ${m.mode === 'online' ? 'Online' : 'In person'}${m.location ? ` · ${m.location}` : ''}`,
          entityType: 'meeting', entityId: m.id, actionUrl: '/sales/meetings'
        });
        sent += 1;
      }
    }
    return sent;
  }

  /** One morning summary per person: follow-ups due today and overdue on leads assigned to them. */
  static async followupDigest(now) {
    if (istHour(now) < this.FOLLOWUP_DIGEST_HOUR) return 0;
    const today = istDate(now);
    const [rows] = await pool.query(
      `SELECT l.owner_user_id AS uid, SUM(l.next_followup_date = ?) AS due_today, SUM(l.next_followup_date < ?) AS overdue,
              SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(l.company_name, l.title) ORDER BY l.next_followup_date SEPARATOR '||'), '||', 3) AS names
       FROM leads l JOIN users u ON u.id = l.owner_user_id AND u.status = 'active'
       WHERE l.stage NOT IN ('Won','Lost') AND l.next_followup_date IS NOT NULL AND l.next_followup_date <= ?
       GROUP BY l.owner_user_id`,
      [today, today, today]
    );
    let sent = 0;
    for (const r of rows) {
      const dueToday = Number(r.due_today || 0);
      const overdue = Number(r.overdue || 0);
      if (!dueToday && !overdue) continue;
      if (!(await claim('followup_digest', r.uid, r.uid, today))) continue;
      const parts = [dueToday && `${dueToday} due today`, overdue && `${overdue} overdue`].filter(Boolean).join(' and ');
      await NotificationsService.createNotification({
        recipientUserId: r.uid, type: 'followup_reminder', title: `Follow-ups: ${parts}`,
        message: `Call or update: ${String(r.names || '').split('||').join(', ')}${dueToday + overdue > 3 ? '…' : ''}`,
        entityType: 'lead', entityId: 0, actionUrl: '/sales/desk'
      });
      sent += 1;
    }
    return sent;
  }
}

export { istDate, istDateTime };
