/**
 * Quotation flow smoke test (Phase B) — local development only.
 * A marketing person requests a quotation (no prices) → admin prices and sends → client opens,
 * negotiates, gets a revised price, accepts. Throw-away @quotes.test users, cleaned up after.
 *   node src/scripts/quotes-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'QuotesTest#2026'; // test-only credential for the @quotes.test fixture accounts
const DOMAIN = '@quotes.test';

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
const check = (label, actual, expected, extra = '') => {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(actual)}${ok ? '' : '  (unexpected)'}${extra ? `  ${extra}` : ''}`);
};
const users = {};
let quoSeries = null;

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  if (!uids.length) return;
  const [leads] = await pool.query('SELECT converted_client_id FROM leads WHERE (created_by IN (?) OR owner_user_id IN (?)) AND converted_client_id IS NOT NULL', [uids, uids]);
  const clientIds = leads.map((l) => l.converted_client_id);
  // Notifications about these records also reach real owners/admins — remove those too.
  await pool.query(
    `DELETE n FROM notifications n WHERE n.actor_user_id IN (?) OR
       (n.entity_type = 'sales_quotation' AND n.entity_id IN (SELECT id FROM sales_quotations WHERE created_by IN (?) OR requested_by IN (?)))
       OR (n.entity_type = 'lead' AND n.entity_id IN (SELECT id FROM leads WHERE created_by IN (?) OR owner_user_id IN (?)))
       OR (n.entity_type = 'proposal' AND n.entity_id IN (SELECT id FROM proposals WHERE created_by IN (?)))
       OR (n.entity_type = 'invoice' AND n.entity_id IN (SELECT id FROM invoices WHERE client_id IN (?)))`,
    [uids, uids, uids, uids, uids, uids, clientIds.length ? clientIds : [0]]
  ).catch((e) => console.error('notification cleanup:', e.message));
  await pool.query('DELETE FROM sales_quotations WHERE created_by IN (?) OR requested_by IN (?)', [uids, uids]);
  await pool.query('DELETE FROM proposals WHERE created_by IN (?)', [uids]);
  if (clientIds.length) {
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [clientIds]);
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id IN (?)', [clientIds]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?) AND parent_project_id IS NOT NULL', [clientIds]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?)', [clientIds]);
  }
  await pool.query('DELETE FROM leads WHERE created_by IN (?) OR owner_user_id IN (?)', [uids, uids]);
  if (clientIds.length) {
    await pool.query('DELETE FROM client_onboarding_items WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM client_contacts WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM account_manager_history WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM client_activity_logs WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM clients WHERE id IN (?)', [clientIds]);
  }
  await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
}

async function setup() {
  await purge();
  [[quoSeries]] = await pool.query("SELECT next_number FROM invoice_number_series WHERE code = 'QUO'");
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['fe1', 'field-executive', 'member'], ['fe2', 'field-executive', 'member']]) {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, 'active', 0)",
      [`QUOTES ${key}`, `${key}${DOMAIN}`, hash, legacy]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    users[key] = { id: r.insertId, s: new Session() };
  }
  for (const k of Object.keys(users)) await users[k].s.login(`${k}${DOMAIN}`);
}

const notes = async (uid, type = 'quotation') => Number((await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = ?', [uid, type]))[0][0].n);

async function run() {
  await setup();
  const { owner, fe1, fe2 } = Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.s]));
  const anon = new Session();

  console.log('\n── Marketing person requests (no prices) ──');
  let r = await fe1.req('POST', '/sales/leads', { title: 'QUOTES Sri Clinic', companyName: 'Sri Clinic', phone: '9000000011', source: 'Marketing Person' });
  const leadId = r.body?.lead?.id;
  await owner.req('PUT', `/sales/leads/${leadId}/owner`, { ownerUserId: users.fe1.id });
  const [[svc]] = await pool.query("SELECT id, name FROM services WHERE status = 'active' ORDER BY id LIMIT 1");
  const items = [
    { serviceId: svc.id, description: svc.name, details: '12 posts, 2 reels', quantity: 1, unitPrice: 99999 },
    { description: 'Landing page', quantity: 1, unitPrice: 88888 }
  ];
  check('request needs a target', (await fe1.req('POST', '/sales/quotes', { title: 'x', items })).status, 400);
  check('request needs a service line', (await fe1.req('POST', '/sales/quotes', { leadId, title: 'x', items: [] })).status, 400);
  r = await fe1.req('POST', '/sales/quotes', { leadId, title: 'Digital marketing – monthly', requirements: 'Wants IVF leads', items });
  const qid = r.body?.quote?.id;
  check('marketer request saved', r.status, 201, r.body?.quote?.quote_number);
  check('numbered from the QUO series', /^QUO\d{3,}$/.test(r.body?.quote?.quote_number || ''), true);
  check('status awaiting price', r.body?.quote?.status, 'requested');
  check('prices typed by marketer are dropped', r.body?.items?.map((i) => i.unit_price).join(), ',');
  check('no totals shown before pricing', r.body?.totals, null);
  check('admin notified to price it', await notes(users.owner.id), 1);
  check('other marketer cannot open it', (await fe2.req('GET', `/sales/quotes/${qid}`)).status, 403);
  check('other marketer does not see it in the list', (await fe2.req('GET', '/sales/quotes')).body?.quotes?.some((q) => q.id === qid), false);
  check('marketer cannot send', (await fe1.req('POST', `/sales/quotes/${qid}/send`)).status, 403);
  check('marketer can still edit own request', (await fe1.req('PUT', `/sales/quotes/${qid}`, { requirements: 'Wants IVF leads + website', items })).status, 200);
  check('marketer list hides the client link', (await fe1.req('GET', '/sales/quotes')).body?.quotes?.find((q) => q.id === qid)?.public_token, undefined);

  console.log('\n── Admin prices and sends ──');
  check('sending without prices refused', (await owner.req('POST', `/sales/quotes/${qid}/send`)).status, 400);
  r = await owner.req('PUT', `/sales/quotes/${qid}`, {
    gstMode: 'gst', items: [{ ...items[0], unitPrice: 20000 }, { ...items[1], unitPrice: 5000 }], terms: '50% advance'
  });
  check('admin prices: 25,000 + 18% GST = 29,500', r.body?.totals?.total, 29500);
  r = await owner.req('POST', `/sales/quotes/${qid}/send`);
  const token = r.body?.quote?.public_token;
  check('sent', r.body?.quote?.status, 'sent');
  check('validity defaults to 15 days', Boolean(r.body?.quote?.valid_until), true);
  check('enquiry moved to Quotation / Proposal sent', (await owner.req('GET', `/sales/leads/${leadId}`)).body?.lead?.stage, 'ProposalSent');
  check('marketer told it is priced', await notes(users.fe1.id), 1);
  r = await fe1.req('GET', `/sales/quotes/${qid}`);
  check('marketer now sees the prices', r.body?.items?.map((i) => i.unit_price).join(), '20000,5000');
  check('marketer cannot edit after sending', (await fe1.req('PUT', `/sales/quotes/${qid}`, { title: 'changed' })).status, 409);
  check('admin edit after sending becomes a revision the client sees', (await owner.req('PUT', `/sales/quotes/${qid}`, { title: 'Digital marketing – monthly', revisionNote: 'Title updated' })).body?.rounds?.at(-1)?.kind, 'revision');

  console.log('\n── Client link: view, negotiate, revised price, accept ──');
  r = await owner.req('POST', '/sales/quotes', { leadId, title: 'Draft only', items: [{ description: 'SEO', quantity: 1, unitPrice: 1000 }] });
  check('admin-created quote starts as draft', r.body?.quote?.status, 'draft');
  check('draft is not public', (await anon.req('GET', `/public/quotes/${r.body?.quote?.public_token}`)).status, 404);
  const draftId = r.body?.quote?.id;
  r = await anon.req('GET', `/public/quotes/${token}`);
  check('client opens link without login', r.status, 200);
  check('client sees total', r.body?.totals?.total, 29500);
  check('client page hides internal fields', r.body && !('public_token' in (r.body.quote || {})) && !('requested_by' in (r.body.quote || {})), true);
  check('opening marks it viewed', (await owner.req('GET', `/sales/quotes/${qid}`)).body?.quote?.status, 'viewed');
  check('bad token 404', (await anon.req('GET', `/public/quotes/${'0'.repeat(32)}`)).status, 404);
  check('negotiate needs a message', (await anon.req('POST', `/public/quotes/${token}/decision`, { decision: 'negotiate', name: 'Dr Sri' })).status, 400);
  r = await anon.req('POST', `/public/quotes/${token}/decision`, { decision: 'negotiate', name: 'Dr Sri', note: 'Can you do 22k?', amount: 22000 });
  check('client asks to negotiate', r.body?.quote?.status, 'negotiating');
  check('enquiry moves to Negotiation', (await owner.req('GET', `/sales/leads/${leadId}`)).body?.lead?.stage, 'Negotiation');
  check('admin notified of negotiation', await notes(users.owner.id) >= 2, true);
  check('asking twice refused', (await anon.req('POST', `/public/quotes/${token}/decision`, { decision: 'negotiate', name: 'Dr Sri', note: 'again' })).status, 409);
  check('marketer cannot send a revised price', (await fe1.req('POST', `/sales/quotes/${qid}/revise`, { discountAmount: 5000 })).status, 403);
  check('revise needs a change', (await owner.req('POST', `/sales/quotes/${qid}/revise`, { note: 'nothing' })).status, 400);
  r = await owner.req('POST', `/sales/quotes/${qid}/revise`, { discountAmount: 2000, note: 'Special price for 6 months' });
  check('revised: (25,000 − 2,000) + GST = 27,140', r.body?.totals?.total, 27140);
  check('back to sent for the client', r.body?.quote?.status, 'sent');
  check('history: requested → priced → edit revision → client request → revision', r.body?.rounds?.map((x) => x.kind).join(','), 'requested,priced,revision,client_request,revision');
  check('negotiated revision is round 3', r.body?.rounds?.at(-1)?.round_no, 3);
  r = await anon.req('GET', `/public/quotes/${token}`);
  check('client sees revised total and discount', `${r.body?.totals?.total}/${r.body?.totals?.discount}`, '27140/2000');
  r = await anon.req('POST', `/public/quotes/${token}/decision`, { decision: 'accept', name: 'Dr Sri', note: 'Go ahead' });
  check('client accepts', r.body?.quote?.status, 'approved');
  check('second answer refused', (await anon.req('POST', `/public/quotes/${token}/decision`, { decision: 'reject', name: 'Xavier' })).status, 409);
  check('admin cannot re-decide', (await owner.req('POST', `/sales/quotes/${qid}/decision`, { decision: 'reject' })).status, 409);
  const [[leadRow]] = await pool.query("SELECT COUNT(*) AS n FROM lead_interactions WHERE lead_id = ? AND title LIKE 'Quotation % accepted%'", [leadId]);
  check('acceptance logged on the enquiry', Number(leadRow.n), 1);

  console.log('\n── Staff-logged negotiation, phone decisions, expiry ──');
  await owner.req('PUT', `/sales/quotes/${draftId}`, { items: [{ description: 'SEO', quantity: 1, unitPrice: 10000 }] });
  r = await owner.req('POST', `/sales/quotes/${draftId}/send`);
  const token2 = r.body?.quote?.public_token;
  r = await fe1.req('POST', `/sales/quotes/${draftId}/client-request`, { note: 'Client asked 10% off on the call', clientAmount: 9000 });
  check('marketer records a negotiation request', r.body?.quote?.status, 'negotiating');
  r = await owner.req('POST', `/sales/quotes/${draftId}/decision`, { decision: 'reject', note: 'Chose another agency' });
  check('admin marks declined after a phone call', r.body?.quote?.status, 'rejected');
  r = await owner.req('POST', '/sales/quotes', { leadId, title: 'Expired one', items: [{ description: 'Ads', quantity: 1, unitPrice: 5000 }], validUntil: '2020-01-01' });
  const expId = r.body?.quote?.id;
  await owner.req('POST', `/sales/quotes/${expId}/send`);
  r = await anon.req('GET', `/public/quotes/${(await pool.query('SELECT public_token FROM sales_quotations WHERE id = ?', [expId]))[0][0].public_token}`);
  check('expired quotation flagged on the client page', r.body?.quote?.expired, true);
  check('expired quotation cannot be accepted', (await anon.req('POST', `/public/quotes/${(await pool.query('SELECT public_token FROM sales_quotations WHERE id = ?', [expId]))[0][0].public_token}/decision`, { decision: 'accept', name: 'Xavier' })).status, 409);
  check('non-GST quote has no tax', await (async () => {
    const x = await owner.req('POST', '/sales/quotes', { leadId, title: 'No GST', gstMode: 'non_gst', items: [{ description: 'Consulting', quantity: 2, unitPrice: 3000 }] });
    return `${x.body?.totals?.tax}/${x.body?.totals?.total}`;
  })(), '0/6000');
  r = await fe1.req('GET', '/sales/desk');
  check('marketer desk lists their quotations', r.body?.quotes?.some((q) => q.id === qid), true);
  check('counts: accepted 1, declined excluded from pipeline', (await owner.req('GET', '/sales/quotes')).body?.counts?.approved >= 1, true);
  void token2;

  console.log('\n── Phase C: accepted quotation → onboard + invoice (no project) ──');
  check('marketer cannot convert', (await fe1.req('POST', `/sales/quotes/${qid}/convert`, { invoiceDate: '2026-11-20', projectMode: 'none' })).status, 403);
  check('project needs someone to run it', (await owner.req('POST', `/sales/quotes/${qid}/convert`, { invoiceDate: '2026-11-20', projectMode: 'one_time' })).status, 400);
  r = await owner.req('POST', `/sales/quotes/${qid}/convert`, { invoiceDate: '2026-11-20', projectMode: 'none' });
  check('converted', r.body?.quote?.status, 'converted');
  check('enquiry onboarded as client', Boolean(r.body?.clientId), true);
  const [[inv1]] = await pool.query('SELECT status, invoice_type, total_amount, discount_amount, client_id, project_id FROM invoices WHERE id = ?', [r.body?.invoiceId]);
  check('draft GST invoice = quotation total incl. negotiated discount', `${inv1?.status}/${inv1?.invoice_type}/${Number(inv1?.total_amount)}`, 'draft/INV/27140');
  check('invoice carries the ₹2,000 discount', Number(inv1?.discount_amount), 2000);
  check('no project when not asked', inv1?.project_id, null);
  check('enquiry marked Won', (await owner.req('GET', `/sales/leads/${leadId}`)).body?.lead?.stage, 'Won');
  check('converting twice refused', (await owner.req('POST', `/sales/quotes/${qid}/convert`, { invoiceDate: '2026-11-20', projectMode: 'none' })).status, 409);
  check('only accepted quotations convert', (await owner.req('POST', `/sales/quotes/${expId}/convert`, { invoiceDate: '2026-11-20' })).status, 409);

  console.log('\n── Phase C: proposal → chosen plan → quotation → retainer + invoice ──');
  r = await fe1.req('POST', '/sales/leads', { title: 'QUOTES Vivas', companyName: 'Vivas Women Centre', source: 'Referral' });
  const lead2 = r.body?.lead?.id;
  await owner.req('PUT', `/sales/leads/${lead2}/owner`, { ownerUserId: users.fe1.id });
  r = await owner.req('POST', '/sales/proposals', { leadId: lead2, title: 'Growth plan', billingCycle: 'monthly', gstMode: 'gst', tiers: [
    { name: 'Starter', price: 15000, inclusions: '8 posts' }, { name: 'Growth', price: 25000, inclusions: '12 posts + GMB', isRecommended: true, serviceId: svc.id }
  ] });
  const pid = r.body?.proposal?.id;
  const ptoken = r.body?.proposal?.public_token;
  check('quotation needs a chosen plan first', (await owner.req('POST', `/sales/proposals/${pid}/quote`)).status, 409);
  await owner.req('POST', `/sales/proposals/${pid}/send`);
  const growth = (await anon.req('GET', `/public/proposals/${ptoken}`)).body?.tiers?.find((t) => t.name === 'Growth');
  await anon.req('POST', `/public/proposals/${ptoken}/decision`, { decision: 'accept', tierId: growth.id, name: 'Dr Srividya' });
  check('marketer cannot make the quotation', (await fe1.req('POST', `/sales/proposals/${pid}/quote`)).status, 403);
  r = await owner.req('POST', `/sales/proposals/${pid}/quote`);
  const q3 = r.body?.quote?.id;
  check('chosen plan becomes a draft quotation', `${r.status}/${r.body?.quote?.status}`, '201/draft');
  check('plan price and service carried over', `${r.body?.items?.[0]?.unit_price}/${r.body?.items?.[0]?.service_id}`, `25000/${svc.id}`);
  check('linked to the proposal', r.body?.links?.proposal?.id, pid);
  check('one quotation per proposal', (await owner.req('POST', `/sales/proposals/${pid}/quote`)).status, 409);
  check('proposal shows its quotation', (await owner.req('GET', `/sales/proposals/${pid}`)).body?.quote?.id, q3);
  r = await owner.req('POST', `/sales/quotes/${q3}/send`);
  const qtoken3 = r.body?.quote?.public_token;
  await anon.req('POST', `/public/quotes/${qtoken3}/decision`, { decision: 'accept', name: 'Dr Srividya' });
  r = await owner.req('POST', `/sales/quotes/${q3}/convert`, { invoiceDate: '2026-11-20', projectMode: 'auto', assigneeId: users.fe1.id });
  check('monthly proposal → converted with a project', `${r.body?.quote?.status}/${Boolean(r.body?.projectId)}`, 'converted/true');
  const [[proj]] = await pool.query('SELECT project_category, billing_amount, retainer_auto_invoice FROM projects WHERE id = ?', [r.body?.projectId]);
  check('monthly retainer with the agreed fee', `${proj?.project_category}/${Number(proj?.billing_amount)}/${proj?.retainer_auto_invoice}`, 'regular/25000/1');
  const [[inv2]] = await pool.query('SELECT total_amount, project_id FROM invoices WHERE id = ?', [r.body?.invoiceId]);
  check('invoice 25,000 + GST on this month\'s cycle', `${Number(inv2?.total_amount)}/${Boolean(inv2?.project_id)}`, '29500/true');
  check('proposal marked converted', (await owner.req('GET', `/sales/proposals/${pid}`)).body?.proposal?.status, 'converted');
  check('marketer notified of the conversion', await notes(users.fe1.id) >= 3, true);
}

run()
  .catch((e) => { console.error('Crashed:', e); results.push(false); })
  .finally(async () => {
    try {
      await purge();
      if (quoSeries) await pool.query("UPDATE invoice_number_series SET next_number = ? WHERE code = 'QUO'", [quoSeries.next_number]);
    } catch (e) {
      console.error('Cleanup failed:', e.message);
    }
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} checks passed.`);
    await pool.end();
    process.exit(passed === results.length ? 0 : 1);
  });
