import { pool } from '../../config/db.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { round2 } from './gst.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const inr = (v) => `₹${Math.round(Number(v || 0)).toLocaleString('en-IN')}`;

function nextMonth(today) {
  const [y, m] = today.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { key: `${ny}-${String(nm).padStart(2, '0')}`, label: `${MONTHS[nm - 1]} ${ny}`, firstDay: `${ny}-${String(nm).padStart(2, '0')}-01` };
}

/** ISO week key, so an overdue reminder repeats at most once a week. */
function weekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export class BillingAlertsService {
  /** What needs attention now: overdue, due today, due within 3 days, and retainers renewing within 14 days. */
  static async live(today = new Date().toISOString().slice(0, 10)) {
    const [inv] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_type, i.due_date, i.total_amount, i.outstanding_balance, i.created_by,
              c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name, c.account_manager_id, am.name AS account_manager,
              DATEDIFF(?, i.due_date) AS days
       FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN users am ON am.id = c.account_manager_id
       WHERE i.status IN ('issued','partially_paid','overdue') AND i.outstanding_balance > 0 AND i.due_date <= DATE_ADD(?, INTERVAL 3 DAY)
       ORDER BY i.due_date`,
      [today, today]
    );
    const rows = inv.map((r) => ({ ...r, due_date: iso(r.due_date), days: Number(r.days), outstanding_balance: Number(r.outstanding_balance) }));
    const nm = nextMonth(today);
    const daysToRenewal = Math.round((Date.parse(`${nm.firstDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    let renewals = [];
    if (daysToRenewal <= 14) {
      const [rets] = await pool.query(
        `SELECT p.id, p.name, p.billing_amount, p.retainer_auto_invoice, p.retainer_invoice_type, p.team_leader_id, tl.name AS team_leader,
                c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name, c.account_manager_id
         FROM projects p JOIN clients c ON c.id = p.client_id LEFT JOIN users tl ON tl.id = p.team_leader_id
         WHERE p.project_category = 'regular' AND p.parent_project_id IS NULL AND p.month_plan_id IS NULL AND p.is_archived = 0 AND p.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.parent_project_id = p.id AND x.cycle_month = ?)
         ORDER BY c.company_name, p.name`,
        [nm.key]
      );
      renewals = rets.map((r) => ({
        ...r,
        billing_amount: r.billing_amount == null ? null : Number(r.billing_amount),
        retainer_auto_invoice: Boolean(r.retainer_auto_invoice),
        cycle: nm.label,
        days: daysToRenewal
      }));
    }
    const pick = (f) => rows.filter(f);
    const overdue = pick((r) => r.days > 0);
    return {
      today,
      overdue,
      dueToday: pick((r) => r.days === 0),
      dueSoon: pick((r) => r.days < 0),
      renewals,
      totals: { overdue: round2(overdue.reduce((a, r) => a + r.outstanding_balance, 0)), count: rows.length + renewals.length }
    };
  }

  /** Sends each reminder once (overdue: once a week) to the invoice's creator and the client's account manager. */
  static async runReminders(today = new Date().toISOString().slice(0, 10)) {
    const a = await this.live(today);
    let sent = 0;
    const notify = async (kind, refType, refId, periodKey, recipients, title, message, actionUrl) => {
      const ids = [...new Set(recipients.filter(Boolean).map(Number))];
      if (!ids.length) return;
      const [res] = await pool.query(
        'INSERT IGNORE INTO billing_reminder_log (kind, ref_type, ref_id, period_key, recipients) VALUES (?, ?, ?, ?, ?)',
        [kind, refType, refId, periodKey, ids.length]
      );
      if (!res.affectedRows) return; // already sent for this period
      for (const uid of ids) {
        await NotificationsService.createNotification({
          recipientUserId: uid, type: `billing_${kind}`, title, message, entityType: refType, entityId: refId, actionUrl
        });
      }
      sent += 1;
    };
    for (const r of a.overdue) {
      await notify('overdue', 'invoice', r.id, weekKey(today), [r.created_by, r.account_manager_id], 'Invoice overdue',
        `${r.invoice_number} for ${r.client_name}: ${inr(r.outstanding_balance)} is ${r.days} day${r.days === 1 ? '' : 's'} overdue.`, `/finance/invoices/${r.id}`);
    }
    for (const r of a.dueToday) {
      await notify('due_today', 'invoice', r.id, today, [r.created_by, r.account_manager_id], 'Invoice due today',
        `${r.invoice_number} for ${r.client_name}: ${inr(r.outstanding_balance)} is due today.`, `/finance/invoices/${r.id}`);
    }
    for (const r of a.dueSoon) {
      await notify('due_soon', 'invoice', r.id, 'once', [r.created_by, r.account_manager_id], 'Invoice due soon',
        `${r.invoice_number} for ${r.client_name}: ${inr(r.outstanding_balance)} is due on ${r.due_date}.`, `/finance/invoices/${r.id}`);
    }
    for (const r of a.renewals) {
      const what = r.retainer_auto_invoice && r.billing_amount
        ? `a draft invoice of ${inr(r.billing_amount)} will be created automatically`
        : 'no monthly fee is set, so no invoice will be drafted';
      await notify('renewal', 'project', r.id, r.cycle, [r.team_leader_id, r.account_manager_id], 'Retainer renews soon',
        `${r.name} (${r.client_name}) starts its ${r.cycle} cycle in ${r.days} day${r.days === 1 ? '' : 's'}; ${what}.`, `/flow-projects/${r.id}`);
    }
    return { sent, today };
  }
}
