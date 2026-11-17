import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Medal } from 'lucide-react';
import { salesService } from '../../services/api';
import { PageState, Empty, errorMessage, fmtDate } from '../project-flow/flowUi';
import { inr0 } from '../finance/gstMath';

const PERIODS = [['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['all', 'All time']];

export function MarketersPage() {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await salesService.marketers({ period })).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load marketers'));
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.marketers || [];
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><Medal className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Marketers</h1>
          <p className="text-sm text-slate-500">Field sales performance: enquiries, follow-ups, meetings and conversions.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-100">
          {PERIODS.map(([v, l]) => <button key={v} onClick={() => setPeriod(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === v ? 'bg-red-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
        </div>
        {data && period !== 'all' && <span className="text-xs text-slate-500">{fmtDate(data.range.start)} – {fmtDate(data.range.end)}</span>}
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {rows.length === 0 ? <Empty icon={Medal} title="No marketers yet" text="Give staff the Field Executive role, or assign them leads, to see them here." /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[860px]">
              <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2.5">Marketer</th><th className="px-4 py-2.5 text-right">New leads</th><th className="px-4 py-2.5 text-right">Follow-ups</th>
                <th className="px-4 py-2.5 text-right">Meetings held</th><th className="px-4 py-2.5 text-right">Won</th><th className="px-4 py-2.5 text-right">Conv. %</th>
                <th className="px-4 py-2.5 text-right">Won value</th><th className="px-4 py-2.5 text-right">Open pipeline</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5"><Link to={`/sales/leads?ownerId=${m.id}`} className="font-semibold text-slate-800 hover:text-red-600">{m.name}</Link><div className="text-[11px] text-slate-400">{m.open_leads} open leads</div></td>
                    <td className="px-4 py-2.5 text-right">{m.leads}</td>
                    <td className="px-4 py-2.5 text-right">{m.followups}</td>
                    <td className="px-4 py-2.5 text-right">{m.meetings}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{m.won}</td>
                    <td className="px-4 py-2.5 text-right">{m.conversion}%</td>
                    <td className="px-4 py-2.5 text-right">{inr0(m.won_value)}</td>
                    <td className="px-4 py-2.5 text-right">{inr0(m.pipeline_value)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot><tr className="font-bold border-t-2 border-slate-200">
                  <td className="px-4 py-2.5">Team</td><td className="px-4 py-2.5 text-right">{sum('leads')}</td><td className="px-4 py-2.5 text-right">{sum('followups')}</td>
                  <td className="px-4 py-2.5 text-right">{sum('meetings')}</td><td className="px-4 py-2.5 text-right">{sum('won')}</td>
                  <td className="px-4 py-2.5 text-right">{sum('leads') ? Math.round((sum('won') / sum('leads')) * 100) : 0}%</td>
                  <td className="px-4 py-2.5 text-right">{inr0(sum('won_value'))}</td><td className="px-4 py-2.5 text-right">{inr0(sum('pipeline_value'))}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </PageState>
    </div>
  );
}
