import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, CopyPlus, Lock, LockOpen, Pencil, FolderKanban, Users, User, ListChecks, Package, Receipt, PlayCircle, Repeat } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  CategoryBadge,
  StatusBadge,
  Progress,
  Breadcrumbs,
  PageState,
  Empty,
  errorMessage,
  fmtDate,
  inputCls,
  btnPrimary,
  btnSecondary,
  humanize,
  monthKey,
  PLAN_STATUS_BADGE
} from './flowUi';
import { AddMonthProjectsModal } from './AddMonthProjectsModal';

function Stat({ icon: Icon, label, value, sub, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </p>
      {value != null && <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>}
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  );
}

function MonthProjectCard({ p, onOpen }) {
  return (
    <button onClick={() => onOpen(p.id)} className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-red-200 transition-all w-full">
      <div className="flex items-center gap-2 flex-wrap">
        {p.project_category === 'regular' ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold border bg-blue-50 text-blue-700 border-blue-200">Monthly work</span>
        ) : (
          <CategoryBadge category={p.project_category} />
        )}
        {p.parent_project_id && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-50 text-slate-600 border-slate-200 inline-flex items-center gap-1" title="Created by a regular retainer">
            <Repeat className="w-3 h-3" /> Retainer
          </span>
        )}
        <StatusBadge status={p.status === 'planning' ? 'on_hold' : p.status} />
        <span className="text-[11px] font-mono text-slate-400">{p.project_code}</span>
      </div>
      <h3 className="font-black text-slate-900 mt-2 truncate">{p.name}</h3>
      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
        {p.assignment_mode === 'team' ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
        {p.team_leader_name || '—'}
        {p.service_name ? ` · ${p.service_name}` : ''}
        {p.pipeline_name && p.pipeline_name !== p.service_name ? ` · ${p.pipeline_name}` : ''}
      </p>
      {p.monthly_deliverables?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {p.monthly_deliverables.map((d) => (
            <span key={d.label} className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700">
              {d.qty} {d.label}
            </span>
          ))}
        </div>
      )}
      <Progress done={p.step_done} total={p.step_total} className="mt-4" />
      <p className="text-xs text-slate-500 mt-2">
        {p.current_step ? (
          <>
            Now: <span className="font-bold text-slate-800">{p.current_step}</span>
          </>
        ) : p.status === 'completed' ? (
          'All steps complete'
        ) : p.status === 'planning' ? (
          'Waiting for the month to be activated'
        ) : (
          'Not started'
        )}
        {p.due_date ? ` · Due ${fmtDate(p.due_date)}` : ''}
        {p.task_total ? ` · ${p.task_done}/${p.task_total} tasks` : ''}
      </p>
    </button>
  );
}

