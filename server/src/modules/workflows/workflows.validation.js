import { z } from 'zod';

export const listPresetsQuerySchema = z.object({
  departmentId: z.coerce.number().int().positive().optional(),
  serviceCategory: z.string().optional().default(''),
  workflowType: z.enum(['', 'standard', 'custom', 'recurring_monthly', 'one_time']).optional().default(''),
  status: z.enum(['', 'draft', 'published', 'archived']).optional().default(''),
  search: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const createPresetSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255),
  preset_code: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  description: z.string().max(2000).optional().nullable(),
  department_id: z.coerce.number().int().positive({ message: 'Valid department ID is required' }),
  service_category: z.string().trim().max(100).optional().default('General'),
  workflow_type: z.enum(['standard', 'custom', 'recurring_monthly', 'one_time']).optional().default('standard')
});

export const updatePresetSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  department_id: z.coerce.number().int().positive().optional(),
  service_category: z.string().trim().max(100).optional(),
  workflow_type: z.enum(['standard', 'custom', 'recurring_monthly', 'one_time']).optional()
});

export const updateVersionSettingsSchema = z.object({
  estimated_duration_days: z.coerce.number().int().min(0).optional(),
  deadline_calculation_rules: z.record(z.any()).optional().nullable(),
  default_assignee_rules: z.record(z.any()).optional().nullable(),
  revision_rules: z.record(z.any()).optional().nullable(),
  notification_config: z.record(z.any()).optional().nullable(),
  changelog: z.string().max(2000).optional().nullable()
});

export const stageSchema = z.object({
  stage_key: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Stage key must be alphanumeric slug').optional(),
  name: z.string().trim().min(2, 'Stage name is required').max(150),
  description: z.string().max(2000).optional().nullable(),
  display_order: z.coerce.number().int().min(1).optional(),
  stage_category: z.enum(['planning', 'execution', 'review', 'delivery', 'reporting', 'maintenance']).optional().default('execution'),
  allowed_next_stages: z.array(z.string()).optional().default([]),
  is_client_facing: z.boolean().optional().default(false),
  is_review_required: z.boolean().optional().default(false),
  requires_deliverable: z.boolean().optional().default(false),
  requires_client_approval: z.boolean().optional().default(false),
  reviewer_policy: z.record(z.any()).optional().nullable(),
  completion_conditions: z.record(z.any()).optional().nullable()
});

export const reorderStagesSchema = z.object({
  orders: z.array(z.object({
    stageId: z.coerce.number().int().positive(),
    displayOrder: z.coerce.number().int().positive()
  })).min(1, 'Orders array cannot be empty')
});

export const taskTemplateSchema = z.object({
  stage_id: z.coerce.number().int().positive({ message: 'Valid stage ID is required' }),
  task_key: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  title: z.string().trim().min(2, 'Task title is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
  department_id: z.coerce.number().int().positive().optional().nullable(),
  default_assignee_role: z.string().max(100).optional().nullable(),
  estimated_duration_hours: z.coerce.number().min(0).max(1000).optional().default(0),
  relative_deadline_days: z.coerce.number().int().min(1).max(365).optional().default(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  required_inputs: z.array(z.any()).optional().nullable(),
  completion_checklist: z.array(z.any()).optional().nullable(),
  expected_output: z.string().max(2000).optional().nullable(),
  requires_internal_review: z.boolean().optional().default(false),
  requires_client_approval: z.boolean().optional().default(false),
  display_order: z.coerce.number().int().min(0).optional().default(0)
});

export const reorderTasksSchema = z.object({
  orders: z.array(z.object({
    taskId: z.coerce.number().int().positive(),
    displayOrder: z.coerce.number().int().nonnegative()
  })).min(1)
});

export const dependencySchema = z.object({
  dependsOnTaskId: z.coerce.number().int().positive({ message: 'Dependency task ID is required' }),
  dependencyType: z.enum(['finish_to_start', 'start_to_start']).optional().default('finish_to_start')
});
