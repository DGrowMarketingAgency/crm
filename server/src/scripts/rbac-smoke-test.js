/**
 * RBAC smoke test (local development only).
 *
 * Creates one throw-away user per role (emails end in @rbac.test), logs in as each through the real HTTP API,
 * checks the client-project-flow permission matrix and sweeps the main existing GET endpoints for server errors,
 * then deletes everything it created.
 *
 *   node src/scripts/rbac-smoke-test.js            (API must be running; default http://localhost:5000)
 *   API_URL=http://localhost:5000 node src/scripts/rbac-smoke-test.js --keep   (keep fixtures for manual UI checks)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run the RBAC smoke test against a production environment.');
  process.exit(1);
}

const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const KEEP = process.argv.includes('--keep');
const TEST_PASSWORD = 'RbacTest#2026'; // test-only credential for the @rbac.test fixture accounts
const DOMAIN = '@rbac.test';

// role slug -> legacy users.role value
const ROLES = {
  owner: 'owner',
  admin: 'admin',
  'project-manager': 'project_manager',
  'account-manager': 'account_manager',
  'team-leader': 'member',
  employee: 'employee',
  'seo-exec': 'member',
  'dev-exec': 'member',
  'hr-admin': 'member',
  client: 'client'
};

// ───────────────────────── tiny HTTP client with a cookie jar ─────────────────────────
class Session {
  constructor(name) {
    this.name = name;
    this.cookies = {};
  }
  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
  }
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json', Cookie: this.cookieHeader() };
    if (this.cookies.xsrf_token) headers['X-CSRF-Token'] = this.cookies.xsrf_token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    this.store(res);
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body: json };
  }
  async login(email) {
    await this.req('GET', '/auth/csrf-token');
    const r = await this.req('POST', '/auth/login', { email, password: TEST_PASSWORD });
    if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

// ───────────────────────── assertions ─────────────────────────
const results = [];
function check(label, actual, expected, extra = '') {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  results.push({ ok, label, actual, expected, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${actual}${ok ? '' : ` (expected ${expected})`}${extra ? `  ${extra}` : ''}`);
  return ok;
}

// ───────────────────────── fixtures ─────────────────────────
const created = { users: [], clientId: null };

async function setup() {
  await purgeStale();
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [clientRes] = await pool.query(
    "INSERT INTO clients (name, client_code, email, company_name, status) VALUES ('RBAC Test Client', ?, ?, 'RBAC Test Client', 'active')",
    [`RBAC-${Date.now()}`, `client-org${DOMAIN}`]
  );
  created.clientId = clientRes.insertId;

  const users = {};
  for (const [slug, legacy] of Object.entries(ROLES)) {
    const email = `${slug}${DOMAIN}`;
    const [res] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password, client_id) VALUES (?, ?, ?, ?, 'active', 0, ?)",
      [`RBAC ${slug}`, email, hash, legacy, slug === 'client' ? created.clientId : null]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (!role) throw new Error(`Role ${slug} missing`);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [res.insertId, role.id]);
    users[slug] = { id: res.insertId, email };
    created.users.push(res.insertId);
  }
  await pool.query('UPDATE clients SET account_manager_id = ? WHERE id = ?', [users['account-manager'].id, created.clientId]);
  return users;
}

async function cleanup() {
  if (KEEP) {
    console.log('\n--keep given: fixtures left in place (users *@rbac.test, client "RBAC Test Client").');
    return;
  }
  await purge(created.users, created.clientId);
  console.log('\nFixtures cleaned up.');
}

/** Removes fixtures left by an earlier run (e.g. one started with --keep). */
async function purgeStale() {
  const [users] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const [clients] = await pool.query('SELECT id FROM clients WHERE email = ?', [`client-org${DOMAIN}`]);
  if (users.length || clients.length) {
    await purge(users.map((x) => x.id), clients[0]?.id || null);
    console.log('Removed fixtures from a previous run.');
  }
}

