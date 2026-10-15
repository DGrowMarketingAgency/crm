import { Router } from 'express';
import { ServicesController } from './services.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// List available service catalog
router.get(
  '/services/catalog',
  requirePermission('services.view'),
  ServicesController.getCatalog
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

