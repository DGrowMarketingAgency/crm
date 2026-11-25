import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Send, Save, Copy, MessageCircle, ExternalLink, Handshake, CheckCircle2, XCircle, History, Lock, Pencil, CopyPlus, Ban, Printer } from 'lucide-react';
import { salesService, projectFlowService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { Breadcrumbs, PageState, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr, inr0 } from '../finance/gstMath';
import { QUOTE_STATUS, ROUND_LABEL, quoteTotals } from './quoteUi';
import { quoteLink } from './QuotationsPage';
import { fmtDateTime, ActionMenu } from './salesUi';

const EMPTY_ITEM = { serviceId: '', description: '', details: '', quantity: 1, unitPrice: '', gstRate: 18 };
const todayIso = () => new Date().toLocaleDateString('en-CA');

/** Accepted quotation → onboard (if still an enquiry) → optional project → draft GST invoice. */
function ConvertPanel({ quote, links, busy, onConvert }) {
  const fromProposal = Boolean(links?.proposal);
  const cycleProject = fromProposal ? (links.proposal.billing_cycle === 'one_time' ? 'one_time' : 'regular') : 'none';
  const [f, setF] = useState({ invoiceDate: todayIso(), projectMode: cycleProject, assigneeId: '' });
  const [people, setPeople] = useState([]);
  useEffect(() => { projectFlowService.getEmployees().then((r) => setPeople(r.data.employees || [])).catch(() => {}); }, []);
  const needProject = f.projectMode !== 'none';
  const submit = (e) => {
    e.preventDefault();
    if (!window.confirm(`Convert ${quote.quote_number} to an invoice?${links?.needsOnboarding ? ' The enquiry will be onboarded as a client.' : ''}`)) return;
    onConvert({ invoiceDate: f.invoiceDate, projectMode: f.projectMode, assigneeId: needProject ? Number(f.assigneeId) : null });
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-5 space-y-3">
      <h2 className="font-black text-slate-900">Accepted — convert to invoice</h2>
      <ol className="text-xs text-slate-600 list-decimal pl-4 space-y-0.5">
        <li>{links?.needsOnboarding ? 'Onboard the enquiry as a client' : 'Use the existing client'}</li>
        <li>{needProject ? `Create a ${f.projectMode === 'regular' ? 'monthly retainer' : 'one-time'} project` : 'No project'}</li>
        <li>Draft a GST invoice with these lines{quote.discount_amount ? ' and the negotiated discount' : ''} ({inr0(quote.total_amount)})</li>
      </ol>
      <label className="block"><span className="text-xs font-bold text-slate-600">Project</span>
        <select className={inputCls} value={f.projectMode} onChange={(e) => setF({ ...f, projectMode: e.target.value })}>
          <option value="none">No project (invoice only)</option>
          <option value="one_time">One-time project</option>
          <option value="regular">Monthly retainer (next months invoice automatically)</option>
        </select></label>
      {needProject && (
        <label className="block"><span className="text-xs font-bold text-slate-600">Who runs the project *</span>
          <select className={inputCls} required value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
            <option value="">— Choose —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` — ${p.department}` : ''}</option>)}
          </select></label>
      )}
      <label className="block"><span className="text-xs font-bold text-slate-600">Invoice date</span>
        <input type="date" className={inputCls} value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} /></label>
      <button className={`${btnPrimary} w-full justify-center`} disabled={busy}>{links?.needsOnboarding ? 'Onboard & create invoice' : 'Create invoice'}</button>
    </form>
  );
}
const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-5';

