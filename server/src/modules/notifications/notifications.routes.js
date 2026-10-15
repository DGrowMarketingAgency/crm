import { Router } from 'express';
import { NotificationsController } from './notifications.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.get(
  '/notifications',
  requirePermission('notifications.view'),
  NotificationsController.getNotifications
);

router.get(
  '/notifications/unread-count',
  requirePermission('notifications.view'),
  NotificationsController.getUnreadCount
);

router.patch(
  '/notifications/read-all',
  requirePermission('notifications.manage_own'),
  NotificationsController.markAllAsRead
);

router.patch(
  '/notifications/:id/read',
  requirePermission('notifications.manage_own'),
  NotificationsController.markAsRead
);

router.delete(
  '/notifications/:id',
  requirePermission('notifications.manage_own'),
  NotificationsController.deleteNotification
);

router.get(
  '/notifications/preferences',
  requirePermission('notifications.manage_preferences'),
  NotificationsController.getPreferences
);

router.put(
  '/notifications/preferences',
  requirePermission('notifications.manage_preferences'),
  NotificationsController.updatePreferences
);

export default router;
