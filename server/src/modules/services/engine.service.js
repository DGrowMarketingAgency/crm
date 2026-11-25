import { pool } from '../../config/db.js';
import { SERVICES_CATALOG, ROLE_DEPARTMENT_MAP, ROLE_SLUG_MAP } from './workflows.data.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectFlowService } from '../project-flow/projectFlow.service.js';

export class AutoTriggerEngine {
  /**
   * Helper to add business days (excluding Saturday & Sunday)
   */
  static addBusinessDays(startDate, days) {
    const date = new Date(startDate);
    let added = 0;
    while (added < days) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }
    return date.toISOString().split('T')[0];
  }

  /**
   * Helper to pick an active assignee for a target role or department
   */
  static async resolveAssignee(targetRoleOrDept, clientId, fallbackUserId) {
    // 1. Try finding by department
    const dept = ROLE_DEPARTMENT_MAP[targetRoleOrDept] || targetRoleOrDept;
    const [deptUsers] = await pool.query(
      `SELECT id FROM users 
       WHERE department = ? AND status = 'active'
       ORDER BY last_login_at DESC LIMIT 1`,
      [dept]
    );
    if (deptUsers.length > 0) return deptUsers[0].id;

    // 2. Try finding by role slug
    const roleSlug = ROLE_SLUG_MAP[targetRoleOrDept] || targetRoleOrDept.toLowerCase();
    const [roleUsers] = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.slug = ? AND u.status = 'active'
       ORDER BY u.last_login_at DESC LIMIT 1`,
      [roleSlug]
    );
    if (roleUsers.length > 0) return roleUsers[0].id;

    // 3. Try finding client's account manager
    if (clientId) {
      const [clientRows] = await pool.query(
        'SELECT account_manager_id FROM clients WHERE id = ?',
        [clientId]
      );
      if (clientRows.length > 0 && clientRows[0].account_manager_id) {
        return clientRows[0].account_manager_id;
      }
    }

    // 4. Default to actor
    return fallbackUserId;
  }

  /**
   * Bundles one or more services onto a client and triggers first-stage tasks
   */
  static async bundleServices(clientId, serviceTypes, actorUser, req = null) {
    if (!Array.isArray(serviceTypes) || serviceTypes.length === 0) {
      const err = new Error('At least one service type must be specified');
      err.status = 400;
      err.code = 'INVALID_SERVICES';
      throw err;
    }

    // Verify client exists
    const [clientRows] = await pool.query(
      'SELECT id, name, lifecycle_stage, account_manager_id FROM clients WHERE id = ?',
      [clientId]
    );
    if (clientRows.length === 0) {
      const err = new Error('Client not found');
      err.status = 404;
      err.code = 'CLIENT_NOT_FOUND';
      throw err;
    }
    const client = clientRows[0];

    // Authorization check: AM can only bundle onto assigned clients unless Owner/Admin
    const isOwnerOrAdmin = actorUser.is_owner || 
      actorUser.roles?.some((r) => ['owner', 'admin'].includes(r.slug));
    if (!isOwnerOrAdmin && client.account_manager_id && Number(client.account_manager_id) !== Number(actorUser.id)) {
      const err = new Error('You can only bundle services onto your assigned clients');
      err.status = 403;
      err.code = 'CLIENT_ACCESS_DENIED';
      throw err;
    }

    // One engine: each bundled service becomes a project in the client's month plan for this month, on that
    // service's pipeline, and its step tasks spawn immediately (no separate service_instances any more).
    const items = [];
    const labels = {};
    for (const serviceType of serviceTypes) {
      const [[svc]] = await pool.query(
        'SELECT id, service_code, name, default_owner_role FROM services WHERE service_code = ? OR id = ?',
        [String(serviceType), Number(serviceType) || 0]
      );
      const template = SERVICES_CATALOG[svc?.service_code || serviceType];
      if (!svc) {
        const err = new Error(`Unsupported service type: ${serviceType}`);
        err.status = 400;
        err.code = 'UNKNOWN_SERVICE_TYPE';
        throw err;
      }
      const assigneeId = await this.resolveAssignee(template?.ownerRole || svc.default_owner_role || 'AccountManager', clientId, actorUser.id);
      items.push({ serviceId: svc.id, assigneeId });
      labels[svc.id] = { code: svc.service_code, label: svc.name };
    }

    const result = await ProjectFlowService.addServicesToMonth(clientId, items, actorUser, req);

    // Bundling moves a new client from onboarding into Strategy & Planning.
    if (['L0', 'L1'].includes(client.lifecycle_stage) && result.project_ids.length > 0) {
      await pool.query(`UPDATE clients SET lifecycle_stage = 'L2' WHERE id = ?`, [clientId]);
    }

    const [projects] = result.project_ids.length
      ? await pool.query(
          `SELECT p.id, p.name, p.service_id, p.month_plan_id,
                  (SELECT ps.name FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in_progress' ORDER BY ps.step_order LIMIT 1) AS current_stage
           FROM projects p WHERE p.id IN (?)`,
          [result.project_ids]
        )
      : [[]];
    const [tasks] = result.project_ids.length
      ? await pool.query(
          `SELECT id, task_code, title, project_id, project_step_id, column_status, is_client_deliverable, assignee_id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
           FROM tasks WHERE project_id IN (?) ORDER BY id`,
          [result.project_ids]
        )
      : [[]];

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'services.bundled',
      targetType: 'client',
      targetId: clientId,
      details: { serviceTypes, projectIds: result.project_ids, skipped: result.skipped_service_ids, monthPlanId: result.plan_id },
      req
    });

    return {
      client_id: clientId,
      month_plan_id: result.plan_id,
      plan_month: result.plan_month,
      bundled_services: projects.map((p) => ({
        id: p.id,
        project_id: p.id,
        service_code: labels[p.service_id]?.code,
        service_type: labels[p.service_id]?.code,
        label: labels[p.service_id]?.label || p.name,
        current_stage: p.current_stage,
        tasks_count: tasks.filter((t) => t.project_id === p.id).length
      })),
      skipped_service_ids: result.skipped_service_ids,
      generated_tasks: tasks
    };
  }

  /**
   * Retrieves all service instances bundled on a client
   */
  static async listClientServices(clientId, actorUser) {
    // Check client access
    const [clientRows] = await pool.query(
      'SELECT id, name, account_manager_id, lifecycle_stage FROM clients WHERE id = ?',
      [clientId]
    );
    if (clientRows.length === 0) {
      const err = new Error('Client not found');
      err.status = 404;
      err.code = 'CLIENT_NOT_FOUND';
      throw err;
    }
    const client = clientRows[0];

    const isOwnerOrAdmin = actorUser.is_owner || 
      actorUser.roles?.some((r) => ['owner', 'admin'].includes(r.slug));
    if (!isOwnerOrAdmin && client.account_manager_id && Number(client.account_manager_id) !== Number(actorUser.id)) {
      // Check if actor is a client user linked to this client
      if (actorUser.client_id && Number(actorUser.client_id) !== Number(clientId)) {
        const err = new Error('Access denied to client services');
        err.status = 403;
        err.code = 'CLIENT_ACCESS_DENIED';
        throw err;
      }
    }

    // Services = the projects in the client's month plans (newest month first), one row per service project.
    const [services] = await pool.query(
      `SELECT p.id, p.id AS project_id, p.month_plan_id, mp.plan_month, s.service_code AS service_type, s.service_code,
              COALESCE(s.name, p.name) AS label, p.name AS project_name, p.status,
              (SELECT ps.name FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in_progress' ORDER BY ps.step_order LIMIT 1) AS current_stage,
              p.team_leader_id AS owner_user_id, u.name AS owner_name, u.email AS owner_email,
              COUNT(DISTINCT t.id) AS total_tasks,
              SUM(CASE WHEN t.column_status = 'done' OR t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
       FROM projects p
       JOIN client_month_plans mp ON mp.id = p.month_plan_id
       LEFT JOIN services s ON s.id = p.service_id
       LEFT JOIN users u ON u.id = p.team_leader_id
       LEFT JOIN tasks t ON t.project_id = p.id AND t.is_archived = 0
       WHERE p.client_id = ? AND p.is_archived = 0 AND p.status <> 'cancelled'
       GROUP BY p.id
       ORDER BY mp.plan_month DESC, p.id`,
      [clientId]
    );

    return {
      client,
      services: services.map((s) => ({
        ...s,
        total_tasks: Number(s.total_tasks || 0),
        completed_tasks: Number(s.completed_tasks || 0)
      }))
    };
  }

  /**
   * Retrieves full catalog of available services
   */
  static getAvailableCatalog() {
    return Object.entries(SERVICES_CATALOG).map(([key, def]) => ({
      key,
      code: key,
      label: def.label,
      title: def.label,
      group: def.group,
      ownerRole: def.ownerRole,
      cycle: def.cycle,
      stagesCount: def.stages.length,
      stages: def.stages.map((s) => ({
        name: s.name,
        days: s.days,
        tasksCount: s.tasks.length,
        tasks: s.tasks
      }))
    }));
  }
}

