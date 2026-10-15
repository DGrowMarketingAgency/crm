import { z } from 'zod';

const LIFECYCLE_ENUM = z.enum([
  'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6',
  'lead', 'qualified', 'proposal', 'won', 'onboarding', 'active', 'paused', 'completed', 'offboarded'
]);

const STATUS_ENUM = z.enum(['active', 'inactive', 'paused', 'offboarded', 'onboarding']);

const SERVICE_STATUS_ENUM = z.enum(['draft', 'pending_activation', 'active', 'paused', 'completed', 'cancelled']);

export const createClientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters').max(255),
  clientCode: z.string().max(50).optional().nullable(),
  email: z.string().email('Valid email is required').max(255),
  companyName: z.string().max(255).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).default('India'),
  billingAddress: z.string().optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  entity: z.enum(['D-Grow', 'MedGrowDigi']).default('D-Grow'),
  vertical: z.enum(['Healthcare', 'General']).default('General'),
  lifecycleStage: LIFECYCLE_ENUM.default('onboarding'),
  accountManagerId: z.number().int().positive().optional().nullable(),
  onboardingOwnerId: z.number().int().positive().optional().nullable(),
  requirementsNotes: z.string().optional().nullable(),
  communicationPreferences: z.any().optional().nullable(),
  contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  contractEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  status: STATUS_ENUM.default('active'),
  userId: z.number().int().positive().optional().nullable(),
  primaryContact: z.object({
    name: z.string().min(2).max(255),
    designation: z.string().max(150).optional().nullable(),
    email: z.string().email().max(255),
    phone: z.string().max(50).optional().nullable()
  }).optional()
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  clientCode: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional(),
  companyName: z.string().max(255).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional(),
  billingAddress: z.string().optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  entity: z.enum(['D-Grow', 'MedGrowDigi']).optional(),
  vertical: z.enum(['Healthcare', 'General']).optional(),
  lifecycleStage: LIFECYCLE_ENUM.optional(),
  accountManagerId: z.number().int().positive().optional().nullable(),
  onboardingOwnerId: z.number().int().positive().optional().nullable(),
  requirementsNotes: z.string().optional().nullable(),
  communicationPreferences: z.any().optional().nullable(),
  contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  contractEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  status: STATUS_ENUM.optional(),
  userId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const updateLifecycleSchema = z.object({
  lifecycleStage: LIFECYCLE_ENUM.optional(),
  stage: LIFECYCLE_ENUM.optional(),
  reason: z.string().max(1000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
}).refine(data => data.lifecycleStage || data.stage, {
  message: 'Either lifecycleStage or stage must be provided'
});

export const assignAccountManagerSchema = z.object({
  accountManagerId: z.number().int().positive('Valid Account Manager ID is required'),
  reason: z.string().max(500).optional().nullable()
});

export const clientContactSchema = z.object({
  name: z.string().min(2, 'Contact name must be at least 2 characters').max(255),
  designation: z.string().max(150).optional().nullable(),
  email: z.string().email('Valid business email is required').max(255),
  phone: z.string().max(50).optional().nullable(),
  isPrimary: z.boolean().default(false),
  status: z.enum(['active', 'inactive']).default('active'),
  portalAccessEnabled: z.boolean().default(false)
});

export const updateClientContactSchema = clientContactSchema.partial();

export const onboardingItemSchema = z.object({
  title: z.string().min(2, 'Checklist item title is required').max(255),
  description: z.string().optional().nullable(),
  ownerUserId: z.number().int().positive().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  notes: z.string().optional().nullable()
});

export const updateOnboardingItemSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().optional().nullable(),
  ownerUserId: z.number().int().positive().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  isCompleted: z.boolean().optional(),
  notes: z.string().optional().nullable()
});

export const createClientServiceSchema = z.object({
  label: z.string().min(2, 'Service label is required').max(255).optional(),
  serviceCode: z.string().optional(),
  serviceCodes: z.array(z.string()).optional(),
  serviceType: z.string().max(100).optional().nullable(),
  assigneeMap: z.record(z.any()).optional(),
  departmentId: z.number().int().positive().optional().nullable(),
  workflowPresetId: z.number().int().positive().optional().nullable(),
  workflowPresetVersionId: z.number().int().positive().optional().nullable(),
  scopeDescription: z.string().optional().nullable(),
  expectedDeliverables: z.string().optional().nullable(),
  serviceFrequency: z.string().max(60).default('Monthly'),
  cycle: z.number().int().positive().default(1),
  ownerUserId: z.number().int().positive().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  status: SERVICE_STATUS_ENUM.default('active'),
  operationalNotes: z.string().optional().nullable()
});

export const updateClientServiceSchema = createClientServiceSchema.partial();
