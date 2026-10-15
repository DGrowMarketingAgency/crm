import { pool } from '../../config/db.js';
import { NotificationsService } from './notifications.service.js';

export class RemindersService {
  /**
   * Scans active tasks and delivers deadline reminders idempotently
   */
  static async checkAndSendReminders() {
    const connection = await pool.getConnection();
    let remindersCount = 0;

    try {
      // 1. Fetch active tasks with deadlines (not completed, not archived)
      const [tasks] = await connection.query(
        `SELECT t.id, t.task_code, t.title, t.due_date, t.project_id, p.name AS project_name, p.project_manager_id
         FROM tasks t
         INNER JOIN projects p ON t.project_id = p.id
         WHERE t.due_date IS NOT NULL
           AND t.status NOT IN ('completed')
           AND t.is_archived = FALSE`
      );

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayDate = new Date(todayStr);

      for (const task of tasks) {
        const dueDateStr = task.due_date instanceof Date
          ? task.due_date.toISOString().slice(0, 10)
          : String(task.due_date).slice(0, 10);

        const dueDate = new Date(dueDateStr);
        const diffTime = dueDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

        let reminderType = null;
        let notifType = null;
        let title = '';
        let message = '';

        if (diffDays === 1) {
          // 24h Upcoming
          reminderType = 'upcoming_24h';
          notifType = 'deadline_reminder';
          title = `Upcoming Deadline: #${task.task_code}`;
          message = `Task "${task.title}" is due tomorrow (${dueDateStr}).`;
        } else if (diffDays === 0) {
          // Due Today
          reminderType = 'due_today';
          notifType = 'deadline_reminder';
          title = `Task Due Today: #${task.task_code}`;
          message = `Task "${task.title}" is due today (${dueDateStr}).`;
        } else if (diffDays < 0) {
          // Overdue
          reminderType = `overdue_${todayStr}`;
          notifType = 'task_overdue';
          const overdueDays = Math.abs(diffDays);
          title = `Task Overdue: #${task.task_code}`;
          message = `Task "${task.title}" is overdue by ${overdueDays} day(s) (Due: ${dueDateStr}).`;
        }

        if (!reminderType) continue;

        // Fetch task assignees + project manager
        const [assigneeRows] = await connection.query(
          'SELECT user_id FROM task_assignees WHERE task_id = ?',
          [task.id]
        );

        const targetUserIds = new Set();
        assigneeRows.forEach((r) => targetUserIds.add(r.user_id));
        if (task.project_manager_id) {
          targetUserIds.add(task.project_manager_id);
        }

        // Deliver to each recipient idempotently
        for (const userId of targetUserIds) {
          try {
            // Attempt to insert reminder log
            const [insertRes] = await connection.query(
              `INSERT IGNORE INTO deadline_reminder_logs (task_id, user_id, reminder_type)
               VALUES (?, ?, ?)`,
              [task.id, userId, reminderType]
            );

            // If affectedRows === 1, this reminder has NOT been sent yet
            if (insertRes.affectedRows > 0) {
              await NotificationsService.createNotification({
                recipientUserId: userId,
                actorUserId: null,
                type: notifType,
                title,
                message,
                entityType: 'task',
                entityId: task.id,
                actionUrl: `/tasks/${task.id}`,
                db: connection
              });
              remindersCount++;
            }
          } catch (itemErr) {
            console.error(`Error sending reminder for task ${task.id} to user ${userId}:`, itemErr);
          }
        }
      }

      connection.release();
      return remindersCount;
    } catch (err) {
      connection.release();
      console.error('Reminders check failed:', err);
      return 0;
    }
  }
}
