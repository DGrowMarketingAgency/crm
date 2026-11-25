import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, Circle, CircleDot, ExternalLink, ListPlus, Timer } from 'lucide-react';
import { TaskTracker, formatDuration, liveSeconds, useTicker } from './TaskTracker';
import { projectFlowService, tasksService } from '../../services/api';
import { CategoryBadge, StatusBadge, Progress, Breadcrumbs, PageState, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from './flowUi';

const blankRow = (stepId = '') => ({ title: '', targetQty: '', dueDate: '', priority: 'medium', stepId });

function TaskSplitter({ steps, defaultStepId, onSubmit, busy }) {
  const [rows, setRows] = useState([blankRow(defaultStepId), blankRow(defaultStepId), blankRow(defaultStepId)]);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows((prev) => prev.map((r) => (r.title ? r : { ...r, stepId: defaultStepId })));
  }, [defaultStepId]);

  const update = (i, patch) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const tasks = rows
      .filter((r) => r.title.trim())
      .map((r) => ({
        title: r.title.trim(),
        stepId: r.stepId ? Number(r.stepId) : null,
        targetQty: r.targetQty ? Number(r.targetQty) : null,
        dueDate: r.dueDate || null,
        priority: r.priority
      }));
    if (tasks.length === 0) {
      setError('Write at least one task');
      return;
    }
    // Every task needs a person and a due date (Master Plan §5.4).
    const undated = rows.findIndex((r) => r.title.trim() && !r.dueDate);
    if (undated >= 0) {
      setError(`Task ${undated + 1}: pick a due date`);
      return;
    }
    const ok = await onSubmit(tasks);
    if (ok === true) setRows([blankRow(defaultStepId), blankRow(defaultStepId), blankRow(defaultStepId)]);
    else if (ok) setError(ok);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="font-black text-slate-900 flex items-center gap-2">
        <ListPlus className="w-4 h-4 text-red-600" /> Split work into tasks
      </h2>
      <p className="text-xs text-slate-500 mb-3">Each task needs a due date. Empty rows are ignored.</p>
      <div className="space-y-2">
        <div className="hidden md:grid grid-cols-[24px_1fr_180px_80px_140px_100px_32px] gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span />
          <span>Task</span>
          <span>Step</span>
          <span>Qty</span>
          <span>Due</span>
          <span>Priority</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_32px] md:grid-cols-[24px_1fr_180px_80px_140px_100px_32px] gap-2 items-center">
            <span className="text-xs font-black text-slate-400 text-center">{i + 1}</span>
            <input className={inputCls} value={r.title} onChange={(e) => update(i, { title: e.target.value })} placeholder={`Task ${i + 1}`} aria-label={`Task ${i + 1} title`} />
            <button type="button" onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg md:order-last" aria-label={`Remove task row ${i + 1}`}>
              <Trash2 className="w-4 h-4" />
            </button>
            {/* On small screens these wrap to a second line; from md they join the row's grid columns. */}
            <div className="col-span-3 pl-8 grid grid-cols-2 gap-2 md:contents">
              <select className={`${inputCls} col-span-2 md:col-span-1`} value={r.stepId} onChange={(e) => update(i, { stepId: e.target.value })} aria-label={`Task ${i + 1} step`}>
                <option value="">— General —</option>
                {steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.step_order}. {s.name}
                  </option>
                ))}
              </select>
              <input type="number" min="1" className={inputCls} value={r.targetQty} onChange={(e) => update(i, { targetQty: e.target.value })} placeholder="Qty" aria-label={`Task ${i + 1} quantity`} />
              <input type="date" className={inputCls} value={r.dueDate} onChange={(e) => update(i, { dueDate: e.target.value })} aria-label={`Task ${i + 1} due date`} />
              <select className={`${inputCls} hidden md:block`} value={r.priority} onChange={(e) => update(i, { priority: e.target.value })} aria-label={`Task ${i + 1} priority`}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mt-2" role="alert">{error}</p>}
      <div className="flex justify-between mt-3">
        <button type="button" className={btnSecondary} onClick={() => setRows((p) => [...p, blankRow(defaultStepId)])}>
          <Plus className="w-4 h-4" /> Add row
        </button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? 'Saving…' : 'Create tasks'}
        </button>
      </div>
    </form>
  );
}

