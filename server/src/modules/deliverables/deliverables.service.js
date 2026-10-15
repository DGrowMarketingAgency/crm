import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WorkflowEngineService } from '../automation/workflow-engine.service.js';
import path from 'path';
import fs from 'fs';

export class DeliverablesService {
  /**
   * Helper to retrieve task with project and client info
   */
  static async getTaskWithContext(taskId, db = pool) {
    const [rows] = await db.query(
      `SELECT t.*, 
              p.name AS project_name, p.project_manager_id, p.visibility, p.status AS project_status,
              c.name AS client_name, c.account_manager_id,
              u.name AS assignee_name, u.email AS assignee_email
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.id = ?`,
      [taskId]
    );
    return rows[0] || null;
  }

  /**
   * Helper to retrieve submission with full context
   */
  static async getSubmissionById(submissionId, db = pool) {
    const [rows] = await db.query(
      `SELECT ds.*, 
              t.task_code, t.title AS task_title, t.status AS task_status, t.column_status AS task_column_status,
              t.is_client_deliverable, t.requires_client_approval AS task_requires_client_approval,
              t.revision_count, t.assignee_id,
              p.name AS project_name, p.project_manager_id,
              c.name AS client_name, c.account_manager_id,
              sub.name AS submitter_name, sub.email AS submitter_email,
              int_rev.name AS internal_reviewer_name, int_rev.email AS internal_reviewer_email,
              cli_rev.name AS client_reviewer_name, cli_rev.email AS client_reviewer_email
       FROM deliverable_submissions ds
       INNER JOIN tasks t ON ds.task_id = t.id
       LEFT JOIN projects p ON ds.project_id = p.id
       LEFT JOIN clients c ON ds.client_id = c.id
       LEFT JOIN users sub ON ds.submitted_by = sub.id
       LEFT JOIN users int_rev ON ds.internal_reviewer_id = int_rev.id
       LEFT JOIN users cli_rev ON ds.client_reviewer_id = cli_rev.id
       WHERE ds.id = ?`,
      [submissionId]
    );
    return rows[0] || null;
  }

  /**
   * 1. Submit work for internal review (Employee Step)
   */
  static async submitForInternalReview({
    taskId,
    title,
    deliverableType = 'document',
    deliverableUrl = null,
    file = null,
    submissionNotes = null
  }, actorUser, req = null) {
    const task = await this.getTaskWithContext(taskId);
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

    // Authorization: User must have access to project and not be an external client
    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient) {
      const error = new Error('Client users cannot submit tasks for internal review');
      error.status = 403;
      error.code = 'CLIENT_CANNOT_SUBMIT_INTERNAL';
      throw error;
    }

