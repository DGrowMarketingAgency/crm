import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Target, Plus, Search, LayoutGrid, Table2, PhoneCall, Handshake, FileText, CalendarClock, AlertCircle, Eye, UserPlus, Pencil,
  UserCheck, Trash2, Mail, Globe, Phone, MapPin, Megaphone, Users, Share2, Zap
} from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { StageBadge, STAGE_LABEL, SourceBadge, LeadFormModal, AssignLeadModal } from './salesUi';
import { inr0 } from '../finance/gstMath';

const PERIODS = [['today', 'Today'], ['week', 'Weekly'], ['month', 'Monthly'], ['all', 'All time'], ['custom', 'Custom range']];
const SOURCE_STYLE = {
  Website: [Globe, '#2563eb'], 'Phone Call': [Phone, '#16a34a'], 'Google My Business': [MapPin, '#d97706'], 'Paid Ads': [Megaphone, '#db2777'],
  'Marketing Person': [Users, '#7c3aed'], Referral: [Share2, '#ea580c'], Other: [Zap, '#64748b']
};
const todayIso = () => new Date().toLocaleDateString('en-CA');

/** Half-ring gauge for a source's won rate. */
function Gauge({ pct, color }) {
  const r = 26;
  const len = Math.PI * r;
  return (
    <svg viewBox="0 0 64 38" className="w-20 h-12" role="img" aria-label={`${pct}% won`}>
      <path d={`M6 32 A${r} ${r} 0 0 1 58 32`} fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
      {pct > 0 && (
        <path d={`M6 32 A${r} ${r} 0 0 1 58 32`} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(len * Math.min(pct, 100)) / 100} ${len}`} />
      )}
      <text x="32" y="30" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 11, fontWeight: 800 }}>{pct}%</text>
    </svg>
  );
}

function LeadCard({ l }) {
  const overdue = l.next_followup_date && String(l.next_followup_date).slice(0, 10) <= todayIso() && !['Won', 'Lost'].includes(l.stage);
  return (
    <Link to={`/sales/leads/${l.id}`} className="block bg-white rounded-xl border border-slate-200 p-3 hover:border-red-300 hover:shadow-sm transition-all">
      <div className="font-bold text-sm text-slate-900 truncate">{l.company_name || l.title}</div>
      <div className="text-[11px] text-slate-500 truncate">{[l.contact_name, l.source].filter(Boolean).join(' · ') || '—'}</div>
      {l.estimated_value ? <div className="text-xs font-bold text-slate-700 mt-1">{inr0(l.estimated_value)}</div> : null}
      <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-0.5" title="Calls"><PhoneCall className="w-3 h-3" />{l.calls}</span>
        <span className="inline-flex items-center gap-0.5" title="Negotiations"><Handshake className="w-3 h-3" />{l.negotiations}</span>
        <span className="inline-flex items-center gap-0.5" title="Proposals"><FileText className="w-3 h-3" />{l.proposals}</span>
        <span className="ml-auto truncate">{l.owner_name || 'Unassigned'}</span>
      </div>
      {l.next_followup_date && !['Won', 'Lost'].includes(l.stage) && (
        <div className={`mt-2 text-[11px] font-bold inline-flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
          <CalendarClock className="w-3 h-3" /> Follow up {fmtDate(l.next_followup_date)}
        </div>
      )}
    </Link>
  );
}

const iconBtn = 'p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40';

