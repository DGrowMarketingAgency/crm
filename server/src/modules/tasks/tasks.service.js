import path from "path";
import fs from "fs";
import { pool } from "../../config/db.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsPolicy } from "../projects/projects.policy.js";
import { TasksPolicy } from "./tasks.policy.js";
import { WorkflowEngineService } from "../automation/workflow-engine.service.js";

export class TasksService {
  /**
   * Helper to retrieve task by ID with raw row
   */
  static async getRawTask(taskId) {
    const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [
      taskId,
    ]);
    if (rows.length === 0) {
      const error = new Error("Task not found");
      error.status = 404;
      error.code = "TASK_NOT_FOUND";
      throw error;
    }
    return rows[0];
  }

  /**
   * Retrieves paginated list of tasks scoped to accessible projects
   */
  static async listTasks(
    {
      projectId = "",
      clientId = "",
      serviceInstanceId = "",
      source = "",
      columnStatus = "",
      status = "",
      priority = "",
      assigneeId = "",
      dueDate = "",
      search = "",
      isArchived = false,
      sortBy = "created_at",
      sortOrder = "desc",
      limit = 25,
      offset = 0,
    },
    actorUser,
  ) {
    const whereClauses = [];
    const params = [];

    // Archive filter
    whereClauses.push("t.is_archived = ?");
    params.push(isArchived === "true" || isArchived === true ? 1 : 0);

    // Global admin vs Project/Client Scoped Access
    if (!ProjectsPolicy.isGlobalAdmin(actorUser)) {
      whereClauses.push(`(
        t.creator_id = ?
        OR t.assignee_id = ?
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
        OR (p.id IS NOT NULL AND (
          p.project_manager_id = ?
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
          OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON pt.team_id = tm.team_id WHERE pt.project_id = p.id AND tm.user_id = ?)
          OR EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id AND (c.user_id = ? OR c.email = ?))
        ))
        OR (c.id IS NOT NULL AND (
          c.account_manager_id = ?
          OR c.user_id = ?
          OR c.id = ?
        ))
      )`);
      params.push(
        actorUser.id,
        actorUser.id,
        actorUser.id,
        actorUser.id,
        actorUser.id,
        actorUser.id,
        actorUser.id,
        actorUser.email,
        actorUser.id,
        actorUser.id,
        actorUser.client_id || 0,
      );
    }

    if (projectId) {
      whereClauses.push("t.project_id = ?");
      params.push(Number(projectId));
    }

    if (clientId) {
      whereClauses.push("t.client_id = ?");
      params.push(Number(clientId));
    }

    if (serviceInstanceId) {
      whereClauses.push("t.service_instance_id = ?");
      params.push(Number(serviceInstanceId));
    }

    if (source.trim()) {
      whereClauses.push("t.source = ?");
      params.push(source.trim());
    }

    if (columnStatus.trim()) {
      whereClauses.push("(t.column_status = ? OR t.status = ?)");
      params.push(columnStatus.trim(), columnStatus.trim());
    }

    if (status.trim()) {
      whereClauses.push("t.status = ?");
      params.push(status.trim());
    }

    if (priority.trim()) {
      whereClauses.push("t.priority = ?");
      params.push(priority.trim());
    }

    if (assigneeId) {
      whereClauses.push(
        "(t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?))",
      );
      params.push(Number(assigneeId), Number(assigneeId));
    }

    if (dueDate) {
      whereClauses.push("t.due_date = ?");
      params.push(dueDate);
    }

    if (search.trim()) {
      whereClauses.push(
        "(t.title LIKE ? OR t.task_code LIKE ? OR t.description LIKE ?)",
      );
      params.push(
        `%${search.trim()}%`,
        `%${search.trim()}%`,
        `%${search.trim()}%`,
      );
    }

    const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

    // Total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN clients c ON t.client_id = c.id
       ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].total);

    // Sorting
    const sortFieldMap = {
      title: "t.title",
      due_date: "t.due_date",
      priority: 'FIELD(t.priority, "urgent", "high", "medium", "low")',
      created_at: "t.created_at",
      status: "t.status",
    };
    const orderCol = sortFieldMap[sortBy] || "t.created_at";
    const direction =
      String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";

    // Fetch tasks
    const [tasks] = await pool.query(
      `SELECT t.id, t.task_code, t.title, t.description, t.project_id, t.client_id,
              t.service_instance_id, t.source, t.column_status, t.is_client_deliverable,
              t.revision_count, t.deliverable_url, t.deliverable_notes, t.assignee_id,
              t.milestone_id, t.parent_task_id, t.creator_id, t.status, t.priority,
              t.start_date, t.due_date, t.completed_at, t.is_archived, t.estimated_minutes,
              t.labels, t.reference_url, t.created_at, t.updated_at,
              p.name as project_name, p.project_code,
              c.name as client_name,
              pm.title as milestone_title,
              u.name as creator_name,
              COUNT(DISTINCT st.id) as total_subtasks,
              SUM(CASE WHEN st.status = 'completed' THEN 1 ELSE 0 END) as completed_subtasks
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN project_milestones pm ON t.milestone_id = pm.id
       LEFT JOIN users u ON t.creator_id = u.id
       LEFT JOIN tasks st ON st.parent_task_id = t.id
       ${whereSql}
       GROUP BY t.id
       ORDER BY ${orderCol} ${direction}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    // Fetch assignees for the fetched tasks
    const taskIds = tasks.map((t) => t.id);
    let assigneesByTask = {};

    if (taskIds.length > 0) {
      const [assigneeRows] = await pool.query(
        `SELECT ta.task_id, ta.user_id, u.name, u.email, u.role
         FROM task_assignees ta
         JOIN users u ON ta.user_id = u.id
         WHERE ta.task_id IN (?)`,
        [taskIds],
      );
      assigneeRows.forEach((row) => {
        if (!assigneesByTask[row.task_id]) {
          assigneesByTask[row.task_id] = [];
        }
        assigneesByTask[row.task_id].push({
          userId: row.user_id,
          name: row.name,
          email: row.email,
          role: row.role,
        });
      });
    }

    const now = new Date();
    const formattedTasks = tasks.map((t) => {
      const isOverdue = Boolean(
        t.due_date && new Date(t.due_date) < now && t.status !== "completed",
      );
      const totalSub = Number(t.total_subtasks || 0);
      const compSub = Number(t.completed_subtasks || 0);

      return {
        ...t,
        assignees: assigneesByTask[t.id] || [],
        is_overdue: isOverdue,
        total_subtasks: totalSub,
        completed_subtasks: compSub,
        labels:
          typeof t.labels === "string" ? JSON.parse(t.labels) : t.labels || [],
      };
    });

    return {
      tasks: formattedTasks,
      total,
      limit: Number(limit),
      offset: Number(offset),
    };
  }

  /**
   * Retrieves single task with assignees, subtasks, milestone, and project relations
   */
  static async getTaskById(taskId, actorUser) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [rows] = await pool.query(
      `SELECT t.*,
              p.name as project_name, p.project_code,
              c.name as client_name, c.lifecycle_stage as client_lifecycle_stage,
              pm.title as milestone_title,
              u.name as creator_name, u.email as creator_email,
              pt.title as parent_task_title, pt.task_code as parent_task_code
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN project_milestones pm ON t.milestone_id = pm.id
       LEFT JOIN users u ON t.creator_id = u.id
       LEFT JOIN tasks pt ON t.parent_task_id = pt.id
       WHERE t.id = ?`,
      [taskId],
    );

    const task = rows[0];

    // Fetch assignees
    const [assignees] = await pool.query(
      `SELECT ta.user_id, ta.assigned_at, u.name, u.email, u.role, u.status as user_status
       FROM task_assignees ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.task_id = ?
       ORDER BY u.name ASC`,
      [taskId],
    );

    // Fetch subtasks
    const [subtasks] = await pool.query(
      `SELECT id, task_code, title, status, priority, due_date, completed_at
       FROM tasks
       WHERE parent_task_id = ?
       ORDER BY id ASC`,
      [taskId],
    );

    // Fetch comments count
    const [commentCountRow] = await pool.query(
      "SELECT COUNT(*) as count FROM task_comments WHERE task_id = ? AND deleted_at IS NULL",
      [taskId],
    );

    // Fetch attachments count
    const [attachmentCountRow] = await pool.query(
      "SELECT COUNT(*) as count FROM task_attachments WHERE task_id = ? AND deleted_at IS NULL",
      [taskId],
    );

    const isOverdue = Boolean(
      task.due_date &&
      new Date(task.due_date) < new Date() &&
      task.status !== "completed",
    );

    return {
      ...task,
      assignees,
      subtasks,
      comments_count: Number(commentCountRow[0]?.count || 0),
      attachments_count: Number(attachmentCountRow[0]?.count || 0),
      is_overdue: isOverdue,
      labels:
        typeof task.labels === "string"
          ? JSON.parse(task.labels)
          : task.labels || [],
    };
  }

  /**
   * Creates a new task or subtask transactionally
   */
  static async createTask(data, actorUser, req = null) {
    let project = null;
    let taskCode = "";

    const clientId = data.clientId || data.client_id || null;
    const projectId = data.projectId || data.project_id || null;
    const serviceInstanceId = data.serviceInstanceId || data.service_instance_id || null;
    const dueDate = data.dueDate || data.due_date || null;
    const startDate = data.startDate || data.start_date || null;
    const milestoneId = data.milestoneId || data.milestone_id || null;
    const parentTaskId = data.parentTaskId || data.parent_task_id || null;
    const isClientDeliverable = data.isClientDeliverable !== undefined ? Boolean(data.isClientDeliverable) : (data.is_client_deliverable !== undefined ? Boolean(data.is_client_deliverable) : false);
    const estimatedMinutes = data.estimatedMinutes !== undefined ? data.estimatedMinutes : (data.estimated_minutes !== undefined ? data.estimated_minutes : null);
    const referenceUrl = data.referenceUrl || data.reference_url || null;

    const rawAssigneeId = data.assigneeId || data.assignee_id;
    const rawAssigneeIds = data.assigneeIds || data.assignee_ids;
    const assigneeIds =
      rawAssigneeIds && rawAssigneeIds.length > 0
        ? rawAssigneeIds.map(Number)
        : rawAssigneeId
          ? [Number(rawAssigneeId)]
          : [];

    if (projectId) {
      // 1. Check parent project access
      await ProjectsPolicy.enforceAccess(projectId, actorUser);

      // 2. Fetch project details to generate task code
      const [projRows] = await pool.query(
        "SELECT id, project_code FROM projects WHERE id = ?",
        [projectId],
      );
      if (projRows.length === 0) {
        const error = new Error("Parent project not found");
        error.status = 404;
        error.code = "PROJECT_NOT_FOUND";
        throw error;
      }
      project = projRows[0];
    } else {
      // Manual or Direct Client task (PDF Section 5.4)
      if (assigneeIds.length === 0) {
        const error = new Error(
          "Manual tasks must be assigned to a specific assignee with a due date",
        );
        error.status = 400;
        error.code = "MANUAL_TASK_ASSIGNEE_REQUIRED";
        throw error;
      }
      if (!dueDate) {
        const error = new Error("Due date is required for manual tasks");
        error.status = 400;
        error.code = "MANUAL_TASK_DUE_DATE_REQUIRED";
        throw error;
      }

      const randomSuffix = Math.floor(Math.random() * 900 + 100);
      if (clientId) {
        taskCode = `DG-${clientId}-M${randomSuffix}`;
      } else {
        taskCode = `DG-MANUAL-${randomSuffix}`;
      }
    }

    // 3. Milestone validation
    if (milestoneId) {
      const [mRows] = await pool.query(
        "SELECT id FROM project_milestones WHERE id = ? AND project_id = ?",
        [milestoneId, projectId],
      );
      if (mRows.length === 0) {
        const error = new Error(
          "Milestone does not belong to the selected project",
        );
        error.status = 400;
        error.code = "INVALID_MILESTONE";
        throw error;
      }
    }

    // 4. Parent task validation
    if (parentTaskId) {
      const [parentRows] = await pool.query(
        "SELECT id, project_id FROM tasks WHERE id = ?",
        [parentTaskId],
      );
      if (parentRows.length === 0) {
        const error = new Error("Parent task not found");
        error.status = 404;
        error.code = "PARENT_TASK_NOT_FOUND";
        throw error;
      }
      if (Number(parentRows[0].project_id) !== Number(projectId)) {
        const error = new Error("Parent task must belong to the same project");
        error.status = 400;
        error.code = "CROSS_PROJECT_PARENT_TASK";
        throw error;
      }
    }

    // 5. Assignees validation
    if (assigneeIds.length > 0) {
      const [userRows] = await pool.query(
        "SELECT id, status FROM users WHERE id IN (?)",
        [assigneeIds],
      );
      if (userRows.length !== assigneeIds.length) {
        const error = new Error("One or more assignees do not exist");
        error.status = 400;
        error.code = "INVALID_ASSIGNEES";
        throw error;
      }
      const hasInactive = userRows.some((u) => u.status !== "active");
      if (hasInactive) {
        const error = new Error("Cannot assign inactive users to a task");
        error.status = 400;
        error.code = "INACTIVE_ASSIGNEE";
        throw error;
      }
    }

    if (projectId && project) {
      // Generate unique task code: {PROJECT_CODE}-T{N}
      const [countRows] = await pool.query(
        "SELECT COUNT(*) as count FROM tasks WHERE project_id = ?",
        [projectId],
      );
      const taskNumber = Number(countRows[0].count) + 1;
      taskCode = `${project.project_code}-T${taskNumber}`;
    }

    const initialCol =
      data.columnStatus || data.column_status || (data.status === "completed" ? "done" : "todo");
    const initialStatus =
      data.status || (initialCol === "done" ? "completed" : "todo");
    const isCompleted = initialStatus === "completed" || initialCol === "done";
    const completedAt = isCompleted ? new Date() : null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Insert Task
      const [result] = await connection.query(
        `INSERT INTO tasks (
          task_code, title, description, project_id, client_id, service_instance_id,
          source, column_status, is_client_deliverable, assignee_id,
          milestone_id, parent_task_id, creator_id, status, priority,
          start_date, due_date, completed_at, estimated_minutes, labels, reference_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskCode,
          data.title.trim(),
          data.description || null,
          projectId,
          clientId,
          serviceInstanceId,
          data.source || (projectId ? "Manual" : "Manual"),
          initialCol,
          isClientDeliverable ? 1 : 0,
          assigneeIds[0] || null,
          milestoneId,
          parentTaskId,
          actorUser.id,
          initialStatus,
          data.priority || "medium",
          startDate,
          dueDate,
          completedAt,
          estimatedMinutes,
          data.labels ? JSON.stringify(data.labels) : null,
          referenceUrl,
        ],
      );

      const newTaskId = result.insertId;

      // Insert Assignees
      for (const uId of assigneeIds) {
        await connection.query(
          `INSERT INTO task_assignees (task_id, user_id, assigned_by)
           VALUES (?, ?, ?)`,
          [newTaskId, uId, actorUser.id],
        );
      }

      // Record initial status history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'none', ?, 'Initial task creation')`,
        [newTaskId, actorUser.id, data.status || "todo"],
      );

      // Audit Log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: "task.created",
        entityType: "task",
        entityId: newTaskId,
        details: {
          taskCode,
          title: data.title.trim(),
          projectId: data.projectId,
          assigneeCount: assigneeIds.length,
        },
        req,
      });

      await connection.commit();
      return this.getTaskById(newTaskId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates an existing task
   */
  static async updateTask(taskId, data, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskManage(raw, actorUser);

    if (
      data.milestoneId &&
      Number(data.milestoneId) !== Number(raw.milestone_id)
    ) {
      const [mRows] = await pool.query(
        "SELECT id FROM project_milestones WHERE id = ? AND project_id = ?",
        [data.milestoneId, raw.project_id],
      );
      if (mRows.length === 0) {
        const error = new Error("Milestone does not belong to this project");
        error.status = 400;
        error.code = "INVALID_MILESTONE";
        throw error;
      }
    }

    const newTitle = data.title !== undefined ? data.title.trim() : raw.title;
    const newDesc =
      data.description !== undefined ? data.description : raw.description;
    const newMilestoneId =
      data.milestoneId !== undefined ? data.milestoneId : raw.milestone_id;
    const newPriority = data.priority || raw.priority;
    const newStartDate =
      data.startDate !== undefined ? data.startDate : raw.start_date;
    const newDueDate = data.dueDate !== undefined ? data.dueDate : raw.due_date;
    const newEst =
      data.estimatedMinutes !== undefined
        ? data.estimatedMinutes
        : raw.estimated_minutes;
    const newLabels =
      data.labels !== undefined
        ? data.labels
          ? JSON.stringify(data.labels)
          : null
        : raw.labels
          ? typeof raw.labels === "string"
            ? raw.labels
            : JSON.stringify(raw.labels)
          : null;
    const newRefUrl =
      data.referenceUrl !== undefined ? data.referenceUrl : raw.reference_url;

    await pool.query(
      `UPDATE tasks
       SET title = ?, description = ?, milestone_id = ?, priority = ?,
           start_date = ?, due_date = ?, estimated_minutes = ?, labels = ?, reference_url = ?
       WHERE id = ?`,
      [
        newTitle,
        newDesc,
        newMilestoneId || null,
        newPriority,
        newStartDate,
        newDueDate,
        newEst,
        newLabels,
        newRefUrl,
        taskId,
      ],
    );

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.updated",
      entityType: "task",
      entityId: taskId,
      details: {
        taskCode: raw.task_code,
        previousTitle: raw.title,
        newTitle,
      },
      req,
    });

    return this.getTaskById(taskId, actorUser);
  }

  /**
   * Transitions task workflow status
   */
  static async changeTaskStatus(
    taskId,
    newStatus,
    comment = null,
    actorUser,
    req = null,
  ) {
    const raw = await this.getRawTask(taskId);

    // Verify user can change status
    const canChange = await TasksPolicy.canChangeStatus(raw, actorUser);
    if (!canChange) {
      const error = new Error(
        "You do not have permission to change the status of this task",
      );
      error.status = 403;
      error.code = "TASK_STATUS_CHANGE_DENIED";
      throw error;
    }

    const isPrivileged =
      ProjectsPolicy.isGlobalAdmin(actorUser) ||
      (await ProjectsPolicy.canManageProject(raw.project_id, actorUser));

    let targetStatus = typeof newStatus === 'object' && newStatus !== null ? newStatus.status : newStatus;
    let targetComment = (typeof newStatus === 'object' && newStatus !== null ? newStatus.comment : comment) || null;
    let targetColumnStatus = typeof newStatus === 'object' && newStatus !== null ? newStatus.column_status : null;

    // Synchronize status and column_status bidirectionally
    if (!targetStatus && targetColumnStatus) {
      if (targetColumnStatus === 'todo') targetStatus = 'todo';
      else if (targetColumnStatus === 'in_progress') targetStatus = 'in_progress';
      else if (targetColumnStatus === 'client_review') targetStatus = 'in_review';
      else if (targetColumnStatus === 'revision') targetStatus = 'in_progress';
      else if (targetColumnStatus === 'done') targetStatus = 'completed';
      else targetStatus = 'todo';
    }

    let finalColumnStatus = targetColumnStatus;
    if (!finalColumnStatus) {
      if (targetStatus === 'completed') finalColumnStatus = 'done';
      else if (targetStatus === 'in_review') finalColumnStatus = 'client_review';
      else if (targetStatus === 'in_progress') finalColumnStatus = 'in_progress';
      else if (targetStatus === 'todo') finalColumnStatus = 'todo';
      else finalColumnStatus = 'in_progress';
    }

    const isRevision = targetColumnStatus === 'revision';

    // Validate workflow transition
    TasksPolicy.validateWorkflowTransition(
      raw.status,
      targetStatus,
      actorUser,
      isPrivileged,
    );

    let completedAt = raw.completed_at;
    if (targetStatus === "completed") {
      completedAt = new Date();
    } else if (raw.status === "completed") {
      completedAt = null;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        "UPDATE tasks SET status = ?, column_status = ?, completed_at = ?, revision_count = revision_count + ? WHERE id = ?",
        [targetStatus, finalColumnStatus, completedAt, isRevision ? 1 : 0, taskId],
      );

      // Record in status history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, actorUser.id, raw.status, targetStatus, targetComment],
      );

      // Audit Log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: "task.status_changed",
        entityType: "task",
        entityId: taskId,
        details: {
          taskCode: raw.task_code,
          fromStatus: raw.status,
          toStatus: targetStatus,
          columnStatus: finalColumnStatus,
          comment: targetComment,
        },
        req,
      });

      await connection.commit();

      if (targetStatus === 'completed') {
        try {
          await WorkflowEngineService.onTaskCompleted(taskId, actorUser, req);
        } catch (autoErr) {
          console.error('Trigger D evaluation error:', autoErr);
        }
      }

      return this.getTaskById(taskId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Reopens a completed task
   */
  static async reopenTask(taskId, comment = null, actorUser, req = null) {
    return this.changeTaskStatus(
      taskId,
      "in_progress",
      comment || "Task reopened",
      actorUser,
      req,
    );
  }

  /**
   * Archives a task
   */
  static async archiveTask(taskId, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskManage(raw, actorUser);

    await pool.query(
      "UPDATE tasks SET is_archived = TRUE, archived_at = NOW() WHERE id = ?",
      [taskId],
    );

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.archived",
      entityType: "task",
      entityId: taskId,
      details: { taskCode: raw.task_code, title: raw.title },
      req,
    });

    return true;
  }

  /**
   * Deletes a task
   */
  static async deleteTask(taskId, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskManage(raw, actorUser);

    await pool.query("DELETE FROM tasks WHERE id = ?", [taskId]);

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.deleted",
      entityType: "task",
      entityId: taskId,
      details: { taskCode: raw.task_code, title: raw.title },
      req,
    });

    return true;
  }

  /**
   * Replaces task assignees
   */
  static async updateTaskAssignees(taskId, assigneeIds, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskManage(raw, actorUser);

    if (assigneeIds.length > 0) {
      const [userRows] = await pool.query(
        "SELECT id, status FROM users WHERE id IN (?)",
        [assigneeIds],
      );
      if (userRows.length !== assigneeIds.length) {
        const error = new Error("One or more selected assignees do not exist");
        error.status = 400;
        error.code = "INVALID_ASSIGNEES";
        throw error;
      }
      const hasInactive = userRows.some((u) => u.status !== "active");
      if (hasInactive) {
        const error = new Error("Cannot assign inactive users to a task");
        error.status = 400;
        error.code = "INACTIVE_ASSIGNEE";
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query("DELETE FROM task_assignees WHERE task_id = ?", [
        taskId,
      ]);

      for (const uId of assigneeIds) {
        await connection.query(
          `INSERT INTO task_assignees (task_id, user_id, assigned_by)
           VALUES (?, ?, ?)`,
          [taskId, uId, actorUser.id],
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: "task.assignees_updated",
        entityType: "task",
        entityId: taskId,
        details: { assigneeCount: assigneeIds.length },
        req,
      });

      await connection.commit();
      return this.getTaskById(taskId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves subtasks for a task
   */
  static async getTaskSubtasks(taskId, actorUser) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [subtasks] = await pool.query(
      `SELECT t.id, t.task_code, t.title, t.status, t.priority, t.due_date, t.completed_at
       FROM tasks t
       WHERE t.parent_task_id = ?
       ORDER BY t.id ASC`,
      [taskId],
    );

    return subtasks;
  }

  /**
   * Creates a subtask under a parent task
   */
  static async createSubtask(parentTaskId, data, actorUser, req = null) {
    const parent = await this.getRawTask(parentTaskId);
    await TasksPolicy.enforceTaskAccess(parent, actorUser);

    return this.createTask(
      {
        ...data,
        projectId: parent.project_id,
        parentTaskId: parent.id,
      },
      actorUser,
      req,
    );
  }

  /**
   * Comments Operations
   */
  static async getTaskComments(taskId, actorUser) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [comments] = await pool.query(
      `SELECT tc.id, tc.task_id, tc.user_id, tc.comment_text, tc.created_at, tc.updated_at,
              u.name as author_name, u.email as author_email, u.role as author_role
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = ? AND tc.deleted_at IS NULL
       ORDER BY tc.created_at ASC`,
      [taskId],
    );

    return comments;
  }

  static async createComment(taskId, commentText, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [result] = await pool.query(
      `INSERT INTO task_comments (task_id, user_id, comment_text)
       VALUES (?, ?, ?)`,
      [taskId, actorUser.id, commentText.trim()],
    );

    const newCommentId = result.insertId;

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.comment_created",
      entityType: "task",
      entityId: taskId,
      details: { commentId: newCommentId },
      req,
    });

    const [createdRows] = await pool.query(
      `SELECT tc.id, tc.task_id, tc.user_id, tc.comment_text, tc.created_at, tc.updated_at,
              u.name as author_name, u.email as author_email, u.role as author_role
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.id = ?`,
      [newCommentId],
    );

    return createdRows[0];
  }

  static async updateComment(
    taskId,
    commentId,
    commentText,
    actorUser,
    req = null,
  ) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [commentRows] = await pool.query(
      "SELECT * FROM task_comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
      [commentId, taskId],
    );
    if (commentRows.length === 0) {
      const error = new Error("Comment not found");
      error.status = 404;
      error.code = "COMMENT_NOT_FOUND";
      throw error;
    }

    const comment = commentRows[0];
    const isAuthor = Number(comment.user_id) === Number(actorUser.id);
    const canModerate =
      ProjectsPolicy.isGlobalAdmin(actorUser) ||
      (await ProjectsPolicy.canManageProject(raw.project_id, actorUser));

    if (!isAuthor && !canModerate) {
      const error = new Error("You can only edit your own comments");
      error.status = 403;
      error.code = "COMMENT_EDIT_DENIED";
      throw error;
    }

    await pool.query("UPDATE task_comments SET comment_text = ? WHERE id = ?", [
      commentText.trim(),
      commentId,
    ]);

    return {
      ...comment,
      comment_text: commentText.trim(),
    };
  }

  static async deleteComment(taskId, commentId, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [commentRows] = await pool.query(
      "SELECT * FROM task_comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
      [commentId, taskId],
    );
    if (commentRows.length === 0) {
      const error = new Error("Comment not found");
      error.status = 404;
      error.code = "COMMENT_NOT_FOUND";
      throw error;
    }

    const comment = commentRows[0];
    const isAuthor = Number(comment.user_id) === Number(actorUser.id);
    const canModerate =
      ProjectsPolicy.isGlobalAdmin(actorUser) ||
      (await ProjectsPolicy.canManageProject(raw.project_id, actorUser));

    if (!isAuthor && !canModerate) {
      const error = new Error("You can only delete your own comments");
      error.status = 403;
      error.code = "COMMENT_DELETE_DENIED";
      throw error;
    }

    await pool.query(
      "UPDATE task_comments SET deleted_at = NOW() WHERE id = ?",
      [commentId],
    );

    return true;
  }

  /**
   * Attachments Operations
   */
  static async getTaskAttachments(taskId, actorUser) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [attachments] = await pool.query(
      `SELECT ta.id, ta.task_id, ta.uploaded_by, ta.original_filename,
              ta.mime_type, ta.file_size, ta.created_at,
              u.name as uploader_name
       FROM task_attachments ta
       JOIN users u ON ta.uploaded_by = u.id
       WHERE ta.task_id = ? AND ta.deleted_at IS NULL
       ORDER BY ta.created_at DESC`,
      [taskId],
    );

    return attachments;
  }

  static async createAttachment(taskId, fileData, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [result] = await pool.query(
      `INSERT INTO task_attachments (
        task_id, uploaded_by, original_filename, storage_key, mime_type, file_size
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        actorUser.id,
        fileData.originalFilename,
        fileData.storageKey,
        fileData.mimeType,
        fileData.fileSize,
      ],
    );

    const newAttachmentId = result.insertId;

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.attachment_uploaded",
      entityType: "task",
      entityId: taskId,
      details: {
        attachmentId: newAttachmentId,
        filename: fileData.originalFilename,
        fileSize: fileData.fileSize,
      },
      req,
    });

    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE id = ?",
      [newAttachmentId],
    );
    return rows[0];
  }

  static async getAttachmentForDownload(taskId, attachmentId, actorUser) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
      [attachmentId, taskId],
    );
    if (rows.length === 0) {
      const error = new Error("Attachment not found");
      error.status = 404;
      error.code = "ATTACHMENT_NOT_FOUND";
      throw error;
    }

    return rows[0];
  }

  static async deleteAttachment(taskId, attachmentId, actorUser, req = null) {
    const raw = await this.getRawTask(taskId);
    await TasksPolicy.enforceTaskAccess(raw, actorUser);

    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
      [attachmentId, taskId],
    );
    if (rows.length === 0) {
      const error = new Error("Attachment not found");
      error.status = 404;
      error.code = "ATTACHMENT_NOT_FOUND";
      throw error;
    }

    const attachment = rows[0];
    const isUploader = Number(attachment.uploaded_by) === Number(actorUser.id);
    const canManage =
      ProjectsPolicy.isGlobalAdmin(actorUser) ||
      (await ProjectsPolicy.canManageProject(raw.project_id, actorUser));

    if (!isUploader && !canManage) {
      const error = new Error(
        "You do not have permission to delete this attachment",
      );
      error.status = 403;
      error.code = "ATTACHMENT_DELETE_DENIED";
      throw error;
    }

    // Soft delete record
    await pool.query(
      "UPDATE task_attachments SET deleted_at = NOW() WHERE id = ?",
      [attachmentId],
    );

    // Cleanup file from disk safely
    try {
      const uploadDir = path.resolve("uploads", "attachments");
      const filePath = path.join(uploadDir, attachment.storage_key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("Error removing file from disk:", e.message);
    }

    await AuditService.log({
      actorId: actorUser.id,
      action: "task.attachment_deleted",
      entityType: "task",
      entityId: taskId,
      details: { attachmentId, filename: attachment.original_filename },
      req,
    });

    return true;
  }
}