    if (task.project_id) {
      const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, actorUser);
      if (!canAccess && task.assignee_id !== actorUser.id) {
        const error = new Error('Access denied to this project and task');
        error.status = 403;
        error.code = 'PROJECT_ACCESS_DENIED';
        throw error;
      }
    }

    // Non-owner / non-manager cannot submit work on another employee's behalf unless assigned or authorized
    const isOwner = actorUser.is_owner || actorUser.roles?.some((r) => r.slug === 'owner');
    const isManager = actorUser.roles?.some((r) => ['admin', 'project-manager', 'account-manager', 'team-leader'].includes(r.slug));
    if (task.assignee_id && task.assignee_id !== actorUser.id && !isOwner && !isManager) {
      const error = new Error('Unauthorized: You cannot submit work on behalf of another assigned employee');
      error.status = 403;
      error.code = 'UNAUTHORIZED_SUBMISSION';
      throw error;
    }

    // Task cannot already be in review with active pending internal review
    if (task.status === 'in_review') {
      const [existingPending] = await pool.query(
        `SELECT id FROM deliverable_submissions WHERE task_id = ? AND internal_review_status = 'pending'`,
        [taskId]
      );
      if (existingPending.length > 0) {
        const error = new Error('Task is already currently in internal review');
        error.status = 409;
        error.code = 'APPROVAL_ALREADY_PENDING';
        throw error;
      }
    }

    if (task.status === 'completed') {
      const error = new Error('Task is already completed. Please reopen the task before submitting new work.');
      error.status = 409;
      error.code = 'TASK_ALREADY_COMPLETED';
      throw error;
    }

    // Validate mandatory deliverables if configured
    if (task.requires_deliverable && !file && !deliverableUrl && !task.deliverable_url) {
      const error = new Error(`A deliverable file or URL is required for this task (expected type: ${task.expected_deliverable_type || 'document'})`);
      error.status = 400;
      error.code = 'DELIVERABLE_REQUIRED';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Determine next version number
      const [vRows] = await connection.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM deliverable_submissions WHERE task_id = ?`,
        [taskId]
      );
      const versionNumber = Number(vRows[0].next_version) || 1;

      // Determine client approval requirement flag
      const requiresClientApproval = Boolean(task.requires_client_approval || task.is_client_deliverable);

      // File metadata
      const filePath = file ? file.path : null;
      const fileName = file ? file.originalname : null;
      const fileSize = file ? file.size : null;
      const fileMimeType = file ? file.mimetype : null;
      const effectiveDeliverableUrl = deliverableUrl || task.deliverable_url || null;

      // 1. Create deliverable_submissions record
      const [insRes] = await connection.query(
        `INSERT INTO deliverable_submissions (
          task_id, client_id, project_id, service_instance_id,
          version_number, deliverable_type, title,
          deliverable_url, file_path, file_name, file_size, file_mime_type,
          submission_notes, submitted_by, submitted_at,
          internal_review_status, requires_client_approval, client_approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'pending', ?, 'not_required')`,
        [
          taskId,
          task.client_id || 1, // Fallback to client 1 if orphan
          task.project_id || null,
          task.service_instance_id || null,
          versionNumber,
          deliverableType || task.expected_deliverable_type || 'document',
          title || task.title,
          effectiveDeliverableUrl,
          filePath,
          fileName,
          fileSize,
          fileMimeType,
          submissionNotes,
          actorUser.id,
          requiresClientApproval
        ]
      );
      const submissionId = insRes.insertId;

      // 2. Resolve any existing open revision requests for this task
      await connection.query(
        `UPDATE deliverable_revision_requests 
         SET status = 'resolved', resolved_in_submission_id = ?
         WHERE task_id = ? AND status = 'open'`,
        [submissionId, taskId]
      );

      // 3. Update task status & pointer to current submission
      await connection.query(
        `UPDATE tasks 
         SET status = 'in_review', column_status = 'client_review', current_submission_id = ?
         WHERE id = ?`,
        [submissionId, taskId]
      );

      // 4. Record task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, ?, 'in_review', ?)`,
        [
          taskId,
          actorUser.id,
          task.status,
          submissionNotes ? `Submitted for internal review (v${versionNumber}): ${submissionNotes}` : `Submitted for internal review (v${versionNumber})`
        ]
      );

      // 5. Backwards compatibility sync with task_approvals
      await connection.query(
        `INSERT INTO task_approvals (task_id, submitted_by, status, submission_notes, submitted_at)
         VALUES (?, ?, 'pending', ?, NOW())`,
        [taskId, actorUser.id, submissionNotes || `Deliverable v${versionNumber} submitted`]
      );

      // 6. Notifications: find authorized internal reviewers (AM, PM, Team Lead)
      const reviewerIds = new Set();
      if (task.account_manager_id && task.account_manager_id !== actorUser.id) {
        reviewerIds.add(task.account_manager_id);
      }
      if (task.project_manager_id && task.project_manager_id !== actorUser.id) {
        reviewerIds.add(task.project_manager_id);
      }
      if (task.internal_reviewer_id && task.internal_reviewer_id !== actorUser.id) {
        reviewerIds.add(task.internal_reviewer_id);
      }

      // If no reviewer resolved, pick active owners and project managers
      if (reviewerIds.size === 0) {
        const [managers] = await connection.query(
          `SELECT u.id FROM users u
           INNER JOIN user_roles ur ON u.id = ur.user_id
           INNER JOIN roles r ON ur.role_id = r.id
           WHERE r.slug IN ('owner', 'project-manager', 'account-manager') 
             AND u.id != ? AND u.status = 'active'
           LIMIT 5`,
          [actorUser.id]
        );
        managers.forEach((m) => reviewerIds.add(m.id));
      }

      for (const revId of reviewerIds) {
        await NotificationsService.createNotification({
          recipientUserId: revId,
          actorUserId: actorUser.id,
          type: 'review_requested',
          title: `Internal Review: #${task.task_code} (v${versionNumber})`,
          message: `${actorUser.name} submitted deliverable for "${task.title}".`,
          entityType: 'deliverable',
          entityId: submissionId,
          actionUrl: `/tasks/${taskId}`,
          db: connection
        });
      }

      // 7. Security Audit log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'deliverable.submitted_for_internal_review',
        entityType: 'task',
        entityId: taskId,
        details: {
          taskCode: task.task_code,
          submissionId,
          versionNumber,
          deliverableType,
          submissionNotes
        },
        req
      });

      await connection.commit();

      return await this.getSubmissionById(submissionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * 2. Internal Review Decision (Account Manager / Reviewer Step)
   */
  static async reviewInternal(submissionId, { decision, feedback = null }, actorUser, req = null) {
    if (!['approved', 'changes_requested'].includes(decision)) {
      const error = new Error('Invalid internal review decision. Must be "approved" or "changes_requested"');
      error.status = 400;
      error.code = 'INVALID_REVIEW_DECISION';
      throw error;
    }

    const submission = await this.getSubmissionById(submissionId);
    if (!submission) {
      const error = new Error('Deliverable submission not found');
      error.status = 404;
      error.code = 'SUBMISSION_NOT_FOUND';
      throw error;
    }

    if (submission.internal_review_status !== 'pending') {
      const error = new Error(`Cannot review a submission that is already ${submission.internal_review_status}`);
      error.status = 409;
      error.code = 'INVALID_SUBMISSION_STATE';
      throw error;
    }

    // Prevent clients from performing internal review
    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient) {
      const error = new Error('Client users are not authorized to perform internal agency reviews');
      error.status = 403;
      error.code = 'CLIENT_CANNOT_REVIEW_INTERNAL';
      throw error;
    }

    // Access check: reviewer must have project/client access
    if (submission.project_id) {
      const canAccess = await ProjectsPolicy.canAccessProject(submission.project_id, actorUser);
      if (!canAccess) {
        const error = new Error('Access denied to this project and deliverable');
        error.status = 403;
        error.code = 'PROJECT_ACCESS_DENIED';
        throw error;
      }
    }

    // Self-approval prohibition
    const isOwner = actorUser.is_owner || actorUser.roles?.some((r) => r.slug === 'owner');
    if (submission.submitted_by === actorUser.id && !isOwner) {
      const error = new Error('Reviewers cannot approve or review their own task submissions');
      error.status = 403;
      error.code = 'CANNOT_APPROVE_OWN_SUBMISSION';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (decision === 'changes_requested') {
        // A. Changes Requested Internally: return task to rework
        await connection.query(
          `UPDATE deliverable_submissions
           SET internal_review_status = 'changes_requested',
               internal_reviewer_id = ?,
               internal_review_feedback = ?,
               internal_reviewed_at = NOW()
           WHERE id = ?`,
          [actorUser.id, feedback, submissionId]
        );

        // Create revision request record
        await connection.query(
          `INSERT INTO deliverable_revision_requests (
            submission_id, task_id, revision_cycle,
            requested_by_type, requested_by_user_id, revision_reason, status
          ) VALUES (?, ?, ?, 'internal_reviewer', ?, ?, 'open')`,
          [
            submissionId,
            submission.task_id,
            submission.version_number,
            actorUser.id,
            feedback || 'Changes requested during internal review'
          ]
        );

        // Move task into rework status: in_progress with column_status revision
        await connection.query(
          `UPDATE tasks 
           SET status = 'in_progress', column_status = 'revision', revision_count = revision_count + 1
           WHERE id = ?`,
          [submission.task_id]
        );

        // Record history
        await connection.query(
          `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
           VALUES (?, ?, 'in_review', 'in_progress', ?)`,
          [submission.task_id, actorUser.id, `Internal review requested changes: ${feedback || 'Please update and resubmit.'}`]
        );

        // Sync legacy task_approvals
        await connection.query(
          `UPDATE task_approvals 
           SET status = 'revision_requested', reviewer_id = ?, reviewer_feedback = ?, reviewed_at = NOW()
           WHERE task_id = ? AND status = 'pending'`,
          [actorUser.id, feedback, submission.task_id]
        );

        // Notify assigned employee / submitter
        await NotificationsService.createNotification({
          recipientUserId: submission.submitted_by,
          actorUserId: actorUser.id,
          type: 'changes_requested',
          title: `Changes Requested: #${submission.task_code}`,
          message: `${actorUser.name} requested changes on deliverable "${submission.title}": ${feedback || 'Please review notes.'}`,
          entityType: 'deliverable',
          entityId: submissionId,
          actionUrl: `/tasks/${submission.task_id}`,
          db: connection
        });

        // Audit log
        await AuditService.log({
          db: connection,
          actorId: actorUser.id,
          action: 'deliverable.internal_changes_requested',
          entityType: 'task',
          entityId: submission.task_id,
          details: {
            submissionId,
            feedback
          },
          req
        });
      } else {
        // B. Internally Approved
        const requiresClient = Boolean(submission.requires_client_approval || submission.task_requires_client_approval || submission.is_client_deliverable);

        if (requiresClient) {
          // Client approval IS required:
          // Set submission client approval status to 'pending', task remains 'in_review' / 'client_review'
          await connection.query(
            `UPDATE deliverable_submissions
             SET internal_review_status = 'approved',
                 internal_reviewer_id = ?,
                 internal_review_feedback = ?,
                 internal_reviewed_at = NOW(),
                 requires_client_approval = TRUE,
                 client_approval_status = 'pending'
             WHERE id = ?`,
            [actorUser.id, feedback, submissionId]
          );

          await connection.query(
            `UPDATE tasks 
             SET status = 'in_review', column_status = 'client_review'
             WHERE id = ?`,
            [submission.task_id]
          );

          await connection.query(
            `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
             VALUES (?, ?, 'in_review', 'in_review', ?)`,
            [submission.task_id, actorUser.id, 'Internal review approved; deliverable submitted for client approval']
          );

          // Notify client portal users
          if (submission.client_id) {
            const [clientUsers] = await connection.query(
              `SELECT u.id FROM users u
               WHERE u.client_id = ? AND u.status = 'active'`,
              [submission.client_id]
            );

            for (const cu of clientUsers) {
              await NotificationsService.createNotification({
                recipientUserId: cu.id,
                actorUserId: actorUser.id,
                type: 'client_deliverable_ready',
                title: `Deliverable Ready for Approval: ${submission.title}`,
                message: `New deliverable "${submission.title}" (v${submission.version_number}) is awaiting your approval.`,
                entityType: 'deliverable',
                entityId: submissionId,
                actionUrl: `/clients/${submission.client_id}`,
                db: connection
              });
            }
          }

          // Notify employee that internal review passed
          await NotificationsService.createNotification({
            recipientUserId: submission.submitted_by,
            actorUserId: actorUser.id,
            type: 'task_approved',
            title: `Internally Approved: #${submission.task_code}`,
            message: `${actorUser.name} internally approved deliverable "${submission.title}". Awaiting client approval.`,
            entityType: 'deliverable',
            entityId: submissionId,
            actionUrl: `/tasks/${submission.task_id}`,
            db: connection
          });

          // Audit log
          await AuditService.log({
            db: connection,
            actorId: actorUser.id,
            action: 'deliverable.internally_approved_client_pending',
            entityType: 'task',
            entityId: submission.task_id,
            details: {
              submissionId,
              requiresClientApproval: true,
              feedback
            },
            req
          });
        } else {
          // Client approval NOT required (Internal task completion flow)
          await connection.query(
            `UPDATE deliverable_submissions
             SET internal_review_status = 'approved',
                 internal_reviewer_id = ?,
                 internal_review_feedback = ?,
                 internal_reviewed_at = NOW(),
                 client_approval_status = 'not_required'
             WHERE id = ?`,
            [actorUser.id, feedback, submissionId]
          );

          // Mark task completed
          await connection.query(
            `UPDATE tasks 
             SET status = 'completed', column_status = 'done', completed_at = NOW()
             WHERE id = ?`,
            [submission.task_id]
          );

          await connection.query(
            `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
             VALUES (?, ?, 'in_review', 'completed', ?)`,
            [submission.task_id, actorUser.id, feedback || 'Internal review approved; task completed (no client approval required)']
          );

          // Sync legacy task_approvals
          await connection.query(
            `UPDATE task_approvals 
             SET status = 'approved', reviewer_id = ?, reviewer_feedback = ?, reviewed_at = NOW()
             WHERE task_id = ? AND status = 'pending'`,
            [actorUser.id, feedback, submission.task_id]
          );

          // Notify submitter / employee
          await NotificationsService.createNotification({
            recipientUserId: submission.submitted_by,
            actorUserId: actorUser.id,
            type: 'task_approved',
            title: `Task Approved & Completed: #${submission.task_code}`,
            message: `${actorUser.name} approved task "${submission.title}". Work is marked completed.`,
            entityType: 'task',
            entityId: submission.task_id,
            actionUrl: `/tasks/${submission.task_id}`,
            db: connection
          });

          // Audit log
          await AuditService.log({
            db: connection,
            actorId: actorUser.id,
            action: 'deliverable.internally_approved_completed',
            entityType: 'task',
            entityId: submission.task_id,
            details: {
              submissionId,
              requiresClientApproval: false,
              feedback
            },
            req
          });
        }
      }

      await connection.commit();

      // Trigger automated workflow dependency resolution after transaction is committed
      if (decision === 'approved' && !submission.requires_client_approval) {
        try {
          await WorkflowEngineService.onTaskCompleted(submission.task_id, actorUser, req);
        } catch (autoErr) {
          console.error('Trigger D evaluation error on internal approval:', autoErr);
        }
      }

      return await this.getSubmissionById(submissionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * 3. Client Approves Deliverable (Client Portal Step)
   */
  static async clientApprove(submissionId, { feedback = null }, actorUser, req = null) {
    const submission = await this.getSubmissionById(submissionId);
    if (!submission) {
      const error = new Error('Deliverable submission not found');
      error.status = 404;
      error.code = 'SUBMISSION_NOT_FOUND';
      throw error;
    }

    // Client Tenant Isolation Check:
    // If actor is client, client_id must match submission.client_id
    const isOwner = actorUser.is_owner || actorUser.roles?.some((r) => r.slug === 'owner');
    if (actorUser.client_id && Number(actorUser.client_id) !== Number(submission.client_id)) {
      const error = new Error('Access denied: You cannot view or approve deliverables belonging to another client');
      error.status = 403;
      error.code = 'CLIENT_ISOLATION_VIOLATION';
      throw error;
    }

    // Check that internal review is already approved
    if (submission.internal_review_status !== 'approved') {
      const error = new Error('Cannot perform client approval before mandatory internal review is completed and approved');
      error.status = 400;
      error.code = 'INTERNAL_REVIEW_PENDING';
      throw error;
    }

    // Check deliverable is awaiting client approval
    if (submission.client_approval_status !== 'pending') {
      const error = new Error(`Cannot approve deliverable that is currently ${submission.client_approval_status}`);
      error.status = 409;
      error.code = 'INVALID_CLIENT_APPROVAL_STATE';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update submission client approval record
      await connection.query(
        `UPDATE deliverable_submissions
         SET client_approval_status = 'approved',
             client_reviewer_id = ?,
             client_feedback = ?,
             client_reviewed_at = NOW()
         WHERE id = ?`,
        [actorUser.id, feedback, submissionId]
      );

      // 2. Complete task
      await connection.query(
        `UPDATE tasks 
         SET status = 'completed', column_status = 'done', completed_at = NOW()
         WHERE id = ?`,
        [submission.task_id]
      );

      // 3. Record task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'in_review', 'completed', ?)`,
        [submission.task_id, actorUser.id, feedback ? `Client approved deliverable: ${feedback}` : 'Client approved deliverable.']
      );

      // 4. Sync task_approvals
      await connection.query(
        `UPDATE task_approvals 
         SET status = 'approved', reviewer_id = ?, reviewer_feedback = ?, reviewed_at = NOW()
         WHERE task_id = ? AND status = 'pending'`,
        [actorUser.id, feedback || 'Approved by client in portal', submission.task_id]
      );

      // 7. Security Audit log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'deliverable.client_approved',
        entityType: 'task',
        entityId: submission.task_id,
        details: {
          submissionId,
          clientId: submission.client_id,
          feedback
        },
        req
      });

      await connection.commit();

      // Trigger automated workflow dependency resolution after transaction is committed
      try {
        await WorkflowEngineService.onTaskCompleted(submission.task_id, actorUser, req);
      } catch (autoErr) {
        console.error('Trigger D evaluation error on client approval:', autoErr);
      }

      return await this.getSubmissionById(submissionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * 4. Client Requests Revision (Client Portal Step)
   */
  static async clientRequestRevision(submissionId, { revisionReason }, actorUser, req = null) {
    if (!revisionReason || typeof revisionReason !== 'string' || revisionReason.trim().length < 5) {
      const error = new Error('A clear revision explanation is required (minimum 5 characters)');
      error.status = 400;
      error.code = 'REVISION_REASON_REQUIRED';
      throw error;
    }

    const submission = await this.getSubmissionById(submissionId);
    if (!submission) {
      const error = new Error('Deliverable submission not found');
      error.status = 404;
      error.code = 'SUBMISSION_NOT_FOUND';
      throw error;
    }

    // Client Tenant Isolation Check
    if (actorUser.client_id && Number(actorUser.client_id) !== Number(submission.client_id)) {
      const error = new Error('Access denied: You cannot request revisions for another client\'s deliverables');
      error.status = 403;
      error.code = 'CLIENT_ISOLATION_VIOLATION';
      throw error;
    }

    // Check internal review was approved
    if (submission.internal_review_status !== 'approved') {
      const error = new Error('Cannot request client revisions before internal review is completed and approved');
      error.status = 400;
      error.code = 'INTERNAL_REVIEW_PENDING';
      throw error;
    }

    // Check deliverable is awaiting client approval
    if (submission.client_approval_status !== 'pending') {
      const error = new Error(`Cannot request revision on deliverable that is currently ${submission.client_approval_status}`);
      error.status = 409;
      error.code = 'INVALID_CLIENT_APPROVAL_STATE';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update submission client status
      await connection.query(
        `UPDATE deliverable_submissions
         SET client_approval_status = 'revision_requested',
             client_reviewer_id = ?,
             client_feedback = ?,
             client_reviewed_at = NOW()
         WHERE id = ?`,
        [actorUser.id, revisionReason.trim(), submissionId]
      );

      // 2. Create open revision request record
      await connection.query(
        `INSERT INTO deliverable_revision_requests (
          submission_id, task_id, revision_cycle,
          requested_by_type, requested_by_user_id, revision_reason, status
        ) VALUES (?, ?, ?, 'client', ?, ?, 'open')`,
        [
          submissionId,
          submission.task_id,
          (submission.revision_count || 0) + 1,
          actorUser.id,
          revisionReason.trim()
        ]
      );

      // 3. Move task to rework status: in_progress with column_status revision
      await connection.query(
        `UPDATE tasks 
         SET status = 'in_progress', column_status = 'revision', revision_count = revision_count + 1
         WHERE id = ?`,
        [submission.task_id]
      );

      // 4. Record task_status_history
      await connection.query(
        `INSERT INTO task_status_history (task_id, user_id, from_status, to_status, comment)
         VALUES (?, ?, 'in_review', 'in_progress', ?)`,
        [submission.task_id, actorUser.id, `Client requested revision: ${revisionReason.trim()}`]
      );

      // 5. Sync task_approvals
      await connection.query(
        `UPDATE task_approvals 
         SET status = 'revision_requested', reviewer_id = ?, reviewer_feedback = ?, reviewed_at = NOW()
         WHERE task_id = ? AND status = 'pending'`,
        [actorUser.id, revisionReason.trim(), submission.task_id]
      );

      // 6. Notify assigned employee and Account Manager
      const notifyUserIds = new Set();
      if (submission.submitted_by) notifyUserIds.add(submission.submitted_by);
      if (submission.assignee_id) notifyUserIds.add(submission.assignee_id);
      if (submission.account_manager_id) notifyUserIds.add(submission.account_manager_id);
      if (submission.project_manager_id) notifyUserIds.add(submission.project_manager_id);

      for (const uId of notifyUserIds) {
        if (uId && uId !== actorUser.id) {
          await NotificationsService.createNotification({
            recipientUserId: uId,
            actorUserId: actorUser.id,
            type: 'client_revision_requested',
            title: `Revision Requested by Client: #${submission.task_code}`,
            message: `${actorUser.name} requested changes on "${submission.title}": "${revisionReason.trim()}". Task returned to rework.`,
            entityType: 'deliverable',
            entityId: submissionId,
            actionUrl: `/tasks/${submission.task_id}`,
            db: connection
          });
        }
      }

      // 7. Security Audit log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'deliverable.client_revision_requested',
        entityType: 'task',
        entityId: submission.task_id,
        details: {
          submissionId,
          clientId: submission.client_id,
          revisionReason: revisionReason.trim()
        },
        req
      });

      await connection.commit();

      return await this.getSubmissionById(submissionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * 5. Get all submissions and revision history for a task
   * Masks internal notes if actor is a client!
   */
  static async getTaskSubmissions(taskId, actorUser) {
    const task = await this.getTaskWithContext(taskId);
    if (!task) {
      const error = new Error('Task not found');
      error.status = 404;
      error.code = 'TASK_NOT_FOUND';
      throw error;
    }

    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient && actorUser.client_id && Number(actorUser.client_id) !== Number(task.client_id)) {
      const error = new Error('Access denied to this task and its deliverables');
      error.status = 403;
      error.code = 'CLIENT_ISOLATION_VIOLATION';
      throw error;
    }

    let query = `
      SELECT ds.*,
             sub.name AS submitter_name, sub.email AS submitter_email,
             int_rev.name AS internal_reviewer_name,
             cli_rev.name AS client_reviewer_name
      FROM deliverable_submissions ds
      LEFT JOIN users sub ON ds.submitted_by = sub.id
      LEFT JOIN users int_rev ON ds.internal_reviewer_id = int_rev.id
      LEFT JOIN users cli_rev ON ds.client_reviewer_id = cli_rev.id
      WHERE ds.task_id = ?
    `;

    // If actor is client: only show items that are client-facing and internally approved
    if (isClient) {
      query += ` AND ds.requires_client_approval = TRUE AND ds.internal_review_status = 'approved'`;
    }

    query += ` ORDER BY ds.version_number DESC`;

    const [submissions] = await pool.query(query, [taskId]);

    // Fetch revision requests
    const [revisionRows] = await pool.query(
      `SELECT drr.*, u.name AS requested_by_name
       FROM deliverable_revision_requests drr
       LEFT JOIN users u ON drr.requested_by_user_id = u.id
       WHERE drr.task_id = ?
       ORDER BY drr.id DESC`,
      [taskId]
    );

    // Format & mask internal information if client
    const formatted = submissions.map((s) => {
      const relatedRevisions = revisionRows.filter((r) => r.submission_id === s.id);

      if (isClient) {
        // Strip private employee/internal discussions
        return {
          id: s.id,
          task_id: s.task_id,
          client_id: s.client_id,
          project_id: s.project_id,
          version_number: s.version_number,
          deliverable_type: s.deliverable_type,
          title: s.title,
          deliverable_url: s.deliverable_url,
          file_name: s.file_name,
          file_size: s.file_size,
          file_mime_type: s.file_mime_type,
          submitted_at: s.submitted_at,
          submitter_name: s.submitter_name,
          client_approval_status: s.client_approval_status,
          client_reviewer_name: s.client_reviewer_name,
          client_feedback: s.client_feedback,
          client_reviewed_at: s.client_reviewed_at,
          revisions: relatedRevisions
            .filter((r) => r.requested_by_type === 'client')
            .map((r) => ({
              id: r.id,
              revision_cycle: r.revision_cycle,
              revision_reason: r.revision_reason,
              status: r.status,
              created_at: r.created_at,
              requested_by_name: r.requested_by_name
            }))
        };
      }

      return {
        ...s,
        revisions: relatedRevisions
      };
    });

    return formatted;
  }

  /**
   * 6. List deliverables for a client (Client Portal View)
   */
  static async getClientDeliverables(clientId, actorUser, { status = null } = {}) {
    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient && actorUser.client_id && Number(actorUser.client_id) !== Number(clientId)) {
      const error = new Error('Access denied to other client records');
      error.status = 403;
      error.code = 'CLIENT_ISOLATION_VIOLATION';
      throw error;
    }

    let sql = `
      SELECT ds.*, 
             t.task_code, t.title AS task_title, t.status AS task_status,
             p.name AS project_name,
             sub.name AS submitter_name,
             int_rev.name AS internal_reviewer_name,
             cli_rev.name AS client_reviewer_name
      FROM deliverable_submissions ds
      INNER JOIN tasks t ON ds.task_id = t.id
      LEFT JOIN projects p ON ds.project_id = p.id
      LEFT JOIN users sub ON ds.submitted_by = sub.id
      LEFT JOIN users int_rev ON ds.internal_reviewer_id = int_rev.id
      LEFT JOIN users cli_rev ON ds.client_reviewer_id = cli_rev.id
      WHERE ds.client_id = ?
    `;
    const params = [clientId];

    if (isClient) {
      // Must be client-facing and internally approved
      sql += ` AND ds.requires_client_approval = TRUE AND ds.internal_review_status = 'approved'`;
    }

    if (status) {
      sql += ` AND ds.client_approval_status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY ds.created_at DESC`;

    const [rows] = await pool.query(sql, params);

    if (isClient) {
      // Mask internal data
      return rows.map((r) => ({
        id: r.id,
        task_id: r.task_id,
        task_code: r.task_code,
        task_title: r.task_title,
        project_name: r.project_name,
        version_number: r.version_number,
        deliverable_type: r.deliverable_type,
        title: r.title,
        deliverable_url: r.deliverable_url,
        file_name: r.file_name,
        file_size: r.file_size,
        file_mime_type: r.file_mime_type,
        submitted_at: r.submitted_at,
        submitter_name: r.submitter_name,
        client_approval_status: r.client_approval_status,
        client_reviewer_name: r.client_reviewer_name,
        client_feedback: r.client_feedback,
        client_reviewed_at: r.client_reviewed_at
      }));
    }

    return rows;
  }

  /**
   * 7. Account Manager Workspace Review Queue
   * Lists deliverables needing internal review or monitoring
   */
  static async getReviewQueue(actorUser) {
    const isOwner = actorUser.is_owner || actorUser.roles?.some((r) => r.slug === 'owner');
    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient) {
      const error = new Error('Access denied: Review queue is restricted to internal team and Account Managers');
      error.status = 403;
      error.code = 'ACCESS_DENIED';
      throw error;
    }

    let sql = `
      SELECT ds.*, 
             t.task_code, t.title AS task_title, t.status AS task_status, t.due_date AS task_due_date,
             p.name AS project_name, p.project_manager_id,
             c.name AS client_name, c.account_manager_id,
             sub.name AS submitter_name, sub.email AS submitter_email
      FROM deliverable_submissions ds
      INNER JOIN tasks t ON ds.task_id = t.id
      LEFT JOIN projects p ON ds.project_id = p.id
      LEFT JOIN clients c ON ds.client_id = c.id
      LEFT JOIN users sub ON ds.submitted_by = sub.id
      WHERE ds.internal_review_status = 'pending'
    `;
    const params = [];

    // Filter to AM's clients or PM's projects if not owner/admin
    const isAdmin = actorUser.roles?.some((r) => ['owner', 'admin'].includes(r.slug));
    if (!isOwner && !isAdmin) {
      sql += ` AND (c.account_manager_id = ? OR p.project_manager_id = ? OR t.internal_reviewer_id = ?)`;
      params.push(actorUser.id, actorUser.id, actorUser.id);
    }

    sql += ` ORDER BY ds.created_at ASC`;

    const [pendingInternal] = await pool.query(sql, params);

    // Also get deliverables awaiting client approval
    let clientPendingSql = `
      SELECT ds.*, 
             t.task_code, t.title AS task_title,
             p.name AS project_name,
             c.name AS client_name,
             sub.name AS submitter_name
      FROM deliverable_submissions ds
      INNER JOIN tasks t ON ds.task_id = t.id
      LEFT JOIN projects p ON ds.project_id = p.id
      LEFT JOIN clients c ON ds.client_id = c.id
      LEFT JOIN users sub ON ds.submitted_by = sub.id
      WHERE ds.internal_review_status = 'approved' AND ds.client_approval_status = 'pending'
    `;
    const clientPendingParams = [];
    if (!isOwner && !isAdmin) {
      clientPendingSql += ` AND (c.account_manager_id = ? OR p.project_manager_id = ?)`;
      clientPendingParams.push(actorUser.id, actorUser.id);
    }
    clientPendingSql += ` ORDER BY ds.created_at DESC`;

    const [pendingClient] = await pool.query(clientPendingSql, clientPendingParams);

    return {
      pendingInternalReview: pendingInternal,
      pendingClientApproval: pendingClient
    };
  }

  /**
   * 8. Secure Deliverable File Download
   */
  static async getDeliverableFile(submissionId, actorUser) {
    const submission = await this.getSubmissionById(submissionId);
    if (!submission) {
      const error = new Error('Deliverable submission not found');
      error.status = 404;
      error.code = 'SUBMISSION_NOT_FOUND';
      throw error;
    }

    if (!submission.file_path) {
      const error = new Error('No attached file for this deliverable');
      error.status = 404;
      error.code = 'FILE_NOT_FOUND';
      throw error;
    }

    // Client isolation check
    const isClient = actorUser.roles?.some((r) => r.slug === 'client') || Boolean(actorUser.client_id);
    if (isClient) {
      if (Number(actorUser.client_id) !== Number(submission.client_id)) {
        const error = new Error('Access denied: You cannot download files belonging to another client');
        error.status = 403;
        error.code = 'CLIENT_ISOLATION_VIOLATION';
        throw error;
      }
      if (submission.internal_review_status !== 'approved' || !submission.requires_client_approval) {
        const error = new Error('Access denied: Deliverable file is not approved for client access');
        error.status = 403;
        error.code = 'DELIVERABLE_NOT_CLIENT_READY';
        throw error;
      }
    } else if (submission.project_id) {
      const canAccess = await ProjectsPolicy.canAccessProject(submission.project_id, actorUser);
      if (!canAccess && submission.submitted_by !== actorUser.id) {
        const error = new Error('Access denied to this deliverable file');
        error.status = 403;
        error.code = 'PROJECT_ACCESS_DENIED';
        throw error;
      }
    }

    const resolvedPath = path.resolve(submission.file_path);
    if (!fs.existsSync(resolvedPath)) {
      const error = new Error('File not found on storage disk');
      error.status = 404;
      error.code = 'STORAGE_FILE_NOT_FOUND';
      throw error;
    }

    return {
      filePath: resolvedPath,
      fileName: submission.file_name || 'deliverable-file',
      mimeType: submission.file_mime_type || 'application/octet-stream'
    };
  }
}
