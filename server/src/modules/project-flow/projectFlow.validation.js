import { z } from 'zod';

const id = z.coerce.number().int().positive();
const optionalId = z.union([id, z.null()]).optional();
const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD'), z.literal(''), z.null()])
  .optional()
  .transform((v) => v || null);

const pipelineStep = z.object({
  name: z.string().trim().min(1, 'Every step needs a name').max(255),
  description: z.string().max(2000).optional().nullable(),
  stepType: z.enum(['work', 'approval']).default('work'),
  needsAdminApproval: z.boolean().optional(),
  needsClientApproval: z.boolean().optional(),
  estDays: z.coerce.number().int().min(0).max(365).optional().nullable()
});

export const pipelineSchema = z.object({
  name: z.string().trim().min(2, 'Pipeline name is required').max(255),
  description: z.string().max(5000).optional().nullable(),
  serviceId: optionalId,
  status: z.enum(['active', 'archived']).optional(),
  steps: z.array(pipelineStep).min(1, 'Add at least one step').max(50)
});

export const pipelineStatusSchema = z.object({ status: z.enum(['active', 'archived']) });

export const createProjectSchema = z
  .object({
    clientId: id,
    name: z.string().trim().min(2, 'Project name is required').max(255),
    description: z.string().max(5000).optional().nullable(),
    category: z.enum(['regular', 'one_time', 'urgent', 'out_of_service']),
    serviceId: optionalId,
    pipelineId: optionalId,
    assignmentMode: z.enum(['individual', 'team']),
    assigneeId: optionalId,
    teamLeaderId: optionalId,
    stepAssignees: z.record(z.array(id)).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    monthlyDeliverables: z
      // Blank rows from the form are tolerated and dropped by the service.
      .array(z.object({ label: z.string().trim().max(120).default(''), qty: z.coerce.number().int().min(0).max(1000).default(0) }))
      .max(30)
      .optional(),
    billingAmount: z.coerce.number().min(0).optional().nullable()
  })
  .refine((d) => !d.startDate || !d.dueDate || d.dueDate >= d.startDate, {
    message: 'Due date cannot be before start date',
    path: ['dueDate']
  });

export const stepAssigneesSchema = z.object({ userIds: z.array(id).min(1, 'Assign at least one person').max(50) });
export const approveSchema = z.object({ kind: z.enum(['admin', 'client']) });
export const requestChangesSchema = z.object({ note: z.string().max(2000).optional().nullable() });
export const billingSchema = z.object({
  billingAmount: z.coerce.number().min(0).optional().nullable(),
  billingStatus: z.enum(['unbilled', 'billed', 'paid']).optional()
});
export const retainerBillingSchema = z.object({
  amount: z.union([z.coerce.number().min(0).max(100000000), z.null()]).optional(),
  invoiceType: z.enum(['INV', 'INC', 'IND']).optional(),
  autoInvoice: z.boolean()
});
export const projectStatusSchema = z.object({ status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']) });

export const trackerSchema = z.object({ action: z.enum(['start', 'pause', 'complete']) });

export const employeeTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Task title is required').max(255),
        description: z.string().max(5000).optional().nullable(),
        stepId: optionalId,
        targetQty: z.coerce.number().int().min(1).max(100000).optional().nullable(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        startDate: optionalDate,
        dueDate: optionalDate
      })
    )
    .min(1, 'Add at least one task')
    .max(100)
});
