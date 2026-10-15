import { Router } from 'express';
import { TeamsController } from './teams.controller.js';
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  assignLeaderSchema
} from './teams.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// --- Teams CRUD ---
router.get(
  '/teams',
  requirePermission('teams.view'),
  TeamsController.listTeams
);

router.get(
  '/teams/:id',
  requirePermission('teams.view'),
  TeamsController.getTeam
);

router.post(
  '/teams',
  requirePermission('teams.create'),
  csrfProtection,
  validate(createTeamSchema),
  TeamsController.createTeam
);

router.put(
  '/teams/:id',
  requirePermission('teams.update'),
  csrfProtection,
  validate(updateTeamSchema),
  TeamsController.updateTeam
);

router.delete(
  '/teams/:id',
  requirePermission('teams.delete'),
  csrfProtection,
  TeamsController.deleteTeam
);

// --- Team Members & Leader ---
router.get(
  '/teams/:id/members',
  requirePermission('teams.view_members'),
  TeamsController.getTeamMembers
);

router.post(
  '/teams/:id/members',
  requirePermission('teams.manage_members'),
  csrfProtection,
  validate(addMemberSchema),
  TeamsController.addMember
);

router.delete(
  '/teams/:id/members/:userId',
  requirePermission('teams.manage_members'),
  csrfProtection,
  TeamsController.removeMember
);

router.put(
  '/teams/:id/leader',
  requirePermission('teams.assign_leader'),
  csrfProtection,
  validate(assignLeaderSchema),
  TeamsController.assignLeader
);

export default router;
