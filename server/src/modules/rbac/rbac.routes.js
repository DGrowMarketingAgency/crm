import { Router } from 'express';
import { RbacController } from './rbac.controller.js';
import {
  createRoleSchema,
  updateRoleSchema,
  setRolePermissionsSchema,
  setUserRolesSchema
} from './rbac.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

// All RBAC endpoints require authenticated user
router.use(authenticate);

// 1. Current user permissions (no special permission required other than being authenticated)
router.get('/auth/me/permissions', RbacController.getCurrentUserPermissions);

// 2. Permissions endpoints
router.get(
  '/permissions',
  requirePermission('permissions.view'),
  RbacController.getPermissions
);

router.get(
  '/permissions/grouped',
  requirePermission('permissions.view'),
  RbacController.getGroupedPermissions
);

// 3. Roles endpoints
router.get(
  '/roles',
  requirePermission('roles.view'),
  RbacController.getRoles
);

router.get(
  '/roles/:id',
  requirePermission('roles.view'),
  RbacController.getRole
);

router.post(
  '/roles',
  requirePermission('roles.create'),
  csrfProtection,
  validate(createRoleSchema),
  RbacController.createRole
);

router.put(
  '/roles/:id',
  requirePermission('roles.update'),
  csrfProtection,
  validate(updateRoleSchema),
  RbacController.updateRole
);

router.delete(
  '/roles/:id',
  requirePermission('roles.delete'),
  csrfProtection,
  RbacController.deleteRole
);

// 4. Role Permissions endpoints
router.get(
  '/roles/:id/permissions',
  requirePermission('roles.view'),
  RbacController.getRolePermissions
);

router.put(
  '/roles/:id/permissions',
  requirePermission('roles.assign_permissions'),
  csrfProtection,
  validate(setRolePermissionsSchema),
  RbacController.setRolePermissions
);

// 5. User Roles endpoints
router.get(
  '/users/:id/roles',
  requirePermission('roles.view'),
  RbacController.getUserRoles
);

router.put(
  '/users/:id/roles',
  requirePermission('roles.assign_users'),
  csrfProtection,
  validate(setUserRolesSchema),
  RbacController.setUserRoles
);

// 6. Audit Logs endpoint
router.get(
  '/audit-logs',
  requirePermission('roles.view'),
  RbacController.getAuditLogs
);

export default router;