export function EmployeeProjectTasksPage() {
  const { userId, projectId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncedAt, setSyncedAt] = useState(Date.now());

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await projectFlowService.getEmployeeProject(userId, projectId);
      setData(res.data);
      setSyncedAt(Date.now());
    } catch (err) {
      setError(errorMessage(err, 'Could not load project tasks'));
    } finally {
      setLoading(false);
    }
  }, [userId, projectId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Stopping the timer from the header widget (or the Time page) should refresh the clocks here.
  useEffect(() => {
    window.addEventListener('time-entry-created', load);
    return () => window.removeEventListener('time-entry-created', load);
  }, [load]);

  const createTasks = async (tasks) => {
    setBusy(true);
    try {
      const res = await projectFlowService.createEmployeeTasks(userId, projectId, tasks);
      setData(res.data);
      setSyncedAt(Date.now());
      return true;
    } catch (err) {
      return errorMessage(err, 'Could not create tasks');
    } finally {
      setBusy(false);
    }
  };

  // Follows the Tasks module workflow for staff: todo → in_progress → completed (reopen → in_progress, needs tasks.reopen).
  const nextStatus = (status) => (status === 'todo' ? 'in_progress' : status === 'completed' ? 'in_progress' : 'completed');

  const toggleTask = async (t) => {
    setRowError('');
    try {
      await tasksService.changeStatus(t.id, nextStatus(t.status));
      await load();
    } catch (err) {
      setRowError(errorMessage(err, 'Could not update task'));
    }
  };

  // Task clock: start / pause / complete. Reloads everything because starting may pause a timer elsewhere.
  const trackerAction = async (t, action) => {
    setRowError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await projectFlowService.trackTask(t.id, action);
      const r = res.data;
      window.dispatchEvent(new Event('timer:changed'));
      if (action === 'complete') {
        setNotice(`“${t.title}” completed — total time ${formatDuration(r.time?.total_seconds)} across ${r.time?.sessions || 0} session(s).`);
      } else if (r.paused_task_id) {
        setNotice('Your timer on another task was paused so this one could start.');
      }
      await load();
    } catch (err) {
      setRowError(errorMessage(err, 'Could not update the timer'));
    } finally {
      setBusy(false);
    }
  };

  const allTasks = data?.tasks || [];
  const anyRunning = allTasks.some((t) => t.time?.running) || Boolean(data?.active_timer);
  useTicker(anyRunning);
  const sumSeconds = (tasks) => tasks.reduce((acc, t) => acc + liveSeconds(t.time, syncedAt), 0);
  const runningElsewhere = data?.active_timer && !allTasks.some((t) => t.id === data.active_timer.task_id) ? data.active_timer : null;

  const emp = data?.employee;
  const project = data?.project;
  const steps = project?.steps || [];
  const mySteps = steps.filter((s) => s.is_mine);
  const activeMine = mySteps.find((s) => s.status === 'in_progress');
  const groups = [
    ...steps.map((s) => ({ key: s.id, step: s, tasks: (data?.tasks || []).filter((t) => t.project_step_id === s.id) })),
    { key: 'general', step: null, tasks: (data?.tasks || []).filter((t) => !t.project_step_id) }
  ].filter((g) => g.tasks.length > 0 || g.step?.is_mine);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Employee Task Desk', to: '/employee-tasks' },
          { label: emp?.name || '…', to: `/employee-tasks/${userId}` },
          { label: project?.name || '…' }
        ]}
      />
      <PageState loading={loading} error={error} onRetry={load}>
        {project && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CategoryBadge category={project.project_category} />
                  <StatusBadge status={project.status} />
                </div>
                <h1 className="text-xl font-black text-slate-900 mt-1">{project.name}</h1>
                <p className="text-sm text-slate-500">
                  {emp.name}'s tasks · {project.client_company || project.client_name}
                  {mySteps.length > 0 && ` · Assigned steps: ${mySteps.map((s) => s.step_order).join(', ')}`}
                </p>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Time on these tasks</div>
                  <div className={`font-mono text-lg font-black tabular-nums ${anyRunning ? 'text-blue-600' : 'text-slate-900'}`}>{formatDuration(sumSeconds(allTasks))}</div>
                </div>
                <Progress done={project.step_done} total={project.step_total} className="w-48" />
                <Link to={`/flow-projects/${project.id}`} className={btnSecondary}>
                  <ExternalLink className="w-4 h-4" /> Project
                </Link>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {steps.map((s) => (
                <span
                  key={s.id}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    s.status === 'in_progress'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : s.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white text-slate-500 border-slate-200'
                  } ${s.is_mine ? 'ring-2 ring-red-300 ring-offset-1' : ''}`}
                  title={s.is_mine ? 'Assigned to this employee' : ''}
                >
                  {s.step_order}. {s.name}
                </span>
              ))}
            </div>

            {data.can_add_tasks && (
              <TaskSplitter steps={steps} defaultStepId={activeMine ? String(activeMine.id) : mySteps[0] ? String(mySteps[0].id) : ''} onSubmit={createTasks} busy={busy} />
            )}

            {runningElsewhere && data.can_track && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm font-semibold text-blue-800 flex items-center gap-2">
                <Timer className="w-4 h-4 animate-pulse" />
                Your timer is running on “{runningElsewhere.task_title}” in another project ({formatDuration(runningElsewhere.elapsed_seconds + Math.floor((Date.now() - syncedAt) / 1000))}). Starting a task here will pause it.
              </div>
            )}

            {notice && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
                {notice}
              </div>
            )}

            {rowError && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                {rowError}
              </div>
            )}

            <div className="space-y-4">
              {groups.length === 0 && <p className="text-sm text-slate-500">No tasks yet for {emp.name} on this project.</p>}
              {groups.map((g) => {
                const done = g.tasks.filter((t) => t.status === 'completed').length;
                return (
                  <div key={g.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900">{g.step ? `Step ${g.step.step_order}: ${g.step.name}` : 'General tasks'}</h3>
                        {g.step && <StatusBadge status={g.step.status} />}
                      </div>
                      <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                        {done}/{g.tasks.length} done · <span className="font-mono tabular-nums">{formatDuration(sumSeconds(g.tasks))}</span>
                      </span>
                    </div>
                    {g.tasks.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-slate-400">No tasks split for this step yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-50">
                        {g.tasks.map((t) => (
                          <li key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 ${t.time?.running ? 'bg-blue-50/40' : ''}`}>
                            {(() => {
                              const icon =
                                t.status === 'completed' ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : t.status === 'todo' ? (
                                  <Circle className="w-5 h-5 text-slate-300" />
                                ) : (
                                  <CircleDot className="w-5 h-5 text-blue-500" />
                                );
                              // The employee drives status through the clock; managers viewing the desk keep the quick status toggle.
                              if (data.can_track) return <span className="shrink-0">{icon}</span>;
                              const label = t.status === 'todo' ? 'Start' : t.status === 'completed' ? 'Reopen' : 'Complete';
                              return (
                                <button onClick={() => toggleTask(t)} aria-label={`${label} ${t.title}`} title={`${label} task`} className="shrink-0">
                                  {icon}
                                </button>
                              );
                            })()}
                            <Link to={`/tasks/${t.id}`} className={`flex-1 min-w-[140px] truncate text-sm font-semibold hover:text-red-600 ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {t.title}
                            </Link>
                            {t.target_qty && <span className="text-xs font-bold text-slate-500">×{t.target_qty}</span>}
                            {t.due_date && <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap">{fmtDate(t.due_date)}</span>}
                            <StatusBadge status={t.status} />
                            <TaskTracker task={t} syncedAt={syncedAt} canTrack={data.can_track} busy={busy} onAction={trackerAction} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PageState>
    </div>
  );
}