export function MonthPlanPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission, isOwner } = usePermission();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ notes: '', fee: '', invoiceType: 'INV', autoInvoice: false });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getMonthPlan(planId);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the month plan'));
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  const plan = data?.plan;
  const client = data?.client;
  const canManage = (isOwner || hasPermission('projects.create')) && Boolean(data?.can_manage);
  const closed = plan?.status === 'closed';
  const totals = data?.totals;
  const clientName = client ? client.company_name || client.name : '…';

  const act = async (fn, after) => {
    setBusy(true);
    setActionError('');
    try {
      const res = await fn();
      after ? after(res) : setData(res.data);
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status) => act(() => projectFlowService.updateMonthPlan(plan.id, { status }));
  const saveDetails = async (e) => {
    e.preventDefault();
    const ok = await act(() =>
      projectFlowService.updateMonthPlan(plan.id, {
        notes: form.notes.trim() || null,
        billingAmount: form.fee === '' ? null : Number(form.fee),
        invoiceType: form.invoiceType,
        autoInvoice: form.autoInvoice
      })
    );
    if (ok) setEditing(false);
  };
  const createInvoice = () =>
    act(
      () => projectFlowService.createMonthPlanInvoice(plan.id),
      (res) => {
        setData(res.data);
        setNotice(res.data.invoice_created ? `Draft invoice created for ${plan.label}.` : 'This month already has an invoice.');
      }
    );
  const nextKey = plan ? monthKey(1, new Date(Number(plan.plan_month.slice(0, 4)), Number(plan.plan_month.slice(5)) - 1, 1)) : '';
  const copyToNext = () =>
    act(
      () => projectFlowService.createMonthPlan({ clientId: client.id, month: nextKey, copyFromPlanId: plan.id }),
      (res) => {
        const skipped = res.data.skipped || [];
        navigate(`/month-plans/${res.data.plan.id}`, {
          state: { notice: `Copied ${res.data.copied} project${res.data.copied === 1 ? '' : 's'} from ${plan.label}.${skipped.length ? ` Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.` : ''}` }
        });
      }
    );

  useEffect(() => {
    // A notice belongs to the navigation that brought it; drop it when moving to another month.
    setNotice(location.state?.notice || '');
  }, [planId, location.state]);

  return (
    <PageState loading={loading && !data} error={error} onRetry={load}>
      {plan && (
        <div className="space-y-6">
          <Breadcrumbs items={[{ label: 'Client Projects', to: '/client-projects' }, { label: clientName, to: `/client-projects/${client.id}` }, { label: plan.label }]} />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                to={data.previous_plan ? `/month-plans/${data.previous_plan.id}` : '#'}
                aria-disabled={!data.previous_plan}
                onClick={(e) => !data.previous_plan && e.preventDefault()}
                className={`p-2 rounded-xl border border-slate-200 bg-white ${data.previous_plan ? 'hover:bg-slate-50' : 'opacity-30 cursor-default'}`}
                aria-label={data.previous_plan ? `Previous month: ${data.previous_plan.label}` : 'No earlier month'}
                title={data.previous_plan?.label}
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-slate-900">{plan.label}</h1>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${PLAN_STATUS_BADGE[plan.status]}`}>{humanize(plan.status)}</span>
                </div>
                <p className="text-sm text-slate-500">
                  {clientName} · {fmtDate(plan.start)} – {fmtDate(plan.end)}
                </p>
              </div>
              <Link
                to={data.next_plan ? `/month-plans/${data.next_plan.id}` : '#'}
                aria-disabled={!data.next_plan}
                onClick={(e) => !data.next_plan && e.preventDefault()}
                className={`p-2 rounded-xl border border-slate-200 bg-white ${data.next_plan ? 'hover:bg-slate-50' : 'opacity-30 cursor-default'}`}
                aria-label={data.next_plan ? `Next month: ${data.next_plan.label}` : 'No later month'}
                title={data.next_plan?.label}
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {!data.next_plan && data.projects.length > 0 && (
                  <button className={btnSecondary} disabled={busy} onClick={copyToNext}>
                    <CopyPlus className="w-4 h-4" /> Copy to next month
                  </button>
                )}
                {closed ? (
                  <button className={btnSecondary} disabled={busy} onClick={() => setStatus('active')}>
                    <LockOpen className="w-4 h-4" /> Reopen month
                  </button>
                ) : (
                  <button className={btnSecondary} disabled={busy} onClick={() => setStatus('closed')}>
                    <Lock className="w-4 h-4" /> Close month
                  </button>
                )}
                {!closed && (
                  <button className={btnPrimary} onClick={() => setAdding(true)}>
                    <Plus className="w-4 h-4" /> Add projects
                  </button>
                )}
              </div>
            )}
          </div>

          {notice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800 flex justify-between gap-3">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-emerald-700 hover:underline shrink-0">
                Dismiss
              </button>
            </div>
          )}
          {actionError && (
            <p className="text-sm font-semibold text-red-600" role="alert">
              {actionError}
            </p>
          )}

          {plan.status === 'draft' && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-amber-900">
                  Draft{plan.auto_drafted && data.previous_plan ? ` — copied automatically from ${data.previous_plan.label}` : ''}
                </p>
                <p className="text-xs text-amber-800">
                  Projects are on hold: no steps start and no tasks reach employees until you activate. Review the services, people and quotas first.
                </p>
              </div>
              {canManage && (
                <button className={`${btnPrimary} shrink-0`} disabled={busy} onClick={() => setStatus('active')}>
                  <PlayCircle className="w-4 h-4" /> Activate {plan.label}
                </button>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={FolderKanban} label="Projects" value={totals.projects} sub={`${totals.completed} completed`} />
            <Stat icon={ListChecks} label="Step progress">
              <Progress done={totals.step_done} total={totals.step_total} className="mt-3" />
              <p className="text-xs text-slate-500 mt-2">
                {totals.task_done}/{totals.task_total} tasks done
              </p>
            </Stat>
            <Stat icon={Package} label="Deliverables this month">
              {totals.deliverables.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">No quotas set</p>
              ) : (
                <div className="flex flex-wrap gap-1 mt-2">
                  {totals.deliverables.map((d) => (
                    <span key={d.label} className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-800">
                      {d.qty} {d.label}
                    </span>
                  ))}
                </div>
              )}
            </Stat>
            <Stat icon={Receipt} label="Billing & notes">
              {editing ? (
                <form onSubmit={saveDetails} className="space-y-2 mt-2">
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} placeholder="Monthly fee" aria-label="Monthly fee" />
                  <select className={inputCls} value={form.invoiceType} onChange={(e) => setForm((f) => ({ ...f, invoiceType: e.target.value }))} aria-label="Invoice type">
                    <option value="INV">INV — tax invoice</option>
                    <option value="INC">INC — GST client (B2B)</option>
                    <option value="IND">IND — non-GST</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" className="w-4 h-4 accent-red-600" checked={form.autoInvoice} onChange={(e) => setForm((f) => ({ ...f, autoInvoice: e.target.checked }))} />
                    Draft the invoice automatically when the month is active
                  </label>
                  <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" aria-label="Notes" />
                  <div className="flex gap-2">
                    <button type="submit" className={`${btnPrimary} !py-1.5 !px-3 !text-xs`} disabled={busy}>
                      Save
                    </button>
                    <button type="button" className={`${btnSecondary} !py-1.5 !px-3 !text-xs`} onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-lg font-black text-slate-900 mt-1">
                    {plan.billing_amount != null ? Number(plan.billing_amount).toLocaleString() : '—'}
                    {plan.billing_amount != null && <span className="text-[11px] font-bold text-slate-400 ml-1">{plan.invoice_type || 'INV'}</span>}
                  </p>
                  {plan.invoice ? (
                    <Link to={`/finance/invoices/${plan.invoice.id}`} className="block text-xs font-bold text-red-600 hover:underline break-all">
                      {plan.invoice.invoice_number} · {humanize(plan.invoice.status)} · {plan.invoice.total_amount.toLocaleString()}
                    </Link>
                  ) : (
                    <p className="text-[11px] text-slate-500">{plan.auto_invoice ? 'Invoice drafts automatically when active' : 'No invoice yet'}</p>
                  )}
                  <p className="text-xs text-slate-500 whitespace-pre-line line-clamp-2 mt-1">{plan.notes || 'No notes'}</p>
                  {canManage && (
                    <div className="flex flex-wrap gap-3 mt-1">
                      <button
                        onClick={() => {
                          setForm({ notes: plan.notes || '', fee: plan.billing_amount ?? '', invoiceType: plan.invoice_type || 'INV', autoInvoice: plan.auto_invoice });
                          setEditing(true);
                        }}
                        className="text-xs font-bold text-red-600 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {!plan.invoice && plan.status !== 'draft' && plan.billing_amount > 0 && (
                        <button onClick={createInvoice} disabled={busy} className="text-xs font-bold text-red-600 inline-flex items-center gap-1">
                          <Receipt className="w-3 h-3" /> Create draft invoice
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </Stat>
          </div>

          {data.projects.length === 0 ? (
            <Empty
              icon={FolderKanban}
              title={`Nothing planned for ${plan.label} yet`}
              text="Add one project per service you deliver this month, each with its own people and deliverables."
              action={
                canManage &&
                !closed && (
                  <button className={btnPrimary} onClick={() => setAdding(true)}>
                    <Plus className="w-4 h-4" /> Add projects
                  </button>
                )
              }
            />
          ) : (
            <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.projects.map((p) => (
                <MonthProjectCard key={p.id} p={p} onOpen={(id) => navigate(`/flow-projects/${id}`)} />
              ))}
            </div>
          )}

          {adding && (
            <AddMonthProjectsModal
              plan={plan}
              client={client}
              onClose={() => setAdding(false)}
              onAdded={(res) => {
                setAdding(false);
                setData(res);
                setNotice(`Added ${res.created_ids.length} project${res.created_ids.length === 1 ? '' : 's'} to ${plan.label}.`);
              }}
            />
          )}
        </div>
      )}
    </PageState>
  );
}
