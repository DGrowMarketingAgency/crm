import crypto from 'crypto';
import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { TimeService } from '../time/time.service.js';
import { TasksService } from '../tasks/tasks.service.js';

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

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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
    "SELECT id FROM users WHERE id IN (?) AND status = 'active' AND role <> 'client'",
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
      `SELECT pp.id, pp.name, pp.description, pp.service_id, pp.status, pp.created_at, pp.updated_at,
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
    return rows.map((r) => ({ ...r, steps: steps.filter((s) => s.pipeline_id === r.id) }));
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
    return { ...rows[0], steps };
  }

  static async #writePipelineSteps(conn, pipelineId, steps) {
    await conn.query('DELETE FROM project_pipeline_steps WHERE pipeline_id = ?', [pipelineId]);
    let order = 1;
    for (const step of steps) {
      const isApproval = step.stepType === 'approval';
      await conn.query(
        `INSERT INTO project_pipeline_steps
          (pipeline_id, step_order, name, description, step_type, needs_admin_approval, needs_client_approval, est_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pipelineId,
          order,
          step.name.trim(),
          step.description || null,
          isApproval ? 'approval' : 'work',
          isApproval ? Boolean(step.needsAdminApproval ?? true) : false,
          isApproval ? Boolean(step.needsClientApproval ?? true) : false,
          step.estDays || null
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
              p.pipeline_id, p.service_id, p.team_leader_id, p.parent_project_id, p.cycle_month,
              p.monthly_deliverables, p.billing_amount, p.billing_status,
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
    const topLevel = projects.filter((p) => !p.parent_project_id);
    const cycles = projects.filter((p) => p.parent_project_id);
    const withCycles = topLevel.map((p) => ({
      ...p,
      cycles: cycles
        .filter((c) => c.parent_project_id === p.id)
        .sort((a, b) => (a.cycle_month < b.cycle_month ? 1 : -1))
    }));
    return { client: clients[0], projects: withCycles, can_create: full || isAm };
  }

  // ───────────────────────────── Projects ─────────────────────────────

  static async createProject(data, actor, req) {
    const category = data.category;
    const mode = data.assignmentMode;
    const leaderId = mode === 'individual' ? data.assigneeId : data.teamLeaderId;
    if (!leaderId) {
      throw httpError(400, mode === 'individual' ? 'Select the person who will own this project' : 'Select a team leader', 'ASSIGNEE_REQUIRED');
    }

    assertStaff(actor);
    const [clients] = await pool.query('SELECT id, status, account_manager_id FROM clients WHERE id = ?', [data.clientId]);
    if (clients.length === 0) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    if (!hasFullAccess(actor) && Number(clients[0].account_manager_id) !== Number(actor.id)) {
      throw httpError(403, "Only admins, project managers or this client's account manager can create projects for it", 'FORBIDDEN');
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

    const conn = await pool.getConnection();
    let projectId;
    try {
      await conn.beginTransaction();
      const code = await generateProjectCode(conn, category);
      const [res] = await conn.query(
        `INSERT INTO projects
          (name, project_code, description, project_type, project_category, assignment_mode, pipeline_id, service_id,
           team_leader_id, monthly_deliverables, billing_amount, billing_status,
           client_id, project_manager_id, created_by, status, priority, visibility, start_date, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'internal', ?, ?)`,
        [
          data.name.trim(),
          code,
          data.description || null,
          CATEGORY_TO_LEGACY_TYPE[category],
          category,
          mode,
          data.pipelineId || null,
          data.serviceId || null,
          leaderId,
          category === 'regular' ? JSON.stringify(deliverables) : null,
          category === 'out_of_service' ? data.billingAmount ?? null : null,
          category === 'out_of_service' ? 'unbilled' : null,
          data.clientId,
          leaderId,
          actor.id,
          category === 'urgent' ? 'urgent' : data.priority || 'medium',
          data.startDate || null,
          data.dueDate || null
        ]
      );
      projectId = res.insertId;

      await this.#insertSteps(conn, projectId, templateSteps, stepAssignees, { start: category !== 'regular' });
      await this.#syncMembers(conn, projectId, leaderId, stepAssignees.flat(), actor.id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await AuditService.log({ actorId: actor.id, action: 'project.create_flow', entityType: 'project', entityId: projectId, details: { category, mode }, req });

    // Regular retainers are a template: the actual monthly work lives in generated cycles.
    if (category === 'regular') {
      await this.generateCycle(projectId, currentCycleMonth(), actor);
    }
    return this.viewProject(projectId, actor);
  }

  static async #insertSteps(conn, projectId, templateSteps, stepAssignees, { start }) {
    let idx = 0;
    for (const step of templateSteps) {
      const isFirst = idx === 0;
      const [res] = await conn.query(
        `INSERT INTO project_steps
          (project_id, pipeline_step_id, step_order, name, description, step_type, needs_admin_approval, needs_client_approval, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          step.pipeline_step_id ?? step.id ?? null,
          step.step_order,
          step.name,
          step.description || null,
          step.step_type,
          step.needs_admin_approval ? 1 : 0,
          step.needs_client_approval ? 1 : 0,
          start && isFirst ? 'in_progress' : 'pending',
          start && isFirst ? new Date() : null
        ]
      );
      for (const uid of stepAssignees[idx] || []) {
        await conn.query('INSERT IGNORE INTO project_step_assignees (project_step_id, user_id) VALUES (?, ?)', [res.insertId, uid]);
      }
      idx += 1;
    }
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
    if (parent.project_category !== 'regular' || parent.parent_project_id) {
      throw httpError(400, 'Monthly cycles can only be generated for regular projects', 'NOT_REGULAR');
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
      const code = `${parent.project_code}-${cycleMonth.replace('-', '')}`;
      const [res] = await conn.query(
        `INSERT INTO projects
          (name, project_code, description, project_type, project_category, assignment_mode, pipeline_id, service_id,
           team_leader_id, parent_project_id, cycle_month, monthly_deliverables,
           client_id, project_manager_id, created_by, status, priority, visibility, start_date, due_date)
         VALUES (?, ?, ?, 'Regular', 'regular', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'internal', ?, ?)`,
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
      await this.#insertSteps(conn, cycleId, templateSteps, stepAssignees, { start: true });
      await this.#syncMembers(conn, cycleId, parent.team_leader_id, stepAssignees.flat(), actor?.id || null);

      // Monthly deliverables (e.g. 12 posts, 4 videos) become quota tasks for the owner/leader to split further.
      let n = 1;
      for (const d of deliverables) {
        const [tRes] = await conn.query(
          `INSERT INTO tasks (task_code, title, description, project_id, client_id, source, creator_id, status, column_status,
                              assignee_id, priority, start_date, due_date, target_qty)
           VALUES (?, ?, ?, ?, ?, 'Manual', ?, 'todo', 'todo', ?, ?, ?, ?, ?)`,
          [
            `${code}-T${n}`,
            `${d.label} × ${d.qty} — ${cycleLabel(cycleMonth)}`,
            `Monthly quota for ${cycleLabel(cycleMonth)}: ${d.qty} ${d.label}. Split into individual tasks from the employee task desk.`,
            cycleId,
            parent.client_id,
            actor?.id || parent.created_by,
            parent.team_leader_id,
            parent.priority,
            startDate,
            endDate,
            d.qty
          ]
        );
        await conn.query('INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by) VALUES (?, ?, ?)', [
          tRes.insertId,
          parent.team_leader_id,
          actor?.id || null
        ]);
        n += 1;
      }
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
    return { id: cycleId, created: true };
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
       WHERE p.project_category = 'regular' AND p.parent_project_id IS NULL AND p.is_archived = 0 AND p.status = 'active'
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
      `SELECT ps.*, aa.name AS admin_approved_by_name, ca.name AS client_approved_by_name, cb.name AS completed_by_name
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
      `SELECT t.id, t.task_code, t.title, t.status, t.priority, t.due_date, t.project_step_id, t.target_qty,
              t.assignee_id, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? AND t.is_archived = 0 ORDER BY t.created_at ASC`,
      [projectId]
    );
    let cycles = [];
    if (summary.project_category === 'regular' && !summary.parent_project_id) {
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
      // A step can be completed by the people assigned to it or by whoever manages the project.
      steps: project.steps.map((s) => ({ ...s, can_complete: canManage || s.assignees.some((a) => Number(a.id) === Number(actor.id)) })),
      can_manage: canManage,
      can_bill: hasFullAccess(actor) || Number(loaded.account_manager_id) === Number(actor.id)
    };
  }

  static async #loadProjectForAction(projectId) {
    const [rows] = await pool.query(
      `SELECT p.id, p.project_manager_id, p.team_leader_id, p.project_category, p.parent_project_id, p.status,
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
    const [next] = await conn.query(
      "SELECT id FROM project_steps WHERE project_id = ? AND step_order > ? AND status <> 'completed' ORDER BY step_order LIMIT 1",
      [projectId, step.step_order]
    );
    if (next.length > 0) {
      await conn.query("UPDATE project_steps SET status = 'in_progress', started_at = NOW() WHERE id = ?", [next[0].id]);
    } else {
      await conn.query("UPDATE projects SET status = 'completed', completed_at = NOW() WHERE id = ?", [projectId]);
    }
  }

  static async completeStep(projectId, stepId, actor, req) {
    const project = await this.#loadProjectForAction(projectId);
    const step = await this.#loadStep(projectId, stepId);
    if (step.status !== 'in_progress') throw httpError(409, 'Only the current in-progress step can be completed', 'STEP_NOT_ACTIVE');
    if (step.step_type === 'approval') throw httpError(409, 'Approval steps complete automatically once approved', 'USE_APPROVAL');

    const [assigned] = await pool.query('SELECT 1 FROM project_step_assignees WHERE project_step_id = ? AND user_id = ?', [stepId, actor.id]);
    if (!this.#canManage(project, actor) && assigned.length === 0) {
      throw httpError(403, 'Only people assigned to this step, the team leader or an admin can complete it', 'FORBIDDEN');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.#advanceFrom(conn, projectId, step, actor.id);
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
            AND NOT (${alias}.project_category = 'regular' AND ${alias}.parent_project_id IS NULL)`;
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
    let where = "u.status = 'active' AND u.role <> 'client'";
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
                   AND NOT (p.project_category = 'regular' AND p.parent_project_id IS NULL)) AS active_projects,
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
      "SELECT id, name, email, role, department, designations FROM users WHERE id = ? AND role <> 'client'",
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
    const [users] = await pool.query("SELECT id, name, email, department, designations FROM users WHERE id = ? AND role <> 'client'", [userId]);
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
      `SELECT t.id, t.project_id, t.status, t.title, t.is_archived, t.assignee_id,
              EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?) AS is_co_assignee
       FROM tasks t WHERE t.id = ?`,
      [actor.id, taskId]
    );
    if (!task) throw httpError(404, 'Task not found', 'NOT_FOUND');
    if (task.is_archived) throw httpError(400, 'This task is archived', 'TASK_ARCHIVED');
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
