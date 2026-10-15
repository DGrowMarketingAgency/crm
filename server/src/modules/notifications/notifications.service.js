import { pool } from '../../config/db.js';
import { socketService } from './socket.service.js';
import { emailService } from './email.service.js';
import { env } from '../../config/env.js';

export class NotificationsService {
  /**
   * Retrieves or initializes a user's notification preferences
   */
  static async getPreferences(userId, db = pool) {
    const [rows] = await db.query(
      `SELECT user_id, task_assigned, approval_requested, approval_decision,
              deadline_reminders, overdue_reminders, email_enabled, updated_at
       FROM user_notification_preferences
       WHERE user_id = ?`,
      [userId]
    );

    if (rows.length > 0) {
      return {
        userId: Number(rows[0].user_id),
        taskAssigned: Boolean(rows[0].task_assigned),
        approvalRequested: Boolean(rows[0].approval_requested),
        approvalDecision: Boolean(rows[0].approval_decision),
        deadlineReminders: Boolean(rows[0].deadline_reminders),
        overdueReminders: Boolean(rows[0].overdue_reminders),
        emailEnabled: Boolean(rows[0].email_enabled),
        updatedAt: rows[0].updated_at
      };
    }

    // Default configuration
    return {
      userId: Number(userId),
      taskAssigned: true,
      approvalRequested: true,
      approvalDecision: true,
      deadlineReminders: true,
      overdueReminders: true,
      emailEnabled: true,
      updatedAt: null
    };
  }

  /**
   * Updates a user's notification preferences
   */
  static async updatePreferences(userId, data, db = pool) {
    const current = await this.getPreferences(userId, db);

    const taskAssigned = data.taskAssigned !== undefined ? Boolean(data.taskAssigned) : current.taskAssigned;
    const approvalRequested = data.approvalRequested !== undefined ? Boolean(data.approvalRequested) : current.approvalRequested;
    const approvalDecision = data.approvalDecision !== undefined ? Boolean(data.approvalDecision) : current.approvalDecision;
    const deadlineReminders = data.deadlineReminders !== undefined ? Boolean(data.deadlineReminders) : current.deadlineReminders;
    const overdueReminders = data.overdueReminders !== undefined ? Boolean(data.overdueReminders) : current.overdueReminders;
    const emailEnabled = data.emailEnabled !== undefined ? Boolean(data.emailEnabled) : current.emailEnabled;

    await db.query(
      `INSERT INTO user_notification_preferences (
         user_id, task_assigned, approval_requested, approval_decision,
         deadline_reminders, overdue_reminders, email_enabled
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         task_assigned = VALUES(task_assigned),
         approval_requested = VALUES(approval_requested),
         approval_decision = VALUES(approval_decision),
         deadline_reminders = VALUES(deadline_reminders),
         overdue_reminders = VALUES(overdue_reminders),
         email_enabled = VALUES(email_enabled)`,
      [userId, taskAssigned, approvalRequested, approvalDecision, deadlineReminders, overdueReminders, emailEnabled]
    );

    return this.getPreferences(userId, db);
  }

