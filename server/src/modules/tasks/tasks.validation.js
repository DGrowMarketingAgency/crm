import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(2, 'Task title must be at least 2 characters').max(255),
  description: z.string().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  project_id: z.number().int().positive().optional().nullable(),
  clientId: z.number().int().positive().optional().nullable(),
  client_id: z.number().int().positive().optional().nullable(),
  serviceInstanceId: z.number().int().positive().optional().nullable(),
  service_instance_id: z.number().int().positive().optional().nullable(),
  source: z.enum(['Workflow', 'Manual']).default('Manual'),
  columnStatus: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  column_status: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  isClientDeliverable: z.boolean().optional(),
  is_client_deliverable: z.boolean().optional(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assignee_id: z.number().int().positive().optional().nullable(),
  milestoneId: z.number().int().positive().optional().nullable(),
  milestone_id: z.number().int().positive().optional().nullable(),
  parentTaskId: z.number().int().positive().optional().nullable(),
  parent_task_id: z.number().int().positive().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'client_review', 'revision', 'done']).default('todo'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format').optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format').optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format').optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format').optional().nullable(),
  estimatedMinutes: z.number().int().nonnegative().optional().nullable(),
  estimated_minutes: z.number().int().nonnegative().optional().nullable(),
  labels: z.array(z.string().max(50)).optional().default([]),
  referenceUrl: z.string().max(500).optional().nullable(),
  reference_url: z.string().max(500).optional().nullable(),
  assigneeIds: z.array(z.number().int().positive()).optional().default([]),
  assignee_ids: z.array(z.number().int().positive()).optional().default([])
}).refine(
  (data) => {
    const start = data.startDate || data.start_date;
    const due = data.dueDate || data.due_date;
    if (start && due) {
      return new Date(due) >= new Date(start);
    }
    return true;
  },
  {
    message: 'Due date cannot be earlier than start date',
    path: ['dueDate']
  }
);

export const updateTaskSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().optional().nullable(),
  milestoneId: z.number().int().positive().optional().nullable(),
  milestone_id: z.number().int().positive().optional().nullable(),
  columnStatus: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  column_status: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  isClientDeliverable: z.boolean().optional(),
  is_client_deliverable: z.boolean().optional(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assignee_id: z.number().int().positive().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estimatedMinutes: z.number().int().nonnegative().optional().nullable(),
  estimated_minutes: z.number().int().nonnegative().optional().nullable(),
  labels: z.array(z.string().max(50)).optional(),
  referenceUrl: z.string().max(500).optional().nullable(),
  reference_url: z.string().max(500).optional().nullable()
}).refine(
  (data) => {
    const start = data.startDate || data.start_date;
    const due = data.dueDate || data.due_date;
    if (start && due) {
      return new Date(due) >= new Date(start);
    }
    return true;
  },
  {
    message: 'Due date cannot be earlier than start date',
    path: ['dueDate']
  }
);

export const changeTaskStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'client_review', 'revision', 'done']).optional(),
  columnStatus: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  column_status: z.enum(['todo', 'in_progress', 'client_review', 'revision', 'done']).optional(),
  comment: z.string().max(1000).optional().nullable(),
  deliverableUrl: z.string().max(1000).optional().nullable(),
  deliverable_url: z.string().max(1000).optional().nullable()
}).refine((data) => data.status || data.columnStatus || data.column_status, {
  message: 'Either status or columnStatus must be provided'
});

export const updateAssigneesSchema = z.object({
  assigneeIds: z.array(z.number().int().positive(), {
    required_error: 'Assignee IDs array is required'
  })
});

export const createCommentSchema = z.object({
  commentText: z.string().min(1, 'Comment cannot be empty').max(5000)
});

export const updateCommentSchema = z.object({
  commentText: z.string().min(1, 'Comment cannot be empty').max(5000)
});

export const createSubtaskSchema = z.object({
  title: z.string().min(2, 'Subtask title must be at least 2 characters').max(255),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});
