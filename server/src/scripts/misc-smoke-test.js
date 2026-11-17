/**
 * Miscellaneous smoke test — expenses & purchases, EMI & loans (schedule, colours, pay / undo, auto-close,
 * reminders) and client ad-fund wallets. Local development only.
 *   node src/scripts/misc-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { buildSchedule, dueState } from '../modules/expenses/loans.service.js';
import { ExpenseRemindersService } from '../modules/expenses/expenseReminders.service.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'MiscTest#2026'; // test-only credential for the @misc.test fixture accounts
const DOMAIN = '@misc.test';

class Session {
  constructor() { this.cookies = {}; }
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json', Cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (this.cookies.xsrf_token) headers['X-CSRF-Token'] = this.cookies.xsrf_token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    let json = null;
    try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, body: json };
  }
  async login(email) {
    await this.req('GET', '/auth/csrf-token');
    const r = await this.req('POST', '/auth/login', { email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login failed ${email}: ${r.status}`);
  }
}

const results = [];
const check = (label, actual, expected) => {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(actual)}${ok ? '' : '  (unexpected)'}`);
};
const users = {};
let clientId = null;
const ist = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const addMonths = (iso, n) => {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  const [cl] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const cids = cl.map((c) => c.id);
  if (uids.length) {
    const [loans] = await pool.query('SELECT id FROM loans WHERE created_by IN (?)', [uids]);
    const lids = loans.map((l) => l.id);
    if (lids.length) {
      await pool.query("DELETE FROM notifications WHERE entity_type = 'loan' AND entity_id IN (?)", [lids]);
      await pool.query("DELETE FROM sales_reminder_log WHERE kind LIKE 'emi\\_%' AND ref_id IN (SELECT id FROM loan_installments WHERE loan_id IN (?))", [lids]);
      await pool.query('DELETE FROM loan_installments WHERE loan_id IN (?)', [lids]);
    }
    await pool.query('DELETE FROM expenses WHERE created_by IN (?)', [uids]);
    await pool.query('DELETE FROM loans WHERE created_by IN (?)', [uids]);
    await pool.query("DELETE FROM expense_subcategories WHERE name LIKE 'MISC %'");
    await pool.query("DELETE FROM expense_categories WHERE name LIKE 'MISC %'");
  }
  if (cids.length) {
    await pool.query("DELETE FROM notifications WHERE entity_type = 'client' AND entity_id IN (?)", [cids]);
    await pool.query("DELETE FROM sales_reminder_log WHERE kind LIKE 'adfund\\_%' AND ref_id IN (?)", [cids]);
    await pool.query('DELETE FROM ad_fund_transactions WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM ad_campaigns WHERE client_id IN (?)', [cids]);
    await pool.query('UPDATE users SET client_id = NULL WHERE client_id IN (?) AND email LIKE ?', [cids, `%${DOMAIN}`]);
    await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
  }
  if (uids.length) {
    await pool.query('DELETE FROM sales_reminder_log WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?) OR actor_user_id IN (?)', [uids, uids]).catch(() => {});
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
  }
}

async function setup() {
  await purge();
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['am', 'account-manager', 'member'], ['aud', 'auditor', 'member'], ['fe', 'field-executive', 'member']]) {
    const [r] = await pool.query("INSERT INTO users (name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, 'active', 0)", [`MISC ${key}`, `${key}${DOMAIN}`, hash, legacy]);
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    users[key] = { id: r.insertId, s: new Session() };
  }
  const [c] = await pool.query("INSERT INTO clients (name, client_code, email, company_name, status, account_manager_id) VALUES ('MISC Client', ?, ?, 'MISC Client', 'active', ?)", [`MSC-${Date.now()}`, `client${DOMAIN}`, users.am.id]);
  clientId = c.insertId;
  // A client-portal login that (wrongly) also holds the owner role must never get staff alerts.
  const [cu] = await pool.query("INSERT INTO users (name, email, password_hash, role, status, must_change_password, client_id) VALUES ('MISC portal', ?, ?, 'owner', 'active', 0, ?)", [`portal${DOMAIN}`, hash, clientId]);
  const [[ownerRole]] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [cu.insertId, ownerRole.id]);
  users.portal = { id: cu.insertId, s: null };
  for (const k of Object.keys(users)) if (users[k].s) await users[k].s.login(`${k}${DOMAIN}`);
}

async function run() {
  await setup();
  const { owner, am, aud, fe } = Object.fromEntries(Object.entries(users).filter(([, v]) => v.s).map(([k, v]) => [k, v.s]));

  console.log('\n── Schedule maths ──');
  check('schedule clamps day 31 to month end', buildSchedule('2026-01-31', '2026-04-30', 31), (v) => v.join() === '2026-01-31,2026-02-28,2026-03-31,2026-04-30');
  check('schedule across year end', buildSchedule('2026-11-05', '2027-02-05', 5).length, 4);
  const t = '2026-11-16';
  check('state overdue', dueState({ status: 'upcoming', due_date: '2026-11-15' }, 3, t), 'overdue');
  check('state due today', dueState({ status: 'upcoming', due_date: t }, 3, t), 'due_today');
  check('state due soon (inside window)', dueState({ status: 'upcoming', due_date: '2026-11-19' }, 3, t), 'due_soon');
  check('state upcoming (outside window)', dueState({ status: 'upcoming', due_date: '2026-11-20' }, 3, t), 'upcoming');

  console.log('\n── Permissions ──');
  check('field executive cannot see expenses', (await fe.req('GET', '/expenses')).status, 403);
  check('field executive cannot see loans', (await fe.req('GET', '/loans')).status, 403);
  check('field executive cannot see ad funds', (await fe.req('GET', '/ad-funds/summary')).status, 403);
  check('auditor can view expenses', (await aud.req('GET', '/expenses')).status, 200);
  check('auditor cannot add an expense', (await aud.req('POST', '/expenses', {})).status, 403);
  check('account manager can view ad funds', (await am.req('GET', '/ad-funds/summary')).status, 200);
  check('account manager cannot view office expenses', (await am.req('GET', '/expenses')).status, 403);

  console.log('\n── Categories ──');
  let r = await owner.req('GET', '/expenses/categories');
  const cats = r.body?.categories || [];
  check('default categories seeded', cats.length >= 10, true);
  const travel = cats.find((c) => c.name === 'Travel & Transport');
  const office = cats.find((c) => c.name === 'Office Expenses');
  const emiCat = cats.find((c) => c.kind === 'emi');
  check('travel has sub-categories', travel?.subcategories.length > 0, true);
  r = await owner.req('POST', '/expenses/categories', { name: 'MISC Events' });
  check('custom category added', r.status, 201);
  check('duplicate category refused', (await owner.req('POST', '/expenses/categories', { name: 'MISC Events' })).status, 409);
  const misc = r.body.categories.find((c) => c.name === 'MISC Events');
  r = await owner.req('POST', `/expenses/categories/${misc.id}/subcategories`, { name: 'MISC Stalls' });
  check('custom sub-category added', r.body?.categories?.find((c) => c.id === misc.id)?.subcategories.length, 1);

  console.log('\n── Expenses & purchases ──');
  const today = ist();
  r = await owner.req('POST', '/expenses', { expenseDate: today, categoryId: travel.id, subcategoryId: travel.subcategories[0].id, description: 'Cab to client', amount: 450, paymentMode: 'upi' });
  check('expense created (paid by default)', r.body?.expense?.status, 'paid');
  const e1 = r.body?.expense;
  check('wrong sub-category refused', (await owner.req('POST', '/expenses', { expenseDate: today, categoryId: office.id, subcategoryId: travel.subcategories[0].id, description: 'x y', amount: 10 })).status, 400);
  r = await owner.req('POST', '/expenses', { expenseDate: today, categoryId: office.id, description: 'Printer purchase', amount: 11800, isPurchase: true, vendorGstin: '33aaacb1234c1z5', billNumber: 'B-77', gstAmount: 1800, status: 'pending', payee: 'Ace Traders' });
  const p1 = r.body?.expense;
  check('purchase stores GST split', [p1?.taxable_amount, p1?.gst_amount, p1?.vendor_gstin], (v) => v[0] === 10000 && v[1] === 1800 && v[2] === '33AAACB1234C1Z5');
  check('purchase is pending', p1?.status, 'pending');
  check('bad GSTIN refused', (await owner.req('POST', '/expenses', { expenseDate: today, categoryId: office.id, description: 'Bad gst', amount: 100, isPurchase: true, vendorGstin: 'XYZ' })).status, 400);
  check('GST above bill refused', (await owner.req('POST', '/expenses', { expenseDate: today, categoryId: office.id, description: 'Bad gst', amount: 100, isPurchase: true, gstAmount: 200 })).status, 400);
  r = await owner.req('POST', '/expenses', { expenseDate: today, categoryId: misc.id, description: 'Client visit lunch', amount: 900, clientId });
  check('client-related expense linked', r.body?.expense?.client_name, 'MISC Client');
  r = await owner.req('POST', `/expenses/${p1.id}/paid`, { paymentMode: 'bank_transfer', reference: 'UTR1' });
  check('mark purchase paid', r.body?.expense?.status, 'paid');
  check('mark paid twice refused', (await owner.req('POST', `/expenses/${p1.id}/paid`, {})).status, 409);
  r = await owner.req('PUT', `/expenses/${e1.id}`, { expenseDate: today, categoryId: travel.id, description: 'Cab to client (return)', amount: 600, paymentMode: 'cash' });
  check('expense edited', r.body?.expense?.amount, 600);
  r = await owner.req('GET', `/expenses?period=month&search=${encodeURIComponent('Cab to client (return)')}`);
  check('search finds it', r.body?.expenses?.length, 1);
  r = await owner.req('GET', '/expenses?period=month&purchase=true');
  check('purchases filter', r.body?.expenses?.every((x) => x.is_purchase), true);
  r = await owner.req('GET', `/expenses?period=month&clientId=${clientId}`);
  check('client filter', r.body?.expenses?.length, 1);
  r = await owner.req('GET', '/expenses?period=month');
  check('GST input total includes purchase', r.body?.totals?.gst_input >= 1800, true);
  check('by-category breakdown present', r.body?.byCategory?.length > 0, true);

  console.log('\n── EMI & loans ──');
  const m = today.slice(0, 7);
  const firstMonth = addMonths(today, -2); // two months back → one overdue EMI
  const dueDay = Number(today.slice(8, 10));
  r = await owner.req('POST', '/loans', { lender: 'MISC Bank', title: 'Laptop EMI', loanType: 'emi', principalAmount: 60000, emiAmount: 10000, dueDay, firstDueDate: `${firstMonth}-${String(dueDay).padStart(2, '0')}`, lastDueDate: `${addMonths(today, 3)}-01`, paymentMode: 'auto_debit', reminderDaysBefore: 3 });
  check('loan created', r.status, 201);
  let loan = r.body?.loan;
  let insts = r.body?.installments || [];
  check('schedule generated (6 EMIs)', insts.length, 6);
  check('first two EMIs overdue', insts.slice(0, 2).map((i) => i.state).join(), 'overdue,overdue');
  check('this month\'s EMI due today', insts[2]?.state, 'due_today');
  check('loan shows overdue count', loan?.overdue_count, 2);
  check('last EMI flagged', insts[5]?.is_last, true);
  check('bad dates refused', (await owner.req('POST', '/loans', { lender: 'MISC Bank', title: 'Bad', emiAmount: 100, dueDay: 5, firstDueDate: '2026-12-05', lastDueDate: '2026-01-05' })).status, 400);

  r = await owner.req('GET', `/loans/dues?month=${m}`);
  check('this month roster carries overdue EMIs', r.body?.items?.filter((i) => i.carried_over && i.loan_id === loan.id).length, 2);
  check('roster overdue total', r.body?.totals?.overdue >= 20000, true);

  // reminders (run as of 10 AM IST today)
  const now = new Date(`${today}T10:00:00+05:30`);
  const sent1 = await ExpenseRemindersService.emiReminders(now);
  const [ownerNotes] = await pool.query("SELECT type, title FROM notifications WHERE recipient_user_id = ? AND entity_type = 'loan' AND entity_id = ?", [users.owner.id, loan.id]);
  check('overdue + due-today alerts sent to owner', ownerNotes.length, 3);
  check('overdue alert type', ownerNotes.filter((n) => n.type === 'emi_overdue').length, 2);
  const sent2 = await ExpenseRemindersService.emiReminders(now);
  check('reminders not repeated the same day', [sent1 > 0, sent2], (v) => v[0] && v[1] === 0);
  const tomorrow = new Date(now.getTime() + 86400000);
  await ExpenseRemindersService.emiReminders(tomorrow);
  const [again] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND entity_type = 'loan' AND entity_id = ? AND type = 'emi_overdue'", [users.owner.id, loan.id]);
  check('overdue alert repeats the next day', Number(again[0].n) > 2, true);
  check('field executive gets no EMI alerts', (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND entity_type = 'loan'", [users.fe.id]))[0][0].n, 0);
  check('client-portal login gets no EMI alerts', (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND entity_type = 'loan'", [users.portal.id]))[0][0].n, 0);

  // pay
  r = await owner.req('POST', `/loans/installments/${insts[0].id}/pay`, { reference: 'EMI-1' });
  check('EMI paid', r.body?.installments?.[0]?.state, 'paid');
  check('progress moves', r.body?.loan?.progress, 17);
  check('paying twice refused', (await owner.req('POST', `/loans/installments/${insts[0].id}/pay`, {})).status, 409);
  r = await owner.req('GET', `/expenses?period=all&categoryId=${emiCat.id}`);
  const emiExp = r.body?.expenses?.find((x) => x.loan_id === loan.id);
  check('EMI payment recorded as an expense', emiExp?.description, (v) => /MISC Bank — Laptop EMI \(EMI 1\/6\)/.test(v));
  check('EMI expense cannot be edited from Expenses', (await owner.req('PUT', `/expenses/${emiExp.id}`, { expenseDate: today, categoryId: emiCat.id, description: 'x y', amount: 1 })).status, 409);
  check('EMI expense cannot be deleted from Expenses', (await owner.req('DELETE', `/expenses/${emiExp.id}`)).status, 409);
  check('loan with payments cannot be deleted', (await owner.req('DELETE', `/loans/${loan.id}`)).status, 409);
  r = await owner.req('POST', `/loans/installments/${insts[0].id}/undo`);
  check('undo payment', r.body?.installments?.[0]?.state, 'overdue');
  r = await owner.req('GET', `/expenses?period=all&categoryId=${emiCat.id}`);
  check('undo removes the expense', r.body?.expenses?.some((x) => x.loan_id === loan.id), false);

  // edit keeps paid ones
  await owner.req('POST', `/loans/installments/${insts[0].id}/pay`, {});
  r = await owner.req('PUT', `/loans/${loan.id}`, { lender: 'MISC Bank', title: 'Laptop EMI', emiAmount: 12000, dueDay, firstDueDate: `${firstMonth}-${String(dueDay).padStart(2, '0')}`, lastDueDate: `${addMonths(today, 3)}-01`, reminderDaysBefore: 3 });
  check('edit: paid EMI keeps its amount, unpaid follow new EMI', [r.body?.installments?.[0]?.amount, r.body?.installments?.[1]?.amount].join(), '10000,12000');

  // final phase & auto-close
  for (const i of r.body.installments.slice(1, 3)) await owner.req('POST', `/loans/installments/${i.id}/pay`, {});
  r = await owner.req('GET', `/loans/${loan.id}`);
  check('final phase (last 3 EMIs) is flagged', r.body?.loan?.final_phase, true);
  for (const i of r.body.installments.slice(3, 5)) await owner.req('POST', `/loans/installments/${i.id}/pay`, {});
  r = await owner.req('GET', `/loans/${loan.id}`);
  check('next due is the last EMI', r.body?.loan?.next_due?.is_last, true);
  r = await owner.req('POST', `/loans/installments/${r.body.installments[5].id}/pay`, {});
  check('loan auto-closes after last EMI', r.body?.loan?.status, 'closed');
  r = await owner.req('POST', `/loans/installments/${r.body.installments[5].id}/undo`);
  check('undo last EMI reopens loan', r.body?.loan?.status, 'active');

  // close early / reopen / delete
  r = await owner.req('POST', '/loans', { lender: 'MISC Card', title: 'Card EMI', loanType: 'credit_card', emiAmount: 2500, dueDay: 10, firstDueDate: `${addMonths(today, 1)}-10`, lastDueDate: `${addMonths(today, 6)}-10` });
  const loan2 = r.body?.loan;
  r = await owner.req('POST', `/loans/${loan2.id}/close`, { note: 'Prepaid' });
  check('close early skips remaining EMIs', [r.body?.loan?.status, r.body?.installments?.every((i) => i.status === 'skipped')].join(), 'closed,true');
  r = await owner.req('POST', `/loans/${loan2.id}/reopen`);
  check('reopen', r.body?.loan?.status, 'active');
  check('loan without payments can be deleted', (await owner.req('DELETE', `/loans/${loan2.id}`)).status, 200);
  r = await owner.req('GET', '/loans');
  check('loan list totals', r.body?.totals?.active >= 1, true);
  check('auditor can view loans', (await aud.req('GET', '/loans')).status, 200);
  check('auditor cannot pay an EMI', (await aud.req('POST', `/loans/installments/${insts[1].id}/pay`, {})).status, 403);

  console.log('\n── Ad funds ──');
  r = await am.req('POST', '/ad-funds/campaigns', { clientId, name: 'Lead gen – Meta', platform: 'meta', dailyBudget: 1000 });
  check('campaign created by account manager', r.status, 201);
  const c1 = r.body?.campaign;
  r = await am.req('POST', '/ad-funds/campaigns', { clientId, name: 'Search – Google', platform: 'google', dailyBudget: 500 });
  const c2 = r.body?.campaign;
  r = await am.req('POST', '/ad-funds/transactions', { clientId, txnType: 'deposit', amount: 20000, paymentMode: 'upi', reference: 'DEP1' });
  check('deposit', r.body?.balance, 20000);
  r = await am.req('POST', '/ad-funds/daily-spend', { clientId, txnDate: today, entries: [{ campaignId: c1.id, amount: 1200 }, { campaignId: c2.id, amount: 450 }, { campaignId: c2.id, amount: '' }] });
  check('daily spend for two campaigns', [r.body?.recorded, r.body?.balance].join(), '2,18350');
  check('refund over balance refused', (await am.req('POST', '/ad-funds/transactions', { clientId, txnType: 'refund', amount: 50000 })).status, 409);
  r = await am.req('POST', '/ad-funds/transactions', { clientId, txnType: 'refund', amount: 5000, notes: 'Client asked' });
  check('refund', r.body?.balance, 13350);
  r = await am.req('POST', '/ad-funds/transactions', { clientId, txnType: 'adjustment', amount: -350, notes: 'Platform fee' });
  check('negative adjustment', r.body?.balance, 13000);
  r = await am.req('GET', '/ad-funds/summary?period=month');
  const w = r.body?.wallets?.find((x) => x.client_id === clientId);
  check('wallet balance & days left', [w?.balance, w?.daily_budget, w?.days_left, w?.health].join(), '13000,1500,8,ok');
  check('period spend', r.body?.period?.spend >= 1650, true);
  r = await owner.req('GET', '/expenses?period=month');
  check('ad spend shown on expenses summary', r.body?.totals?.adSpend >= 1650, true);
  check('spend on another client\'s campaign refused', (await am.req('POST', '/ad-funds/transactions', { clientId: clientId + 999999, txnType: 'spend', amount: 10, campaignId: c1.id })).status, 400);

  // low balance alert
  await am.req('POST', '/ad-funds/daily-spend', { clientId, txnDate: today, entries: [{ campaignId: c1.id, amount: 11000 }] });
  r = await am.req('GET', '/ad-funds/summary');
  check('wallet low after heavy spend', r.body?.wallets?.find((x) => x.client_id === clientId)?.health, 'low');
  const ads1 = await ExpenseRemindersService.adFundAlerts(now);
  const [[amNote]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'adfund_low' AND entity_id = ?", [users.am.id, clientId]);
  check('account manager alerted on low wallet', Number(amNote.n), 1);
  check('low-wallet alert once a day', [ads1 > 0, await ExpenseRemindersService.adFundAlerts(now)], (v) => v[0] && v[1] === 0);

  // statement
  r = await am.req('GET', `/ad-funds/clients/${clientId}/statement?from=${today}&to=${today}`);
  check('statement opening 0 → closing = balance', [r.body?.opening, r.body?.closing].join(), '0,2000');
  check('statement totals', r.body?.totals?.spend, 12650);
  check('statement running balance', r.body?.lines?.at(-1)?.running, 2000);

  // campaigns with spend can't be deleted; pause instead
  check('campaign with spend cannot be deleted', (await am.req('DELETE', `/ad-funds/campaigns/${c1.id}`)).status, 409);
  r = await am.req('PUT', `/ad-funds/campaigns/${c1.id}`, { clientId, name: 'Lead gen – Meta', platform: 'meta', dailyBudget: 1000, status: 'paused' });
  check('campaign paused', r.body?.campaign?.status, 'paused');
  r = await am.req('GET', '/ad-funds/transactions?period=all&type=deposit&clientId=' + clientId);
  const dep = r.body?.transactions?.[0];
  check('removing deposit that would go negative refused', (await am.req('DELETE', `/ad-funds/transactions/${dep.id}`)).status, 409);
  console.log('\n── Pay later (agency spends first, client pays later) ──');
  const [lc] = await pool.query("INSERT INTO clients (name, client_code, email, company_name, status, account_manager_id) VALUES ('MISC Later', ?, ?, 'MISC Later', 'active', ?)", [`MSL-${Date.now()}`, `later${DOMAIN}`, users.am.id]);
  const later = lc.insertId;
  check('auditor cannot change wallet settings', (await aud.req('PUT', `/ad-funds/clients/${later}/settings`, { billingMode: 'postpaid' })).status, 403);
  r = await am.req('PUT', `/ad-funds/clients/${later}/settings`, { billingMode: 'postpaid', creditLimit: 30000, paymentTermsDays: 7 });
  check('wallet set to pay later', [r.body?.settings?.billing_mode, r.body?.settings?.credit_limit, r.body?.settings?.payment_terms_days].join(), 'postpaid,30000,7');
  const tenAgo = ist(-10);
  const twoAgo = ist(-2);
  await am.req('POST', '/ad-funds/transactions', { clientId: later, txnType: 'spend', txnDate: tenAgo, amount: 12000 });
  await am.req('POST', '/ad-funds/transactions', { clientId: later, txnType: 'spend', txnDate: twoAgo, amount: 8000 });
  const wl = async () => (await am.req('GET', '/ad-funds/summary')).body?.wallets?.find((x) => x.client_id === later);
  let lw = await wl();
  check('spend without a deposit is owed by the client', lw?.owed, 20000);
  check('owed since the oldest unpaid spend', lw?.owed_since, tenAgo);
  check('past 7-day terms → overdue by 3 days', [lw?.health, lw?.overdue_days].join(), 'overdue,3');
  r = await am.req('GET', '/ad-funds/summary');
  check('to-collect total includes it', r.body?.toCollect >= 20000, true);
  await ExpenseRemindersService.adFundAlerts(now);
  const [[col]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'adfund_collect' AND entity_id = ?", [users.am.id, later]);
  check('account manager gets a collection reminder', Number(col.n), 1);
  check('collection reminder once a day', (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type = 'adfund_collect' AND entity_id = ?", [later]))[0][0].n === (await ExpenseRemindersService.adFundAlerts(now), (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type = 'adfund_collect' AND entity_id = ?", [later]))[0][0].n), true);
  await am.req('POST', '/ad-funds/transactions', { clientId: later, txnType: 'deposit', amount: 12000, reference: 'Paid back' });
  lw = await wl();
  check('payment settles the oldest spend first', [lw?.owed, lw?.owed_since, lw?.health].join(), `8000,${twoAgo},due`);
  await am.req('POST', '/ad-funds/transactions', { clientId: later, txnType: 'spend', amount: 25000 });
  lw = await wl();
  check('over the credit limit is flagged', [lw?.owed, lw?.health, lw?.credit_used_pct].join(), '33000,over_limit,110');
  r = await am.req('GET', `/ad-funds/clients/${later}/statement`);
  check('statement shows amount due', [r.body?.settings?.billing_mode, r.body?.dues?.owed, r.body?.closing].join(), 'postpaid,33000,-33000');
  await am.req('POST', '/ad-funds/transactions', { clientId: later, txnType: 'deposit', amount: 40000 });
  lw = await wl();
  check('fully paid → settled with advance', [lw?.owed, lw?.health, lw?.balance].join(), '0,ok,7000');

  check('auditor cannot record ad spend', (await aud.req('POST', '/ad-funds/transactions', { clientId, txnType: 'deposit', amount: 10 })).status, 403);
}

try {
  await run();
} catch (e) {
  console.error(e);
  results.push(false);
} finally {
  await purge();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
