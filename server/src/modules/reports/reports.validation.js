import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const dateRangeSchema = z.object({
  period: z.enum(['today', 'last_7_days', 'last_30_days', 'this_month', 'previous_month', 'custom']).optional(),
  startDate: z.string().regex(dateRegex, 'Invalid startDate format (YYYY-MM-DD)').optional(),
  endDate: z.string().regex(dateRegex, 'Invalid endDate format (YYYY-MM-DD)').optional()
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
  path: ['endDate']
});

export const projectReportQuerySchema = dateRangeSchema.and(z.object({
  clientId: z.coerce.number().int().positive().optional(),
  managerId: z.coerce.number().int().positive().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'status', 'created_at', 'due_date', 'task_completion_rate', 'milestone_completion_rate', 'approved_hours']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
}));

export const taskReportQuerySchema = dateRangeSchema.and(z.object({
  projectId: z.coerce.number().int().positive().optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['title', 'due_date', 'created_at', 'completed_at', 'priority', 'status', 'days_overdue']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
}));

export const timeReportQuerySchema = dateRangeSchema.and(z.object({
  projectId: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  isBillable: z.enum(['true', 'false', '1', '0']).optional(),
  approvalStatus: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional()
}));

export const exportReportSchema = z.object({
  reportType: z.enum([
    'dashboard',
    'projects',
    'tasks',
    'overdue_tasks',
    'teams',
    'time_summary',
    'project_hours',
    'employee_hours',
    'clients'
  ]),
  format: z.enum(['csv', 'xlsx']).default('csv'),
  period: z.enum(['today', 'last_7_days', 'last_30_days', 'this_month', 'previous_month', 'custom']).optional(),
  startDate: z.string().regex(dateRegex, 'Invalid startDate format (YYYY-MM-DD)').optional(),
  endDate: z.string().regex(dateRegex, 'Invalid endDate format (YYYY-MM-DD)').optional(),
  projectId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  columns: z.array(z.string().max(50)).optional()
});
