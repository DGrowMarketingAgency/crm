import { Router } from 'express';
import { TimeController } from './time.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// ==========================================
// TIMERS
// ==========================================

// Get user's currently active timer (must precede /timers/:id)
router.get(
  '/timers/active',
  requirePermission('timers.view_own'),
  TimeController.getActiveTimer
);

router.post(
  '/timers/start',
  csrfProtection,
  requirePermission('timers.start'),
  TimeController.startTimer
);

router.post(
  '/timers/:id/stop',
  csrfProtection,
  requirePermission('timers.stop_own'),
  TimeController.stopTimer
);

router.get(
  '/timers/:id',
  requirePermission('timers.view_own'),
  TimeController.getTimer
);

// ==========================================
// TIME ENTRIES (WORK LOGS)
// ==========================================

router.get(
  '/time-entries',
  requirePermission('time_entries.view_own'),
  TimeController.getTimeEntries
);

router.get(
  '/time-entries/:id',
  requirePermission('time_entries.view_own'),
  TimeController.getTimeEntry
);

router.post(
  '/time-entries',
  csrfProtection,
  requirePermission('time_entries.create'),
  TimeController.createTimeEntry
);

router.put(
  '/time-entries/:id',
  csrfProtection,
  requirePermission('time_entries.update_own'),
  TimeController.updateTimeEntry
);

router.delete(
  '/time-entries/:id',
  csrfProtection,
  requirePermission('time_entries.delete_own'),
  TimeController.deleteTimeEntry
);

// ==========================================
// TIMESHEETS
// ==========================================

router.get(
  '/timesheets',
  requirePermission('timesheets.view_own'),
  TimeController.getTimesheets
);

router.post(
  '/timesheets',
  csrfProtection,
  requirePermission('timesheets.view_own'),
  TimeController.createTimesheet
);

router.get(
  '/timesheets/:id',
  requirePermission('timesheets.view_own'),
  TimeController.getTimesheet
);

router.post(
  '/timesheets/:id/submit',
  csrfProtection,
  requirePermission('timesheets.submit'),
  TimeController.submitTimesheet
);

router.post(
  '/timesheets/:id/approve',
  csrfProtection,
  requirePermission('timesheets.approve'),
  TimeController.approveTimesheet
);

router.post(
  '/timesheets/:id/reject',
  csrfProtection,
  requirePermission('timesheets.reject'),
  TimeController.rejectTimesheet
);

router.get(
  '/users/:id/timesheets',
  requirePermission('timesheets.view_own'),
  TimeController.getUserTimesheets
);

// ==========================================
// TIME REPORTS & SUMMARIES
// ==========================================

router.get(
  '/time-reports/summary',
  requirePermission('time_reports.view'),
  TimeController.getSummary
);

router.get(
  '/projects/:id/time-summary',
  requirePermission('projects.view'),
  TimeController.getProjectTimeSummary
);

router.get(
  '/tasks/:id/time-summary',
  requirePermission('tasks.view'),
  TimeController.getTaskTimeSummary
);

export default router;
