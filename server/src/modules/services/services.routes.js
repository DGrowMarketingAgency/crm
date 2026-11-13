import { Router } from 'express';
import { ServicesController } from './services.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// List master services with search, filtering, and pagination
router.get(
  '/services',
  requirePermission('services.view'),
  ServicesController.listServices
);

// Get distinct service categories
router.get(
  '/services/categories',
  requirePermission('services.view'),
  ServicesController.getCategories
);

// List available service catalog for quick bundling
router.get(
  '/services/catalog',
  requirePermission('services.view'),
  ServicesController.getCatalog
);

// View single service details with workflow preview
router.get(
  '/services/:id',
  requirePermission('services.view'),
  ServicesController.getService
);

// Create new master service
router.post(
  '/services',
  requirePermission('services.create'),
  csrfProtection,
  ServicesController.createService
);

// Update existing master service
router.put(
  '/services/:id',
  requirePermission('services.update'),
  csrfProtection,
  ServicesController.updateService
);

// Change service status (active / inactive)
router.patch(
  '/services/:id/status',
  requirePermission('services.update'),
  csrfProtection,
  ServicesController.changeStatus
);

// Archive service
router.post(
  '/services/:id/archive',
  requirePermission('services.archive'),
  csrfProtection,
  ServicesController.archiveService
);

// List bundled services for a client
router.get(
  '/clients/:id/services',
  requirePermission('services.view'),
  ServicesController.listClientServices
);

// Bundle services onto a client (triggers Auto-Trigger Engine)
router.post(
  '/clients/:id/services',
  requirePermission('services.bundle'),
  csrfProtection,
  ServicesController.bundleServices
);

export const servicesRoutes = router;
