import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeIndianRupee, Search, Pencil } from 'lucide-react';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, inputCls } from '../project-flow/flowUi';
import { ClientGstModal } from './ClientGstModal';
import { inr0 } from './gstMath';

export function ClientGstPage() {
  const { hasPermission, isOwner } = usePermission();
  const canEdit = isOwner || hasPermission('clients.update');
  const [clients, setClients] = useState([]);
  const [states, setStates] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await financeService.getLookups();
      setClients(res.data.clients);
      setStates(res.data.states);
    } catch (err) {
      setError(errorMessage(err, 'Could not load clients'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const rows = clients.filter(
    (c) => (!q || `${c.company_name || ''} ${c.name} ${c.gstin || ''}`.toLowerCase().includes(q)) && (!onlyMissing || !c.state_code)
  );
  const missing = clients.filter((c) => !c.state_code).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><BadgeIndianRupee className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Client GST Profiles</h1>
          <p className="text-sm text-slate-500">GSTIN, state and payment terms used when billing each client.</p>
        </div>
      </div>

      {missing > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm font-semibold text-amber-800">
          {missing} client{missing === 1 ? '' : 's'} have no billing state yet; their invoices default to the agency's state.
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search client or GSTIN…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="text-xs font-semibold text-slate-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only missing state
        </label>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {rows.length === 0 ? (
          <Empty icon={BadgeIndianRupee} title="No clients match" />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">GSTIN</th><th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">PAN</th><th className="px-4 py-2.5">Terms</th><th className="px-4 py-2.5 text-right">Outstanding</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{c.company_name || c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.gstin || <span className="text-slate-400">Unregistered</span>}</td>
                    <td className="px-4 py-2.5">{c.state ? `${c.state} (${c.state_code})` : <span className="text-amber-600 font-semibold">Not set</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.pan || '—'}</td>
                    <td className="px-4 py-2.5">{c.payment_terms_days != null ? `${c.payment_terms_days} days` : <span className="text-slate-400">Default</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      {c.outstanding > 0 ? <Link to={`/finance/invoices?clientId=${c.id}`} className="font-bold text-red-600 hover:underline">{inr0(c.outstanding)}</Link> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <button onClick={() => setEditing(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" aria-label={`Edit GST profile of ${c.company_name || c.name}`}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageState>

      {editing && (
        <ClientGstModal
          client={editing}
          states={states}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
