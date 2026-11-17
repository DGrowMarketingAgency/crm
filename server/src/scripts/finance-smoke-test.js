/**
 * Finance (GST billing) smoke test — local development only.
 * Creates throw-away users/clients (@finance.test), runs the invoice lifecycle through the HTTP API,
 * then deletes everything and restores the invoice number series to where it was.
 *
 *   node src/scripts/finance-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'FinTest#2026'; // test-only credential for the @finance.test fixture accounts
const DOMAIN = '@finance.test';

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
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, body: json, text };
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(actual)}${ok ? '' : `  (expected ${typeof expected === 'function' ? 'condition' : JSON.stringify(expected)})`}${extra ? `  ${extra}` : ''}`);
};

const fx = { users: [], clients: [], service: null, series: null, settings: null };

async function setup() {
  await purge();
  const [series] = await pool.query('SELECT code, next_number, current_fy FROM invoice_number_series');
  fx.series = series;
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = async (slug, legacy, clientId = null) => {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password, client_id) VALUES (?, ?, ?, ?, 'active', 0, ?)",
      [`FIN ${slug}`, `${slug}${DOMAIN}`, hash, legacy, clientId]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    fx.users.push(r.insertId);
    return r.insertId;
  };
  const mkClient = async (name) => {
    const [r] = await pool.query(
      "INSERT INTO clients (name, client_code, email, company_name, status, address) VALUES (?, ?, ?, ?, 'active', '12 Test Street')",
      [name, `FIN-${Date.now()}-${fx.clients.length}`, `c${fx.clients.length}${DOMAIN}`, name]
    );
    fx.clients.push(r.insertId);
    return r.insertId;
  };
  const tn = await mkClient('FIN TN Clinic <script>alert(1)</script>');
  const ka = await mkClient('FIN Karnataka Pvt Ltd');
  const plain = await mkClient('FIN No GST Salon');
  await mk('owner', 'owner');
  await mk('employee', 'employee');
  await mk('account-manager', 'account_manager');
  await mk('client', 'client', plain);
  const [svc] = await pool.query("SELECT id FROM services WHERE status = 'active' ORDER BY id LIMIT 1");
  fx.service = svc[0].id;
  const [[svcRow]] = await pool.query('SELECT sac_code, default_rate, gst_rate, billing_details FROM services WHERE id = ?', [fx.service]);
  fx.serviceBefore = svcRow;
  return { tn, ka, plain };
}

async function purge() {
  const [users] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const [clients] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const cids = clients.map((c) => c.id);
  const uids = users.map((u) => u.id);
  if (cids.length) {
    await pool.query('DELETE FROM credit_notes WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM payments WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [cids]);
  }
  if (uids.length) {
    await pool.query('DELETE FROM users WHERE client_id IN (?)', [cids.length ? cids : [0]]);
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
  }
  if (cids.length) await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
}

async function restore() {
  for (const s of fx.series || []) {
    await pool.query('UPDATE invoice_number_series SET next_number = ?, current_fy = ? WHERE code = ?', [s.next_number, s.current_fy, s.code]);
  }
  if (fx.serviceBefore) {
    const b = fx.serviceBefore;
    await pool.query('UPDATE services SET sac_code = ?, default_rate = ?, gst_rate = ?, billing_details = ? WHERE id = ?', [b.sac_code, b.default_rate, b.gst_rate, b.billing_details, fx.service]);
  }
  await purge();
}

async function run() {
  const { tn, ka, plain } = await setup();
  const owner = new Session();
  await owner.login(`owner${DOMAIN}`);
  const emp = new Session();
  await emp.login(`employee${DOMAIN}`);
  const portal = new Session();
  await portal.login(`client${DOMAIN}`);
  const am = new Session();
  await am.login(`account-manager${DOMAIN}`);

  console.log('\n── Lookups & masters ──');
  const look = await owner.req('GET', '/finance/lookups');
  check('lookups load', look.status, 200, `${look.body?.states?.length} states, ${look.body?.series?.length} series`);
  const agencyState = look.body.settings.state_code;
  check('client portal blocked from finance', (await portal.req('GET', '/finance/lookups')).status, 403);
  check('employee (no invoices.view) blocked', (await emp.req('GET', '/finance/invoices')).status, 403);
  check('invalid GSTIN rejected', (await owner.req('PUT', `/finance/clients/${tn}/billing`, { gstin: '12345' })).status, 400);
  let r = await owner.req('PUT', `/finance/clients/${tn}/billing`, { gstin: `${agencyState}ABCDE1234F1Z5`, pan: 'abcde1234f', city: 'Chennai', paymentTermsDays: 15 });
  check('client GSTIN saved, state derived from it', r.body?.client?.state_code, agencyState, r.body?.client?.state);
  r = await owner.req('PUT', `/finance/clients/${ka}/billing`, { gstin: '29AAACK1234L1Z2' });
  check('Karnataka client state 29', r.body?.client?.state_code, '29');
  r = await owner.req('PUT', `/finance/services/${fx.service}/tax`, { sacCode: '998361', defaultRate: 15000, gstRate: 18 });
  check('service SAC + GST saved', r.body?.service?.sac_code, '998361');
  check('account manager cannot edit service tax (settings permission)', (await am.req('PUT', `/finance/services/${fx.service}/tax`, { gstRate: 5 })).status, 403);

  console.log('\n── Draft → issue (intra-state) ──');
  const body = (over = {}) => ({
    invoiceType: 'INV', clientId: tn, invoiceDate: '2026-11-14',
    items: [{ serviceId: fx.service, description: 'Digital Marketing', details: 'SEO\nSocial media', quantity: 1, unitPrice: 25000, discountAmount: 1000 },
            { description: 'Landing page', quantity: 2, unitPrice: 4999.5, gstRate: 18 }],
    ...over
  });
  r = await owner.req('POST', '/finance/invoices', body());
  const d1 = r.body?.invoice;
  check('draft created', r.status, 201, d1?.invoice_number);
  check('draft has temporary number', d1?.invoice_number?.startsWith('DRAFT-'), true);
  check('SAC filled from service', r.body?.items?.[0]?.sac_code, '998361');
  check('intra-state CGST', Number(d1?.cgst_amount), 3059.91);
  check('intra-state SGST', Number(d1?.sgst_amount), 3059.91);
  check('no IGST intra-state', Number(d1?.igst_amount), 0);
  check('rounded total', Number(d1?.total_amount), 40119);
  check('round off kept', Number(d1?.round_off), 0.18);
  check('due date from client terms (15 days)', String(d1?.due_date).slice(0, 10), '2026-11-29');
  r = await owner.req('PUT', `/finance/invoices/${d1.id}`, body({ items: [{ description: 'Digital Marketing', quantity: 1, unitPrice: 10000, gstRate: 18 }] }));
  check('draft edited', Number(r.body?.invoice?.total_amount), 11800);
  const before = fx.series.find((s) => s.code === 'INV');
  r = await owner.req('POST', `/finance/invoices/${d1.id}/issue`);
  const n1 = r.body?.invoice?.invoice_number;
  check('issued with series number', /^INV\d{3,}$/.test(n1 || '') || /^INV\//.test(n1 || ''), true, n1);
  check('editing an issued invoice refused', (await owner.req('PUT', `/finance/invoices/${d1.id}`, body())).status, 409);
  check('issuing twice refused', (await owner.req('POST', `/finance/invoices/${d1.id}/issue`)).status, 409);

  console.log('\n── Gap-free numbering, inter-state, types ──');
  r = await owner.req('POST', '/finance/invoices', body({ clientId: ka, issue: true }));
  const i2 = r.body?.invoice;
  check('inter-state uses IGST', Number(i2?.igst_amount), 6119.82);
  check('inter-state has no CGST', Number(i2?.cgst_amount), 0);
  const num = (s) => Number(String(s).replace(/\D+/g, '').slice(-6));
  check('next number is +1 (no gap from drafts)', num(i2?.invoice_number) - num(n1), 1, `${n1} → ${i2?.invoice_number}`);
  check('INC needs client GSTIN', (await owner.req('POST', '/finance/invoices', body({ invoiceType: 'INC', clientId: plain }))).status, 400);
  r = await owner.req('POST', '/finance/invoices', body({ invoiceType: 'IND', clientId: plain, issue: true }));
  check('non-GST invoice has zero tax', Number(r.body?.invoice?.tax_amount), 0);
  check('non-GST uses IND series', /^IND/.test(r.body?.invoice?.invoice_number || ''), true, r.body?.invoice?.invoice_number);
  check('bad GST rate rejected', (await owner.req('POST', '/finance/invoices', body({ items: [{ description: 'x', quantity: 1, unitPrice: 1, gstRate: 7 }] }))).status, 400);
  check('due before invoice date rejected', (await owner.req('POST', '/finance/invoices', body({ dueDate: '2026-11-01' }))).status, 400);
  const types = await owner.req('GET', '/finance/invoices?type=IND');
  check('filter by type', types.body?.invoices?.every((x) => x.invoice_type === 'IND'), true, `${types.body?.invoices?.length} rows`);

  console.log('\n── Payments & cancellation ──');
  r = await owner.req('POST', `/invoices/${i2.id}/payments`, { amount: 5000, paymentDate: '2026-11-15', paymentMethod: 'cheque', transactionReference: 'CHQ-001' });
  check('partial payment by cheque', r.status, 201);
  r = await owner.req('GET', `/finance/invoices/${i2.id}`);
  check('status partially paid', r.body?.invoice?.status, 'partially_paid');
  check('payment method stored as cheque', r.body?.payments?.[0]?.payment_method, 'cheque');
  check('cannot cancel invoice with payments', (await owner.req('POST', `/finance/invoices/${i2.id}/cancel`, { reason: 'test' })).status, 409);
  check('cancel needs a reason', (await owner.req('POST', `/finance/invoices/${d1.id}/cancel`, { reason: '' })).status, 400);
  r = await owner.req('POST', `/finance/invoices/${d1.id}/cancel`, { reason: 'Raised in error' });
  check('issued invoice cancelled by credit note', /^CN/.test(r.body?.creditNote || ''), true, r.body?.creditNote);
  check('cancelled invoice is void with no balance', [r.body?.invoice?.invoice?.status, Number(r.body?.invoice?.invoice?.outstanding_balance)].join(), 'void,0');
  check('cancelling twice refused', (await owner.req('POST', `/finance/invoices/${d1.id}/cancel`, { reason: 'again' })).status, 409);
  r = await owner.req('POST', '/finance/invoices', body());
  const d3 = r.body?.invoice?.id;
  r = await owner.req('POST', `/finance/invoices/${d3}/cancel`, { reason: 'not needed' });
  check('draft is deleted, not credit-noted', r.body?.deleted, true);
  const list = await owner.req('GET', `/finance/invoices?clientId=${ka}`);
  check('register totals: outstanding', list.body?.totals?.outstanding, 35119);

  console.log('\n── Tax invoice print ──');
  const p1 = await owner.req('GET', `/finance/invoices/${i2.id}/print`);
  check('print renders HTML', p1.status === 200 && p1.text.includes('TAX INVOICE'), true);
  check('print shows IGST line', p1.text.includes('IGST'), true);
  check('print shows client GSTIN', p1.text.includes('29AAACK1234L1Z2'), true);
  check('print has amount in words', p1.text.includes('Rupees Forty Thousand One Hundred Nineteen Only'), true);
  const p2 = await owner.req('GET', `/finance/invoices/${d1.id}/print`);
  check('client name is HTML-escaped (no script injection)', !p2.text.includes('<script>alert(1)</script>') && p2.text.includes('&lt;script&gt;'), true);
  check('cancelled print shows stamp', p2.text.includes('CANCELLED'), true);
}

run()
  .catch((e) => {
    console.error('Crashed:', e);
    results.push(false);
  })
  .finally(async () => {
    try { await restore(); console.log('\nFixtures removed, number series restored.'); } catch (e) { console.error('Cleanup failed:', e.message); }
    const failed = results.filter((x) => !x).length;
    console.log(`${results.length - failed}/${results.length} checks passed.`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
