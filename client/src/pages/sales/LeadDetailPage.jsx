import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PhoneCall, Handshake, StickyNote, FileText, CalendarPlus, UserCheck, Pencil, Building2, ArrowRight, MessageSquareText, Phone, Mail,
  CalendarDays, IndianRupee, MessageCircle, UserPlus, Trash2, Target, Clock, User, CheckCircle2
} from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { Breadcrumbs, PageState, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import {
  StageBadge, STAGE_LABEL, INTERACTION_LABEL, PROPOSAL_STATUS, Modal, ScheduleMeetingModal, MinutesModal, fmtDateTime,
  SourceBadge, LeadFormModal, AssignLeadModal, waUrl, REFERRER_SOURCES
} from './salesUi';
import { inr0 } from '../finance/gstMath';
import { QUOTE_STATUS } from './quoteUi';

const TYPE_ICON = { call: PhoneCall, negotiation: Handshake, note: StickyNote, quote_followup: FileText, meeting: CalendarPlus, stage_change: ArrowRight, proposal: FileText };
const TYPE_TONE = { call: 'text-sky-600 bg-sky-50', negotiation: 'text-amber-600 bg-amber-50', quote_followup: 'text-violet-600 bg-violet-50', proposal: 'text-violet-600 bg-violet-50', meeting: 'text-emerald-600 bg-emerald-50', stage_change: 'text-slate-600 bg-slate-100', note: 'text-slate-600 bg-slate-100' };
const HISTORY_TABS = [
  ['all', 'All', () => true],
  ['negotiation', 'Negotiations', (i) => i.interaction_type === 'negotiation'],
  ['call', 'Calls', (i) => i.interaction_type === 'call'],
  ['quote', 'Quotes', (i) => ['proposal', 'quote_followup'].includes(i.interaction_type)],
  ['meeting', 'Meetings', (i) => i.interaction_type === 'meeting']
];
const LOG_TYPES = [
  ['call', 'Call', 'Record call log', 'Log duration & notes'],
  ['negotiation', 'Negotiation', 'Log negotiation', 'Track rounds & revised budget'],
  ['quote_followup', 'Quote follow-up', null, null],
  ['note', 'Note', null, null]
];
const EMPTY_LOG = { title: '', outcome: '', stageTo: '', nextFollowupDate: '', durationMinutes: '', revisedBudget: '' };
const initials = (s) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-slate-50 last:border-0 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner, roles } = usePermission();
  const can = (p) => isOwner || hasPermission(p);
  const slugs = (roles || []).map((r) => r.slug);
  const canAssign = isOwner || ['owner', 'admin', 'account-manager'].some((s) => slugs.includes(s));
  const [data, setData] = useState(null);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [logType, setLogType] = useState('call');
  const [log, setLog] = useState(EMPTY_LOG);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('all');
  const formRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await salesService.getLead(id)).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the enquiry'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const [quotes, setQuotes] = useState([]);
  useEffect(() => {
    if (!can('sales_quotes.view')) return;
    salesService.listQuotes({ leadId: id }).then((r) => setQuotes(r.data.quotes || [])).catch(() => setQuotes([]));
    // reload when the enquiry reloads (e.g. after a follow-up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data]);
  useEffect(() => { if (canAssign) salesService.owners().then((r) => setOwners(r.data.owners)).catch(() => {}); }, [canAssign]);
  // Opened from the sales desk with ?log=call: preselect that follow-up type and jump to the form.
  const [params] = useSearchParams();
  const logParam = params.get('log');
  useEffect(() => {
    if (!data || !logParam || !['call', 'negotiation', 'quote_followup', 'note'].includes(logParam)) return;
    setLogType(logParam);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    // run once per lead load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data), logParam]);

  const lead = data?.lead;
  const stats = data?.stats;
  const closed = lead && ['Won', 'Lost'].includes(lead.stage);
  const canEdit = can('leads.update');
  const name = lead ? lead.company_name || lead.title : '';
  const nextRound = (stats?.negotiations || 0) + 1;

  const startLog = (type) => {
    setLogType(type);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const submitLog = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await salesService.logInteraction(id, {
        type: logType, title: log.title, outcome: log.outcome || null, stageTo: log.stageTo || null, nextFollowupDate: log.nextFollowupDate || null,
        durationMinutes: logType === 'call' ? log.durationMinutes : null, revisedBudget: logType === 'negotiation' ? log.revisedBudget : null
      });
      setData(res.data);
      setLog(EMPTY_LOG);
      setMsg({ ok: true, text: logType === 'negotiation' ? `Negotiation round ${nextRound} saved.` : 'Saved to history.' });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const changeStage = async (stageTo) => {
    if (!stageTo || stageTo === lead.stage) return;
    if (stageTo === 'Won') return setModal('onboard');
    let outcome = null;
    if (stageTo === 'Lost') {
      outcome = window.prompt('Why was this enquiry lost?');
      if (outcome === null) return;
      if (!outcome.trim()) return setMsg({ ok: false, text: 'Add a reason so the team knows why it was lost.' });
    }
    setMsg(null);
    try {
      const res = await salesService.logInteraction(id, { type: 'stage_change', title: `Status changed to ${STAGE_LABEL[stageTo] || stageTo}`, outcome, stageTo });
      setData(res.data);
      setMsg({ ok: true, text: `Status changed to ${STAGE_LABEL[stageTo] || stageTo}.` });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the enquiry from ${name}? Its follow-ups and meetings are removed too. This cannot be undone.`)) return;
    try {
      await salesService.deleteLead(id);
      navigate('/sales/leads');
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };

  const onboard = async () => {
    try {
      const res = await salesService.onboardLead(id, {});
      setModal(null);
      setMsg({ ok: true, text: `Onboarded as client ${res.data.client_name}.` });
      setData(res.data.lead);
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
      setModal(null);
    }
  };

  const wa = lead && waUrl(lead.phone, `Hello ${lead.contact_name || name}, this is D-GROW Marketing regarding your enquiry.`);
  const visible = data ? data.interactions.filter(HISTORY_TABS.find(([k]) => k === tab)[2]) : [];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Enquiries', to: '/sales/leads' }, { label: lead ? `${name} (#${lead.id})` : '…' }]} />
      <PageState loading={loading} error={error} onRetry={load}>
        {lead && (
          <>
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-100 border-t-4 border-t-red-600 shadow-sm p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center text-xl font-black shrink-0">{initials(name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-black text-slate-900">{name}</h1>
                    <StageBadge stage={lead.stage} />
                    <SourceBadge source={lead.source} referrer={lead.referrer_name} />
                    {lead.rep_name && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700">REP: {lead.rep_name}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${lead.owner_name ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{lead.owner_name ? `Assigned: ${lead.owner_name}` : 'Unassigned'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                    {lead.contact_name && <span className="inline-flex items-center gap-1"><User className="w-4 h-4 text-slate-400" />{lead.contact_name}</span>}
                    {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Phone className="w-4 h-4" />{lead.phone}</a>}
                    {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Mail className="w-4 h-4" />{lead.email}</a>}
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-4 h-4 text-slate-400" />Created {fmtDate(lead.created_at)}</span>
                  </div>
                  {lead.lost_reason && lead.stage === 'Lost' && <p className="text-sm text-red-600 mt-1">Lost: {lead.lost_reason}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['Negotiations', `${stats.negotiations} round${stats.negotiations === 1 ? '' : 's'}`, Handshake, 'bg-amber-50 text-amber-700 border-amber-100'],
                  ['Calls logged', `${stats.calls} call${stats.calls === 1 ? '' : 's'}${stats.callMinutes ? ` · ${stats.callMinutes} min` : ''}`, PhoneCall, 'bg-sky-50 text-sky-700 border-sky-100'],
                  ['Deal budget', lead.estimated_value ? inr0(lead.estimated_value) : '—', IndianRupee, 'bg-emerald-50 text-emerald-700 border-emerald-100'],
                  ['Meetings · proposals', `${stats.meetings} · ${stats.proposals}`, CalendarPlus, 'bg-violet-50 text-violet-700 border-violet-100']].map(([l, v, Icon, tone]) => (
                  <div key={l} className={`rounded-xl border p-3 text-center ${tone}`}>
                    <div className="text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{l}</div>
                    <div className="text-xl font-black mt-0.5">{v}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                {canEdit && (
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl pl-3 pr-1 py-1">
                    Status:
                    <select aria-label="Change status" className={`${inputCls} !w-auto !py-1 !text-xs`} value={lead.stage} onChange={(e) => changeStage(e.target.value)} disabled={Boolean(lead.converted_client_id)}>
                      {data.stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] || s}{s === 'Won' && !lead.converted_client_id ? ' (onboard)' : ''}</option>)}
                    </select>
                  </label>
                )}
                {canEdit && !closed && <button className={btnSecondary} onClick={() => startLog('call')}><PhoneCall className="w-4 h-4 text-sky-600" /> Log call</button>}
                {wa && <a className={`${btnSecondary} !text-emerald-700`} href={wa} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
                {canAssign && !closed && <button className={btnSecondary} onClick={() => setModal('assign')}><UserPlus className="w-4 h-4 text-blue-600" /> {lead.owner_name ? 'Reassign' : 'Assign marketer'}</button>}
                {canEdit && !closed && <button className={btnSecondary} onClick={() => setModal('meeting')}><CalendarPlus className="w-4 h-4" /> Meeting</button>}
                {can('proposals.create') && !closed && <button className={btnSecondary} onClick={() => navigate(`/sales/proposals/new?leadId=${id}`)}><FileText className="w-4 h-4 text-violet-600" /> Create proposal</button>}
                {(can('sales_quotes.request') || can('sales_quotes.price')) && !closed && (
                  <button className={btnSecondary} onClick={() => navigate(`/sales/quotes/new?leadId=${id}`)}><FileText className="w-4 h-4 text-sky-600" /> {can('sales_quotes.price') ? 'Quotation' : 'Request quotation'}</button>
                )}
                {can('leads.convert') && !lead.converted_client_id && lead.stage !== 'Lost' && (
                  <button className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5" onClick={() => setModal('onboard')}><UserCheck className="w-4 h-4" /> Convert to client</button>
                )}
                {canEdit && <button className={btnSecondary} onClick={() => setModal('edit')}><Pencil className="w-4 h-4" /> Edit</button>}
                {can('leads.delete') && !lead.converted_client_id && <button className={`${btnSecondary} !text-red-600 !border-red-200`} onClick={remove}><Trash2 className="w-4 h-4" /> Remove</button>}
              </div>
            </div>

            {msg && <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{msg.text}</div>}

            <div className="grid xl:grid-cols-[360px_1fr] gap-4">
              {/* Left column: profile, requirements, engagement, onboarding */}
              <div className="space-y-4 xl:order-1 order-2">
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-black text-slate-900 flex items-center gap-2"><User className="w-4 h-4 text-red-600" /> Prospect profile</h2>
                    {canEdit && <button className="text-xs font-bold text-red-600 hover:underline" onClick={() => setModal('edit')}>Edit</button>}
                  </div>
                  <Row label="Company">{lead.company_name || '—'}</Row>
                  <Row label="Contact person">{lead.contact_name || '—'}</Row>
                  <Row label="Phone">{lead.phone ? <a href={`tel:${lead.phone}`} className="text-red-600">{lead.phone}</a> : '—'}</Row>
                  <Row label="Email">{lead.email ? <a href={`mailto:${lead.email}`} className="text-blue-700">{lead.email}</a> : '—'}</Row>
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-black text-slate-900 flex items-center gap-2 mb-2"><Target className="w-4 h-4 text-red-600" /> Requirements & source</h2>
                  <Row label="Lead source">{lead.source || '—'}</Row>
                  {lead.referrer_name && <Row label={REFERRER_SOURCES.includes(lead.source) && lead.source === 'Marketing Person' ? 'Marketing person' : 'Referred by'}>{lead.referrer_name}</Row>}
                  <Row label="REP (brought in by)">{lead.rep_name || <i className="text-slate-400 font-normal">Direct</i>}</Row>
                  <Row label="Assigned marketer">
                    {lead.owner_name || <i className="text-slate-400 font-normal">Unassigned</i>}
                    {canAssign && !closed && <button className="ml-2 text-xs font-bold text-blue-600 hover:underline" onClick={() => setModal('assign')}>{lead.owner_name ? 'Change' : '+ Assign'}</button>}
                  </Row>
                  <Row label="Services interested"><span className="text-red-700">{lead.services_interested || '—'}</span></Row>
                  <Row label="Deal budget"><span className="text-emerald-700">{lead.estimated_value ? inr0(lead.estimated_value) : '—'}</span></Row>
                  <Row label="Next follow-up">{lead.next_followup_date && !closed ? fmtDate(lead.next_followup_date) : '—'}</Row>
                  <Row label="Date created">{fmtDate(lead.created_at)}{lead.created_by_name ? ` · ${lead.created_by_name}` : ''}</Row>
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 border-t-4 border-t-orange-400 shadow-sm p-5">
                  <h2 className="font-black text-orange-700 flex items-center gap-2 mb-3"><Handshake className="w-4 h-4" /> Engagement & negotiation</h2>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl border border-slate-100 p-3"><div className="text-[11px] font-bold uppercase text-orange-700">Negotiations</div><div className="text-2xl font-black text-orange-600">{stats.negotiations}</div></div>
                    <div className="rounded-xl border border-slate-100 p-3"><div className="text-[11px] font-bold uppercase text-sky-700">Calls</div><div className="text-2xl font-black text-sky-600">{stats.calls}</div></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    {stats.negotiations === 0
                      ? 'No negotiations logged yet. Log a negotiation round or create a proposal to start the terms discussion.'
                      : `Last agreed budget: ${stats.lastNegotiationAmount != null ? inr0(stats.lastNegotiationAmount) : 'not recorded'}.`}
                  </p>
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-black text-slate-900 flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-red-600" /> Onboarding status</h2>
                  {lead.converted_client_id ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                      <div className="font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Onboarded client</div>
                      <Link to={`/client-projects/${lead.converted_client_id}`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 mt-1 hover:underline">
                        {lead.converted_client_name || 'Open client'} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : lead.stage === 'Lost' ? (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">Marked lost. Change the status to reopen it.</div>
                  ) : (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                      <div className="font-bold text-amber-800">Prospect in pipeline</div>
                      <p className="text-sm text-amber-700 mt-1">Ready to close? Convert this enquiry to add them to your clients.</p>
                      {can('leads.convert') && <button className="mt-3 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5" onClick={() => setModal('onboard')}><UserCheck className="w-4 h-4" /> 1-click onboard</button>}
                    </div>
                  )}
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-black text-slate-900 mb-3">Meetings</h2>
                  {data.meetings.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
                    <ul className="space-y-2">
                      {data.meetings.map((m) => (
                        <li key={m.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                          <div className="font-bold">{m.title}</div>
                          <div className="text-xs text-slate-500">{fmtDateTime(m.starts_at)} · {m.mode === 'online' ? 'Online' : 'In person'} · {m.status}</div>
                          {m.decisions && <div className="text-xs text-slate-700 mt-1"><b>Decisions:</b> {m.decisions}</div>}
                          {canEdit && <button className="text-xs font-bold text-red-600 mt-1 hover:underline" onClick={() => setModal({ minutes: m })}>{m.status === 'completed' ? 'Edit minutes' : 'Add minutes / mark done'}</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-black text-slate-900 mb-3">Proposals</h2>
                  {data.proposals.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
                    <ul className="space-y-2">
                      {data.proposals.map((p) => (
                        <li key={p.id}><Link to={`/sales/proposals/${p.id}`} className="flex justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm hover:bg-slate-100">
                          <span><b className="font-mono">{p.proposal_code}</b> {p.title}</span>
                          <span className={`px-2 py-0.5 h-fit rounded-full text-[11px] font-bold ${PROPOSAL_STATUS[p.status][1]}`}>{PROPOSAL_STATUS[p.status][0]}</span>
                        </Link></li>
                      ))}
                    </ul>
                  )}
                </section>

                {quotes.length > 0 && (
                  <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h2 className="font-black text-slate-900 mb-3">Quotations</h2>
                    <ul className="space-y-2">
                      {quotes.map((qt) => {
                        const [label, cls] = QUOTE_STATUS[qt.status] || [qt.status, ''];
                        return (
                          <li key={qt.id}><Link to={`/sales/quotes/${qt.id}`} className="flex justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm hover:bg-slate-100">
                            <span><b className="font-mono">{qt.quote_number}</b> {qt.status === 'requested' ? <i className="text-slate-400">awaiting price</i> : inr0(qt.total_amount)}</span>
                            <span className={`px-2 py-0.5 h-fit rounded-full text-[11px] font-bold ${cls}`}>{label}</span>
                          </Link></li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {lead.notes && <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"><h2 className="font-black text-slate-900 mb-2">Notes</h2><p className="text-sm text-slate-600 whitespace-pre-line">{lead.notes}</p></section>}
              </div>

              {/* Right column: quick actions, log form, history */}
              <div className="space-y-4 xl:order-2 order-1">
                {canEdit && !closed && (
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[['call', PhoneCall, 'Record call log', 'Log duration & notes', 'border-sky-100 bg-sky-50/40 text-sky-700'],
                      ['negotiation', Handshake, 'Log negotiation', 'Track round & revised budget', 'border-amber-100 bg-amber-50/40 text-amber-700'],
                      // Admins build priced proposals; marketing people request a quotation (services only).
                      can('proposals.create')
                        ? ['proposal', FileText, 'Create proposal', 'Build a 3-package proposal', 'border-violet-100 bg-violet-50/40 text-violet-700']
                        : ['quote', FileText, 'Request quotation', 'Pick services; admin adds prices', 'border-violet-100 bg-violet-50/40 text-violet-700']].map(([t, Icon, title, sub, tone]) => (
                      <button key={t} className={`text-left rounded-2xl border p-4 hover:shadow-sm ${tone}`}
                        onClick={() => (t === 'proposal' ? navigate(`/sales/proposals/new?leadId=${id}`) : t === 'quote' ? navigate(`/sales/quotes/new?leadId=${id}`) : startLog(t))}>
                        <div className="flex items-center gap-2 font-black"><Icon className="w-5 h-5" />{title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
                      </button>
                    ))}
                  </div>
                )}

                {canEdit && !closed && (
                  <form ref={formRef} onSubmit={submitLog} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 scroll-mt-24">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h2 className="font-black text-slate-900 flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-red-600" /> Add interaction / negotiation note</h2>
                      <span className="text-xs text-slate-400">Calls, negotiations, quote follow-ups or notes</span>
                    </div>
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Interaction type">
                      {LOG_TYPES.map(([t, label]) => {
                        const Icon = TYPE_ICON[t];
                        return (
                          <button type="button" key={t} role="radio" aria-checked={logType === t} onClick={() => setLogType(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${logType === t ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                            <Icon className="w-3.5 h-3.5" /> {label}{t === 'negotiation' ? ` (round ${nextRound})` : ''}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid sm:grid-cols-[1fr_180px] gap-3">
                      <label className="block"><span className="text-xs font-bold text-slate-600">Summary / title *</span>
                        <input className={inputCls} required minLength={2} value={log.title} onChange={(e) => setLog({ ...log, title: e.target.value })}
                          placeholder={logType === 'negotiation' ? `Negotiation round ${nextRound}: offer discussed` : logType === 'call' ? 'e.g. Intro call, discussed requirements' : 'What happened?'} /></label>
                      {logType === 'call' && (
                        <label className="block"><span className="text-xs font-bold text-slate-600">Duration (minutes)</span>
                          <input type="number" min="0" max="1440" className={inputCls} value={log.durationMinutes} onChange={(e) => setLog({ ...log, durationMinutes: e.target.value })} /></label>
                      )}
                      {logType === 'negotiation' && (
                        <label className="block"><span className="text-xs font-bold text-slate-600">Revised budget ₹</span>
                          <input type="number" min="0" className={inputCls} value={log.revisedBudget} onChange={(e) => setLog({ ...log, revisedBudget: e.target.value })} placeholder={lead.estimated_value ? String(lead.estimated_value) : ''} /></label>
                      )}
                    </div>
                    <label className="block"><span className="text-xs font-bold text-slate-600">Detailed conversation & next steps</span>
                      <textarea rows={3} className={inputCls} value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })} placeholder="Payment terms, client counter-offer, discount, callback schedule…" /></label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block"><span className="text-xs font-bold text-slate-600">Move status to</span>
                        <select className={inputCls} value={log.stageTo} onChange={(e) => setLog({ ...log, stageTo: e.target.value })}>
                          <option value="">(keep {STAGE_LABEL[lead.stage]})</option>
                          {data.stages.filter((s) => s !== lead.stage && s !== 'Won').map((s) => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}
                        </select></label>
                      <label className="block"><span className="text-xs font-bold text-slate-600">Next follow-up</span>
                        <input type="date" className={inputCls} value={log.nextFollowupDate} onChange={(e) => setLog({ ...log, nextFollowupDate: e.target.value })} /></label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        {logType === 'negotiation' ? `This is recorded as negotiation round ${nextRound}${log.revisedBudget ? ' and updates the deal budget' : ''}.` : ''}
                      </span>
                      <button className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : '+ Save to history'}</button>
                    </div>
                  </form>
                )}

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="font-black text-slate-900 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-500" /> Complete history</h2>
                      <p className="text-xs text-slate-500">Calls, negotiations, proposals, meetings and status changes</p>
                    </div>
                    <div className="flex gap-1 bg-slate-50 p-1 rounded-xl flex-wrap" role="tablist" aria-label="History filter">
                      {HISTORY_TABS.map(([k, label, fn]) => (
                        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${tab === k ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>
                          {label} ({data.interactions.filter(fn).length})
                        </button>
                      ))}
                    </div>
                  </div>
                  {visible.length === 0 ? <p className="text-sm text-slate-400">Nothing here yet.</p> : (
                    <ol className="space-y-3">
                      {visible.map((i) => {
                        const Icon = TYPE_ICON[i.interaction_type] || StickyNote;
                        return (
                          <li key={i.id} className="flex gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TYPE_TONE[i.interaction_type] || TYPE_TONE.note}`}><Icon className="w-4 h-4" /></span>
                            <div className="flex-1 min-w-0 rounded-xl border border-slate-100 border-l-4 border-l-slate-300 p-3">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="font-bold text-slate-900">
                                  {i.title}
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-500 align-middle">
                                    {INTERACTION_LABEL[i.interaction_type]}{i.negotiation_round ? ` · round ${i.negotiation_round}` : ''}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(i.created_at)}</span>
                              </div>
                              {(i.duration_minutes != null || i.amount != null || i.stage_to) && (
                                <div className="flex flex-wrap gap-2 mt-1 text-xs">
                                  {i.duration_minutes != null && <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold">{i.duration_minutes} min call</span>}
                                  {i.amount != null && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">Revised budget {inr0(i.amount)}</span>}
                                  {i.stage_to && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">{STAGE_LABEL[i.stage_from] || i.stage_from || '—'} → {STAGE_LABEL[i.stage_to] || i.stage_to}</span>}
                                </div>
                              )}
                              {i.outcome && <div className="text-sm text-slate-600 whitespace-pre-line mt-1">{i.outcome}</div>}
                              <div className="text-[11px] text-slate-400 mt-1">
                                Logged by {i.created_by_name || 'client'}{i.next_followup_date && <> · next follow-up {fmtDate(i.next_followup_date)}</>}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </PageState>

      {modal === 'edit' && <LeadFormModal lead={lead} sources={data.sources} owners={owners} canAssign={canAssign} onClose={() => setModal(null)} onSaved={(d) => { setData(d); setModal(null); setMsg({ ok: true, text: 'Enquiry updated.' }); }} />}
      {modal === 'assign' && <AssignLeadModal lead={lead} owners={owners} onClose={() => setModal(null)} onSaved={(d) => { setData(d); setModal(null); setMsg({ ok: true, text: `Assigned to ${d.lead.owner_name}.` }); }} />}
      {modal === 'meeting' && <ScheduleMeetingModal leadId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.minutes && <MinutesModal meeting={modal.minutes} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === 'onboard' && (
        <Modal title="Convert to client" subtitle={name} onClose={() => setModal(null)}>
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate-600">Creates the client record from this enquiry and marks it <b>Won</b>. You can then create projects, proposals and invoices for them.</p>
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} onClick={() => setModal(null)}>Cancel</button>
              <button className={btnPrimary} onClick={onboard}>Convert to client</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
