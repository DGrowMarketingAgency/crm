import { Router } from 'express';
import { ClientsController } from './clients.controller.js';
import {
  createClientSchema,
  updateClientSchema,
  updateLifecycleSchema,
  assignAccountManagerSchema,
  clientContactSchema,
  updateClientContactSchema,
  onboardingItemSchema,
  updateOnboardingItemSchema,
  createClientServiceSchema,
  updateClientServiceSchema
} from './clients.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// 1. Dashboard statistics & Meta endpoints (defined before :id)
router.get(
  '/clients/dashboard/stats',
  requirePermission('clients.view'),
  ClientsController.getDashboardStats
);

router.get(
  '/clients/meta/account-managers',
  requirePermission('clients.view'),
  ClientsController.getEligibleAccountManagers
);

router.get(
  '/clients/export',
  requirePermission('clients.export'),
  ClientsController.exportClients
);

// 2. Client Listing & Creation
router.get(
  '/clients',
  requirePermission('clients.view'),
  ClientsController.listClients
);

router.post(
  '/clients',
  requirePermission('clients.create'),
  csrfProtection,
  validate(createClientSchema),
  ClientsController.createClient
);

// 3. Client Detail & Updating
router.get(
  '/clients/:id',
  requirePermission('clients.view'),
  ClientsController.getClient
);

router.put(
  '/clients/:id',
  requirePermission('clients.update'),
  csrfProtection,
  validate(updateClientSchema),
  ClientsController.updateClient
);

router.delete(
  '/clients/:id',
  requirePermission('clients.delete'),
  csrfProtection,
  ClientsController.deleteClient
);

// 4. Client Detail Workspace (11 Sections Aggregated)
router.get(
  '/clients/:id/workspace',
  requirePermission('clients.view'),
  ClientsController.getClientWorkspace
);

// 5. Activity Timeline
router.get(
  '/clients/:id/activity',
  requirePermission('clients.view'),
  ClientsController.getClientActivity
);

// 6. Client Associated Projects
router.get(
  '/clients/:id/projects',
  requirePermission('projects.view'),
  ClientsController.getClientProjects
);

// 7. Client Universal Lifecycle
router.get(
  '/clients/:id/lifecycle',
  requirePermission('lifecycle.view'),
  ClientsController.getLifecycle
);

router.put(
  '/clients/:id/lifecycle',
  requirePermission('lifecycle.update'),
  csrfProtection,
  validate(updateLifecycleSchema),
  ClientsController.updateLifecycle
);

router.patch(
  '/clients/:id/lifecycle',
  requirePermission('lifecycle.update'),
  csrfProtection,
  validate(updateLifecycleSchema),
  ClientsController.updateLifecycle
);

// 8. Account Manager Assignment & History
router.post(
  '/clients/:id/assign-account-manager',
  requirePermission('clients.assign_am'),
  csrfProtection,
  validate(assignAccountManagerSchema),
  ClientsController.assignAccountManager
);

router.get(
  '/clients/:id/account-manager-history',
  requirePermission('clients.view'),
  ClientsController.getAccountManagerHistory
);

// 9. Client Contacts Management
router.get(
  '/clients/:id/contacts',
  requirePermission('clients.view'),
  ClientsController.getContacts
);

router.post(
  '/clients/:id/contacts',
  requirePermission('clients.manage_contacts'),
  csrfProtection,
  validate(clientContactSchema),
  ClientsController.addContact
);

router.put(
  '/clients/:id/contacts/:contactId',
  requirePermission('clients.manage_contacts'),
  csrfProtection,
  validate(updateClientContactSchema),
  ClientsController.updateContact
);

router.delete(
  '/clients/:id/contacts/:contactId',
  requirePermission('clients.manage_contacts'),
  csrfProtection,
  ClientsController.deleteContact
);

router.put(
  '/clients/:id/contacts/:contactId/primary',
  requirePermission('clients.manage_contacts'),
  csrfProtection,
  ClientsController.setPrimaryContact
);

// 10. Client Onboarding Checklist
router.get(
  '/clients/:id/onboarding',
  requirePermission('clients.view'),
  ClientsController.getOnboardingChecklist
);

router.post(
  '/clients/:id/onboarding/items',
  requirePermission('clients.manage_onboarding'),
  csrfProtection,
  validate(onboardingItemSchema),
  ClientsController.addOnboardingItem
);

router.patch(
  '/clients/:id/onboarding/items/:itemId',
  requirePermission('clients.manage_onboarding'),
  csrfProtection,
  validate(updateOnboardingItemSchema),
  ClientsController.updateOnboardingItem
);

router.delete(
  '/clients/:id/onboarding/items/:itemId',
  requirePermission('clients.manage_onboarding'),
  csrfProtection,
  ClientsController.deleteOnboardingItem
);

// 11. Client Services
router.get(
  '/clients/:id/services',
  requirePermission('services.view'),
  ClientsController.getClientServices
);

router.post(
  '/clients/:id/services',
  requirePermission('clients.manage_services'),
  csrfProtection,
  validate(createClientServiceSchema),
  ClientsController.createClientService
);

router.put(
  '/clients/:id/services/:serviceId',
  requirePermission('clients.manage_services'),
  csrfProtection,
  validate(updateClientServiceSchema),
  ClientsController.updateClientService
);

export { router as clientRoutes };
export default router;
