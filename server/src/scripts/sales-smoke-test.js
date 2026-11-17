/**
 * Sales pipeline smoke test — local development only.
 * Throw-away users / leads / proposals (@sales.test), driven through the HTTP API, then removed.
 *   node src/scripts/sales-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { SalesRemindersService, istDate, istDateTime } from '../modules/sales/salesReminders.service.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'SalesTest#2026'; // test-only credential for the @sales.test fixture accounts
const DOMAIN = '@sales.test';

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
let series = [];

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  if (!uids.length) return;
  const [leads] = await pool.query('SELECT id, converted_client_id FROM leads WHERE created_by IN (?) OR owner_user_id IN (?)', [uids, uids]);
  const clientIds = [...new Set(leads.map((l) => l.converted_client_id).filter(Boolean))];
  const [cl] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  clientIds.push(...cl.map((c) => c.id));
  // Notifications about these records also reach real owners/admins — remove those too.
  await pool.query(
    `DELETE n FROM notifications n WHERE n.actor_user_id IN (?) OR
       (n.entity_type = 'lead' AND n.entity_id IN (?))
       OR (n.entity_type = 'proposal' AND n.entity_id IN (SELECT id FROM proposals WHERE created_by IN (?)))
       OR (n.entity_type = 'invoice' AND n.entity_id IN (SELECT id FROM invoices WHERE client_id IN (?)))
       OR (n.entity_type = 'meeting' AND n.entity_id IN (SELECT id FROM sales_meetings WHERE created_by IN (?)))`,
    [uids, leads.length ? leads.map((l) => l.id) : [0], uids, clientIds.length ? clientIds : [0], uids]
  ).catch((e) => console.error('notification cleanup:', e.message));
  await pool.query('DELETE FROM proposals WHERE created_by IN (?)', [uids]);
  if (clientIds.length) {
    await pool.query('DELETE FROM payments WHERE client_id IN (?)', [clientIds]);
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [clientIds]);
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id IN (?)', [clientIds]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?) AND parent_project_id IS NOT NULL', [clientIds]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?)', [clientIds]);
  }
  await pool.query('DELETE FROM leads WHERE created_by IN (?) OR owner_user_id IN (?)', [uids, uids]);
  await pool.query('DELETE FROM sales_meetings WHERE created_by IN (?)', [uids]);
  if (clientIds.length) {
    await pool.query('DELETE FROM account_manager_history WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM client_activity_logs WHERE client_id IN (?)', [clientIds]).catch(() => {});
    await pool.query('DELETE FROM users WHERE client_id IN (?)', [clientIds]);
    await pool.query('DELETE FROM clients WHERE id IN (?)', [clientIds]);
  }
  await pool.query('DELETE FROM sales_reminder_log WHERE user_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
}

async function setup() {
  await purge();
  [series] = await pool.query('SELECT code, next_number, current_fy FROM invoice_number_series');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [[cl]] = [[null]];
  const [cr] = await pool.query("INSERT INTO clients (name, client_code, email, company_name, status) VALUES ('SALES Portal Co', ?, ?, 'SALES Portal Co', 'active')", [`SAL-${Date.now()}`, `portal${DOMAIN}`]);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['am', 'account-manager', 'account_manager'], ['fe1', 'field-executive', 'member'], ['fe2', 'field-executive', 'member'], ['emp', 'employee', 'employee'], ['client', 'client', 'client']]) {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password, client_id) VALUES (?, ?, ?, ?, 'active', 0, ?)",
      [`SALES ${key}`, `${key}${DOMAIN}`, hash, legacy, key === 'client' ? cr.insertId : null]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    users[key] = { id: r.insertId, s: new Session() };
  }
  for (const k of Object.keys(users)) await users[k].s.login(`${k}${DOMAIN}`);
  return cl;
}

async function run() {
  await setup();
  const { owner, am, fe1, fe2, emp, client } = Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.s]));
  const anon = new Session();

  console.log('\n── Leads & isolation ──');
  check('invalid lead source rejected', (await fe1.req('POST', '/sales/leads', { title: 'X', source: 'Billboard' })).status, 400);
  let r = await fe1.req('POST', '/sales/leads', { title: 'SALES Arrow Rehab', companyName: 'Arrow Rehab', phone: '9000000001', source: 'Paid Ads', servicesInterested: 'SEO + Ads', estimatedValue: 30000, ownerUserId: users.fe2.id });
  const leadId = r.body?.lead?.id;
  check('marketer creates lead', r.status, 201);
  check('marketer\'s enquiry arrives unassigned for the admin (cannot self-assign)', r.body?.lead?.owner_user_id, null);
  check('marketer becomes the REP', r.body?.lead?.rep_user_id, users.fe1.id);
  check('REP can open their enquiry', (await fe1.req('GET', `/sales/leads/${leadId}`)).status, 200);
  check('admin notified of new enquiry to assign', (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'lead_submitted' AND entity_id = ?", [users.owner.id, leadId]))[0][0].n >= 1, true);
  check('other marketer cannot open it (new API)', (await fe2.req('GET', `/sales/leads/${leadId}`)).status, 403);
  check('other marketer cannot open it (old /leads API, fixed)', (await fe2.req('GET', `/leads/${leadId}`)).status, 403);
  check('other marketer does not see it in the list', (await fe2.req('GET', '/sales/leads')).body?.leads?.some((l) => l.id === leadId), false);
  check('owner sees it', (await owner.req('GET', `/sales/leads/${leadId}`)).status, 200);
  check('employee (no leads.view) blocked', (await emp.req('GET', '/sales/leads')).status, 403);
  check('client portal blocked', (await client.req('GET', '/sales/dashboard')).status, 403);

  console.log('\n── Follow-ups & stages ──');
  r = await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'call', title: 'Intro call', outcome: 'Interested in SEO', stageTo: 'Contacted', nextFollowupDate: '2026-11-10' });
  check('call logged with stage move', r.body?.lead?.stage, 'Contacted');
  check('timeline records stage change', r.body?.interactions?.[0]?.stage_from + '→' + r.body?.interactions?.[0]?.stage_to, 'New→Contacted');
  check('Won via follow-up blocked (must onboard)', (await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'note', title: 'Closed', stageTo: 'Won' })).status, 409);
  check('unknown stage rejected', (await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'note', title: 'x', stageTo: 'Banana' })).status, 400);

  console.log('\n── Enquiry desk: referrer, call minutes, negotiation rounds, delete ──');
  r = await fe1.req('PUT', `/sales/leads/${leadId}`, { title: 'Arrow Rehab', companyName: 'Arrow Rehab', source: 'Paid Ads', referrerName: 'Selvaraj Sir (Test)', estimatedValue: 30000 });
  check('referrer name saved', r.body?.lead?.referrer_name, 'Selvaraj Sir (Test)');
  check('list search finds referrer', (await fe1.req('GET', '/sales/leads?search=Selvaraj')).body?.leads?.some((l) => l.id === leadId), true);
  r = await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'call', title: 'Pricing call', durationMinutes: 15 });
  check('call duration totalled', r.body?.stats?.callMinutes, 15);
  r = await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'negotiation', title: 'Round one', revisedBudget: '' });
  check('negotiation numbered round 1', r.body?.interactions?.[0]?.negotiation_round, 1);
  check('blank revised budget stays blank (not ₹0)', r.body?.interactions?.[0]?.amount, null);
  check('deal budget untouched by blank round', Number(r.body?.lead?.estimated_value), 30000);
  r = await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'negotiation', title: 'Round two', revisedBudget: 27500 });
  check('round 2 revised budget becomes deal value', `${r.body?.interactions?.[0]?.negotiation_round}/${Number(r.body?.lead?.estimated_value)}`, '2/27500');
  check('status change needs a different status', (await fe1.req('POST', `/sales/leads/${leadId}/interactions`, { type: 'stage_change', title: 'x', stageTo: 'Contacted' })).status, 400);
  r = await fe1.req('POST', '/sales/leads', { title: 'Throwaway', companyName: 'Throwaway', source: 'Website' });
  const throwId = r.body?.lead?.id;
  check('new enquiry gets an opening history entry', r.body?.interactions?.[0]?.title, 'Enquiry created');
  check('marketer cannot delete an enquiry', (await fe1.req('DELETE', `/sales/leads/${throwId}`)).status, 403);
  check('owner deletes an enquiry', (await owner.req('DELETE', `/sales/leads/${throwId}`)).status, 200);
  check('deleted enquiry is gone', (await owner.req('GET', `/sales/leads/${throwId}`)).status, 404);
  check('period filter on list (custom range excludes today)', (await owner.req('GET', '/sales/leads?period=custom&from=2020-01-01&to=2020-01-31')).body?.leads?.some((l) => l.id === leadId), false);

  r = await fe1.req('GET', '/sales/dashboard?period=month');
  check('overdue follow-up shows on dashboard', r.body?.followupsDue?.some((x) => x.id === leadId), true);
  check('paid-ads source counted', r.body?.bySource?.find((s) => s.source === 'Paid Ads')?.leads >= 1, true);
  check('marketer cannot reassign', (await fe1.req('PUT', `/sales/leads/${leadId}/owner`, { ownerUserId: users.fe2.id })).status, 403);
  r = await owner.req('PUT', `/sales/leads/${leadId}/owner`, { ownerUserId: users.fe2.id });
  check('owner reassigns to marketer 2', r.body?.lead?.owner_user_id, users.fe2.id);
  check('marketer 2 can now open it', (await fe2.req('GET', `/sales/leads/${leadId}`)).status, 200);
  r = await owner.req('GET', '/sales/marketers?period=all');
  check('marketer stats list both marketers', [users.fe1.id, users.fe2.id].every((id) => r.body?.marketers?.some((m) => m.id === id)), true);
  check('marketer sees only own stats', (await fe1.req('GET', '/sales/marketers')).body?.marketers?.map((m) => m.id).join(), String(users.fe1.id));

  console.log('\n── Sales desk & reminders ──');
  r = await fe1.req('GET', '/sales/desk');
  check('REP desk lists the enquiry under "sent"', r.body?.sent?.some((l) => l.id === leadId), true);
  check('REP desk does not list it as assigned', r.body?.assigned?.some((l) => l.id === leadId), false);
  r = await fe2.req('GET', '/sales/desk');
  check('assignee desk lists it under "assigned"', r.body?.assigned?.some((l) => l.id === leadId && l.rep_name === 'SALES fe1'), true);
  check('assignee desk shows the overdue follow-up', r.body?.followups?.overdue?.some((f) => f.id === leadId), true);
  check('marketer cannot open another person\'s desk', (await fe1.req('GET', `/sales/desk?userId=${users.fe2.id}`)).status, 403);
  check('owner can open a marketer\'s desk', (await owner.req('GET', `/sales/desk?userId=${users.fe2.id}`)).body?.user?.id, users.fe2.id);
  check('marketer cannot change the REP', (await fe2.req('PUT', `/sales/leads/${leadId}`, { title: 'Arrow Rehab', repUserId: users.fe2.id })).body?.lead?.rep_user_id, users.fe1.id);
  const soon = istDateTime(new Date(Date.now() + 30 * 60000)).slice(0, 16).replace(' ', 'T');
  r = await fe2.req('POST', '/sales/meetings', { leadId, title: 'Pricing call', mode: 'online', startsAt: soon });
  const soonId = r.body?.id;
  const reminders = async (kind) => (await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = ?", [users.fe2.id, kind]))[0][0].n;
  await SalesRemindersService.meetingReminders(new Date());
  check('meeting reminder sent ~1 hour before', await reminders('meeting_reminder'), 1);
  await SalesRemindersService.meetingReminders(new Date());
  check('meeting reminder not repeated', await reminders('meeting_reminder'), 1);
  const nineAm = new Date(`${istDate(new Date())}T09:00:00+05:30`);
  await SalesRemindersService.followupDigest(new Date(`${istDate(new Date())}T07:00:00+05:30`));
  check('no follow-up summary before 8 AM', await reminders('followup_reminder'), 0);
  await SalesRemindersService.followupDigest(nineAm);
  check('morning follow-up summary sent', await reminders('followup_reminder'), 1);
  await SalesRemindersService.followupDigest(nineAm);
  check('follow-up summary once a day', await reminders('followup_reminder'), 1);
  await pool.query('DELETE FROM sales_meetings WHERE id = ?', [soonId]);

  console.log('\n── Meetings ──');
  check('meeting needs a lead or client', (await fe2.req('POST', '/sales/meetings', { title: 'x', mode: 'online', startsAt: '2026-11-20T10:00' })).status, 400);
  r = await fe2.req('POST', '/sales/meetings', { leadId, title: 'Discovery meeting', mode: 'offline', startsAt: '2026-11-20T10:30', location: 'Client office', agenda: 'Scope' });
  const mid = r.body?.id;
  check('meeting scheduled', r.status, 201);
  check('completing without decisions refused', (await fe2.req('PUT', `/sales/meetings/${mid}`, { status: 'completed' })).status, 400);
  r = await fe2.req('PUT', `/sales/meetings/${mid}`, { status: 'completed', minutes: 'Discussed SEO', decisions: 'Send 3-tier proposal by Friday' });
  check('meeting completed with decisions', r.body?.meeting?.status, 'completed');
  const [[portalClient]] = await pool.query('SELECT id FROM clients WHERE email = ?', [`portal${DOMAIN}`]);
  r = await fe2.req('POST', '/sales/meetings', { clientId: portalClient.id, title: 'Client review', mode: 'online', startsAt: '2026-11-21T11:00' });
  check('marketer 1 cannot edit marketer 2 client meeting', (await fe1.req('PUT', `/sales/meetings/${r.body?.id}`, { title: 'hijack' })).status, 403);
  check('lead creator keeps access to its meetings after reassignment', (await fe1.req('PUT', `/sales/meetings/${mid}`, { location: 'Client office, 2nd floor' })).status, 200);

  console.log('\n── Proposals & public link ──');
  const tiers = [
    { name: 'Starter', price: 15000, inclusions: '8 posts\nBasic SEO' },
    { name: 'Growth', price: 25000, inclusions: '12 posts\nSEO + GMB', isRecommended: true },
    { name: 'Premium', price: 40000, inclusions: '20 posts\nSEO + Ads' }
  ];
  check('marketer cannot create a priced proposal', (await fe2.req('POST', '/sales/proposals', { leadId, title: 'x', billingCycle: 'monthly', gstMode: 'gst', tiers })).status, 403);
  check('two recommended packages refused', (await owner.req('POST', '/sales/proposals', { leadId, title: 'x', billingCycle: 'monthly', gstMode: 'gst', tiers: tiers.map((t) => ({ ...t, isRecommended: true })) })).status, 400);
  r = await owner.req('POST', '/sales/proposals', { leadId, title: 'Growth plan for Arrow Rehab', billingCycle: 'monthly', gstMode: 'gst', validUntil: '2027-01-31', tiers });
  const pid = r.body?.proposal?.id;
  const token = r.body?.proposal?.public_token;
  check('admin creates 3-tier proposal', r.status === 201 && r.body?.tiers?.length === 3, true, r.body?.proposal?.proposal_code);
  check('draft link is not public yet', (await anon.req('GET', `/public/proposals/${token}`)).status, 404);
  r = await owner.req('POST', `/sales/proposals/${pid}/send`);
  check('shared → status sent', r.body?.proposal?.status, 'sent');
  check('lead moved to Proposal Sent', (await fe2.req('GET', `/sales/leads/${leadId}`)).body?.lead?.stage, 'ProposalSent');
  r = await anon.req('GET', `/public/proposals/${token}`);
  check('public link opens without login', r.status, 200);
  check('public page hides internal ids', r.body && !('public_token' in (r.body.proposal || {})) && !('created_by' in (r.body.proposal || {})), true);
  check('view tracked (sent → viewed)', (await fe2.req('GET', `/sales/proposals/${pid}`)).body?.proposal?.status, 'viewed');
  check('wrong token 404', (await anon.req('GET', `/public/proposals/${'0'.repeat(32)}`)).status, 404);
  check('accept without a package refused', (await anon.req('POST', `/public/proposals/${token}/decision`, { decision: 'accept', name: 'Dr Arun' })).status, 400);
  const growth = r.body.tiers.find((t) => t.name === 'Growth');
  r = await anon.req('POST', `/public/proposals/${token}/decision`, { decision: 'accept', tierId: growth.id, name: 'Dr Arun', note: 'Start December' });
  check('client accepts Growth', r.body?.proposal?.status, 'accepted');
  check('second decision refused', (await anon.req('POST', `/public/proposals/${token}/decision`, { decision: 'reject', name: 'Someone Else' })).status, 409);
  check('accepted proposal locked for edits', (await owner.req('PUT', `/sales/proposals/${pid}`, { leadId, title: 'Updated title', billingCycle: 'monthly', gstMode: 'gst', tiers })).status, 409);
  check('marketer cannot convert (no proposals.convert)', (await fe2.req('POST', `/sales/proposals/${pid}/convert`, { assigneeId: users.fe2.id, invoiceDate: '2026-11-14' })).status, 403);
  check('account manager cannot open marketer\'s proposal on another lead', (await am.req('GET', `/sales/proposals/${pid}`)).status, 403);
  r = await owner.req('POST', `/sales/proposals/${pid}/convert`, { assigneeId: users.am.id, invoiceDate: '2026-11-14' });
  check('owner converts: client + project + invoice', r.status === 200 && r.body?.clientId && r.body?.projectId && r.body?.invoiceId ? 'ok' : JSON.stringify(r.body), 'ok');
  const conv = r.body;
  const [[proj]] = await pool.query('SELECT project_category, name FROM projects WHERE id = ?', [conv.projectId]);
  check('monthly proposal → Regular project', proj?.project_category, 'regular', proj?.name);
  const [[inv]] = await pool.query('SELECT status, invoice_type, total_amount FROM invoices WHERE id = ?', [conv.invoiceId]);
  check('draft GST invoice for the accepted price + GST', `${inv?.status}/${inv?.invoice_type}/${Number(inv?.total_amount)}`, 'draft/INV/29500');
  check('lead marked Won', (await owner.req('GET', `/sales/leads/${leadId}`)).body?.lead?.stage, 'Won');
  check('converting twice refused', (await owner.req('POST', `/sales/proposals/${pid}/convert`, { assigneeId: users.am.id, invoiceDate: '2026-11-14' })).status, 409);

  r = await fe1.req('POST', '/sales/leads', { title: 'SALES Second lead', source: 'Referral' });
  const lead2 = r.body?.lead?.id;
  r = await owner.req('POST', '/sales/proposals', { leadId: lead2, title: 'Website', billingCycle: 'one_time', gstMode: 'non_gst', tiers: [{ name: 'Basic', price: 20000 }] });
  const t2 = r.body?.proposal?.public_token;
  await owner.req('POST', `/sales/proposals/${r.body.proposal.id}/send`);
  r = await anon.req('POST', `/public/proposals/${t2}/decision`, { decision: 'reject', name: 'Owner', note: 'Budget' });
  check('client can decline', r.body?.proposal?.status, 'rejected');
  r = await fe2.req('GET', '/sales/proposals');
  check('marketer 2 does not see marketer 1 proposals', r.body?.proposals?.some((p) => p.title === 'Website'), false, `${r.body?.proposals?.length} visible`);
  check('marketer 1 sees own proposal', (await fe1.req('GET', '/sales/proposals')).body?.proposals?.some((p) => p.title === 'Website'), true);
}

run()
  .catch((e) => { console.error('Crashed:', e); results.push(false); })
  .finally(async () => {
    try {
      await purge();
      for (const s of series) await pool.query('UPDATE invoice_number_series SET next_number = ?, current_fy = ? WHERE code = ?', [s.next_number, s.current_fy, s.code]);
      console.log('\nFixtures removed.');
    } catch (e) { console.error('Cleanup failed:', e.message); }
    const failed = results.filter((x) => !x).length;
    console.log(`${results.length - failed}/${results.length} checks passed.`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
