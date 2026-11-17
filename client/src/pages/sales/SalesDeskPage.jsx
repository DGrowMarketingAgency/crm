import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase, Plus, CalendarPlus, PhoneCall, Handshake, FileText, AlertTriangle, CalendarClock, CalendarDays, Send, Eye,
  Video, MapPin, CheckCircle2, XCircle, RefreshCw
} from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../hooks/useAuth';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import {
  StageBadge, STAGE_LABEL, SourceBadge, LeadFormModal, ScheduleMeetingModal, fmtDateTime, PROPOSAL_STATUS
} from './salesUi';
import { inr0 } from '../finance/gstMath';
import { QUOTE_STATUS } from './quoteUi';

// The steps shown on each card. Lost is shown separately (it ends the pipeline).
const TRACK = ['New', 'Contacted', 'DiscoveryCallDone', 'ProposalSent', 'Negotiation', 'Won'];

function StageTracker({ stage }) {
  if (stage === 'Lost') {
    return <div className="flex items-center gap-1.5 text-xs font-bold text-red-600"><XCircle className="w-4 h-4" /> Lost</div>;
  }
  const at = TRACK.indexOf(stage);
  return (
    <ol className="flex items-center gap-1" aria-label={`Stage: ${STAGE_LABEL[stage] || stage}`}>
      {TRACK.map((s, i) => (
        <li key={s} className="flex-1 min-w-0" title={STAGE_LABEL[s]}>
          <div className={`h-1.5 rounded-full ${i <= at ? (stage === 'Won' ? 'bg-emerald-500' : 'bg-red-500') : 'bg-slate-200'}`} />
          <div className={`mt-1 text-[9px] font-bold uppercase truncate ${i === at ? 'text-slate-900' : 'text-slate-400'}`}>{STAGE_LABEL[s]}</div>
        </li>
      ))}
    </ol>
  );
}

