import { z } from 'zod';

export const executeWorkflowSchema = z.object({
  triggerType: z.enum(['service_activation', 'project_start', 'milestone_activation', 'manual']).default('manual'),
  workflowPresetId: z.coerce.number().int().positive({ message: 'Valid workflow preset ID is required' }),
  workflowPresetVersionId: z.coerce.number().int().positive().optional().nullable(),
  clientId: z.coerce.number().int().positive().optional().nullable(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  serviceInstanceId: z.coerce.number().int().positive().optional().nullable(),
  milestoneId: z.coerce.number().int().positive().optional().nullable(),
  startDate: z.string().optional().nullable(),
  executionKey: z.string().max(120).optional().nullable()
});

export const previewWorkflowSchema = z.object({
  workflowPresetId: z.coerce.number().int().positive({ message: 'Valid workflow preset ID is required' }),
  workflowPresetVersionId: z.coerce.number().int().positive().optional().nullable(),
  clientId: z.coerce.number().int().positive().optional().nullable(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  serviceInstanceId: z.coerce.number().int().positive().optional().nullable(),
  milestoneId: z.coerce.number().int().positive().optional().nullable(),
  startDate: z.string().optional().nullable()
});

export const listExecutionsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  serviceInstanceId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  status: z.enum(['', 'pending', 'running', 'completed', 'partially_failed', 'failed']).optional().default(''),
  triggerType: z.enum(['', 'service_activation', 'project_start', 'milestone_activation', 'manual']).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const evaluateDependenciesSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  taskId: z.coerce.number().int().positive().optional()
});
