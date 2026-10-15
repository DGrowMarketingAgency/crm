import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z
    .string({ required_error: 'Role name is required' })
    .trim()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name cannot exceed 100 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable()
});

export const updateRoleSchema = z.object({
  name: z
    .string({ required_error: 'Role name is required' })
    .trim()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name cannot exceed 100 characters'),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable()
});

export const setRolePermissionsSchema = z.object({
  permissionIds: z
    .array(z.number().int().positive(), {
      required_error: 'permissionIds must be an array of permission IDs'
    })
});

export const setUserRolesSchema = z.object({
  roleIds: z
    .array(z.number().int().positive(), {
      required_error: 'roleIds must be an array of role IDs'
    })
});
