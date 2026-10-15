import { Router } from 'express';
import { LeadsController } from './leads.controller.js';
import { createLeadSchema, updateLeadSchema, convertLeadSchema } from './leads.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

router.get(
  '/leads',
  requirePermission('leads.view'),
  LeadsController.listLeads
);

router.get(
  '/leads/:id',
  requirePermission('leads.view'),
  LeadsController.getLead
);

router.post(
  '/leads',
  requirePermission('leads.create'),
  csrfProtection,
  validate(createLeadSchema),
  LeadsController.createLead
);

router.put(
  '/leads/:id',
  requirePermission('leads.update'),
  csrfProtection,
  validate(updateLeadSchema),
  LeadsController.updateLead
);

router.post(
  '/leads/:id/convert',
  requirePermission('leads.convert'),
  csrfProtection,
  validate(convertLeadSchema),
  LeadsController.convertLead
);

export const leadsRoutes = router;

