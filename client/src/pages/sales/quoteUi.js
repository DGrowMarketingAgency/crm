import { calculateInvoice, round2 } from '../finance/gstMath';

export const QUOTE_STATUS = {
  requested: ['Awaiting price', 'bg-amber-50 text-amber-700'],
  draft: ['Draft', 'bg-slate-100 text-slate-600'],
  sent: ['Sent to client', 'bg-sky-50 text-sky-700'],
  viewed: ['Viewed by client', 'bg-violet-50 text-violet-700'],
  negotiating: ['In negotiation', 'bg-orange-50 text-orange-700'],
  approved: ['Accepted', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Declined', 'bg-red-50 text-red-700'],
  converted: ['Converted to invoice', 'bg-emerald-100 text-emerald-800'],
  expired: ['Expired', 'bg-slate-100 text-slate-500'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-500']
};

const OPEN = ['sent', 'viewed', 'negotiating'];
/** Same rules as the server, for list rows (the quotation page uses the server's own flags). */
export const quoteRules = (q, { canPrice, userId }) => ({
  edit: (q.status === 'requested' && (canPrice || Number(q.requested_by) === Number(userId))) || (canPrice && (q.status === 'draft' || OPEN.includes(q.status))),
  cancel: canPrice && ['requested', 'draft', ...OPEN].includes(q.status),
  delete: (q.status === 'requested' && (canPrice || Number(q.requested_by) === Number(userId))) || (canPrice && ['draft', 'cancelled', 'rejected', 'expired'].includes(q.status))
});

export const ROUND_LABEL = {
  requested: 'Requested', priced: 'Priced & sent', client_request: 'Client asked to negotiate',
  revision: 'Revised quotation sent', accepted: 'Accepted', rejected: 'Declined', cancelled: 'Cancelled'
};

/** Same maths as the server: quotation-level discount spread across lines by value, then GST. */
export function quoteTotals(items, { gstMode, discountAmount = 0, placeStateCode = '33', agencyStateCode = '33' }) {
  const bases = items.map((it) => round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)));
  const subtotal = round2(bases.reduce((a, b) => a + b, 0));
  const discount = Math.min(subtotal, Math.max(0, round2(discountAmount)));
  let left = discount;
  const lines = items.map((it, i) => {
    const share = i === items.length - 1 ? left : round2(subtotal ? (discount * bases[i]) / subtotal : 0);
    left = round2(left - share);
    return { quantity: it.quantity, unitPrice: Number(it.unitPrice) || 0, discountAmount: share, gstRate: gstMode === 'gst' ? Number(it.gstRate ?? 18) : 0 };
  });
  // The shared invoice helper returns taxable/tax/total only; add subtotal and discount for display.
  return { ...calculateInvoice({ invoiceType: gstMode === 'gst' ? 'INV' : 'IND', placeStateCode, agencyStateCode, items: lines }), subtotal, discount };
}
