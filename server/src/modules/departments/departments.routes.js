import { Router } from 'express';
import { DepartmentsController } from './departments.controller.js';
import {
  listDepartmentsQuerySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  addDepartmentMemberSchema
} from './departments.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// --- Department CRUD ---
router.get(
  '/departments',
  requirePermission('departments.view'),
  validate(listDepartmentsQuerySchema, 'query'),
  DepartmentsController.listDepartments
);

router.get(
  '/departments/:id',
  requirePermission('departments.view'),
  DepartmentsController.getDepartment
);

router.post(
  '/departments',
  requirePermission('departments.create'),
  csrfProtection,
  validate(createDepartmentSchema),
  DepartmentsController.createDepartment
);

router.put(
  '/departments/:id',
  csrfProtection,
  validate(updateDepartmentSchema),
  DepartmentsController.updateDepartment
);

router.delete(
  '/departments/:id',
  requirePermission('departments.delete'),
  csrfProtection,
  DepartmentsController.deleteDepartment
);

// --- Department Members & Presets ---
router.get(
  '/departments/:id/members',
  requirePermission('departments.view'),
  DepartmentsController.getDepartmentMembers
);

router.post(
  '/departments/:id/members',
  csrfProtection,
  validate(addDepartmentMemberSchema),
  DepartmentsController.addDepartmentMember
);

router.delete(
  '/departments/:id/members/:userId',
  csrfProtection,
  DepartmentsController.removeMember ? DepartmentsController.removeMember : DepartmentsController.removeDepartmentMember
);

router.get(
  '/departments/:id/presets',
  requirePermission('departments.view'),
  DepartmentsController.getDepartmentPresets
);

export default router;
