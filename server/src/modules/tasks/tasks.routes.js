import { Router } from 'express';
import { TasksController } from './tasks.controller.js';
import { taskAttachmentUpload } from './tasks.upload.js';
import {
  createTaskSchema,
  updateTaskSchema,
  changeTaskStatusSchema,
  updateAssigneesSchema,
  createCommentSchema,
  updateCommentSchema,
  createSubtaskSchema
} from './tasks.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';

const router = Router();

router.use(authenticate);

// --- Task Lists ---
// Specific route /tasks/my-tasks MUST precede /tasks/:id
router.get(
  '/tasks/my-tasks',
  requirePermission('tasks.view'),
  TasksController.getMyTasks
);

router.get(
  '/projects/:id/tasks',
  requirePermission('tasks.view'),
  TasksController.getProjectTasks
);

router.get(
  '/tasks',
  requirePermission('tasks.view'),
  TasksController.listTasks
);

router.get(
  '/tasks/:id',
  requirePermission('tasks.view'),
  TasksController.getTask
);

// --- Task CRUD ---
router.post(
  '/tasks',
  requirePermission('tasks.create'),
  csrfProtection,
  validate(createTaskSchema),
  TasksController.createTask
);

router.put(
  '/tasks/:id',
  requirePermission('tasks.update'),
  csrfProtection,
  validate(updateTaskSchema),
  TasksController.updateTask
);

router.patch(
  '/tasks/:id/status',
  requirePermission('tasks.change_status'),
  csrfProtection,
  validate(changeTaskStatusSchema),
  TasksController.changeStatus
);

router.post(
  '/tasks/:id/reopen',
  requirePermission('tasks.reopen'),
  csrfProtection,
  TasksController.reopenTask
);

router.post(
  '/tasks/:id/archive',
  requirePermission('tasks.archive'),
  csrfProtection,
  TasksController.archiveTask
);

router.delete(
  '/tasks/:id',
  requirePermission('tasks.delete'),
  csrfProtection,
  TasksController.deleteTask
);

// --- Assignees ---
router.get(
  '/tasks/:id/assignees',
  requirePermission('tasks.view'),
  TasksController.getAssignees
);

router.put(
  '/tasks/:id/assignees',
  requirePermission('tasks.assign'),
  csrfProtection,
  validate(updateAssigneesSchema),
  TasksController.updateAssignees
);

// --- Subtasks ---
router.get(
  '/tasks/:id/subtasks',
  requirePermission('subtasks.view'),
  TasksController.getSubtasks
);

router.post(
  '/tasks/:id/subtasks',
  requirePermission('subtasks.create'),
  csrfProtection,
  validate(createSubtaskSchema),
  TasksController.createSubtask
);

// --- Comments ---
router.get(
  '/tasks/:id/comments',
  requirePermission('task_comments.view'),
  TasksController.getComments
);

router.post(
  '/tasks/:id/comments',
  requirePermission('task_comments.create'),
  csrfProtection,
  validate(createCommentSchema),
  TasksController.createComment
);

router.put(
  '/tasks/:id/comments/:commentId',
  csrfProtection,
  validate(updateCommentSchema),
  TasksController.updateComment
);

router.delete(
  '/tasks/:id/comments/:commentId',
  csrfProtection,
  TasksController.deleteComment
);

// --- Attachments ---
router.get(
  '/tasks/:id/attachments',
  requirePermission('task_attachments.view'),
  TasksController.getAttachments
);

router.post(
  '/tasks/:id/attachments',
  requirePermission('task_attachments.upload'),
  csrfProtection,
  taskAttachmentUpload.single('file'),
  TasksController.uploadAttachment
);

router.get(
  '/tasks/:id/attachments/:attachmentId/download',
  requirePermission('task_attachments.view'),
  TasksController.downloadAttachment
);

router.delete(
  '/tasks/:id/attachments/:attachmentId',
  csrfProtection,
  TasksController.deleteAttachment
);

export const taskRoutes = router;
