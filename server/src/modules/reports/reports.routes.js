import { Router } from 'express';
import { ReportsController } from './reports.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';
import {
  dateRangeSchema,
  projectReportQuerySchema,
  taskReportQuerySchema,
  timeReportQuerySchema,
  exportReportSchema
} from './reports.validation.js';

const router = Router();

router.use(authenticate);

// 1. Dashboard
router.get(
  '/reports/dashboard',
  requirePermission('reports.view_dashboard'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getDashboard
);

// 2. Projects
router.get(
  '/reports/projects',
  requirePermission('reports.view_projects'),
  validate(projectReportQuerySchema, 'query'),
  ReportsController.getProjects
);

router.get(
  '/reports/projects/:id',
  requirePermission('reports.view_projects'),
  ReportsController.getProjectById
);

// 3. Tasks
router.get(
  '/reports/tasks',
  requirePermission('reports.view_tasks'),
  validate(taskReportQuerySchema, 'query'),
  ReportsController.getTasks
);

router.get(
  '/reports/overdue-tasks',
  requirePermission('reports.view_tasks'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getOverdueTasks
);

router.get(
  '/reports/task-completion',
  requirePermission('reports.view_tasks'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getTaskCompletion
);

// 4. Teams
router.get(
  '/reports/teams',
  requirePermission('reports.view_teams'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getTeams
);

router.get(
  '/reports/teams/:id',
  requirePermission('reports.view_teams'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getTeamById
);

// 5. Time Tracking
router.get(
  '/reports/time-summary',
  requirePermission('reports.view_time'),
  validate(timeReportQuerySchema, 'query'),
  ReportsController.getTimeSummary
);

router.get(
  '/reports/project-hours',
  requirePermission('reports.view_time'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getProjectHours
);

router.get(
  '/reports/employee-hours',
  requirePermission('reports.view_time'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getEmployeeHours
);

// 6. Clients
router.get(
  '/reports/clients',
  requirePermission('reports.view_clients'),
  validate(dateRangeSchema, 'query'),
  ReportsController.getClients
);

// 7. Exports
router.post(
  '/reports/exports',
  csrfProtection,
  requirePermission('reports.export'),
  validate(exportReportSchema, 'body'),
  ReportsController.exportReport
);

export const reportsRoutes = router;
