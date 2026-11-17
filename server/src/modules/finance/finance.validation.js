import { z } from 'zod';

const optText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');
const upper = (re, msg) => z.union([z.string().trim().toUpperCase().regex(re, msg), z.literal(''), z.null()]).optional();

export const settingsSchema = z.object({
  agency_name: z.string().trim().min(2, 'Agency name is required').max(255).optional(),
  legal_name: optText(255),
  gstin: upper(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5'),
  pan: upper(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F'),
  phone: optText(100),
  email: z.union([z.string().trim().email('Enter a valid email'), z.literal(''), z.null()]).optional(),
  website: optText(255),
  address: optText(2000),
  city: optText(100),
  state_code: z.string().regex(/^\d{2}$/).optional(),
  pincode: optText(10),
  bank_name: optText(255),
  account_name: optText(255),
  account_number: optText(40),
  ifsc: upper(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC must look like HDFC0001234'),
  branch: optText(255),
  upi_id: optText(100),
  gpay_number: optText(30),
  signatory_name: optText(255),
  signatory_title: optText(255),
  terms_scope: optText(5000),
  terms_payment: optText(5000),
  terms_third_party: optText(5000),
  terms_confidentiality: optText(5000),
  terms_cancellation: optText(5000),
  default_payment_terms_days: z.coerce.number().int().min(0).max(365).optional()
});

export const seriesSchema = z.object({
  prefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9\-/]+$/, 'Prefix may use letters, digits, - and /').optional(),
  nextNumber: z.coerce.number().int().min(1).max(99999999).optional(),
  padding: z.coerce.number().int().min(1).max(8).optional(),
  fyReset: z.boolean().optional()
});

export const clientBillingSchema = z.object({
  gstin: upper(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5'),
  pan: upper(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F'),
  billingAddress: optText(2000),
  city: optText(100),
  stateCode: z.union([z.string().regex(/^\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  pincode: optText(10),
  paymentTermsDays: z.union([z.coerce.number().int().min(0).max(365), z.null()]).optional()
});

export const serviceTaxSchema = z.object({
  sacCode: optText(20),
  defaultRate: z.union([z.coerce.number().min(0).max(100000000), z.null()]).optional(),
  gstRate: z.coerce.number().min(0).max(28),
  billingDetails: optText(5000)
});

const line = z.object({
  serviceId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  description: z.string().trim().min(1, 'Every line needs a service name').max(500),
  details: optText(5000),
  sacCode: optText(20),
  quantity: z.coerce.number().positive('Quantity must be more than 0').max(100000),
  unitPrice: z.coerce.number().min(0).max(100000000),
  discountAmount: z.coerce.number().min(0).max(100000000).optional(),
  gstRate: z.coerce.number().refine((v) => [0, 0.25, 3, 5, 12, 18, 28].includes(v), 'GST rate must be 0, 0.25, 3, 5, 12, 18 or 28').optional()
});

export const invoiceSchema = z.object({
  invoiceType: z.enum(['INV', 'INC', 'IND']),
  clientId: z.coerce.number().int().positive(),
  projectId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  invoiceDate: isoDate,
  dueDate: z.union([isoDate, z.literal(''), z.null()]).optional().transform((v) => v || null),
  placeStateCode: z.union([z.string().regex(/^\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => v || null),
  paymentTerms: optText(255),
  notes: optText(5000),
  items: z.array(line).min(1, 'Add at least one line').max(100),
  issue: z.boolean().optional()
});

export const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for cancelling').max(1000) });
