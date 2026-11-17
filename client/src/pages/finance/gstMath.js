// Mirror of server/src/modules/finance/gst.js so the builder previews exactly what the server will save.
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function calculateInvoice({ invoiceType, placeStateCode, agencyStateCode, items }) {
  const taxed = invoiceType !== 'IND';
  const intra = String(placeStateCode) === String(agencyStateCode);
  const lines = items.map((it) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const rate = Math.max(0, Number(it.unitPrice) || 0);
    const base = round2(qty * rate);
    const discount = Math.min(base, Math.max(0, round2(it.discountAmount || 0)));
    const taxable = round2(base - discount);
    const gstRate = taxed ? Math.max(0, Number(it.gstRate) || 0) : 0;
    const cgst = taxed && intra ? round2((taxable * gstRate) / 200) : 0;
    const igst = taxed && !intra ? round2((taxable * gstRate) / 100) : 0;
    return { taxable, cgst, sgst: cgst, igst, lineTotal: round2(taxable + 2 * cgst + igst) };
  });
  const sum = (k) => round2(lines.reduce((a, l) => a + l[k], 0));
  const taxable = sum('taxable');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const exact = round2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  return { lines, intra, taxable, cgst, sgst, igst, tax: round2(cgst + sgst + igst), roundOff: round2(total - exact), total };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const three = (n) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');

export function amountInWords(amount) {
  const v = round2(Math.abs(Number(amount) || 0));
  let r = Math.floor(v);
  const paise = Math.round((v - r) * 100);
  const parts = [];
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const lk = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push(`${three(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (r) parts.push(three(r));
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

export const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (v) => `₹${Math.round(Number(v || 0)).toLocaleString('en-IN')}`;

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return dt.toISOString().slice(0, 10);
};

export const INVOICE_TYPES = {
  INV: { label: 'GST Invoice', hint: 'Taxable invoice (CGST + SGST or IGST).', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  INC: { label: 'GST Invoice — registered client', hint: 'For clients with a GSTIN (B2B); GSTIN required.', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  IND: { label: 'Non-GST Invoice', hint: 'No tax charged; separate IND number series.', badge: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export const INVOICE_STATUS = {
  draft: ['Draft', 'bg-slate-100 text-slate-600'],
  issued: ['Issued', 'bg-blue-50 text-blue-700'],
  partially_paid: ['Partly paid', 'bg-amber-50 text-amber-700'],
  paid: ['Paid', 'bg-emerald-50 text-emerald-700'],
  overdue: ['Overdue', 'bg-red-50 text-red-700'],
  void: ['Cancelled', 'bg-red-50 text-red-700']
};

export const GST_RATES = [0, 5, 12, 18, 28];
