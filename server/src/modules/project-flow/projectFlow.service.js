import crypto from 'crypto';
import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { TimeService } from '../time/time.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ROLE_SLUG_MAP } from '../services/workflows.data.js';

export const PROJECT_CATEGORIES = ['regular', 'one_time', 'urgent', 'out_of_service'];

const CATEGORY_PREFIX = { regular: 'REG', one_time: 'OTP', urgent: 'URG', out_of_service: 'OOS' };
const CATEGORY_TO_LEGACY_TYPE = { regular: 'Regular', one_time: 'One Time', urgent: 'One Time', out_of_service: 'One Time' };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function httpError(status, message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

export function currentCycleMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function cycleLabel(cycleMonth) {
  const [y, m] = cycleMonth.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Normalises a step's default task templates: [{ title, clientReview, role }]. */
function cleanTemplates(list) {
  const arr = typeof list === 'string' ? parseJson(list, []) : list;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => (typeof t === 'string' ? { title: t } : t || {}))
    .filter((t) => String(t.title || '').trim())
    .slice(0, 50)
    .map((t) => ({ title: String(t.title).trim().slice(0, 255), clientReview: Boolean(t.clientReview), role: t.role || null }));
}

/** A pipeline/project step with its task templates parsed. */
const withTemplates = (s) => ({ ...s, task_templates: cleanTemplates(s.task_templates) });

/** YYYY-MM-DD + n calendar days (UTC, no timezone drift). */
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

/** From this day of the month, next month's plan is drafted (copied from this month) for review. */
const DRAFT_FROM_DAY = 20;

/** First and last calendar day (YYYY-MM-DD) of a YYYY-MM month. */
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** SQL: users row `alias` is internal staff (not a client-portal account by role column, linked client, or client role). */
const staffSql = (alias = 'users') =>
  `(${alias}.role <> 'client' AND ${alias}.client_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM user_roles sur JOIN roles sr ON sr.id = sur.role_id WHERE sur.user_id = ${alias}.id AND sr.slug IN ('client', 'freelance-videographer')))`;

const roleSlugs = (user) => (user.roles || []).map((r) => r.slug);

export function isClientPortalUser(user) {
  return Boolean(user.role === 'client' || user.client_id || roleSlugs(user).includes('client'));
}

/** Owner / admin / project manager: see and manage every client project (mirrors ProjectsPolicy + PM oversight). */
function hasFullAccess(user) {
  if (isClientPortalUser(user)) return false;
  const slugs = roleSlugs(user);
  return Boolean(
    user.isOwner ||
      ['owner', 'admin', 'project-manager', 'leadership'].some((s) => slugs.includes(s)) ||
      ['owner', 'admin', 'project_manager'].includes(user.role)
  );
}

function canSeeAllEmployees(user) {
  return Boolean(
    hasFullAccess(user) ||
      user.permissions?.includes('tasks.view_all') ||
      user.permissions?.includes('tasks.manage_all') ||
      user.permissions?.includes('projects.create')
  );
}

/**
 * SQL predicate: project `alias` is visible to a non-full-access user — they lead/manage/created it, are a member,
 * are assigned to a step or task in it, or are the client's account manager. Needs 7 copies of the user id.
 */
function projectAccessSql(alias = 'p') {
  return `(${alias}.project_manager_id = ? OR ${alias}.team_leader_id = ? OR ${alias}.created_by = ?
    OR EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.project_id = ${alias}.id AND pmx.user_id = ?)
    OR EXISTS (SELECT 1 FROM project_steps psx JOIN project_step_assignees psax ON psax.project_step_id = psx.id
               WHERE psx.project_id = ${alias}.id AND psax.user_id = ?)
    OR EXISTS (SELECT 1 FROM tasks tx WHERE tx.project_id = ${alias}.id AND tx.is_archived = 0 AND tx.assignee_id = ?)
    OR EXISTS (SELECT 1 FROM clients cx WHERE cx.id = ${alias}.client_id AND cx.account_manager_id = ?))`;
}
const accessParams = (user) => Array(7).fill(Number(user.id));

function assertStaff(user) {
  if (isClientPortalUser(user)) throw httpError(403, 'Client portal accounts cannot access internal project management', 'FORBIDDEN');
}

async function generateProjectCode(conn, category) {
  const prefix = CATEGORY_PREFIX[category] || 'PRJ';
  for (let i = 0; i < 5; i += 1) {
    const code = `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [rows] = await conn.query('SELECT id FROM projects WHERE project_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  throw httpError(500, 'Could not generate a unique project code', 'CODE_GENERATION_FAILED');
}

async function assertActiveUsers(conn, userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  if (ids.length === 0) return;
  const [rows] = await conn.query(
    `SELECT id FROM users WHERE id IN (?) AND status = 'active' AND ${staffSql('users')}`,
    [ids]
  );
  if (rows.length !== ids.length) {
    throw httpError(400, 'One or more selected employees are invalid or inactive', 'INVALID_ASSIGNEE');
  }
}

export class ProjectFlowService {
  // ───────────────────────────── Pipelines ─────────────────────────────

  static async listPipelines({ includeArchived = false } = {}) {
    const [rows] = await pool.query(
      `SELECT pp.id, pp.name, pp.description, pp.service_id, pp.template_key, pp.status, pp.created_at, pp.updated_at,
              s.name AS service_name, s.category AS service_category,
              (SELECT COUNT(*) FROM project_pipeline_steps ps WHERE ps.pipeline_id = pp.id) AS step_count,
              (SELECT COUNT(*) FROM projects p WHERE p.pipeline_id = pp.id AND p.is_archived = 0) AS project_count
       FROM project_pipelines pp
       LEFT JOIN services s ON s.id = pp.service_id
       ${includeArchived ? '' : "WHERE pp.status = 'active'"}
       ORDER BY pp.name ASC`
    );
    if (rows.length === 0) return [];
    const [steps] = await pool.query(
      'SELECT * FROM project_pipeline_steps WHERE pipeline_id IN (?) ORDER BY pipeline_id, step_order',
      [rows.map((r) => r.id)]
    );
    return rows.map((r) => ({ ...r, steps: steps.filter((s) => s.pipeline_id === r.id).map(withTemplates) }));
  }

  static async getPipeline(id) {
    const [rows] = await pool.query(
      `SELECT pp.*, s.name AS service_name FROM project_pipelines pp
       LEFT JOIN services s ON s.id = pp.service_id WHERE pp.id = ?`,
      [id]
    );
    if (rows.length === 0) throw httpError(404, 'Pipeline not found', 'NOT_FOUND');
    const [steps] = await pool.query(
      'SELECT * FROM project_pipeline_steps WHERE pipeline_id = ? ORDER BY step_order',
      [id]
    );
    return { ...rows[0], steps: steps.map(withTemplates) };
  }

  static async #writePipelineSteps(conn, pipelineId, steps) {
    await conn.query('DELETE FROM project_pipeline_steps WHERE pipeline_id = ?', [pipelineId]);
    let order = 1;
    for (const step of steps) {
      const isApproval = step.stepType === 'approval';
      await conn.query(
        `INSERT INTO project_pipeline_steps
          (pipeline_id, step_order, name, description, step_type, needs_admin_approval, needs_client_approval, est_days, task_templates)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pipelineId,
          order,
          step.name.trim(),
          step.description || null,
          isApproval ? 'approval' : 'work',
          isApproval ? Boolean(step.needsAdminApproval ?? true) : false,
          isApproval ? Boolean(step.needsClientApproval ?? true) : false,
          step.estDays || null,
          JSON.stringify(cleanTemplates(step.taskTemplates))
        ]
      );
      order += 1;
    }
  }

  static async createPipeline(data, actor, req) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        'INSERT INTO project_pipelines (name, description, service_id, created_by) VALUES (?, ?, ?, ?)',
        [data.name.trim(), data.description || null, data.serviceId || null, actor.id]
      );
      await this.#writePipelineSteps(conn, res.insertId, data.steps);
      await conn.commit();
      await AuditService.log({ actorId: actor.id, action: 'pipeline.create', entityType: 'project_pipeline', entityId: res.insertId, details: { name: data.name }, req });
      return this.getPipeline(res.insertId);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async updatePipeline(id, data, actor, req) {
    await this.getPipeline(id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'UPDATE project_pipelines SET name = ?, description = ?, service_id = ?, status = COALESCE(?, status) WHERE id = ?',
        [data.name.trim(), data.description || null, data.serviceId || null, data.status || null, id]
      );
      // Existing projects keep their own snapshot of steps, so templates can be edited safely.
      await this.#writePipelineSteps(conn, id, data.steps);
      await conn.commit();
      await AuditService.log({ actorId: actor.id, action: 'pipeline.update', entityType: 'project_pipeline', entityId: id, req });
      return this.getPipeline(id);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async setPipelineStatus(id, status, actor, req) {
    await this.getPipeline(id);
    await pool.query('UPDATE project_pipelines SET status = ? WHERE id = ?', [status, id]);
    await AuditService.log({ actorId: actor.id, action: `pipeline.${status}`, entityType: 'project_pipeline', entityId: id, req });
    return this.getPipeline(id);
  }

  // ───────────────────────────── Clients ─────────────────────────────

  static async listActiveClients(actor, { search = '' } = {}) {
    assertStaff(actor);
    const full = hasFullAccess(actor);
    // Non-full users only count projects they can see, and only see clients they manage or work for.
    const joinScope = full ? '' : ` AND ${projectAccessSql('p')}`;
    const params = full ? [] : accessParams(actor);
    let where = "c.status = 'active'";
    if (!full) {
      where += ` AND (c.account_manager_id = ? OR EXISTS (SELECT 1 FROM projects p2 WHERE p2.client_id = c.id AND p2.is_archived = 0 AND ${projectAccessSql('p2')}))`;
      params.push(Number(actor.id), ...accessParams(actor));
    }
    if (search.trim()) {
      where += ' AND (c.name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.company_name, c.email, c.phone,
              am.name AS account_manager_name,
              SUM(p.project_category = 'regular') AS regular_count,
              SUM(p.project_category = 'one_time') AS one_time_count,
              SUM(p.project_category = 'urgent') AS urgent_count,
              SUM(p.project_category = 'out_of_service') AS out_of_service_count,
              SUM(p.id IS NOT NULL AND p.status IN ('planning','active','on_hold')) AS open_count
       FROM clients c
       LEFT JOIN users am ON am.id = c.account_manager_id
       LEFT JOIN projects p ON p.client_id = c.id AND p.is_archived = 0 AND p.parent_project_id IS NULL${joinScope}
       WHERE ${where}
       GROUP BY c.id
       ORDER BY COALESCE(c.company_name, c.name) ASC`,
      params
    );
    return rows.map((r) => ({
      ...r,
      regular_count: Number(r.regular_count || 0),
      one_time_count: Number(r.one_time_count || 0),
      urgent_count: Number(r.urgent_count || 0),
      out_of_service_count: Number(r.out_of_service_count || 0),
      open_count: Number(r.open_count || 0)
    }));
  }

  static async #projectSummaries(whereSql, params) {
    const [projects] = await pool.query(
      `SELECT p.id, p.name, p.project_code, p.description, p.project_category, p.assignment_mode,
              p.pipeline_id, p.service_id, p.team_leader_id, p.parent_project_id, p.cycle_month, p.month_plan_id,
              p.monthly_deliverables, p.billing_amount, p.billing_status, p.retainer_auto_invoice, p.retainer_invoice_type,
              (SELECT x.id FROM invoices x WHERE x.project_id = p.id AND x.status <> 'void' ORDER BY x.id DESC LIMIT 1) AS invoice_id,
              (SELECT x.status FROM invoices x WHERE x.project_id = p.id AND x.status <> 'void' ORDER BY x.id DESC LIMIT 1) AS invoice_status,
              p.status, p.priority, p.start_date, p.due_date, p.completed_at, p.created_at, p.client_id,
              c.name AS client_name, c.company_name AS client_company,
              pp.name AS pipeline_name, s.name AS service_name,
              tl.name AS team_leader_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN project_pipelines pp ON pp.id = p.pipeline_id
       LEFT JOIN services s ON s.id = p.service_id
       LEFT JOIN users tl ON tl.id = p.team_leader_id
       WHERE ${whereSql}
       ORDER BY p.created_at DESC`,
      params
    );
    if (projects.length === 0) return [];
    const ids = projects.map((p) => p.id);
    const [steps] = await pool.query(
      'SELECT id, project_id, step_order, name, status, step_type FROM project_steps WHERE project_id IN (?) ORDER BY project_id, step_order',
      [ids]
    );
    const [taskCounts] = await pool.query(
      `SELECT project_id, COUNT(*) AS total, SUM(status = 'completed') AS done
       FROM tasks WHERE project_id IN (?) AND is_archived = 0 GROUP BY project_id`,
      [ids]
    );
    return projects.map((p) => {
      const ps = steps.filter((s) => s.project_id === p.id);
      const tc = taskCounts.find((t) => t.project_id === p.id);
      const current = ps.find((s) => s.status === 'in_progress');
      return {
        ...p,
        monthly_deliverables: parseJson(p.monthly_deliverables, []),
        retainer_auto_invoice: Boolean(p.retainer_auto_invoice),
        step_total: ps.length,
        step_done: ps.filter((s) => s.status === 'completed').length,
        current_step: current ? current.name : null,
        task_total: Number(tc?.total || 0),
        task_done: Number(tc?.done || 0)
      };
    });
  }

  static async getClientProjects(clientId, actor) {
    assertStaff(actor);
    const [clients] = await pool.query(
      `SELECT c.id, c.name, c.company_name, c.email, c.phone, c.status, c.account_manager_id, am.name AS account_manager_name
       FROM clients c LEFT JOIN users am ON am.id = c.account_manager_id WHERE c.id = ?`,
      [clientId]
    );
    if (clients.length === 0) throw httpError(404, 'Client not found', 'NOT_FOUND');

    const full = hasFullAccess(actor);
    const isAm = Number(clients[0].account_manager_id) === Number(actor.id);
    const scoped = !full && !isAm;
    const projects = await this.#projectSummaries(
      `p.client_id = ? AND p.is_archived = 0${scoped ? ` AND ${projectAccessSql('p')}` : ''}`,
      scoped ? [clientId, ...accessParams(actor)] : [clientId]
    );
    if (scoped && projects.length === 0) throw httpError(403, 'You do not work on any project for this client', 'FORBIDDEN');
    // Projects inside a month plan are listed under that plan, not as stand-alone projects.
    const topLevel = projects.filter((p) => !p.parent_project_id && !p.month_plan_id);
    const cycles = projects.filter((p) => p.parent_project_id);
    const withCycles = topLevel.map((p) => ({
      ...p,
      cycles: cycles
        .filter((c) => c.parent_project_id === p.id)
        .sort((a, b) => (a.cycle_month < b.cycle_month ? 1 : -1))
    }));
    const monthPlans = await this.#planSummaries(clientId, actor, { scoped });
    return { client: clients[0], projects: withCycles, month_plans: monthPlans, can_create: full || isAm };
  }

  // ───────────────────────────── Month plans ─────────────────────────────
  // Client -> month (YYYY-MM) -> many projects, one per service line, each with its own pipeline and people.

  static async #planSummaries(clientId, actor, { scoped }) {
    const params = [clientId];
    let scope = '';
    if (scoped) {
      scope = ` AND EXISTS (SELECT 1 FROM projects sp WHERE sp.month_plan_id = mp.id AND sp.is_archived = 0 AND ${projectAccessSql('sp')})`;
      params.push(...accessParams(actor));
    }
    const [rows] = await pool.query(
      `SELECT mp.id, mp.client_id, mp.plan_month, mp.status, mp.notes, mp.billing_amount, mp.copied_from_plan_id,
              mp.created_by, cb.name AS created_by_name, mp.closed_at, mp.created_at, mp.updated_at,
              COUNT(p.id) AS project_count,
              COALESCE(SUM(p.status = 'completed'), 0) AS completed_count,
              COALESCE(SUM(st.total), 0) AS step_total,
              COALESCE(SUM(st.done), 0) AS step_done
       FROM client_month_plans mp
       LEFT JOIN users cb ON cb.id = mp.created_by
       LEFT JOIN projects p ON p.month_plan_id = mp.id AND p.is_archived = 0
       LEFT JOIN (SELECT ps.project_id, COUNT(*) AS total, SUM(ps.status = 'completed') AS done
                  FROM project_steps ps JOIN projects pj ON pj.id = ps.project_id
                  WHERE pj.month_plan_id IS NOT NULL GROUP BY ps.project_id) st ON st.project_id = p.id
       WHERE mp.client_id = ?${scope}
       GROUP BY mp.id
       ORDER BY mp.plan_month DESC`,
      params
    );
    return rows.map((r) => ({
      ...r,
      label: cycleLabel(r.plan_month),
      billing_amount: r.billing_amount == null ? null : Number(r.billing_amount),
      project_count: Number(r.project_count),
      completed_count: Number(r.completed_count),
      step_total: Number(r.step_total),
      step_done: Number(r.step_done)
    }));
  }

  /** Who may see a client's plans: full access / account manager see all; others only plans with their projects. */
  static async #clientScope(clientId, actor) {
    assertStaff(actor);
    const [clients] = await pool.query(
      `SELECT c.id, c.name, c.company_name, c.email, c.phone, c.status, c.account_manager_id, am.name AS account_manager_name
       FROM clients c LEFT JOIN users am ON am.id = c.account_manager_id WHERE c.id = ?`,
      [clientId]
    );
    if (clients.length === 0) throw httpError(404, 'Client not found', 'NOT_FOUND');
    const full = hasFullAccess(actor);
    const isAm = Number(clients[0].account_manager_id) === Number(actor.id);
    return { client: clients[0], canManage: full || isAm, scoped: !full && !isAm };
  }

  static async listMonthPlans(clientId, actor) {
    const { scoped } = await this.#clientScope(clientId, actor);
    return this.#planSummaries(clientId, actor, { scoped });
  }

  static async #loadPlan(planId) {
    const [[plan]] = await pool.query('SELECT * FROM client_month_plans WHERE id = ?', [planId]);
    if (!plan) throw httpError(404, 'Month plan not found', 'NOT_FOUND');
    return plan;
  }

  /** Loads a plan the actor may change (admin / PM / account manager) that is not closed. */
  static async #loadPlanForWrite(planId, actor, { allowClosed = false } = {}) {
    const plan = await this.#loadPlan(planId);
    await this.#assertCanCreateFor(plan.client_id, actor);
    if (!allowClosed && plan.status === 'closed') {
      throw httpError(400, `${cycleLabel(plan.plan_month)} is closed — reopen it to add or change projects`, 'PLAN_CLOSED');
    }
    return plan;
  }

  static async getMonthPlan(planId, actor) {
    const plan = await this.#loadPlan(planId);
    const { client, canManage, scoped } = await this.#clientScope(plan.client_id, actor);
    const projects = await this.#projectSummaries(
      `p.month_plan_id = ? AND p.is_archived = 0${scoped ? ` AND ${projectAccessSql('p')}` : ''}`,
      scoped ? [planId, ...accessParams(actor)] : [planId]
    );
    if (scoped && projects.length === 0) throw httpError(403, 'You do not work on any project in this month plan', 'FORBIDDEN');
    projects.sort((a, b) => a.id - b.id);

    // Deliverable quotas across every project of the month, e.g. { Reels: 8, Posts: 12 }.
    const deliverables = {};
    for (const p of projects) {
      for (const d of p.monthly_deliverables || []) deliverables[d.label] = (deliverables[d.label] || 0) + Number(d.qty || 0);
    }
    const [[prev]] = await pool.query(
      'SELECT id, plan_month FROM client_month_plans WHERE client_id = ? AND plan_month < ? ORDER BY plan_month DESC LIMIT 1',
      [plan.client_id, plan.plan_month]
    );
    const [[next]] = await pool.query(
      'SELECT id, plan_month FROM client_month_plans WHERE client_id = ? AND plan_month > ? ORDER BY plan_month ASC LIMIT 1',
      [plan.client_id, plan.plan_month]
    );
    const [[invoice]] = plan.invoice_id
      ? await pool.query('SELECT id, invoice_number, status, total_amount FROM invoices WHERE id = ?', [plan.invoice_id])
      : [[null]];
    return {
      plan: {
        ...plan,
        label: cycleLabel(plan.plan_month),
        billing_amount: plan.billing_amount == null ? null : Number(plan.billing_amount),
        auto_invoice: Boolean(plan.auto_invoice),
        auto_drafted: Boolean(plan.auto_drafted),
        invoice: invoice ? { ...invoice, total_amount: Number(invoice.total_amount) } : null,
        ...monthBounds(plan.plan_month)
      },
      client,
      projects,
      totals: {
        projects: projects.length,
        completed: projects.filter((p) => p.status === 'completed').length,
        step_total: projects.reduce((s, p) => s + p.step_total, 0),
        step_done: projects.reduce((s, p) => s + p.step_done, 0),
        task_total: projects.reduce((s, p) => s + p.task_total, 0),
        task_done: projects.reduce((s, p) => s + p.task_done, 0),
        deliverables: Object.entries(deliverables).map(([label, qty]) => ({ label, qty }))
      },
      previous_plan: prev ? { id: prev.id, plan_month: prev.plan_month, label: cycleLabel(prev.plan_month) } : null,
      next_plan: next ? { id: next.id, plan_month: next.plan_month, label: cycleLabel(next.plan_month) } : null,
      can_manage: canManage
    };
  }

  /**
   * Builds "prepared" copies of a plan's projects for a new month: same service, pipeline steps, people and quotas.
   * People who are no longer active staff are dropped (a step falls back to the owner); projects whose owner left are skipped.
   */
  static async #prepareCopies(sourcePlan, targetMonth) {
    const [projects] = await pool.query(
      // Retainer cycles are not copied: their retainer creates next month's cycle itself.
      `SELECT * FROM projects WHERE month_plan_id = ? AND parent_project_id IS NULL AND is_archived = 0 AND status <> 'cancelled' ORDER BY id`,
      [sourcePlan.id]
    );
    if (projects.length === 0) return { prepared: [], skipped: [] };
    const ids = projects.map((p) => p.id);
    const [steps] = await pool.query('SELECT * FROM project_steps WHERE project_id IN (?) ORDER BY project_id, step_order', [ids]);
    const [assignRows] = await pool.query(
      `SELECT psa.project_step_id, psa.user_id FROM project_step_assignees psa
       JOIN project_steps ps ON ps.id = psa.project_step_id WHERE ps.project_id IN (?)`,
      [ids]
    );
    const people = [...new Set([...projects.map((p) => p.team_leader_id), ...assignRows.map((a) => a.user_id)].filter(Boolean).map(Number))];
    const [activeRows] = people.length
      ? await pool.query(`SELECT id FROM users WHERE id IN (?) AND status = 'active' AND ${staffSql('users')}`, [people])
      : [[]];
    const active = new Set(activeRows.map((r) => Number(r.id)));

    const oldLabel = cycleLabel(sourcePlan.plan_month);
    const newLabel = cycleLabel(targetMonth);
    const { start, end } = monthBounds(targetMonth);
    const prepared = [];
    const skipped = [];
    for (const p of projects) {
      const leaderId = Number(p.team_leader_id || p.project_manager_id);
      if (!leaderId || !active.has(leaderId)) {
        skipped.push({ id: p.id, name: p.name, reason: 'Owner / team leader is no longer active' });
        continue;
      }
      const ps = steps.filter((s) => s.project_id === p.id);
      const templateSteps = ps.length
        ? ps.map((s) => ({ ...s, id: s.pipeline_step_id }))
        : [{ id: null, step_order: 1, name: 'Execution', description: null, step_type: 'work', needs_admin_approval: 0, needs_client_approval: 0 }];
      const stepAssignees = ps.length
        ? ps.map((s) => {
            const ids2 = assignRows.filter((a) => a.project_step_id === s.id).map((a) => Number(a.user_id)).filter((u) => active.has(u));
            return ids2.length ? [...new Set(ids2)] : [leaderId];
          })
        : [[leaderId]];
      prepared.push({
        category: p.project_category || 'regular',
        mode: p.assignment_mode || 'individual',
        leaderId,
        templateSteps,
        stepAssignees,
        deliverables: parseJson(p.monthly_deliverables, []),
        name: p.name.includes(oldLabel) ? p.name.split(oldLabel).join(newLabel) : `${p.name} — ${newLabel}`,
        description: p.description,
        pipelineId: p.pipeline_id,
        serviceId: p.service_id,
        priority: p.priority || 'medium',
        startDate: start,
        dueDate: end,
        billingAmount: p.project_category === 'out_of_service' ? p.billing_amount : null
      });
    }
    return { prepared, skipped };
  }

  static async createMonthPlan(data, actor, req) {
    await this.#assertCanCreateFor(data.clientId, actor);
    const month = data.month;

    let source = null;
    if (data.copyFromPlanId) {
      source = await this.#loadPlan(data.copyFromPlanId);
      if (Number(source.client_id) !== Number(data.clientId)) throw httpError(400, 'You can only copy a month plan of the same client', 'PLAN_CLIENT_MISMATCH');
    } else if (data.copyPrevious) {
      const [[prev]] = await pool.query(
        'SELECT * FROM client_month_plans WHERE client_id = ? AND plan_month < ? ORDER BY plan_month DESC LIMIT 1',
        [data.clientId, month]
      );
      if (!prev) throw httpError(400, 'There is no earlier month to copy for this client', 'NO_PREVIOUS_PLAN');
      source = prev;
    }
    const status = data.status || 'active';
    const { planId, prepared, skipped } = await this.#createPlanCore({
      clientId: data.clientId,
      month,
      status,
      notes: data.notes || null,
      // A copied month keeps the source's fee and invoice settings unless new ones are given.
      billingAmount: data.billingAmount !== undefined ? data.billingAmount : source?.billing_amount ?? null,
      invoiceType: source?.invoice_type || null,
      autoInvoice: Boolean(source?.auto_invoice),
      source,
      actorId: actor.id
    });
    if (status === 'active') await this.#autoInvoicePlan(planId, actor.id);
    if (status === 'active' && prepared.length) await this.#lifecycleNewWork(data.clientId);

    await AuditService.log({
      actorId: actor.id,
      action: 'month_plan.create',
      entityType: 'client_month_plan',
      entityId: planId,
      details: { clientId: data.clientId, month, copiedFrom: source?.id || null, copied: prepared.length, skipped: skipped.length },
      req
    });
    return { ...(await this.getMonthPlan(planId, actor)), copied: prepared.length, skipped };
  }

  /** Inserts a plan and (optionally) copies of a source plan's projects, in one transaction. Callers check access. */
  static async #createPlanCore({ clientId, month, status, notes, billingAmount, invoiceType, autoInvoice, source, actorId, autoDrafted = false }) {
    const { prepared, skipped } = source ? await this.#prepareCopies(source, month) : { prepared: [], skipped: [] };
    const conn = await pool.getConnection();
    let planId;
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        `INSERT INTO client_month_plans
           (client_id, plan_month, status, notes, billing_amount, invoice_type, auto_invoice, copied_from_plan_id, auto_drafted, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, month, status, notes, billingAmount ?? null, invoiceType, Boolean(autoInvoice), source?.id || null, autoDrafted, actorId]
      );
      planId = res.insertId;
      const plan = { id: planId, plan_month: month, status };
      for (const prep of prepared) await this.#insertProject(conn, prep, { clientId, actorId, plan });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY' && String(e.message).includes('uq_cmp_client_month')) {
        throw httpError(409, `A plan for ${cycleLabel(month)} already exists for this client`, 'PLAN_EXISTS');
      }
      throw e;
    } finally {
      conn.release();
    }
    return { planId, prepared, skipped };
  }

  static async updateMonthPlan(planId, data, actor, req) {
    const plan = await this.#loadPlanForWrite(planId, actor, { allowClosed: true });
    const status = data.status ?? plan.status;
    const invoiceType = data.invoiceType !== undefined ? data.invoiceType : plan.invoice_type;
    const autoInvoice = data.autoInvoice !== undefined ? data.autoInvoice : Boolean(plan.auto_invoice);
    const fee = data.billingAmount !== undefined ? data.billingAmount : plan.billing_amount;
    if (invoiceType === 'INC' && data.invoiceType === 'INC') {
      const [[c]] = await pool.query('SELECT gstin FROM clients WHERE id = ?', [plan.client_id]);
      if (!c?.gstin) throw httpError(400, "INC invoices need the client's GSTIN — add it in Client GST Profiles first", 'CLIENT_GSTIN_REQUIRED');
    }
    if (autoInvoice && !(Number(fee) > 0)) throw httpError(400, 'Set a monthly fee before turning on automatic invoices', 'AMOUNT_REQUIRED');
    await pool.query(
      `UPDATE client_month_plans
         SET status = ?, notes = ?, billing_amount = ?, invoice_type = ?, auto_invoice = ?,
             closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, NOW()) ELSE NULL END
       WHERE id = ?`,
      [status, data.notes !== undefined ? data.notes || null : plan.notes, fee, invoiceType || null, Boolean(autoInvoice), status, planId]
    );
    // Leaving draft starts the work: projects go active, first steps start and quota tasks are created.
    let activated = 0;
    if (plan.status === 'draft' && status !== 'draft') activated = await this.#activatePlanProjects(planId, actor.id);
    if (activated) await this.#lifecycleNewWork(plan.client_id);
    if (status === 'active') await this.#autoInvoicePlan(planId, actor.id);
    await AuditService.log({
      actorId: actor.id,
      action: 'month_plan.update',
      entityType: 'client_month_plan',
      entityId: planId,
      details: { ...data, activated },
      req
    });
    return this.getMonthPlan(planId, actor);
  }

  /** Starts every on-hold ('planning') project of a plan that was a draft. Returns how many were started. */
  static async #activatePlanProjects(planId, actorId) {
    const [[plan]] = await pool.query('SELECT * FROM client_month_plans WHERE id = ?', [planId]);
    const [projects] = await pool.query(
      `SELECT p.*, DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_ymd, DATE_FORMAT(p.due_date, '%Y-%m-%d') AS due_ymd
       FROM projects p WHERE p.month_plan_id = ? AND p.status = 'planning' AND p.is_archived = 0 AND p.parent_project_id IS NULL`,
      [planId]
    );
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const p of projects) {
        await conn.query("UPDATE projects SET status = 'active' WHERE id = ?", [p.id]);
        await conn.query(
          `UPDATE project_steps SET status = 'in_progress', started_at = NOW()
           WHERE project_id = ? AND status = 'pending' ORDER BY step_order LIMIT 1`,
          [p.id]
        );
        const deliverables = parseJson(p.monthly_deliverables, []);
        const [[hasTasks]] = await conn.query('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?', [p.id]);
        if (deliverables.length && !Number(hasTasks.n)) {
          await this.#insertQuotaTasks(conn, {
            projectId: p.id,
            code: p.project_code,
            clientId: p.client_id,
            creatorId: actorId || p.created_by,
            assignedBy: actorId || null,
            ownerId: p.team_leader_id,
            priority: p.priority,
            startDate: p.start_ymd || monthBounds(plan.plan_month).start,
            endDate: p.due_ymd || monthBounds(plan.plan_month).end,
            month: plan.plan_month,
            deliverables
          });
        }
        await this.#spawnTemplateTasks(conn, p.id, actorId);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return projects.length;
  }

  /** One GST draft invoice for the whole month: the plan fee, with every service project listed in the details. */
  static async #draftPlanInvoice(planId, actorId) {
    const [[plan]] = await pool.query('SELECT * FROM client_month_plans WHERE id = ?', [planId]);
    if (plan.invoice_id) {
      const [[inv]] = await pool.query("SELECT id FROM invoices WHERE id = ? AND status <> 'void'", [plan.invoice_id]);
      if (inv) return { id: inv.id, created: false };
    }
    if (!(Number(plan.billing_amount) > 0)) throw httpError(400, 'Set a monthly fee for this month before creating its invoice', 'AMOUNT_REQUIRED');
    // Out-of-service work is billed on its own; retainer cycles bill through their retainer.
    const [projects] = await pool.query(
      `SELECT p.name, p.monthly_deliverables, s.name AS service_name FROM projects p LEFT JOIN services s ON s.id = p.service_id
       WHERE p.month_plan_id = ? AND p.is_archived = 0 AND p.status <> 'cancelled'
         AND p.project_category <> 'out_of_service' AND p.parent_project_id IS NULL ORDER BY p.id`,
      [planId]
    );
    const details = projects
      .map((p) => {
        const q = parseJson(p.monthly_deliverables, []).map((d) => `${d.qty} ${d.label}`).join(', ');
        return `• ${p.service_name || p.name}${q ? `: ${q}` : ''}`;
      })
      .join('\n');
    const doc = await FinanceService.createDraft(
      {
        invoiceType: plan.invoice_type || 'INV',
        clientId: plan.client_id,
        projectId: null,
        invoiceDate: `${plan.plan_month}-01`,
        notes: `Monthly services for ${cycleLabel(plan.plan_month)}.`,
        items: [
          {
            serviceId: null,
            description: `Monthly services — ${cycleLabel(plan.plan_month)}`,
            details: details || null,
            quantity: 1,
            unitPrice: Number(plan.billing_amount),
            discountAmount: 0
          }
        ]
      },
      { id: actorId || plan.created_by },
      null
    );
    await pool.query('UPDATE client_month_plans SET invoice_id = ? WHERE id = ?', [doc.invoice.id, planId]);
    return { id: doc.invoice.id, created: true };
  }

  /** Automatic invoices never block the plan: problems are logged and the plan carries on. */
  static async #autoInvoicePlan(planId, actorId) {
    const [[plan]] = await pool.query('SELECT auto_invoice, billing_amount, invoice_id FROM client_month_plans WHERE id = ?', [planId]);
    if (!plan?.auto_invoice || !(Number(plan.billing_amount) > 0)) return null;
    try {
      return (await this.#draftPlanInvoice(planId, actorId)).id;
    } catch (e) {
      console.error(`Month plan auto-invoice failed for plan ${planId}:`, e.message);
      return null;
    }
  }

  /** Admins / project managers or the client's account manager. */
  static async createMonthPlanInvoice(planId, actor, req) {
    const plan = await this.#loadPlanForWrite(planId, actor, { allowClosed: true });
    if (plan.status === 'draft') throw httpError(400, 'Activate this month before invoicing it', 'PLAN_DRAFT');
    const r = await this.#draftPlanInvoice(planId, actor.id);
    if (r.created) {
      await AuditService.log({ actorId: actor.id, action: 'month_plan.invoice', entityType: 'client_month_plan', entityId: planId, details: { invoiceId: r.id }, req });
    }
    return { ...(await this.getMonthPlan(planId, actor)), invoice_created: r.created };
  }

  /**
   * Scheduler: keeps month plans rolling. For the current month (catch-up) and, from DRAFT_FROM_DAY on, next month,
   * any active client whose previous month has a plan with service projects gets a DRAFT copy to review and activate.
   */
  static async runMonthPlanDrafts(date = new Date()) {
    const targets = [currentCycleMonth(date)];
    if (date.getDate() >= DRAFT_FROM_DAY) targets.push(currentCycleMonth(new Date(date.getFullYear(), date.getMonth() + 1, 1)));
    let created = 0;
    const months = [];
    for (const month of targets) {
      const [y, m] = month.split('-').map(Number);
      const prevMonth = currentCycleMonth(new Date(y, m - 2, 1));
      const [sources] = await pool.query(
        `SELECT mp.*, c.account_manager_id, COALESCE(c.company_name, c.name) AS client_name
         FROM client_month_plans mp JOIN clients c ON c.id = mp.client_id AND c.status = 'active'
         WHERE mp.plan_month = ? AND mp.status <> 'draft'
           AND EXISTS (SELECT 1 FROM projects p WHERE p.month_plan_id = mp.id AND p.parent_project_id IS NULL
                         AND p.is_archived = 0 AND p.status <> 'cancelled')
           AND NOT EXISTS (SELECT 1 FROM client_month_plans x WHERE x.client_id = mp.client_id AND x.plan_month = ?)`,
        [prevMonth, month]
      );
      for (const source of sources) {
        try {
          const actorId = source.account_manager_id || source.created_by;
          const { planId, prepared } = await this.#createPlanCore({
            clientId: source.client_id,
            month,
            status: 'draft',
            notes: null,
            billingAmount: source.billing_amount,
            invoiceType: source.invoice_type,
            autoInvoice: Boolean(source.auto_invoice),
            source,
            actorId,
            autoDrafted: true
          });
          created += 1;
          months.push(`${source.client_name} ${month}`);
          const recipients = [...new Set([source.account_manager_id, source.created_by].filter(Boolean).map(Number))];
          for (const uid of recipients) {
            await NotificationsService.createNotification({
              recipientUserId: uid,
              type: 'month_plan_drafted',
              title: `${cycleLabel(month)} plan ready to review`,
              message: `${source.client_name}: ${prepared.length} project${prepared.length === 1 ? '' : 's'} copied from ${cycleLabel(source.plan_month)}. Review and activate to start the work.`,
              entityType: 'client_month_plan',
              entityId: planId,
              actionUrl: `/month-plans/${planId}`
            }).catch((e) => console.error('Month plan draft notification failed:', e.message));
          }
        } catch (e) {
          if (e.code !== 'PLAN_EXISTS') console.error(`Month plan draft failed for client ${source.client_id} (${month}):`, e.message);
        }
      }
    }
    return { created, months };
  }

  /** Adds several service projects to a month in one go (all or nothing). */
  static async addMonthPlanProjects(planId, items, actor, req) {
    const plan = await this.#loadPlanForWrite(planId, actor);
    const prepared = [];
    for (const [i, item] of items.entries()) {
      try {
        prepared.push(await this.#prepareProject(item, plan));
      } catch (e) {
        if (e.status) e.message = `Project ${i + 1}: ${e.message}`;
        throw e;
      }
    }
    const conn = await pool.getConnection();
    const ids = [];
    try {
      await conn.beginTransaction();
      for (const prep of prepared) ids.push(await this.#insertProject(conn, prep, { clientId: plan.client_id, actorId: actor.id, plan }));
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({
      actorId: actor.id,
      action: 'month_plan.add_projects',
      entityType: 'client_month_plan',
      entityId: planId,
      details: { projectIds: ids },
      req
    });
    if (plan.status === 'active' && ids.length) await this.#lifecycleNewWork(plan.client_id);
    return { ...(await this.getMonthPlan(planId, actor)), created_ids: ids };
  }

  /**
   * Bundling services onto a client (Clients page / onboarding) = adding them to the client's month plan for the
   * current month (created if missing). Each service becomes a project on its pipeline, owned by `assigneeId`,
   * and its step tasks spawn straight away. A service already in that month is skipped.
   * items: [{ serviceId, assigneeId }]
   */
  static async addServicesToMonth(clientId, items, actor, req, { month = currentCycleMonth() } = {}) {
    await this.#assertCanCreateFor(clientId, actor);
    await pool.query(
      "INSERT IGNORE INTO client_month_plans (client_id, plan_month, status, created_by) VALUES (?, ?, 'active', ?)",
      [clientId, month, actor.id]
    );
    const [[planRow]] = await pool.query('SELECT id FROM client_month_plans WHERE client_id = ? AND plan_month = ?', [clientId, month]);
    const plan = await this.#loadPlanForWrite(planRow.id, actor);

    const [inMonth] = await pool.query(
      "SELECT DISTINCT service_id FROM projects WHERE month_plan_id = ? AND is_archived = 0 AND status <> 'cancelled' AND service_id IS NOT NULL",
      [plan.id]
    );
    const taken = new Set(inMonth.map((r) => Number(r.service_id)));
    const prepared = [];
    const skipped = [];
    for (const item of items) {
      const serviceId = Number(item.serviceId);
      if (taken.has(serviceId)) {
        skipped.push(serviceId);
        continue;
      }
      // The team's own pipeline for the service wins over the standard one seeded from the playbook.
      const [[pipe]] = await pool.query(
        "SELECT id FROM project_pipelines WHERE service_id = ? AND status = 'active' ORDER BY template_key IS NOT NULL, id LIMIT 1",
        [serviceId]
      );
      prepared.push(
        await this.#prepareProject(
          { serviceId, pipelineId: pipe?.id || null, category: 'regular', assignmentMode: 'individual', assigneeId: item.assigneeId },
          plan
        )
      );
      taken.add(serviceId);
    }

    const conn = await pool.getConnection();
    const ids = [];
    try {
      await conn.beginTransaction();
      for (const prep of prepared) ids.push(await this.#insertProject(conn, prep, { clientId, actorId: actor.id, plan }));
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if (ids.length) {
      await AuditService.log({ actorId: actor.id, action: 'month_plan.bundle_services', entityType: 'client_month_plan', entityId: plan.id, details: { projectIds: ids, skipped }, req });
    }
    if (plan.status === 'active' && ids.length) await this.#lifecycleNewWork(clientId);
    return { plan_id: plan.id, plan_month: month, project_ids: ids, skipped_service_ids: skipped };
  }

  // ───────────────────────────── Projects ─────────────────────────────

  /** Admins / project managers, or the client's account manager, may create projects and month plans for a client. */
  static async #assertCanCreateFor(clientId, actor) {
    assertStaff(actor);
    const [clients] = await pool.query('SELECT id, name, company_name, status, account_manager_id FROM clients WHERE id = ?', [clientId]);
    if (clients.length === 0) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    if (!hasFullAccess(actor) && Number(clients[0].account_manager_id) !== Number(actor.id)) {
      throw httpError(403, "Only admins, project managers or this client's account manager can create projects for it", 'FORBIDDEN');
    }
    return clients[0];
  }

  /**
   * Validates one project request and resolves its owner, step snapshot and step people. Reads only.
   * With a month plan the project is concrete monthly work: dates default to that month and quotas become tasks.
   */
  static async #prepareProject(data, plan = null) {
    const category = data.category || 'regular';
    const mode = data.assignmentMode;
    const leaderId = mode === 'individual' ? data.assigneeId : data.teamLeaderId;
    if (!leaderId) {
      throw httpError(400, mode === 'individual' ? 'Select the person who will own this project' : 'Select a team leader', 'ASSIGNEE_REQUIRED');
    }

    // Resolve the pipeline steps that will be copied onto the project.
    let templateSteps = [];
    if (data.pipelineId) {
      const pipeline = await this.getPipeline(data.pipelineId);
      if (pipeline.status !== 'active') throw httpError(400, 'Selected pipeline is archived', 'PIPELINE_ARCHIVED');
      templateSteps = pipeline.steps;
    }
    if (templateSteps.length === 0) {
      templateSteps = [{ id: null, step_order: 1, name: 'Execution', description: null, step_type: 'work', needs_admin_approval: 0, needs_client_approval: 0 }];
    }

    // Who works each step: individual => owner does every step; team => explicit map (approval defaults to leader).
    const stepAssignees = templateSteps.map((step, idx) => {
      if (mode === 'individual') return [Number(leaderId)];
      const key = String(step.id ?? `idx${idx}`);
      const chosen = (data.stepAssignees?.[key] || data.stepAssignees?.[`idx${idx}`] || []).map(Number);
      if (chosen.length > 0) return [...new Set(chosen)];
      return [Number(leaderId)];
    });
    await assertActiveUsers(pool, [leaderId, ...stepAssignees.flat()]);

    const deliverables = (data.monthlyDeliverables || [])
      .filter((d) => d && d.label && Number(d.qty) > 0)
      .map((d) => ({ label: String(d.label).trim(), qty: Number(d.qty) }));

    let name = String(data.name || '').trim();
    let startDate = data.startDate || null;
    let dueDate = data.dueDate || null;
    if (plan) {
      const { start, end } = monthBounds(plan.plan_month);
      if (!name) {
        const [[svc]] = data.serviceId ? await pool.query('SELECT name FROM services WHERE id = ?', [data.serviceId]) : [[null]];
        name = `${svc?.name || 'Project'} — ${cycleLabel(plan.plan_month)}`;
      }
      startDate = startDate || start;
      dueDate = dueDate || end;
    } else if (category === 'regular') {
      // A regular retainer without a month plan is a template; its dated work lives in monthly cycles.
      startDate = null;
      dueDate = null;
    }
    if (name.length < 2) throw httpError(400, 'Project name is required', 'NAME_REQUIRED');
    if (startDate && dueDate && dueDate < startDate) throw httpError(400, 'Due date cannot be before start date', 'INVALID_DATES');

    return {
      category,
      mode,
      leaderId: Number(leaderId),
      templateSteps,
      stepAssignees,
      deliverables,
      name,
      description: data.description || null,
      pipelineId: data.pipelineId || null,
      serviceId: data.serviceId || null,
      priority: category === 'urgent' ? 'urgent' : data.priority || 'medium',
      startDate,
      dueDate,
      billingAmount: category === 'out_of_service' ? data.billingAmount ?? null : null
    };
  }

  /** Inserts a prepared project (steps, people, and — inside a month plan — its quota tasks). Caller owns the transaction. */
  static async #insertProject(conn, prep, { clientId, actorId, plan = null }) {
    const isTemplate = prep.category === 'regular' && !plan;
    // In a draft month nothing starts yet: the project waits as 'planning' until the month is activated.
    const onHold = plan?.status === 'draft';
    const code = await generateProjectCode(conn, prep.category);
    const [res] = await conn.query(
      `INSERT INTO projects
        (name, project_code, description, project_type, project_category, assignment_mode, pipeline_id, service_id,
         team_leader_id, cycle_month, month_plan_id, monthly_deliverables, billing_amount, billing_status,
         client_id, project_manager_id, created_by, status, priority, visibility, start_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'internal', ?, ?)`,
      [
        prep.name,
        code,
        prep.description,
        CATEGORY_TO_LEGACY_TYPE[prep.category],
        prep.category,
        prep.mode,
        prep.pipelineId,
        prep.serviceId,
        prep.leaderId,
        plan ? plan.plan_month : null,
        plan ? plan.id : null,
        prep.category === 'regular' || plan ? JSON.stringify(prep.deliverables) : null,
        prep.billingAmount,
        prep.category === 'out_of_service' ? 'unbilled' : null,
        clientId,
        prep.leaderId,
        actorId,
        onHold ? 'planning' : 'active',
        prep.priority,
        prep.startDate,
        prep.dueDate
      ]
    );
    const projectId = res.insertId;
    await this.#insertSteps(conn, projectId, prep.templateSteps, prep.stepAssignees, {
      start: !isTemplate && !onHold,
      startDate: prep.startDate,
      dueDate: prep.dueDate
    });
    await this.#syncMembers(conn, projectId, prep.leaderId, prep.stepAssignees.flat(), actorId);
    if (plan && !onHold && prep.deliverables.length) {
      await this.#insertQuotaTasks(conn, {
        projectId,
        code,
        clientId,
        creatorId: actorId,
        assignedBy: actorId,
        ownerId: prep.leaderId,
        priority: prep.priority,
        startDate: prep.startDate,
        endDate: prep.dueDate,
        month: plan.plan_month,
        deliverables: prep.deliverables
      });
    }
    // Retainer templates and on-hold drafts get their step tasks later (each cycle / on activation).
    if (!isTemplate && !onHold) await this.#spawnTemplateTasks(conn, projectId, actorId);
    return projectId;
  }

  /** Monthly quotas (e.g. 12 posts, 4 videos) become one task each for the owner to split further. */
  static async #insertQuotaTasks(conn, { projectId, code, clientId, creatorId, assignedBy, ownerId, priority, startDate, endDate, month, deliverables }) {
    let n = 1;
    for (const d of deliverables) {
      const [tRes] = await conn.query(
        `INSERT INTO tasks (task_code, title, description, project_id, client_id, source, creator_id, status, column_status,
                            assignee_id, priority, start_date, due_date, target_qty)
         VALUES (?, ?, ?, ?, ?, 'Manual', ?, 'todo', 'todo', ?, ?, ?, ?, ?)`,
        [
          `${code}-T${n}`,
          `${d.label} × ${d.qty} — ${cycleLabel(month)}`,
          `Monthly quota for ${cycleLabel(month)}: ${d.qty} ${d.label}. Split into individual tasks from the employee task desk.`,
          projectId,
          clientId,
          creatorId,
          ownerId,
          priority,
          startDate,
          endDate,
          d.qty
        ]
      );
      await conn.query('INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by) VALUES (?, ?, ?)', [tRes.insertId, ownerId, assignedBy || null]);
      n += 1;
    }
  }

  static async createProject(data, actor, req) {
    await this.#assertCanCreateFor(data.clientId, actor);
    const plan = data.monthPlanId ? await this.#loadPlanForWrite(data.monthPlanId, actor) : null;
    if (plan && Number(plan.client_id) !== Number(data.clientId)) {
      throw httpError(400, 'That month plan belongs to another client', 'PLAN_CLIENT_MISMATCH');
    }
    const prep = await this.#prepareProject(data, plan);

    const conn = await pool.getConnection();
    let projectId;
    try {
      await conn.beginTransaction();
      projectId = await this.#insertProject(conn, prep, { clientId: data.clientId, actorId: actor.id, plan });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await AuditService.log({
      actorId: actor.id,
      action: 'project.create_flow',
      entityType: 'project',
      entityId: projectId,
      details: { category: prep.category, mode: prep.mode, monthPlanId: plan?.id || null },
      req
    });

    // Regular retainers are a template: the actual monthly work lives in generated cycles.
    if (prep.category === 'regular' && !plan) {
      await this.generateCycle(projectId, currentCycleMonth(), actor);
    }
    return this.viewProject(projectId, actor);
  }

  /**
   * Copies steps onto a project. Each step keeps a snapshot of its default task templates and estimated days;
   * with a start date, each step's due date is start + the running total of days (never past the project's due date).
   */
  static async #insertSteps(conn, projectId, templateSteps, stepAssignees, { start, startDate = null, dueDate = null }) {
    let idx = 0;
    let runningDays = 0;
    // A project created part-way through its period (e.g. bundled on the 23rd) counts step days from today,
    // so nothing is overdue the moment it exists. Future months still count from their first day.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const base = startDate && today > startDate && (!dueDate || today <= dueDate) ? today : startDate;
    for (const step of templateSteps) {
      const isFirst = idx === 0;
      const days = Number(step.est_days) || 0;
      runningDays += days;
      let stepDue = base && days ? addDays(base, runningDays) : null;
      if (stepDue && dueDate && stepDue > dueDate) stepDue = dueDate;
      const [res] = await conn.query(
        `INSERT INTO project_steps
          (project_id, pipeline_step_id, step_order, name, description, step_type, est_days, task_templates,
           needs_admin_approval, needs_client_approval, status, started_at, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          step.pipeline_step_id ?? step.id ?? null,
          step.step_order,
          step.name,
          step.description || null,
          step.step_type,
          days || null,
          JSON.stringify(cleanTemplates(step.task_templates)),
          step.needs_admin_approval ? 1 : 0,
          step.needs_client_approval ? 1 : 0,
          start && isFirst ? 'in_progress' : 'pending',
          start && isFirst ? new Date() : null,
          stepDue
        ]
      );
      for (const uid of stepAssignees[idx] || []) {
        await conn.query('INSERT IGNORE INTO project_step_assignees (project_step_id, user_id) VALUES (?, ?)', [res.insertId, uid]);
      }
      idx += 1;
    }
  }

  /**
   * The auto-trigger: turns every step's task templates into real tasks (source 'Workflow'). A template naming a role
   * (e.g. a design task in a social media step) goes to the step person with that role; otherwise to the step's
   * first person, else the project owner. Due = the step's due date, else the project's. Runs once per project.
   */
  static async #spawnTemplateTasks(conn, projectId, actorId) {
    const [[proj]] = await conn.query(
      "SELECT team_leader_id, project_manager_id, priority, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_ymd, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_ymd FROM projects WHERE id = ?",
      [projectId]
    );
    // Only the stage that is open gets its playbook tasks, and only once (stage-by-stage flow).
    const [steps] = await conn.query(
      `SELECT ps.id, ps.task_templates, DATE_FORMAT(ps.due_date, '%Y-%m-%d') AS due_ymd FROM project_steps ps
       WHERE ps.project_id = ? AND ps.status = 'in_progress'
         AND NOT EXISTS (SELECT 1 FROM tasks wt WHERE wt.project_step_id = ps.id AND wt.source = 'Workflow')
       ORDER BY ps.step_order`,
      [projectId]
    );
    if (!steps.length) return 0;
    const [people] = await conn.query(
      `SELECT psa.project_step_id, psa.user_id, GROUP_CONCAT(r.slug) AS slugs
       FROM project_step_assignees psa JOIN project_steps ps ON ps.id = psa.project_step_id
       LEFT JOIN user_roles ur ON ur.user_id = psa.user_id LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ps.project_id = ? GROUP BY psa.project_step_id, psa.user_id ORDER BY psa.assigned_at, psa.user_id`,
      [projectId]
    );
    const owner = Number(proj.team_leader_id || proj.project_manager_id || actorId);
    // Tasks a manager already planned for this stage (same title) are not created twice.
    const [planned] = await conn.query(
      'SELECT project_step_id, LOWER(TRIM(title)) AS title FROM tasks WHERE project_step_id IN (?) AND is_archived = 0',
      [steps.map((s) => s.id)]
    );
    const rows = [];
    for (const step of steps) {
      const onStep = people.filter((p) => p.project_step_id === step.id);
      const have = new Set(planned.filter((p) => p.project_step_id === step.id).map((p) => p.title));
      for (const t of cleanTemplates(step.task_templates)) {
        if (have.has(t.title.trim().toLowerCase())) continue;
        const wanted = t.role ? ROLE_SLUG_MAP[t.role] || String(t.role) : null;
        const byRole = wanted && onStep.find((p) => String(p.slugs || '').split(',').includes(wanted));
        rows.push({
          title: t.title,
          stepId: step.id,
          assigneeId: Number(byRole?.user_id || onStep[0]?.user_id || owner),
          priority: proj.priority || 'medium',
          startDate: proj.start_ymd,
          dueDate: step.due_ymd || proj.due_ymd,
          source: 'Workflow',
          clientDeliverable: t.clientReview
        });
      }
    }
    if (!rows.length) return 0;
    await this.#insertTaskRows(conn, projectId, rows, actorId || owner);
    return rows.length;
  }

  static async #syncMembers(conn, projectId, leaderId, userIds, actorId) {
    await conn.query(
      `INSERT INTO project_members (project_id, user_id, project_role, added_by) VALUES (?, ?, 'lead', ?)
       ON DUPLICATE KEY UPDATE project_role = 'lead'`,
      [projectId, leaderId, actorId]
    );
    for (const uid of new Set(userIds)) {
      if (Number(uid) === Number(leaderId)) continue;
      await conn.query(
        "INSERT IGNORE INTO project_members (project_id, user_id, project_role, added_by) VALUES (?, ?, 'member', ?)",
        [projectId, uid, actorId]
      );
    }
  }

  static async generateCycle(parentId, cycleMonth, actor = null) {
    const [parents] = await pool.query('SELECT * FROM projects WHERE id = ?', [parentId]);
    const parent = parents[0];
    if (!parent) throw httpError(404, 'Project not found', 'NOT_FOUND');
    if (parent.project_category !== 'regular' || parent.parent_project_id || parent.month_plan_id) {
      throw httpError(400, 'Monthly cycles can only be generated for regular retainer projects', 'NOT_REGULAR');
    }
    const [existing] = await pool.query(
      'SELECT id FROM projects WHERE parent_project_id = ? AND cycle_month = ?',
      [parentId, cycleMonth]
    );
    if (existing.length > 0) return { id: existing[0].id, created: false };

    const [parentSteps] = await pool.query('SELECT * FROM project_steps WHERE project_id = ? ORDER BY step_order', [parentId]);
    const [assignRows] = await pool.query(
      'SELECT psa.project_step_id, psa.user_id FROM project_step_assignees psa JOIN project_steps ps ON ps.id = psa.project_step_id WHERE ps.project_id = ?',
      [parentId]
    );
    const stepAssignees = parentSteps.map((s) => assignRows.filter((a) => a.project_step_id === s.id).map((a) => a.user_id));
    // Parent step ids are project_steps ids; only the original pipeline step id may be carried over.
    const templateSteps = parentSteps.map((s) => ({ ...s, id: s.pipeline_step_id }));
    const deliverables = parseJson(parent.monthly_deliverables, []);

    const [y, m] = cycleMonth.split('-').map(Number);
    const startDate = `${cycleMonth}-01`;
    const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const conn = await pool.getConnection();
    let cycleId;
    try {
      await conn.beginTransaction();
      // Each cycle also shows in the client's month plan (created on the fly if the month has none yet).
      let monthPlanId = null;
      if (parent.client_id) {
        await conn.query(
          "INSERT IGNORE INTO client_month_plans (client_id, plan_month, status, created_by) VALUES (?, ?, 'active', ?)",
          [parent.client_id, cycleMonth, actor?.id || parent.created_by]
        );
        const [[mp]] = await conn.query('SELECT id FROM client_month_plans WHERE client_id = ? AND plan_month = ?', [parent.client_id, cycleMonth]);
        monthPlanId = mp?.id || null;
      }
      const code = `${parent.project_code}-${cycleMonth.replace('-', '')}`;
      const [res] = await conn.query(
        `INSERT INTO projects
          (name, project_code, description, project_type, project_category, assignment_mode, pipeline_id, service_id,
           team_leader_id, parent_project_id, cycle_month, month_plan_id, monthly_deliverables,
           client_id, project_manager_id, created_by, status, priority, visibility, start_date, due_date)
         VALUES (?, ?, ?, 'Regular', 'regular', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'internal', ?, ?)`,
        [
          `${parent.name} — ${cycleLabel(cycleMonth)}`,
          code,
          parent.description,
          parent.assignment_mode,
          parent.pipeline_id,
          parent.service_id,
          parent.team_leader_id,
          parentId,
          cycleMonth,
          monthPlanId,
          JSON.stringify(deliverables),
          parent.client_id,
          parent.project_manager_id,
          actor?.id || parent.created_by,
          parent.priority,
          startDate,
          endDate
        ]
      );
      cycleId = res.insertId;
      await this.#insertSteps(conn, cycleId, templateSteps, stepAssignees, { start: true, startDate, dueDate: endDate });
      await this.#syncMembers(conn, cycleId, parent.team_leader_id, stepAssignees.flat(), actor?.id || null);

      // Monthly deliverables (e.g. 12 posts, 4 videos) become quota tasks for the owner/leader to split further.
      await this.#insertQuotaTasks(conn, {
        projectId: cycleId,
        code,
        clientId: parent.client_id,
        creatorId: actor?.id || parent.created_by,
        assignedBy: actor?.id || null,
        ownerId: parent.team_leader_id,
        priority: parent.priority,
        startDate,
        endDate,
        month: cycleMonth,
        deliverables
      });
      await this.#spawnTemplateTasks(conn, cycleId, actor?.id || parent.created_by);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        const [again] = await pool.query('SELECT id FROM projects WHERE parent_project_id = ? AND cycle_month = ?', [parentId, cycleMonth]);
        if (again[0]) return { id: again[0].id, created: false };
      }
      throw e;
    } finally {
      conn.release();
    }
    const invoiceId = await this.#autoDraftRetainerInvoice(parent, cycleId, cycleMonth);
    return { id: cycleId, created: true, invoiceId };
  }

  /**
   * Retainers with a monthly fee and auto-invoicing on get a draft GST invoice for each new cycle (dated the 1st).
   * Never fails the cycle: problems are logged, and a cycle that already has an invoice is left alone.
   */
  static async #autoDraftRetainerInvoice(parent, cycleId, cycleMonth) {
    if (!parent.retainer_auto_invoice || !(Number(parent.billing_amount) > 0)) return null;
    try {
      const [[existing]] = await pool.query("SELECT id FROM invoices WHERE project_id = ? AND status <> 'void' LIMIT 1", [cycleId]);
      if (existing) return existing.id;
      const [[svc]] = parent.service_id ? await pool.query('SELECT name FROM services WHERE id = ?', [parent.service_id]) : [[null]];
      const deliverables = parseJson(parent.monthly_deliverables, []);
      const doc = await FinanceService.createDraft(
        {
          invoiceType: parent.retainer_invoice_type || 'INV',
          clientId: parent.client_id,
          projectId: cycleId,
          invoiceDate: `${cycleMonth}-01`,
          notes: `Monthly retainer for ${cycleLabel(cycleMonth)}.`,
          items: [{
            serviceId: parent.service_id || null,
            description: `${svc?.name || parent.name} — ${cycleLabel(cycleMonth)}`,
            details: deliverables.length ? deliverables.map((d) => `${d.qty} ${d.label}`).join('\n') : null,
            quantity: 1,
            unitPrice: Number(parent.billing_amount),
            discountAmount: 0
          }]
        },
        { id: parent.project_manager_id || parent.created_by },
        null
      );
      return doc.invoice.id;
    } catch (e) {
      console.error(`Retainer auto-invoice failed for project ${parent.id} (${cycleMonth}):`, e.message);
      return null;
    }
  }

  /** Monthly fee + auto-invoicing for a regular retainer. Admins / project managers or the client's account manager. */
  static async updateRetainerBilling(projectId, { amount, invoiceType, autoInvoice }, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (project.project_category !== 'regular' || project.parent_project_id || project.month_plan_id) {
      throw httpError(400, 'Monthly billing is set on the regular retainer, not on a monthly cycle or month plan project', 'NOT_RETAINER');
    }
    if (!hasFullAccess(actor) && Number(project.account_manager_id) !== Number(actor.id)) {
      throw httpError(403, "Only admins or the client's account manager can set retainer billing", 'FORBIDDEN');
    }
    if (invoiceType === 'INC') {
      const [[c]] = await pool.query('SELECT c.gstin FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = ?', [projectId]);
      if (!c?.gstin) throw httpError(400, "INC invoices need the client's GSTIN — add it in Client GST Profiles first", 'CLIENT_GSTIN_REQUIRED');
    }
    if (autoInvoice && !(Number(amount) > 0)) throw httpError(400, 'Set a monthly fee before turning on automatic invoices', 'AMOUNT_REQUIRED');
    await pool.query(
      'UPDATE projects SET billing_amount = ?, retainer_invoice_type = ?, retainer_auto_invoice = ? WHERE id = ?',
      [amount ?? null, invoiceType || 'INV', Boolean(autoInvoice), projectId]
    );
    await AuditService.log({ actorId: actor.id, action: 'project.retainer_billing', entityType: 'project', entityId: projectId, details: { amount, invoiceType, autoInvoice }, req });
    return this.viewProject(projectId, actor);
  }

  /** API entry point: only people who manage the retainer may create a cycle early. */
  static async generateCycleAs(parentId, cycleMonth, actor) {
    const project = await this.#loadProjectForAction(parentId);
    if (!this.#canManage(project, actor)) throw httpError(403, 'Only the team leader or an admin can create monthly cycles', 'FORBIDDEN');
    const result = await this.generateCycle(parentId, cycleMonth, actor);
    return { ...result, project: await this.viewProject(parentId, actor) };
  }

  /** Scheduler entry point: makes sure every active regular retainer has this month's cycle. */
  static async runMonthlyCycles(date = new Date()) {
    const month = currentCycleMonth(date);
    const [parents] = await pool.query(
      `SELECT p.id FROM projects p
       WHERE p.project_category = 'regular' AND p.parent_project_id IS NULL AND p.month_plan_id IS NULL
         AND p.is_archived = 0 AND p.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM projects c WHERE c.parent_project_id = p.id AND c.cycle_month = ?)`,
      [month]
    );
    let created = 0;
    for (const { id } of parents) {
      try {
        const r = await this.generateCycle(id, month);
        if (r.created) created += 1;
      } catch (e) {
        console.error(`Monthly cycle generation failed for project ${id}:`, e.message);
      }
    }
    return { month, created };
  }

  static async getProject(projectId) {
    const [summary] = await this.#projectSummaries('p.id = ?', [projectId]);
    if (!summary) throw httpError(404, 'Project not found', 'NOT_FOUND');

    const [steps] = await pool.query(
      `SELECT ps.*, DATE_FORMAT(ps.due_date, '%Y-%m-%d') AS due_ymd,
              aa.name AS admin_approved_by_name, ca.name AS client_approved_by_name, cb.name AS completed_by_name
       FROM project_steps ps
       LEFT JOIN users aa ON aa.id = ps.admin_approved_by
       LEFT JOIN users ca ON ca.id = ps.client_approved_by
       LEFT JOIN users cb ON cb.id = ps.completed_by
       WHERE ps.project_id = ? ORDER BY ps.step_order`,
      [projectId]
    );
    const [assignees] = steps.length
      ? await pool.query(
          `SELECT psa.project_step_id, u.id, u.name, u.email, u.designations
           FROM project_step_assignees psa JOIN users u ON u.id = psa.user_id
           WHERE psa.project_step_id IN (?) ORDER BY u.name`,
          [steps.map((s) => s.id)]
        )
      : [[]];
    const [taskRows] = await pool.query(
      `SELECT t.id, t.task_code, t.title, t.status, t.column_status, t.source, t.priority, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
              t.project_step_id, t.target_qty, t.completed_at, t.assignee_id, u.name AS assignee_name,
              t.is_client_deliverable, t.revision_count, t.current_submission_id,
              ds.internal_review_status, ds.client_approval_status, ds.version_number AS submission_version
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN deliverable_submissions ds ON ds.id = t.current_submission_id
       WHERE t.project_id = ? AND t.is_archived = 0 ORDER BY t.created_at ASC`,
      [projectId]
    );
    let cycles = [];
    if (summary.project_category === 'regular' && !summary.parent_project_id && !summary.month_plan_id) {
      cycles = await this.#projectSummaries('p.parent_project_id = ?', [projectId]);
      cycles.sort((a, b) => (a.cycle_month < b.cycle_month ? 1 : -1));
    }
    return {
      ...summary,
      steps: steps.map((s) => ({
        ...s,
        assignees: assignees.filter((a) => a.project_step_id === s.id).map(({ project_step_id, ...u }) => u),
        tasks: taskRows.filter((t) => t.project_step_id === s.id)
      })),
      unassigned_tasks: taskRows.filter((t) => !t.project_step_id),
      cycles
    };
  }

  /** Throws 403 unless the actor may see this project. */
  static async assertCanView(projectId, actor) {
    assertStaff(actor);
    if (hasFullAccess(actor)) return;
    const [rows] = await pool.query(`SELECT p.id FROM projects p WHERE p.id = ? AND ${projectAccessSql('p')}`, [
      projectId,
      ...accessParams(actor)
    ]);
    if (rows.length === 0) {
      const [exists] = await pool.query('SELECT id FROM projects WHERE id = ?', [projectId]);
      if (exists.length === 0) throw httpError(404, 'Project not found', 'NOT_FOUND');
      throw httpError(403, 'You do not have access to this project', 'FORBIDDEN');
    }
  }

  /** Access-checked project read for API callers; includes whether the actor can manage it. */
  static async viewProject(projectId, actor) {
    await this.assertCanView(projectId, actor);
    const project = await this.getProject(projectId);
    const loaded = await this.#loadProjectForAction(projectId);
    const canManage = this.#canManage(loaded, actor);
    return {
      ...project,
      // A step can be completed — and broken into tasks — by the people on it or by whoever manages the project.
      steps: project.steps.map((s) => {
        const onStep = s.assignees.some((a) => Number(a.id) === Number(actor.id));
        const open = s.status === 'in_progress';
        return {
          ...s,
          can_complete: open && (canManage || onStep),
          // Managers may plan tasks for a stage that hasn't started; people on the stage add them once it opens.
          can_add_tasks: s.status !== 'completed' && (canManage || (onStep && open)),
          tasks: s.tasks.map((t) => {
            const mine = canManage || Number(t.assignee_id) === Number(actor.id);
            const deliverable = Boolean(t.is_client_deliverable);
            const isMine = Number(t.assignee_id) === Number(actor.id);
            return {
              ...t,
              is_mine: isMine,
              // The assignee works it with their own clock: Start → Done (or Submit for client work).
              can_start: open && isMine && ['todo', 'blocked'].includes(t.status) && t.column_status !== 'revision',
              is_client_deliverable: deliverable,
              // Client deliverables never tick straight to done; they go through review.
              can_toggle: open && mine && (!deliverable || t.status === 'completed'),
              can_submit: open && mine && deliverable && t.status !== 'completed' && t.status !== 'in_review',
              can_review: open && canManage && t.internal_review_status === 'pending'
            };
          })
        };
      }),
      can_manage: canManage,
      can_bill: hasFullAccess(actor) || Number(loaded.account_manager_id) === Number(actor.id)
    };
  }

  static async #loadProjectForAction(projectId) {
    const [rows] = await pool.query(
      `SELECT p.id, p.project_manager_id, p.team_leader_id, p.project_category, p.parent_project_id, p.month_plan_id, p.status,
              c.account_manager_id
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?`,
      [projectId]
    );
    if (rows.length === 0) throw httpError(404, 'Project not found', 'NOT_FOUND');
    return rows[0];
  }

  /** Full-access roles, the project's manager/team leader, or the client's account manager. */
  static #canManage(project, user) {
    if (isClientPortalUser(user)) return false;
    return (
      hasFullAccess(user) ||
      [project.project_manager_id, project.team_leader_id, project.account_manager_id].filter(Boolean).map(Number).includes(Number(user.id))
    );
  }

  static async #loadStep(projectId, stepId) {
    const [rows] = await pool.query('SELECT * FROM project_steps WHERE id = ? AND project_id = ?', [stepId, projectId]);
    if (rows.length === 0) throw httpError(404, 'Step not found', 'NOT_FOUND');
    return rows[0];
  }

  static async updateStepAssignees(projectId, stepId, userIds, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (!this.#canManage(project, actor)) throw httpError(403, 'Only the team leader or an admin can reassign steps', 'FORBIDDEN');
    await this.#loadStep(projectId, stepId);
    const ids = [...new Set(userIds.map(Number))];
    await assertActiveUsers(pool, ids);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM project_step_assignees WHERE project_step_id = ?', [stepId]);
      for (const uid of ids) {
        await conn.query('INSERT INTO project_step_assignees (project_step_id, user_id) VALUES (?, ?)', [stepId, uid]);
      }
      await this.#syncMembers(conn, projectId, project.team_leader_id || project.project_manager_id, ids, actor.id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'project_step.assign', entityType: 'project_step', entityId: stepId, details: { userIds: ids }, req });
    return this.viewProject(projectId, actor);
  }

  static async #advanceFrom(conn, projectId, step, actorId) {
    await conn.query(
      "UPDATE project_steps SET status = 'completed', completed_at = NOW(), completed_by = ? WHERE id = ?",
      [actorId, step.id]
    );
    await this.#syncFlow(conn, projectId, actorId);
  }

  /**
   * Stage-by-stage flow (Master Plan §5): only the current stage is open. When it completes, the next stage opens,
   * its due date is set from today + its estimated days, and its playbook tasks are created. Approval stages are
   * opened the same way and complete once approved. The project completes after its last stage.
   */
  static async #syncFlow(conn, projectId, actorId = null) {
    const [steps] = await conn.query('SELECT id, step_order, step_type, status FROM project_steps WHERE project_id = ? ORDER BY step_order', [projectId]);
    if (steps.length === 0) return;
    if (steps.every((s) => s.status === 'completed')) {
      await conn.query("UPDATE projects SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE id = ?", [projectId]);
      return;
    }
    if (steps.some((s) => s.status === 'in_progress')) return;
    const next = steps.find((s) => s.status !== 'completed');
    if (next) await this.#openStep(conn, projectId, next.id, actorId);
  }

  /** Opens a stage: in progress from now, due date from its estimated days (capped at the project due), tasks spawned. */
  static async #openStep(conn, projectId, stepId, actorId = null) {
    const [[row]] = await conn.query(
      `SELECT ps.est_days, ps.name, p.client_id, DATE_FORMAT(p.due_date, '%Y-%m-%d') AS project_due
       FROM project_steps ps JOIN projects p ON p.id = ps.project_id WHERE ps.id = ?`,
      [stepId]
    );
    let due = null;
    if (row?.est_days) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      due = addDays(today, row.est_days);
      if (row.project_due && due > row.project_due) due = row.project_due;
    }
    await conn.query(
      "UPDATE project_steps SET status = 'in_progress', started_at = NOW(), due_date = COALESCE(?, due_date) WHERE id = ?",
      [due, stepId]
    );
    await this.#spawnTemplateTasks(conn, projectId, actorId);
    // Lifecycle: a reporting stage starting means the client's cycle has reached L5 Reporting.
    if (row?.client_id && /report/i.test(row.name || '')) await this.#moveLifecycle(conn, row.client_id, 'L5', ['L2', 'L3', 'L4']);
  }

  /** Forward-only automatic lifecycle move (Master Plan §6). Managers can still set any stage by hand. */
  static async #moveLifecycle(conn, clientId, to, from) {
    if (!clientId) return;
    const [res] = await conn.query('UPDATE clients SET lifecycle_stage = ? WHERE id = ? AND lifecycle_stage IN (?)', [to, clientId, from]);
    if (res.affectedRows) {
      await AuditService.log({ actorId: null, action: 'client.lifecycle_auto', entityType: 'client', entityId: clientId, details: { to, from } });
    }
  }

  /** New work started for a client (services added / a new month begins) → L2 Strategy & Planning. */
  static async #lifecycleNewWork(clientId) {
    const conn = await pool.getConnection();
    try {
      await this.#moveLifecycle(conn, clientId, 'L2', ['L0', 'L1', 'L5']);
    } finally {
      conn.release();
    }
  }

  /**
   * Reviews & Approvals inbox — everything waiting on a decision, in one place:
   *  - needs_review: work submitted for team review (approve → client / ask for changes)
   *  - stage_approvals: approval stages waiting for admin / client sign-off
   *  - changes_requested: work sent back (by the team or the client) that someone has to fix
   *  - with_client: work the client hasn't answered yet
   *  - my_submissions: my own work still waiting on someone
   * Managers (admin / PM / team leader / the client's account manager) see their projects; everyone sees their own work.
   */
  static async getReviewInbox(actor) {
    assertStaff(actor);
    const me = Number(actor.id);
    const full = hasFullAccess(actor);
    const manage = full ? '1=1' : '(p.project_manager_id = ? OR p.team_leader_id = ? OR c.account_manager_id = ?)';
    const mp = full ? [] : [me, me, me];
    const base = `FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN project_steps ps ON ps.id = t.project_step_id
       LEFT JOIN users au ON au.id = t.assignee_id`;
    const taskCols = `t.id AS task_id, t.title, t.task_code, t.revision_count, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
       t.assignee_id, au.name AS assignee_name, p.id AS project_id, p.name AS project_name, ps.name AS stage_name,
       c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name`;

    const [needsReview] = await pool.query(
      `SELECT ${taskCols}, ds.id AS submission_id, ds.version_number, ds.deliverable_url, ds.submission_notes,
              ds.submitted_at, sub.name AS submitted_by_name
       ${base} JOIN deliverable_submissions ds ON ds.id = t.current_submission_id
       LEFT JOIN users sub ON sub.id = ds.submitted_by
       WHERE t.is_archived = 0 AND ds.internal_review_status = 'pending' AND ${manage}
         AND ds.submitted_by <> ?
       ORDER BY ds.submitted_at ASC`,
      [...mp, me] // nobody reviews their own work
    );
    const [withClient] = await pool.query(
      `SELECT ${taskCols}, ds.id AS submission_id, ds.version_number, ds.deliverable_url, ds.internal_reviewed_at,
              GREATEST(DATEDIFF(NOW(), ds.internal_reviewed_at), 0) AS days_waiting
       ${base} JOIN deliverable_submissions ds ON ds.id = t.current_submission_id
       WHERE t.is_archived = 0 AND ds.client_approval_status = 'pending' AND (${manage} OR t.assignee_id = ?)
       ORDER BY ds.internal_reviewed_at ASC`,
      [...mp, me]
    );
    const [changes] = await pool.query(
      `SELECT ${taskCols},
              COALESCE((SELECT rr.revision_reason FROM deliverable_revision_requests rr WHERE rr.task_id = t.id ORDER BY rr.id DESC LIMIT 1),
                       (SELECT ds2.internal_review_feedback FROM deliverable_submissions ds2 WHERE ds2.id = t.current_submission_id)) AS reason,
              (SELECT rr.requested_by_type FROM deliverable_revision_requests rr WHERE rr.task_id = t.id ORDER BY rr.id DESC LIMIT 1) AS requested_by
       ${base}
       WHERE t.is_archived = 0 AND t.column_status = 'revision' AND t.status <> 'completed' AND (${manage} OR t.assignee_id = ?)
       ORDER BY t.updated_at ASC`,
      [...mp, me]
    );
    const [stageApprovals] = await pool.query(
      `SELECT ps.id AS step_id, ps.name AS stage_name, ps.needs_admin_approval, ps.needs_client_approval,
              ps.admin_approved_at, ps.client_approved_at, ps.started_at, p.id AS project_id, p.name AS project_name,
              c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name
       FROM project_steps ps JOIN projects p ON p.id = ps.project_id LEFT JOIN clients c ON c.id = p.client_id
       WHERE ps.step_type = 'approval' AND ps.status = 'in_progress' AND p.is_archived = 0 AND ${manage}
       ORDER BY ps.started_at ASC`,
      mp
    );
    const [mine] = await pool.query(
      `SELECT ${taskCols}, ds.id AS submission_id, ds.version_number, ds.submitted_at,
              CASE WHEN ds.internal_review_status = 'pending' THEN 'team' ELSE 'client' END AS waiting_on
       ${base} JOIN deliverable_submissions ds ON ds.id = t.current_submission_id
       WHERE t.is_archived = 0 AND ds.submitted_by = ?
         AND (ds.internal_review_status = 'pending' OR ds.client_approval_status = 'pending')
       ORDER BY ds.submitted_at DESC`,
      [me]
    );
    const myChanges = changes.filter((r) => Number(r.assignee_id) === me);
    return {
      needs_review: needsReview,
      stage_approvals: stageApprovals.map((s) => ({
        ...s,
        needs_admin_approval: Boolean(s.needs_admin_approval) && !s.admin_approved_at,
        needs_client_approval: Boolean(s.needs_client_approval) && !s.client_approved_at
      })),
      changes_requested: changes.map((r) => ({ ...r, is_mine: Number(r.assignee_id) === me })),
      with_client: withClient.map((r) => ({ ...r, days_waiting: Number(r.days_waiting || 0) })),
      my_submissions: mine,
      // What the sidebar badge counts: decisions waiting on me + my own work to fix.
      counts: {
        action: needsReview.length + stageApprovals.length + myChanges.length,
        needs_review: needsReview.length,
        stage_approvals: stageApprovals.length,
        changes_requested: changes.length,
        with_client: withClient.length,
        my_submissions: mine.length
      }
    };
  }

  /** For other modules: does this person manage the project (admin / PM, team leader, client's account manager)? */
  static async canManageProject(projectId, actor) {
    try {
      return this.#canManage(await this.#loadProjectForAction(projectId), actor);
    } catch {
      return false;
    }
  }

  /** Work handed in for review: the person's clock on it stops (time logged), so it isn't left running. */
  static async onTaskSubmitted(taskId, actor, req = null) {
    const [[timer]] = await pool.query('SELECT id FROM active_timers WHERE user_id = ? AND task_id = ?', [actor.id, taskId]);
    if (timer) await TimeService.stopTimer(timer.id, actor.id, {}, actor, req);
  }

  /** Public hook for other modules (tasks, deliverables) after a task changes: auto-advance + lifecycle. */
  static async afterTaskChange(taskId, actorId = null) {
    const [[t]] = await pool.query(
      `SELECT t.id, t.project_id, t.project_step_id, t.status, t.client_id, ps.status AS step_status, ps.step_type, ps.step_order
       FROM tasks t LEFT JOIN project_steps ps ON ps.id = t.project_step_id WHERE t.id = ?`,
      [taskId]
    );
    if (!t?.project_step_id || t.step_status !== 'in_progress' || t.step_type !== 'work') return false;
    const [[left]] = await pool.query(
      "SELECT COUNT(*) AS total, SUM(status <> 'completed') AS open FROM tasks WHERE project_step_id = ? AND is_archived = 0",
      [t.project_step_id]
    );
    // A stage finishes itself once every one of its tasks is done.
    if (!Number(left.total) || Number(left.open)) return false;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[fresh]] = await conn.query('SELECT * FROM project_steps WHERE id = ? FOR UPDATE', [t.project_step_id]);
      if (fresh.status !== 'in_progress') {
        await conn.rollback();
        return false;
      }
      await this.#advanceFrom(conn, t.project_id, fresh, actorId);
      if (fresh.step_order === 1) {
        const [[p]] = await conn.query('SELECT client_id FROM projects WHERE id = ?', [t.project_id]);
        await this.#moveLifecycle(conn, p?.client_id, 'L3', ['L2']);
      }
      await conn.commit();
      return true;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /** Deliverables hook: work sent to the client (L4) / client finished reviewing (back to L3). */
  static async onClientReviewChange(clientId, state) {
    const conn = await pool.getConnection();
    try {
      if (state === 'sent') {
        await this.#moveLifecycle(conn, clientId, 'L4', ['L2', 'L3']);
      } else {
        const [[pending]] = await conn.query(
          "SELECT COUNT(*) AS n FROM deliverable_submissions WHERE client_id = ? AND client_approval_status = 'pending'",
          [clientId]
        );
        if (!Number(pending.n)) await this.#moveLifecycle(conn, clientId, 'L3', ['L4']);
      }
    } finally {
      conn.release();
    }
  }

  /** Locked: tasks in a stage that has not started yet (sequential flow). */
  static async #assertTaskOpen(taskId) {
    const [[row]] = await pool.query(
      'SELECT ps.status, ps.name FROM tasks t JOIN project_steps ps ON ps.id = t.project_step_id WHERE t.id = ?',
      [taskId]
    );
    if (row && row.status === 'pending') {
      throw httpError(409, `"${row.name}" hasn't started yet — finish the current stage first`, 'STEP_NOT_STARTED');
    }
  }

  static async completeStep(projectId, stepId, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    const step = await this.#loadStep(projectId, stepId);
    if (step.status !== 'in_progress') throw httpError(409, 'Only the current stage can be completed', 'STEP_NOT_ACTIVE');
    if (step.step_type === 'approval') throw httpError(409, 'Approval steps complete automatically once approved', 'USE_APPROVAL');

    const [assigned] = await pool.query('SELECT 1 FROM project_step_assignees WHERE project_step_id = ? AND user_id = ?', [stepId, actor.id]);
    if (!this.#canManage(project, actor) && assigned.length === 0) {
      throw httpError(403, 'Only people assigned to this step, the team leader or an admin can complete it', 'FORBIDDEN');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.#advanceFrom(conn, projectId, step, actor.id);
      // Lifecycle: the first stage (strategy / planning) done moves the client into L3 Execution.
      if (step.step_order === 1) {
        const [[p]] = await conn.query('SELECT client_id FROM projects WHERE id = ?', [projectId]);
        await this.#moveLifecycle(conn, p?.client_id, 'L3', ['L2']);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'project_step.complete', entityType: 'project_step', entityId: stepId, req });
    return this.viewProject(projectId, actor);
  }

  static async approveStep(projectId, stepId, kind, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (!this.#canManage(project, actor)) throw httpError(403, 'Only the team leader or an admin can record approvals', 'FORBIDDEN');
    const step = await this.#loadStep(projectId, stepId);
    if (step.step_type !== 'approval') throw httpError(409, 'This step is not an approval step', 'NOT_APPROVAL');
    if (step.status !== 'in_progress') throw httpError(409, 'This approval step is not active yet', 'STEP_NOT_ACTIVE');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (kind === 'admin') {
        await conn.query('UPDATE project_steps SET admin_approved_by = ?, admin_approved_at = NOW() WHERE id = ?', [actor.id, stepId]);
      } else {
        await conn.query('UPDATE project_steps SET client_approved_by = ?, client_approved_at = NOW() WHERE id = ?', [actor.id, stepId]);
      }
      const [[fresh]] = await conn.query('SELECT * FROM project_steps WHERE id = ?', [stepId]);
      const adminOk = !fresh.needs_admin_approval || fresh.admin_approved_at;
      const clientOk = !fresh.needs_client_approval || fresh.client_approved_at;
      if (adminOk && clientOk) await this.#advanceFrom(conn, projectId, fresh, actor.id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: `project_step.${kind}_approve`, entityType: 'project_step', entityId: stepId, req });
    return this.viewProject(projectId, actor);
  }

  /** Approval rejected: send the work back to the previous work step. */
  static async requestChanges(projectId, stepId, note, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (!this.#canManage(project, actor)) throw httpError(403, 'Only the team leader or an admin can request changes', 'FORBIDDEN');
    const step = await this.#loadStep(projectId, stepId);
    if (step.step_type !== 'approval' || step.status !== 'in_progress') {
      throw httpError(409, 'Changes can only be requested on the active approval step', 'STEP_NOT_ACTIVE');
    }
    const [prev] = await pool.query(
      "SELECT id FROM project_steps WHERE project_id = ? AND step_order < ? AND step_type = 'work' ORDER BY step_order DESC LIMIT 1",
      [projectId, step.step_order]
    );
    if (prev.length === 0) throw httpError(409, 'There is no previous work step to send back to', 'NO_PREVIOUS_STEP');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE project_steps SET status = 'pending', started_at = NULL, admin_approved_by = NULL, admin_approved_at = NULL,
                client_approved_by = NULL, client_approved_at = NULL, notes = ? WHERE id = ?`,
        [note ? `Changes requested: ${note}` : 'Changes requested', stepId]
      );
      await conn.query(
        "UPDATE project_steps SET status = 'in_progress', completed_at = NULL, completed_by = NULL, notes = ? WHERE id = ?",
        [note ? `Rework requested: ${note}` : 'Rework requested', prev[0].id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'project_step.request_changes', entityType: 'project_step', entityId: stepId, details: { note }, req });
    return this.viewProject(projectId, actor);
  }

  static async updateBilling(projectId, { billingAmount, billingStatus }, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (!hasFullAccess(actor) && Number(project.account_manager_id) !== Number(actor.id)) {
      throw httpError(403, "Only admins or the client's account manager can update billing", 'FORBIDDEN');
    }
    if (project.project_category !== 'out_of_service') throw httpError(400, 'Billing applies to out-of-service projects only', 'NOT_OOS');
    await pool.query(
      'UPDATE projects SET billing_amount = COALESCE(?, billing_amount), billing_status = COALESCE(?, billing_status) WHERE id = ?',
      [billingAmount ?? null, billingStatus ?? null, projectId]
    );
    await AuditService.log({ actorId: actor.id, action: 'project.billing_update', entityType: 'project', entityId: projectId, details: { billingAmount, billingStatus }, req });
    return this.viewProject(projectId, actor);
  }

  static async setProjectStatus(projectId, status, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    if (!this.#canManage(project, actor)) throw httpError(403, 'Only the team leader or an admin can change project status', 'FORBIDDEN');
    await pool.query(
      `UPDATE projects SET status = ?, completed_at = IF(? = 'completed', COALESCE(completed_at, NOW()), NULL) WHERE id = ?`,
      [status, status, projectId]
    );
    await AuditService.log({ actorId: actor.id, action: 'project.status_change', entityType: 'project', entityId: projectId, details: { status }, req });
    return this.viewProject(projectId, actor);
  }

  // ───────────────────────────── Employees ─────────────────────────────

  /** Projects (excluding regular retainer templates) a user works on. */
  static #involvementSql(alias = 'p') {
    return `(${alias}.team_leader_id = ? OR ${alias}.project_manager_id = ?
             OR EXISTS (SELECT 1 FROM project_steps ps JOIN project_step_assignees psa ON psa.project_step_id = ps.id
                        WHERE ps.project_id = ${alias}.id AND psa.user_id = ?)
             OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = ${alias}.id AND t.is_archived = 0
                        AND (t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?))))
            AND ${alias}.is_archived = 0
            AND NOT (${alias}.project_category = 'regular' AND ${alias}.parent_project_id IS NULL AND ${alias}.month_plan_id IS NULL)
            AND NOT (${alias}.status = 'planning'
                     AND EXISTS (SELECT 1 FROM client_month_plans dmp WHERE dmp.id = ${alias}.month_plan_id AND dmp.status = 'draft'))`;
  }

  /** SQL predicate: user `u` works on a project that the viewer leads or manages. Needs 2 copies of the viewer id. */
  static #ledByViewerSql() {
    return `EXISTS (SELECT 1 FROM projects lp
              WHERE (lp.team_leader_id = ? OR lp.project_manager_id = ?) AND lp.is_archived = 0
                AND (EXISTS (SELECT 1 FROM project_members lpm WHERE lpm.project_id = lp.id AND lpm.user_id = u.id)
                     OR EXISTS (SELECT 1 FROM project_steps lps JOIN project_step_assignees lpa ON lpa.project_step_id = lps.id
                                WHERE lps.project_id = lp.id AND lpa.user_id = u.id)))`;
  }

  static async listEmployees(actor, { search = '' } = {}) {
    assertStaff(actor);
    const params = [];
    let where = `u.status = 'active' AND ${staffSql('u')}`;
    if (!canSeeAllEmployees(actor)) {
      // Team leaders see themselves plus the people on projects they lead.
      where += ` AND (u.id = ? OR ${this.#ledByViewerSql()})`;
      params.push(actor.id, actor.id, actor.id);
    }
    if (search.trim()) {
      where += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.department LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.designations,
              (SELECT COUNT(*) FROM tasks t WHERE t.is_archived = 0 AND t.status <> 'completed'
                 AND (t.assignee_id = u.id OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = u.id))) AS open_tasks,
              (SELECT COUNT(DISTINCT ps.project_id) FROM project_step_assignees psa
                 JOIN project_steps ps ON ps.id = psa.project_step_id
                 JOIN projects p ON p.id = ps.project_id
                 WHERE psa.user_id = u.id AND p.is_archived = 0 AND p.status IN ('planning','active','on_hold')
                   AND NOT (p.project_category = 'regular' AND p.parent_project_id IS NULL AND p.month_plan_id IS NULL)) AS active_projects,
              (SELECT COUNT(*) FROM project_step_assignees psa JOIN project_steps ps ON ps.id = psa.project_step_id
                 JOIN projects p ON p.id = ps.project_id
                 WHERE psa.user_id = u.id AND ps.status = 'in_progress' AND p.is_archived = 0) AS active_steps
       FROM users u
       WHERE ${where}
       ORDER BY u.name ASC`,
      params
    );
    return rows.map((r) => ({
      ...r,
      open_tasks: Number(r.open_tasks || 0),
      active_projects: Number(r.active_projects || 0),
      active_steps: Number(r.active_steps || 0)
    }));
  }

  /**
   * Returns null when the actor may see all of the employee's projects, or the actor's id when they may only see
   * projects they lead (team leader looking at a team member). Throws 403 otherwise.
   */
  static async #employeeViewScope(actor, userId) {
    assertStaff(actor);
    if (Number(actor.id) === Number(userId) || canSeeAllEmployees(actor)) return null;
    const [rows] = await pool.query(`SELECT 1 FROM users u WHERE u.id = ? AND ${this.#ledByViewerSql()}`, [userId, actor.id, actor.id]);
    if (rows.length === 0) throw httpError(403, 'You can only view your own task desk or your team members', 'FORBIDDEN');
    return Number(actor.id);
  }

  static async getEmployeeDesk(userId, actor) {
    const leaderScope = await this.#employeeViewScope(actor, userId);
    const [users] = await pool.query(
      `SELECT id, name, email, role, department, designations FROM users WHERE id = ? AND ${staffSql('users')}`,
      [userId]
    );
    if (users.length === 0) throw httpError(404, 'Employee not found', 'NOT_FOUND');
    const u = Number(userId);
    const projects = await this.#projectSummaries(
      `${this.#involvementSql('p')}${leaderScope ? ' AND (p.team_leader_id = ? OR p.project_manager_id = ?)' : ''}`,
      leaderScope ? [u, u, u, u, u, leaderScope, leaderScope] : [u, u, u, u, u]
    );
    if (projects.length === 0) return { employee: users[0], projects: [] };

    const ids = projects.map((p) => p.id);
    const [mySteps] = await pool.query(
      `SELECT ps.project_id, ps.id, ps.name, ps.status, ps.step_order FROM project_steps ps
       JOIN project_step_assignees psa ON psa.project_step_id = ps.id
       WHERE psa.user_id = ? AND ps.project_id IN (?) ORDER BY ps.step_order`,
      [u, ids]
    );
    const [myTasks] = await pool.query(
      `SELECT t.project_id, COUNT(*) AS total, SUM(t.status = 'completed') AS done
       FROM tasks t WHERE t.project_id IN (?) AND t.is_archived = 0
         AND (t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?))
       GROUP BY t.project_id`,
      [ids, u, u]
    );
    return {
      employee: users[0],
      projects: projects.map((p) => {
        const mt = myTasks.find((t) => t.project_id === p.id);
        return {
          ...p,
          role: Number(p.team_leader_id) === u ? (p.assignment_mode === 'individual' ? 'Owner' : 'Team Leader') : 'Member',
          my_steps: mySteps.filter((s) => s.project_id === p.id),
          my_task_total: Number(mt?.total || 0),
          my_task_done: Number(mt?.done || 0)
        };
      })
    };
  }

  static async getEmployeeProjectTasks(userId, projectId, actor) {
    const leaderScope = await this.#employeeViewScope(actor, userId);
    await this.assertCanView(projectId, actor);
    const loaded = await this.#loadProjectForAction(projectId);
    const canManage = this.#canManage(loaded, actor);
    if (leaderScope && !canManage) throw httpError(403, 'You can only open projects you lead for this employee', 'FORBIDDEN');
    const [users] = await pool.query(`SELECT id, name, email, department, designations FROM users WHERE id = ? AND ${staffSql('users')}`, [userId]);
    if (users.length === 0) throw httpError(404, 'Employee not found', 'NOT_FOUND');
    const project = await this.getProject(projectId);
    const u = Number(userId);
    const [tasks] = await pool.query(
      `SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority, t.start_date, t.due_date,
              t.project_step_id, t.target_qty, t.completed_at, t.created_at, t.assignee_id
       FROM tasks t
       WHERE t.project_id = ? AND t.is_archived = 0
         AND (t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?))
       ORDER BY t.project_step_id IS NULL, t.created_at ASC`,
      [projectId, u, u]
    );
    const mine = new Set(project.steps.filter((s) => s.assignees.some((a) => a.id === u)).map((s) => s.id));
    const time = await this.taskTimeStats(tasks.map((t) => t.id), u);
    const [[activeTimer]] = await pool.query(
      `SELECT at.id, at.task_id, t.title AS task_title, GREATEST(TIMESTAMPDIFF(SECOND, at.started_at, NOW()), 0) AS elapsed_seconds
       FROM active_timers at JOIN tasks t ON t.id = at.task_id WHERE at.user_id = ?`,
      [u]
    );
    return {
      employee: users[0],
      project: { ...project, steps: project.steps.map((s) => ({ ...s, is_mine: mine.has(s.id) })) },
      tasks: tasks.map((t) => ({ ...t, time: time[t.id] })),
      // The employee's running timer anywhere (it may be on a task in another project).
      active_timer: activeTimer ? { ...activeTimer, elapsed_seconds: Number(activeTimer.elapsed_seconds) } : null,
      can_manage: canManage,
      can_add_tasks: canManage || Number(actor.id) === Number(userId),
      // Timers belong to a person: only the employee themself can start/pause their own clock.
      can_track: Number(actor.id) === Number(userId)
    };
  }

  // ───────────────────────────── Task time tracking ─────────────────────────────

  /**
   * Time per task, computed on the DB clock: finished sessions (exact seconds for timer entries, minutes for manual
   * ones) plus any timer still running. `forUserId` additionally reports that person's own share.
   */
  static async taskTimeStats(taskIds, forUserId = null) {
    const out = {};
    if (!taskIds.length) return out;
    for (const id of taskIds) out[id] = { total_seconds: 0, my_seconds: 0, sessions: 0, running: null, first_started_at: null, last_ended_at: null };
    const entrySeconds = `CASE WHEN te.entry_type = 'timer' AND te.started_at IS NOT NULL AND te.ended_at IS NOT NULL
                                THEN GREATEST(TIMESTAMPDIFF(SECOND, te.started_at, te.ended_at), 0)
                                ELSE te.duration_minutes * 60 END`;
    const [entries] = await pool.query(
      `SELECT te.task_id, SUM(${entrySeconds}) AS secs, SUM(CASE WHEN te.user_id = ? THEN ${entrySeconds} ELSE 0 END) AS my_secs,
              COUNT(*) AS sessions, MIN(te.started_at) AS first_started_at, MAX(te.ended_at) AS last_ended_at
       FROM time_entries te WHERE te.task_id IN (?) AND te.deleted_at IS NULL GROUP BY te.task_id`,
      [forUserId || 0, taskIds]
    );
    for (const e of entries) {
      Object.assign(out[e.task_id], {
        total_seconds: Number(e.secs || 0),
        my_seconds: Number(e.my_secs || 0),
        sessions: Number(e.sessions || 0),
        first_started_at: e.first_started_at,
        last_ended_at: e.last_ended_at
      });
    }
    const [running] = await pool.query(
      `SELECT at.id, at.task_id, at.user_id, u.name AS user_name, at.started_at,
              GREATEST(TIMESTAMPDIFF(SECOND, at.started_at, NOW()), 0) AS elapsed_seconds
       FROM active_timers at JOIN users u ON u.id = at.user_id WHERE at.task_id IN (?)`,
      [taskIds]
    );
    for (const r of running) {
      const elapsed = Number(r.elapsed_seconds);
      const t = out[r.task_id];
      t.running = { timer_id: r.id, user_id: r.user_id, user_name: r.user_name, elapsed_seconds: elapsed, mine: Number(r.user_id) === Number(forUserId) };
      t.total_seconds += elapsed;
      if (t.running.mine) t.my_seconds += elapsed;
      if (!t.first_started_at) t.first_started_at = r.started_at;
    }
    return out;
  }

  /**
   * Start / pause / complete a task's clock for the signed-in assignee.
   * - start: pauses the person's timer on any other task first (one clock per person), moves todo → in_progress.
   * - pause: closes the running session into a time entry (feeds timesheets & reports).
   * - complete: closes the running session, then marks the task completed through the normal task workflow.
   */
  static async trackTask(taskId, action, actor, req) {
    assertStaff(actor);
    const [[task]] = await pool.query(
      `SELECT t.id, t.project_id, t.status, t.title, t.is_archived, t.assignee_id, t.is_client_deliverable,
              EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?) AS is_co_assignee
       FROM tasks t WHERE t.id = ?`,
      [actor.id, taskId]
    );
    if (!task) throw httpError(404, 'Task not found', 'NOT_FOUND');
    if (task.is_archived) throw httpError(400, 'This task is archived', 'TASK_ARCHIVED');
    if (action !== 'pause') await this.#assertTaskOpen(taskId);
    if (action === 'complete' && Number(task.is_client_deliverable)) {
      throw httpError(409, 'This is a client deliverable — submit it for review; it completes when the client approves', 'NEEDS_CLIENT_REVIEW');
    }
    if (Number(task.assignee_id) !== Number(actor.id) && !Number(task.is_co_assignee)) {
      throw httpError(403, 'Only the person assigned to this task can track time on it', 'FORBIDDEN');
    }
    await this.assertCanView(task.project_id, actor);

    const [[mine]] = await pool.query('SELECT id, task_id FROM active_timers WHERE user_id = ?', [actor.id]);
    const runningHere = mine && Number(mine.task_id) === Number(taskId);
    const setStatus = (status) => TasksService.changeTaskStatus(taskId, status, null, actor, req);
    let paused = null;

    if (action === 'start') {
      if (task.status === 'completed') throw httpError(409, 'This task is already completed', 'TASK_COMPLETED');
      if (runningHere) throw httpError(409, 'The timer is already running on this task', 'ALREADY_RUNNING');
      if (mine) {
        // One clock per person: switching tasks pauses the other one instead of failing.
        await TimeService.stopTimer(mine.id, actor.id, {}, actor, req);
        paused = Number(mine.task_id);
      }
      await TimeService.startTimer(actor.id, { taskId }, actor, req);
      if (task.status === 'todo' || task.status === 'blocked') await setStatus('in_progress');
    } else if (action === 'pause') {
      if (!runningHere) throw httpError(409, 'The timer is not running on this task', 'NOT_RUNNING');
      await TimeService.stopTimer(mine.id, actor.id, {}, actor, req);
    } else if (action === 'complete') {
      if (task.status === 'completed') throw httpError(409, 'This task is already completed', 'TASK_COMPLETED');
      if (runningHere) await TimeService.stopTimer(mine.id, actor.id, {}, actor, req);
      // Staff workflow requires todo → in_progress → completed.
      if (task.status === 'todo' || task.status === 'blocked') await setStatus('in_progress');
      await setStatus('completed');
    } else {
      throw httpError(400, 'Unknown tracker action', 'BAD_ACTION');
    }

    const stats = await this.taskTimeStats([Number(taskId)], actor.id);
    const [[fresh]] = await pool.query('SELECT status, completed_at FROM tasks WHERE id = ?', [taskId]);
    return { task_id: Number(taskId), status: fresh.status, completed_at: fresh.completed_at, time: stats[taskId], paused_task_id: paused };
  }

  /** Inserts tasks (each with its own assignee and optional step) with gap-safe codes. Caller owns the transaction. */
  static async #insertTaskRows(conn, projectId, items, actorId) {
    const [[proj]] = await conn.query('SELECT project_code, client_id FROM projects WHERE id = ? FOR UPDATE', [projectId]);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?', [projectId]);
    let seq = Number(n) + 1;
    const created = [];
    for (const item of items) {
      let code = `${proj.project_code}-T${seq}`;
      for (;;) {
        const [dupe] = await conn.query('SELECT id FROM tasks WHERE task_code = ?', [code]);
        if (dupe.length === 0) break;
        seq += 1;
        code = `${proj.project_code}-T${seq}`;
      }
      const [res] = await conn.query(
        `INSERT INTO tasks (task_code, title, description, project_id, project_step_id, client_id, source, creator_id,
                            status, column_status, assignee_id, priority, start_date, due_date, target_qty, is_client_deliverable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', 'todo', ?, ?, ?, ?, ?, ?)`,
        [
          code,
          item.title.trim(),
          item.description || null,
          projectId,
          item.stepId || null,
          proj.client_id,
          item.source === 'Workflow' ? 'Workflow' : 'Manual',
          actorId,
          item.assigneeId,
          item.priority || 'medium',
          item.startDate || null,
          item.dueDate || null,
          item.targetQty || null,
          item.clientDeliverable ? 1 : 0
        ]
      );
      await conn.query('INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by) VALUES (?, ?, ?)', [res.insertId, item.assigneeId, actorId]);
      await conn.query(
        "INSERT IGNORE INTO project_members (project_id, user_id, project_role, added_by) VALUES (?, ?, 'member', ?)",
        [projectId, item.assigneeId, actorId]
      );
      created.push(res.insertId);
      seq += 1;
    }
    return created;
  }

  /**
   * Break a stage into tasks, each with its own person and due date (both required — Master Plan §5.4).
   * People on the stage add tasks to it while it is open; managers may also plan tasks for a stage that
   * hasn't started yet (they stay locked until it opens). Managers assign anyone; others only themselves.
   */
  static async addStepTasks(projectId, stepId, items, actor, req) {
    await this.assertCanView(projectId, actor);
    const project = await this.#loadProjectForAction(projectId);
    const step = await this.#loadStep(projectId, stepId);
    if (step.status === 'completed') throw httpError(409, 'This step is complete — reopen work on it before adding tasks', 'STEP_DONE');
    const [stepPeople] = await pool.query('SELECT user_id FROM project_step_assignees WHERE project_step_id = ?', [stepId]);
    const onStep = stepPeople.some((p) => Number(p.user_id) === Number(actor.id));
    const manage = this.#canManage(project, actor);
    if (!manage && !onStep) throw httpError(403, 'Only people on this step, the team leader or an admin can add tasks to it', 'FORBIDDEN');
    if (!manage && step.status !== 'in_progress') {
      throw httpError(409, `"${step.name}" hasn't started yet — tasks can be added once it opens`, 'STEP_NOT_STARTED');
    }
    const fallback = Number(stepPeople[0]?.user_id || project.team_leader_id || actor.id);
    const rows = items.map((it) => ({ ...it, stepId, assigneeId: Number(it.assigneeId || (manage ? fallback : actor.id)) }));
    if (!manage && rows.some((r) => r.assigneeId !== Number(actor.id))) {
      throw httpError(403, 'You can add tasks for yourself; ask the team leader to assign tasks to others', 'FORBIDDEN');
    }
    await assertActiveUsers(pool, rows.map((r) => r.assigneeId));
    const conn = await pool.getConnection();
    let created;
    try {
      await conn.beginTransaction();
      created = await this.#insertTaskRows(conn, projectId, rows, actor.id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'task.step_bulk_create', entityType: 'project_step', entityId: stepId, details: { taskIds: created }, req });
    return this.viewProject(projectId, actor);
  }

  /** Tick a task done (or reopen it) from the project page. The assignee or whoever manages the project. */
  static async setTaskDone(projectId, taskId, done, actor, req) {
    await this.assertCanView(projectId, actor);
    const project = await this.#loadProjectForAction(projectId);
    const [[task]] = await pool.query(
      `SELECT t.id, t.status, t.assignee_id, t.is_archived, t.is_client_deliverable,
              EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?) AS co
       FROM tasks t WHERE t.id = ? AND t.project_id = ?`,
      [actor.id, taskId, projectId]
    );
    if (!task || task.is_archived) throw httpError(404, 'Task not found in this project', 'NOT_FOUND');
    if (!this.#canManage(project, actor) && Number(task.assignee_id) !== Number(actor.id) && !Number(task.co)) {
      throw httpError(403, 'Only the assignee or the team leader can update this task', 'FORBIDDEN');
    }
    await this.#assertTaskOpen(taskId);
    // Client deliverables complete only through review: submit → team approves → client approves (Master Plan §6 L4).
    if (Number(task.is_client_deliverable) && done && task.status !== 'completed') {
      throw httpError(409, 'This is a client deliverable — submit it for review; it completes when the client approves', 'NEEDS_CLIENT_REVIEW');
    }
    const setStatus = (s) => TasksService.changeTaskStatus(taskId, s, null, actor, req);
    if (done && task.status !== 'completed') {
      // Staff workflow requires todo → in_progress → completed.
      if (task.status !== 'in_progress') await setStatus('in_progress');
      await setStatus('completed');
    } else if (!done && task.status === 'completed') {
      await setStatus('in_progress');
    }
    return this.viewProject(projectId, actor);
  }

  static async createEmployeeTasks(userId, projectId, items, actor, req) {
    await this.assertCanView(projectId, actor);
    const project = await this.#loadProjectForAction(projectId);
    const self = Number(actor.id) === Number(userId);
    // Anyone on the project can split their own work; only the leader/manager can create tasks for others.
    if (!self && !this.#canManage(project, actor)) {
      throw httpError(403, 'Only the team leader, project manager or an admin can create tasks for other people', 'FORBIDDEN');
    }
    await assertActiveUsers(pool, [userId]);
    const [[proj]] = await pool.query('SELECT project_code, client_id FROM projects WHERE id = ?', [projectId]);

    const conn = await pool.getConnection();
    const created = [];
    try {
      await conn.beginTransaction();
      // Lock project row so concurrent inserts don't collide on task codes.
      await conn.query('SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId]);
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?', [projectId]);
      let seq = Number(n) + 1;
      for (const item of items) {
        if (item.stepId) {
          const [ok] = await conn.query('SELECT id FROM project_steps WHERE id = ? AND project_id = ?', [item.stepId, projectId]);
          if (ok.length === 0) throw httpError(400, 'Selected step does not belong to this project', 'INVALID_STEP');
        }
        let code = `${proj.project_code}-T${seq}`;
        // Guard against gaps from deleted tasks.
        for (;;) {
          const [dupe] = await conn.query('SELECT id FROM tasks WHERE task_code = ?', [code]);
          if (dupe.length === 0) break;
          seq += 1;
          code = `${proj.project_code}-T${seq}`;
        }
        const [res] = await conn.query(
          `INSERT INTO tasks (task_code, title, description, project_id, project_step_id, client_id, source, creator_id,
                              status, column_status, assignee_id, priority, start_date, due_date, target_qty)
           VALUES (?, ?, ?, ?, ?, ?, 'Manual', ?, 'todo', 'todo', ?, ?, ?, ?, ?)`,
          [
            code,
            item.title.trim(),
            item.description || null,
            projectId,
            item.stepId || null,
            proj.client_id,
            actor.id,
            userId,
            item.priority || 'medium',
            item.startDate || null,
            item.dueDate || null,
            item.targetQty || null
          ]
        );
        await conn.query('INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by) VALUES (?, ?, ?)', [res.insertId, userId, actor.id]);
        created.push(res.insertId);
        seq += 1;
      }
      await conn.query(
        "INSERT IGNORE INTO project_members (project_id, user_id, project_role, added_by) VALUES (?, ?, 'member', ?)",
        [projectId, userId, actor.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({ actorId: actor.id, action: 'task.bulk_create', entityType: 'project', entityId: projectId, details: { userId, taskIds: created }, req });
    return this.getEmployeeProjectTasks(userId, projectId, actor);
  }
}
