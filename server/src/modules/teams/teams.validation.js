import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z
    .string({ required_error: 'Team name is required' })
    .trim()
    .min(2, 'Team name must be at least 2 characters')
    .max(100, 'Team name cannot exceed 100 characters'),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable(),
  status: z
    .enum(['active', 'inactive'])
    .optional()
    .default('active'),
  leaderId: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
  memberIds: z
    .array(z.number().int().positive())
    .optional()
    .default([])
});

export const updateTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Team name must be at least 2 characters')
    .max(100, 'Team name cannot exceed 100 characters')
    .optional(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable(),
  status: z
    .enum(['active', 'inactive'])
    .optional()
});

export const addMemberSchema = z.object({
  userId: z
    .number({ required_error: 'User ID is required' })
    .int()
    .positive(),
  teamRole: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default('member')
});

export const assignLeaderSchema = z.object({
  leaderId: z
    .number({ required_error: 'Leader ID is required' })
    .int()
    .positive()
});
