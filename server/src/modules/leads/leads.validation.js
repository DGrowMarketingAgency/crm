import { z } from 'zod';

export const createLeadSchema = z.object({
  pipelineEntity: z.enum(['D-Grow', 'MedGrowDigi', 'Mediqora']).default('D-Grow'),
  stage: z.string().max(60).optional(),
  title: z.string().min(2, 'Title must be at least 2 characters').max(255),
  companyName: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  estimatedValue: z.number().int().nonnegative().optional().nullable(),
  ownerUserId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const updateLeadSchema = z.object({
  pipelineEntity: z.enum(['D-Grow', 'MedGrowDigi', 'Mediqora']).optional(),
  stage: z.string().max(60).optional(),
  title: z.string().min(2).max(255).optional(),
  companyName: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  estimatedValue: z.number().int().nonnegative().optional().nullable(),
  ownerUserId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const convertLeadSchema = z.object({
  accountManagerId: z.number().int().positive().optional().nullable()
});