async function purge(ids, clientId) {
  if (clientId) {
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id = ?', [clientId]);
    await pool.query('DELETE FROM projects WHERE client_id = ? AND parent_project_id IS NOT NULL', [clientId]);
  }
  if (ids.length) {
    await pool.query('DELETE FROM tasks WHERE creator_id IN (?) OR assignee_id IN (?)', [ids, ids]);
    await pool.query('DELETE FROM projects WHERE project_manager_id IN (?) AND parent_project_id IS NOT NULL', [ids]);
    await pool.query('DELETE FROM projects WHERE client_id = ? OR project_manager_id IN (?)', [clientId || 0, ids]);
    await pool.query('DELETE FROM project_pipelines WHERE created_by IN (?)', [ids]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [ids]).catch(() => {});
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [ids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [ids]);
  }
  if (clientId) await pool.query('DELETE FROM clients WHERE id = ?', [clientId]);
}

// ───────────────────────── tests ─────────────────────────
async function run() {
  const u = await setup();
  const s = {};
  for (const slug of Object.keys(ROLES)) {
    s[slug] = new Session(slug);
    await s[slug].login(u[slug].email);
  }
  const C = created.clientId;
  const [[otherClient]] = await pool.query("SELECT id FROM clients WHERE status = 'active' AND id <> ? ORDER BY id LIMIT 1", [C]);

  console.log('\n── Fixture projects (created by owner via API) ──');
  const pipe = await s.owner.req('POST', '/project-flow/pipelines', {
    name: 'RBAC Test Pipeline',
    steps: [{ name: 'Research' }, { name: 'Build' }, { name: 'Approval', stepType: 'approval', needsAdminApproval: true, needsClientApproval: false }, { name: 'Ship' }]
  });
  check('owner creates pipeline', pipe.status, 201);
  const ps = pipe.body.pipeline.steps;
  const projA = await s.owner.req('POST', '/project-flow/projects', {
    clientId: C, name: 'RBAC Project A', category: 'one_time', pipelineId: pipe.body.pipeline.id, assignmentMode: 'team',
    teamLeaderId: u['team-leader'].id,
    stepAssignees: { [ps[0].id]: [u['seo-exec'].id], [ps[1].id]: [u.employee.id], [ps[3].id]: [u['seo-exec'].id] }
  });
  check('owner creates team project A', projA.status, 201);
  const A = projA.body.project;
  const projB = await s.owner.req('POST', '/project-flow/projects', {
    clientId: otherClient.id, name: 'RBAC Project B (other client)', category: 'urgent', assignmentMode: 'individual', assigneeId: u.admin.id
  });
  check('owner creates project B for another client', projB.status, 201);
  const B = projB.body.project;

  console.log('\n── Client portal is fully blocked ──');
  for (const path of ['/project-flow/clients', `/project-flow/clients/${C}/projects`, `/project-flow/projects/${A.id}`, '/project-flow/employees', '/project-flow/pipelines']) {
    check(`client GET ${path}`, (await s.client.req('GET', path)).status, 403);
  }

  console.log('\n── Client list scoping ──');
  const list = async (who) => s[who].req('GET', '/project-flow/clients');
  const ownerList = await list('owner');
  check('owner sees all active clients', ownerList.status, 200, `${ownerList.body.clients.length} clients`);
  for (const who of ['account-manager', 'team-leader', 'employee']) {
    const r = await list(who);
    check(`${who} client list only shows RBAC client`, r.status === 200 ? r.body.clients.map((c) => c.id).join(',') : r.status, String(C));
  }
  for (const who of ['seo-exec', 'dev-exec', 'hr-admin']) {
    check(`${who} (no projects.view) client list`, (await list(who)).status, 403);
  }

  console.log('\n── Client project page ──');
  const cp = async (who, id) => s[who].req('GET', `/project-flow/clients/${id}/projects`);
  let r = await cp('account-manager', C);
  check('AM opens own client', r.status, 200, `can_create=${r.body?.can_create}`);
  check('AM can_create on own client', r.body?.can_create, true);
  r = await cp('team-leader', C);
  check('team leader opens client (works on A)', r.status, 200);
  check('team leader can_create', r.body?.can_create, false);
  r = await cp('employee', C);
  check('employee only sees project A', r.status === 200 ? r.body.projects.map((p) => p.id).join(',') : r.status, String(A.id));
  check('AM opens a client they do not manage', (await cp('account-manager', otherClient.id)).status, 403);
  check('employee opens unrelated client', (await cp('employee', otherClient.id)).status, 403);
  check('PM opens any client', (await cp('project-manager', otherClient.id)).status, 200);

  console.log('\n── Project visibility ──');
  const view = async (who, id) => s[who].req('GET', `/project-flow/projects/${id}`);
  for (const [who, exp] of [['owner', 200], ['admin', 200], ['project-manager', 200], ['account-manager', 200], ['team-leader', 200], ['employee', 200], ['seo-exec', 200], ['dev-exec', 403], ['hr-admin', 403]]) {
    check(`${who} views project A`, (await view(who, A.id)).status, exp);
  }
  for (const [who, exp] of [['owner', 200], ['project-manager', 200], ['admin', 200], ['account-manager', 403], ['team-leader', 403], ['employee', 403], ['seo-exec', 403]]) {
    check(`${who} views project B (other client)`, (await view(who, B.id)).status, exp);
  }
  for (const [who, exp] of [['team-leader', true], ['account-manager', true], ['employee', false], ['seo-exec', false]]) {
    check(`${who} can_manage A`, (await view(who, A.id)).body?.project?.can_manage, exp);
  }

  console.log('\n── Creating projects ──');
  const newProj = (clientId) => ({ clientId, name: 'RBAC created', category: 'out_of_service', assignmentMode: 'individual', assigneeId: u.employee.id, billingAmount: 100 });
  const amProj = await s['account-manager'].req('POST', '/project-flow/projects', newProj(C));
  check('AM creates project for own client', amProj.status, 201);
  check('AM creates project for other client', (await s['account-manager'].req('POST', '/project-flow/projects', newProj(otherClient.id))).status, 403);
  check('PM creates project for any client', (await s['project-manager'].req('POST', '/project-flow/projects', newProj(C))).status, 201);
  check('team leader creates project (no projects.create)', (await s['team-leader'].req('POST', '/project-flow/projects', newProj(C))).status, 403);
  check('employee creates project', (await s.employee.req('POST', '/project-flow/projects', newProj(C))).status, 403);

  console.log('\n── Billing (out-of-service) ──');
  const oosId = amProj.body.project.id;
  check('AM updates billing on own client', (await s['account-manager'].req('PATCH', `/project-flow/projects/${oosId}/billing`, { billingStatus: 'billed' })).status, 200);
  check('employee updates billing', (await s.employee.req('PATCH', `/project-flow/projects/${oosId}/billing`, { billingStatus: 'paid' })).status, 403);
  check('team leader updates billing', (await s['team-leader'].req('PATCH', `/project-flow/projects/${oosId}/billing`, { billingStatus: 'paid' })).status, 403);

  console.log('\n── Step flow on project A ──');
  const st = A.steps.map((x) => x.id);
  const act = (who, path, body) => s[who].req('POST', `/project-flow/projects/${A.id}/steps/${path}`, body);
  check('dev-exec completes step 1 (not assigned)', (await act('dev-exec', `${st[0]}/complete`)).status, 403);
  check('employee completes step 1 (not their step)', (await act('employee', `${st[0]}/complete`)).status, 403);
  check('seo-exec completes own step 1', (await act('seo-exec', `${st[0]}/complete`)).status, 200);
  check('employee completes own step 2', (await act('employee', `${st[1]}/complete`)).status, 200);
  check('employee approves step 3', (await act('employee', `${st[2]}/approve`, { kind: 'admin' })).status, 403);
  check('seo-exec requests changes on step 3', (await act('seo-exec', `${st[2]}/request-changes`, { note: 'x' })).status, 403);
  check('team leader approves step 3', (await act('team-leader', `${st[2]}/approve`, { kind: 'admin' })).status, 200);
  check('employee reassigns step 4', (await s.employee.req('PUT', `/project-flow/projects/${A.id}/steps/${st[3]}/assignees`, { userIds: [u.employee.id] })).status, 403);
  check('team leader reassigns step 4', (await s['team-leader'].req('PUT', `/project-flow/projects/${A.id}/steps/${st[3]}/assignees`, { userIds: [u['seo-exec'].id, u.employee.id] })).status, 200);
  check('employee changes project status', (await s.employee.req('PATCH', `/project-flow/projects/${A.id}/status`, { status: 'on_hold' })).status, 403);
  check('team leader changes project status', (await s['team-leader'].req('PATCH', `/project-flow/projects/${A.id}/status`, { status: 'active' })).status, 200);
  check('team leader creates cycle on one-time project', (await s['team-leader'].req('POST', `/project-flow/projects/${A.id}/cycles`, {})).status, 400);
  check('employee creates cycle', (await s.employee.req('POST', `/project-flow/projects/${A.id}/cycles`, {})).status, 403);

  console.log('\n── Employee task desk ──');
  const emps = async (who) => {
    const res = await s[who].req('GET', '/project-flow/employees');
    return res.status === 200 ? res.body.employees.map((e) => e.id).sort((a, b) => a - b).join(',') : res.status;
  };
  check('team leader sees self + team', await emps('team-leader'), [u['team-leader'].id, u.employee.id, u['seo-exec'].id].sort((a, b) => a - b).join(','));
  check('employee sees only self', await emps('employee'), String(u.employee.id));
  check('seo-exec sees only self', await emps('seo-exec'), String(u['seo-exec'].id));
  check('hr-admin (no tasks.view) employee list', await emps('hr-admin'), 403);
  const ownerEmps = await s.owner.req('GET', '/project-flow/employees');
  check('owner sees every employee, no client accounts', ownerEmps.body.employees.some((e) => e.id === u.client.id), false, `${ownerEmps.body.employees.length} employees`);

  const desk = (who, uid) => s[who].req('GET', `/project-flow/employees/${uid}`);
  check('employee opens own desk', (await desk('employee', u.employee.id)).status, 200);
  check("employee opens seo-exec's desk", (await desk('employee', u['seo-exec'].id)).status, 403);
  r = await desk('team-leader', u['seo-exec'].id);
  check("team leader opens team member's desk", r.status, 200);
  check('team leader only sees projects they lead', r.body?.projects?.map((p) => p.id).join(','), String(A.id));
  check("team leader opens a non-member's desk", (await desk('team-leader', u['dev-exec'].id)).status, 403);
  check('admin opens any desk', (await desk('admin', u['seo-exec'].id)).status, 200);

  const tasks = (who, uid, pid) => s[who].req('POST', `/project-flow/employees/${uid}/projects/${pid}/tasks`, { tasks: [{ title: `RBAC task by ${who}`, stepId: st[3] }] });
  check('seo-exec splits own tasks on A', (await tasks('seo-exec', u['seo-exec'].id, A.id)).status, 201);
  check('seo-exec creates tasks for employee', (await tasks('seo-exec', u.employee.id, A.id)).status, 403);
  check('team leader creates tasks for employee', (await tasks('team-leader', u.employee.id, A.id)).status, 201);
  check('dev-exec creates own tasks on A (no access)', (await tasks('dev-exec', u['dev-exec'].id, A.id)).status, 403);
  check('employee creates own tasks on B (no access)', (await s.employee.req('POST', `/project-flow/employees/${u.employee.id}/projects/${B.id}/tasks`, { tasks: [{ title: 'x' }] })).status, 403);
  const ept = await s.employee.req('GET', `/project-flow/employees/${u.employee.id}/projects/${A.id}`);
  check('employee project task page', ept.status, 200, `can_add_tasks=${ept.body?.can_add_tasks} can_manage=${ept.body?.can_manage}`);
  check("employee opens seo-exec's project tasks", (await s.employee.req('GET', `/project-flow/employees/${u['seo-exec'].id}/projects/${A.id}`)).status, 403);

  console.log('\n── Task time tracker (start / pause / resume / complete) ──');
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const mk = await s['seo-exec'].req('POST', `/project-flow/employees/${u['seo-exec'].id}/projects/${A.id}/tasks`, {
    tasks: [{ title: 'Tracker task 1', stepId: st[3] }, { title: 'Tracker task 2', stepId: st[3] }]
  });
  const trackTasks = mk.body.tasks.filter((t) => t.title.startsWith('Tracker task')).sort((a, b) => a.id - b.id);
  const [t1, t2] = trackTasks;
  const track = (who, id, action) => s[who].req('POST', `/project-flow/tasks/${id}/tracker`, { action });
  let tr = await track('seo-exec', t1.id, 'start');
  check('assignee starts task 1', tr.status, 200, `status=${tr.body?.status}`);
  check('starting moves todo → in_progress', tr.body?.status, 'in_progress');
  check('starting again is rejected', (await track('seo-exec', t1.id, 'start')).status, 409);
  check('someone else cannot track this task', (await track('employee', t1.id, 'start')).status, 403);
  check('team leader cannot run the assignee’s clock', (await track('team-leader', t1.id, 'pause')).status, 403);
  check('client portal cannot track', (await track('client', t1.id, 'start')).status, 403);
  await sleep(2200);
  tr = await track('seo-exec', t1.id, 'pause');
  check('pause closes session 1', tr.status, 200, `total=${tr.body?.time?.total_seconds}s sessions=${tr.body?.time?.sessions}`);
  check('paused time ≥ 2s and < 60s (DB clock, exact seconds)', tr.body?.time?.total_seconds >= 2 && tr.body?.time?.total_seconds < 60, true);
  check('pausing a paused task is rejected', (await track('seo-exec', t1.id, 'pause')).status, 409);
  await track('seo-exec', t1.id, 'start'); // resume
  await sleep(1200);
  tr = await track('seo-exec', t2.id, 'start');
  check('starting task 2 pauses task 1 automatically', tr.body?.paused_task_id, t1.id);
  await sleep(1100);
  tr = await track('seo-exec', t2.id, 'complete');
  check('complete stops the clock and completes task 2', tr.body?.status, 'completed', `total=${tr.body?.time?.total_seconds}s`);
  check('completed task has no running clock', tr.body?.time?.running, null);
  check('completing again is rejected', (await track('seo-exec', t2.id, 'complete')).status, 409);
  tr = await track('seo-exec', t1.id, 'complete');
  check('task 1 completes from paused state', tr.body?.status, 'completed', `total=${tr.body?.time?.total_seconds}s sessions=${tr.body?.time?.sessions}`);
  check('task 1 total = 2 sessions', tr.body?.time?.sessions, 2);
  check('task 1 total ≥ 3s across sessions', tr.body?.time?.total_seconds >= 3, true);
  const deskTimes = await s['team-leader'].req('GET', `/project-flow/employees/${u['seo-exec'].id}/projects/${A.id}`);
  const t1View = deskTimes.body?.tasks?.find((t) => t.id === t1.id);
  check('team leader sees the tracked total read-only', deskTimes.body?.can_track === false && t1View?.time?.total_seconds === tr.body?.time?.total_seconds, true);
  const [[entryRow]] = await pool.query("SELECT COUNT(*) AS n FROM time_entries WHERE task_id = ? AND entry_type = 'timer'", [t1.id]);
  check('sessions are saved as time entries (feed timesheets/reports)', Number(entryRow.n), 2);
  const zeroStart = await s['seo-exec'].req('POST', `/project-flow/employees/${u['seo-exec'].id}/projects/${A.id}/tasks`, { tasks: [{ title: 'Tracker task 3' }] });
  const t3 = zeroStart.body.tasks.find((t) => t.title === 'Tracker task 3');
  check('complete straight from todo works (todo → in_progress → completed)', (await track('seo-exec', t3.id, 'complete')).body?.status, 'completed');

  console.log('\n── Pipelines ──');
  const pl = { name: 'RBAC pipeline', steps: [{ name: 'One' }] };
  check('employee creates pipeline', (await s.employee.req('POST', '/project-flow/pipelines', pl)).status, 403);
  check('account manager creates pipeline (no workflows.create)', (await s['account-manager'].req('POST', '/project-flow/pipelines', pl)).status, 403);
  check('PM creates pipeline', (await s['project-manager'].req('POST', '/project-flow/pipelines', pl)).status, 201);
  check('team leader edits pipeline', (await s['team-leader'].req('PUT', `/project-flow/pipelines/${pipe.body.pipeline.id}`, pl)).status, 403);

  console.log('\n── Existing modules: GET sweep per role (any 5xx is a bug) ──');
  const ENDPOINTS = [
    '/auth/me', '/auth/me/permissions', '/projects?limit=5', '/projects/metrics', '/tasks?limit=5', '/tasks/my-tasks?limit=5', '/clients?limit=5',
    '/clients/dashboard/stats', '/clients/meta/account-managers', '/services?limit=5', '/services/catalog', '/users?limit=5', '/teams?limit=5',
    '/departments?limit=5', '/workflow-presets?limit=5', '/automation/executions?limit=5', '/reports/dashboard?period=last_30_days',
    '/time-entries?limit=5', '/timesheets?limit=5', '/timers/active', '/notifications?limit=5', '/notifications/unread-count',
    '/chat/conversations', '/hr/dashboard', '/hr/attendance/today', '/hr/leave/balances', '/calendar/options', '/calendar?month=2026-11',
    '/leads?limit=5', '/tickets', '/tickets/stats', '/invoices', '/billing/stats', '/credentials', '/audit-logs?limit=5', '/roles'
  ];
  const sweep = {};
  for (const who of Object.keys(ROLES)) {
    sweep[who] = {};
    for (const ep of ENDPOINTS) {
      const res = await s[who].req('GET', ep);
      sweep[who][ep] = res.status;
      if (res.status >= 500) check(`${who} GET ${ep}`, res.status, '<500', res.body?.error?.message || '');
    }
  }
  console.log('\nStatus table (rows = endpoint, columns = role):');
  console.table(Object.fromEntries(ENDPOINTS.map((ep) => [ep, Object.fromEntries(Object.keys(ROLES).map((r) => [r, sweep[r][ep]]))])));
  // Regressions found by this test.
  check('client cannot list internal staff (account managers)', sweep.client['/clients/meta/account-managers'], 403);
  check('admin can load billing stats (array permission)', sweep.admin['/billing/stats'], 200);
  check('account manager can load billing stats', sweep['account-manager']['/billing/stats'], 200);
  check('client portal sees only its own client', (await s.client.req('GET', '/clients?limit=50')).body?.clients?.map((c) => c.id).join(','), String(C));

  const fiveXX = Object.entries(sweep).flatMap(([who, m]) => Object.entries(m).filter(([, st]) => st >= 500).map(([ep]) => `${who} ${ep}`));
  check('no 5xx in existing-module sweep', fiveXX.length, 0, fiveXX.join(' | '));
}

run()
  .catch((e) => {
    console.error('\nSmoke test crashed:', e);
    results.push({ ok: false, label: 'crash' });
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (e) {
      console.error('Cleanup failed:', e.message);
    }
    const failed = results.filter((x) => !x.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    await pool.end();
    process.exit(failed.length ? 1 : 0);
  });
