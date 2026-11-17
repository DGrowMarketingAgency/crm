import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus, Video, MapPin, Building2, Target } from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { ScheduleMeetingModal, MinutesModal, fmtDateTime, STAGE_LABEL } from './salesUi';

// Who the meeting is with: onboarded clients and prospects (enquiries not onboarded) are kept apart.
const KINDS = [
  ['client', 'Client meetings', 'Onboarded clients', Building2, 'emerald'],
  ['prospect', 'Prospect meetings', 'Enquiries not onboarded yet', Target, 'amber']
];
const TABS = [['', 'All'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const STATUS_TONE = { scheduled: 'bg-sky-50 text-sky-700', rescheduled: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500' };

export function MeetingsPage() {
  const { hasPermission, isOwner } = usePermission();
  const canEdit = isOwner || hasPermission('leads.update');
  const [kind, setKind] = useState(() => { try { return localStorage.getItem('meetings.kind') || 'client'; } catch { return 'client'; } });
  const [tab, setTab] = useState('upcoming');
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = { kind, ...(tab === 'upcoming' ? { scope: 'upcoming' } : tab ? { status: tab } : {}) };
      setData((await salesService.listMeetings(params)).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load meetings'));
    } finally {
      setLoading(false);
    }
  }, [kind, tab]);
  useEffect(() => { load(); }, [load]);
  const switchKind = (k) => { setKind(k); try { localStorage.setItem('meetings.kind', k); } catch { /* ignore */ } };

  const openSchedule = async () => {
    const [l, c] = await Promise.all([salesService.listLeads({}).catch(() => null), salesService.clients().catch(() => null)]);
    // Prospects only: onboarded (Won) and lost enquiries are not prospects any more.
    setLeads((l?.data.leads || []).filter((x) => !['Won', 'Lost'].includes(x.stage) && !x.converted_client_id));
    setClients(c?.data.clients || []);
    setModal('new');
  };

  const cancel = async (m) => {
    if (!window.confirm(`Cancel “${m.title}”?`)) return;
    try {
      await salesService.updateMeeting(m.id, { status: 'cancelled' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const c = data?.counts;
  const isClient = kind === 'client';
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><CalendarDays className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Meetings</h1>
            <p className="text-sm text-slate-500">Client meetings and prospect meetings are kept separate. Record minutes and decisions after each one.</p>
          </div>
        </div>
        {canEdit && <button className={btnPrimary} onClick={openSchedule}><Plus className="w-4 h-4" /> Schedule {isClient ? 'client' : 'prospect'} meeting</button>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3" role="tablist" aria-label="Meeting type">
        {KINDS.map(([k, label, sub, Icon, tone]) => {
          const on = kind === k;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => switchKind(k)}
              className={`text-left rounded-2xl border-2 p-4 flex items-center gap-3 transition-colors ${on ? (tone === 'emerald' ? 'border-emerald-500 bg-emerald-50' : 'border-amber-500 bg-amber-50') : 'border-slate-100 bg-white hover:border-slate-300'}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><Icon className="w-5 h-5" /></span>
              <span className="flex-1">
                <span className="block font-black text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{sub}</span>
              </span>
              <span className="text-2xl font-black text-slate-900">{data?.kinds?.[k] ?? '—'}</span>
            </button>
          );
        })}
      </div>

      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['Total', c.total], ['Upcoming', c.upcoming], ['Completed', c.completed], ['Cancelled', c.cancelled]].map(([l, v]) => (
            <div key={l} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div><div className="text-xl font-black mt-1">{v}</div></div>
          ))}
        </div>
      )}

      <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-100 w-fit" role="tablist" aria-label="Status">
        {TABS.map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === v ? 'bg-red-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data?.meetings.length === 0 ? (
          <Empty icon={CalendarDays} title={isClient ? 'No client meetings here' : 'No prospect meetings here'}
            text={isClient ? 'Meetings with onboarded clients show here.' : 'Meetings with enquiries that are not onboarded yet show here.'} />
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {data?.meetings.map((m) => (
              <div key={m.id} className={`bg-white rounded-2xl border border-slate-100 border-l-4 shadow-sm p-4 ${m.is_client ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{m.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {m.is_client ? (
                        <Link className="hover:text-red-600 font-semibold text-emerald-700" to={`/clients/${m.meeting_client_id}`}>
                          Client: {m.client_name}{!m.client_id && m.lead_id ? ' (onboarded from enquiry)' : ''}
                        </Link>
                      ) : (
                        <Link className="hover:text-red-600 font-semibold text-amber-700" to={`/sales/leads/${m.lead_id}`}>
                          Prospect: {m.lead_company || m.lead_title}{m.lead_stage ? ` · ${STAGE_LABEL[m.lead_stage] || m.lead_stage}` : ''}
                        </Link>
                      )}
                      {m.owner_name ? ` · ${m.owner_name}` : ''}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${STATUS_TONE[m.status]}`}>{m.status}</span>
                </div>
                <div className="text-sm text-slate-700 mt-2 flex items-center gap-2">
                  {m.mode === 'online' ? <Video className="w-4 h-4 text-slate-400" /> : <MapPin className="w-4 h-4 text-slate-400" />}
                  {fmtDateTime(m.starts_at)}{m.location ? ` · ${m.location}` : ''}
                </div>
                {m.agenda && <p className="text-xs text-slate-500 mt-1"><b>Agenda:</b> {m.agenda}</p>}
                {m.decisions && <p className="text-xs text-slate-700 mt-1"><b>Decisions:</b> {m.decisions}</p>}
                {canEdit && m.status !== 'cancelled' && (
                  <div className="flex gap-2 mt-3">
                    <button className={`${btnSecondary} !py-1.5 !text-xs`} onClick={() => setModal({ minutes: m })}>{m.status === 'completed' ? 'Edit minutes' : 'Minutes / mark done'}</button>
                    {m.status !== 'completed' && <button className={`${btnSecondary} !py-1.5 !text-xs !text-red-600`} onClick={() => cancel(m)}>Cancel meeting</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageState>

      {modal === 'new' && (
        <ScheduleMeetingModal kind={kind} leads={leads} clients={clients} onClose={() => setModal(null)}
          onSaved={(r) => { setModal(null); setTab('upcoming'); if (r?.kind && r.kind !== kind) switchKind(r.kind); else load(); }} />
      )}
      {modal?.minutes && <MinutesModal meeting={modal.minutes} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}
