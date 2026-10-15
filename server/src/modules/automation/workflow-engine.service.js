import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';

export class WorkflowEngineService {
  /**
   * Detect circular dependencies in task templates graph
   * Throws Error if circular dependency is detected.
   */
  static detectCircularDependencies(taskTemplates, templateDependencies) {
    const taskIds = taskTemplates.map((t) => Number(t.id));
    if (taskIds.length === 0 || !templateDependencies || templateDependencies.length === 0) {
      return { hasCycle: false, cycle: [] };
    }

    const adj = new Map();
    taskIds.forEach((id) => adj.set(id, []));

    for (const d of templateDependencies) {
      const source = Number(d.depends_on_task_template_id);
      const target = Number(d.task_template_id);
      if (adj.has(source)) {
        adj.get(source).push(target);
      }
    }

    const visited = new Set();
    const recStack = new Set();
    let cyclePath = [];

    function dfs(node, path) {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recStack.has(neighbor)) {
          path.push(neighbor);
          cyclePath = [...path];
          return true;
        }
      }

      recStack.delete(node);
      path.pop();
      return false;
    }

    for (const id of taskIds) {
      if (!visited.has(id)) {
        const path = [];
        if (dfs(id, path)) {
          const err = new Error(
            `Circular dependency detected between task templates: ${cyclePath.join(' -> ')}`
          );
          err.status = 400;
          err.code = 'CIRCULAR_DEPENDENCY_DETECTED';
          err.cycle = cyclePath;
          throw err;
        }
      }
    }

    return { hasCycle: false, cycle: [] };
  }

  /**
   * Resolves appropriate assignee user ID based on role, department, project, and client
   */
  static async resolveAssignee({
    role,
    departmentId,
    clientId,
    projectId,
    defaultAssigneeId = null
  }) {
    if (defaultAssigneeId) {
      const [u] = await pool.query('SELECT id, status FROM users WHERE id = ?', [defaultAssigneeId]);
      if (u.length > 0 && u[0].status === 'active') {
        return u[0].id;
      }
    }

    const normalizedRole = (role || '').trim().toLowerCase();

    // 1. Role is Project Manager
    if (normalizedRole.includes('project_manager') || normalizedRole === 'pm') {
      if (projectId) {
        const [pRows] = await pool.query('SELECT project_manager_id FROM projects WHERE id = ?', [projectId]);
        if (pRows.length > 0 && pRows[0].project_manager_id) {
          return pRows[0].project_manager_id;
        }
      }
    }

    // 2. Role is Account Manager
    if (normalizedRole.includes('account_manager') || normalizedRole === 'am') {
      if (clientId) {
        const [cRows] = await pool.query('SELECT account_manager_id FROM clients WHERE id = ?', [clientId]);
        if (cRows.length > 0 && cRows[0].account_manager_id) {
          return cRows[0].account_manager_id;
        }
      }
    }

    // 3. Department primary member or manager
    if (departmentId) {
      const [memberRows] = await pool.query(
        `SELECT dm.user_id 
         FROM department_members dm 
         JOIN users u ON dm.user_id = u.id 
         WHERE dm.department_id = ? AND u.status = 'active'
         ORDER BY dm.is_primary DESC, dm.joined_at ASC 
         LIMIT 1`,
        [departmentId]
      );
      if (memberRows.length > 0) {
        return memberRows[0].user_id;
      }

      // Check department manager
      const [deptRows] = await pool.query('SELECT manager_id FROM departments WHERE id = ?', [departmentId]);
      if (deptRows.length > 0 && deptRows[0].manager_id) {
        return deptRows[0].manager_id;
      }
    }

    return null;
  }

  /**
   * Calculates due date by adding relative days offset to a base date
   */
  static calculateDueDate(baseDateStr, offsetDays = 1) {
    if (!baseDateStr) return null;
    const base = new Date(baseDateStr);
    if (isNaN(base.getTime())) return null;

    const due = new Date(base);
    due.setDate(due.getDate() + (Number(offsetDays) || 0));
    return due.toISOString().split('T')[0];
  }

  /**
   * Previews workflow task generation without writing to database
   */
  static async previewWorkflow({
    workflowPresetId,
    workflowPresetVersionId = null,
    clientId = null,
    projectId = null,
    serviceInstanceId = null,
    milestoneId = null,
    startDate = null
  }) {
    // 1. Fetch Preset
    const [presetRows] = await pool.query(
      `SELECT wp.*, d.name as department_name, d.code as department_code
       FROM workflow_presets wp
       LEFT JOIN departments d ON wp.department_id = d.id
       WHERE wp.id = ?`,
      [workflowPresetId]
    );

    if (presetRows.length === 0) {
      const err = new Error(`Workflow Preset with ID ${workflowPresetId} not found`);
      err.status = 404;
      err.code = 'PRESET_NOT_FOUND';
      throw err;
    }

    const preset = presetRows[0];
    const versionId = workflowPresetVersionId || preset.current_version_id;

    if (!versionId) {
      const err = new Error(`No version available for Workflow Preset "${preset.name}"`);
      err.status = 400;
      err.code = 'NO_PRESET_VERSION';
      throw err;
    }

    // 2. Fetch Version
    const [versionRows] = await pool.query(
      'SELECT * FROM workflow_preset_versions WHERE id = ? AND preset_id = ?',
      [versionId, preset.id]
    );

    if (versionRows.length === 0) {
      const err = new Error(`Workflow Preset Version with ID ${versionId} not found`);
      err.status = 404;
      err.code = 'VERSION_NOT_FOUND';
      throw err;
    }

    const version = versionRows[0];
    const warnings = [];

    if (version.status !== 'published') {
      warnings.push(`Preset version ${version.version_number} is in '${version.status}' state (published version recommended for production automations).`);
    }

    // 3. Fetch Stages, Templates, and Dependencies
    const [stages] = await pool.query(
      'SELECT * FROM workflow_stages WHERE preset_version_id = ? ORDER BY display_order ASC',
      [version.id]
    );

    const [templates] = await pool.query(
      `SELECT tt.*, d.name as department_name
       FROM task_templates tt
       LEFT JOIN departments d ON tt.department_id = d.id
       WHERE tt.preset_version_id = ?
       ORDER BY tt.stage_id ASC, tt.display_order ASC`,
      [version.id]
    );

    const templateIds = templates.map((t) => t.id);
    let dependencies = [];
    if (templateIds.length > 0) {
      const [depRows] = await pool.query(
        `SELECT task_template_id, depends_on_task_template_id, dependency_type
         FROM task_template_dependencies
         WHERE task_template_id IN (?)`,
        [templateIds]
      );
      dependencies = depRows;
    }

    // Cycle detection
    try {
      this.detectCircularDependencies(templates, dependencies);
    } catch (cycleErr) {
      warnings.push(cycleErr.message);
    }

    // Resolve base date
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      if (projectId) {
        const [pRows] = await pool.query('SELECT start_date FROM projects WHERE id = ?', [projectId]);
        if (pRows[0]?.start_date) effectiveStartDate = pRows[0].start_date;
      } else if (serviceInstanceId) {
        const [sRows] = await pool.query('SELECT start_date FROM service_instances WHERE id = ?', [serviceInstanceId]);
        if (sRows[0]?.start_date) effectiveStartDate = sRows[0].start_date;
      }
    }
    if (!effectiveStartDate) {
      effectiveStartDate = new Date().toISOString().split('T')[0];
      warnings.push('No explicit project or service start date configured; preview calculated using current date.');
    }

    // Fetch related client, project, service names
    let clientInfo = null;
    if (clientId) {
      const [c] = await pool.query('SELECT id, name, company_name FROM clients WHERE id = ?', [clientId]);
      if (c.length > 0) clientInfo = c[0];
    }

    let projectInfo = null;
    if (projectId) {
      const [p] = await pool.query('SELECT id, name, project_code, status FROM projects WHERE id = ?', [projectId]);
      if (p.length > 0) projectInfo = p[0];
    }

    let serviceInfo = null;
    if (serviceInstanceId) {
      const [s] = await pool.query('SELECT id, label, service_type, status FROM service_instances WHERE id = ?', [serviceInstanceId]);
      if (s.length > 0) serviceInfo = s[0];
    }

    // Compute preview tasks
    const previewTasks = [];
    for (const t of templates) {
      const stage = stages.find((s) => s.id === t.stage_id);
      const taskDeps = dependencies.filter((d) => d.task_template_id === t.id);
      const isBlocked = taskDeps.length > 0;
      const dueDate = this.calculateDueDate(effectiveStartDate, t.relative_deadline_days);

      const assignedUserId = await this.resolveAssignee({
        role: t.default_assignee_role,
        departmentId: t.department_id || preset.department_id,
        clientId,
        projectId
      });

      let assigneeName = null;
      if (assignedUserId) {
        const [u] = await pool.query('SELECT name FROM users WHERE id = ?', [assignedUserId]);
        if (u.length > 0) assigneeName = u[0].name;
      }

      previewTasks.push({
        taskTemplateId: t.id,
        taskKey: t.task_key,
        title: t.title,
        description: t.description,
        stageId: t.stage_id,
        stageName: stage?.name || 'Execution',
        departmentId: t.department_id || preset.department_id,
        departmentName: t.department_name || preset.department_name,
        defaultAssigneeRole: t.default_assignee_role,
        assigneeId: assignedUserId,
        assigneeName,
        estimatedDurationHours: Number(t.estimated_duration_hours || 0),
        relativeDeadlineDays: Number(t.relative_deadline_days || 1),
        calculatedDueDate: dueDate,
        priority: t.priority || 'medium',
        initialStatus: isBlocked ? 'blocked' : 'todo',
        requiresInternalReview: Boolean(t.requires_internal_review),
        requiresClientApproval: Boolean(t.requires_client_approval),
        dependenciesCount: taskDeps.length,
        dependencies: taskDeps.map((d) => ({
          dependsOnTemplateId: d.depends_on_task_template_id,
          dependencyType: d.dependency_type
        }))
      });
    }

    return {
      preset: {
        id: preset.id,
        presetCode: preset.preset_code,
        name: preset.name,
        serviceCategory: preset.service_category,
        workflowType: preset.workflow_type,
        status: preset.status,
        departmentName: preset.department_name
      },
      version: {
        id: version.id,
        versionNumber: version.version_number,
        status: version.status,
        estimatedDurationDays: version.estimated_duration_days
      },
      context: {
        client: clientInfo,
        project: projectInfo,
        service: serviceInfo,
        startDate: effectiveStartDate
      },
      totalExpectedTasks: previewTasks.length,
      blockedTasksCount: previewTasks.filter((t) => t.initialStatus === 'blocked').length,
      readyTasksCount: previewTasks.filter((t) => t.initialStatus === 'todo').length,
      tasks: previewTasks,
      warnings
    };
  }

  /**
   * Executes workflow automation engine with database-backed idempotency,
   * transaction isolation, duplicate prevention, and traceability.
   */
  static async executeWorkflow({
    triggerType = 'manual',
    workflowPresetId,
    workflowPresetVersionId = null,
    clientId = null,
    projectId = null,
    serviceInstanceId = null,
    milestoneId = null,
    startDate = null,
    executionKey = null,
    actorUser = null,
    req = null
  }) {
    // 1. Fetch & Verify Preset
    const [presetRows] = await pool.query(
      `SELECT wp.*, d.name as department_name, d.code as department_code
       FROM workflow_presets wp
       LEFT JOIN departments d ON wp.department_id = d.id
       WHERE wp.id = ?`,
      [workflowPresetId]
    );

    if (presetRows.length === 0) {
      const err = new Error(`Workflow Preset with ID ${workflowPresetId} not found`);
      err.status = 404;
      err.code = 'PRESET_NOT_FOUND';
      throw err;
    }

    const preset = presetRows[0];

    // Must be published for production automation execution
    if (preset.status !== 'published') {
      const err = new Error(`Cannot execute unpublished workflow preset "${preset.name}" (status: ${preset.status})`);
      err.status = 400;
      err.code = 'PRESET_NOT_PUBLISHED';
      throw err;
    }

    const versionId = workflowPresetVersionId || preset.current_version_id;
    if (!versionId) {
      const err = new Error(`Workflow preset "${preset.name}" has no published version configured`);
      err.status = 400;
      err.code = 'NO_PRESET_VERSION';
      throw err;
    }

    const [versionRows] = await pool.query(
      'SELECT * FROM workflow_preset_versions WHERE id = ? AND preset_id = ?',
      [versionId, preset.id]
    );

    if (versionRows.length === 0) {
      const err = new Error(`Workflow preset version with ID ${versionId} not found`);
      err.status = 404;
      err.code = 'VERSION_NOT_FOUND';
      throw err;
    }

    const version = versionRows[0];
    if (version.status !== 'published') {
      const err = new Error(`Preset version ${version.version_number} is in '${version.status}' status. Only published versions can generate automation tasks.`);
      err.status = 400;
      err.code = 'VERSION_NOT_PUBLISHED';
      throw err;
    }

    // 2. Fetch Templates and Dependencies
    const [templates] = await pool.query(
      `SELECT * FROM task_templates 
       WHERE preset_version_id = ? 
       ORDER BY stage_id ASC, display_order ASC`,
      [version.id]
    );

    if (templates.length === 0) {
      const err = new Error(`Workflow preset version ${version.version_number} contains no task templates`);
      err.status = 400;
      err.code = 'NO_TASK_TEMPLATES';
      throw err;
    }

    const templateIds = templates.map((t) => t.id);
    let templateDeps = [];
    if (templateIds.length > 0) {
      const [depRows] = await pool.query(
        'SELECT task_template_id, depends_on_task_template_id, dependency_type FROM task_template_dependencies WHERE task_template_id IN (?)',
        [templateIds]
      );
      templateDeps = depRows;
    }

    // 3. Cycle Detection
    this.detectCircularDependencies(templates, templateDeps);

    // 4. Determine Context & Effective Dates
    let effectiveClientId = clientId;
    let effectiveProjectId = projectId;
    let effectiveServiceInstanceId = serviceInstanceId;
    let effectiveStartDate = startDate;

    if (effectiveProjectId) {
      const [pRows] = await pool.query('SELECT client_id, start_date, project_code FROM projects WHERE id = ?', [effectiveProjectId]);
      if (pRows.length > 0) {
        if (!effectiveClientId && pRows[0].client_id) effectiveClientId = pRows[0].client_id;
        if (!effectiveStartDate && pRows[0].start_date) effectiveStartDate = pRows[0].start_date;
      }
    }

    if (effectiveServiceInstanceId) {
      const [sRows] = await pool.query('SELECT client_id, start_date, service_type FROM service_instances WHERE id = ?', [effectiveServiceInstanceId]);
      if (sRows.length > 0) {
        if (!effectiveClientId && sRows[0].client_id) effectiveClientId = sRows[0].client_id;
        if (!effectiveStartDate && sRows[0].start_date) effectiveStartDate = sRows[0].start_date;
      }
    }

    if (!effectiveStartDate) {
      effectiveStartDate = new Date().toISOString().split('T')[0];
    }

    // 5. Construct Deterministic Idempotency Key
    let key = executionKey;
    if (!key) {
      if (triggerType === 'service_activation' && effectiveServiceInstanceId) {
        key = `srv_${effectiveServiceInstanceId}_v${version.id}`;
      } else if (triggerType === 'project_start' && effectiveProjectId) {
        key = `prj_${effectiveProjectId}_v${version.id}`;
      } else if (triggerType === 'milestone_activation' && milestoneId) {
        key = `ms_${milestoneId}_v${version.id}`;
      } else {
        const entityPart = effectiveProjectId ? `prj_${effectiveProjectId}` : (effectiveServiceInstanceId ? `srv_${effectiveServiceInstanceId}` : `cl_${effectiveClientId || 'gen'}`);
        key = `${triggerType.slice(0, 3)}_${entityPart}_v${version.id}_${Date.now()}`;
      }
    }

    // 6. Check existing execution record for idempotency
    const [existingExecRows] = await pool.query(
      'SELECT * FROM workflow_executions WHERE execution_key = ?',
      [key]
    );

    if (existingExecRows.length > 0) {
      const existing = existingExecRows[0];
      if (existing.status === 'completed') {
        // Idempotent return: already executed completely!
        const [generatedTasks] = await pool.query(
          'SELECT * FROM tasks WHERE workflow_execution_id = ? ORDER BY id ASC',
          [existing.id]
        );
        return {
          execution: existing,
          isDuplicate: true,
          createdTasksCount: 0,
          totalTasksCount: existing.total_tasks_count,
          tasks: generatedTasks,
          message: 'Workflow execution already completed previously (idempotent result).'
        };
      } else if (existing.status === 'running') {
        const err = new Error(`Workflow execution "${key}" is currently running. Please wait for completion.`);
        err.status = 409;
        err.code = 'EXECUTION_IN_PROGRESS';
        throw err;
      }
    }

    // 7. Begin Transaction
    const connection = await pool.getConnection();
    let executionId = null;

    try {
      await connection.beginTransaction();

      // Create or update execution record
      if (existingExecRows.length === 0) {
        const [execRes] = await connection.query(
          `INSERT INTO workflow_executions (
            execution_key, trigger_type, client_id, project_id, service_instance_id,
            milestone_id, workflow_preset_id, workflow_preset_version_id,
            status, total_tasks_count, created_tasks_count, failed_tasks_count,
            executed_by, started_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, 0, 0, ?, NOW())`,
          [
            key, triggerType, effectiveClientId || null, effectiveProjectId || null,
            effectiveServiceInstanceId || null, milestoneId || null,
            preset.id, version.id, templates.length, actorUser?.id || null
          ]
        );
        executionId = execRes.insertId;
      } else {
        executionId = existingExecRows[0].id;
        await connection.query(
          "UPDATE workflow_executions SET status = 'running', started_at = NOW(), error_details = NULL WHERE id = ?",
          [executionId]
        );
      }

      // 8. Determine which tasks already exist (for safe retry / idempotent resumption)
      const [existingTasks] = await connection.query(
        `SELECT task_template_id, id FROM tasks 
         WHERE workflow_execution_id = ? OR (
           task_template_id IN (?) AND (
             (? IS NOT NULL AND project_id = ?) OR 
             (? IS NOT NULL AND service_instance_id = ?)
           )
         )`,
        [
          executionId,
          templateIds,
          effectiveProjectId, effectiveProjectId,
          effectiveServiceInstanceId, effectiveServiceInstanceId
        ]
      );

      const existingTemplateMap = new Map();
      existingTasks.forEach((t) => {
        if (t.task_template_id) existingTemplateMap.set(Number(t.task_template_id), t.id);
      });

      // Filter templates needing task creation
      const templatesToCreate = templates.filter((t) => !existingTemplateMap.has(Number(t.id)));

      // Fetch project code if project exists
      let projectCode = 'DG';
      if (effectiveProjectId) {
        const [pRows] = await connection.query('SELECT project_code FROM projects WHERE id = ?', [effectiveProjectId]);
        if (pRows.length > 0) projectCode = pRows[0].project_code;
      }

      // Count existing project tasks for code sequencing
      const [taskCountRows] = await connection.query(
        'SELECT COUNT(*) as count FROM tasks WHERE project_id = ?',
        [effectiveProjectId || 0]
      );
      let sequence = Number(taskCountRows[0].count) + 1;

      const createdTasks = [];
      const templateToTaskIdMap = new Map(existingTemplateMap);

      // Create missing tasks
      for (const t of templatesToCreate) {
        const taskCode = effectiveProjectId
          ? `${projectCode}-T${sequence++}`
          : `DG-${effectiveClientId || '0'}-${preset.preset_code.slice(0, 4)}-${Date.now().toString().slice(-4)}${sequence++}`;

        const dueDate = this.calculateDueDate(effectiveStartDate, t.relative_deadline_days);

        const assigneeId = await this.resolveAssignee({
          role: t.default_assignee_role,
          departmentId: t.department_id || preset.department_id,
          clientId: effectiveClientId,
          projectId: effectiveProjectId
        });

        // Dependencies evaluation
        const myDeps = templateDeps.filter((d) => Number(d.task_template_id) === Number(t.id));
        const initialStatus = myDeps.length > 0 ? 'blocked' : 'todo';
        const initialColumnStatus = myDeps.length > 0 ? 'todo' : 'todo';
        const estimatedMinutes = Math.round(Number(t.estimated_duration_hours || 0) * 60);

        const [tRes] = await connection.query(
          `INSERT INTO tasks (
            task_code, title, description, project_id, client_id, service_instance_id,
            department_id, workflow_preset_id, workflow_preset_version_id, task_template_id,
            workflow_execution_id, milestone_id, creator_id, assignee_id,
            status, column_status, priority, due_date, estimated_minutes,
            source, is_client_deliverable
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Workflow', ?)`,
          [
            taskCode,
            t.title,
            t.description || (t.instructions ? `Instructions: ${t.instructions}` : null),
            effectiveProjectId || null,
            effectiveClientId || null,
            effectiveServiceInstanceId || null,
            t.department_id || preset.department_id || null,
            preset.id,
            version.id,
            t.id,
            executionId,
            milestoneId || null,
            actorUser?.id || 1,
            assigneeId || null,
            initialStatus,
            initialColumnStatus,
            t.priority || 'medium',
            dueDate,
            estimatedMinutes,
            t.requires_client_approval ? 1 : 0
          ]
        );

        const newTaskId = tRes.insertId;
        templateToTaskIdMap.set(Number(t.id), newTaskId);

        // Assignee pivot
        if (assigneeId) {
          await connection.query(
            `INSERT IGNORE INTO task_assignees (task_id, user_id, assigned_by)
             VALUES (?, ?, ?)`,
            [newTaskId, assigneeId, actorUser?.id || null]
          );
        }

        createdTasks.push({
          id: newTaskId,
          task_code: taskCode,
          title: t.title,
          task_template_id: t.id,
          status: initialStatus,
          due_date: dueDate,
          assignee_id: assigneeId
        });
      }

      // 9. Create Runtime Task Dependencies
      for (const d of templateDeps) {
        const taskId = templateToTaskIdMap.get(Number(d.task_template_id));
        const dependsOnTaskId = templateToTaskIdMap.get(Number(d.depends_on_task_template_id));

        if (taskId && dependsOnTaskId && taskId !== dependsOnTaskId) {
          // Check if prerequisite task is already completed
          const [prereqRows] = await connection.query(
            'SELECT status FROM tasks WHERE id = ?',
            [dependsOnTaskId]
          );
          const isSatisfied = prereqRows.length > 0 && prereqRows[0].status === 'completed';

          await connection.query(
            `INSERT INTO task_dependencies (
              task_id, depends_on_task_id, dependency_type, is_satisfied, satisfied_at
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE dependency_type = VALUES(dependency_type)`,
            [
              taskId,
              dependsOnTaskId,
              d.dependency_type || 'finish_to_start',
              isSatisfied ? 1 : 0,
              isSatisfied ? new Date() : null
            ]
          );
        }
      }

      // 10. Re-verify blocked status on newly created tasks: if all prereqs satisfied, set to 'todo'
      for (const created of createdTasks) {
        const [unsatisfiedRows] = await connection.query(
          'SELECT COUNT(*) as count FROM task_dependencies WHERE task_id = ? AND is_satisfied = FALSE',
          [created.id]
        );
        const unsatisfied = Number(unsatisfiedRows[0].count);
        if (unsatisfied === 0 && created.status === 'blocked') {
          await connection.query("UPDATE tasks SET status = 'todo' WHERE id = ?", [created.id]);
          created.status = 'todo';
        }
      }

      // 11. Finalize Execution Record
      const totalCreated = templateToTaskIdMap.size;
      await connection.query(
        `UPDATE workflow_executions 
         SET status = 'completed', created_tasks_count = ?, completed_at = NOW()
         WHERE id = ?`,
        [totalCreated, executionId]
      );

      // Audit log
      await AuditService.log({
        db: connection,
        actorId: actorUser?.id || null,
        action: 'workflow.executed',
        entityType: 'workflow_execution',
        entityId: executionId,
        details: {
          executionKey: key,
          triggerType,
          presetId: preset.id,
          versionId: version.id,
          createdTasksCount: createdTasks.length,
          totalTasksCount: totalCreated
        },
        req
      });

      await connection.commit();

      const [updatedExec] = await pool.query('SELECT * FROM workflow_executions WHERE id = ?', [executionId]);

      return {
        execution: updatedExec[0],
        isDuplicate: false,
        createdTasksCount: createdTasks.length,
        totalTasksCount: totalCreated,
        tasks: createdTasks,
        message: `Workflow executed successfully. Generated ${createdTasks.length} tasks.`
      };
    } catch (err) {
      await connection.rollback();

      // If execution was recorded, mark as failed
      if (executionId) {
        try {
          await pool.query(
            `UPDATE workflow_executions 
             SET status = 'failed', error_details = ?, completed_at = NOW()
             WHERE id = ?`,
            [JSON.stringify({ message: err.message, code: err.code || 'EXECUTION_FAILED' }), executionId]
          );
        } catch (updateErr) {
          console.error('Failed to update execution error status:', updateErr);
        }
      }

      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Evaluates dependencies when a task is completed (Trigger D)
   * Unblocks dependent tasks when all prerequisites are satisfied.
   */
  static async onTaskCompleted(taskId, actorUser = null, req = null) {
    const [taskRows] = await pool.query('SELECT id, status, project_id, title FROM tasks WHERE id = ?', [taskId]);
    if (taskRows.length === 0) return { unblockedTasks: [] };

    // 1. Mark runtime dependencies where this task is the prerequisite as satisfied
    await pool.query(
      `UPDATE task_dependencies 
       SET is_satisfied = TRUE, satisfied_at = NOW()
       WHERE depends_on_task_id = ? AND is_satisfied = FALSE`,
      [taskId]
    );

    // 2. Find tasks waiting on this task
    const [depRows] = await pool.query(
      'SELECT DISTINCT task_id FROM task_dependencies WHERE depends_on_task_id = ?',
      [taskId]
    );

    const unblockedTasks = [];

    for (const r of depRows) {
      const waitingTaskId = r.task_id;

      // Check if waiting task has any remaining unsatisfied dependencies
      const [unsatisfiedRows] = await pool.query(
        'SELECT COUNT(*) as count FROM task_dependencies WHERE task_id = ? AND is_satisfied = FALSE',
        [waitingTaskId]
      );

      if (Number(unsatisfiedRows[0].count) === 0) {
        // Check current status: unblock if currently 'blocked'
        const [waitingTask] = await pool.query('SELECT id, status, task_code, title FROM tasks WHERE id = ?', [waitingTaskId]);
        if (waitingTask.length > 0 && waitingTask[0].status === 'blocked') {
          await pool.query("UPDATE tasks SET status = 'todo', column_status = 'todo' WHERE id = ?", [waitingTaskId]);

          await pool.query(
            `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
             VALUES (?, ?, 'blocked', 'todo', 'Automatically unblocked: all prerequisite tasks completed')`,
            [waitingTaskId, actorUser?.id || null]
          );

          await AuditService.log({
            actorId: actorUser?.id || null,
            action: 'task.unblocked',
            entityType: 'task',
            entityId: waitingTaskId,
            details: {
              taskCode: waitingTask[0].task_code,
              triggerTaskId: taskId,
              reason: 'All prerequisite dependencies satisfied'
            },
            req
          });

          unblockedTasks.push(waitingTask[0]);
        }
      }
    }

    return { unblockedTasks };
  }

  /**
   * Evaluates service activation (Trigger A)
   */
  static async onServiceActivated(serviceInstanceId, actorUser = null, req = null) {
    const [sRows] = await pool.query(
      `SELECT si.*, c.name as client_name
       FROM service_instances si
       JOIN clients c ON si.client_id = c.id
       WHERE si.id = ?`,
      [serviceInstanceId]
    );

    if (sRows.length === 0) {
      const err = new Error(`Service instance with ID ${serviceInstanceId} not found`);
      err.status = 404;
      err.code = 'SERVICE_NOT_FOUND';
      throw err;
    }

    const service = sRows[0];
    if (!service.workflow_preset_id) {
      return {
        message: 'No workflow preset linked to this service. No automation tasks generated.',
        tasks: []
      };
    }

    return this.executeWorkflow({
      triggerType: 'service_activation',
      workflowPresetId: service.workflow_preset_id,
      workflowPresetVersionId: service.workflow_preset_version_id,
      clientId: service.client_id,
      serviceInstanceId: service.id,
      startDate: service.start_date,
      actorUser,
      req
    });
  }

  /**
   * Evaluates project start (Trigger B)
   */
  static async onProjectStarted(projectId, actorUser = null, req = null) {
    const [pRows] = await pool.query(
      `SELECT p.* 
       FROM projects p
       WHERE p.id = ?`,
      [projectId]
    );

    if (pRows.length === 0) {
      const err = new Error(`Project with ID ${projectId} not found`);
      err.status = 404;
      err.code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const project = pRows[0];
    if (!project.workflow_preset_id) {
      return {
        message: 'No workflow preset linked to this project. No automation tasks generated.',
        tasks: []
      };
    }

    return this.executeWorkflow({
      triggerType: 'project_start',
      workflowPresetId: project.workflow_preset_id,
      workflowPresetVersionId: project.workflow_preset_version_id,
      clientId: project.client_id,
      projectId: project.id,
      serviceInstanceId: project.service_instance_id,
      startDate: project.start_date,
      actorUser,
      req
    });
  }

  /**
   * Evaluates milestone activation (Trigger C)
   */
  static async onMilestoneActivated(milestoneId, actorUser = null, req = null) {
    const [mRows] = await pool.query(
      `SELECT m.*, p.workflow_preset_id, p.workflow_preset_version_id, p.client_id, p.service_instance_id
       FROM project_milestones m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = ?`,
      [milestoneId]
    );

    if (mRows.length === 0) {
      const err = new Error(`Milestone with ID ${milestoneId} not found`);
      err.status = 404;
      err.code = 'MILESTONE_NOT_FOUND';
      throw err;
    }

    const milestone = mRows[0];
    if (!milestone.workflow_preset_id) {
      return {
        message: 'No workflow preset linked to the milestone project.',
        tasks: []
      };
    }

    return this.executeWorkflow({
      triggerType: 'milestone_activation',
      workflowPresetId: milestone.workflow_preset_id,
      workflowPresetVersionId: milestone.workflow_preset_version_id,
      clientId: milestone.client_id,
      projectId: milestone.project_id,
      serviceInstanceId: milestone.service_instance_id,
      milestoneId: milestone.id,
      startDate: milestone.due_date,
      actorUser,
      req
    });
  }

  /**
   * Retries an eligible failed or partially failed workflow execution idempotently
   */
  static async retryExecution(executionId, actorUser = null, req = null) {
    const [execRows] = await pool.query('SELECT * FROM workflow_executions WHERE id = ?', [executionId]);
    if (execRows.length === 0) {
      const err = new Error(`Workflow execution with ID ${executionId} not found`);
      err.status = 404;
      err.code = 'EXECUTION_NOT_FOUND';
      throw err;
    }

    const exec = execRows[0];
    if (exec.status === 'completed') {
      const [tasks] = await pool.query('SELECT * FROM tasks WHERE workflow_execution_id = ?', [executionId]);
      return {
        execution: exec,
        message: 'Execution is already completed successfully.',
        tasks
      };
    }

    return this.executeWorkflow({
      triggerType: exec.trigger_type,
      workflowPresetId: exec.workflow_preset_id,
      workflowPresetVersionId: exec.workflow_preset_version_id,
      clientId: exec.client_id,
      projectId: exec.project_id,
      serviceInstanceId: exec.service_instance_id,
      milestoneId: exec.milestone_id,
      executionKey: exec.execution_key,
      actorUser,
      req
    });
  }

  /**
   * Retrieves an execution by ID
   */
  static async getExecutionById(executionId, actorUser) {
    const [rows] = await pool.query(
      `SELECT we.*, 
              wp.name as preset_name, wp.preset_code,
              wpv.version_number,
              p.name as project_name, p.project_code,
              c.name as client_name,
              u.name as executed_by_name
       FROM workflow_executions we
       LEFT JOIN workflow_presets wp ON we.workflow_preset_id = wp.id
       LEFT JOIN workflow_preset_versions wpv ON we.workflow_preset_version_id = wpv.id
       LEFT JOIN projects p ON we.project_id = p.id
       LEFT JOIN clients c ON we.client_id = c.id
       LEFT JOIN users u ON we.executed_by = u.id
       WHERE we.id = ?`,
      [executionId]
    );

    if (rows.length === 0) {
      const err = new Error(`Workflow execution with ID ${executionId} not found`);
      err.status = 404;
      err.code = 'EXECUTION_NOT_FOUND';
      throw err;
    }

    const exec = rows[0];
    if (exec.project_id) {
      await ProjectsPolicy.enforceAccess(exec.project_id, actorUser);
    }

    return exec;
  }

  /**
   * Retrieves tasks generated by an execution
   */
  static async getExecutionTasks(executionId, actorUser) {
    const exec = await this.getExecutionById(executionId, actorUser);

    const [tasks] = await pool.query(
      `SELECT t.*, u.name as assignee_name, d.name as department_name, tt.title as template_title
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN departments d ON t.department_id = d.id
       LEFT JOIN task_templates tt ON t.task_template_id = tt.id
       WHERE t.workflow_execution_id = ?
       ORDER BY t.id ASC`,
      [exec.id]
    );

    return tasks;
  }

  /**
   * Lists executions with pagination and filters
   */
  static async listExecutions({
    projectId,
    serviceInstanceId,
    clientId,
    status = '',
    triggerType = '',
    limit = 20,
    offset = 0
  }, actorUser) {
    const whereClauses = [];
    const params = [];

    if (projectId) {
      await ProjectsPolicy.enforceAccess(projectId, actorUser);
      whereClauses.push('we.project_id = ?');
      params.push(Number(projectId));
    }

    if (serviceInstanceId) {
      whereClauses.push('we.service_instance_id = ?');
      params.push(Number(serviceInstanceId));
    }

    if (clientId) {
      whereClauses.push('we.client_id = ?');
      params.push(Number(clientId));
    }

    if (status.trim()) {
      whereClauses.push('we.status = ?');
      params.push(status.trim());
    }

    if (triggerType.trim()) {
      whereClauses.push('we.trigger_type = ?');
      params.push(triggerType.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM workflow_executions we ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const [executions] = await pool.query(
      `SELECT we.*, 
              wp.name as preset_name, wp.preset_code,
              wpv.version_number,
              p.name as project_name, p.project_code,
              c.name as client_name,
              u.name as executed_by_name
       FROM workflow_executions we
       LEFT JOIN workflow_presets wp ON we.workflow_preset_id = wp.id
       LEFT JOIN workflow_preset_versions wpv ON we.workflow_preset_version_id = wpv.id
       LEFT JOIN projects p ON we.project_id = p.id
       LEFT JOIN clients c ON we.client_id = c.id
       LEFT JOIN users u ON we.executed_by = u.id
       ${whereSql}
       ORDER BY we.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      executions,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        page: Math.floor(Number(offset) / Number(limit)) + 1,
        pages: Math.ceil(total / Number(limit)) || 1
      }
    };
  }

  /**
   * Refreshes / evaluates all runtime task dependencies for a project or task
   */
  static async evaluateDependencies({ projectId = null, taskId = null }, actorUser = null, req = null) {
    if (projectId) {
      await ProjectsPolicy.enforceAccess(projectId, actorUser);
    }

    const whereClauses = [];
    const params = [];
    if (projectId) {
      whereClauses.push('t.project_id = ?');
      params.push(Number(projectId));
    }
    if (taskId) {
      whereClauses.push('td.task_id = ?');
      params.push(Number(taskId));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Find dependencies where prerequisite is completed but runtime row is still unsatisfied
    const [completedPrereqs] = await pool.query(
      `SELECT td.id, td.task_id, td.depends_on_task_id
       FROM task_dependencies td
       JOIN tasks t ON td.task_id = t.id
       JOIN tasks p ON td.depends_on_task_id = p.id
       ${whereSql ? `${whereSql} AND` : 'WHERE'} p.status = 'completed' AND td.is_satisfied = FALSE`,
      params
    );

    if (completedPrereqs.length > 0) {
      const depIds = completedPrereqs.map((d) => d.id);
      await pool.query(
        'UPDATE task_dependencies SET is_satisfied = TRUE, satisfied_at = NOW() WHERE id IN (?)',
        [depIds]
      );
    }

    // Now check for tasks that are blocked but have zero unsatisfied dependencies
    const [blockedTasks] = await pool.query(
      `SELECT t.id, t.status, t.task_code, t.title
       FROM tasks t
       WHERE t.status = 'blocked' ${projectId ? 'AND t.project_id = ?' : ''}`,
      projectId ? [Number(projectId)] : []
    );

    const newlyUnblocked = [];
    for (const b of blockedTasks) {
      const [unsatisfied] = await pool.query(
        'SELECT COUNT(*) as count FROM task_dependencies WHERE task_id = ? AND is_satisfied = FALSE',
        [b.id]
      );
      if (Number(unsatisfied[0].count) === 0) {
        await pool.query("UPDATE tasks SET status = 'todo', column_status = 'todo' WHERE id = ?", [b.id]);
        newlyUnblocked.push(b);
      }
    }

    return {
      evaluatedPrerequisitesCount: completedPrereqs.length,
      unblockedTasks: newlyUnblocked
    };
  }
}
