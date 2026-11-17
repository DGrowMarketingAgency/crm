// GST helpers: state codes, tax split, rounding, amount in words. Pure functions (no DB).

export const INDIAN_STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'], ['96', 'Other Country (export)']
].map(([code, name]) => ({ code, name }));

export const stateByCode = (code) => INDIAN_STATES.find((s) => s.code === String(code || '').padStart(2, '0')) || null;

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** The first two digits of a GSTIN are the registration state's code. */
export const stateCodeFromGstin = (gstin) => (gstin && GSTIN_REGEX.test(gstin) ? gstin.slice(0, 2) : null);

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/**
 * Computes every line and the invoice totals.
 * IND (non-GST) carries no tax. Same state as the agency = CGST + SGST (half each); otherwise IGST.
 * The grand total is rounded to the nearest rupee and the difference kept as round_off.
 */
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
    const sgst = cgst;
    const igst = taxed && !intra ? round2((taxable * gstRate) / 100) : 0;
    return {
      ...it,
      quantity: qty,
      unitPrice: rate,
      base,
      discountAmount: discount,
      discountPercent: base > 0 ? round2((discount / base) * 100) : 0,
      taxableAmount: taxable,
      gstRate,
      cgst,
      sgst,
      igst,
      lineTotal: round2(taxable + cgst + sgst + igst)
    };
  });
  const sum = (k) => round2(lines.reduce((a, l) => a + l[k], 0));
  const subtotal = sum('base');
  const discount = sum('discountAmount');
  const taxable = sum('taxableAmount');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const tax = round2(cgst + sgst + igst);
  const exact = round2(taxable + tax);
  const total = Math.round(exact);
  return {
    lines,
    supplyType: intra ? 'intra' : 'inter',
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    roundOff: round2(total - exact),
    total
  };
}

/** Indian financial year label for a date, e.g. 2026-11-14 → "2026-27". */
export function financialYear(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatDocNumber({ prefix, padding, fyReset }, number, fy) {
  const n = String(number).padStart(padding || 1, '0');
  return fyReset ? `${prefix}/${fy}/${n}` : `${prefix}${n}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

/** 125050.5 → "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only" (Indian grouping). */
export function amountInWords(amount) {
  const value = round2(Math.abs(Number(amount) || 0));
  let rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  const words = parts.join(' ') || 'Zero';
  return `Rupees ${words}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}
