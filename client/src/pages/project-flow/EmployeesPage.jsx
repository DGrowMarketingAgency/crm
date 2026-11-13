import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Search, ArrowRight } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Initials, PageState, Empty, errorMessage, inputCls, humanize } from './flowUi';

export function EmployeesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyBusy, setOnlyBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getEmployees();
      // Non-managers only see themselves: go straight to their own desk.
      if (res.data.employees.length === 1 && Number(res.data.employees[0].id) === Number(user?.id)) {
        navigate(`/employee-tasks/${user.id}`, { replace: true });
        return;
      }
      setEmployees(res.data.employees);
    } catch (err) {
      setError(errorMessage(err, 'Could not load employees'));
    } finally {
      setLoading(false);
    }
  }, [navigate, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = employees.filter(
    (e) => (!q || `${e.name} ${e.email} ${e.department || ''}`.toLowerCase().includes(q)) && (!onlyBusy || e.active_projects > 0 || e.open_tasks > 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
          <ListChecks className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Employee Task Desk</h1>
          <p className="text-sm text-slate-500">Employees you can manage. Open one to see their projects and split work into tasks.</p>
        </div>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search name, email, department…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="text-xs font-semibold text-slate-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={onlyBusy} onChange={(e) => setOnlyBusy(e.target.checked)} /> Only people with work
        </label>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {filtered.length === 0 ? (
          <Empty icon={ListChecks} title="No employees match" />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_160px_110px_110px_110px_24px] gap-3 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <span>Employee</span>
              <span>Department</span>
              <span className="text-center">Projects</span>
              <span className="text-center">Active steps</span>
              <span className="text-center">Open tasks</span>
              <span />
            </div>
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/employee-tasks/${e.id}`)}
                className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1fr_160px_110px_110px_110px_24px] gap-3 items-center px-5 py-3 border-b border-slate-50 hover:bg-slate-50 text-left group"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Initials name={e.name} className="!w-9 !h-9 !text-xs" />
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 truncate">{e.name}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {e.email} · {humanize(e.role)}
                    </span>
                  </span>
                </span>
                <span className="hidden md:block text-sm text-slate-600 truncate">{e.department || '—'}</span>
                <span className="hidden md:block text-center font-black text-slate-900">{e.active_projects}</span>
                <span className="hidden md:block text-center font-black text-blue-600">{e.active_steps}</span>
                <span className="hidden md:block text-center font-black text-amber-600">{e.open_tasks}</span>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-red-500" />
              </button>
            ))}
          </div>
        )}
      </PageState>
    </div>
  );
}
