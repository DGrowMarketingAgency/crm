import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, FolderKanban, Repeat, Users, User, CalendarClock, CalendarPlus, CalendarDays } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  CATEGORIES,
  CategoryBadge,
  StatusBadge,
  Progress,
  Breadcrumbs,
  PageState,
  Empty,
  errorMessage,
  fmtDate,
  btnPrimary,
  btnSecondary,
  humanize,
  monthKey,
  PLAN_STATUS_BADGE
} from './flowUi';
import { CreateFlowProjectModal } from './CreateFlowProjectModal';
import { CreateMonthPlanModal } from './CreateMonthPlanModal';

function MonthPlanCard({ plan, current, onOpen }) {
  return (
    <button
      onClick={() => onOpen(plan.id)}
      className={`shrink-0 w-56 text-left rounded-2xl border bg-white shadow-sm p-4 transition-all hover:border-red-200 ${current ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-100'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-slate-900">{plan.label}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PLAN_STATUS_BADGE[plan.status]}`}>{humanize(plan.status)}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {plan.project_count} project{plan.project_count === 1 ? '' : 's'}
        {plan.completed_count ? ` · ${plan.completed_count} done` : ''}
        {current ? ' · This month' : ''}
      </p>
      <Progress done={plan.step_done} total={plan.step_total} className="mt-3" />
    </button>
  );
}

