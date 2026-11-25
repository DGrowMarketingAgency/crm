import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Loader2,
  ShieldCheck,
  Pencil,
  Undo2,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Wand2,
  ClipboardList,
  Lock,
  Send
} from 'lucide-react';
import { projectFlowService, deliverablesService } from '../../services/api';
import { PeopleStack, Initials, fmtDate, inputCls, btnPrimary, btnSecondary } from './flowUi';
import { PeoplePicker } from './PeoplePicker';

const PRIORITY = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  urgent: 'bg-red-50 text-red-700'
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function StepIcon({ status }) {
  if (status === 'completed') return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
  if (status === 'in_progress') return <Loader2 className="w-6 h-6 text-blue-500 animate-[spin_3s_linear_infinite]" />;
  return <Circle className="w-6 h-6 text-slate-300" />;
}

let seq = 0;
const newRow = (patch = {}) => ({ key: (seq += 1), title: '', assigneeId: '', dueDate: '', priority: 'medium', ...patch });

/** Break a step into tasks: one by one, "<name> 1…N" in one click, or a pasted list — each with a person and due date. */
function TaskComposer({ step, project, canManage, employees, busy, act, onDone }) {
  const defaultPerson = String(step.assignees[0]?.id || '');
  // Every task needs a due date: new rows start with the stage's due date (or the project's).
  const defaultDue = (step.due_ymd && step.due_ymd >= today() ? step.due_ymd : '') || (project.due_date ? String(project.due_date).slice(0, 10) : '');
  const newRowHere = (patch = {}) => newRow({ assigneeId: defaultPerson, dueDate: defaultDue, ...patch });
  const [rows, setRows] = useState(() => [newRowHere()]);
  const [badRow, setBadRow] = useState(null);
  // Starts from the step's own name ("Design" → Design 1, Design 2…); type anything else to change it.
  const [prefix, setPrefix] = useState(step.name);
  const [count, setCount] = useState(5);
  const [paste, setPaste] = useState(null);
  const [error, setError] = useState('');
  // People on this step first, then everyone else.
  const people = useMemo(() => {
    const onStep = new Set(step.assignees.map((a) => a.id));
    return [...employees].sort((a, b) => Number(onStep.has(b.id)) - Number(onStep.has(a.id)));
  }, [employees, step.assignees]);

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.title.trim());
  const keepFilled = (rs) => rs.filter((r) => r.title.trim());

  const generate = () => {
    const p = prefix.trim();
    const n = Math.min(Math.max(Number(count) || 0, 1), 50);
    if (!p) return setError('Type a name for the tasks — they are numbered 1, 2, 3…');
    // Continue numbering after tasks that already exist: if "<name> 1–4" exist, start at 5.
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)\\b`, 'i');
    const taken = [...step.tasks.map((t) => t.title), ...rows.map((r) => r.title)].map((t) => Number(re.exec(t)?.[1] || 0));
    const start = Math.max(0, ...taken) + 1;
    setError('');
    setRows((rs) => [...keepFilled(rs), ...Array.from({ length: n }, (_, i) => newRowHere({ title: `${p} ${start + i}` }))]);
  };

  const applyPaste = () => {
    const lines = (paste || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length) setRows((rs) => [...keepFilled(rs), ...lines.map((title) => newRowHere({ title: title.slice(0, 255) }))]);
    setPaste(null);
  };

  const setAll = (patch) => setRows((rs) => rs.map((r) => ({ ...r, ...patch })));

  const save = async () => {
    setError('');
    setBadRow(null);
    if (!filled.length) return setError('Give at least one task a title');
    const undated = rows.findIndex((r) => r.title.trim() && !r.dueDate);
    if (undated >= 0) {
      setBadRow(rows[undated].key);
      return setError(`Task ${undated + 1}: every task needs a due date`);
    }
    const ok = await act(() =>
      projectFlowService.addStepTasks(
        project.id,
        step.id,
        filled.map((r) => ({
          title: r.title.trim(),
          assigneeId: canManage && r.assigneeId ? Number(r.assigneeId) : undefined,
          dueDate: r.dueDate,
          priority: r.priority
        }))
      )
    );
    if (ok) onDone();
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <Wand2 className="w-3.5 h-3.5 text-red-600" /> Quick fill
        </div>
        <input className={`${inputCls} !w-36 !py-1.5`} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Task name" aria-label="Task name" />
        <span className="text-xs font-bold text-slate-400">×</span>
        <input type="number" min="1" max="50" className={`${inputCls} !w-20 !py-1.5`} value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many" />
        <button type="button" className={`${btnSecondary} !py-1.5 !px-3 !text-xs`} onClick={generate}>
          Add {prefix.trim() || 'tasks'} 1–{Math.min(Math.max(Number(count) || 0, 1), 50)}
        </button>
        <button type="button" className="text-xs font-bold text-slate-500 hover:text-red-600 inline-flex items-center gap-1 ml-auto" onClick={() => setPaste(paste === null ? '' : null)}>
          <ClipboardList className="w-3.5 h-3.5" /> Paste a list
        </button>
      </div>

      {paste !== null && (
        <div className="space-y-2">
          <textarea className={inputCls} rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'One task per line'} aria-label="Paste tasks, one per line" />
          <button type="button" className={`${btnSecondary} !py-1.5 !px-3 !text-xs`} onClick={applyPaste}>
            Add these lines
          </button>
        </div>
      )}

      {rows.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-500">Set for all:</span>
          {canManage && (
            <select className={`${inputCls} !w-44 !py-1 !text-xs`} value="" onChange={(e) => e.target.value && setAll({ assigneeId: e.target.value })} aria-label="Assign all tasks to">
              <option value="">Assign all to…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input type="date" className={`${inputCls} !w-40 !py-1 !text-xs`} onChange={(e) => setAll({ dueDate: e.target.value })} aria-label="Due date for all tasks" />
          <select className={`${inputCls} !w-32 !py-1 !text-xs`} value="" onChange={(e) => e.target.value && setAll({ priority: e.target.value })} aria-label="Priority for all tasks">
            <option value="">Priority…</option>
            {Object.keys(PRIORITY).map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap lg:flex-nowrap gap-2 items-center">
            <span className="w-5 text-[11px] font-bold text-slate-400 text-right shrink-0">{i + 1}</span>
            <input
              className={`${inputCls} !py-1.5 !w-auto flex-1 min-w-[220px]`}
              value={r.title}
              onChange={(e) => set(r.key, { title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i === rows.length - 1) setRows((rs) => [...rs, newRow({ assigneeId: r.assigneeId, dueDate: r.dueDate, priority: r.priority })]);
                }
              }}
              placeholder="Task title"
              maxLength={255}
              aria-label={`Task ${i + 1} title`}
              autoFocus={i === 0 && rows.length === 1}
            />
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center pl-7 lg:pl-0">
              {canManage ? (
                <select className={`${inputCls} !py-1.5 !text-xs !w-44`} value={r.assigneeId} onChange={(e) => set(r.key, { assigneeId: e.target.value })} aria-label={`Person for task ${i + 1}`}>
                  <option value="">Step owner</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-semibold text-slate-500 px-2 w-44">Me</span>
              )}
              <input
                type="date"
                required
                className={`${inputCls} !py-1.5 !text-xs !w-36 ${badRow === r.key ? '!border-red-500 ring-2 ring-red-500/20' : ''}`}
                value={r.dueDate}
                min={today()}
                onChange={(e) => {
                  set(r.key, { dueDate: e.target.value });
                  if (badRow === r.key) setBadRow(null);
                }}
                aria-label={`Due date for task ${i + 1}`}
              />
              <select className={`${inputCls} !py-1.5 !text-xs !w-28`} value={r.priority} onChange={(e) => set(r.key, { priority: e.target.value })} aria-label={`Priority for task ${i + 1}`}>
                {Object.keys(PRIORITY).map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRowHere()]))} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0" aria-label={`Remove task ${i + 1}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-xs font-bold text-slate-600 hover:text-red-600 inline-flex items-center gap-1" onClick={() => setRows((rs) => [...rs, newRowHere()])}>
          <Plus className="w-3.5 h-3.5" /> Another task
        </button>
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} !py-1.5 !px-3 !text-xs`} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className={`${btnPrimary} !py-1.5 !px-3 !text-xs`} disabled={busy || !filled.length} onClick={save}>
            {busy ? 'Saving…' : `Add ${filled.length || ''} task${filled.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
      {error && <p className="text-xs font-semibold text-red-600" role="alert">{error}</p>}
    </div>
  );
}

