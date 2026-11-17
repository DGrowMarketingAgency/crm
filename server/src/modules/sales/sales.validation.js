import { z } from 'zod';

const optText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();
const optId = z.union([z.coerce.number().int().positive(), z.null()]).optional();
const optDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null);

export const leadSchema = z.object({
  title: z.string().trim().min(2, 'Give the lead a name').max(255),
  companyName: optText(255),
  contactName: optText(255),
  email: z.union([z.string().trim().email('Enter a valid email'), z.literal(''), z.null()]).optional(),
  phone: optText(50),
  source: optText(100),
  referrerName: optText(255),
  servicesInterested: optText(500),
  estimatedValue: z.union([z.coerce.number().int().min(0).max(1000000000), z.null()]).optional(),
  notes: optText(5000),
  ownerUserId: optId,
  repUserId: optId,
  stage: z.string().max(60).optional(),
  nextFollowupDate: optDate
});

export const interactionSchema = z.object({
  type: z.enum(['call', 'negotiation', 'note', 'quote_followup', 'stage_change']),
  title: z.string().trim().min(2, 'Add a short title').max(255),
  outcome: optText(5000),
  // Calls: how long the call lasted. Negotiations: the revised budget agreed in this round.
  // Blank must stay "not given": check '' / null before coercing, or '' would become 0.
  durationMinutes: z.union([z.literal(''), z.null(), z.coerce.number().int().min(0).max(1440)]).optional().transform((v) => (v === '' || v == null ? null : v)),
  revisedBudget: z.union([z.literal(''), z.null(), z.coerce.number().min(0).max(1000000000)]).optional().transform((v) => (v === '' || v == null ? null : v)),
  stageTo: z.union([z.string().max(60), z.literal(''), z.null()]).optional().transform((v) => v || null),
  nextFollowupDate: optDate
});

export const assignSchema = z.object({ ownerUserId: z.coerce.number().int().positive() });
export const onboardSchema = z.object({ accountManagerId: optId });

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Pick a date and time');

export const meetingSchema = z.object({
  leadId: optId,
  clientId: optId,
  proposalId: optId,
  title: z.string().trim().min(2, 'Add a meeting title').max(255),
  mode: z.enum(['online', 'offline']),
  startsAt: dateTime,
  location: optText(500),
  agenda: optText(5000),
  ownerUserId: optId
});

export const meetingUpdateSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  mode: z.enum(['online', 'offline']).optional(),
  status: z.enum(['scheduled', 'completed', 'rescheduled', 'cancelled']).optional(),
  startsAt: dateTime.optional(),
  location: optText(500),
  agenda: optText(5000),
  minutes: optText(10000),
  decisions: optText(5000)
});

export const proposalSchema = z.object({
  leadId: optId,
  clientId: optId,
  title: z.string().trim().min(2, 'Give the proposal a title').max(255),
  intro: optText(5000),
  billingCycle: z.enum(['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time']),
  gstMode: z.enum(['gst', 'non_gst']),
  validUntil: optDate,
  tiers: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Every package needs a name').max(100),
        price: z.coerce.number().min(0).max(1000000000),
        serviceId: optId,
        inclusions: optText(5000),
        isRecommended: z.boolean().optional()
      })
    )
    .min(1, 'Add at least one package')
    .max(5, 'At most 5 packages')
});

export const convertSchema = z.object({
  assigneeId: z.coerce.number().int().positive({ message: 'Choose who will run the project' }),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

// ── Quotations ──
const optMoney = z.union([z.literal(''), z.null(), z.coerce.number().min(0).max(1000000000)]).optional().transform((v) => (v === '' || v == null ? null : v));
const quoteItem = z.object({
  serviceId: optId,
  description: z.string().trim().min(1, 'Every service line needs a name').max(255),
  details: optText(2000),
  sacCode: optText(10),
  quantity: z.coerce.number().min(0.01).max(100000).default(1),
  unitPrice: optMoney, // ignored unless the user may price quotations
  gstRate: z.coerce.number().min(0).max(28).optional()
});
export const quoteSchema = z.object({
  leadId: optId,
  clientId: optId,
  title: z.string().trim().min(2, 'Give the quotation a title').max(255),
  requirements: optText(5000),
  terms: optText(5000),
  gstMode: z.enum(['gst', 'non_gst']).optional(),
  validUntil: optDate,
  discountAmount: z.coerce.number().min(0).max(1000000000).optional(),
  items: z.array(quoteItem).min(1, 'Add at least one service').max(30)
});
export const quoteUpdateSchema = quoteSchema.partial().extend({
  items: z.array(quoteItem).min(1).max(30).optional(),
  revisionNote: optText(500) // shown to the client when an admin edits a quotation already sent
});
export const quoteCancelSchema = z.object({ reason: optText(500) });
export const quoteReviseSchema = z.object({
  discountAmount: z.coerce.number().min(0).max(1000000000).optional(),
  items: z.array(z.object({ id: z.coerce.number().int().positive(), unitPrice: z.coerce.number().min(1).max(1000000000) })).optional(),
  note: optText(2000)
}).refine((d) => d.discountAmount != null || d.items?.length, { message: 'Change the discount or a price' });
export const quoteClientRequestSchema = z.object({ note: z.string().trim().min(2, 'Write what the client asked for').max(2000), clientAmount: optMoney });
export const quoteConvertSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the invoice date'),
  projectMode: z.enum(['auto', 'none', 'one_time', 'regular']).default('auto'),
  assigneeId: optId
});
export const quoteDecideSchema = z.object({ decision: z.enum(['accept', 'reject']), note: optText(2000) });
export const publicQuoteDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject', 'negotiate']),
  name: z.string().trim().min(2, 'Please enter your name').max(255),
  note: optText(2000),
  amount: optMoney
}).refine((d) => d.decision !== 'negotiate' || (d.note && d.note.length >= 2), { message: 'Tell us what you would like changed', path: ['note'] });

export const publicDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  tierId: optId,
  name: z.string().trim().min(2, 'Please enter your name').max(255),
  note: optText(2000)
});