export function LeadsBoardPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner, roles } = usePermission();
  const can = (p) => isOwner || hasPermission(p);
  const slugs = (roles || []).map((r) => r.slug);
  const canAssign = isOwner || slugs.includes('owner') || slugs.includes('admin') || slugs.includes('account-manager');
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState({ from: `${todayIso().slice(0, 7)}-01`, to: todayIso() });
  const [view, setView] = useState(() => { try { return localStorage.getItem('leads.view') || 'table'; } catch { return 'table'; } });
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', source: params.get('source') || '', ownerId: params.get('ownerId') || '', repId: '', stage: '' });
  const [dash, setDash] = useState(null);
  const [data, setData] = useState(null);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null);

  const periodQuery = period === 'custom' ? { period, from: range.from, to: range.to } : { period };
  const load = useCallback(async () => {
    setError('');
    if (period === 'custom' && (!range.from || !range.to || range.from > range.to)) return;
    try {
      const q = Object.fromEntries(Object.entries({ ...filters, ...periodQuery }).filter(([, v]) => v));
      const [d, l] = await Promise.all([salesService.dashboard(periodQuery), salesService.listLeads(q)]);
      setDash(d.data);
      setData(l.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load enquiries'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, range.from, range.to, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { salesService.owners().then((r) => setOwners(r.data.owners)).catch(() => {}); }, []);
  const switchView = (v) => { setView(v); try { localStorage.setItem('leads.view', v); } catch { /* ignore */ } };
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const onboard = async (l) => {
    if (!window.confirm(`Onboard ${l.company_name || l.title} as a client? This creates the client record and marks the enquiry Won.`)) return;
    setMsg(null);
    try {
      const res = await salesService.onboardLead(l.id, {});
      setMsg({ ok: true, text: `${res.data.client_name} added to clients.`, link: `/client-projects/${res.data.client_id || res.data.lead?.lead?.converted_client_id}` });
      load();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };
  const remove = async (l) => {
    if (!window.confirm(`Delete the enquiry from ${l.company_name || l.title}? Its follow-ups and meetings are removed too. This cannot be undone.`)) return;
    setMsg(null);
    try {
      await salesService.deleteLead(l.id);
      setMsg({ ok: true, text: 'Enquiry deleted.' });
      load();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };

  const k = dash?.kpis;
  const rangeLabel = dash ? (period === 'all' ? 'All time' : `${fmtDate(dash.range.start)} – ${fmtDate(dash.range.end)}`) : '';
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><Target className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Enquiries & Lead Management</h1>
            <p className="text-sm text-slate-500">Track incoming leads, follow-ups, negotiations, proposals and onboarding.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-100" role="tablist" aria-label="Period">
            {PERIODS.map(([v, l]) => (
              <button key={v} role="tab" aria-selected={period === v} onClick={() => setPeriod(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === v ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {can('leads.create') && <button className={btnPrimary} onClick={() => setModal({ type: 'new' })}><Plus className="w-4 h-4" /> Add new enquiry</button>}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 bg-white p-3 rounded-2xl border border-slate-100 w-fit">
          <label className="block"><span className="text-xs font-bold text-slate-600">From</span>
            <input type="date" className={inputCls} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">To</span>
            <input type="date" className={inputCls} value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        </div>
      )}

      {msg && (
        <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
          {msg.text} {msg.link && <Link to={msg.link} className="underline">Open client</Link>}
        </div>
      )}

      {k && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[['Total enquiries', k.leads, 'Received in period', 'text-slate-900', 'border-l-red-500'],
            ['Converted & onboarded', k.won, 'Added to clients', 'text-emerald-600', 'border-l-emerald-500'],
            ['Conversion rate', `${k.conversionRate}%`, 'Enquiries won', 'text-blue-600', 'border-l-blue-500'],
            ['In discussion', k.negotiating, 'Proposal sent / negotiating', 'text-amber-600', 'border-l-amber-500'],
            ['Pipeline deal value', inr0(k.pipelineValue), 'Open estimated budget', 'text-violet-600', 'border-l-violet-500']].map(([l, v, sub, c, b]) => (
            <div key={l} className={`bg-white p-4 rounded-2xl border border-slate-100 border-l-4 ${b} shadow-sm`}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div>
              <div className={`text-2xl font-black mt-1 ${c}`}>{v}</div>
              <div className="text-[11px] text-slate-400">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {dash && (
        <div className="grid xl:grid-cols-[1fr_320px] gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm font-black text-slate-900">Lead sources & conversion</h2>
              <span className="text-[11px] text-slate-400">{rangeLabel} · click a source to filter</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {dash.bySource.map((s) => {
                const [Icon, color] = SOURCE_STYLE[s.source] || SOURCE_STYLE.Other;
                return (
                  <button key={s.source} onClick={() => setFilter('source', filters.source === s.source ? '' : s.source)} aria-pressed={filters.source === s.source}
                    className={`text-left rounded-xl border border-t-4 p-2.5 ${filters.source === s.source ? 'border-red-400 bg-red-50/40' : 'border-slate-100 hover:border-slate-300'}`}
                    style={{ borderTopColor: color }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 truncate"><Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />{s.source}</div>
                    <div className="flex justify-center"><Gauge pct={s.winRate} color={color} /></div>
                    <div className="flex justify-between text-[11px] text-slate-500"><span><b className="text-slate-800">{s.leads}</b> leads</span><span><b className="text-slate-800">{s.won}</b> won</span></div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-red-500" /> Follow-ups due</h2>
            {dash.followupsDue.length === 0 ? <p className="text-sm text-slate-400">Nothing due. Nice.</p> : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {dash.followupsDue.map((l) => (
                  <li key={l.id}><Link to={`/sales/leads/${l.id}`} className="flex justify-between gap-2 text-sm hover:text-red-600">
                    <span className="font-semibold truncate">{l.company_name || l.title}</span>
                    <span className="text-xs text-red-600 font-bold whitespace-nowrap">{fmtDate(l.next_followup_date)}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative w-full md:flex-1 md:min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search by name, company, mobile, email, referrer or service…" defaultValue={filters.search} aria-label="Search enquiries"
            onKeyDown={(e) => e.key === 'Enter' && setFilter('search', e.currentTarget.value.trim())}
            onBlur={(e) => setFilter('search', e.target.value.trim())} />
        </div>
        {owners.length > 0 && (
          <select aria-label="Marketer" className={`${inputCls} !w-auto`} value={filters.ownerId} onChange={(e) => setFilter('ownerId', e.target.value)}>
            <option value="">All marketers</option><option value="none">Unassigned</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        {owners.length > 0 && canAssign && (
          <select aria-label="REP" className={`${inputCls} !w-auto`} value={filters.repId} onChange={(e) => setFilter('repId', e.target.value)}>
            <option value="">All REPs</option><option value="none">Direct (no REP)</option>
            {owners.map((o) => <option key={o.id} value={o.id}>REP: {o.name}</option>)}
          </select>
        )}
        <select aria-label="Source" className={`${inputCls} !w-auto`} value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
          <option value="">All sources</option>
          {(data?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Status" className={`${inputCls} !w-auto`} value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)}>
          <option value="">All statuses</option>
          {(data?.stages || []).map((s) => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}
        </select>
        <div className="ml-auto flex gap-1">
          <button onClick={() => switchView('table')} className={`${btnSecondary} !px-3 ${view === 'table' ? '!border-red-300 !text-red-700' : ''}`} aria-label="Table view" aria-pressed={view === 'table'}><Table2 className="w-4 h-4" /></button>
          <button onClick={() => switchView('board')} className={`${btnSecondary} !px-3 ${view === 'board' ? '!border-red-300 !text-red-700' : ''}`} aria-label="Board view" aria-pressed={view === 'board'}><LayoutGrid className="w-4 h-4" /></button>
        </div>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data && data.leads.length === 0 ? (
          <Empty icon={Target} title="No enquiries here" text="Add an enquiry, or change the period or filters." />
        ) : data && view === 'board' ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.stages.map((st) => {
              const items = data.leads.filter((l) => l.stage === st);
              return (
                <div key={st} className="w-64 shrink-0 bg-slate-50 rounded-2xl p-2">
                  <div className="flex items-center justify-between px-1.5 py-1 mb-1">
                    <StageBadge stage={st} />
                    <span className="text-xs font-bold text-slate-500">{items.length} · {inr0(items.reduce((a, l) => a + Number(l.estimated_value || 0), 0))}</span>
                  </div>
                  <div className="space-y-2">{items.map((l) => <LeadCard key={l.id} l={l} />)}</div>
                </div>
              );
            })}
          </div>
        ) : data && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[1180px]">
              <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Contact person</th><th className="px-4 py-3">Business / company</th>
                <th className="px-4 py-3">Lead source</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3 text-right">Budget</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody>
                {data.leads.map((l) => {
                  const closed = ['Won', 'Lost'].includes(l.stage);
                  return (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}
                        {l.next_followup_date && !closed && <div className={`mt-1 font-bold ${String(l.next_followup_date).slice(0, 10) <= todayIso() ? 'text-red-600' : 'text-slate-500'}`}>Next {fmtDate(l.next_followup_date)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-red-700">{l.contact_name || '—'}</div>
                        {l.phone && <a href={`tel:${l.phone}`} className="block text-xs text-slate-500 hover:text-red-600">{l.phone}</a>}
                        {l.email && <a href={`mailto:${l.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><Mail className="w-3 h-3" />{l.email}</a>}
                      </td>
                      <td className="px-4 py-3"><Link to={`/sales/leads/${l.id}`} className="font-bold text-slate-900 hover:text-red-600">{l.company_name || l.title}</Link>
                        {l.services_interested && <div className="text-xs text-slate-500">{l.services_interested}</div>}</td>
                      <td className="px-4 py-3 max-w-[180px]"><SourceBadge source={l.source} referrer={l.referrer_name} /></td>
                      <td className="px-4 py-3">
                        {l.owner_name ? <span className="font-semibold text-slate-700">{l.owner_name}</span> : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">Unassigned</span>}
                        {canAssign && !closed && <button className="block text-xs font-bold text-blue-600 hover:underline mt-1" onClick={() => setModal({ type: 'assign', lead: l })}>{l.owner_name ? 'Reassign' : '+ Assign'}</button>}
                        {l.rep_name && <div className="text-[11px] font-bold text-violet-700 mt-1">REP: {l.rep_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{l.estimated_value ? inr0(l.estimated_value) : '—'}</td>
                      <td className="px-4 py-3"><StageBadge stage={l.stage} />
                        <div className="text-[11px] text-slate-400 mt-1 whitespace-nowrap">{l.calls} calls · {l.negotiations} neg.</div></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <Link to={`/sales/leads/${l.id}`} className={`${iconBtn} inline-flex items-center gap-1 !px-2.5 text-xs font-bold`}><Eye className="w-4 h-4" /> View</Link>
                          {canAssign && !closed && <button className={iconBtn} title="Assign marketer" aria-label="Assign marketer" onClick={() => setModal({ type: 'assign', lead: l })}><UserPlus className="w-4 h-4 text-blue-600" /></button>}
                          {can('leads.update') && <button className={iconBtn} title="Edit enquiry" aria-label="Edit enquiry" onClick={async () => setModal({ type: 'edit', lead: (await salesService.getLead(l.id)).data.lead })}><Pencil className="w-4 h-4" /></button>}
                          {can('proposals.create') && !closed && <button className={iconBtn} title="Create proposal" aria-label="Create proposal" onClick={() => navigate(`/sales/proposals/new?leadId=${l.id}`)}><FileText className="w-4 h-4 text-violet-600" /></button>}
                          {can('leads.convert') && !l.converted_client_id && l.stage !== 'Lost' && (
                            <button className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1" onClick={() => onboard(l)}><UserCheck className="w-4 h-4" /> Onboard</button>
                          )}
                          {can('leads.delete') && !l.converted_client_id && <button className={`${iconBtn} !border-red-200 hover:!bg-red-50`} title="Delete enquiry" aria-label="Delete enquiry" onClick={() => remove(l)}><Trash2 className="w-4 h-4 text-red-600" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageState>

      {modal?.type === 'new' && (
        <LeadFormModal sources={data?.sources || []} owners={owners} canAssign={canAssign} onClose={() => setModal(null)}
          onSaved={(d) => navigate(`/sales/leads/${d.lead.id}`)} />
      )}
      {modal?.type === 'edit' && (
        <LeadFormModal lead={modal.lead} sources={data?.sources || []} owners={owners} canAssign={canAssign} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setMsg({ ok: true, text: 'Enquiry updated.' }); load(); }} />
      )}
      {modal?.type === 'assign' && (
        <AssignLeadModal lead={modal.lead} owners={owners} onClose={() => setModal(null)}
          onSaved={(d) => { setModal(null); setMsg({ ok: true, text: `Assigned to ${d.lead.owner_name}.` }); load(); }} />
      )}
    </div>
  );
}

export { STAGE_LABEL };