/** One plain-word state per task, in the order the work actually moves (Master Plan §11 columns). */
function taskState(t) {
  if (t.status === 'completed') return { key: 'done', text: t.is_client_deliverable ? 'Approved by client' : 'Done', cls: 'bg-emerald-50 text-emerald-700' };
  if (t.column_status === 'revision') return { key: 'revision', text: 'Needs changes', cls: 'bg-orange-50 text-orange-700' };
  if (t.internal_review_status === 'pending') return { key: 'team', text: 'In team review', cls: 'bg-purple-50 text-purple-700' };
  if (t.client_approval_status === 'pending') return { key: 'client', text: 'With client', cls: 'bg-purple-50 text-purple-700' };
  if (t.status === 'in_progress') return { key: 'doing', text: 'Doing', cls: 'bg-blue-50 text-blue-700' };
  if (t.status === 'blocked') return { key: 'blocked', text: 'Blocked', cls: 'bg-red-50 text-red-700' };
  return { key: 'todo', text: 'To do', cls: 'bg-slate-100 text-slate-600' };
}

/** "Due today" / "Due in 3 days" / "2 days late" — easier to read than a bare date. */
function dueText(ymd, done) {
  if (!ymd) return { text: 'No due date', cls: 'text-slate-400' };
  const days = Math.round((Date.parse(`${ymd}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86400000);
  if (done) return { text: `Due ${fmtDate(ymd)}`, cls: 'text-slate-400' };
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} late`, cls: 'text-red-600 font-bold' };
  if (days === 0) return { text: 'Due today', cls: 'text-amber-700 font-bold' };
  if (days === 1) return { text: 'Due tomorrow', cls: 'text-amber-700 font-semibold' };
  if (days <= 7) return { text: `Due in ${days} days`, cls: 'text-slate-600' };
  return { text: `Due ${fmtDate(ymd)}`, cls: 'text-slate-500' };
}

/** Submit a client deliverable: a link to the work + a note. The team reviews it, then the client approves. */
function SubmitForReview({ task, project, busy, act, onDone }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const send = async () => {
    const form = new FormData();
    form.append('title', task.title);
    if (url.trim()) form.append('deliverableUrl', url.trim());
    if (note.trim()) form.append('submissionNotes', note.trim());
    const ok = await act(async () => {
      await deliverablesService.submitReview(task.id, form);
      return projectFlowService.getProject(project.id);
    });
    if (ok) onDone();
  };
  return (
    <div className="mt-2 rounded-lg bg-purple-50/60 border border-purple-100 p-2.5 flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-purple-900 w-full">Send “{task.title}” for review — your team checks it first, then the client approves.</span>
      <input className={`${inputCls} !py-1.5 !text-xs !w-72`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the work (Drive, Figma, video…)" aria-label={`Link for ${task.title}`} />
      <input className={`${inputCls} !py-1.5 !text-xs !w-60`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the reviewer (optional)" aria-label={`Note for ${task.title}`} />
      <button type="button" className={`${btnPrimary} !py-1.5 !px-3 !text-xs`} disabled={busy} onClick={send}>
        <Send className="w-3 h-3" /> Send now
      </button>
      <button type="button" className={`${btnSecondary} !py-1.5 !px-3 !text-xs`} onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

const actionBtn = 'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50';

/**
 * One task = one row: what it is, who, when, where it stands — and the single next thing to do.
 * Start (your own clock) → Mark done; client work: Send for review → team Approve → client approves.
 */
function TaskRow({ t, project, busy, act, onSubmit, formOpen }) {
  const state = taskState(t);
  const done = state.key === 'done';
  const due = dueText(t.due_date, done);
  const reload = () => projectFlowService.getProject(project.id);
  const review = (decision) =>
    act(async () => {
      let feedback = null;
      if (decision === 'changes_requested') {
        feedback = window.prompt(`What should change in "${t.title}"?`) || '';
        if (!feedback.trim()) throw new Error('Write what needs to change');
      }
      await deliverablesService.reviewInternal(t.current_submission_id, { decision, feedback });
      return reload();
    });
  const track = (action) =>
    act(async () => {
      await projectFlowService.trackTask(t.id, action);
      return reload();
    });

  // The one next action for this person on this task.
  let action = null;
  if (t.can_review) {
    action = (
      <div className="flex gap-1.5">
        <button type="button" disabled={busy} onClick={() => review('approved')} className={`${actionBtn} bg-emerald-600 text-white hover:bg-emerald-700`} title="Approve and send it to the client">
          <Check className="w-3.5 h-3.5" /> Approve
        </button>
        <button type="button" disabled={busy} onClick={() => review('changes_requested')} className={`${actionBtn} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`}>
          Ask for changes
        </button>
      </div>
    );
  } else if (formOpen) {
    action = null; // the send form below this row is the action
  } else if (t.can_submit && (t.status === 'in_progress' || t.column_status === 'revision' || !t.is_mine)) {
    action = (
      <button type="button" disabled={busy} onClick={onSubmit} className={`${actionBtn} bg-purple-600 text-white hover:bg-purple-700`}>
        <Send className="w-3.5 h-3.5" /> {t.column_status === 'revision' ? 'Fix & resend' : 'Send for review'}
      </button>
    );
  } else if (t.can_start) {
    action = (
      <button type="button" disabled={busy} onClick={() => track('start')} className={`${actionBtn} bg-blue-600 text-white hover:bg-blue-700`} title="Starts your timer on this task">
        Start
      </button>
    );
  } else if (!done && t.can_toggle) {
    action = (
      <button
        type="button"
        disabled={busy}
        onClick={() => (t.is_mine && t.status === 'in_progress' ? track('complete') : act(() => projectFlowService.setTaskDone(project.id, t.id, true)))}
        className={`${actionBtn} bg-emerald-600 text-white hover:bg-emerald-700`}
      >
        <Check className="w-3.5 h-3.5" /> Mark done
      </button>
    );
  } else if (state.key === 'client') {
    action = <span className="text-[11px] font-semibold text-slate-400">Waiting for the client</span>;
  } else if (state.key === 'team') {
    action = <span className="text-[11px] font-semibold text-slate-400">Waiting for team review</span>;
  } else if (done && t.can_toggle && !t.is_client_deliverable) {
    action = (
      <button type="button" disabled={busy} onClick={() => act(() => projectFlowService.setTaskDone(project.id, t.id, false))} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 hover:underline">
        Undo
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 shrink-0">
        {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : state.key === 'doing' ? <Loader2 className="w-5 h-5 text-blue-500" /> : <Circle className="w-5 h-5 text-slate-300" />}
      </span>
      <div className="flex-1 min-w-0">
        <Link to={`/tasks/${t.id}`} title={t.task_code} className={`text-sm font-semibold leading-snug hover:text-red-600 ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {t.title}
          {t.target_qty ? <span className="text-slate-400 font-normal"> ×{t.target_qty}</span> : null}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${state.cls}`}>{state.text}</span>
          {t.is_client_deliverable && !done && <span className="text-[11px] font-semibold text-purple-700">Needs client approval</span>}
          {t.revision_count > 0 && <span className="text-[11px] text-orange-700">{t.revision_count} revision{t.revision_count === 1 ? '' : 's'}</span>}
          <span className="inline-flex items-center gap-1 text-slate-600">
            <Initials name={t.assignee_name} className="!w-5 !h-5 !text-[9px] !border-0" />
            {t.is_mine ? 'You' : t.assignee_name || 'Unassigned'}
          </span>
          <span className={due.cls}>{due.text}</span>
          {['high', 'urgent'].includes(t.priority) && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${PRIORITY[t.priority]}`}>{t.priority}</span>}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">{action}</div>
    </div>
  );
}

function TaskTable({ tasks, project, busy, act, locked }) {
  const [submitting, setSubmitting] = useState(null);
  if (!tasks.length) return null;
  // Open work first, finished work last.
  const ordered = [...tasks].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  return (
    <div className={`mt-3 rounded-xl border border-slate-100 divide-y divide-slate-100 bg-white ${locked ? 'opacity-60' : ''}`}>
      {ordered.map((t) => (
        <div key={t.id}>
          <TaskRow t={t} project={project} busy={busy} act={act} onSubmit={() => setSubmitting(t.id)} formOpen={submitting === t.id} />
          {submitting === t.id && (
            <div className="px-3 pb-3">
              <SubmitForReview task={t} project={project} busy={busy} act={act} onDone={() => setSubmitting(null)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** One pipeline step as a section: owner(s), progress, approvals and its own task list. */
export function StepSection({ step, index, steps, project, isTemplate, canManage, employees, busy, act }) {
  const approval = step.step_type === 'approval';
  const done = step.status === 'completed';
  // Stage-by-stage: the open stage is expanded; finished and upcoming stages start collapsed.
  const [open, setOpen] = useState(isTemplate || step.status === 'in_progress');
  // When the flow moves on, follow it: the new current stage opens, the finished one folds away.
  useEffect(() => {
    if (!isTemplate) setOpen(step.status === 'in_progress');
  }, [step.status, isTemplate]);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [people, setPeople] = useState(step.assignees.map((a) => a.id));
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const taskDone = step.tasks.filter((t) => t.status === 'completed').length;
  const openTasks = step.tasks.length - taskDone;
  const pct = step.tasks.length ? Math.round((taskDone / step.tasks.length) * 100) : 0;
  const approvalActive = approval && step.status === 'in_progress' && !isTemplate;
  const locked = !isTemplate && step.status === 'pending';
  const waitingFor = locked ? steps.slice(0, index).filter((s) => s.status !== 'completed').pop() : null;
  const canWork = !isTemplate && !done;

  return (
    <li className="relative pl-10">
      {index < steps.length - 1 && <span className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-slate-200" aria-hidden />}
      <span className="absolute left-0 top-3">
        <StepIcon status={isTemplate ? 'pending' : step.status} />
      </span>
      <section
        className={`rounded-2xl border mb-3 ${
          step.status === 'in_progress' && !isTemplate ? 'border-blue-200 bg-white shadow-sm' : approval ? 'border-amber-100 bg-amber-50/20' : done ? 'border-slate-100 bg-slate-50/50' : 'border-slate-100 bg-white'
        }`}
      >
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-start gap-2 text-left min-w-0" aria-expanded={open}>
            {open ? <ChevronDown className="w-4 h-4 mt-1 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-1 text-slate-400 shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400">
                  Stage {index + 1} of {steps.length}
                </span>
                {approval && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                    <ShieldCheck className="w-3.5 h-3.5" /> Approval
                  </span>
                )}
                {!isTemplate && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      done ? 'bg-emerald-50 text-emerald-700' : step.status === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {done ? 'Done' : step.status === 'in_progress' ? 'Now' : 'Locked'}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 mt-0.5">{step.name}</h3>
              {!isTemplate && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {done
                    ? `${step.tasks.length} task${step.tasks.length === 1 ? '' : 's'} · finished ${fmtDate(step.completed_at)}`
                    : locked
                      ? `Starts after “${waitingFor?.name || 'the previous stage'}”`
                      : `${taskDone} of ${step.tasks.length} task${step.tasks.length === 1 ? '' : 's'} done${step.due_ymd ? ` · stage due ${fmtDate(step.due_ymd)}` : ''}`}
                </p>
              )}
              {step.notes && <p className="text-xs font-semibold text-amber-700 mt-1">{step.notes}</p>}
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-3 md:justify-end shrink-0 pl-6 md:pl-0">
            {step.status === 'in_progress' && !isTemplate && step.tasks.length > 0 && (
              <div className="w-36" title={`${taskDone} of ${step.tasks.length} done — the stage finishes itself when all are done`}>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            {!approval && canWork && step.can_complete && (
              <button
                className={`${btnSecondary} !py-1.5 !px-3 !text-xs`}
                disabled={busy}
                title="Close this stage now and move to the next one"
                onClick={() => {
                  if (openTasks > 0 && !window.confirm(`${openTasks} task(s) in "${step.name}" are still open. Finish the stage anyway?`)) return;
                  act(() => projectFlowService.completeStep(project.id, step.id));
                }}
              >
                <Check className="w-3.5 h-3.5" /> Finish stage
              </button>
            )}
            {approvalActive && canManage && (
              <>
                {Boolean(step.needs_admin_approval) && !step.admin_approved_at && (
                  <button className={`${btnPrimary} !py-2`} disabled={busy} onClick={() => act(() => projectFlowService.approveStep(project.id, step.id, 'admin'))}>
                    <ShieldCheck className="w-4 h-4" /> Admin approve
                  </button>
                )}
                {Boolean(step.needs_client_approval) && !step.client_approved_at && (
                  <button className={`${btnPrimary} !py-2`} disabled={busy} onClick={() => act(() => projectFlowService.approveStep(project.id, step.id, 'client'))}>
                    <ShieldCheck className="w-4 h-4" /> Client approved
                  </button>
                )}
                <button className={`${btnSecondary} !py-2`} disabled={busy} onClick={() => setRejecting((v) => !v)}>
                  <Undo2 className="w-4 h-4" /> Request changes
                </button>
              </>
            )}
          </div>
        </header>

        {open && (
          <div className="px-4 pb-4 -mt-1">
            {locked && (
              <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-2">
                <Lock className="w-3 h-3" /> Its tasks appear automatically when this stage starts.
              </p>
            )}

            {rejecting && approvalActive && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-white p-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">What needs to change? The work goes back to the previous work step.</span>
                  <textarea className={`${inputCls} mt-1`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what needs to change" />
                </label>
                <div className="flex justify-end gap-2 mt-2">
                  <button className={btnSecondary} onClick={() => setRejecting(false)}>
                    Cancel
                  </button>
                  <button
                    className={btnPrimary}
                    disabled={busy}
                    onClick={async () => {
                      if (await act(() => projectFlowService.requestChanges(project.id, step.id, note.trim() || null))) {
                        setRejecting(false);
                        setNote('');
                      }
                    }}
                  >
                    Send back for rework
                  </button>
                </div>
              </div>
            )}

            {approval && !isTemplate && (
              <div className="flex flex-wrap gap-3 mb-2 text-[11px] font-semibold">
                {Boolean(step.needs_admin_approval) && (
                  <span className={step.admin_approved_at ? 'text-emerald-600' : 'text-slate-400'}>
                    Admin: {step.admin_approved_at ? `approved by ${step.admin_approved_by_name}` : 'pending'}
                  </span>
                )}
                {Boolean(step.needs_client_approval) && (
                  <span className={step.client_approved_at ? 'text-emerald-600' : 'text-slate-400'}>
                    Client: {step.client_approved_at ? `approved (recorded by ${step.client_approved_by_name})` : 'pending'}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Stage team:</span>
              {editing ? (
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <PeoplePicker employees={employees} value={people} onChange={setPeople} ariaLabel={`Assign people to ${step.name}`} />
                  <button
                    className={btnPrimary}
                    disabled={busy || people.length === 0}
                    onClick={async () => {
                      if (await act(() => projectFlowService.setStepAssignees(project.id, step.id, people))) setEditing(false);
                    }}
                  >
                    Save
                  </button>
                  <button className={btnSecondary} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <PeopleStack people={step.assignees} />
                  {canManage && !done && (
                    <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" aria-label={`Reassign ${step.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
              {step.completed_at && !isTemplate && (
                <span className="text-[11px] text-slate-400 ml-auto">
                  Completed {fmtDate(step.completed_at)}
                  {step.completed_by_name ? ` by ${step.completed_by_name}` : ''}
                </span>
              )}
            </div>

            <TaskTable tasks={step.tasks} project={project} busy={busy} act={act} locked={locked} />

            {!isTemplate &&
              step.can_add_tasks &&
              (composing ? (
                <TaskComposer step={step} project={project} canManage={canManage} employees={employees} busy={busy} act={act} onDone={() => setComposing(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="mt-3 w-full rounded-xl border border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/30 py-2 text-xs font-bold text-slate-500 hover:text-red-700 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />{' '}
                  {locked ? 'Plan extra tasks for this stage (they unlock when it starts)' : step.tasks.length ? 'Add tasks' : `Break "${step.name}" into tasks`}
                </button>
              ))}
          </div>
        )}
      </section>
    </li>
  );
}
