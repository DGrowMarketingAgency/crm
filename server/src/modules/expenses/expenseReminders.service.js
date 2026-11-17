import { pool } from '../../config/db.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { istDate } from '../sales/salesReminders.service.js';
import { dueState } from './loans.service.js';
import { AdFundsService, LOW_BALANCE_DAYS } from './adfunds.service.js';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const istHour = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(d));

async function claim(kind, refId, userId, periodKey) {
  const [r] = await pool.query('INSERT IGNORE INTO sales_reminder_log (kind, ref_id, user_id, period_key) VALUES (?, ?, ?, ?)', [kind, refId, userId, periodKey]);
  return r.affectedRows === 1;
}

/** Active staff holding a permission, plus owners. */
async function holders(permissionKey) {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.status = 'active' AND u.client_id IS NULL AND p.permission_key = ?
     UNION SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE u.status = 'active' AND u.client_id IS NULL AND r.slug = 'owner'`,
    [permissionKey]
  );
  return rows.map((r) => Number(r.id));
}

/**
 * EMI and ad-wallet alerts. Runs every few minutes; each alert goes once per person per period.
 *  - EMI due in N days (the loan's reminder window) · due today · overdue (repeats daily until paid)
 *  - "Final EMI" notice when the last instalment comes up
 *  - Ad wallet running low (< 3 days of active budgets) or negative — once a day
 */
export class ExpenseRemindersService {
  static START_HOUR = 9; // 9 AM IST

  static async run(now = new Date()) {
    if (istHour(now) < this.START_HOUR) return { sent: 0 };
    const emi = await this.emiReminders(now);
    const ads = await this.adFundAlerts(now);
    return { sent: emi + ads, emi, ads };
  }

  static async emiReminders(now) {
    const today = istDate(now);
    const [rows] = await pool.query(
      `SELECT i.id, i.loan_id, i.installment_no, i.due_date, i.amount, i.status, l.lender, l.title, l.reminder_days_before, l.owner_user_id,
              (SELECT COUNT(*) FROM loan_installments x WHERE x.loan_id = i.loan_id) AS total
       FROM loan_installments i JOIN loans l ON l.id = i.loan_id
       WHERE l.status = 'active' AND i.status = 'upcoming' AND i.due_date <= DATE_ADD(?, INTERVAL l.reminder_days_before DAY)`,
      [today]
    );
    if (!rows.length) return 0;
    const managers = await holders('expenses.manage');
    let sent = 0;
    for (const r of rows) {
      const due = r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10);
      const state = dueState({ status: r.status, due_date: due }, r.reminder_days_before, today);
      if (!['overdue', 'due_today', 'due_soon'].includes(state)) continue;
      const isLast = Number(r.installment_no) === Number(r.total);
      const days = Math.round((new Date(`${due}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
      const label = `${r.lender} — ${r.title}`;
      const emiNo = `EMI ${r.installment_no}/${r.total}`;
      const msg = {
        overdue: { title: `Overdue EMI: ${label}`, message: `${emiNo} of ${inr(r.amount)} was due on ${nice(due)} (${-days} day${days === -1 ? '' : 's'} late). Pay it and mark it paid.`, key: today },
        due_today: { title: `EMI due today: ${label}`, message: `${emiNo} · ${inr(r.amount)} is due today.`, key: 'today' },
        due_soon: { title: `EMI due in ${days} day${days === 1 ? '' : 's'}: ${label}`, message: `${emiNo} · ${inr(r.amount)} on ${nice(due)}.`, key: 'soon' }
      }[state];
      if (isLast) {
        msg.title = `${state === 'overdue' ? 'Overdue' : 'Final'} EMI: ${label}`;
        msg.message += ' This is the last instalment — the loan closes once it is paid.';
      }
      const recipients = [...new Set([...managers, r.owner_user_id].filter(Boolean).map(Number))];
      for (const uid of recipients) {
        if (!(await claim(`emi_${state}`, r.id, uid, msg.key))) continue;
        await NotificationsService.createNotification({
          recipientUserId: uid, type: state === 'overdue' ? 'emi_overdue' : 'emi_reminder', title: msg.title, message: msg.message,
          entityType: 'loan', entityId: r.loan_id, actionUrl: '/finance/loans'
        });
        sent += 1;
      }
    }
    return sent;
  }

  static async adFundAlerts(now) {
    const today = istDate(now);
    const low = (await AdFundsService.wallets()).filter((w) => w.health !== 'ok');
    if (!low.length) return 0;
    const managers = await holders('adfunds.manage');
    let sent = 0;
    for (const w of low) {
      // Pay-later clients: chase the money owed once it is past the payment terms, or over the credit limit.
      if (w.billing_mode === 'postpaid') {
        if (!['overdue', 'over_limit'].includes(w.health)) continue;
        const ctitle = w.health === 'over_limit' ? `Credit limit crossed: ${w.client_name}` : `Collect ad money: ${w.client_name}`;
        const cmsg = w.health === 'over_limit'
          ? `${w.client_name} owes ${inr(w.owed)} for ad spend — above the ${inr(w.credit_limit)} limit. Collect payment before spending more.`
          : `${inr(w.owed)} spent on ads since ${nice(w.owed_since)} is unpaid — ${w.overdue_days} day${w.overdue_days === 1 ? '' : 's'} past the due date (${nice(w.due_date)}).`;
        for (const uid of [...new Set([...managers, w.account_manager_id].filter(Boolean).map(Number))]) {
          if (!(await claim(`adfund_${w.health}`, w.client_id, uid, today))) continue;
          await NotificationsService.createNotification({
            recipientUserId: uid, type: 'adfund_collect', title: ctitle, message: cmsg, entityType: 'client', entityId: w.client_id, actionUrl: '/finance/ad-funds'
          });
          sent += 1;
        }
        continue;
      }
      const title = w.health === 'negative' ? `Ad wallet overspent: ${w.client_name}` : w.health === 'empty' ? `Ad wallet empty: ${w.client_name}` : `Ad wallet low: ${w.client_name}`;
      const message = w.health === 'negative'
        ? `The agency has paid ${inr(w.owed)} more than the client gave. Collect it, or switch this wallet to "Pay later" in its settings.`
        : `Balance ${inr(w.balance)} covers about ${w.days_left} day${w.days_left === 1 ? '' : 's'} of the ${inr(w.daily_budget)}/day budget (alert under ${LOW_BALANCE_DAYS} days). Ask for a top-up.`;
      const recipients = [...new Set([...managers, w.account_manager_id].filter(Boolean).map(Number))];
      for (const uid of recipients) {
        if (!(await claim('adfund_low', w.client_id, uid, today))) continue;
        await NotificationsService.createNotification({
          recipientUserId: uid, type: 'adfund_low', title, message, entityType: 'client', entityId: w.client_id, actionUrl: '/finance/ad-funds'
        });
        sent += 1;
      }
    }
    return sent;
  }
}
