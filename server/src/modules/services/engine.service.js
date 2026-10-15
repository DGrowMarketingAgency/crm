import { pool } from '../../config/db.js';
import { SERVICES_CATALOG, ROLE_DEPARTMENT_MAP, ROLE_SLUG_MAP } from './workflows.data.js';
import { AuditService } from '../audit/audit.service.js';

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

    const connection = await pool.getConnection();
    const createdServices = [];
    const generatedTasks = [];

    try {
      await connection.beginTransaction();

      for (const serviceType of serviceTypes) {
        const template = SERVICES_CATALOG[serviceType];
        if (!template) {
          const err = new Error(`Unsupported service type: ${serviceType}`);
          err.status = 400;
          err.code = 'UNKNOWN_SERVICE_TYPE';
          throw err;
        }

        // Check if already active
        const [existing] = await connection.query(
          `SELECT id FROM service_instances 
           WHERE client_id = ? AND service_type = ? AND status = 'active'`,
          [clientId, serviceType]
        );
        if (existing.length > 0) {
          continue; // skip duplicate active service
        }

        const firstStage = template.stages[0];
        const defaultAssigneeId = await this.resolveAssignee(
          template.ownerRole,
          clientId,
          actorUser.id
        );

        // 1. Insert ServiceInstance
        const [siRes] = await connection.query(
          `INSERT INTO service_instances (
            client_id, service_type, label, current_stage, owner_user_id,
            cycle, status, stage_index, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?)`,
          [
            clientId,
            serviceType,
            template.label,
            firstStage.name,
            defaultAssigneeId,
            template.cycle,
            actorUser.id
          ]
        );
        const serviceInstanceId = siRes.insertId;

        // 2. Generate stage 0 tasks
        const dueDate = this.addBusinessDays(new Date(), firstStage.days || 5);
        let taskIndex = 1;

        for (const t of firstStage.tasks) {
          const taskTitle = typeof t === 'string' ? t : t.title;
          const isCr = typeof t === 'object' && Boolean(t.cr);
          const taskRole = (typeof t === 'object' && t.role) ? t.role : template.ownerRole;

          const taskAssigneeId = await this.resolveAssignee(
            taskRole,
            clientId,
            defaultAssigneeId
          );

          const taskCode = `DG-${clientId}-${serviceType.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}${taskIndex++}`;

          const [taskRes] = await connection.query(
            `INSERT INTO tasks (
              task_code, title, description, client_id, service_instance_id,
              source, column_status, status, priority, due_date,
              is_client_deliverable, assignee_id, creator_id
            ) VALUES (?, ?, ?, ?, ?, 'Workflow', 'todo', 'todo', 'medium', ?, ?, ?, ?)`,
            [
              taskCode,
              taskTitle,
              `Auto-generated workflow task for ${template.label} [Stage: ${firstStage.name}]`,
              clientId,
              serviceInstanceId,
              dueDate,
              isCr ? 1 : 0,
              taskAssigneeId,
              actorUser.id
            ]
          );

          const taskId = taskRes.insertId;

          // Also insert assignee into task_assignees pivot
          if (taskAssigneeId) {
            await connection.query(
              `INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by)
               VALUES (?, ?, ?)`,
              [taskId, taskAssigneeId, actorUser.id]
            );
          }

          generatedTasks.push({
            id: taskId,
            task_code: taskCode,
            title: taskTitle,
            service_instance_id: serviceInstanceId,
            column_status: 'todo',
            is_client_deliverable: isCr,
            assignee_id: taskAssigneeId,
            due_date: dueDate
          });
        }

        createdServices.push({
          id: serviceInstanceId,
          service_code: serviceType,
          service_type: serviceType,
          label: template.label,
          current_stage: firstStage.name,
          tasks_count: firstStage.tasks.length
        });
      }

      // 3. Advance lifecycle stage if currently L0 or L1 -> advance to L2 (Strategy & Planning)
      if (['L0', 'L1'].includes(client.lifecycle_stage) && createdServices.length > 0) {
        await connection.query(
          `UPDATE clients SET lifecycle_stage = 'L2' WHERE id = ?`,
          [clientId]
        );
      }

      await connection.commit();

      // Audit log
      await AuditService.log({
        actorUserId: actorUser.id,
        action: 'services.bundled',
        targetType: 'client',
        targetId: clientId,
        details: {
          servicesCount: createdServices.length,
          tasksCount: generatedTasks.length,
          serviceTypes
        },
        req
      });

      return {
        client_id: clientId,
        bundled_services: createdServices,
        generated_tasks: generatedTasks
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
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

    const [services] = await pool.query(
      `SELECT si.*, u.name as owner_name, u.email as owner_email,
              COUNT(DISTINCT t.id) as total_tasks,
              SUM(CASE WHEN t.column_status = 'done' OR t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
       FROM service_instances si
       LEFT JOIN users u ON si.owner_user_id = u.id
       LEFT JOIN tasks t ON t.service_instance_id = si.id
       WHERE si.client_id = ?
       GROUP BY si.id
       ORDER BY si.created_at DESC`,
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

