/**
 * Month plans smoke test — local development only.
 * Client -> month plan -> many service projects; copy previous month; access rules; retainer logic untouched.
 * Uses months in 2031 so real data never mixes in; everything created is removed afterwards.
 *   node src/scripts/month-plans-smoke-test.js      (API must be running on http://localhost:5000)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ProjectFlowService } from '../modules/project-flow/projectFlow.service.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'MonthPlan#2026'; // test-only credential for the @monthplan.test fixture accounts
const DOMAIN = '@monthplan.test';

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

const fx = { users: {}, clients: {} };

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const [cs] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  const cids = cs.map((c) => c.id);
  if (cids.length) {
    await pool.query('DELETE FROM invoices WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM calendar_events WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id IN (?)', [cids]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?) AND parent_project_id IS NOT NULL', [cids]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM client_month_plans WHERE client_id IN (?)', [cids]);
  }
  if (uids.length) {
    await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]);
  }
  if (cids.length) await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
  await pool.query("DELETE FROM project_pipelines WHERE name LIKE 'MPLAN %'");
}

async function setup() {
  await purge();
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug, legacy] of [['owner', 'owner', 'owner'], ['am', 'account-manager', 'account_manager'], ['emp', 'employee', 'employee'], ['other', 'employee', 'employee'], ['designer', 'design-exec', 'employee']]) {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, 'active', 0)",
      [`MPLAN ${key}`, `${key}${DOMAIN}`, hash, legacy]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (!role) throw new Error(`role ${slug} missing — restart the API so the registry syncs`);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    fx.users[key] = { id: r.insertId, s: new Session() };
  }
  for (const key of ['a', 'b']) {
    const [r] = await pool.query(
      "INSERT INTO clients (name, client_code, email, company_name, status, account_manager_id) VALUES (?, ?, ?, ?, 'active', ?)",
      [`MPLAN ${key}`, `MP-${Date.now()}-${key}`, `${key}${DOMAIN}`, `MPLAN ${key.toUpperCase()} Co`, fx.users.am.id]
    );
    fx.clients[key] = r.insertId;
  }
  for (const k of Object.keys(fx.users)) await fx.users[k].s.login(`${k}${DOMAIN}`);
}

async function run() {
  await setup();
  const { am, emp, other } = Object.fromEntries(Object.entries(fx.users).map(([k, v]) => [k, v.s]));
  const ids = Object.fromEntries(Object.entries(fx.users).map(([k, v]) => [k, v.id]));
  const { a, b } = fx.clients;

  console.log('\n── Create month plan ──');
  let r = await am.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-05', notes: 'May content plan' });
  check('account manager creates May 2031 plan', r.status, 201, r.body?.error?.message || '');
  const may = r.body?.plan;
  check('plan label', may?.label, 'May 2031');
  check('plan date range', `${may?.start}..${may?.end}`, '2031-05-01..2031-05-31');
  r = await am.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-05' });
  check('duplicate month rejected', r.status, 409);
  r = await emp.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-07' });
  check('employee cannot create a plan', r.status, (s) => s === 403);
  r = await am.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-13' });
  check('bad month rejected', r.status, 400);

  console.log('\n── Add several service projects to the month ──');
  r = await am.req('POST', `/project-flow/month-plans/${may.id}/projects`, {
    projects: [
      { name: 'Social media — Video — May 2031', assignmentMode: 'individual', assigneeId: ids.emp, monthlyDeliverables: [{ label: 'Reels', qty: 8 }] },
      { assignmentMode: 'team', teamLeaderId: ids.am, stepAssignees: { idx0: [ids.emp, ids.am] }, monthlyDeliverables: [{ label: 'Posts', qty: 12 }, { label: 'Stories', qty: 10 }] },
      { name: 'Festival creative', category: 'urgent', assignmentMode: 'individual', assigneeId: ids.am, dueDate: '2031-05-10' }
    ]
  });
  check('3 projects added in one call', r.body?.created_ids?.length, 3, r.body?.error?.message || '');
  const plan = r.body;
  check('plan lists 3 projects', plan?.projects?.length, 3);
  const [video, design, urgent] = plan?.projects || [];
  check('video project dated to the month', `${video?.start_date?.slice?.(0, 10) ?? video?.start_date}`, (v) => String(v).startsWith('2031-0'));
  check('default name uses the month', design?.name, 'Project — May 2031');
  check('urgent keeps its category + due date', `${urgent?.project_category}/${String(urgent?.due_date).slice(0, 10)}`, (v) => v.startsWith('urgent/2031-05-'));
  check('every month project has cycle_month', plan?.projects?.every((p) => p.cycle_month === '2031-05'), true);
  check('month totals: deliverables summed', JSON.stringify(plan?.totals?.deliverables), JSON.stringify([{ label: 'Reels', qty: 8 }, { label: 'Posts', qty: 12 }, { label: 'Stories', qty: 10 }]));
  check('quota tasks created (1 + 2)', plan?.totals?.task_total, 3);
  check('first step already in progress', plan?.projects?.every((p) => p.current_step), true);

  r = await am.req('POST', `/project-flow/month-plans/${may.id}/projects`, { projects: [{ assignmentMode: 'individual' }] });
  check('missing owner names the row', r.body?.error?.message, (m) => /Project 1/.test(m || ''));

  console.log('\n── Retainer logic stays separate ──');
  r = await am.req('POST', `/project-flow/projects/${video.id}/cycles`, { month: '2031-06' });
  check('no monthly cycles on a month-plan project', r.status, 400);
  r = await am.req('GET', `/project-flow/clients/${a}/projects`);
  check('client page: month projects not listed as stand-alone', r.body?.projects?.length, 0);
  check('client page: month_plans returned', r.body?.month_plans?.map((p) => `${p.plan_month}:${p.project_count}`).join(','), '2031-05:3');
  r = await am.req('POST', '/project-flow/projects', { clientId: b, monthPlanId: may.id, name: 'Wrong client', category: 'one_time', assignmentMode: 'individual', assigneeId: ids.am });
  check('plan of another client rejected', r.status, 400);
  r = await am.req('POST', '/project-flow/projects', { clientId: a, monthPlanId: may.id, name: 'Blog posts', category: 'regular', assignmentMode: 'individual', assigneeId: ids.emp, monthlyDeliverables: [{ label: 'Blogs', qty: 4 }] });
  check('single project into the month via createProject', r.body?.project?.month_plan_id, may.id, r.body?.error?.message || '');
  check('…and it gets no cycles (not a retainer template)', r.body?.project?.cycles?.length, 0);

  r = await am.req('POST', '/project-flow/projects', { clientId: b, name: 'Old-style SEO retainer', category: 'regular', assignmentMode: 'individual', assigneeId: ids.emp, monthlyDeliverables: [{ label: 'Backlinks', qty: 20 }] });
  check('old-style retainer still creates its current cycle', r.body?.project?.cycles?.length, 1, r.body?.error?.message || '');
  const cycleId = r.body?.project?.cycles?.[0]?.id;
  const [[quota]] = await pool.query('SELECT title, target_qty, assignee_id FROM tasks WHERE project_id = ?', [cycleId || 0]);
  check('…with its quota task', `${quota?.target_qty}/${quota?.assignee_id === ids.emp}`, '20/true', quota?.title || '');

  console.log('\n── Access ──');
  r = await emp.req('GET', `/project-flow/month-plans/${may.id}`);
  check('assigned employee sees the plan', r.status, 200);
  check('…only their projects', r.body?.projects?.length, 3);
  r = await other.req('GET', `/project-flow/month-plans/${may.id}`);
  check('unrelated employee blocked', r.status, 403);

  console.log('\n── Copy previous month ──');
  await pool.query("UPDATE projects SET status = 'cancelled' WHERE id = ?", [urgent.id]);
  r = await am.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-06', copyPrevious: true });
  check('June created from May', r.status, 201, r.body?.error?.message || '');
  check('copied all but the cancelled project', r.body?.copied, 3);
  const june = r.body;
  check('names moved to June', june?.projects?.map((p) => p.name).sort().join(' | '), 'Blog posts — Jun 2031 | Project — Jun 2031 | Social media — Video — Jun 2031');
  check('copied plan points to its source', june?.plan?.copied_from_plan_id, may.id);
  check('quota tasks recreated', june?.totals?.task_total, 4);
  const [[stepPeople]] = await pool.query(
    `SELECT GROUP_CONCAT(psa.user_id ORDER BY psa.user_id) AS ids FROM project_step_assignees psa
     JOIN project_steps ps ON ps.id = psa.project_step_id JOIN projects p ON p.id = ps.project_id
     WHERE p.month_plan_id = ? AND p.name LIKE 'Project —%'`,
    [june?.plan?.id]
  );
  check('team step people carried over', stepPeople?.ids, [ids.am, ids.emp].sort((x, y) => x - y).join(','));
  check('June knows previous plan', june?.previous_plan?.plan_month, '2031-05');

  console.log('\n── Close month ──');
  r = await am.req('PATCH', `/project-flow/month-plans/${may.id}`, { status: 'closed', billingAmount: 45000 });
  check('close May with fee', `${r.body?.plan?.status}/${r.body?.plan?.billing_amount}`, 'closed/45000');
  r = await am.req('POST', `/project-flow/month-plans/${may.id}/projects`, { projects: [{ assignmentMode: 'individual', assigneeId: ids.am }] });
  check('cannot add to a closed month', r.status, 400);
  r = await am.req('GET', `/project-flow/clients/${a}/month-plans`);
  check('list newest first', r.body?.month_plans?.map((p) => p.plan_month).join(','), '2031-06,2031-05');

  console.log('\n── Draft month: on hold until activated ──');
  r = await am.req('POST', '/project-flow/month-plans', { clientId: a, month: '2031-07', copyFromPlanId: june.plan.id, status: 'draft', billingAmount: 30000 });
  check('July drafted from June', `${r.status}/${r.body?.plan?.status}/${r.body?.copied}`, '201/draft/3', r.body?.error?.message || '');
  const july = r.body;
  check('draft projects wait as planning', july?.projects?.every((p) => p.status === 'planning'), true);
  check('…no step started', july?.projects?.every((p) => !p.current_step), true);
  check('…no quota tasks yet', july?.totals?.task_total, 0);
  r = await emp.req('GET', `/project-flow/employees/${ids.emp}`);
  check('employee desk hides on-hold draft projects', JSON.stringify(r.body || {}).includes('Jul 2031'), false);
  r = await am.req('POST', `/project-flow/month-plans/${july.plan.id}/invoice`);
  check('cannot invoice a draft month', r.status, 400);
  r = await am.req('PATCH', `/project-flow/month-plans/${july.plan.id}`, { autoInvoice: true, invoiceType: 'INV' });
  check('auto-invoice on (fee set)', r.body?.plan?.auto_invoice, true, r.body?.error?.message || '');
  r = await am.req('PATCH', `/project-flow/month-plans/${july.plan.id}`, { status: 'active' });
  check('activate July', r.body?.plan?.status, 'active', r.body?.error?.message || '');
  check('…projects started', r.body?.projects?.every((p) => p.status === 'active' && p.current_step), true);
  check('…quota tasks created', r.body?.totals?.task_total, 4);
  check('…invoice drafted automatically', `${r.body?.plan?.invoice?.status}/${r.body?.plan?.invoice?.total_amount}`, (v) => v.startsWith('draft/') && Number(v.split('/')[1]) >= 30000);
  const [[line]] = await pool.query('SELECT item_description, details FROM invoice_items WHERE invoice_id = ?', [r.body?.plan?.invoice?.id || 0]);
  check('invoice line lists the services', line?.details, (d) => /Reels/.test(d || '') && /Blogs/.test(d || ''), line?.item_description || '');
  r = await am.req('POST', `/project-flow/month-plans/${july.plan.id}/invoice`);
  check('second invoice request reuses it', r.body?.invoice_created, false);
  r = await am.req('PATCH', `/project-flow/month-plans/${june.plan.id}`, { autoInvoice: true, billingAmount: null });
  check('auto-invoice needs a fee', r.status, 400);
  r = await emp.req('POST', `/project-flow/month-plans/${june.plan.id}/invoice`);
  check('employee cannot invoice', r.status, 403);

  console.log('\n── Retainer cycles join month plans ──');
  const [[cyc]] = await pool.query(
    `SELECT c.month_plan_id, mp.plan_month, mp.client_id FROM projects c JOIN client_month_plans mp ON mp.id = c.month_plan_id
     WHERE c.parent_project_id IS NOT NULL AND c.client_id = ?`,
    [b]
  );
  check('retainer cycle linked to a month plan', `${cyc?.client_id}/${cyc?.plan_month}`, `${b}/${new Date().toISOString().slice(0, 7)}`);
  r = await am.req('GET', `/project-flow/month-plans/${cyc?.month_plan_id}`);
  check('…and shows in that month', r.body?.projects?.some((p) => p.parent_project_id), true);
  r = await am.req('POST', '/project-flow/month-plans', { clientId: b, month: '2031-01', copyFromPlanId: cyc?.month_plan_id });
  check('copying a month skips retainer cycles', r.body?.copied, 0, r.body?.error?.message || '');

  console.log('\n── Stage by stage + tasks per stage ──');
  const ownerS = fx.users.owner.s;
  r = await ownerS.req('POST', '/project-flow/pipelines', {
    name: 'MPLAN Graphic flow',
    steps: [{ name: 'Content' }, { name: 'Design' }, { name: 'Approve', stepType: 'approval', needsAdminApproval: true, needsClientApproval: false }]
  });
  const pipe = r.body?.pipeline;
  check('3-step pipeline created', pipe?.steps?.length, 3, r.body?.error?.message || '');
  const [ps1, ps2] = pipe?.steps || [];
  r = await am.req('POST', `/project-flow/month-plans/${july.plan.id}/projects`, {
    projects: [{ name: 'Graphic — Jul 2031', pipelineId: pipe?.id, assignmentMode: 'team', teamLeaderId: ids.am, stepAssignees: { [ps1?.id]: [ids.emp], [ps2?.id]: [ids.am] } }]
  });
  const gid = r.body?.created_ids?.[0];
  r = await am.req('GET', `/project-flow/projects/${gid}`);
  let g = r.body?.project;
  const [c1, c2, c3] = g?.steps || [];
  check('only step 1 starts in progress', g?.steps?.map((s) => s.status).join(','), 'in_progress,pending,pending');
  r = await am.req('POST', `/project-flow/projects/${gid}/steps/${c2?.id}/tasks`, {
    tasks: [1, 2, 3].map((n) => ({ title: `Post ${n}`, assigneeId: ids.emp, dueDate: '2031-07-10', priority: 'high' }))
  });
  check('leader plans Post 1–3 for an upcoming stage', r.body?.project?.steps?.[1]?.tasks?.map((t) => t.title).join(','), 'Post 1,Post 2,Post 3', r.body?.error?.message || '');
  r = await emp.req('POST', `/project-flow/projects/${gid}/steps/${c1?.id}/tasks`, { tasks: [{ title: 'Caption drafts' }] });
  check('task without a due date rejected', r.status, 400);
  r = await emp.req('POST', `/project-flow/projects/${gid}/steps/${c1?.id}/tasks`, { tasks: [{ title: 'Caption drafts', dueDate: '2031-07-05' }] });
  check('step member adds own task (defaults to self)', r.body?.project?.steps?.[0]?.tasks?.[0]?.assignee_id, ids.emp, r.body?.error?.message || '');
  r = await emp.req('POST', `/project-flow/projects/${gid}/steps/${c1?.id}/tasks`, { tasks: [{ title: 'For someone else', assigneeId: ids.am, dueDate: '2031-07-05' }] });
  check('member cannot assign others', r.status, 403);
  r = await other.req('POST', `/project-flow/projects/${gid}/steps/${c1?.id}/tasks`, { tasks: [{ title: 'Nope', dueDate: '2031-07-05' }] });
  check('outsider cannot add tasks', r.status, 403);
  g = (await emp.req('GET', `/project-flow/projects/${gid}`)).body?.project;
  const post1 = g?.steps?.[1]?.tasks?.[0];
  check('upcoming stage tasks are locked', post1?.can_toggle, false);
  r = await emp.req('POST', `/project-flow/tasks/${post1?.id}/tracker`, { action: 'start' });
  check('cannot start a task in a stage that has not started', r.status, 409);
  r = await emp.req('PATCH', `/project-flow/projects/${gid}/tasks/${post1?.id}/done`, { done: true });
  check('cannot tick it done either', r.status, 409);
  r = await am.req('POST', `/project-flow/projects/${gid}/steps/${c2?.id}/complete`);
  check('cannot complete stage 2 before stage 1', r.status, 409);
  r = await am.req('POST', `/project-flow/projects/${gid}/steps/${c3?.id}/approve`, { kind: 'admin' });
  check('approval stays locked while work is open', r.status, 409);
  r = await emp.req('POST', `/project-flow/projects/${gid}/steps/${c1?.id}/complete`);
  check('finishing stage 1 opens stage 2', r.body?.project?.steps?.map((s) => s.status).join(','), 'completed,in_progress,pending', r.body?.error?.message || '');
  for (const t of r.body?.project?.steps?.[1]?.tasks || []) await emp.req('PATCH', `/project-flow/projects/${gid}/tasks/${t.id}/done`, { done: true });
  g = (await am.req('GET', `/project-flow/projects/${gid}`)).body?.project;
  check('all stage-2 tasks done → stage finishes itself, approval opens', g?.steps?.map((s) => s.status).join(','), 'completed,completed,in_progress');
  r = await am.req('POST', `/project-flow/projects/${gid}/steps/${c2?.id}/tasks`, { tasks: [{ title: 'Late add', dueDate: '2031-07-20' }] });
  check('no new tasks on a completed step', r.status, 409);
  r = await am.req('POST', `/project-flow/projects/${gid}/steps/${c3?.id}/approve`, { kind: 'admin' });
  check('approve → project completed', `${r.body?.project?.status}/${r.body?.project?.steps?.[2]?.status}`, 'completed/completed', r.body?.error?.message || '');

  console.log('\n── One engine: standard pipelines + auto tasks ──');
  r = await am.req('GET', '/project-flow/pipelines');
  const pipes = r.body?.pipelines || [];
  const seo = pipes.find((p) => p.template_key === 'SEO');
  const smm = pipes.find((p) => p.template_key === 'SocialMediaManagement');
  check('standard pipelines seeded from the playbook', pipes.filter((p) => p.template_key).length >= 15, true, `${pipes.filter((p) => p.template_key).length} standard`);
  check('SEO pipeline: 4 steps with default tasks', seo?.steps?.map((s) => s.task_templates.length).join(','), '4,3,4,1');

  // Bundling (Clients page) now = projects in this month's plan on each service's pipeline, tasks spawned at once.
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lifecycle = async () => (await pool.query('SELECT lifecycle_stage FROM clients WHERE id = ?', [b]))[0][0]?.lifecycle_stage;
  await pool.query("UPDATE clients SET lifecycle_stage = 'L1' WHERE id = ?", [b]);
  // Bundling auto-picks an owner by department (most recent login). Make sure it picks test users, never real staff,
  // so no real employee is notified by these tests.
  await pool.query("UPDATE users SET department = 'SEO', last_login_at = NOW() + INTERVAL 1 DAY WHERE id = ?", [ids.emp]);
  await pool.query("UPDATE users SET department = 'Content', last_login_at = NOW() + INTERVAL 1 DAY WHERE id = ?", [ids.designer]);
  r = await fx.users.owner.s.req('POST', `/clients/${b}/services`, { serviceTypes: ['SEO', 'SocialMediaManagement'] });
  const bundled = r.body?.data || r.body || {};
  check('bundle 2 services → 2 month-plan projects', bundled.bundled_services?.length, 2, r.body?.error?.message || r.body?.message || '');
  check('…in this month’s plan', bundled.plan_month, thisMonth);
  check('…only the first stage’s tasks exist (4 SEO Audit + 2 SMM Planning)', bundled.generated_tasks?.filter((t) => t.project_step_id).length, 6);
  check('lifecycle: services added → L2', await lifecycle(), 'L2');
  const [owners] = await pool.query('SELECT DISTINCT p.team_leader_id FROM projects p WHERE p.id IN (?)', [bundled.bundled_services?.map((s) => s.project_id) || [0]]);
  check('auto-picked owners are test users only', owners.every((o) => [ids.emp, ids.designer].includes(Number(o.team_leader_id))), true, JSON.stringify(owners));
  const [[siCount]] = await pool.query('SELECT COUNT(*) AS n FROM service_instances WHERE client_id = ?', [b]);
  check('no legacy service_instances created', Number(siCount.n), 0);
  const seoProject = bundled.bundled_services?.find((s) => s.service_code === 'SEO');
  r = await am.req('GET', `/project-flow/projects/${seoProject?.project_id}`);
  const seoSteps = r.body?.project?.steps || [];
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  check('bundled mid-month: first step not already overdue', String(seoSteps[0]?.due_date || '').slice(0, 10) >= todayYmd, true, String(seoSteps[0]?.due_date));
  check('later steps never past month end', seoSteps.every((s) => !s.due_date || String(s.due_date).slice(0, 7) <= thisMonth), true);

  // Stage by stage through the SEO playbook, with the client-review chain and lifecycle moves.
  const owner = fx.users.owner.s;
  const seoId = seoProject?.project_id;
  const stageTasks = async (order) => (await owner.req('GET', `/project-flow/projects/${seoId}`)).body?.project?.steps?.[order - 1]?.tasks || [];
  for (const t of await stageTasks(1)) await owner.req('PATCH', `/project-flow/projects/${seoId}/tasks/${t.id}/done`, { done: true });
  let seoNow = (await owner.req('GET', `/project-flow/projects/${seoId}`)).body?.project;
  check('Audit tasks done → Audit finishes itself, Strategy opens', seoNow?.steps?.map((s) => s.status).join(','), 'completed,in_progress,pending,pending');
  check('…and Strategy’s 3 playbook tasks appear', seoNow?.steps?.[1]?.tasks?.length, 3);
  check('lifecycle: first stage done → L3', await lifecycle(), 'L3');
  const meta = seoNow?.steps?.[1]?.tasks?.find((t) => t.is_client_deliverable);
  r = await owner.req('PATCH', `/project-flow/projects/${seoId}/tasks/${meta?.id}/done`, { done: true });
  check('client deliverable cannot be ticked done', r.status, 409);
  r = await owner.req('POST', `/tasks/${meta?.id}/deliverables/submit-review`, { title: meta?.title, deliverableUrl: 'https://example.com/meta-sheet', submissionNotes: 'Meta titles v1' });
  check('submit for review', r.status, (s) => s === 200 || s === 201, r.body?.error?.message || r.body?.message || '');
  seoNow = (await owner.req('GET', `/project-flow/projects/${seoId}`)).body?.project;
  const sub1 = seoNow?.steps?.[1]?.tasks?.find((t) => t.id === meta?.id)?.current_submission_id;
  check('…task now in team review', seoNow?.steps?.[1]?.tasks?.find((t) => t.id === meta?.id)?.internal_review_status, 'pending');
  r = await owner.req('POST', `/deliverables/${sub1}/review-internal`, { decision: 'approved' });
  check('team approves → sent to client', r.status, 200, r.body?.error?.message || r.body?.message || '');
  check('lifecycle: work with the client → L4', await lifecycle(), 'L4');
  r = await owner.req('POST', `/deliverables/${sub1}/client-request-revision`, { revisionReason: 'Shorter titles please' });
  check('client asks for changes', r.status, (s) => s === 200 || s === 201, r.body?.error?.message || r.body?.message || '');
  seoNow = (await owner.req('GET', `/project-flow/projects/${seoId}`)).body?.project;
  const metaRev = seoNow?.steps?.[1]?.tasks?.find((t) => t.id === meta?.id);
  check('…task in Revision, counted', `${metaRev?.column_status}/${metaRev?.revision_count}`, 'revision/1');
  check('lifecycle: back to L3 while reworking', await lifecycle(), 'L3');
  r = await owner.req('POST', `/tasks/${meta?.id}/deliverables/submit-review`, { title: meta?.title, deliverableUrl: 'https://example.com/meta-sheet-v2' });
  const sub2 = (await stageTasks(2)).find((t) => t.id === meta?.id)?.current_submission_id;
  await owner.req('POST', `/deliverables/${sub2}/review-internal`, { decision: 'approved' });
  r = await owner.req('POST', `/deliverables/${sub2}/client-approve`, { feedback: 'Looks good' });
  check('client approves v2', r.status, (s) => s === 200 || s === 201, r.body?.error?.message || r.body?.message || '');
  for (const t of (await stageTasks(2)).filter((x) => !x.is_client_deliverable)) await owner.req('PATCH', `/project-flow/projects/${seoId}/tasks/${t.id}/done`, { done: true });
  seoNow = (await owner.req('GET', `/project-flow/projects/${seoId}`)).body?.project;
  check('approved + other tasks done → Strategy finishes, Execution opens', seoNow?.steps?.map((s) => s.status).join(','), 'completed,completed,in_progress,pending');
  check('lifecycle stays L3 (nothing awaiting client)', await lifecycle(), 'L3');
  for (const t of await stageTasks(3)) {
    if (!t.is_client_deliverable) await owner.req('PATCH', `/project-flow/projects/${seoId}/tasks/${t.id}/done`, { done: true });
  }
  await owner.req('POST', `/project-flow/projects/${seoId}/steps/${seoNow?.steps?.[2]?.id}/complete`);
  check('Reporting stage opens → lifecycle L5', await lifecycle(), 'L5');

  // Review & Approve inbox: the report (owner = test employee) goes through the inbox.
  const report = (await stageTasks(4)).find((t) => t.is_client_deliverable);
  await emp.req('POST', `/project-flow/tasks/${report?.id}/tracker`, { action: 'start' });
  r = await emp.req('POST', `/tasks/${report?.id}/deliverables/submit-review`, { title: report?.title, deliverableUrl: 'https://example.com/report' });
  check('employee sends the report for review', r.status, (s) => s === 200 || s === 201, r.body?.error?.message || r.body?.message || '');
  const [[timerLeft]] = await pool.query('SELECT COUNT(*) AS n FROM active_timers WHERE user_id = ? AND task_id = ?', [ids.emp, report?.id || 0]);
  check('…which stops their running timer', Number(timerLeft.n), 0);
  let inbox = (await emp.req('GET', '/project-flow/reviews')).body;
  check('employee inbox: nothing to review, 1 own submission', `${inbox?.counts?.needs_review}/${inbox?.counts?.my_submissions}`, '0/1');
  inbox = (await am.req('GET', '/project-flow/reviews')).body;
  check('account manager inbox: 1 to review', inbox?.needs_review?.some((x) => x.task_id === report?.id), true);
  check('…and it counts toward the sidebar badge', inbox?.counts?.action >= 1, true);
  const reportSub = inbox?.needs_review?.find((x) => x.task_id === report?.id)?.submission_id;
  r = await emp.req('POST', `/deliverables/${reportSub}/review-internal`, { decision: 'approved' });
  check('nobody can approve their own work', r.status, 403);
  r = await am.req('POST', `/deliverables/${reportSub}/review-internal`, { decision: 'approved' });
  check('client’s account manager approves it', r.status, 200, r.body?.error?.message || r.body?.message || '');
  inbox = (await am.req('GET', '/project-flow/reviews')).body;
  check('…now waiting for the client', inbox?.with_client?.some((x) => x.task_id === report?.id), true);
  inbox = (await other.req('GET', '/project-flow/reviews')).body;
  check('outsider inbox stays empty', inbox?.counts?.action + inbox?.counts?.with_client, 0);

  r = await fx.users.owner.s.req('POST', `/clients/${b}/services`, { serviceTypes: ['SEO'] });
  check('bundling SEO again this month is skipped', (r.body?.data || r.body)?.skipped_service_ids?.length, 1);
  r = await am.req('GET', '/clients');
  const bRow = (r.body?.data?.clients || r.body?.clients || r.body?.data || []).find?.((c) => c.id === b);
  check('Clients page count = services in this month', bRow ? Number(bRow.bundled_services_count) : 'n/a', (v) => v === 2 || v === 'n/a', bRow ? '' : '(client list shape differs — skipped)');

  // Role routing: a design task in a team step goes to the step person with the design role.
  const smmSteps = smm?.steps || [];
  r = await am.req('POST', `/project-flow/month-plans/${july.plan.id}/projects`, {
    projects: [{ name: 'SMM role test', pipelineId: smm?.id, assignmentMode: 'team', teamLeaderId: ids.am, stepAssignees: { [smmSteps[1]?.id]: [ids.emp, ids.designer] } }]
  });
  const roleProject = r.body?.created_ids?.[0];
  // Stage 2 (Creative Production) gets its tasks when stage 1 finishes.
  const roleSteps = (await am.req('GET', `/project-flow/projects/${roleProject}`)).body?.project?.steps || [];
  await am.req('POST', `/project-flow/projects/${roleProject}/steps/${roleSteps[0]?.id}/complete`);
  const [roleTasks] = await pool.query(
    `SELECT t.title, t.assignee_id FROM tasks t JOIN project_steps ps ON ps.id = t.project_step_id WHERE t.project_id = ? AND ps.step_order = 2 ORDER BY t.id`,
    [roleProject || 0]
  );
  check('design task → designer on the step', roleTasks.find((t) => /graphic/i.test(t.title))?.assignee_id, ids.designer);
  check('video task (no video person) → first step person', roleTasks.find((t) => /reels/i.test(t.title))?.assignee_id, ids.emp);

  // Draft months hold step tasks until activation; activation spawns them once.
  r = await am.req('POST', '/project-flow/month-plans', { clientId: b, month: '2031-09', status: 'draft' });
  const sept = r.body;
  await am.req('POST', `/project-flow/month-plans/${sept?.plan?.id}/projects`, { projects: [{ pipelineId: seo?.id, serviceId: seo?.service_id, assignmentMode: 'individual', assigneeId: ids.emp }] });
  let [[held]] = await pool.query('SELECT COUNT(*) AS n FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.month_plan_id = ?', [sept?.plan?.id || 0]);
  check('draft month: no step tasks yet', Number(held.n), 0);
  await am.req('PATCH', `/project-flow/month-plans/${sept?.plan?.id}`, { status: 'active' });
  [[held]] = await pool.query('SELECT COUNT(*) AS n FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.month_plan_id = ?', [sept?.plan?.id || 0]);
  check('activate → first stage’s 4 SEO tasks', Number(held.n), 4);
  r = await am.req('POST', '/project-flow/month-plans', { clientId: b, month: '2031-10', copyFromPlanId: sept?.plan?.id });
  check('copied month starts its own first stage', r.body?.totals?.task_total, 4, r.body?.error?.message || '');

  // Editing a pipeline keeps (and can change) its default tasks.
  const editSteps = (seo?.steps || []).map((s, i) => ({
    name: s.name,
    stepType: s.step_type,
    estDays: s.est_days,
    taskTemplates: i === 0 ? [...s.task_templates, { title: 'MPLAN extra audit task', clientReview: false }] : s.task_templates
  }));
  r = await fx.users.owner.s.req('PUT', `/project-flow/pipelines/${seo?.id}`, { name: seo?.name, serviceId: seo?.service_id, steps: editSteps });
  check('pipeline edit keeps + adds default tasks', r.body?.pipeline?.steps?.map((s) => s.task_templates.length).join(','), '5,3,4,1', r.body?.error?.message || '');
  // Put the standard pipeline back exactly as it was.
  await fx.users.owner.s.req('PUT', `/project-flow/pipelines/${seo?.id}`, {
    name: seo?.name,
    serviceId: seo?.service_id,
    steps: (seo?.steps || []).map((s) => ({ name: s.name, stepType: s.step_type, estDays: s.est_days, taskTemplates: s.task_templates }))
  });

  console.log('\n── Content calendar (Master Plan §8 Social Media Management) ──');
  r = await am.req('GET', `/calendar/content-plan/${a}`);
  let cp = r.body?.data;
  check('default pattern: Reels Sat/Sun/Wed, Posts Mon/Tue/Thu', `${cp?.reel_days?.join('')}/${cp?.post_days?.join('')}`, '603/124', r.body?.error?.message || '');
  check('account manager can build it', cp?.can_manage, true);
  const buildBody = { clientId: a, month: '2031-06', reels: 12, posts: 8, reelDays: [6, 0, 3], postDays: [1, 2, 4], platform: 'Instagram', pillars: ['Tips', 'Offers', 'Reviews'] };
  r = await am.req('POST', '/calendar/build', { ...buildBody, dryRun: true });
  const prev = r.body?.data;
  check('preview: 12 Reels + 8 Posts', `${prev?.items?.filter((i) => i.kind === 'reel').length}/${prev?.items?.filter((i) => i.kind === 'post').length}`, '12/8', r.body?.error?.message || '');
  const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  check('Reels only on Sat/Sun/Wed', prev?.items?.filter((i) => i.kind === 'reel').every((i) => [6, 0, 3].includes(dow(i.date))), true);
  check('Posts only on Mon/Tue/Thu', prev?.items?.filter((i) => i.kind === 'post').every((i) => [1, 2, 4].includes(dow(i.date))), true);
  check('titles rotate the pillars', prev?.items?.slice(0, 3).map((i) => i.title.split(' — ')[1]).join(','), 'Tips,Offers,Reviews');
  r = await am.req('GET', `/calendar?clientId=${a}&month=2031-06`);
  check('preview saves nothing', (r.body?.data || []).length, 0);
  r = await am.req('POST', '/calendar/build', buildBody);
  check('build adds 20 items', r.body?.data?.created, 20, r.body?.error?.message || '');
  r = await am.req('GET', `/calendar?clientId=${a}&month=2031-06`);
  const calItems = r.body?.data || [];
  check('calendar shows 12 Reels + 8 Posts', `${calItems.filter((e) => e.event_type === 'Reel').length}/${calItems.filter((e) => e.event_type === 'Static Post').length}`, '12/8');
  r = await am.req('GET', `/calendar/content-plan/${a}`);
  check('pattern remembered for next month', `${r.body?.data?.reels_per_month}/${r.body?.data?.posts_per_month}/${r.body?.data?.pillars?.length}`, '12/8/3');
  r = await am.req('POST', '/calendar/build', { ...buildBody, reels: 2, posts: 0, dryRun: true });
  check('a second build continues numbering', r.body?.data?.items?.[0]?.title?.startsWith('Reel 13'), true, r.body?.data?.items?.[0]?.title);
  r = await am.req('POST', '/calendar/build', { ...buildBody, month: '2020-01' });
  check('past month rejected', r.status, 400);

  // Access: employees see the clients they work on, can't build, and only move their own items forward.
  r = await emp.req('GET', `/calendar?clientId=${a}&month=2031-06`);
  check('employee on the client can view its calendar', r.status, 200);
  r = await emp.req('POST', '/calendar/build', buildBody);
  check('employee cannot build the calendar', r.status, 403);
  r = await emp.req('POST', '/calendar', { clientId: a, title: 'Sneaky post', eventType: 'Static Post', eventDate: '2031-06-10' });
  check('employee cannot add items', r.status, 403);
  const item = calItems[0];
  r = await emp.req('PUT', `/calendar/${item.id}`, { status: 'in_production' });
  check('employee cannot change an item that isn’t theirs', r.status, 403);
  await am.req('PUT', `/calendar/${item.id}`, { assignedTo: ids.emp });
  r = await emp.req('PUT', `/calendar/${item.id}`, { status: 'in_production' });
  check('…but can move their own item forward', r.status, 200, r.body?.error?.message || '');
  r = await emp.req('PUT', `/calendar/${item.id}`, { title: 'Renamed' });
  check('…not rename it', r.status, 403);
  r = await emp.req('DELETE', `/calendar/${item.id}`);
  check('…or delete it', r.status, 403);
  r = await other.req('GET', `/calendar?clientId=${a}&month=2031-06`);
  check('outsider blocked from the client calendar', r.status, 403);
  r = await other.req('GET', '/calendar?month=2031-06');
  check('outsider’s all-clients view hides it', (r.body?.data || []).filter((e) => Number(e.client_id) === a).length, 0);

  console.log('\n── Scheduler drafts next month ──');
  const s1 = await ProjectFlowService.runMonthPlanDrafts(new Date(2031, 6, 22));
  check('22 Jul: August drafted for client A', s1.months.some((m) => m.endsWith('2031-08')), true, JSON.stringify(s1));
  const [[aug]] = await pool.query("SELECT * FROM client_month_plans WHERE client_id = ? AND plan_month = '2031-08'", [a]);
  check('…as an automatic draft with July fee', `${aug?.status}/${aug?.auto_drafted}/${Number(aug?.billing_amount)}`, 'draft/1/30000');
  const [[augCount]] = await pool.query("SELECT COUNT(*) AS n, SUM(status = 'planning') AS held FROM projects WHERE month_plan_id = ?", [aug?.id || 0]);
  check('…with July projects on hold (incl. Graphic + SMM role test)', `${augCount?.n}/${augCount?.held}`, '5/5');
  const [[note]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'month_plan_drafted'", [ids.am]);
  check('account manager notified', Number(note?.n) >= 1, true);
  const s2 = await ProjectFlowService.runMonthPlanDrafts(new Date(2031, 6, 23));
  check('running again creates nothing', s2.months.filter((m) => m.includes('MPLAN')).length, 0);
  const s3 = await ProjectFlowService.runMonthPlanDrafts(new Date(2031, 6, 10));
  check('before the 20th next month is not drafted', s3.months.filter((m) => m.includes('MPLAN')).length, 0);
}

// --setup-only: create just the fixture users and clients (no plans) for a manual UI walkthrough; implies --keep.
if (process.argv.includes('--setup-only')) process.argv.push('--keep');
(process.argv.includes('--purge-only') ? Promise.resolve() : process.argv.includes('--setup-only') ? setup() : run())
  .catch((e) => {
    console.error(e);
    results.push(false);
  })
  .finally(async () => {
    // --keep leaves the fixtures in place for a manual UI check; a normal run (or --purge-only) removes them.
    if (process.argv.includes('--keep')) console.log('\nFixtures kept (log in as am@monthplan.test). Remove with: --purge-only');
    else await purge().catch((e) => console.error('cleanup failed', e));
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
