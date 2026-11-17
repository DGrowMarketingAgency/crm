/**
 * Finance control (Phase 3) smoke test — local development only.
 * Reports, receivables aging, Excel export, auditor role, billing alerts and retainer auto-invoices.
 * Uses invoice dates in May–June 2031 so real data never mixes in; everything created is removed afterwards.
 *   node src/scripts/finance-control-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { BillingAlertsService } from '../modules/finance/billingAlerts.service.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'FinCtl#2026'; // test-only credential for the @finctl.test fixture accounts
const DOMAIN = '@finctl.test';
const started = new Date(Date.now() - 2000);

class Session {
  constructor() { this.cookies = {}; }
  async req(method, path, body, raw = false) {
    const headers = { 'Content-Type': 'application/json', Cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (this.cookies.xsrf_token) headers['X-CSRF-Token'] = this.cookies.xsrf_token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    if (raw) return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
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
const check = (label, actual, expected, extra = '') => {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(actual)}${ok ? '' : '  (unexpected)'}${extra ? `  ${extra}` : ''}`);
};

const fx = { users: {}, clients: {}, series: [] };

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const [cs] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  const cids = cs.map((c) => c.id);
  if (cids.length) {
    const [inv] = await pool.query('SELECT id FROM invoices WHERE client_id IN (?)', [cids]);
    const [prj] = await pool.query('SELECT id FROM projects WHERE client_id IN (?)', [cids]);
    if (inv.length) await pool.query("DELETE FROM billing_reminder_log WHERE ref_type = 'invoice' AND ref_id IN (?)", [inv.map((x) => x.id)]);
    if (prj.length) await pool.query("DELETE FROM billing_reminder_log WHERE ref_type = 'project' AND ref_id IN (?)", [prj.map((x) => x.id)]);
    await pool.query('DELETE FROM credit_notes WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM payments WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id IN (?)', [cids]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?) AND parent_project_id IS NOT NULL', [cids]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?)', [cids]);
  }
  if (uids.length) {
    await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]);
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
  }
  if (cids.length) await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
}

async function setup() {
  await purge();
  [fx.series] = await pool.query('SELECT code, next_number, current_fy FROM invoice_number_series');
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['auditor', 'auditor', 'member'], ['am', 'account-manager', 'account_manager'], ['emp', 'employee', 'employee']]) {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, 'active', 0)",
      [`FINCTL ${key}`, `${key}${DOMAIN}`, hash, legacy]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (!role) throw new Error(`role ${slug} missing — restart the API so the registry syncs`);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    fx.users[key] = { id: r.insertId, s: new Session() };
  }
  const [[ag]] = await pool.query('SELECT state_code FROM agency_settings WHERE id = 1');
  for (const [key, gstin, state] of [['tn', `${ag.state_code}AAACT1111A1Z1`, ag.state_code], ['ka', '29AAACK2222B1Z2', '29'], ['b2c', null, ag.state_code]]) {
    const [r] = await pool.query(
      "INSERT INTO clients (name, client_code, email, company_name, status, gstin, state_code, account_manager_id) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
      [`FINCTL ${key}`, `FC-${Date.now()}-${key}`, `${key}${DOMAIN}`, `FINCTL ${key.toUpperCase()} Co`, gstin, state, fx.users.am.id]
    );
    fx.clients[key] = r.insertId;
  }
  for (const k of Object.keys(fx.users)) await fx.users[k].s.login(`${k}${DOMAIN}`);
}

async function run() {
  await setup();
  const { owner, auditor, am, emp } = Object.fromEntries(Object.entries(fx.users).map(([k, v]) => [k, v.s]));
  const { tn, ka, b2c } = fx.clients;
  const mk = (clientId, date, price, type = 'INV', extra = {}) => owner.req('POST', '/finance/invoices', {
    invoiceType: type, clientId, invoiceDate: date, dueDate: extra.due || date, issue: true,
    items: [{ description: 'Digital Marketing', sacCode: '998361', quantity: 1, unitPrice: price, gstRate: 18 }]
  });

  console.log('\n── Fixture invoices (May 2031) ──');
  const i1 = (await mk(tn, '2031-05-05', 10000, 'INC', { due: '2031-05-10' })).body.invoice; // B2B intra 11800
  const i2 = (await mk(ka, '2031-05-08', 20000, 'INV', { due: '2031-05-20' })).body.invoice; // B2B inter 23600
  const i3 = (await mk(b2c, '2031-05-12', 5000, 'INV', { due: '2031-06-30' })).body.invoice; // B2C intra 5900
  const i4 = (await mk(b2c, '2031-05-15', 3000, 'IND', { due: '2031-07-31' })).body.invoice; // non-GST 3000
  const i5 = (await mk(tn, '2031-05-18', 1000, 'INV', { due: '2031-05-18' })).body.invoice; // to be cancelled 1180
  check('5 fixture invoices issued', [i1, i2, i3, i4, i5].every((x) => x?.status === 'issued'), true);
  await owner.req('POST', `/invoices/${i2.id}/payments`, { amount: 10000, paymentDate: '2031-05-25', paymentMethod: 'upi', transactionReference: 'UTR1' });
  await owner.req('POST', `/invoices/${i1.id}/payments`, { amount: 11800, paymentDate: '2031-05-26', paymentMethod: 'cheque', transactionReference: 'CHQ9' });
  const cn = await owner.req('POST', `/finance/invoices/${i5.id}/cancel`, { reason: 'Duplicate' });
  check('one invoice cancelled by credit note', /^CN/.test(cn.body?.creditNote || ''), true);

  const R = '/finance/reports';
  const range = 'from=2031-05-01&to=2031-05-31';
  console.log('\n── Sales register ──');
  let r = await owner.req('GET', `${R}/sales-register?${range}`);
  check('register lists all 5 (cancelled flagged)', `${r.body?.rows?.length}/${r.body?.totals?.cancelled}`, '5/1');
  check('register total excludes cancelled', r.body?.totals?.total, 11800 + 23600 + 5900 + 3000);
  check('register CGST', r.body?.totals?.cgst, 900 + 450);
  check('register IGST', r.body?.totals?.igst, 3600);
  check('register outstanding', r.body?.totals?.outstanding, 13600 + 5900 + 3000);
  check('filter by type IND', (await owner.req('GET', `${R}/sales-register?${range}&type=IND`)).body?.rows?.length, 1);
  check('bad date rejected', (await owner.req('GET', `${R}/sales-register?from=05-2031`)).status, 400);
  check('from after to rejected', (await owner.req('GET', `${R}/sales-register?from=2031-06-01&to=2031-05-01`)).status, 400);

  console.log('\n── GST summary ──');
  r = await owner.req('GET', `${R}/gst-summary?${range}`);
  const g = r.body;
  check('B2B = invoices to GSTIN clients', g?.b2b?.map((x) => x.invoice_number).sort().join(), [i1.invoice_number, i2.invoice_number].sort().join());
  check('B2C grouped by place & rate', g?.b2c?.length === 1 && g.b2c[0].taxable === 5000 && g.b2c[0].cgst === 450, true);
  check('non-GST supplies counted separately', `${g?.nonGst?.count}/${g?.nonGst?.value}`, '1/3000');
  check('credit note listed', g?.creditNotes?.length, 0, '(cancelled invoice was never live tax: its CN is dated today, outside May 2031)');
  check('net tax = CGST+SGST+IGST', g?.totals?.net?.tax, 900 + 900 + 450 + 450 + 3600 - 0);
  check('SAC summary rows', g?.sac?.some((x) => x.sac_code === '998361'), true);

  console.log('\n── Receivables aging & payments ──');
  r = await owner.req('GET', `${R}/aging?asOf=2031-08-15`);
  const ag = r.body;
  const mine = ag?.invoices?.filter((x) => [i2.id, i3.id, i4.id].includes(x.id)) || [];
  check('3 open invoices of ours in aging', mine.length, 3);
  check('i2 is 61-90 days overdue', mine.find((x) => x.id === i2.id)?.bucket, 'd90');
  check('i3 is 31-60 days overdue', mine.find((x) => x.id === i3.id)?.bucket, 'd60');
  check('i4 is 1-30 days overdue', mine.find((x) => x.id === i4.id)?.bucket, 'd30');
  check('paid and cancelled invoices not in aging', ag?.invoices?.some((x) => [i1.id, i5.id].includes(x.id)), false);
  r = await owner.req('GET', `${R}/payments?${range}`);
  check('payments received total', r.body?.totals?.amount, 21800);
  check('payments by mode', JSON.stringify(r.body?.totals?.byMode), JSON.stringify({ upi: 10000, cheque: 11800 }));

  console.log('\n── Excel export ──');
  for (const rep of ['sales-register', 'gst-summary', 'aging', 'payments']) {
    const x = await owner.req('GET', `${R}/${rep}?${range}&asOf=2031-08-15&format=xlsx`, null, true);
    check(`${rep}.xlsx downloads`, x.status === 200 && x.type?.includes('spreadsheetml') && x.buf.slice(0, 2).toString() === 'PK', true, `${x.buf.length} bytes`);
  }

  console.log('\n── Auditor (read-only) ──');
  check('auditor reads GST summary', (await auditor.req('GET', `${R}/gst-summary?${range}`)).status, 200);
  check('auditor reads invoice register', (await auditor.req('GET', '/finance/invoices')).status, 200);
  check('auditor opens an invoice', (await auditor.req('GET', `/finance/invoices/${i2.id}`)).status, 200);
  check('auditor cannot create invoices', (await auditor.req('POST', '/finance/invoices', { invoiceType: 'INV', clientId: tn, invoiceDate: '2031-05-01', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] })).status, 403);
  check('auditor cannot record payments', (await auditor.req('POST', `/invoices/${i3.id}/payments`, { amount: 1, paymentDate: '2031-05-30', paymentMethod: 'cash' })).status, 403);
  check('auditor cannot cancel invoices', (await auditor.req('POST', `/finance/invoices/${i3.id}/cancel`, { reason: 'audit test' })).status, 403);
  check('auditor cannot change finance settings', (await auditor.req('PUT', '/finance/settings', { agency_name: 'Hacked' })).status, 403);
  check('auditor has no sales access', (await auditor.req('GET', '/sales/leads')).status, 403);
  check('auditor has no project access', (await auditor.req('GET', '/project-flow/clients')).status, 403);
  check('account manager cannot see finance reports', (await am.req('GET', `${R}/gst-summary`)).status, 403);
  check('employee cannot see finance reports', (await emp.req('GET', `${R}/aging`)).status, 403);

  console.log('\n── Billing alerts ──');
  const live = await BillingAlertsService.live('2031-05-19');
  check('overdue on 19 May: i1 (paid) not listed', live.overdue.some((x) => x.id === i1.id), false);
  check('due-soon on 19 May includes i2 (due 20 May)', live.dueSoon.some((x) => x.id === i2.id), true);
  const live2 = await BillingAlertsService.live('2031-05-20');
  check('due-today on 20 May includes i2', live2.dueToday.some((x) => x.id === i2.id), true);
  const run1 = await BillingAlertsService.runReminders('2031-08-15');
  const [[n1]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'billing_overdue'", [fx.users.am.id]);
  check('overdue reminders reach the account manager', Number(n1.n) >= 3, true, `${n1.n} notifications`);
  await BillingAlertsService.runReminders('2031-08-15');
  const [[n2]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'billing_overdue'", [fx.users.am.id]);
  check('same week: no duplicate reminders', Number(n2.n), Number(n1.n));
  await BillingAlertsService.runReminders('2031-08-23');
  const [[n3]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'billing_overdue'", [fx.users.am.id]);
  check('next week: overdue reminded again', Number(n3.n) > Number(n2.n), true);
  check('alerts endpoint for invoice viewers', (await auditor.req('GET', '/finance/alerts')).status, 200);
  check('only settings managers can trigger reminders', (await am.req('POST', '/finance/alerts/run')).status, 403);
  void run1;

  console.log('\n── Retainer auto-invoices ──');
  r = await owner.req('POST', '/project-flow/projects', { clientId: tn, name: 'FINCTL SEO retainer', category: 'regular', assignmentMode: 'individual', assigneeId: fx.users.am.id, monthlyDeliverables: [{ label: 'Blogs', qty: 4 }] });
  const ret = r.body?.project?.id;
  check('regular retainer created', r.status, 201);
  check('employee cannot set retainer billing', (await emp.req('PUT', `/project-flow/projects/${ret}/retainer-billing`, { amount: 20000, autoInvoice: true })).status, 403);
  check('auto-invoice needs a fee', (await owner.req('PUT', `/project-flow/projects/${ret}/retainer-billing`, { amount: null, autoInvoice: true })).status, 400);
  r = await am.req('PUT', `/project-flow/projects/${ret}/retainer-billing`, { amount: 20000, invoiceType: 'INC', autoInvoice: true });
  check("client's account manager sets the monthly fee", r.body?.project?.retainer_auto_invoice, true);
  r = await owner.req('POST', `/project-flow/projects/${ret}/cycles`, { month: '2031-06' });
  check('June 2031 cycle auto-drafts an invoice', Boolean(r.body?.invoiceId), true);
  const [[inv]] = await pool.query('SELECT status, invoice_type, total_amount, invoice_date, project_id FROM invoices WHERE id = ?', [r.body.invoiceId]);
  check('draft INC invoice: fee + 18% GST, dated 1 June', `${inv.status}/${inv.invoice_type}/${Number(inv.total_amount)}/${String(inv.invoice_date instanceof Date ? inv.invoice_date.toISOString() : inv.invoice_date).slice(0, 10)}`, 'draft/INC/23600/2031-06-01');
  check('invoice linked to the June cycle', inv.project_id, r.body.id);
  r = await owner.req('POST', `/project-flow/projects/${ret}/cycles`, { month: '2031-06' });
  const [[cnt]] = await pool.query('SELECT COUNT(*) AS n FROM invoices i JOIN projects p ON p.id = i.project_id WHERE p.parent_project_id = ?', [ret]);
  check('re-running the cycle does not duplicate the invoice', Number(cnt.n), 1, '(only June: this month started before the fee was set)');
}

run()
  .catch((e) => { console.error('Crashed:', e); results.push(false); })
  .finally(async () => {
    try {
      await purge();
      await pool.query("DELETE FROM notifications WHERE type LIKE 'billing\\_%' AND created_at >= ?", [started]);
      await pool.query('DELETE FROM billing_reminder_log WHERE sent_at >= ?', [started]);
      for (const s of fx.series) await pool.query('UPDATE invoice_number_series SET next_number = ?, current_fy = ? WHERE code = ?', [s.next_number, s.current_fy, s.code]);
      console.log('\nFixtures, reminders and notifications removed; number series restored.');
    } catch (e) { console.error('Cleanup failed:', e.message); }
    const failed = results.filter((x) => !x).length;
    console.log(`${results.length - failed}/${results.length} checks passed.`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
