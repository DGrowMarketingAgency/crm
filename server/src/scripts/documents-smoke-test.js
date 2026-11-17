/**
 * Document lifecycle smoke test — edit / delete / duplicate / cancel rules for
 * proposals, quotations and GST invoices (incl. payment reversal). Local development only.
 *   node src/scripts/documents-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'DocsTest#2026'; // test-only credential for the @docs.test fixture accounts
const DOMAIN = '@docs.test';

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
let series = [];
let clientId = null;

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  const [cl] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const cids = cl.map((c) => c.id);
  if (uids.length) {
    await pool.query(
      `DELETE n FROM notifications n WHERE n.actor_user_id IN (?)
         OR (n.entity_type = 'sales_quotation' AND n.entity_id IN (SELECT id FROM sales_quotations WHERE created_by IN (?) OR requested_by IN (?)))
         OR (n.entity_type = 'lead' AND n.entity_id IN (SELECT id FROM leads WHERE created_by IN (?)))`,
      [uids, uids, uids, uids]
    ).catch(() => {});
    await pool.query('DELETE FROM sales_quotations WHERE created_by IN (?) OR requested_by IN (?)', [uids, uids]);
    await pool.query('DELETE FROM proposals WHERE created_by IN (?)', [uids]);
    await pool.query('DELETE FROM leads WHERE created_by IN (?)', [uids]);
  }
  if (cids.length) {
    await pool.query('DELETE FROM payments WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM credit_notes WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
  }
  if (uids.length) {
    await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
  }
}

async function setup() {
  await purge();
  [series] = await pool.query('SELECT code, next_number, current_fy FROM invoice_number_series');
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['fe', 'field-executive', 'member']]) {
    const [r] = await pool.query("INSERT INTO users (name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, 'active', 0)", [`DOCS ${key}`, `${key}${DOMAIN}`, hash, legacy]);
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    users[key] = { id: r.insertId, s: new Session() };
  }
  const [c] = await pool.query("INSERT INTO clients (name, client_code, email, company_name, status) VALUES ('DOCS Client', ?, ?, 'DOCS Client', 'active')", [`DOC-${Date.now()}`, `client${DOMAIN}`]);
  clientId = c.insertId;
  for (const k of Object.keys(users)) await users[k].s.login(`${k}${DOMAIN}`);
}

const tiers = [{ name: 'Starter', price: 10000, inclusions: 'A' }, { name: 'Growth', price: 20000, inclusions: 'B', isRecommended: true }];

async function run() {
  await setup();
  const { owner, fe } = { owner: users.owner.s, fe: users.fe.s };
  const anon = new Session();
  let r = await fe.req('POST', '/sales/leads', { title: 'DOCS Lead', companyName: 'DOCS Lead Co', source: 'Website' });
  const leadId = r.body?.lead?.id;

  console.log('\n── Proposals ──');
  r = await owner.req('POST', '/sales/proposals', { leadId, title: 'Draft one', billingCycle: 'monthly', gstMode: 'gst', tiers });
  check('draft proposal can be deleted', (await owner.req('DELETE', `/sales/proposals/${r.body?.proposal?.id}`)).status, 200);
  r = await owner.req('POST', '/sales/proposals', { leadId, title: 'Shared one', billingCycle: 'monthly', gstMode: 'gst', tiers });
  const p1 = r.body?.proposal;
  await owner.req('POST', `/sales/proposals/${p1.id}/send`);
  check('shared proposal can still be edited', (await owner.req('PUT', `/sales/proposals/${p1.id}`, { leadId, title: 'Shared one v2', billingCycle: 'monthly', gstMode: 'gst', tiers })).status, 200);
  check('shared proposal cannot be deleted before withdrawing', (await owner.req('DELETE', `/sales/proposals/${p1.id}`)).status, 409);
  check('marketer cannot withdraw', (await fe.req('POST', `/sales/proposals/${p1.id}/withdraw`)).status, 403);
  check('withdraw', (await owner.req('POST', `/sales/proposals/${p1.id}/withdraw`)).body?.proposal?.status, 'withdrawn');
  check('client link shows withdrawn', (await anon.req('GET', `/public/proposals/${p1.public_token}`)).body?.proposal?.status, 'withdrawn');
  check('client cannot accept a withdrawn proposal', (await anon.req('POST', `/public/proposals/${p1.public_token}/decision`, { decision: 'reject', name: 'Client X' })).status, 409);
  check('withdrawn proposal is locked for edits', (await owner.req('PUT', `/sales/proposals/${p1.id}`, { leadId, title: 'Changed title', billingCycle: 'monthly', gstMode: 'gst', tiers })).status, 409);
  r = await owner.req('POST', `/sales/proposals/${p1.id}/duplicate`);
  check('duplicate makes a new draft with the same packages', `${r.status}/${r.body?.proposal?.status}/${r.body?.tiers?.length}`, '201/draft/2');
  check('copy is titled as a copy', r.body?.proposal?.title, 'Shared one v2 (copy)');
  const p2 = r.body?.proposal;
  check('withdrawn proposal can be deleted', (await owner.req('DELETE', `/sales/proposals/${p1.id}`)).status, 200);
  await owner.req('POST', `/sales/proposals/${p2.id}/send`);
  const growth = (await anon.req('GET', `/public/proposals/${p2.public_token}`)).body?.tiers?.find((t) => t.name === 'Growth');
  await anon.req('POST', `/public/proposals/${p2.public_token}/decision`, { decision: 'accept', tierId: growth.id, name: 'Client X' });
  check('accepted proposal cannot be deleted', (await owner.req('DELETE', `/sales/proposals/${p2.id}`)).status, 409);
  check('accepted proposal cannot be withdrawn', (await owner.req('POST', `/sales/proposals/${p2.id}/withdraw`)).status, 409);

  console.log('\n── Quotations ──');
  r = await fe.req('POST', '/sales/quotes', { leadId, title: 'Request', items: [{ description: 'SEO', quantity: 1 }] });
  check('marketer can delete own unpriced request', (await fe.req('DELETE', `/sales/quotes/${r.body?.quote?.id}`)).status, 200);
  r = await owner.req('POST', '/sales/quotes', { leadId, title: 'Draft', items: [{ description: 'SEO', quantity: 1, unitPrice: 10000 }] });
  check('draft quotation can be deleted', (await owner.req('DELETE', `/sales/quotes/${r.body?.quote?.id}`)).status, 200);
  r = await owner.req('POST', '/sales/quotes', { leadId, title: 'Sent one', items: [{ description: 'SEO', quantity: 1, unitPrice: 10000 }] });
  const q1 = r.body?.quote?.id;
  r = await owner.req('POST', `/sales/quotes/${q1}/send`);
  const qt1 = r.body?.quote?.public_token;
  r = await owner.req('PUT', `/sales/quotes/${q1}`, { items: [{ description: 'SEO', quantity: 1, unitPrice: 10000 }, { description: 'GMB', quantity: 1, unitPrice: 5000 }], revisionNote: 'Added GMB' });
  check('admin edits a sent quotation → new revision', `${r.body?.quote?.status}/${r.body?.totals?.total}/${r.body?.rounds?.at(-1)?.kind}`, 'sent/17700/revision');
  check('revision note kept', r.body?.rounds?.at(-1)?.note, 'Added GMB');
  check('client sees the edited quotation', (await anon.req('GET', `/public/quotes/${qt1}`)).body?.items?.length, 2);
  check('editing a sent quote needs prices on every line', (await owner.req('PUT', `/sales/quotes/${q1}`, { items: [{ description: 'x', quantity: 1 }] })).status, 400);
  check('marketer cannot edit a sent quotation', (await fe.req('PUT', `/sales/quotes/${q1}`, { title: 'Changed title' })).status, 409);
  check('sent quotation cannot be deleted before cancelling', (await owner.req('DELETE', `/sales/quotes/${q1}`)).status, 409);
  check('marketer cannot cancel', (await fe.req('POST', `/sales/quotes/${q1}/cancel`, {})).status, 403);
  check('cancel', (await owner.req('POST', `/sales/quotes/${q1}/cancel`, { reason: 'Client chose another scope' })).body?.quote?.status, 'cancelled');
  check('client link shows cancelled', (await anon.req('GET', `/public/quotes/${qt1}`)).body?.quote?.status, 'cancelled');
  check('cancelled quotation cannot be accepted', (await anon.req('POST', `/public/quotes/${qt1}/decision`, { decision: 'accept', name: 'Client X' })).status, 409);
  r = await owner.req('POST', `/sales/quotes/${q1}/duplicate`);
  check('duplicate → new number, draft, prices kept', `${r.status}/${r.body?.quote?.status}/${r.body?.totals?.total}`, '201/draft/17700');
  const q2 = r.body?.quote?.id;
  check('cancelled quotation can be deleted', (await owner.req('DELETE', `/sales/quotes/${q1}`)).status, 200);
  r = await owner.req('POST', `/sales/quotes/${q2}/send`);
  await anon.req('POST', `/public/quotes/${r.body?.quote?.public_token}/decision`, { decision: 'accept', name: 'Client X' });
  check('accepted quotation cannot be edited', (await owner.req('PUT', `/sales/quotes/${q2}`, { title: 'Changed title' })).status, 409);
  check('accepted quotation cannot be cancelled', (await owner.req('POST', `/sales/quotes/${q2}/cancel`, {})).status, 409);
  check('accepted quotation cannot be deleted', (await owner.req('DELETE', `/sales/quotes/${q2}`)).status, 409);
  r = await fe.req('POST', `/sales/quotes/${q2}/duplicate`);
  check('marketer duplicate → new request without prices', `${r.body?.quote?.status}/${r.body?.items?.[0]?.unit_price}`, 'requested/null');

  console.log('\n── Invoices: duplicate, payment reversal, cancel ──');
  r = await owner.req('POST', '/finance/invoices', { invoiceType: 'INV', clientId, invoiceDate: '2026-11-16', issue: true, items: [{ description: 'Retainer', quantity: 1, unitPrice: 10000, gstRate: 18 }] });
  const inv = r.body?.invoice;
  check('issued invoice', inv?.status, 'issued');
  check('issued invoice cannot be edited', (await owner.req('PUT', `/finance/invoices/${inv.id}`, { invoiceType: 'INV', clientId, invoiceDate: '2026-11-16', items: [{ description: 'x', quantity: 1, unitPrice: 1, gstRate: 18 }] })).status, 409);
  r = await owner.req('POST', `/invoices/${inv.id}/payments`, { amount: 5000, paymentDate: '2026-11-16', paymentMethod: 'cheque', transactionReference: 'CHQ-9' });
  const payId = (await pool.query('SELECT id FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1', [inv.id]))[0][0]?.id;
  check('cancel blocked while a payment exists', (await owner.req('POST', `/finance/invoices/${inv.id}/cancel`, { reason: 'Wrong client' })).status, 409);
  check('reversal needs a reason', (await owner.req('POST', `/finance/invoices/${inv.id}/payments/${payId}/reverse`, { reason: 'x' })).status, 400);
  r = await owner.req('POST', `/finance/invoices/${inv.id}/payments/${payId}/reverse`, { reason: 'Cheque bounced' });
  check('payment reversed → balance back to full, status issued', `${r.body?.invoice?.status}/${Number(r.body?.invoice?.outstanding_balance)}`, 'issued/11800');
  check('payment kept on record as reversed', `${r.body?.payments?.[0]?.payment_status}/${r.body?.payments?.[0]?.reversal_reason}`, 'reversed/Cheque bounced');
  check('reversing twice refused', (await owner.req('POST', `/finance/invoices/${inv.id}/payments/${payId}/reverse`, { reason: 'Again' })).status, 409);
  r = await owner.req('GET', '/finance/reports/payments?from=2026-11-16&to=2026-11-16');
  check('reversed payment excluded from payments report', r.body?.rows?.some((x) => x.transaction_reference === 'CHQ-9'), false);
  check('now it can be cancelled with a credit note', Boolean((await owner.req('POST', `/finance/invoices/${inv.id}/cancel`, { reason: 'Wrong client' })).body?.creditNote), true);
  r = await owner.req('POST', `/finance/invoices/${inv.id}/duplicate`);
  check('cancelled invoice duplicated into a new draft', `${r.status}/${r.body?.invoice?.status}/${Number(r.body?.invoice?.total_amount)}`, '201/draft/11800');
  check('draft copy can be deleted', (await owner.req('POST', `/finance/invoices/${r.body?.invoice?.id}/cancel`, { reason: 'Draft deleted' })).body?.deleted, true);
  check('marketer cannot duplicate invoices', (await fe.req('POST', `/finance/invoices/${inv.id}/duplicate`)).status, 403);
}

run()
  .catch((e) => { console.error('Crashed:', e); results.push(false); })
  .finally(async () => {
    try {
      await purge();
      for (const s of series) await pool.query('UPDATE invoice_number_series SET next_number = ?, current_fy = ? WHERE code = ?', [s.next_number, s.current_fy, s.code]);
    } catch (e) {
      console.error('Cleanup failed:', e.message);
    }
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} checks passed.`);
    await pool.end();
    process.exit(passed === results.length ? 0 : 1);
  });
