import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderKanban, ArrowRight } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { CategoryBadge, StatusBadge, Progress, Breadcrumbs, Initials, PageState, Empty, errorMessage, fmtDate } from './flowUi';

export function EmployeeDeskPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getEmployeeDesk(userId);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load task desk'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const projects = (data?.projects || []).filter((p) => (filter === 'open' ? !['completed', 'cancelled'].includes(p.status) : true));
  const emp = data?.employee;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Employee Task Desk', to: '/employee-tasks' }, { label: emp?.name || '…' }]} />
      <PageState loading={loading} error={error} onRetry={load}>
        {emp && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Initials name={emp.name} className="!w-12 !h-12 !text-sm" />
                <div>
                  <h1 className="text-2xl font-black text-slate-900">{emp.name}</h1>
                  <p className="text-sm text-slate-500">
                    {emp.department || 'No department'} · {data.projects.length} project{data.projects.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-100">
                {[
                  ['open', 'Open'],
                  ['all', 'All']
                ].map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === k ? 'bg-red-600 text-white' : 'text-slate-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {projects.length === 0 ? (
              <Empty icon={FolderKanban} title="No projects here" text="Projects appear when this person is a leader, owner or assigned to a step." />
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/employee-tasks/${userId}/projects/${p.id}`)}
                    className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-red-200 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CategoryBadge category={p.project_category} />
                          <StatusBadge status={p.status} />
                          <span className="text-[11px] font-bold text-slate-500">{p.role}</span>
                        </div>
                        <h3 className="font-black text-slate-900 mt-2 truncate">{p.name}</h3>
                        <p className="text-xs text-slate-500">
                          {p.client_company || p.client_name}
                          {p.due_date ? ` · Due ${fmtDate(p.due_date)}` : ''}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-red-500 shrink-0 mt-1" />
                    </div>
                    <Progress done={p.step_done} total={p.step_total} className="mt-4" />
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.my_steps.map((s) => (
                        <span
                          key={s.id}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${
                            s.status === 'in_progress'
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : s.status === 'completed'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 line-through'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          {s.step_order}. {s.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-3">
                      My tasks: {p.my_task_done}/{p.my_task_total} done{p.current_step ? ` · Project now at: ${p.current_step}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </PageState>
    </div>
  );
}
