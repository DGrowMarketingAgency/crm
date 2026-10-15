import { Router } from 'express';
import { ProjectsController } from './projects.controller.js';
import { MilestonesController } from '../milestones/milestones.controller.js';
import {
  createProjectSchema,
  updateProjectSchema,
  changeProjectStatusSchema,
  updateProjectMembersSchema,
  updateProjectTeamsSchema
} from './projects.validation.js';
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  changeMilestoneStatusSchema,
  reorderMilestonesSchema
} from '../milestones/milestones.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// --- Projects Metrics ---
router.get(
  '/projects/metrics',
  requirePermission('projects.view'),
  ProjectsController.getMetrics
);

// --- Projects Listing & CRUD ---
router.get(
  '/projects',
  requirePermission('projects.view'),
  ProjectsController.listProjects
);

router.get(
  '/projects/:id',
  requirePermission('projects.view'),
  ProjectsController.getProject
);

router.post(
  '/projects',
  requirePermission('projects.create'),
  csrfProtection,
  validate(createProjectSchema),
  ProjectsController.createProject
);

router.put(
  '/projects/:id',
  requirePermission('projects.update'),
  csrfProtection,
  validate(updateProjectSchema),
  ProjectsController.updateProject
);

router.patch(
  '/projects/:id/status',
  requirePermission('projects.change_status'),
  csrfProtection,
  validate(changeProjectStatusSchema),
  ProjectsController.changeStatus
);

router.post(
  '/projects/:id/archive',
  requirePermission('projects.archive'),
  csrfProtection,
  ProjectsController.archiveProject
);

// --- Members & Teams ---
router.get(
  '/projects/:id/members',
  requirePermission('projects.view'),
  ProjectsController.getMembers
);

router.put(
  '/projects/:id/members',
  requirePermission('projects.manage_members'),
  csrfProtection,
  validate(updateProjectMembersSchema),
  ProjectsController.updateMembers
);

router.get(
  '/projects/:id/teams',
  requirePermission('projects.view'),
  ProjectsController.getTeams
);

router.put(
  '/projects/:id/teams',
  requirePermission('projects.manage_teams'),
  csrfProtection,
  validate(updateProjectTeamsSchema),
  ProjectsController.updateTeams
);

// --- Project Activity ---
router.get(
  '/projects/:id/activity',
  requirePermission('projects.view_activity'),
  ProjectsController.getActivity
);

// --- Milestones Routes ---
router.get(
  '/projects/:id/milestones',
  requirePermission('milestones.view'),
  MilestonesController.listMilestones
);

router.post(
  '/projects/:id/milestones',
  requirePermission('milestones.create'),
  csrfProtection,
  validate(createMilestoneSchema),
  MilestonesController.createMilestone
);

// Note: /reorder must precede /:milestoneId
router.patch(
  '/projects/:id/milestones/reorder',
  requirePermission('milestones.reorder'),
  csrfProtection,
  validate(reorderMilestonesSchema),
  MilestonesController.reorderMilestones
);

router.put(
  '/projects/:id/milestones/:milestoneId',
  requirePermission('milestones.update'),
  csrfProtection,
  validate(updateMilestoneSchema),
  MilestonesController.updateMilestone
);

router.patch(
  '/projects/:id/milestones/:milestoneId/status',
  requirePermission('milestones.update'),
  csrfProtection,
  validate(changeMilestoneStatusSchema),
  MilestonesController.changeMilestoneStatus
);

router.delete(
  '/projects/:id/milestones/:milestoneId',
  requirePermission('milestones.delete'),
  csrfProtection,
  MilestonesController.deleteMilestone
);

export const projectRoutes = router;