const TABS = [['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])];

function ProjectCard({ p, onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-red-200 transition-all">
      <button onClick={() => onOpen(p.id)} className="text-left w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CategoryBadge category={p.project_category} />
              <StatusBadge status={p.status} />
              <span className="text-[11px] font-mono text-slate-400">{p.project_code}</span>
            </div>
            <h3 className="font-black text-slate-900 mt-2 truncate">{p.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              {p.assignment_mode === 'team' ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              {p.assignment_mode === 'team' ? 'Team' : 'Individual'} · {p.team_leader_name || '—'}
              {p.pipeline_name ? ` · ${p.pipeline_name}` : ''}
            </p>
          </div>
          {p.project_category === 'out_of_service' && p.billing_amount != null && (
            <div className="text-right shrink-0">
              <div className="text-sm font-black text-slate-900">{Number(p.billing_amount).toLocaleString()}</div>
              <div className="text-[11px] font-bold text-purple-600">{p.billing_status}</div>
            </div>
          )}
        </div>
        {p.project_category !== 'regular' && (
          <>
            <Progress done={p.step_done} total={p.step_total} className="mt-4" />
            <p className="text-xs text-slate-500 mt-2">
              {p.current_step ? (
                <>
                  Now: <span className="font-bold text-slate-800">{p.current_step}</span>
                </>
              ) : p.status === 'completed' ? (
                'All steps complete'
              ) : (
                'Not started'
              )}
              {p.due_date ? ` · Due ${fmtDate(p.due_date)}` : ''}
            </p>
          </>
        )}
      </button>
      {p.project_category === 'regular' && (
        <div className="mt-3">
          <p className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
            <Repeat className="w-3 h-3" /> Monthly cycles
            {p.monthly_deliverables?.length > 0 && (
              <span className="font-semibold text-slate-400"> · {p.monthly_deliverables.map((d) => `${d.qty} ${d.label}`).join(', ')}</span>
            )}
          </p>
          {p.cycles.length === 0 ? (
            <p className="text-xs text-slate-400">No cycles yet</p>
          ) : (
            <div className="space-y-1.5">
              {p.cycles.slice(0, 3).map((c) => (
                <button key={c.id} onClick={() => onOpen(c.id)} className="w-full flex items-center gap-3 rounded-xl bg-slate-50 hover:bg-slate-100 px-3 py-2 text-left">
                  <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 w-20 shrink-0">{c.cycle_month}</span>
                  <Progress done={c.step_done} total={c.step_total} className="flex-1" />
                  <StatusBadge status={c.status} />
                </button>
              ))}
              {p.cycles.length > 3 && <button onClick={() => onOpen(p.id)} className="text-[11px] font-bold text-red-600">+{p.cycles.length - 3} older cycles</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ClientProjectManagementPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const [data, setData] = useState(null);
  // Needs the permission AND the server's per-client answer (admin/PM, or this client's account manager).
  const canCreate = (isOwner || hasPermission('projects.create')) && Boolean(data?.can_create);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getClientProjects(clientId);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load client projects'));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const projects = data?.projects || [];
  const counts = Object.fromEntries(TABS.map(([k]) => [k, k === 'all' ? projects.length : projects.filter((p) => p.project_category === k).length]));
  const visible = tab === 'all' ? projects : projects.filter((p) => p.project_category === tab);
  const clientName = data?.client ? data.client.company_name || data.client.name : '…';
  const monthPlans = data?.month_plans || [];
  const thisMonth = monthKey(0);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Client Projects', to: '/client-projects' }, { label: clientName }]} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{clientName}</h1>
          <p className="text-sm text-slate-500">
            Project management
            {data?.client?.account_manager_name ? ` · Account manager: ${data.client.account_manager_name}` : ''}
          </p>
        </div>
        {canCreate && data?.client && (
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> One-off project
            </button>
            <button className={btnPrimary} onClick={() => setPlanning(true)}>
              <CalendarPlus className="w-4 h-4" /> Plan a month
            </button>
          </div>
        )}
      </div>

      {/* Month plans: what we deliver for this client each month, one project per service. */}
      {data && (
        <section className="space-y-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Monthly plans
          </h2>
          {monthPlans.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                No months planned yet. Pick a month, then add a project for every service you deliver that month.
              </p>
              {canCreate && (
                <button className={`${btnPrimary} shrink-0`} onClick={() => setPlanning(true)}>
                  <CalendarPlus className="w-4 h-4" /> Plan a month
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {monthPlans.map((p) => (
                <MonthPlanCard key={p.id} plan={p} current={p.plan_month === thisMonth} onOpen={(id) => navigate(`/month-plans/${id}`)} />
              ))}
            </div>
          )}
        </section>
      )}

      <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pt-2">
        <FolderKanban className="w-3.5 h-3.5" /> Retainers & one-off projects
      </h2>
      <div className="flex gap-1 overflow-x-auto bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${tab === key ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {label} <span className={`ml-1 text-xs ${tab === key ? 'text-red-100' : 'text-slate-400'}`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {visible.length === 0 ? (
          <Empty
            icon={FolderKanban}
            title={
              tab !== 'all'
                ? `No ${CATEGORIES[tab]?.label} projects`
                : monthPlans.length
                  ? 'No retainers or one-off projects'
                  : 'No projects for this client yet'
            }
            text={
              tab !== 'all'
                ? CATEGORIES[tab]?.hint
                : monthPlans.length
                  ? 'Monthly work lives in the month plans above. Use this for a one-off website, an urgent extra, or an old-style retainer.'
                  : 'Create a regular, one-time, urgent or out-of-service project.'
            }
            action={canCreate && <button className={btnSecondary} onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> One-off project</button>}
          />
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {visible.map((p) => (
              <ProjectCard key={p.id} p={p} onOpen={(id) => navigate(`/flow-projects/${id}`)} />
            ))}
          </div>
        )}
      </PageState>

      {planning && data?.client && (
        <CreateMonthPlanModal
          client={data.client}
          plans={monthPlans}
          onClose={() => setPlanning(false)}
          onCreated={(res) => {
            setPlanning(false);
            const skipped = res.skipped || [];
            navigate(`/month-plans/${res.plan.id}`, {
              state: res.copied
                ? { notice: `Copied ${res.copied} project${res.copied === 1 ? '' : 's'}.${skipped.length ? ` Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.` : ''}` }
                : undefined
            });
          }}
        />
      )}

      {creating && data?.client && (
        <CreateFlowProjectModal
          client={data.client}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            navigate(`/flow-projects/${project.id}`);
          }}
        />
      )}
    </div>
  );
}
