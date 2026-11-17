import { amountInWords } from './gst.js';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
const nl = (v) => esc(v).replace(/\n/g, '<br>');
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
};

const TITLES = { INV: 'TAX INVOICE', INC: 'TAX INVOICE', IND: 'INVOICE' };

/** Printable A4 GST invoice. Every value is HTML-escaped. */
export function renderTaxInvoice({ invoice: inv, items, payments }, settings) {
  const taxed = inv.invoice_type !== 'IND';
  const intra = inv.supply_type === 'intra';
  const draft = inv.status === 'draft';
  const cancelled = inv.status === 'void';
  const terms = [
    ['Scope of work', settings.terms_scope],
    ['Payment terms', settings.terms_payment],
    ['Third-party tools & credits', settings.terms_third_party],
    ['Confidentiality', settings.terms_confidentiality],
    ['Cancellation', settings.terms_cancellation]
  ].filter(([, t]) => t && String(t).trim());

  const rows = items
    .map(
      (it, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td><div class="svc">${esc(it.item_description)}</div>${it.details ? `<div class="det">${nl(it.details)}</div>` : ''}</td>
        <td class="c">${esc(it.sac_code || '')}</td>
        <td class="r">${Number(it.quantity)}</td>
        <td class="r">${inr(it.unit_price)}</td>
        <td class="r">${Number(it.discount_amount) ? inr(it.discount_amount) : '—'}</td>
        <td class="r">${inr(it.taxable_amount)}</td>
        ${taxed ? `<td class="c">${Number(it.tax_rate)}%</td>` : ''}
        <td class="r b">${inr(it.line_total)}</td>
      </tr>`
    )
    .join('');

  const paid = payments.filter((p) => p.payment_status === 'completed').reduce((a, p) => a + Number(p.amount), 0);
  const clientAddress = inv.client_billing_address || inv.client_address || '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLES[inv.invoice_type] || 'INVOICE')} ${esc(inv.invoice_number)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 12px; background: #fff; }
  .wrap { max-width: 820px; margin: 0 auto; position: relative; }
  .bar { text-align: right; margin-bottom: 12px; }
  .bar button { background: #b91c1c; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #b91c1c; padding-bottom: 12px; }
  .agency { font-size: 20px; font-weight: 800; color: #b91c1c; }
  .muted { color: #64748b; line-height: 1.5; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 20px; letter-spacing: .5px; }
  .no { font-family: ui-monospace, monospace; font-weight: 700; font-size: 14px; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: .5px; margin-bottom: 4px; }
  .name { font-weight: 700; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; padding: 8px 6px; border-bottom: 2px solid #e2e8f0; text-align: left; }
  td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
  .svc { font-weight: 600; } .det { color: #64748b; font-size: 11px; margin-top: 2px; line-height: 1.45; }
  .sum { display: grid; grid-template-columns: 1fr 300px; gap: 16px; margin-top: 12px; }
  .tot div { display: flex; justify-content: space-between; padding: 4px 0; }
  .tot .grand { border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; font-weight: 800; font-size: 14px; padding: 8px 0; margin-top: 4px; }
  .words { font-style: italic; margin-top: 8px; }
  .terms h4 { margin: 8px 0 2px; font-size: 11px; }
  .terms p { margin: 0; color: #475569; line-height: 1.5; }
  .sign { text-align: right; margin-top: 28px; }
  .sign .line { margin-top: 44px; border-top: 1px solid #94a3b8; display: inline-block; padding-top: 4px; min-width: 200px; text-align: center; }
  .stamp { position: absolute; top: 260px; left: 50%; transform: translateX(-50%) rotate(-18deg); font-size: 64px; font-weight: 900; color: rgba(185,28,28,.14); border: 6px solid rgba(185,28,28,.14); padding: 6px 24px; pointer-events: none; }
  .foot { text-align: center; color: #94a3b8; font-size: 10px; margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 0; } .bar { display: none; } }
</style></head>
<body><div class="wrap">
  <div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
  ${draft ? '<div class="stamp">DRAFT</div>' : ''}${cancelled ? '<div class="stamp">CANCELLED</div>' : ''}
  <div class="head">
    <div>
      <div class="agency">${esc(settings.agency_name)}</div>
      <div class="muted">${nl(settings.address || '')}${settings.city ? `<br>${esc(settings.city)}` : ''}${settings.pincode ? ` - ${esc(settings.pincode)}` : ''}<br>
        ${esc(settings.state)} (State code ${esc(settings.state_code)})
        ${settings.gstin ? `<br><b>GSTIN:</b> ${esc(settings.gstin)}` : ''}${settings.pan ? ` &nbsp; <b>PAN:</b> ${esc(settings.pan)}` : ''}
        ${settings.phone || settings.email ? `<br>${esc([settings.phone, settings.email].filter(Boolean).join(' · '))}` : ''}</div>
    </div>
    <div class="title">
      <h1>${esc(TITLES[inv.invoice_type] || 'INVOICE')}</h1>
      <div class="no">${draft ? 'DRAFT (number on issue)' : esc(inv.invoice_number)}</div>
      <div class="muted">Date: ${date(inv.invoice_date)}<br>Due: ${date(inv.due_date)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box"><div class="lbl">Bill to</div>
      <div class="name">${esc(inv.client_company || inv.client_name)}</div>
      <div class="muted">${nl(clientAddress)}${inv.client_city ? `<br>${esc(inv.client_city)}` : ''}${inv.client_pincode ? ` - ${esc(inv.client_pincode)}` : ''}
        ${inv.client_state ? `<br>${esc(inv.client_state)} (State code ${esc(inv.client_state_code)})` : ''}
        ${inv.client_gstin ? `<br><b>GSTIN:</b> ${esc(inv.client_gstin)}` : ''}${inv.client_pan ? ` &nbsp; <b>PAN:</b> ${esc(inv.client_pan)}` : ''}</div>
    </div>
    <div class="box"><div class="lbl">Supply details</div>
      <div class="muted"><b>Place of supply:</b> ${esc(inv.place_of_supply)} (${esc(inv.place_state_code)})<br>
        <b>Tax:</b> ${taxed ? (intra ? 'Intra-state — CGST + SGST' : 'Inter-state — IGST') : 'Non-GST invoice'}<br>
        ${inv.project_name ? `<b>Project:</b> ${esc(inv.project_name)}<br>` : ''}
        ${inv.payment_terms ? `<b>Payment terms:</b> ${esc(inv.payment_terms)}` : ''}</div>
    </div>
  </div>

  <table><thead><tr>
    <th class="c" style="width:28px">#</th><th>Service &amp; details</th><th class="c">SAC</th><th class="r">Qty</th>
    <th class="r">Rate</th><th class="r">Discount</th><th class="r">Taxable</th>${taxed ? '<th class="c">GST</th>' : ''}<th class="r">Amount</th>
  </tr></thead><tbody>${rows}</tbody></table>

  <div class="sum">
    <div>
      <div class="lbl">Amount in words</div><div class="words">${esc(amountInWords(inv.total_amount))}</div>
      ${settings.bank_name || settings.upi_id ? `<div class="box" style="margin-top:12px"><div class="lbl">Pay to</div><div class="muted">
        ${settings.account_name ? `<b>Account name:</b> ${esc(settings.account_name)}<br>` : ''}
        ${settings.bank_name ? `<b>Bank:</b> ${esc(settings.bank_name)}${settings.branch ? `, ${esc(settings.branch)}` : ''}<br>` : ''}
        ${settings.account_number ? `<b>A/c no:</b> ${esc(settings.account_number)} &nbsp; ` : ''}${settings.ifsc ? `<b>IFSC:</b> ${esc(settings.ifsc)}<br>` : ''}
        ${settings.upi_id ? `<b>UPI:</b> ${esc(settings.upi_id)}` : ''}${settings.gpay_number ? ` &nbsp; <b>GPay:</b> ${esc(settings.gpay_number)}` : ''}</div></div>` : ''}
    </div>
    <div class="tot">
      <div><span>Taxable value</span><span>${inr(inv.taxable_amount)}</span></div>
      ${taxed && intra ? `<div><span>CGST</span><span>${inr(inv.cgst_amount)}</span></div><div><span>SGST</span><span>${inr(inv.sgst_amount)}</span></div>` : ''}
      ${taxed && !intra ? `<div><span>IGST</span><span>${inr(inv.igst_amount)}</span></div>` : ''}
      ${Number(inv.round_off) ? `<div><span>Round off</span><span>${Number(inv.round_off) > 0 ? '+' : ''}${Number(inv.round_off).toFixed(2)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${inr(inv.total_amount)}</span></div>
      ${paid ? `<div><span>Received</span><span>${inr(paid)}</span></div><div class="b"><span>Balance due</span><span>${inr(inv.outstanding_balance)}</span></div>` : ''}
      ${cancelled ? `<div class="b" style="color:#b91c1c"><span>Cancelled by credit note</span><span>${esc(inv.credit_note_number || '')}</span></div>` : ''}
    </div>
  </div>

  ${inv.notes ? `<div class="box" style="margin-top:12px"><div class="lbl">Notes</div><div class="muted">${nl(inv.notes)}</div></div>` : ''}
  ${terms.length ? `<div class="terms" style="margin-top:10px"><div class="lbl">Terms &amp; conditions</div>${terms.map(([h, t]) => `<h4>${esc(h)}</h4><p>${nl(t)}</p>`).join('')}</div>` : ''}

  <div class="sign">For <b>${esc(settings.agency_name)}</b><br><span class="line">${esc(settings.signatory_name || 'Authorised Signatory')}${settings.signatory_title ? `<br>${esc(settings.signatory_title)}` : ''}</span></div>
  <div class="foot">This is a computer-generated invoice.</div>
</div></body></html>`;
}
