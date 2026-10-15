import { Router } from 'express';
import { UsersController } from './users.controller.js';
import {
  createUserSchema,
  updateUserSchema,
  changeStatusSchema,
  createInvitationSchema,
  acceptInvitationSchema
} from './users.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

// ==========================================
// Public Invitation Acceptance Endpoint
// ==========================================
router.post(
  '/auth/accept-invitation',
  validate(acceptInvitationSchema),
  UsersController.acceptInvitation
);

// ==========================================
// Protected User & Invitation Endpoints
// ==========================================
router.use(authenticate);

// --- User Management ---
router.get(
  '/users',
  requirePermission('users.view'),
  UsersController.listUsers
);

router.get(
  '/users/:id',
  requirePermission('users.view'),
  UsersController.getUser
);

router.post(
  '/users',
  requirePermission('users.create'),
  csrfProtection,
  validate(createUserSchema),
  UsersController.createUser
);

router.put(
  '/users/:id',
  requirePermission('users.update'),
  csrfProtection,
  validate(updateUserSchema),
  UsersController.updateUser
);

router.patch(
  '/users/:id/status',
  requirePermission('users.change_status'),
  csrfProtection,
  validate(changeStatusSchema),
  UsersController.changeStatus
);

router.get(
  '/users/:id/teams',
  requirePermission('users.view_teams'),
  UsersController.getUserTeams
);

// --- Invitations ---
router.get(
  '/invitations',
  requirePermission('users.view'),
  UsersController.listInvitations
);

router.post(
  '/invitations',
  requirePermission('users.invite'),
  csrfProtection,
  validate(createInvitationSchema),
  UsersController.createInvitation
);

router.post(
  '/invitations/:id/resend',
  requirePermission('users.invite'),
  csrfProtection,
  UsersController.resendInvitation
);

router.post(
  '/invitations/:id/revoke',
  requirePermission('users.invite'),
  csrfProtection,
  UsersController.revokeInvitation
);

export default router;
