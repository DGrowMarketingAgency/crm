import { renderBusinessDocument, agencyInfo, termSections, rs, dmy, words } from '../finance/documentTemplate.js';
import { partyAddressLines } from '../finance/invoiceTemplate.js';

/**
 * Printable quotation in the same layout as the agency's invoice (IND0045).
 * @param {object} q quotation row with party_* fields (client or lead)
 * @param {Array} items sales_quotation_items rows
 * @param {object} totals quoteTotals() result (subtotal, discount, cgst, sgst, igst, roundOff, total)
 */
export function renderQuotation({ q, items, totals }, settings, assetBase) {
  const gst = q.gst_mode === 'gst';
  const lines = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unit_price) || 0;
    return {
      service: it.description,
      sac: it.sac_code,
      details: [it.details, qty !== 1 ? `Qty ${qty} × ${rs(rate)}` : ''].filter(Boolean).join('\n'),
      gst: gst ? `${Number(it.gst_rate)}%` : null,
      amount: Math.round(qty * rate * 100) / 100
    };
  });
  const rows = [['Sub Total', rs(totals.subtotal)]];
  if (totals.discount) rows.push(['Discount', `- ${rs(totals.discount)}`]);
  if (gst && totals.igst) rows.push(['IGST', rs(totals.igst)]);
  if (gst && !totals.igst) rows.push(['CGST', rs(totals.cgst)], ['SGST', rs(totals.sgst)]);
  rows.push(['Round Off', rs(totals.roundOff)]);

  const expired = q.expired;
  const status = { approved: 'ACCEPTED', converted: 'ACCEPTED', cancelled: 'CANCELLED', rejected: 'DECLINED' }[q.status] || (expired ? 'EXPIRED' : null);

  return renderBusinessDocument({
    title: 'QUOTATION',
    number: q.quote_number,
    agency: agencyInfo(settings),
    assetBase,
    stamp: status && status !== 'ACCEPTED' ? status : null,
    metaLeft: [
      ['# Quotation', q.quote_number],
      ['Date', dmy(q.quote_date)],
      ['Valid Until', dmy(q.valid_until)]
    ],
    metaRight: [
      ['Place of Supply', q.party_state || settings.state || 'Tamil Nadu'],
      ...(q.title ? [['Subject', q.title]] : [])
    ],
    partyLabel: 'Quotation For',
    party: {
      name: q.party_name,
      addressLines: [
        ...(q.contact_name && q.contact_name !== q.party_name ? [`Attn: ${q.contact_name}`] : []),
        ...partyAddressLines({ address: q.party_address, city: q.party_city, pincode: q.party_pincode, state: q.party_state })
      ],
      phone: q.party_phone,
      email: q.party_email,
      gstin: q.client_gstin
    },
    items: lines,
    showGst: gst,
    totals: rows,
    grandTotal: totals.total,
    words: words(totals.total),
    terms: termSections(settings, q.terms)
  });
}
