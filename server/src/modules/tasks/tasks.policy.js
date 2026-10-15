import { pool } from '../../config/db.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';

export class TasksPolicy {
  /**
   * Status workflow state transition matrix
   */
  static WORKFLOW_TRANSITIONS = {
    todo: ['in_progress'],
    in_progress: ['client_review', 'in_review', 'revision', 'blocked', 'completed', 'done'],
    client_review: ['revision', 'in_progress', 'completed', 'done'],
    revision: ['in_progress', 'client_review', 'completed', 'done'],
    in_review: ['client_review', 'revision', 'in_progress', 'completed', 'done'],
    blocked: ['in_progress', 'todo'],
    completed: ['in_progress', 'todo'],
    done: ['in_progress', 'todo']
  };

  /**
   * Verifies if a user has access to view a specific task
   */
  static async canAccessTask(task, user) {
    if (ProjectsPolicy.isGlobalAdmin(user)) return true;

    // Check direct creator or assignee
    if (Number(task.creator_id) === Number(user.id)) return true;
    if (Number(task.assignee_id) === Number(user.id)) return true;

    const [assigneeCheck] = await pool.query(
      'SELECT user_id FROM task_assignees WHERE task_id = ? AND user_id = ?',
      [task.id, user.id]
    );
    if (assigneeCheck.length > 0) return true;

    // Check client-level access if client_id is set
    if (task.client_id) {
      const [clientRows] = await pool.query(
        'SELECT id, account_manager_id, user_id FROM clients WHERE id = ?',
        [task.client_id]
      );
      if (clientRows.length > 0) {
        const client = clientRows[0];
        if (Number(client.account_manager_id) === Number(user.id)) return true;
        if (Number(client.user_id) === Number(user.id) || Number(user.client_id) === Number(client.id)) return true;
      }
    }

    // Check project-level access if project_id is present
    if (task.project_id) {
      const hasProjectAccess = await ProjectsPolicy.canAccessProject(task.project_id, user);
      if (!hasProjectAccess) return false;

      const isPM = await ProjectsPolicy.canManageProject(task.project_id, user);
      if (isPM) return true;

      return true;
    }

    return false;
  }

  /**
   * Verifies if a user can manage / update a task
   */
  static async canManageTask(task, user) {
    if (ProjectsPolicy.isGlobalAdmin(user)) return true;

    // Task creator can manage their own task
    if (Number(task.creator_id) === Number(user.id)) return true;

    // Client's Account Manager can manage tasks on their client
    if (task.client_id) {
      const [clientRows] = await pool.query(
        'SELECT account_manager_id FROM clients WHERE id = ?',
        [task.client_id]
      );
      if (clientRows.length > 0 && Number(clientRows[0].account_manager_id) === Number(user.id)) {
        return true;
      }
    }

    // Project manager can manage any task in project
    if (task.project_id) {
      const isPM = await ProjectsPolicy.canManageProject(task.project_id, user);
      if (isPM) return true;
    }

    return false;
  }

  /**
   * Verifies if a user can update task status (assignees can update their task status)
   */
  static async canChangeStatus(task, user) {
    if (await this.canManageTask(task, user)) return true;

    if (Number(task.assignee_id) === Number(user.id)) return true;

    const [assigneeCheck] = await pool.query(
      'SELECT user_id FROM task_assignees WHERE task_id = ? AND user_id = ?',
      [task.id, user.id]
    );
    return assigneeCheck.length > 0;
  }

  /**
   * Validates workflow transitions and reopening rules
   */
  static validateWorkflowTransition(fromStatus, toStatus, user, isPrivileged) {
    if (fromStatus === toStatus) return true;

    // Reopening rule: from 'completed' or 'done' to any other status
    if (['completed', 'done'].includes(fromStatus)) {
      const canReopen =
        isPrivileged ||
        user.role === 'owner' ||
        (user.permissions && user.permissions.includes('tasks.reopen'));
      if (!canReopen) {
        const error = new Error('You do not have permission to reopen completed tasks');
        error.status = 403;
        error.code = 'REOPEN_TASK_DENIED';
        throw error;
      }
    }

    if (isPrivileged) return true;

    const allowedNext = this.WORKFLOW_TRANSITIONS[fromStatus] || [];
    if (!allowedNext.includes(toStatus)) {
      const error = new Error(
        `Invalid status transition from '${fromStatus}' to '${toStatus}'. Allowed transitions: ${allowedNext.join(', ') || 'none'}`
      );
      error.status = 409;
      error.code = 'INVALID_STATUS_TRANSITION';
      throw error;
    }

    return true;
  }

  static async enforceTaskAccess(task, user) {
    const allowed = await this.canAccessTask(task, user);
    if (!allowed) {
      const error = new Error('Access denied to this task');
      error.status = 403;
      error.code = 'TASK_ACCESS_DENIED';
      throw error;
    }
  }

  static async enforceTaskManagement(task, user) {
    const allowed = await this.canManageTask(task, user);
    if (!allowed) {
      const error = new Error('You do not have permission to manage this task');
      error.status = 403;
      error.code = 'TASK_MANAGE_DENIED';
      throw error;
    }
  }

  static async enforceTaskManage(task, user) {
    return this.enforceTaskManagement(task, user);
  }
}
