import { Router } from 'express';
import { WorkflowsController } from './workflows.controller.js';
import {
  listPresetsQuerySchema,
  createPresetSchema,
  updatePresetSchema,
  updateVersionSettingsSchema,
  stageSchema,
  reorderStagesSchema,
  taskTemplateSchema,
  reorderTasksSchema,
  dependencySchema
} from './workflows.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// --- Presets CRUD ---
router.get(
  '/workflow-presets',
  requirePermission('workflows.view'),
  validate(listPresetsQuerySchema, 'query'),
  WorkflowsController.listPresets
);

router.get(
  '/workflow-presets/:id',
  requirePermission('workflows.view'),
  WorkflowsController.getPreset
);

router.post(
  '/workflow-presets',
  requirePermission('workflows.create'),
  csrfProtection,
  validate(createPresetSchema),
  WorkflowsController.createPreset
);

router.put(
  '/workflow-presets/:id',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(updatePresetSchema),
  WorkflowsController.updatePreset
);

router.post(
  '/workflow-presets/:id/archive',
  requirePermission('workflows.archive'),
  csrfProtection,
  WorkflowsController.archivePreset
);

// --- Versions & Version Settings ---
router.get(
  '/workflow-presets/:id/versions',
  requirePermission('workflows.view'),
  WorkflowsController.listVersions
);

router.post(
  '/workflow-presets/:id/create-draft',
  requirePermission('workflows.create'),
  csrfProtection,
  WorkflowsController.createDraftVersion
);

router.put(
  '/workflow-presets/:id/versions/:versionId',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(updateVersionSettingsSchema),
  WorkflowsController.updateVersionSettings
);

// --- Stages Builder ---
router.post(
  '/workflow-presets/:id/versions/:versionId/stages',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(stageSchema),
  WorkflowsController.addStage
);

router.put(
  '/workflow-presets/:id/versions/:versionId/stages/reorder',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(reorderStagesSchema),
  WorkflowsController.reorderStages
);

router.put(
  '/workflow-presets/:id/versions/:versionId/stages/:stageId',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(stageSchema),
  WorkflowsController.updateStage
);

router.delete(
  '/workflow-presets/:id/versions/:versionId/stages/:stageId',
  requirePermission('workflows.update'),
  csrfProtection,
  WorkflowsController.deleteStage
);

// --- Task Templates Builder ---
router.post(
  '/workflow-presets/:id/versions/:versionId/tasks',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(taskTemplateSchema),
  WorkflowsController.addTaskTemplate
);

router.put(
  '/workflow-presets/:id/versions/:versionId/tasks/reorder',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(reorderTasksSchema),
  WorkflowsController.reorderTasks
);

router.put(
  '/workflow-presets/:id/versions/:versionId/tasks/:taskId',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(taskTemplateSchema),
  WorkflowsController.updateTaskTemplate
);

router.delete(
  '/workflow-presets/:id/versions/:versionId/tasks/:taskId',
  requirePermission('workflows.update'),
  csrfProtection,
  WorkflowsController.deleteTaskTemplate
);

// --- Task Dependencies ---
router.post(
  '/workflow-presets/:id/versions/:versionId/tasks/:taskId/dependencies',
  requirePermission('workflows.update'),
  csrfProtection,
  validate(dependencySchema),
  WorkflowsController.addDependency
);

router.delete(
  '/workflow-presets/:id/versions/:versionId/tasks/:taskId/dependencies/:depTaskId',
  requirePermission('workflows.update'),
  csrfProtection,
  WorkflowsController.removeDependency
);

// --- Validation & Publishing ---
router.post(
  '/workflow-presets/:id/versions/:versionId/validate',
  requirePermission('workflows.validate'),
  WorkflowsController.validateVersion
);

router.post(
  '/workflow-presets/:id/versions/:versionId/publish',
  requirePermission('workflows.publish'),
  csrfProtection,
  WorkflowsController.publishVersion
);

export default router;
