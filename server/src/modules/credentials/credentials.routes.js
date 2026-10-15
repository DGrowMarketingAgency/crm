import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, requireAnyPermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { credentialRevealLimiter, credentialMutationLimiter } from '../../middleware/rateLimiter.js';
import { CredentialsController } from './credentials.controller.js';
import {
  createCredentialSchema,
  updateCredentialSchema,
  grantAccessSchema,
  updateGrantSchema,
  listCredentialsQuerySchema
} from './credentials.validation.js';

const router = Router();

// All credential routes require authentication
router.use(authenticate);

// Eligible employees dropdown for admin / grant modal
router.get(
  '/credentials/meta/employees',
  requireAnyPermission(['credentials.manage', 'credentials.view_all']),
  CredentialsController.getEligibleEmployees
);

// List permitted credentials
router.get(
  '/credentials',
  requireAnyPermission(['credentials.view_all', 'credentials.client_access', 'credentials.employee_view']),
  validate(listCredentialsQuerySchema, 'query'),
  CredentialsController.listCredentials
);

// Create new credential (Admin or Client)
router.post(
  '/credentials',
  credentialMutationLimiter,
  requireAnyPermission(['credentials.manage', 'credentials.client_access']),
  validate(createCredentialSchema, 'body'),
  CredentialsController.createCredential
);

// Get credential metadata and permissions
router.get(
  '/credentials/:id',
  requireAnyPermission(['credentials.view_all', 'credentials.client_access', 'credentials.employee_view']),
  CredentialsController.getCredentialDetails
);

// Update credential
router.put(
  '/credentials/:id',
  credentialMutationLimiter,
  validate(updateCredentialSchema, 'body'),
  CredentialsController.updateCredential
);

// Reveal credential secret (Rate-limited, strictly authorized)
router.post(
  '/credentials/:id/reveal',
  credentialRevealLimiter,
  CredentialsController.revealCredential
);

// Employee access grants endpoints
router.post(
  '/credentials/:id/grants',
  credentialMutationLimiter,
  validate(grantAccessSchema, 'body'),
  CredentialsController.grantEmployeeAccess
);

router.patch(
  '/credentials/:id/grants/:grantId',
  credentialMutationLimiter,
  validate(updateGrantSchema, 'body'),
  CredentialsController.updateEmployeeGrant
);

router.delete(
  '/credentials/:id/grants/:grantId',
  credentialMutationLimiter,
  CredentialsController.revokeEmployeeAccess
);

// Client revoke all employee access for their credential
router.post(
  '/credentials/:id/revoke-my-access',
  credentialMutationLimiter,
  requirePermission('credentials.client_access'),
  CredentialsController.clientRevokeAllAccess
);

// Audit history
router.get(
  '/credentials/:id/audit-history',
  CredentialsController.getAuditHistory
);

// Archive credential
router.delete(
  '/credentials/:id',
  credentialMutationLimiter,
  CredentialsController.archiveCredential
);

// Admin key rotation maintenance
router.post(
  '/credentials/admin/rotate-keys',
  requirePermission('credentials.manage'),
  CredentialsController.rotateKeys
);

export default router;
