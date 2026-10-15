import { NotificationsService } from './notifications.service.js';

export class NotificationsController {
  static async getNotifications(req, res, next) {
    try {
      const { unreadOnly, limit = 20, offset = 0 } = req.query;

      const result = await NotificationsService.getNotifications(req.user.id, {
        unreadOnly: unreadOnly === 'true' || unreadOnly === true,
        limit: Math.min(Number(limit) || 20, 100),
        offset: Number(offset) || 0
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const result = await NotificationsService.getUnreadCount(req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async markAsRead(req, res, next) {
    try {
      const notificationId = req.params.id;
      const success = await NotificationsService.markAsRead(notificationId, req.user.id);

      if (!success) {
        return res.status(404).json({ message: 'Notification not found or already read' });
      }

      res.status(200).json({ message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  }

  static async markAllAsRead(req, res, next) {
    try {
      const affected = await NotificationsService.markAllAsRead(req.user.id);
      res.status(200).json({
        message: 'All notifications marked as read',
        count: affected
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteNotification(req, res, next) {
    try {
      const notificationId = req.params.id;
      const success = await NotificationsService.deleteNotification(notificationId, req.user.id);

      if (!success) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      res.status(200).json({ message: 'Notification deleted' });
    } catch (err) {
      next(err);
    }
  }

  static async getPreferences(req, res, next) {
    try {
      const preferences = await NotificationsService.getPreferences(req.user.id);
      res.status(200).json({ preferences });
    } catch (err) {
      next(err);
    }
  }

  static async updatePreferences(req, res, next) {
    try {
      const preferences = await NotificationsService.updatePreferences(req.user.id, req.body);
      res.status(200).json({
        message: 'Notification preferences updated successfully',
        preferences
      });
    } catch (err) {
      next(err);
    }
  }
}
