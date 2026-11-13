import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, ArrowRight } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { CATEGORIES, PageState, Empty, errorMessage, inputCls } from './flowUi';

export function ClientProjectsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getClients();
      setClients(res.data.clients);
    } catch (err) {
      setError(errorMessage(err, 'Could not load clients'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = clients.filter((c) => !q || `${c.company_name || ''} ${c.name} ${c.email}`.toLowerCase().includes(q));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Client Projects</h1>
          <p className="text-sm text-slate-500">All active clients. Open a client to manage their regular, one-time, urgent and out-of-service projects.</p>
        </div>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{filtered.length} active clients</span>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {filtered.length === 0 ? (
          <Empty icon={Building2} title="No active clients found" text="Clients with status Active appear here." />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/client-projects/${c.id}`)}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-red-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 truncate">{c.company_name || c.name}</h3>
                    <p className="text-xs text-slate-500 truncate">
                      {c.company_name ? c.name : c.email}
                      {c.account_manager_name ? ` · AM: ${c.account_manager_name}` : ''}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-red-500 shrink-0 mt-1" />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {Object.entries(CATEGORIES).map(([key, meta]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                      <span className="text-sm font-black text-slate-900">{c[`${key}_count`]}</span>
                    </span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-3">{c.open_count} open project{c.open_count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
        )}
      </PageState>
    </div>
  );
}
