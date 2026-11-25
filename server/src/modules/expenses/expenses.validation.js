import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const optDate = z.union([z.literal(''), z.null(), isoDate]).optional().transform((v) => v || null);
const optText = (max = 255) => z.union([z.literal(''), z.null(), z.string().trim().max(max)]).optional().transform((v) => v || null);
const optId = z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform((v) => v || null);
const money = z.coerce.number().positive('Enter an amount').max(999999999);
const optMoney = z.union([z.literal(''), z.null(), z.coerce.number().min(0).max(999999999)]).optional().transform((v) => (v === '' || v == null ? null : v));
const MODES = ['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'auto_debit', 'other'];
const mode = z.union([z.literal(''), z.null(), z.enum(MODES)]).optional().transform((v) => v || null);

export const categorySchema = z.object({ name: z.string().trim().min(2, 'Enter a name').max(80), kind: z.enum(['expense', 'emi', 'ad_fund']).optional() });
export const subcategorySchema = z.object({ name: z.string().trim().min(2, 'Enter a name').max(80) });

export const expenseSchema = z.object({
  expenseDate: isoDate,
  categoryId: z.coerce.number().int().positive('Choose a category'),
  subcategoryId: optId,
  description: z.string().trim().min(2, 'Describe the expense').max(255),
  amount: money,
  paymentMode: mode,
  status: z.enum(['paid', 'pending']).optional(),
  paidDate: optDate,
  clientId: optId,
  payee: optText(150),
  reference: optText(120),
  isPurchase: z.coerce.boolean().optional(),
  vendorGstin: z.union([z.literal(''), z.null(), z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid GSTIN')]).optional().transform((v) => v || null),
  billNumber: optText(60),
  gstAmount: optMoney,
  notes: optText(2000)
});

export const markPaidSchema = z.object({ paidDate: optDate, paymentMode: mode, reference: optText(120) });

export const loanSchema = z.object({
  lender: z.string().trim().min(2, 'Enter the lender').max(150),
  title: z.string().trim().min(2, 'Enter a title').max(150),
  loanType: z.enum(['loan', 'emi', 'credit_card', 'other']).optional(),
  principalAmount: optMoney,
  emiAmount: money,
  dueDay: z.coerce.number().int().min(1).max(31),
  firstDueDate: isoDate,
  lastDueDate: isoDate,
  paymentMode: mode,
  accountRef: optText(120),
  reminderDaysBefore: z.coerce.number().int().min(0).max(15).optional(),
  ownerUserId: optId,
  notes: optText(2000)
});

export const closeLoanSchema = z.object({ note: optText(500) });
export const payEmiSchema = z.object({ paidDate: optDate, amount: optMoney, paymentMode: mode, reference: optText(120) });

const PLATFORMS = ['meta', 'google', 'youtube', 'linkedin', 'other'];
export const adTxnSchema = z.object({
  clientId: z.coerce.number().int().positive('Choose a client'),
  txnType: z.enum(['deposit', 'spend', 'refund', 'adjustment']),
  txnDate: optDate,
  amount: z.coerce.number().refine((v) => v !== 0, 'Enter an amount').refine((v) => Math.abs(v) <= 999999999, 'Too large'),
  campaignId: optId,
  platform: z.union([z.literal(''), z.null(), z.enum(PLATFORMS)]).optional().transform((v) => v || null),
  paymentMode: mode,
  reference: optText(120),
  notes: optText(1000)
}).refine((d) => d.txnType === 'adjustment' || d.amount > 0, { message: 'Amount must be positive', path: ['amount'] });

export const dailySpendSchema = z.object({
  clientId: z.coerce.number().int().positive('Choose a client'),
  txnDate: optDate,
  entries: z.array(z.object({ campaignId: optId, amount: z.union([z.literal(''), z.coerce.number().min(0)]).transform((v) => Number(v || 0)), notes: optText(255) })).min(1).max(50)
});

export const walletSettingsSchema = z.object({
  billingMode: z.enum(['prepaid', 'postpaid']),
  creditLimit: optMoney,
  paymentTermsDays: z.coerce.number().int().min(0).max(180).optional(),
  notes: optText(500)
});

export const campaignSchema = z.object({
  clientId: z.coerce.number().int().positive('Choose a client'),
  name: z.string().trim().min(2, 'Enter a campaign name').max(150),
  platform: z.enum(PLATFORMS),
  dailyBudget: optMoney,
  status: z.enum(['active', 'paused', 'ended']).optional(),
  startDate: optDate,
  notes: optText(1000)
});

// Borrowed money (from a person; returned in any amounts)
export const borrowingSchema = z.object({
  lenderName: z.string().trim().min(2, 'Who did you borrow from?').max(150),
  lenderPhone: optText(20),
  amount: money,
  borrowedOn: isoDate,
  receivedMode: mode,
  purpose: optText(255),
  returnBy: optDate,
  notes: optText(2000)
});

export const borrowingReturnSchema = z.object({
  amount: money,
  paidOn: isoDate,
  paymentMode: mode,
  reference: optText(100),
  notes: optText(255)
});
