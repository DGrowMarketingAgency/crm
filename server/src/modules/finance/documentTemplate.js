/**
 * The agency's printable business document (invoice / tax invoice / quotation), laid out exactly like the
 * invoice the agency already sends (IND0045): logo + agency block + big title, meta rows, "Billed To" box,
 * dark-header service table, total in words + totals, terms on the left, payment details + signature on the right.
 * Every value is HTML-escaped.
 */
import { amountInWords } from './gst.js';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
const nl = (v) => esc(v).replace(/\n/g, '<br>');

/** "Rs. 3,500" — paise only when there are any ("Rs. 3,500.50"). Negative → "- Rs. 200". */
export const rs = (v) => {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  const whole = Math.abs(abs - Math.round(abs)) < 0.005;
  const s = abs.toLocaleString('en-IN', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '- ' : ''}Rs. ${s}`;
};

/** dd/mm/yyyy */
export const dmy = (d) => {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return y && m && day ? `${day}/${m}/${y}` : s;
};

/** The agency's own details as printed on IND0045 — used wherever Finance Settings is left blank. */
export const AGENCY_DEFAULTS = {
  agency_name: 'D-GROW MARKETING AGENCY',
  gstin: '33OUUPS5195G1ZJ',
  address_lines: ['SF No: 14/3, Plot No. 141, Radha Ave Main Rd, Ganga Nagar,', 'Valasaravakkam, Chennai - 600087'],
  phone: '+91 9600401582 | +91 7373509585',
  email: 'info@dgrowmarketing.com',
  account_number: '50200090154952',
  ifsc: 'HDFC0000444',
  account_name: 'D Grow Marketing Agency',
  bank_name: 'HDFC Bank',
  branch: 'Velachery',
  gpay_number: '7373509585',
  upi_id: 'marketingdgrow@okicici',
  terms_scope: 'Services include the specific digital marketing services mentioned in the invoice',
  terms_payment: 'Full payment should be made every month in advance.',
  terms_ownership:
    'The client receives ownership rights to the final deliverables upon full payment.\nThe service provider retains the right to use completed work for portfolio and marketing purposes.',
  terms_confidentiality: 'Both parties agree to keep confidential any proprietary information shared during the project.',
  terms_cancellation: 'The client will be billed for any work completed up to the cancellation date.'
};

const pick = (settings, key) => {
  const v = settings?.[key];
  return v != null && String(v).trim() !== '' ? v : AGENCY_DEFAULTS[key];
};

/** Agency block values: Finance Settings first, the IND0045 details otherwise. */
export function agencyInfo(settings = {}) {
  const addressLines = settings.address
    ? [
        ...String(settings.address).split('\n'),
        [settings.city, settings.pincode].filter(Boolean).join(' - ')
      ].filter((l) => l && l.trim())
    : AGENCY_DEFAULTS.address_lines;
  return {
    name: String(pick(settings, 'agency_name')).toUpperCase(),
    gstin: pick(settings, 'gstin'),
    addressLines,
    phone: pick(settings, 'phone'),
    email: pick(settings, 'email'),
    bank: [
      ['Ac Number', pick(settings, 'account_number')],
      ['IFSC Code', pick(settings, 'ifsc')],
      ['Banking Name', pick(settings, 'account_name')],
      ['Bank Name', pick(settings, 'bank_name')],
      ['Branch', pick(settings, 'branch')],
      ['GPay', pick(settings, 'gpay_number'), true],
      ['UPI ID', pick(settings, 'upi_id'), true]
    ].filter(([, v]) => v),
    signatory: settings.signatory_name || ''
  };
}

/** Terms sections in the IND0045 order. A quotation can pass its own free-text terms instead. */
export function termSections(settings = {}, customText = null) {
  if (customText && String(customText).trim()) return [['', String(customText)]];
  return [
    ['Scope of Work', pick(settings, 'terms_scope')],
    ['Payment Terms', pick(settings, 'terms_payment')],
    ['Ownership and Usage', AGENCY_DEFAULTS.terms_ownership],
    ['Third-party Tools & Credits', settings.terms_third_party],
    ['Confidentiality', pick(settings, 'terms_confidentiality')],
    ['Cancellation Policy', pick(settings, 'terms_cancellation')]
  ].filter(([, t]) => t && String(t).trim());
}

/** "1. …" numbered lines (keeps any numbering the text already has). */
const numbered = (text) =>
  String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => `<div>${/^\d+[.)]/.test(l) ? esc(l) : `${i + 1}. ${esc(l)}`}</div>`)
    .join('');

/**
 * @param {object} d
 *  title, metaLeft [[label, value]], metaRight [[label, value]], partyLabel, party {name, addressLines[], phone, gstin, email},
 *  items [{service, sac, details, gst, amount}], showGst, totals [[label, value, {strong}]], grandTotal, words,
 *  terms [[heading, text]], agency (agencyInfo), assetBase (site URL serving Logo.png / seel.png), stamp, notes
 */
export function renderBusinessDocument(d) {
  const a = d.agency;
  const rows = d.items
    .map(
      (it, i) => `<tr>
        <td class="no">${i + 1}</td>
        <td class="svc">${esc(it.service)}</td>
        <td class="sac">${esc(it.sac || '-')}</td>
        <td class="det">${it.details ? nl(it.details) : '-'}</td>
        ${d.showGst ? `<td class="gst">${esc(it.gst ?? '')}</td>` : ''}
        <td class="amt">${rs(it.amount)}</td>
      </tr>`
    )
    .join('');
  const meta = (list, boldValues) =>
    list
      .filter(([, v]) => v != null && v !== '')
      .map(([l, v]) => `<tr><th>${esc(l)}</th><td class="${boldValues ? 'b' : ''}">: ${esc(v)}</td></tr>`)
      .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} ${esc(d.number || '')}</title>
<style>
  @page { size: A4; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; font-size: 12px; background: #fff; }
  /* Fixed A4 width: on a phone it scrolls like a PDF instead of collapsing. */
  .wrap { width: 794px; max-width: none; margin: 0 auto; position: relative; }
  @media print { .wrap { width: auto; } }
  .bar { text-align: right; margin-bottom: 12px; }
  .bar button { background: #111827; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px; }
  .head { display: flex; align-items: flex-start; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
  .logo { width: 150px; flex: 0 0 150px; padding-top: 2px; }
  .logo img { width: 150px; height: auto; display: block; }
  .agency { flex: 1; min-width: 0; }
  .agency h2 { margin: 0 0 2px; font-size: 20px; font-weight: 800; color: #1f2937; letter-spacing: .2px; }
  .agency .gst { font-weight: 700; font-size: 12px; color: #374151; margin-bottom: 2px; }
  .agency .line { color: #4b5563; font-size: 11px; line-height: 1.4; }
  .agency .mail { color: #4b5563; font-size: 11px; margin-top: 6px; }
  .title { font-size: 34px; font-weight: 800; color: #1f2937; letter-spacing: .5px; white-space: nowrap; line-height: 1; padding-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 24px; padding: 14px 8px 10px; }
  .meta table { border-collapse: collapse; }
  .meta th { text-align: left; font-weight: 700; color: #374151; padding: 3px 28px 3px 0; white-space: nowrap; font-size: 12px; }
  .meta td { padding: 3px 0; color: #374151; font-size: 12px; }
  .meta td.b { font-weight: 700; }
  .meta .right { min-width: 270px; }
  .bt-head { background: #f1f5f9; font-weight: 700; padding: 7px 12px; margin-top: 4px; color: #1f2937; }
  .bt { border: 1px solid #e5e7eb; border-top: 0; padding: 10px 12px 18px; display: flex; justify-content: space-between; gap: 24px; min-height: 118px; }
  .bt .nm { font-weight: 800; font-size: 13px; text-transform: uppercase; margin-bottom: 4px; }
  .bt .lbl { font-weight: 700; }
  .bt .addr { line-height: 1.5; color: #1f2937; }
  .bt .side { min-width: 260px; line-height: 1.6; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 64px; }
  table.items th { background: #262626; color: #fff; font-weight: 700; padding: 9px 10px; text-align: left; font-size: 12px; }
  table.items th.c, table.items td.no, table.items td.sac, table.items td.gst { text-align: center; }
  table.items th.r, table.items td.amt { text-align: right; }
  table.items td { border: 1px solid #e5e7eb; padding: 11px 10px; vertical-align: top; }
  table.items td.no { font-weight: 700; width: 46px; }
  table.items td.svc { font-weight: 700; width: 30%; }
  table.items td.sac { color: #4b5563; width: 96px; }
  table.items td.det { color: #6b7280; font-size: 11px; line-height: 1.45; }
  table.items td.gst { width: 64px; color: #4b5563; }
  table.items td.amt { font-weight: 800; font-size: 13px; white-space: nowrap; width: 150px; text-align: center; }
  .sum { display: flex; justify-content: space-between; gap: 24px; padding: 14px 8px 0; }
  .words .t { font-weight: 700; }
  .words .w { font-weight: 700; font-style: italic; margin-top: 4px; }
  .tot { width: 290px; }
  .tot .row { display: flex; justify-content: space-between; color: #4b5563; padding: 3px 0; font-size: 12px; }
  .tot .row.strong { color: #1f2937; font-weight: 700; }
  .tot .grand { display: flex; justify-content: space-between; font-weight: 800; font-size: 16px; color: #1f2937; border-top: 2px solid #1f2937; border-bottom: 2px solid #1f2937; padding: 7px 0; margin-top: 6px; }
  .tot .after { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .notes { margin: 18px 8px 0; color: #4b5563; line-height: 1.5; }
  .foot { display: flex; justify-content: space-between; gap: 28px; border-top: 1px solid #e5e7eb; margin-top: 46px; padding: 16px 8px 0; }
  .terms { flex: 1; min-width: 0; }
  .terms h3 { margin: 0 0 8px; font-size: 13px; font-weight: 800; color: #1f2937; }
  .terms h4 { margin: 8px 0 1px; font-size: 11px; font-weight: 700; color: #374151; }
  .terms div { color: #4b5563; font-size: 11px; line-height: 1.4; }
  .pay-col { width: 365px; flex: 0 0 365px; }
  .pay { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 14px 12px; }
  .pay h3 { margin: 0 0 4px; font-size: 13px; font-weight: 800; color: #1f2937; }
  .pay table { border-collapse: collapse; }
  .pay th { text-align: left; font-weight: 700; color: #374151; font-size: 11px; padding: 2.5px 30px 2.5px 0; white-space: nowrap; }
  .pay td { font-size: 11px; color: #374151; padding: 2.5px 0; }
  .pay td.b { font-weight: 700; color: #1f2937; }
  .sig { text-align: center; margin-top: 8px; }
  .sig img { width: 190px; height: auto; display: inline-block; }
  .sig .cap { color: #6b7280; font-size: 11px; margin-top: 10px; }
  .stamp { position: absolute; top: 330px; left: 50%; transform: translateX(-50%) rotate(-18deg); font-size: 64px; font-weight: 900; color: rgba(185,28,28,.13); border: 6px solid rgba(185,28,28,.13); padding: 6px 24px; pointer-events: none; }
  @media print { body { padding: 0; } .bar { display: none; } }
</style></head>
<body><div class="wrap">
  <div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
  ${d.stamp ? `<div class="stamp">${esc(d.stamp)}</div>` : ''}

  <div class="head">
    <div class="logo"><img src="${esc(d.assetBase)}/Logo.png" alt="${esc(a.name)}"></div>
    <div class="agency">
      <h2>${esc(a.name)}</h2>
      ${a.gstin ? `<div class="gst">GSTIN Number: ${esc(a.gstin)}</div>` : ''}
      <div class="line">Address: ${a.addressLines.map(esc).join('<br>')}</div>
      ${a.phone ? `<div class="line">Contact No: ${esc(a.phone)}</div>` : ''}
      ${a.email ? `<div class="mail">Email: ${esc(a.email)}</div>` : ''}
    </div>
    <div class="title">${esc(d.title)}</div>
  </div>

  <div class="meta">
    <table>${meta(d.metaLeft, true)}</table>
    <table class="right">${meta(d.metaRight, false)}</table>
  </div>

  <div class="bt-head">${esc(d.partyLabel || 'Billed To')}</div>
  <div class="bt">
    <div>
      <div class="nm">${esc(d.party.name)}</div>
      ${d.party.addressLines?.length ? `<div class="lbl">Address:</div><div class="addr">${d.party.addressLines.map(esc).join('<br>')}</div>` : ''}
    </div>
    <div class="side">
      ${d.party.phone ? `<div><span class="lbl">Mobile Number:</span> ${esc(d.party.phone)}</div>` : ''}
      ${d.party.email ? `<div><span class="lbl">Email:</span> ${esc(d.party.email)}</div>` : ''}
      ${d.party.gstin ? `<div><span class="lbl">GSTIN:</span> ${esc(d.party.gstin)}</div>` : ''}
    </div>
  </div>

  <table class="items"><thead><tr>
    <th class="c" style="width:46px">No</th><th>Service</th><th class="c">HSN/SAC</th><th>Details</th>${d.showGst ? '<th class="c">GST</th>' : ''}<th class="c">Amount</th>
  </tr></thead><tbody>${rows}</tbody></table>

  <div class="sum">
    <div class="words"><div class="t">Total In Words</div><div class="w">${esc(d.words)}.</div></div>
    <div class="tot">
      ${d.totals.map(([l, v, o]) => `<div class="row${o?.strong ? ' strong' : ''}"><span>${esc(l)}</span><span>${esc(v)}</span></div>`).join('')}
      <div class="grand"><span>Total</span><span>${rs(d.grandTotal)}</span></div>
      ${(d.after || []).map(([l, v, color]) => `<div class="after" style="${color ? `color:${color};font-weight:700` : ''}"><span>${esc(l)}</span><span>${esc(v)}</span></div>`).join('')}
    </div>
  </div>

  ${d.notes ? `<div class="notes"><b>Notes:</b> ${nl(d.notes)}</div>` : ''}

  <div class="foot">
    <div class="terms">
      <h3>Terms &amp; Conditions</h3>
      ${d.terms.map(([h, t]) => `${h ? `<h4>${esc(h)}</h4>` : ''}${numbered(t)}`).join('')}
    </div>
    <div class="pay-col">
      <div class="pay"><h3>Payment Details:</h3><table>
        ${a.bank.map(([l, v, b]) => `<tr><th>${esc(l)}</th><td class="${b ? 'b' : ''}">: ${esc(v)}</td></tr>`).join('')}
      </table></div>
      <div class="sig">
        <img src="${esc(d.assetBase)}/seel.png" alt="For ${esc(a.name)} — signature">
        <div class="cap">Authorized Signature${a.signatory ? ` — ${esc(a.signatory)}` : ''}</div>
      </div>
    </div>
  </div>
</div></body></html>`;
}

/**
 * Sends a printable document. The API's default security policy only allows its own images, blocks the inline
 * "Print" button and forbids being framed by the app (the invoice screen shows the print in an iframe), so print
 * pages get their own tight policy: logo/signature from the app site, inline styles and the print button only.
 */
export function sendPrintable(res, html, clientUrl) {
  const site = new URL(clientUrl).origin;
  res.removeHeader('X-Frame-Options');
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': [
      "default-src 'none'",
      `img-src 'self' data: ${site}`,
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "script-src-attr 'unsafe-inline'",
      `frame-ancestors 'self' ${site}`,
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; ')
  });
  res.send(html);
}

/** Shared total-in-words text ("Rupees Three Thousand Five Hundred Only"). */
export const words = (n) => amountInWords(n);
