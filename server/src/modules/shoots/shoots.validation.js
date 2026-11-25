import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');
const optId = z.coerce.number().int().positive().optional();

export const addAvailabilitySchema = z
  .object({
    userId: optId,
    dates: z.array(ymd).min(1, 'Pick at least one date').max(62),
    fullDay: z.boolean().default(false),
    start: hm.optional(),
    end: hm.optional(),
    note: z.string().trim().max(255).optional().nullable()
  })
  .refine((d) => d.fullDay || (d.start && d.end), { message: 'Give a start and end time, or choose Full day', path: ['start'] })
  .refine((d) => d.fullDay || d.start < d.end, { message: 'End time must be after the start time', path: ['end'] });

export const clearDaySchema = z.object({ userId: optId, date: ymd });

export const submitMonthSchema = z.object({ userId: optId, month, done: z.boolean().default(true) });

const profileFields = {
  rateAmount: z.coerce.number().min(0).max(10000000).optional().nullable(),
  rateUnit: z.enum(['shoot', 'hour', 'day']).optional(),
  kit: z.string().trim().max(500).optional().nullable(),
  areas: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
};

export const addVideographerSchema = z.discriminatedUnion('kind', [
  // An existing staff member who shoots for us.
  z.object({ kind: z.literal('in_house'), userId: z.coerce.number().int().positive(), ...profileFields }),
  // A freelancer: we create their login and give back an invite link.
  z.object({
    kind: z.literal('freelance'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
    phone: z.string().trim().max(20).optional().default(''),
    ...profileFields
  })
]);

export const updateVideographerSchema = z.object({ ...profileFields, isActive: z.boolean().optional() });

export const monthQuerySchema = z.object({ month: month.optional(), userId: optId });

const slotFields = {
  clientId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2, 'Give the shoot a short title').max(255),
  shootType: z.enum(['Reels', 'Photo', 'Product', 'Event', 'Interview', 'Other']).default('Reels'),
  date: ymd,
  start: hm,
  end: hm,
  area: z.string().trim().min(2, 'Area is required (shown to videographers before they accept)').max(150),
  address: z.string().trim().max(500).optional().nullable(),
  mapUrl: z.string().trim().url('Map link must be a full URL').max(500).optional().nullable().or(z.literal('')),
  brief: z.string().trim().max(5000).optional().nullable(),
  payAmount: z.coerce.number().min(0).max(10000000).optional().nullable(),
  peopleNeeded: z.coerce.number().int().min(1).max(10).default(1),
  // The client's project this shoot feeds (footage completes its "Shoot" stage). null unlinks.
  projectId: z.union([z.coerce.number().int().positive(), z.null()]).optional()
};

export const createSlotSchema = z
  .object({ ...slotFields, clientVisible: z.boolean().default(true) })
  .refine((d) => d.start < d.end, { message: 'End time must be after the start time', path: ['end'] });

export const updateSlotSchema = z.object(
  Object.fromEntries(Object.entries(slotFields).filter(([k]) => k !== 'clientId').map(([k, v]) => [k, v.optional()]))
);

export const reasonSchema = z.object({ reason: z.string().trim().max(255).optional().nullable() });
export const assignSchema = z.object({ userId: z.coerce.number().int().positive(), reason: z.string().trim().max(255).optional().nullable() });
export const slotListQuerySchema = z.object({
  month: month.optional(),
  status: z.enum(['open', 'booked', 'cancelled', 'completed']).optional()
});
export const freeQuerySchema = z.object({ date: ymd, start: hm, end: hm });
export const mineQuerySchema = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });

const optionSchema = z
  .object({ date: ymd, start: hm, end: hm })
  .refine((o) => o.start < o.end, { message: 'Each option needs an end time after its start', path: ['end'] });

export const createProposalSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  title: slotFields.title,
  shootType: slotFields.shootType,
  area: slotFields.area,
  address: slotFields.address,
  mapUrl: slotFields.mapUrl,
  brief: slotFields.brief,
  payAmount: slotFields.payAmount,
  peopleNeeded: slotFields.peopleNeeded,
  message: z.string().trim().max(1000).optional().nullable(),
  options: z.array(optionSchema).min(1, 'Offer at least one date').max(5, 'Offer at most 5 dates')
});

export const respondProposalSchema = z
  .object({
    optionId: z.coerce.number().int().positive().optional(),
    noneWork: z.boolean().default(false),
    note: z.string().trim().max(1000).optional().nullable()
  })
  .refine((d) => d.noneWork || d.optionId, { message: 'Pick a date, or say none of them work', path: ['optionId'] });

export const proposalListQuerySchema = z.object({ status: z.enum(['pending', 'accepted', 'declined', 'withdrawn']).optional() });

export const attendanceSchema = z.object({
  userId: z.coerce.number().int().positive(),
  attendance: z.enum(['attended', 'no_show'])
});

export const footageSchema = z.object({
  url: z.string().trim().url('Paste the full link to the footage (Drive, Dropbox, WeTransfer…)').max(1000),
  notes: z.string().trim().max(1000).optional().nullable()
});

export const payPayoutSchema = z.object({
  paidDate: ymd.optional(),
  paymentMode: z.string().trim().max(60).optional().nullable(),
  reference: z.string().trim().max(100).optional().nullable(),
  amount: z.coerce.number().min(0).max(10000000).optional()
});

export const payoutListQuerySchema = z.object({ status: z.enum(['pending', 'paid']).optional() });
export const clientProjectsQuerySchema = z.object({ clientId: z.coerce.number().int().positive() });
