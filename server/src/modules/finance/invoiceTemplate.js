import { renderBusinessDocument, agencyInfo, termSections, rs, dmy, words } from './documentTemplate.js';

const TITLES = { INV: 'TAX INVOICE', INC: 'TAX INVOICE', IND: 'INVOICE' };

/** Client address as lines: billing address (or address), then "City - PIN, State, India." like IND0045. */
export function partyAddressLines({ address, city, pincode, state }) {
  const lines = String(address || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const tail = [[city, pincode].filter(Boolean).join(' - '), state].filter(Boolean).join(', ');
  if (tail && !lines.some((l) => (city && l.includes(city)) || (pincode && l.includes(pincode)))) lines.push(`${tail}, India.`);
  return lines;
}

/** Printable A4 invoice in the agency's own layout (see documentTemplate.js). */
export function renderTaxInvoice({ invoice: inv, items, payments }, settings, assetBase) {
  const taxed = inv.invoice_type !== 'IND';
  const intra = inv.supply_type === 'intra';
  const draft = inv.status === 'draft';
  const cancelled = inv.status === 'void';

  const lines = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unit_price) || 0;
    const base = Math.round(qty * rate * 100) / 100;
    const extra = [];
    if (qty !== 1) extra.push(`Qty ${qty} × ${rs(rate)}`);
    if (Number(it.discount_amount)) extra.push(`Discount ${rs(it.discount_amount)}`);
    return {
      service: it.item_description,
      sac: it.sac_code,
      details: [it.details, extra.join(' · ')].filter(Boolean).join('\n'),
      gst: taxed ? `${Number(it.tax_rate)}%` : null,
      amount: base
    };
  });
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const discount = items.reduce((a, it) => a + Number(it.discount_amount || 0), 0);
  const totals = [['Sub Total', rs(subtotal)]];
  if (discount) totals.push(['Discount', `- ${rs(discount)}`]);
  if (taxed && intra) totals.push([`CGST`, rs(inv.cgst_amount)], [`SGST`, rs(inv.sgst_amount)]);
  if (taxed && !intra) totals.push(['IGST', rs(inv.igst_amount)]);
  totals.push(['Round Off', rs(inv.round_off)]);

  const paid = (payments || []).filter((p) => p.payment_status === 'completed').reduce((a, p) => a + Number(p.amount), 0);
  const after = [];
  if (paid) after.push(['Received', rs(paid)], ['Balance Due', rs(inv.outstanding_balance), '#1f2937']);
  if (cancelled) after.push(['Cancelled by credit note', inv.credit_note_number || '', '#b91c1c']);

  return renderBusinessDocument({
    title: TITLES[inv.invoice_type] || 'INVOICE',
    number: inv.invoice_number,
    agency: agencyInfo(settings),
    assetBase,
    stamp: draft ? 'DRAFT' : cancelled ? 'CANCELLED' : null,
    metaLeft: [
      ['# Invoice', draft ? 'DRAFT (number on issue)' : inv.invoice_number],
      ['Date', dmy(inv.invoice_date)],
      ['Terms', inv.payment_terms || '100% payment in advance'],
      ['Due Date', dmy(inv.due_date)]
    ],
    metaRight: [
      ['Place of Supply', inv.place_of_supply],
      ...(inv.project_name ? [['Project', inv.project_name]] : [])
    ],
    partyLabel: 'Billed To',
    party: {
      name: inv.client_company || inv.client_name,
      addressLines: partyAddressLines({
        address: inv.client_billing_address || inv.client_address,
        city: inv.client_city,
        pincode: inv.client_pincode,
        state: inv.client_state
      }),
      phone: inv.client_phone,
      gstin: inv.client_gstin
    },
    items: lines,
    showGst: taxed,
    totals,
    grandTotal: inv.total_amount,
    after,
    words: words(inv.total_amount),
    notes: inv.notes,
    terms: termSections(settings)
  });
}