function LeadCard({ l, canProposal, canQuote, onMeeting }) {
  const navigate = useNavigate();
  const closed = ['Won', 'Lost'].includes(l.stage);
  const today = new Date().toLocaleDateString('en-CA');
  const due = l.next_followup_date && String(l.next_followup_date).slice(0, 10);
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 ${closed ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/sales/leads/${l.id}`} className="font-black text-slate-900 hover:text-red-600 block truncate">{l.company_name || l.title}</Link>
          <div className="text-xs text-slate-500 truncate">#{l.id} · {fmtDate(l.created_at)}{l.contact_name ? ` · ${l.contact_name}` : ''}</div>
        </div>
        <StageBadge stage={l.stage} />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <SourceBadge source={l.source} referrer={l.referrer_name} />
        {l.rep_name && <span className="px-2 py-0.5 rounded-lg font-bold bg-violet-50 text-violet-700">REP: {l.rep_name}</span>}
        {l.services_interested && <span className="px-2 py-0.5 rounded-lg font-bold bg-slate-100 text-slate-600 truncate max-w-[180px]">{l.services_interested}</span>}
      </div>
      <div className="text-xs text-slate-600 space-y-0.5">
        {l.phone && <a href={`tel:${l.phone}`} className="block hover:text-red-600">📞 {l.phone}</a>}
        <div>Budget: <b>{l.estimated_value ? inr0(l.estimated_value) : 'Flexible / TBD'}</b></div>
      </div>
      <StageTracker stage={l.stage} />
      <div className="rounded-xl bg-slate-50 p-2.5 text-xs">
        <div className="flex gap-3 font-bold text-slate-600">
          <span className="inline-flex items-center gap-1" title="Calls"><PhoneCall className="w-3.5 h-3.5" />{l.calls}</span>
          <span className="inline-flex items-center gap-1" title="Negotiations"><Handshake className="w-3.5 h-3.5" />{l.negotiations}</span>
          <span className="inline-flex items-center gap-1" title="Proposals"><FileText className="w-3.5 h-3.5" />{l.proposals}</span>
          {due && !closed && (
            <span className={`ml-auto inline-flex items-center gap-1 ${due < today ? 'text-red-600' : due === today ? 'text-amber-600' : 'text-slate-500'}`}>
              <CalendarClock className="w-3.5 h-3.5" />{due < today ? 'Overdue ' : due === today ? 'Today ' : ''}{fmtDate(l.next_followup_date)}
            </span>
          )}
        </div>
        {l.last_title && <div className="text-slate-500 mt-1 truncate">Latest: {l.last_title} · {fmtDate(l.last_at)}</div>}
      </div>
      {!closed && (
        <div className="flex flex-wrap gap-1.5">
          <button className={`${btnSecondary} !py-1.5 !px-2.5 !text-xs`} onClick={() => navigate(`/sales/leads/${l.id}?log=call`)}><PhoneCall className="w-3.5 h-3.5 text-sky-600" /> Log call</button>
          <button className={`${btnSecondary} !py-1.5 !px-2.5 !text-xs`} onClick={() => onMeeting(l)}><CalendarPlus className="w-3.5 h-3.5" /> Meeting</button>
          {canProposal && <button className={`${btnSecondary} !py-1.5 !px-2.5 !text-xs`} onClick={() => navigate(`/sales/proposals/new?leadId=${l.id}`)}><FileText className="w-3.5 h-3.5 text-violet-600" /> Proposal</button>}
          {canQuote && <button className={`${btnSecondary} !py-1.5 !px-2.5 !text-xs`} onClick={() => navigate(`/sales/quotes/new?leadId=${l.id}`)}><FileText className="w-3.5 h-3.5 text-sky-600" /> Quote</button>}
          <Link className={`${btnSecondary} !py-1.5 !px-2.5 !text-xs`} to={`/sales/leads/${l.id}`}><Eye className="w-3.5 h-3.5" /> 360° view</Link>
        </div>
      )}
    </div>
  );
}

function FollowupList({ title, items, tone, empty }) {
  return (
    <div>
      <div className={`text-[11px] font-black uppercase tracking-wider mb-1.5 ${tone}`}>{title} ({items.length})</div>
      {items.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
        <ul className="space-y-1">
          {items.map((f) => (
            <li key={f.id}>
              <Link to={`/sales/leads/${f.id}?log=call`} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm">
                <span className="font-semibold truncate">{f.company_name || f.title}</span>
                <span className={`text-xs font-bold whitespace-nowrap ${tone}`}>{fmtDate(f.next_followup_date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SalesDeskPage() {
  const { hasPermission, isOwner, roles } = usePermission();
  const { user: me } = useAuth();
  const can = (p) => isOwner || hasPermission(p);
  const slugs = (roles || []).map((r) => r.slug);
  const isManager = isOwner || slugs.includes('owner') || slugs.includes('admin');
  const canAssign = isManager || slugs.includes('account-manager');
  const [userId, setUserId] = useState('');
  const [owners, setOwners] = useState([]);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('assigned');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [sources, setSources] = useState([]);

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await salesService.desk(userId ? { userId } : {})).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the sales desk'));
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isManager || canAssign) salesService.owners().then((r) => setOwners(r.data.owners)).catch(() => {});
    salesService.listLeads({ period: 'today' }).then((r) => setSources(r.data.sources || [])).catch(() => {});
  }, [isManager, canAssign]);

  const k = data?.kpis;
  const viewingOther = data && Number(data.user.id) !== Number(me?.id);
  const openLeads = (data?.assigned || []).filter((l) => !['Won', 'Lost'].includes(l.stage));
  const closedLeads = (data?.assigned || []).filter((l) => ['Won', 'Lost'].includes(l.stage));

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><Briefcase className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">{viewingOther ? `${data.user.name}'s Sales Desk` : 'My Sales Desk'}</h1>
            <p className="text-sm text-slate-500">Enquiries you sent, leads assigned to you, follow-ups, meetings and proposals in one place.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && owners.length > 0 && (
            <select aria-label="View desk of" className={`${inputCls} !w-auto`} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">My desk</option>
              {owners.filter((o) => Number(o.id) !== Number(me?.id)).map((o) => <option key={o.id} value={o.id}>{o.name}{o.isMarketer ? ' (marketer)' : ''}</option>)}
            </select>
          )}
          <button className={btnSecondary} onClick={load} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
          {can('leads.update') && <button className={btnSecondary} onClick={() => setModal({ type: 'meeting' })}><CalendarPlus className="w-4 h-4" /> Meeting</button>}
          {can('leads.create') && <button className={btnPrimary} onClick={() => setModal({ type: 'lead' })}><Plus className="w-4 h-4" /> New enquiry</button>}
        </div>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              {[['Assigned to me', k.assignedOpen, 'Open leads', 'text-slate-900', 'border-l-red-500'],
                ['Due today', k.dueToday, 'Follow-ups', 'text-amber-600', 'border-l-amber-500'],
                ['Overdue', k.overdue, 'Follow-ups', 'text-red-600', 'border-l-red-600'],
                ['Meetings', k.upcomingMeetings, 'Upcoming', 'text-sky-600', 'border-l-sky-500'],
                ['Negotiating', k.inNegotiation, 'Proposal / negotiation', 'text-violet-600', 'border-l-violet-500'],
                ['Pipeline', inr0(k.pipelineValue), 'Open budget', 'text-emerald-600', 'border-l-emerald-500'],
                ['Sent by me', k.sent, 'Enquiries as REP', 'text-slate-700', 'border-l-slate-400']].map(([l, v, sub, c, b]) => (
                <div key={l} className={`bg-white p-4 rounded-2xl border border-slate-100 border-l-4 ${b} shadow-sm`}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div>
                  <div className={`text-2xl font-black mt-1 ${c}`}>{v}</div>
                  <div className="text-[11px] text-slate-400">{sub}</div>
                </div>
              ))}
            </div>

            <div className="grid xl:grid-cols-[1fr_340px] gap-4">
              <div className="space-y-3">
                <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-100 w-fit" role="tablist" aria-label="Lists">
                  {[['assigned', `Assigned to me (${openLeads.length})`], ['sent', `Enquiries I sent (${data.sent.length})`], ['closed', `Won / lost (${closedLeads.length})`]].map(([v, l]) => (
                    <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === v ? 'bg-red-600 text-white' : 'text-slate-600'}`}>{l}</button>
                  ))}
                </div>

                {tab === 'assigned' && (openLeads.length === 0
                  ? <Empty icon={Briefcase} title="No leads assigned yet" text="When the admin assigns an enquiry to you, it shows here with its follow-ups." />
                  : <div className="grid md:grid-cols-2 gap-3">{openLeads.map((l) => <LeadCard key={l.id} l={l} canProposal={can('proposals.create')} canQuote={can('sales_quotes.request') || can('sales_quotes.price')} onMeeting={(lead) => setModal({ type: 'meeting', lead })} />)}</div>)}

                {tab === 'closed' && (closedLeads.length === 0
                  ? <Empty icon={CheckCircle2} title="Nothing closed yet" />
                  : <div className="grid md:grid-cols-2 gap-3">{closedLeads.map((l) => <LeadCard key={l.id} l={l} />)}</div>)}

                {tab === 'sent' && (data.sent.length === 0
                  ? <Empty icon={Send} title="No enquiries sent yet" text="Enquiries you add are sent to the admin, who assigns someone to follow them up." />
                  : (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                      <table className="w-full text-sm text-left min-w-[640px]">
                        <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Business</th><th className="px-4 py-2.5">Assigned to</th>
                          <th className="px-4 py-2.5 text-right">Budget</th><th className="px-4 py-2.5">Status</th></tr></thead>
                        <tbody>
                          {data.sent.map((l) => (
                            <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                              <td className="px-4 py-2.5"><Link to={`/sales/leads/${l.id}`} className="font-semibold hover:text-red-600">{l.company_name || l.title}</Link>
                                <div className="text-[11px] text-slate-400">{[l.contact_name, l.phone].filter(Boolean).join(' · ')}</div></td>
                              <td className="px-4 py-2.5">{l.owner_name || <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">Waiting for admin</span>}</td>
                              <td className="px-4 py-2.5 text-right">{l.estimated_value ? inr0(l.estimated_value) : '—'}</td>
                              <td className="px-4 py-2.5"><StageBadge stage={l.stage} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>

              <div className="space-y-4">
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <h2 className="font-black text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Follow-ups</h2>
                  <FollowupList title="Overdue" items={data.followups.overdue} tone="text-red-600" empty="None overdue." />
                  <FollowupList title="Today" items={data.followups.today} tone="text-amber-600" empty="Nothing due today." />
                  <FollowupList title="Next 7 days" items={data.followups.upcoming} tone="text-slate-500" empty="Nothing scheduled." />
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-black text-slate-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sky-600" /> Upcoming meetings</h2>
                    <Link to="/sales/meetings" className="text-xs font-bold text-red-600 hover:underline">All</Link>
                  </div>
                  {data.meetings.length === 0 ? <p className="text-xs text-slate-400">No meetings coming up.</p> : (
                    <ul className="space-y-2">
                      {data.meetings.map((m) => (
                        <li key={m.id} className={`rounded-xl border-l-4 bg-slate-50 p-2.5 text-sm ${m.is_client ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
                          <div className="font-bold text-slate-900">{m.title}</div>
                          <div className="text-xs text-slate-500">{m.is_client ? `Client: ${m.client_name}` : `Prospect: ${m.lead_name}`}</div>
                          <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                            {m.mode === 'online' ? <Video className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}{fmtDateTime(m.starts_at)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-black text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-sky-600" /> Quotations</h2>
                    <Link to="/sales/quotes" className="text-xs font-bold text-red-600 hover:underline">All</Link>
                  </div>
                  {(data.quotes || []).length === 0 ? <p className="text-xs text-slate-400">No quotation requests yet.</p> : (
                    <ul className="space-y-1.5">
                      {data.quotes.map((qt) => {
                        const [label, cls] = QUOTE_STATUS[qt.status] || [qt.status, ''];
                        return (
                          <li key={qt.id}>
                            <Link to={`/sales/quotes/${qt.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm">
                              <span className="truncate"><b className="font-mono text-xs">{qt.quote_number}</b> {qt.party_name}{qt.status !== 'requested' ? ` · ${inr0(qt.total_amount)}` : ''}</span>
                              <span className={`px-2 py-0.5 h-fit rounded-full text-[10px] font-bold whitespace-nowrap ${cls}`}>{label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <h2 className="font-black text-slate-900 flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-violet-600" /> Proposals on my leads</h2>
                  {data.proposals.length === 0 ? <p className="text-xs text-slate-400">None yet.</p> : (
                    <ul className="space-y-1.5">
                      {data.proposals.map((p) => (
                        <li key={p.id}>
                          <Link to={`/sales/proposals/${p.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm">
                            <span className="truncate"><b className="font-mono text-xs">{p.proposal_code}</b> {p.lead_name}</span>
                            <span className={`px-2 py-0.5 h-fit rounded-full text-[10px] font-bold whitespace-nowrap ${PROPOSAL_STATUS[p.status]?.[1] || ''}`}>{PROPOSAL_STATUS[p.status]?.[0] || p.status}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </PageState>

      {modal?.type === 'lead' && (
        <LeadFormModal sources={sources} owners={owners} canAssign={canAssign} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setTab('sent'); load(); }} />
      )}
      {modal?.type === 'meeting' && (
        <MeetingFromDesk lead={modal.lead} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

/** Book a meeting from the desk: locked to one lead, or pick a client / open enquiry. */
function MeetingFromDesk({ lead, onClose, onSaved }) {
  const [lists, setLists] = useState(lead ? { leads: [], clients: [] } : null);
  useEffect(() => {
    if (lead) return;
    Promise.all([salesService.listLeads({}).catch(() => null), salesService.clients().catch(() => null)]).then(([l, c]) => setLists({
      leads: (l?.data.leads || []).filter((x) => !['Won', 'Lost'].includes(x.stage) && !x.converted_client_id),
      clients: c?.data.clients || []
    }));
  }, [lead]);
  if (!lists) return null;
  return <ScheduleMeetingModal leadId={lead?.id} kind="prospect" leads={lists.leads} clients={lists.clients} onClose={onClose} onSaved={onSaved} />;
}
