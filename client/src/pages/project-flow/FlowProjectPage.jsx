import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Repeat, CalendarPlus, ListChecks, IndianRupee, GitBranch } from 'lucide-react';
import { projectFlowService, financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  CategoryBadge,
  StatusBadge,
  Progress,
  PeopleStack,
  Breadcrumbs,
  PageState,
  errorMessage,
  fmtDate,
  humanize,
  inputCls,
  btnPrimary,
  btnSecondary,
  monthLabel
} from './flowUi';
import { StepSection } from './StepBoard';

/** Where the project is: Audit ✓ → Strategy (now) → Execution → Reporting, plus the one thing to do next. */
function StageStepper({ steps, projectDone }) {
  const current = steps.find((s) => s.status === 'in_progress');
  const idx = current ? steps.indexOf(current) : -1;
  const next = idx >= 0 ? steps[idx + 1] : null;
  const left = current ? current.tasks.filter((t) => t.status !== 'completed').length : 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const done = s.status === 'completed';
          const now = s.status === 'in_progress';
          return (
            <li key={s.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className={`w-6 h-0.5 ${done || now ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                  now ? 'bg-blue-600 border-blue-600 text-white' : done ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 h-4 rounded-full border border-current text-[10px] leading-[14px] text-center">{i + 1}</span>}
                {s.name}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-slate-700 mt-3">
        {projectDone || !current ? (
          <span className="font-semibold text-emerald-700">All stages are complete.</span>
        ) : current.step_type === 'approval' ? (
          <>
            <span className="font-bold">Now: {current.name}</span> — waiting for approval before {next ? `“${next.name}”` : 'the project closes'}.
          </>
        ) : (
          <>
            <span className="font-bold">Now: {current.name}</span> — {left === 0 ? 'all tasks done' : `${left} task${left === 1 ? '' : 's'} left`}
            {next ? `. When they're done, “${next.name}” starts automatically.` : '. When they’re done, the project is complete.'}
          </>
        )}
      </p>
    </div>
  );
}

