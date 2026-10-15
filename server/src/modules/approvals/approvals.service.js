import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export class ApprovalsService {
  /**
   * Helper to retrieve task and project details for approval operations
   */
  static async getTaskWithProject(taskId, db = pool) {
    const [rows] = await db.query(
      `SELECT t.id, t.task_code, t.title, t.status, t.project_id, t.is_archived,
              p.name AS project_name, p.project_manager_id, p.client_id, p.visibility, p.status AS project_status
       FROM tasks t
       INNER JOIN projects p ON t.project_id = p.id
       WHERE t.id = ?`,
      [taskId]
    );

    return rows[0] || null;
  }

  /**
   * Submits a task for review and creates a pending approval record
   */
  static async submitReview(taskId, submitterUser, { submissionNotes = null } = {}, req = null) {
    const task = await this.getTaskWithProject(taskId);
    if (!task) {
      const error = new Error('Task not found');
      error.status = 404;
      error.code = 'TASK_NOT_FOUND';
      throw error;
    }

    if (task.is_archived) {
      const error = new Error('Cannot submit archived tasks for review');
      error.status = 400;
      error.code = 'TASK_ARCHIVED';
      throw error;
    }

    // Access check
    const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, submitterUser);

    if (!canAccess) {
      const error = new Error('Access denied to this project and task');
      error.status = 403;
      error.code = 'PROJECT_ACCESS_DENIED';
      throw error;
    }

    // Task must be in_progress or todo to enter review
    if (task.status === 'in_review') {
      const error = new Error('Task is already currently in review');
      error.status = 409;
      error.code = 'APPROVAL_ALREADY_PENDING';
      throw error;
    }

    if (task.status === 'completed') {
      const error = new Error('Task is already completed. Please reopen the task before submitting for review.');
      error.status = 409;
      error.code = 'TASK_ALREADY_COMPLETED';
      throw error;
    }

    // Check if there is already a pending approval record
    const [existingPending] = await pool.query(
      `SELECT id FROM task_approvals WHERE task_id = ? AND status = 'pending'`,
      [taskId]
    );

    if (existingPending.length > 0) {
      const error = new Error('A pending approval request already exists for this task');
      error.status = 409;
      error.code = 'APPROVAL_ALREADY_PENDING';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update task status to in_review
      await connection.query(
        `UPDATE tasks SET status = 'in_review' WHERE id = ?`,
        [taskId]
      );

      // 2. Insert into task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, ?, 'in_review', ?)`,
        [taskId, submitterUser.id, task.status, submissionNotes || 'Submitted for review']
      );

      // 3. Create task_approvals record
      const [res] = await connection.query(
        `INSERT INTO task_approvals (
           task_id, submitted_by, status, submission_notes, submitted_at
         ) VALUES (?, ?, 'pending', ?, NOW())`,
        [taskId, submitterUser.id, submissionNotes]
      );

      const approvalId = res.insertId;

      // 4. Resolve reviewer recipients: Project Manager or managers on the project
      const reviewerIds = new Set();
      if (task.project_manager_id && task.project_manager_id !== submitterUser.id) {
        reviewerIds.add(task.project_manager_id);
      }

      // If submitter is PM or PM is missing, notify project members with role 'Project Manager' or 'Owner'
      if (reviewerIds.size === 0) {
        const [managers] = await connection.query(
          `SELECT u.id
           FROM users u
           INNER JOIN user_roles ur ON u.id = ur.user_id
           INNER JOIN roles r ON ur.role_id = r.id
           WHERE r.slug IN ('owner', 'project-manager') AND u.id != ? AND u.status = 'active'`,
          [submitterUser.id]
        );
        managers.forEach((m) => reviewerIds.add(m.id));
      }

      // 5. Send notifications to eligible reviewers
      for (const revId of reviewerIds) {
        await NotificationsService.createNotification({
          recipientUserId: revId,
          actorUserId: submitterUser.id,
          type: 'review_requested',
          title: `Review Requested: #${task.task_code}`,
          message: `${submitterUser.name} submitted task "${task.title}" for review.`,
          entityType: 'approval',
          entityId: approvalId,
          actionUrl: `/tasks/${taskId}`,
          db: connection
        });
      }

      // 6. Security Audit log
      await AuditService.log({
        db: connection,
        actorId: submitterUser.id,
        action: 'task.submitted_for_review',
        entityType: 'task',
        entityId: taskId,
        details: {
          taskCode: task.task_code,
          approvalId,
          submissionNotes
        },
        req
      });

      await connection.commit();

      const [approvalRows] = await connection.query(
        `SELECT ta.*, u.name AS submitter_name, u.email AS submitter_email
         FROM task_approvals ta
         INNER JOIN users u ON ta.submitted_by = u.id
         WHERE ta.id = ?`,
        [approvalId]
      );

      return approvalRows[0];
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Approves a pending task submission and marks task completed
   */
  static async approve(approvalId, reviewerUser, { feedback = null } = {}, req = null) {
    const [approvalRows] = await pool.query(
      `SELECT ta.*, t.task_code, t.title, t.project_id, t.status AS task_status,
              p.project_manager_id, p.client_id, p.visibility,
              sub.name AS submitter_name, sub.email AS submitter_email
       FROM task_approvals ta
       INNER JOIN tasks t ON ta.task_id = t.id
       INNER JOIN projects p ON t.project_id = p.id
       INNER JOIN users sub ON ta.submitted_by = sub.id
       WHERE ta.id = ?`,
      [approvalId]
    );

    const approval = approvalRows[0];
    if (!approval) {
      const error = new Error('Approval request not found');
      error.status = 404;
      error.code = 'APPROVAL_NOT_FOUND';
      throw error;
    }

    if (approval.status !== 'pending') {
      const error = new Error(`Cannot approve a submission that is already ${approval.status}`);
      error.status = 409;
      error.code = 'INVALID_APPROVAL_STATE';
      throw error;
    }

    // Access check
    const canAccess = await ProjectsPolicy.canAccessProject(approval.project_id, reviewerUser);

    if (!canAccess) {
      const error = new Error('Access denied to this project and task');
      error.status = 403;
      error.code = 'PROJECT_ACCESS_DENIED';
      throw error;
    }

    // Self-approval check: User must not approve their own submission
    const isOwner = reviewerUser.is_owner || reviewerUser.roles?.some((r) => r.slug === 'owner');
    if (approval.submitted_by === reviewerUser.id && !isOwner) {
      const error = new Error('Reviewers cannot approve their own task submissions');
      error.status = 403;
      error.code = 'CANNOT_APPROVE_OWN_SUBMISSION';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update task_approvals record
      await connection.query(
        `UPDATE task_approvals
         SET status = 'approved',
             reviewer_id = ?,
             reviewer_feedback = ?,
             reviewed_at = NOW()
         WHERE id = ?`,
        [reviewerUser.id, feedback, approvalId]
      );

      // 2. Transition task to completed
      await connection.query(
        `UPDATE tasks
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = ?`,
        [approval.task_id]
      );

      // 3. Record task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'in_review', 'completed', ?)`,
        [approval.task_id, reviewerUser.id, feedback || 'Submission approved']
      );

      // 4. Notify submitter
      await NotificationsService.createNotification({
        recipientUserId: approval.submitted_by,
        actorUserId: reviewerUser.id,
        type: 'task_approved',
        title: `Task Approved: #${approval.task_code}`,
        message: `${reviewerUser.name} approved task "${approval.title}".`,
        entityType: 'task',
        entityId: approval.task_id,
        actionUrl: `/tasks/${approval.task_id}`,
        db: connection
      });

      // 5. Security Audit Log
      await AuditService.log({
        db: connection,
        actorId: reviewerUser.id,
        action: 'task.approval_approved',
        entityType: 'task',
        entityId: approval.task_id,
        details: {
          approvalId,
          taskCode: approval.task_code,
          feedback
        },
        req
      });

      await connection.commit();

      const [updatedRows] = await connection.query(
        `SELECT ta.*, u.name AS reviewer_name, u.email AS reviewer_email
         FROM task_approvals ta
         LEFT JOIN users u ON ta.reviewer_id = u.id
         WHERE ta.id = ?`,
        [approvalId]
      );

      return updatedRows[0];
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Requests revisions on a pending task submission and sends task back to in_progress
   */
  static async requestRevision(approvalId, reviewerUser, { reviewerFeedback }, req = null) {
    if (!reviewerFeedback || reviewerFeedback.trim().length < 5) {
      const error = new Error('Revision feedback explaining required changes is required');
      error.status = 400;
      error.code = 'REVISION_FEEDBACK_REQUIRED';
      throw error;
    }

    const [approvalRows] = await pool.query(
      `SELECT ta.*, t.task_code, t.title, t.project_id, t.status AS task_status,
              p.project_manager_id, p.client_id, p.visibility,
              sub.name AS submitter_name, sub.email AS submitter_email
       FROM task_approvals ta
       INNER JOIN tasks t ON ta.task_id = t.id
       INNER JOIN projects p ON t.project_id = p.id
       INNER JOIN users sub ON ta.submitted_by = sub.id
       WHERE ta.id = ?`,
      [approvalId]
    );

    const approval = approvalRows[0];
    if (!approval) {
      const error = new Error('Approval request not found');
      error.status = 404;
      error.code = 'APPROVAL_NOT_FOUND';
      throw error;
    }

    if (approval.status !== 'pending') {
      const error = new Error(`Cannot request revisions on a submission that is already ${approval.status}`);
      error.status = 409;
      error.code = 'INVALID_APPROVAL_STATE';
      throw error;
    }

    // Access check
    const canAccess = await ProjectsPolicy.canAccessProject(approval.project_id, reviewerUser);

    if (!canAccess) {
      const error = new Error('Access denied to this project and task');
      error.status = 403;
      error.code = 'PROJECT_ACCESS_DENIED';
      throw error;
    }

    // Self-review prevention
    const isOwner = reviewerUser.is_owner || reviewerUser.roles?.some((r) => r.slug === 'owner');
    if (approval.submitted_by === reviewerUser.id && !isOwner) {
      const error = new Error('Reviewers cannot request revisions on their own task submissions');
      error.status = 403;
      error.code = 'CANNOT_REVIEW_OWN_SUBMISSION';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update task_approvals record
      await connection.query(
        `UPDATE task_approvals
         SET status = 'revision_requested',
             reviewer_id = ?,
             reviewer_feedback = ?,
             reviewed_at = NOW()
         WHERE id = ?`,
        [reviewerUser.id, reviewerFeedback.trim(), approvalId]
      );

      // 2. Transition task back to in_progress
      await connection.query(
        `UPDATE tasks
         SET status = 'in_progress'
         WHERE id = ?`,
        [approval.task_id]
      );

      // 3. Record task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'in_review', 'in_progress', ?)`,
        [approval.task_id, reviewerUser.id, `Revision requested: ${reviewerFeedback.trim()}`]
      );

      // 4. Notify submitter
      await NotificationsService.createNotification({
        recipientUserId: approval.submitted_by,
        actorUserId: reviewerUser.id,
        type: 'revision_requested',
        title: `Revisions Requested: #${approval.task_code}`,
        message: `${reviewerUser.name} requested revisions on "${approval.title}": ${reviewerFeedback.trim()}`,
        entityType: 'task',
        entityId: approval.task_id,
        actionUrl: `/tasks/${approval.task_id}`,
        db: connection
      });

      // 5. Security Audit Log
      await AuditService.log({
        db: connection,
        actorId: reviewerUser.id,
        action: 'task.revision_requested',
        entityType: 'task',
        entityId: approval.task_id,
        details: {
          approvalId,
          taskCode: approval.task_code,
          reviewerFeedback: reviewerFeedback.trim()
        },
        req
      });

      await connection.commit();

      const [updatedRows] = await connection.query(
        `SELECT ta.*, u.name AS reviewer_name, u.email AS reviewer_email
         FROM task_approvals ta
         LEFT JOIN users u ON ta.reviewer_id = u.id
         WHERE ta.id = ?`,
        [approvalId]
      );

      return updatedRows[0];
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Cancels a pending review request and returns the task to in_progress
   */
  static async cancel(approvalId, actorUser, req = null) {
    const [approvalRows] = await pool.query(
      `SELECT ta.*, t.task_code, t.title, t.project_id, t.status AS task_status,
              p.project_manager_id, p.client_id, p.visibility
       FROM task_approvals ta
       INNER JOIN tasks t ON ta.task_id = t.id
       INNER JOIN projects p ON t.project_id = p.id
       WHERE ta.id = ?`,
      [approvalId]
    );

    const approval = approvalRows[0];
    if (!approval) {
      const error = new Error('Approval request not found');
      error.status = 404;
      error.code = 'APPROVAL_NOT_FOUND';
      throw error;
    }

    if (approval.status !== 'pending') {
      const error = new Error(`Cannot cancel a submission that is already ${approval.status}`);
      error.status = 409;
      error.code = 'INVALID_APPROVAL_STATE';
      throw error;
    }

    const isOwner = actorUser.is_owner || actorUser.roles?.some((r) => r.slug === 'owner');
    const isSubmitter = approval.submitted_by === actorUser.id;
    const isPM = approval.project_manager_id === actorUser.id;

    if (!isSubmitter && !isPM && !isOwner) {
      const error = new Error('Only the submitter or authorized project manager can cancel a review request');
      error.status = 403;
      error.code = 'UNAUTHORIZED_CANCEL';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE task_approvals SET status = 'cancelled' WHERE id = ?`,
        [approvalId]
      );

      await connection.query(
        `UPDATE tasks SET status = 'in_progress' WHERE id = ?`,
        [approval.task_id]
      );

      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'in_review', 'in_progress', 'Review request cancelled')`,
        [approval.task_id, actorUser.id]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'task.approval_cancelled',
        entityType: 'task',
        entityId: approval.task_id,
        details: { approvalId, taskCode: approval.task_code },
        req
      });

      await connection.commit();

      const [updatedRows] = await connection.query(
        'SELECT * FROM task_approvals WHERE id = ?',
        [approvalId]
      );

      return updatedRows[0];
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves all approvals for a task
   */
  static async getApprovals(taskId, user) {
    const task = await this.getTaskWithProject(taskId);
    if (!task) {
      const error = new Error('Task not found');
      error.status = 404;
      error.code = 'TASK_NOT_FOUND';
      throw error;
    }

    const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, user);

    if (!canAccess) {
      const error = new Error('Access denied to this project and task');
      error.status = 403;
      error.code = 'PROJECT_ACCESS_DENIED';
      throw error;
    }

    const [rows] = await pool.query(
      `SELECT ta.*,
              sub.name AS submitter_name, sub.email AS submitter_email,
              rev.name AS reviewer_name, rev.email AS reviewer_email
       FROM task_approvals ta
       INNER JOIN users sub ON ta.submitted_by = sub.id
       LEFT JOIN users rev ON ta.reviewer_id = rev.id
       WHERE ta.task_id = ?
       ORDER BY ta.created_at DESC`,
      [taskId]
    );

    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      submittedBy: r.submitted_by,
      submitterName: r.submitter_name,
      submitterEmail: r.submitter_email,
      reviewerId: r.reviewer_id,
      reviewerName: r.reviewer_name,
      reviewerEmail: r.reviewer_email,
      status: r.status,
      submissionNotes: r.submission_notes,
      reviewerFeedback: r.reviewer_feedback,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * Retrieves full chronological approval history with all revision rounds
   */
  static async getApprovalHistory(taskId, user) {
    return this.getApprovals(taskId, user);
  }
}
