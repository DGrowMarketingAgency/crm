import { z } from 'zod';

export const credentialCategories = [
  'Social Media',
  'Website Administration',
  'Hosting and Domain',
  'Email Services',
  'SEO Tools',
  'Advertising Accounts',
  'Analytics',
  'Business Listings',
  'Other'
];

export const accessLevels = [
  'metadata_only',
  'view_credentials',
  'edit_credentials',
  'manage_access'
];

export const createCredentialSchema = z.object({
  client_id: z.union([z.string(), z.number()]).optional(),
  project_id: z.union([z.string(), z.number()]).optional().nullable(),
  platform_name: z.string({ required_error: 'Platform or service name is required' }).min(1).max(255),
  category: z.enum(credentialCategories).default('Other'),
  login_url: z.string().max(1000).optional().nullable(),
  username: z.string({ required_error: 'Username or login email is required' }).min(1).max(255),
  password: z.string({ required_error: 'Password is required' }).min(1).max(1000),
  recovery_email: z.string().email('Invalid recovery email').max(255).optional().nullable().or(z.literal('')),
  recovery_phone: z.string().max(50).optional().nullable().or(z.literal('')),
  account_id: z.string().max(255).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  internal_notes: z.string().max(5000).optional().nullable(),
  additional_fields: z.record(z.any()).optional().nullable()
});

export const updateCredentialSchema = z.object({
  platform_name: z.string().min(1).max(255).optional(),
  category: z.enum(credentialCategories).optional(),
  login_url: z.string().max(1000).optional().nullable(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(1000).optional(),
  recovery_email: z.string().email('Invalid recovery email').max(255).optional().nullable().or(z.literal('')),
  recovery_phone: z.string().max(50).optional().nullable().or(z.literal('')),
  account_id: z.string().max(255).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  internal_notes: z.string().max(5000).optional().nullable(),
  project_id: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.enum(['active', 'archived', 'revoked']).optional(),
  additional_fields: z.record(z.any()).optional().nullable()
});

export const grantAccessSchema = z.object({
  employee_id: z.union([z.string(), z.number()], { required_error: 'Employee is required' }),
  access_level: z.enum(accessLevels, { required_error: 'Access level is required' }).default('view_credentials'),
  access_reason: z.string().max(1000).optional().nullable(),
  expires_at: z.string().datetime({ offset: true }).optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/, 'Invalid date format')).or(z.literal(''))
});

export const updateGrantSchema = z.object({
  access_level: z.enum(accessLevels).optional(),
  access_reason: z.string().max(1000).optional().nullable(),
  expires_at: z.string().datetime({ offset: true }).optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/, 'Invalid date format')).or(z.literal(''))
});

export const listCredentialsQuerySchema = z.object({
  clientId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50')
});
