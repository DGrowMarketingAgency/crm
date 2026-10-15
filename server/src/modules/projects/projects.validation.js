import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(255),
  projectCode: z
    .string()
    .min(2, 'Project code must be at least 2 characters')
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Project code may only contain alphanumeric characters, underscores, and dashes'),
  description: z.string().optional().nullable(),
  clientId: z.number().int().positive().optional().nullable(),
  projectManagerId: z.number().int().positive('Project manager is required'),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).default('planning'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  visibility: z.enum(['internal', 'client_facing']).default('internal'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format').optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format').optional().nullable(),
  objectives: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  workflowPresetId: z.number().int().positive().optional().nullable(),
  workflowPresetVersionId: z.number().int().positive().optional().nullable(),
  serviceInstanceId: z.number().int().positive().optional().nullable(),
  teamIds: z.array(z.number().int().positive()).optional().default([]),
  memberIds: z.array(z.number().int().positive()).optional().default([])
});

export const updateProjectSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().optional().nullable(),
  clientId: z.number().int().positive().optional().nullable(),
  projectManagerId: z.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  visibility: z.enum(['internal', 'client_facing']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  objectives: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  workflowPresetId: z.number().int().positive().optional().nullable(),
  workflowPresetVersionId: z.number().int().positive().optional().nullable(),
  serviceInstanceId: z.number().int().positive().optional().nullable()
});

export const changeProjectStatusSchema = z.object({
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Invalid project status' })
  })
});

export const updateProjectMembersSchema = z.object({
  members: z.array(
    z.object({
      userId: z.number().int().positive(),
      projectRole: z.enum(['manager', 'member', 'client']).default('member')
    })
  )
});

export const updateProjectTeamsSchema = z.object({
  teamIds: z.array(z.number().int().positive())
});