  /**
   * Dispatches an in-app notification and queues an email if configured
   */
  static async createNotification({
    recipientUserId,
    actorUserId = null,
    type,
    title,
    message,
    entityType,
    entityId,
    actionUrl,
    emailSubject = null,
    emailHtml = null,
    emailText = null,
    db = pool
  }) {
    if (!recipientUserId) return null;

    // Check preferences
    const prefs = await this.getPreferences(recipientUserId, db);

    let isEligible = true;
    if (type === 'task_assigned' && !prefs.taskAssigned) isEligible = false;
    if ((type === 'review_requested' || type === 'approval_requested') && !prefs.approvalRequested) isEligible = false;
    if ((type === 'task_approved' || type === 'revision_requested' || type === 'task_resubmitted') && !prefs.approvalDecision) isEligible = false;
    if (type === 'deadline_reminder' && !prefs.deadlineReminders) isEligible = false;
    if (type === 'task_overdue' && !prefs.overdueReminders) isEligible = false;

    if (!isEligible) {
      return null;
    }

    // Insert into notifications
    const [res] = await db.query(
      `INSERT INTO notifications (
         recipient_user_id, actor_user_id, type, title, message, entity_type, entity_id, action_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipientUserId, actorUserId, type, title, message, entityType, entityId, actionUrl]
    );

    const notificationId = res.insertId;

    const notificationData = {
      id: notificationId,
      recipientUserId: Number(recipientUserId),
      actorUserId: actorUserId ? Number(actorUserId) : null,
      type,
      title,
      message,
      entityType,
      entityId: Number(entityId),
      actionUrl,
      readAt: null,
      createdAt: new Date().toISOString()
    };

    // Real-time socket broadcast to recipient
    socketService.emitToUser(recipientUserId, 'notification:new', notificationData);

    // Queue email if email is enabled
    if (prefs.emailEnabled) {
      const [uRows] = await db.query('SELECT email, name FROM users WHERE id = ?', [recipientUserId]);
      if (uRows.length > 0 && uRows[0].email) {
        const recipientEmail = uRows[0].email;
        const subject = emailSubject || `[Agency Manager] ${title}`;
        const actionFullUrl = `${env.CLIENT_URL}${actionUrl.startsWith('/') ? actionUrl : '/' + actionUrl}`;

        const html =
          emailHtml ||
          emailService.generateHtmlTemplate({
            title: subject,
            heading: title,
            bodyHtml: `<p>${emailService.escapeHtml(message)}</p>`,
            actionUrl: actionFullUrl,
            actionText: 'View in Agency Manager'
          });

        const text = emailText || `${title}\n\n${message}\n\nView details: ${actionFullUrl}`;

        await emailService.enqueueEmail({
          recipientEmail,
          subject,
          htmlBody: html,
          textBody: text,
          idempotencyKey: `notif-${notificationId}`,
          db
        });
      }
    }

    return notificationData;
  }

  /**
   * Retrieves paginated notifications for the current user
   */
  static async getNotifications(userId, { unreadOnly = false, limit = 20, offset = 0 } = {}) {
    let whereClause = 'WHERE n.recipient_user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      whereClause += ' AND n.read_at IS NULL';
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM notifications n ${whereClause}`,
      params
    );
    const total = Number(countRows[0].total);

    const [rows] = await pool.query(
      `SELECT n.id, n.recipient_user_id, n.actor_user_id, n.type, n.title, n.message,
              n.entity_type, n.entity_id, n.action_url, n.read_at, n.created_at,
              u.name AS actor_name, u.email AS actor_email
       FROM notifications n
       LEFT JOIN users u ON n.actor_user_id = u.id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      notifications: rows.map((r) => ({
        id: r.id,
        recipientUserId: r.recipient_user_id,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        actorEmail: r.actor_email,
        type: r.type,
        title: r.title,
        message: r.message,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actionUrl: r.action_url,
        readAt: r.read_at,
        isRead: Boolean(r.read_at),
        createdAt: r.created_at
      })),
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Gets unread notifications count
   */
  static async getUnreadCount(userId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE recipient_user_id = ? AND read_at IS NULL`,
      [userId]
    );

    return {
      unreadCount: Number(rows[0]?.unread_count || 0)
    };
  }

  /**
   * Marks a single notification as read (scoped to recipient)
   */
  static async markAsRead(notificationId, userId) {
    const [result] = await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = ? AND recipient_user_id = ? AND read_at IS NULL`,
      [notificationId, userId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Marks all notifications as read for a user
   */
  static async markAllAsRead(userId) {
    const [result] = await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE recipient_user_id = ? AND read_at IS NULL`,
      [userId]
    );

    return result.affectedRows;
  }

  /**
   * Deletes a single notification (scoped to recipient)
   */
  static async deleteNotification(notificationId, userId) {
    const [result] = await pool.query(
      `DELETE FROM notifications
       WHERE id = ? AND recipient_user_id = ?`,
      [notificationId, userId]
    );

    return result.affectedRows > 0;
  }
}
