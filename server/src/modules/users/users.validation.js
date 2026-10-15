import { z } from 'zod';

export const createUserSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
  roleIds: z
    .array(z.number().int().positive())
    .optional()
    .default([]),
  designations: z
    .array(z.string().trim().min(1))
    .optional()
    .default([]),
  department: z
    .enum(['SEO', 'PerformanceMarketing', 'Content', 'Design', 'Video', 'Dev', 'BD', 'HR', 'Leadership'])
    .nullable()
    .optional(),
  phone: z
    .string()
    .max(20)
    .optional()
    .default(''),
  status: z
    .enum(['active', 'inactive', 'suspended'])
    .optional()
    .default('active')
});

export const updateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address')
    .optional(),
  designations: z
    .array(z.string().trim().min(1))
    .optional(),
  department: z
    .enum(['SEO', 'PerformanceMarketing', 'Content', 'Design', 'Video', 'Dev', 'BD', 'HR', 'Leadership'])
    .nullable()
    .optional(),
  phone: z
    .string()
    .max(20)
    .optional()
});

export const changeStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended'], {
    required_error: 'Status is required'
  })
});

export const createInvitationSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  roleIds: z
    .array(z.number().int().positive())
    .optional()
    .default([]),
  designations: z
    .array(z.string().trim().min(1))
    .optional()
    .default([]),
  department: z
    .enum(['SEO', 'PerformanceMarketing', 'Content', 'Design', 'Video', 'Dev', 'BD', 'HR', 'Leadership'])
    .nullable()
    .optional(),
  phone: z
    .string()
    .max(20)
    .optional()
    .default('')
});

export const acceptInvitationSchema = z.object({
  token: z
    .string({ required_error: 'Invitation token is required' })
    .min(32, 'Invalid invitation token'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
});
