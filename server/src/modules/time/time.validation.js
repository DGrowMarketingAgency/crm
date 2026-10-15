import { z } from 'zod';

export const startTimerSchema = z.object({
  taskId: z.union([z.string(), z.number()], { required_error: 'Task ID is required' }),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional().nullable()
});

export const stopTimerSchema = z.object({
  description: z.string().max(500, 'Description must not exceed 500 characters').optional().nullable(),
  isBillable: z.boolean().optional()
});

export const createTimeEntrySchema = z.object({
  taskId: z.union([z.string(), z.number()], { required_error: 'Task ID is required' }),
  workDate: z
    .string({ required_error: 'Work date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Work date must be in YYYY-MM-DD format'),
  durationMinutes: z
    .number({ required_error: 'Duration in minutes is required' })
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours (1440 minutes)'),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional().nullable(),
  isBillable: z.boolean().optional().default(true),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  endedAt: z.string().datetime({ offset: true }).optional().nullable()
});

export const updateTimeEntrySchema = z.object({
  workDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Work date must be in YYYY-MM-DD format')
    .optional(),
  durationMinutes: z
    .number()
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours (1440 minutes)')
    .optional(),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional().nullable(),
  isBillable: z.boolean().optional()
});

export const createTimesheetSchema = z.object({
  periodStart: z
    .string({ required_error: 'Period start date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Period start date must be in YYYY-MM-DD format'),
  periodEnd: z
    .string({ required_error: 'Period end date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Period end date must be in YYYY-MM-DD format')
}).refine((data) => data.periodEnd >= data.periodStart, {
  message: 'Period end date cannot be earlier than period start date',
  path: ['periodEnd']
});

export const rejectTimesheetSchema = z.object({
  reviewerComment: z
    .string({ required_error: 'Rejection reason explaining the required changes is required' })
    .min(5, 'Rejection explanation must be at least 5 characters long')
    .max(2000, 'Rejection explanation must not exceed 2000 characters')
});
