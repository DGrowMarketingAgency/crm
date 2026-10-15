import { z } from 'zod';

export const createMilestoneSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
  displayOrder: z.number().int().optional()
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  displayOrder: z.number().int().optional()
});

export const changeMilestoneStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Invalid milestone status' })
  })
});

export const reorderMilestonesSchema = z.object({
  orders: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int()
    })
  ).min(1, 'Orders array must not be empty')
});
