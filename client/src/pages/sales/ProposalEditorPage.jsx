import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Star, Copy, Send, ExternalLink, MessageCircle, Wand2, CheckCircle2, ArrowRight, Undo2 } from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { Breadcrumbs, PageState, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { PROPOSAL_STATUS, CYCLES, CYCLE_SUFFIX, fmtDateTime, ActionMenu } from './salesUi';
import { inr0 } from '../finance/gstMath';

const PRESET = [
  { name: 'Starter', price: '', inclusions: '', isRecommended: false },
  { name: 'Growth', price: '', inclusions: '', isRecommended: true },
  { name: 'Premium', price: '', inclusions: '', isRecommended: false }
];
const blankTier = () => ({ key: Math.random().toString(36).slice(2), name: '', price: '', serviceId: '', inclusions: '', isRecommended: false });

export function ProposalEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const can = (p) => isOwner || hasPermission(p);

  const [doc, setDoc] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ target: params.get('leadId') ? `lead:${params.get('leadId')}` : '', title: '', intro: '', billingCycle: 'monthly', gstMode: 'gst', validUntil: '', tiers: PRESET.map((t) => ({ ...blankTier(), ...t })) });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [l, c, s] = await Promise.all([salesService.listLeads({}).catch(() => null), salesService.clients().catch(() => null), salesService.services().catch(() => null)]);
      setLeads((l?.data.leads || []).filter((x) => !['Won', 'Lost'].includes(x.stage) || String(x.id) === params.get('leadId')));
      setClients(c?.data.clients || []);
      setServices(s?.data.services || []);
      if (id) {
        const d = (await salesService.getProposal(id)).data;
        setDoc(d);
        const p = d.proposal;
        setForm({
          target: p.lead_id ? `lead:${p.lead_id}` : `client:${p.client_id}`, title: p.title, intro: p.intro || '', billingCycle: p.billing_cycle, gstMode: p.gst_mode,
          validUntil: p.valid_until ? String(p.valid_until).slice(0, 10) : '',
          tiers: d.tiers.map((t) => ({ key: String(t.id), name: t.name, price: t.price, serviceId: t.service_id ? String(t.service_id) : '', inclusions: t.inclusions || '', isRecommended: t.is_recommended }))
        });
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not load the proposal'));
    } finally {
      setLoading(false);
    }
  }, [id, params]);
  useEffect(() => { load(); }, [load]);

  const p = doc?.proposal;
  const locked = p && ['accepted', 'converted', 'rejected', 'withdrawn'].includes(p.status);
  const editable = can('proposals.create') && !locked;
  const link = p ? `${window.location.origin}/p/${p.public_token}` : '';
  const party = p ? p.client_name || p.lead_company || p.lead_title : '';

  const setTier = (i, patch) => setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : patch.isRecommended ? { ...t, isRecommended: false } : t)) }));

  const save = async (andShare) => {
    setMsg(null);
    const [kind, tid] = form.target.split(':');
    if (!tid) return setMsg({ ok: false, text: 'Choose a lead or client' });
    const payload = {
      leadId: kind === 'lead' ? Number(tid) : null, clientId: kind === 'client' ? Number(tid) : null, title: form.title, intro: form.intro || null,
      billingCycle: form.billingCycle, gstMode: form.gstMode, validUntil: form.validUntil || null,
      tiers: form.tiers.map((t) => ({ name: t.name, price: Number(t.price || 0), serviceId: t.serviceId ? Number(t.serviceId) : null, inclusions: t.inclusions || null, isRecommended: Boolean(t.isRecommended) }))
    };
    setSaving(true);
    try {
      let res = id ? await salesService.updateProposal(id, payload) : await salesService.createProposal(payload);
      const newId = res.data.proposal.id;
      if (andShare) res = await salesService.sendProposal(newId);
      if (!id) navigate(`/sales/proposals/${newId}`, { replace: true });
      else { setDoc(res.data); setMsg({ ok: true, text: andShare ? 'Saved and marked as shared. Send the link to the client.' : 'Saved.' }); }
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, 'Could not save') });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const whatsapp = () => {
    const phone = (doc?.proposal?.lead_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(`Hello${party ? ` ${party}` : ''}, here is our proposal "${p.title}". Please pick the package that suits you: ${link}`);
    return `https://wa.me/${phone.length >= 10 ? (phone.length === 10 ? `91${phone}` : phone) : ''}?text=${text}`;
  };

  const duplicate = async () => {
    try {
      const r = await salesService.duplicateProposal(id);
      navigate(`/sales/proposals/${r.data.proposal.id}`);
      setMsg({ ok: true, text: `Copied from ${p.proposal_code}. Edit and share the new version.` });
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
  };
  const withdraw = async () => {
    if (!window.confirm(`Withdraw ${p.proposal_code}? The client's link will say it is no longer available.`)) return;
    try { setDoc((await salesService.withdrawProposal(id)).data); setMsg({ ok: true, text: 'Withdrawn.' }); } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${p.proposal_code}? This cannot be undone.`)) return;
    try { await salesService.deleteProposal(id); navigate('/sales/proposals'); } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
  };

  // Chosen plan → draft quotation; the admin sends it from the quotation page.
  const [quoting, setQuoting] = useState(false);
  const makeQuote = async () => {
    setMsg(null);
    setQuoting(true);
    try {
      const res = await salesService.quoteFromProposal(id);
      navigate(`/sales/quotes/${res.data.quote.id}`, { state: { flash: { ok: true, text: `Quotation ${res.data.quote.quote_number} created from the ${accepted?.name || 'chosen'} plan. Review it and send it to the client.` } } });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, 'Could not create the quotation') });
    } finally {
      setQuoting(false);
    }
  };

  const accepted = doc?.tiers.find((t) => t.id === p?.accepted_tier_id);

  // Marketing people don't build priced proposals; send them to the quotation request instead.
  if (!id && !can('proposals.create')) {
    const leadId = params.get('leadId');
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Proposals', to: '/sales/proposals' }, { label: 'New proposal' }]} />
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-xl space-y-3">
          <h1 className="text-xl font-black text-slate-900">Proposals are built by the admin</h1>
          <p className="text-sm text-slate-600">Proposals carry prices, so the admin prepares them. List the services your client wants in a quotation request and the admin will price it.</p>
          <Link className={btnPrimary} to={`/sales/quotes/new${leadId ? `?leadId=${leadId}` : ''}`}>Request a quotation</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Proposals', to: '/sales/proposals' }, { label: p ? p.proposal_code : 'New proposal' }]} />
      <PageState loading={loading} error={error} onRetry={load}>
        <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
          <div className="space-y-4">
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-xl font-black text-slate-900">{p ? `${p.proposal_code} · ${p.title}` : 'New proposal'}</h1>
                <div className="flex items-center gap-2">
                  {p && <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${PROPOSAL_STATUS[p.status]?.[1] || ''}`}>{PROPOSAL_STATUS[p.status]?.[0] || p.status}</span>}
                  {p && can('proposals.create') && (
                    <ActionMenu label="Proposal actions" items={[
                      { label: 'Duplicate', icon: Copy, onClick: duplicate },
                      { label: 'Withdraw', icon: Undo2, onClick: withdraw, hidden: !['sent', 'viewed'].includes(p.status) },
                      { label: 'Delete', icon: Trash2, onClick: remove, danger: true, hidden: !['draft', 'withdrawn', 'rejected'].includes(p.status) }
                    ]} />
                  )}
                </div>
              </div>
              {p && locked && p.status !== 'rejected' && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  {p.status === 'withdrawn' ? 'Withdrawn — the client can no longer answer it. Duplicate to send a new version, or delete it.'
                    : 'The client answered this proposal, so it is locked as the record of what they agreed. Duplicate it to start a new version.'}
                </p>
              )}
              <fieldset disabled={!editable} className="grid md:grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-bold text-slate-600">For *</span>
                  <select className={inputCls} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                    <option value="">— Lead or client —</option>
                    {leads.length > 0 && <optgroup label="Leads">{leads.map((l) => <option key={`l${l.id}`} value={`lead:${l.id}`}>{l.company_name || l.title}</option>)}</optgroup>}
                    {clients.length > 0 && <optgroup label="Clients">{clients.map((c) => <option key={`c${c.id}`} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>}
                  </select></label>
                <label className="block"><span className="text-xs font-bold text-slate-600">Proposal title *</span>
                  <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Growth plan for Arrow Rehab" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-600">Billing cycle</span>
                  <select className={inputCls} value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                    {Object.entries(CYCLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-400">{form.billingCycle === 'one_time' ? 'Converts into a One-Time project' : 'Converts into a Regular (monthly) project'}</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs font-bold text-slate-600">Tax</span>
                    <select className={inputCls} value={form.gstMode} onChange={(e) => setForm({ ...form, gstMode: e.target.value })}><option value="gst">+ 18% GST</option><option value="non_gst">No GST</option></select></label>
                  <label className="block"><span className="text-xs font-bold text-slate-600">Valid until</span>
                    <input type="date" className={inputCls} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></label>
                </div>
                <label className="block md:col-span-2"><span className="text-xs font-bold text-slate-600">Introduction (shown to the client)</span>
                  <textarea rows={2} className={inputCls} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} /></label>
              </fieldset>
            </section>

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Packages ({form.tiers.length})</h2>
                {editable && (
                  <div className="flex gap-2">
                    <button type="button" className="text-xs font-bold text-slate-600 hover:text-red-600 inline-flex items-center gap-1" onClick={() => setForm((f) => ({ ...f, tiers: PRESET.map((t) => ({ ...blankTier(), ...t })) }))}><Wand2 className="w-3.5 h-3.5" /> Starter / Growth / Premium</button>
                    {form.tiers.length < 5 && <button type="button" className="text-xs font-bold text-slate-600 hover:text-red-600 inline-flex items-center gap-1" onClick={() => setForm((f) => ({ ...f, tiers: [...f.tiers, blankTier()] }))}><Plus className="w-3.5 h-3.5" /> Add package</button>}
                  </div>
                )}
              </div>
              <fieldset disabled={!editable} className="grid md:grid-cols-3 gap-3">
                {form.tiers.map((t, i) => (
                  <div key={t.key} className={`rounded-xl border-2 p-3 space-y-2 ${p?.accepted_tier_id && accepted?.name === t.name ? 'border-emerald-400 bg-emerald-50/40' : t.isRecommended ? 'border-red-300' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-1">
                      <input aria-label={`Package ${i + 1} name`} className={`${inputCls} font-bold`} value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="Package name" />
                      <button type="button" title="Recommended" aria-label={`Mark package ${i + 1} recommended`} onClick={() => setTier(i, { isRecommended: !t.isRecommended })} className={`p-1.5 rounded ${t.isRecommended ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}><Star className="w-4 h-4" fill={t.isRecommended ? 'currentColor' : 'none'} /></button>
                      {form.tiers.length > 1 && <button type="button" aria-label={`Remove package ${i + 1}`} onClick={() => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                    <input aria-label={`Package ${i + 1} price`} type="number" min="0" className={inputCls} value={t.price} onChange={(e) => setTier(i, { price: e.target.value })} placeholder={`Price ₹${CYCLE_SUFFIX[form.billingCycle]}`} />
                    <select aria-label={`Package ${i + 1} service`} className={inputCls} value={t.serviceId} onChange={(e) => setTier(i, { serviceId: e.target.value })}>
                      <option value="">— Service (for the project & invoice) —</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <textarea aria-label={`Package ${i + 1} inclusions`} rows={5} className={inputCls} value={t.inclusions} onChange={(e) => setTier(i, { inclusions: e.target.value })} placeholder={'What is included, one per line\n12 social media posts\n4 reels'} />
                  </div>
                ))}
              </fieldset>
            </section>

            {msg && <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{msg.text}</div>}
            {editable && (
              <div className="flex flex-wrap justify-end gap-2">
                <button className={btnSecondary} disabled={saving} onClick={() => save(false)}>Save {p ? 'changes' : 'draft'}</button>
                {can('proposals.send') && <button className={btnPrimary} disabled={saving} onClick={() => save(true)}><Send className="w-4 h-4" /> Save & get share link</button>}
              </div>
            )}
          </div>

          {p && (
            <aside className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                <h2 className="font-black text-slate-900">Client link</h2>
                {p.status === 'draft' ? <p className="text-sm text-slate-500">Save & get share link to activate it.</p> : (
                  <>
                    <div className="flex gap-1"><input readOnly className={`${inputCls} !text-xs font-mono`} value={link} aria-label="Proposal link" />
                      <button className={`${btnSecondary} !px-3`} onClick={copy} aria-label="Copy link">{copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button></div>
                    <div className="flex gap-2">
                      <a className={`${btnSecondary} flex-1 !text-xs`} href={whatsapp()} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
                      <a className={`${btnSecondary} flex-1 !text-xs`} href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /> Client view</a>
                    </div>
                  </>
                )}
                <dl className="text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between"><dt>For</dt><dd className="font-semibold">{party}</dd></div>
                  <div className="flex justify-between"><dt>Opened</dt><dd>{p.view_count} time{p.view_count === 1 ? '' : 's'}{p.last_viewed_at ? `, last ${fmtDateTime(p.last_viewed_at)}` : ''}</dd></div>
                  {p.valid_until && <div className="flex justify-between"><dt>Valid until</dt><dd>{fmtDate(p.valid_until)}</dd></div>}
                  {p.decided_at && <div className="flex justify-between"><dt>{p.status === 'rejected' ? 'Declined' : 'Accepted'} by</dt><dd>{p.decided_by_name}, {fmtDateTime(p.decided_at)}</dd></div>}
                </dl>
                {p.decision_note && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">“{p.decision_note}”</p>}
              </div>

              {/* Flow: chosen plan → quotation (client can negotiate) → onboard → invoice, from the quotation page. */}
              {p.status === 'accepted' && doc?.quote && (
                <div className="bg-white rounded-2xl border-2 border-sky-200 shadow-sm p-5 space-y-2">
                  <h2 className="font-black text-slate-900">Quotation created</h2>
                  <p className="text-xs text-slate-600">The {accepted?.name} plan is now quotation <b className="font-mono">{doc.quote.quote_number}</b>. Send it, handle any negotiation, then convert it to an invoice from there.</p>
                  <Link className={`${btnPrimary} w-full justify-center`} to={`/sales/quotes/${doc.quote.id}`}>Open {doc.quote.quote_number} <ArrowRight className="w-4 h-4" /></Link>
                </div>
              )}
              {p.status === 'accepted' && !doc?.quote && can('sales_quotes.price') && (
                <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-5 space-y-3">
                  <h2 className="font-black text-slate-900">Next: quotation for the chosen plan</h2>
                  <p className="text-xs text-slate-600">Client chose <b>{accepted?.name}</b> at <b>{inr0(accepted?.price)}{CYCLE_SUFFIX[p.billing_cycle]}</b>. Turn it into a quotation: you can adjust it, send it, and handle negotiation. Once accepted, convert it to the invoice (and project).</p>
                  <button className={`${btnPrimary} w-full justify-center`} disabled={quoting} onClick={makeQuote}>{quoting ? 'Creating…' : `Create quotation from ${accepted?.name || 'the chosen'} plan`}</button>
                </div>
              )}

              {p.status === 'converted' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2 text-sm">
                  <h2 className="font-black text-slate-900">Converted</h2>
                  <Link className="flex items-center justify-between hover:text-red-600" to={`/client-projects/${p.converted_client_id}`}>Client <ArrowRight className="w-4 h-4" /></Link>
                  <Link className="flex items-center justify-between hover:text-red-600" to={`/flow-projects/${p.converted_project_id}`}>Project <ArrowRight className="w-4 h-4" /></Link>
                  <Link className="flex items-center justify-between hover:text-red-600" to={`/finance/invoices/${p.converted_invoice_id}`}>Draft invoice <ArrowRight className="w-4 h-4" /></Link>
                </div>
              )}
            </aside>
          )}
        </div>
      </PageState>
    </div>
  );
}