export function QuoteEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const canPrice = isOwner || hasPermission('sales_quotes.price');
  const [data, setData] = useState(null);
  const [services, setServices] = useState([]);
  const [parties, setParties] = useState({ leads: [], clients: [] });
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const [msg, setMsg] = useState(() => location.state?.flash || null);
  // React Router may reuse this page when moving from /new to /:id, so also pick the message up on change.
  useEffect(() => { if (location.state?.flash) setMsg(location.state.flash); }, [location.state]);
  const [busy, setBusy] = useState(false);
  const [revise, setRevise] = useState({ discountAmount: '', prices: {}, note: '' });
  const [clientReq, setClientReq] = useState({ note: '', clientAmount: '' });

  const fromData = (d) => ({
    target: d.quote.lead_id ? `lead:${d.quote.lead_id}` : `client:${d.quote.client_id}`,
    title: d.quote.title, requirements: d.quote.requirements || '', terms: d.quote.terms || '', gstMode: d.quote.gst_mode,
    validUntil: d.quote.valid_until ? String(d.quote.valid_until).slice(0, 10) : '', discountAmount: d.quote.discount_amount || '',
    items: d.items.map((i) => ({ serviceId: i.service_id || '', description: i.description, details: i.details || '', quantity: i.quantity, unitPrice: i.unit_price ?? '', gstRate: i.gst_rate }))
  });

  const load = useCallback(async () => {
    setError('');
    try {
      const svc = await salesService.services().catch(() => ({ data: { services: [] } }));
      setServices(svc.data.services || []);
      if (isNew) {
        const [l, c] = await Promise.all([salesService.listLeads({}).catch(() => null), salesService.clients().catch(() => null)]);
        setParties({ leads: (l?.data.leads || []).filter((x) => !['Won', 'Lost'].includes(x.stage)), clients: c?.data.clients || [] });
        const leadId = params.get('leadId');
        const clientId = params.get('clientId');
        const lead = (l?.data.leads || []).find((x) => String(x.id) === leadId);
        setForm({
          target: leadId ? `lead:${leadId}` : clientId ? `client:${clientId}` : '',
          title: lead ? `Quotation for ${lead.company_name || lead.title}` : '', requirements: lead?.services_interested ? `Client wants: ${lead.services_interested}` : '',
          terms: '1. 50% advance on approval, balance on delivery.\n2. Work starts within 2 business days of the advance.\n3. Ad spend (if any) is billed separately.',
          gstMode: 'gst', validUntil: '', discountAmount: '', items: [{ ...EMPTY_ITEM }]
        });
      } else {
        const d = (await salesService.getQuote(id)).data;
        setData(d);
        setForm(fromData(d));
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not load the quotation'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const q = data?.quote;
  const can = data?.can;
  // Admins can reopen a sent quotation; saving it sends the client a revision on the same link.
  const [editingSent, setEditingSent] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const editable = isNew || can?.editRequest || (can?.price && ['requested', 'draft'].includes(q?.status)) || (editingSent && can?.editSent);
  const showPrices = canPrice || (q && q.status !== 'requested');
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const pickService = (i, sid) => {
    const s = services.find((x) => String(x.id) === String(sid));
    setForm((f) => ({
      ...f,
      items: f.items.map((it, j) => (j === i ? {
        ...it, serviceId: sid, description: s ? s.name : it.description, details: s?.billing_details || it.details,
        gstRate: s?.gst_rate ?? it.gstRate, unitPrice: canPrice && s?.default_rate && !it.unitPrice ? s.default_rate : it.unitPrice
      } : it))
    }));
  };
  const preview = useMemo(() => (form && canPrice ? quoteTotals(form.items, { gstMode: form.gstMode, discountAmount: form.discountAmount }) : null), [form, canPrice]);

  const payload = () => {
    const [kind, pid] = (form.target || '').split(':');
    return {
      leadId: kind === 'lead' ? Number(pid) : null, clientId: kind === 'client' ? Number(pid) : null,
      title: form.title, requirements: form.requirements || null, terms: form.terms || null, gstMode: form.gstMode,
      validUntil: form.validUntil || null, discountAmount: canPrice ? Number(form.discountAmount || 0) : undefined,
      items: form.items.map((it) => ({
        serviceId: it.serviceId ? Number(it.serviceId) : null, description: it.description, details: it.details || null,
        quantity: Number(it.quantity || 1), unitPrice: canPrice ? (it.unitPrice === '' ? null : Number(it.unitPrice)) : null, gstRate: Number(it.gstRate ?? 18)
      }))
    };
  };

  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r?.data?.quote) { setData(r.data); setForm(fromData(r.data)); }
      if (okText) setMsg({ ok: true, text: okText });
      return r;
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (andSend) => {
    if (!form.target) return setMsg({ ok: false, text: 'Choose the enquiry or client' });
    if (isNew) {
      const r = await run(() => salesService.createQuote(payload()));
      if (!r) return;
      const newId = r.data.quote.id;
      let flash = { ok: true, text: canPrice ? 'Draft saved.' : 'Request sent. The admin has been notified to add prices.' };
      if (andSend) {
        try {
          await salesService.sendQuote(newId);
          flash = { ok: true, text: 'Priced and sent. Share the client link below.' };
        } catch (err) {
          flash = { ok: false, text: `Saved as a draft, but not sent: ${errorMessage(err)}` };
        }
      }
      // The saved quotation opens on its own address; carry the message across.
      navigate(`/sales/quotes/${newId}`, { replace: true, state: { flash } });
      return;
    }
    if (editingSent) {
      if (!window.confirm(`Send the updated ${q.quote_number} to ${q.party_name}? It is saved as a new revision and the client sees it on the same link.`)) return;
      const r = await run(() => salesService.updateQuote(id, { ...payload(), revisionNote: revisionNote.trim() || null }), 'Updated quotation sent to the client (new revision).');
      if (r) { setEditingSent(false); setRevisionNote(''); }
      return;
    }
    const r = await run(() => salesService.updateQuote(id, payload()), andSend ? null : 'Saved.');
    if (r && andSend) {
      if (!window.confirm(`Send ${q.quote_number} to ${q.party_name}? The client gets a link to view, accept or negotiate.`)) return;
      await run(() => salesService.sendQuote(id), 'Priced and sent. Share the client link below.');
    }
  };

  const submitRevise = async (e) => {
    e.preventDefault();
    const items = Object.entries(revise.prices).filter(([, v]) => v !== '').map(([iid, v]) => ({ id: Number(iid), unitPrice: Number(v) }));
    const body = { note: revise.note || null, ...(revise.discountAmount !== '' ? { discountAmount: Number(revise.discountAmount) } : {}), ...(items.length ? { items } : {}) };
    const r = await run(() => salesService.reviseQuote(id, body), 'Revised price sent to the client.');
    if (r) setRevise({ discountAmount: '', prices: {}, note: '' });
  };
  const submitClientReq = async (e) => {
    e.preventDefault();
    const r = await run(() => salesService.quoteClientRequest(id, { note: clientReq.note, clientAmount: clientReq.clientAmount }), 'Negotiation request recorded. The admin has been notified.');
    if (r) setClientReq({ note: '', clientAmount: '' });
  };
  const duplicateQuote = async () => {
    const r = await run(() => salesService.duplicateQuote(id));
    if (r) navigate(`/sales/quotes/${r.data.quote.id}`, { state: { flash: { ok: true, text: `Copied from ${q.quote_number} as ${r.data.quote.quote_number}.` } } });
  };
  const cancelQuote = () => {
    const reason = window.prompt(`Cancel ${q.quote_number}? The client's link will say it is no longer valid.\n\nReason (optional):`, '');
    if (reason === null) return;
    run(() => salesService.cancelQuote(id, reason.trim() || null), 'Quotation cancelled.');
  };
  const deleteQuote = async () => {
    if (!window.confirm(`Delete ${q.quote_number}? This cannot be undone.`)) return;
    const r = await run(() => salesService.deleteQuote(id));
    if (r) navigate('/sales/quotes');
  };
  const convert = async (body) => {
    const r = await run(() => salesService.convertQuote(id, body), 'Converted: client onboarded and the invoice is drafted. Review and issue it from Invoices.');
    return r;
  };
  const decide = (decision) => {
    if (!window.confirm(decision === 'accept' ? `Mark ${q.quote_number} as accepted by the client?` : `Mark ${q.quote_number} as declined?`)) return;
    run(() => salesService.decideQuote(id, { decision }), decision === 'accept' ? 'Marked accepted.' : 'Marked declined.');
  };

  const [statusLabel, statusCls] = q ? QUOTE_STATUS[q.status] || [q.status, ''] : ['New', 'bg-slate-100 text-slate-600'];
  const live = q && ['sent', 'viewed', 'negotiating'].includes(q.status);
  const totals = !isNew && !editable ? data?.totals : preview;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Quotations', to: '/sales/quotes' }, { label: q ? q.quote_number : canPrice ? 'New quotation' : 'Request quotation' }]} />
      <PageState loading={loading} error={error} onRetry={load}>
        {form && (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {q && <span className="font-mono font-black text-slate-900">{q.quote_number}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusCls}`}>{statusLabel}</span>
                  {q?.expired && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700">Expired</span>}
                </div>
                <h1 className="text-2xl font-black text-slate-900 mt-1">{q ? q.party_name : canPrice ? 'New quotation' : 'Request a quotation'}</h1>
                {q && <p className="text-sm text-slate-500">Requested by {q.requested_by_name || '—'} · {fmtDate(q.quote_date)}{q.priced_by_name ? ` · priced by ${q.priced_by_name}` : ''}
                  {q.lead_id && <> · <Link className="text-red-600 hover:underline" to={`/sales/leads/${q.lead_id}`}>Open enquiry</Link></>}</p>}
                {!canPrice && editable && <p className="text-sm text-amber-700 mt-1 inline-flex items-center gap-1"><Lock className="w-4 h-4" /> List the services the client wants. The admin adds prices and sends it.</p>}
                {q && ['approved', 'converted'].includes(q.status) && <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Accepted by the client, so it is locked. Duplicate it to make a new version.</p>}
              </div>
              {q && (
                <div className="flex items-center gap-2">
                  {q.status !== 'requested' && (
                    <a className={btnSecondary} href={salesService.quotePrintUrl(q.id)} target="_blank" rel="noreferrer"><Printer className="w-4 h-4" /> Print / PDF</a>
                  )}
                  {can?.editSent && !editingSent && (
                    <button className={btnSecondary} onClick={() => setEditingSent(true)}><Pencil className="w-4 h-4" /> Edit quotation</button>
                  )}
                  <ActionMenu label="Quotation actions" items={[
                    { label: 'Duplicate', icon: CopyPlus, onClick: duplicateQuote, hidden: !can?.duplicate },
                    { label: 'Cancel quotation', icon: Ban, onClick: cancelQuote, hidden: !can?.cancel },
                    { label: 'Delete', icon: Trash2, onClick: deleteQuote, danger: true, hidden: !can?.delete }
                  ]} />
                </div>
              )}
            </div>

            {editingSent && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 space-y-2">
                <div className="font-bold text-orange-800">Editing a quotation the client already has</div>
                <p className="text-xs text-orange-800/80">Change any line, price, discount, terms or validity below. Saving sends it as a new revision on the same client link and keeps the earlier version in History.</p>
                <input aria-label="Note to client" className={inputCls} value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="Note to the client, e.g. Added 2 reels as discussed" />
                <div className="flex gap-2 justify-end">
                  <button className={btnSecondary} onClick={() => { setEditingSent(false); setRevisionNote(''); setForm(fromData(data)); }}>Discard changes</button>
                  <button className={btnPrimary} disabled={busy} onClick={() => save(false)}><Send className="w-4 h-4" /> Save & send update</button>
                </div>
              </div>
            )}

            {msg && <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{msg.text}</div>}

            {canPrice && live && q.public_token && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-sky-800">Client link</div>
                  <input readOnly aria-label="Client link" className={`${inputCls} !text-xs font-mono mt-1`} value={quoteLink(q.public_token)} />
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={() => navigator.clipboard.writeText(quoteLink(q.public_token)).then(() => setMsg({ ok: true, text: 'Link copied.' }))}><Copy className="w-4 h-4" /> Copy</button>
                  <a className={`${btnSecondary} !text-emerald-700`} target="_blank" rel="noreferrer"
                    href={`https://wa.me/${String(q.party_phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(`Hello ${q.contact_name || q.party_name}, here is your quotation ${q.quote_number} from D-GROW: ${quoteLink(q.public_token)}`)}`}>
                    <MessageCircle className="w-4 h-4" /> WhatsApp</a>
                  <a className={btnSecondary} target="_blank" rel="noreferrer" href={quoteLink(q.public_token)}><ExternalLink className="w-4 h-4" /> Client view</a>
                </div>
              </div>
            )}

            <div className="grid xl:grid-cols-[1fr_360px] gap-4">
              <div className="space-y-4">
                <section className={`${card} space-y-3`}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="block"><span className="text-xs font-bold text-slate-600">For *</span>
                      {isNew ? (
                        <select className={inputCls} value={form.target} onChange={(e) => setF('target', e.target.value)} required>
                          <option value="">— Enquiry or client —</option>
                          {parties.leads.length > 0 && <optgroup label="Enquiries (prospects)">{parties.leads.map((l) => <option key={`l${l.id}`} value={`lead:${l.id}`}>{l.company_name || l.title}</option>)}</optgroup>}
                          {parties.clients.length > 0 && <optgroup label="Onboarded clients">{parties.clients.map((c) => <option key={`c${c.id}`} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>}
                        </select>
                      ) : <div className={`${inputCls} bg-slate-50`}>{q.party_name}</div>}
                    </label>
                    <label className="block"><span className="text-xs font-bold text-slate-600">Title *</span>
                      <input className={inputCls} disabled={!editable} value={form.title} onChange={(e) => setF('title', e.target.value)} placeholder="e.g. Digital marketing – monthly" /></label>
                  </div>
                  <label className="block"><span className="text-xs font-bold text-slate-600">What the client is asking for</span>
                    <textarea rows={2} className={inputCls} disabled={!editable} value={form.requirements} onChange={(e) => setF('requirements', e.target.value)} placeholder="Goals, number of posts / campaigns, deadlines, budget hints…" /></label>
                </section>

                <section className={card}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-black text-slate-900">Services</h2>
                    {editable && <button className={`${btnSecondary} !py-1.5 !text-xs`} onClick={() => setF('items', [...form.items, { ...EMPTY_ITEM }])}><Plus className="w-3.5 h-3.5" /> Add service</button>}
                  </div>
                  <div className="space-y-3">
                    {form.items.map((it, i) => {
                      const saved = data?.items?.[i];
                      return (
                        <div key={i} className="rounded-xl border border-slate-100 p-3 space-y-2">
                          <div className="grid md:grid-cols-[1fr_1fr_80px] gap-2">
                            <select aria-label={`Service ${i + 1}`} className={inputCls} disabled={!editable} value={it.serviceId} onChange={(e) => pickService(i, e.target.value)}>
                              <option value="">— Pick from services —</option>
                              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <input aria-label={`Line ${i + 1} name`} className={inputCls} disabled={!editable} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Service name" />
                            <input aria-label={`Line ${i + 1} quantity`} type="number" min="1" className={inputCls} disabled={!editable} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                          </div>
                          <textarea aria-label={`Line ${i + 1} details`} rows={1} className={inputCls} disabled={!editable} value={it.details} onChange={(e) => setItem(i, 'details', e.target.value)} placeholder="Scope: e.g. 12 posts, 2 reels, monthly report" />
                          {showPrices && (
                            <div className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                              <label className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600 whitespace-nowrap">Price ₹</span>
                                <input aria-label={`Line ${i + 1} price`} type="number" min="0" className={inputCls} disabled={!editable || !canPrice} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} placeholder={canPrice ? 'Add price' : 'Admin adds'} /></label>
                              <select aria-label={`Line ${i + 1} GST`} className={inputCls} disabled={!editable || !canPrice || form.gstMode !== 'gst'} value={it.gstRate} onChange={(e) => setItem(i, 'gstRate', e.target.value)}>
                                {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}% GST</option>)}
                              </select>
                              <span className="text-sm font-bold text-slate-700 text-right whitespace-nowrap">{it.unitPrice !== '' ? inr0(Number(it.unitPrice) * Number(it.quantity || 0)) : '—'}</span>
                            </div>
                          )}
                          {!editable && live && can?.revise && saved && (
                            <label className="flex items-center gap-2 text-xs"><span className="font-bold text-orange-700">New price ₹</span>
                              <input aria-label={`Line ${i + 1} revised price`} type="number" min="1" className={`${inputCls} !w-36`} value={revise.prices[saved.id] ?? ''}
                                onChange={(e) => setRevise((r) => ({ ...r, prices: { ...r.prices, [saved.id]: e.target.value } }))} placeholder={String(saved.unit_price ?? '')} /></label>
                          )}
                          {editable && form.items.length > 1 && (
                            <button className="text-xs font-bold text-red-600 inline-flex items-center gap-1" onClick={() => setF('items', form.items.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /> Remove</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {canPrice && (
                  <section className={`${card} grid md:grid-cols-3 gap-3`}>
                    <div>
                      <span className="text-xs font-bold text-slate-600">Bill mode</span>
                      <div className="flex gap-1 mt-1" role="radiogroup" aria-label="Bill mode">
                        {[['gst', 'With GST'], ['non_gst', 'No GST']].map(([v, l]) => (
                          <button key={v} type="button" role="radio" aria-checked={form.gstMode === v} disabled={!editable} onClick={() => setF('gstMode', v)}
                            className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border ${form.gstMode === v ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-200 text-slate-600'}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <label className="block"><span className="text-xs font-bold text-slate-600">Discount ₹</span>
                      <input type="number" min="0" className={inputCls} disabled={!editable} value={form.discountAmount} onChange={(e) => setF('discountAmount', e.target.value)} placeholder="0" /></label>
                    <label className="block"><span className="text-xs font-bold text-slate-600">Valid until</span>
                      <input type="date" className={inputCls} disabled={!editable} value={form.validUntil} onChange={(e) => setF('validUntil', e.target.value)} />
                      {editable && !form.validUntil && <span className="text-[11px] text-slate-400">15 days from sending if left empty</span>}</label>
                    <label className="block md:col-span-3"><span className="text-xs font-bold text-slate-600">Terms & conditions</span>
                      <textarea rows={3} className={inputCls} disabled={!editable} value={form.terms} onChange={(e) => setF('terms', e.target.value)} /></label>
                  </section>
                )}

                {editable && !editingSent && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button className={btnSecondary} onClick={() => navigate(-1)}>Cancel</button>
                    <button className={canPrice ? btnSecondary : btnPrimary} disabled={busy} onClick={() => save(false)}>
                      <Save className="w-4 h-4" /> {isNew ? (canPrice ? 'Save draft' : 'Send request to admin') : 'Save changes'}
                    </button>
                    {canPrice && (isNew || can?.send) && <button className={btnPrimary} disabled={busy} onClick={() => save(true)}><Send className="w-4 h-4" /> Price & send to client</button>}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {showPrices && totals && (
                  <section className={card}>
                    <h2 className="font-black text-slate-900 mb-2">Totals</h2>
                    {[['Subtotal', totals.subtotal], ...(totals.discount ? [['Discount', totals.discount, true]] : []), ['Taxable', totals.taxable],
                      ...(totals.igst ? [['IGST', totals.igst]] : form.gstMode === 'gst' ? [['CGST', totals.cgst], ['SGST', totals.sgst]] : []), ['Round off', totals.roundOff]].map(([l, v, minus]) => (
                      <div key={l} className="flex justify-between text-sm py-1"><span className="text-slate-500">{l}</span><span className={`font-semibold ${minus ? 'text-emerald-700' : ''}`}>{minus ? `−${inr(v)}` : inr(v)}</span></div>
                    ))}
                    <div className="flex justify-between text-lg font-black border-t border-slate-100 pt-2 mt-1"><span>Total</span><span className="text-emerald-700">{inr0(totals.total)}</span></div>
                    {editable && <p className="text-[11px] text-slate-400 mt-1">GST split (CGST + SGST or IGST) is confirmed by the client's state when saved.</p>}
                  </section>
                )}
                {!showPrices && (
                  <section className={`${card} text-sm text-slate-500`}><Lock className="w-4 h-4 inline mr-1" /> Prices appear here after the admin prices this quotation.</section>
                )}

                {!isNew && live && can?.revise && !editingSent && (
                  <form onSubmit={submitRevise} className={`${card} space-y-2 border-orange-100`}>
                    <h2 className="font-black text-orange-700 flex items-center gap-2"><Handshake className="w-4 h-4" /> Send a revised price</h2>
                    <p className="text-xs text-slate-500">Give a negotiated discount, or a new price on a line (above). The client gets the updated quotation on the same link.</p>
                    <label className="block"><span className="text-xs font-bold text-slate-600">New total discount ₹</span>
                      <input type="number" min="0" className={inputCls} value={revise.discountAmount} onChange={(e) => setRevise({ ...revise, discountAmount: e.target.value })} placeholder={String(q.discount_amount || 0)} /></label>
                    <label className="block"><span className="text-xs font-bold text-slate-600">Note to client</span>
                      <input className={inputCls} value={revise.note} onChange={(e) => setRevise({ ...revise, note: e.target.value })} placeholder="e.g. Special price for a 6-month commitment" /></label>
                    <button className={btnPrimary} disabled={busy}>Send revised price</button>
                  </form>
                )}

                {!isNew && can?.logClientRequest && (
                  <form onSubmit={submitClientReq} className={`${card} space-y-2`}>
                    <h2 className="font-black text-slate-900">Client wants to negotiate?</h2>
                    <p className="text-xs text-slate-500">Record what the client said on the call. The admin is notified to send a revised price.</p>
                    <textarea rows={2} required minLength={2} className={inputCls} value={clientReq.note} onChange={(e) => setClientReq({ ...clientReq, note: e.target.value })} placeholder="e.g. Asked for 10% off if they pay 3 months upfront" />
                    <label className="block"><span className="text-xs font-bold text-slate-600">Client's figure ₹ (optional)</span>
                      <input type="number" min="0" className={inputCls} value={clientReq.clientAmount} onChange={(e) => setClientReq({ ...clientReq, clientAmount: e.target.value })} /></label>
                    <button className={btnSecondary} disabled={busy}>Record negotiation request</button>
                  </form>
                )}

                {!isNew && can?.decide && (
                  <section className={`${card} space-y-2`}>
                    <h2 className="font-black text-slate-900">Client answered by phone?</h2>
                    <div className="flex gap-2">
                      <button className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5" disabled={busy} onClick={() => decide('accept')}><CheckCircle2 className="w-4 h-4" /> Accepted</button>
                      <button className={`${btnSecondary} flex-1 justify-center !text-red-600`} disabled={busy} onClick={() => decide('reject')}><XCircle className="w-4 h-4" /> Declined</button>
                    </div>
                  </section>
                )}

                {q?.status === 'approved' && !can?.convert && (
                  <section className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800">
                    <b>Accepted{q.decided_by_name ? ` by ${q.decided_by_name}` : ''}.</b> The admin will onboard the client and raise the invoice.
                  </section>
                )}
                {can?.convert && <ConvertPanel quote={q} links={data.links} busy={busy} onConvert={convert} />}
                {q?.status === 'converted' && data.links?.invoice && (
                  <section className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800 space-y-2">
                    <div className="font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Converted</div>
                    <Link className="flex justify-between hover:underline" to={`/finance/invoices/${data.links.invoice.id}`}>
                      <span>{data.links.invoice.status === 'draft' ? 'Draft invoice (number given when issued)' : `Invoice ${data.links.invoice.invoice_number}`} · {inr0(data.links.invoice.total_amount)}</span><span>Open →</span></Link>
                    {data.links.clientId && <Link className="flex justify-between hover:underline" to={`/client-projects/${data.links.clientId}`}><span>Client & projects</span><span>Open →</span></Link>}
                  </section>
                )}
                {data?.links?.proposal && (
                  <section className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
                    From proposal <Link className="font-mono font-bold text-red-600 hover:underline" to={`/sales/proposals/${data.links.proposal.id}`}>{data.links.proposal.proposal_code}</Link>
                  </section>
                )}

                {!isNew && data?.rounds?.length > 0 && (
                  <section className={card}>
                    <h2 className="font-black text-slate-900 flex items-center gap-2 mb-3"><History className="w-4 h-4 text-slate-500" /> History</h2>
                    <ol className="space-y-3">
                      {data.rounds.map((r) => (
                        <li key={r.id} className="border-l-2 border-slate-200 pl-3">
                          <div className="text-sm font-bold text-slate-800">
                            {ROUND_LABEL[r.kind] || r.kind}{['priced', 'revision'].includes(r.kind) && r.round_no ? ` · round ${r.round_no}` : ''}
                            {r.total_amount != null && ['priced', 'revision', 'accepted'].includes(r.kind) && <span className="text-emerald-700"> · {inr0(r.total_amount)}</span>}
                            {r.client_amount != null && <span className="text-orange-700"> · client wants {inr0(r.client_amount)}</span>}
                          </div>
                          {r.note && <div className="text-sm text-slate-600">{r.note}</div>}
                          <div className="text-[11px] text-slate-400">{fmtDateTime(r.created_at)} · {r.by_label || 'Client'}</div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </PageState>
    </div>
  );
}
