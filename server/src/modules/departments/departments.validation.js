import { z } from 'zod';

export const listDepartmentsQuerySchema = z.object({
  search: z.string().optional().default(''),
  status: z.enum(['', 'active', 'inactive', 'archived']).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(150),
  code: z.string().trim().min(2, 'Department code must be at least 2 characters').max(50).regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain alphanumeric characters, underscores, and hyphens').optional(),
  description: z.string().max(2000).optional().nullable(),
  manager_id: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).optional().default('active')
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/).optional(),
  description: z.string().max(2000).optional().nullable(),
  manager_id: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).optional()
});

export const addDepartmentMemberSchema = z.object({
  userId: z.coerce.number().int().positive({ message: 'Valid user ID is required' }),
  roleInDepartment: z.string().max(100).optional().default('member'),
  isPrimary: z.boolean().optional().default(false)
});