/** Monthly fee + automatic draft invoice for each new cycle of a regular retainer. */
function RetainerBillingCard({ project, canEdit, onSaved }) {
  const [f, setF] = useState({
    amount: project.billing_amount ?? '',
    invoiceType: project.retainer_invoice_type || 'INV',
    autoInvoice: Boolean(project.retainer_auto_invoice)
  });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await financeService.setRetainerBilling(project.id, { amount: f.amount === '' ? null : Number(f.amount), invoiceType: f.invoiceType, autoInvoice: f.autoInvoice });
      onSaved(res.data.project);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };
  const gst = f.invoiceType === 'IND' ? 0 : Math.round(Number(f.amount || 0) * 0.18);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="font-black text-slate-900 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-emerald-600" /> Monthly billing</h2>
      <p className="text-xs text-slate-500 mb-3">When on, each new monthly cycle gets a draft invoice dated the 1st, ready to review and issue.</p>
      <fieldset disabled={!canEdit} className="grid sm:grid-cols-[160px_220px_1fr_auto] gap-3 items-end">
        <label className="block"><span className="text-xs font-bold text-slate-600">Monthly fee ₹</span>
          <input type="number" min="0" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 15000" /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Invoice type</span>
          <select className={inputCls} value={f.invoiceType} onChange={(e) => setF({ ...f, invoiceType: e.target.value })}>
            <option value="INV">INV · GST invoice</option><option value="INC">INC · GST, registered client</option><option value="IND">IND · Non-GST</option>
          </select></label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 pb-2">
          <input type="checkbox" checked={f.autoInvoice} onChange={(e) => setF({ ...f, autoInvoice: e.target.checked })} /> Draft an invoice every month
        </label>
        {canEdit && <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
      </fieldset>
      {Number(f.amount) > 0 && <p className="text-xs text-slate-500 mt-2">Each month: ₹{Number(f.amount).toLocaleString('en-IN')} {f.invoiceType === 'IND' ? '(no GST)' : `+ ₹${gst.toLocaleString('en-IN')} GST = ₹${(Number(f.amount) + gst).toLocaleString('en-IN')}`}</p>}
      {!canEdit && <p className="text-xs text-slate-400 mt-2">Only admins or the client's account manager can change this.</p>}
      {msg && <p className={`text-sm font-semibold mt-2 ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}

export function FlowProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const { hasPermission, isOwner } = usePermission();
  const canBrowseClients = isOwner || hasPermission('projects.view');
  // The server decides who may manage/bill this project (admin, PM, team leader, client's account manager).
  const canManage = Boolean(project?.can_manage);
  const isAdmin = Boolean(project?.can_bill);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getProject(id);
      setProject(res.data.project);
    } catch (err) {
      setError(errorMessage(err, 'Could not load project'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (canManage && employees.length === 0) {
      projectFlowService.getEmployees().then((r) => setEmployees(r.data.employees)).catch(() => {});
    }
  }, [canManage, employees.length]);

  const act = async (fn) => {
    setBusy(true);
    setActionError('');
    try {
      const res = await fn();
      if (res?.data?.project) setProject(res.data.project);
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const isTemplate = project?.project_category === 'regular' && !project?.parent_project_id && !project?.month_plan_id;
  const nextMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  return (
    <PageState loading={loading && !project} error={error} onRetry={load}>
      {project && (
        <div className="space-y-6">
          <Breadcrumbs
            items={[
              // Executives without projects.view can't open the client pages, so show plain text instead of links.
              { label: 'Client Projects', to: canBrowseClients ? '/client-projects' : undefined },
              { label: project.client_company || project.client_name || 'Client', to: canBrowseClients && project.client_id ? `/client-projects/${project.client_id}` : undefined },
              ...(project.parent_project_id ? [{ label: 'Retainer', to: `/flow-projects/${project.parent_project_id}` }] : []),
              ...(project.month_plan_id
                ? [{ label: monthLabel(project.cycle_month), to: canBrowseClients ? `/month-plans/${project.month_plan_id}` : undefined }]
                : []),
              { label: project.name }
            ]}
          />

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CategoryBadge category={project.project_category} />
                  <StatusBadge status={project.status} />
                  <span className="text-xs font-mono text-slate-400">{project.project_code}</span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 mt-2">{project.name}</h1>
                <p className="text-sm text-slate-500 mt-1">
                  {project.assignment_mode === 'team' ? 'Leader' : 'Owner'}: <span className="font-semibold text-slate-700">{project.team_leader_name || '—'}</span>
                  {project.service_name ? ` · ${project.service_name}` : ''}
                  {project.pipeline_name && project.pipeline_name !== project.service_name ? ` · ${project.pipeline_name} flow` : ''}
                </p>
                {project.description && <p className="text-sm text-slate-600 mt-2 max-w-3xl">{project.description}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  {project.start_date ? `Start ${fmtDate(project.start_date)}` : ''}
                  {project.due_date ? ` · Due ${fmtDate(project.due_date)}` : ''}
                </p>
              </div>
              <div className="flex flex-col gap-2 lg:items-end shrink-0">
                {canManage && !isTemplate && (
                  <select
                    aria-label="Project status"
                    className={`${inputCls} !w-44`}
                    value={project.status}
                    disabled={busy}
                    onChange={(e) => act(() => projectFlowService.setProjectStatus(project.id, e.target.value))}
                  >
                    {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </select>
                )}
                {canManage && isTemplate && (
                  <select
                    aria-label="Retainer status"
                    className={`${inputCls} !w-44`}
                    value={project.status}
                    disabled={busy}
                    onChange={(e) => act(() => projectFlowService.setProjectStatus(project.id, e.target.value))}
                  >
                    <option value="active">Active (auto-renew)</option>
                    <option value="on_hold">Paused</option>
                    <option value="cancelled">Stopped</option>
                  </select>
                )}
                {!isTemplate && <Progress done={project.step_done} total={project.step_total} className="w-56" />}
              </div>
            </div>

            {project.project_category === 'out_of_service' && (
              <div className="mt-4 rounded-xl bg-purple-50 border border-purple-100 p-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-purple-800">Separate billing</span>
                <span className="text-sm font-black text-slate-900">{project.billing_amount != null ? Number(project.billing_amount).toLocaleString() : 'Amount not set'}</span>
                {isAdmin ? (
                  <select
                    aria-label="Billing status"
                    className={`${inputCls} !w-36 !py-1`}
                    value={project.billing_status || 'unbilled'}
                    disabled={busy}
                    onChange={(e) => act(() => projectFlowService.updateBilling(project.id, { billingStatus: e.target.value }))}
                  >
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                    <option value="paid">Paid</option>
                  </select>
                ) : (
                  <StatusBadge status={project.billing_status} />
                )}
              </div>
            )}
          </div>

          {actionError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
              {actionError}
            </div>
          )}

          {isTemplate && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-black text-slate-900 flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-blue-600" /> Monthly cycles
                  </h2>
                  <p className="text-xs text-slate-500">
                    A new cycle is created automatically at the start of every month while the retainer is active.
                    {project.monthly_deliverables?.length > 0 && ` Quota: ${project.monthly_deliverables.map((d) => `${d.qty} ${d.label}`).join(', ')}.`}
                  </p>
                </div>
                {canManage && (
                  <button className={btnSecondary} disabled={busy} onClick={() => act(() => projectFlowService.generateCycle(project.id, nextMonth))}>
                    <CalendarPlus className="w-4 h-4" /> Create {nextMonth} early
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {project.cycles.map((c) => (
                  <button key={c.id} onClick={() => navigate(`/flow-projects/${c.id}`)} className="w-full grid grid-cols-[90px_1fr_auto] items-center gap-3 rounded-xl bg-slate-50 hover:bg-slate-100 px-4 py-3 text-left">
                    <span className="text-sm font-black text-slate-800">{c.cycle_month}</span>
                    <div>
                      <Progress done={c.step_done} total={c.step_total} />
                      <p className="text-[11px] text-slate-500 mt-1">
                        {c.current_step ? `Now: ${c.current_step}` : c.status === 'completed' ? 'Complete' : '—'} · Tasks {c.task_done}/{c.task_total}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={c.status} />
                      {c.invoice_id && <span className="text-[11px] font-bold text-blue-700">Invoice {c.invoice_status === 'draft' ? 'drafted' : c.invoice_status?.replace('_', ' ')}</span>}
                    </div>
                  </button>
                ))}
                {project.cycles.length === 0 && <p className="text-sm text-slate-400">No cycles yet.</p>}
              </div>
            </div>
          )}

          {isTemplate && <RetainerBillingCard project={project} canEdit={isAdmin} onSaved={setProject} />}

          {!isTemplate && project.invoice_id && (
            <Link to={`/finance/invoices/${project.invoice_id}`} className="block rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100">
              {project.invoice_status === 'draft' ? 'A draft invoice is ready for this project — review and issue it →' : `Invoice for this project: ${project.invoice_status.replace('_', ' ')} →`}
            </Link>
          )}

          <div>
            {isTemplate ? (
              <div>
                <h2 className="font-black text-slate-900 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-red-600" /> Step template & assignments (copied into each month)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Changing people here affects future months; the current month's cycle keeps its own assignments.</p>
              </div>
            ) : (
              <StageStepper steps={project.steps} projectDone={project.status === 'completed'} />
            )}
            <ol className="mt-4">
              {project.steps.map((s, i) => (
                <StepSection
                  key={s.id}
                  step={s}
                  index={i}
                  steps={project.steps}
                  project={project}
                  isTemplate={isTemplate}
                  canManage={canManage}
                  employees={employees}
                  busy={busy}
                  act={act}
                />
              ))}
            </ol>
          </div>

          {project.unassigned_tasks.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-black text-slate-900 flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4" /> Project tasks (not tied to a step)
              </h2>
              <ul className="space-y-1.5">
                {project.unassigned_tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    {t.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                    <Link to={`/tasks/${t.id}`} className="font-semibold text-slate-700 hover:text-red-600">
                      {t.title}
                    </Link>
                    <span className="text-xs text-slate-400">· {t.assignee_name}</span>
                    {t.assignee_id && (
                      <Link to={`/employee-tasks/${t.assignee_id}/projects/${project.id}`} className="text-xs font-bold text-red-600 hover:underline ml-auto">
                        Split into tasks
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PageState>
  );
}
