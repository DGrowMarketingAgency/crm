import { Router } from 'express';
import { CalendarController } from './calendar.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// 1. Meta / filter options (must come before :id)
router.get(
  '/options',
  requirePermission('calendar.view'),
  CalendarController.getFilterOptions
);

// 2. Events retrieval (list across permitted clients or specific client)
router.get(
  '/',
  requirePermission('calendar.view'),
  CalendarController.getEvents
);

// 3. Single event retrieval
router.get(
  '/:id',
  requirePermission('calendar.view'),
  CalendarController.getEventById
);

// 4. Create calendar event
router.post(
  '/',
  requirePermission('calendar.create'),
  CalendarController.createEvent
);

// 5. Update calendar event (single or series)
router.put(
  '/:id',
  requirePermission('calendar.update'),
  CalendarController.updateEvent
);

// 6. Delete calendar event (single or series)
router.delete(
  '/:id',
  requirePermission('calendar.delete'),
  CalendarController.deleteEvent
);

// 7. Record publication
router.post(
  '/:id/publish',
  requirePermission('calendar.publish'),
  CalendarController.publishEvent
);

export default router;
