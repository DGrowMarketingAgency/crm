import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldCheck, RotateCcw, Hourglass, Send, ExternalLink, Check, Inbox } from 'lucide-react';
import { projectFlowService, deliverablesService } from '../../services/api';
import { PageState, Empty, errorMessage, fmtDate, btnPrimary, btnSecondary, inputCls } from './flowUi';

const TABS = [
  { key: 'needs_review', label: 'Needs your review', icon: ClipboardCheck, hint: 'Work your team submitted. Approve it to send it to the client, or ask for changes.' },
  { key: 'stage_approvals', label: 'Stage approvals', icon: ShieldCheck, hint: 'Approval stages waiting for an admin or client sign-off before the project moves on.' },
  { key: 'changes_requested', label: 'Changes requested', icon: RotateCcw, hint: 'Work sent back by the team or the client. Fix it and send it again from the project.' },
  { key: 'with_client', label: 'Waiting for client', icon: Hourglass, hint: 'Approved by the team and sent to the client — waiting for their answer in the client portal.' },
  { key: 'my_submissions', label: 'My submissions', icon: Send, hint: 'Your own work that is still waiting on someone.' }
];

const ago = (when) => {
  if (!when) return '';
  const days = Math.floor((Date.now() - new Date(when).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

/** Client · project · stage — the context line on every card. */
function Where({ r }) {
  return (
    <p className="text-xs text-slate-500">
      <span className="font-semibold text-slate-700">{r.client_name || 'Internal'}</span>
      {' · '}
      <Link to={`/flow-projects/${r.project_id}`} className="hover:text-red-600 hover:underline">
        {r.project_name}
      </Link>
      {r.stage_name ? ` · ${r.stage_name}` : ''}
    </p>
  );
}

function Card({ children, tone = 'slate' }) {
  const ring = { slate: 'border-slate-100', purple: 'border-purple-100', amber: 'border-amber-200', orange: 'border-orange-200' }[tone];
  return <div className={`bg-white rounded-2xl border ${ring} shadow-sm p-4 flex flex-col md:flex-row md:items-start justify-between gap-3`}>{children}</div>;
}

export function ReviewsPage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState('');
  const [sendingBack, setSendingBack] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectFlowService.getReviews();
      setData(res.data);
      // Open on the first list that has something in it.
      setTab((cur) => cur || TABS.find((t) => res.data[t.key]?.length)?.key || 'needs_review');
    } catch (err) {
      setError(errorMessage(err, 'Could not load reviews'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, fn, done) => {
    setBusy(key);
    setNotice('');
    try {
      await fn();
      setNotice(done);
      await load();
      window.dispatchEvent(new Event('reviews:changed'));
    } catch (err) {
      setNotice('');
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const reviewTask = (r, decision) => {
    if (decision === 'changes_requested') {
      setSendingBack({ kind: 'task', r });
      setNote('');
      return;
    }
    run(`t${r.task_id}`, () => deliverablesService.reviewInternal(r.submission_id, { decision: 'approved' }), `“${r.title}” approved and sent to ${r.client_name || 'the client'}.`);
  };

  const confirmSendBack = () => {
    const { kind, r } = sendingBack;
    if (!note.trim()) return setError('Write what needs to change');
    setError('');
    if (kind === 'task') {
      run(`t${r.task_id}`, () => deliverablesService.reviewInternal(r.submission_id, { decision: 'changes_requested', feedback: note.trim() }), `Sent “${r.title}” back with your notes.`);
    } else {
      run(`s${r.step_id}`, () => projectFlowService.requestChanges(r.project_id, r.step_id, note.trim()), `“${r.stage_name}” sent back for rework.`);
    }
    setSendingBack(null);
  };

  const list = data?.[tab] || [];
  const current = TABS.find((t) => t.key === tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Reviews & Approvals</h1>
          <p className="text-sm text-slate-500">Everything waiting on a decision — review work, sign off stages, fix what came back.</p>
        </div>
      </div>

      <PageState loading={loading && !data} error={!data ? error : ''} onRetry={load}>
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {TABS.map((t) => {
                const n = data[t.key]?.length || 0;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`text-left rounded-2xl border p-4 transition-all ${active ? 'border-red-500 bg-red-50/40 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-300'}`}
                  >
                    <t.icon className={`w-4 h-4 ${active ? 'text-red-600' : 'text-slate-400'}`} />
                    <p className="text-2xl font-black text-slate-900 mt-1">{n}</p>
                    <p className="text-xs font-bold text-slate-600">{t.label}</p>
                  </button>
                );
              })}
            </div>

            {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800">{notice}</div>}
            {error && data && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm font-semibold text-red-700" role="alert">
                {error}
              </div>
            )}

            <div>
              <p className="text-sm text-slate-500 mb-3">{current?.hint}</p>
              {list.length === 0 ? (
                <Empty icon={Inbox} title="Nothing here" text="You're all caught up." />
              ) : (
                <div className="space-y-3">
                  {tab === 'needs_review' &&
                    list.map((r) => (
                      <Card key={r.task_id} tone="purple">
                        <div className="min-w-0 space-y-1">
                          <Where r={r} />
                          <p className="font-bold text-slate-900">{r.title}</p>
                          <p className="text-xs text-slate-500">
                            Sent by <span className="font-semibold text-slate-700">{r.submitted_by_name || r.assignee_name}</span> {ago(r.submitted_at)}
                            {r.version_number > 1 ? ` · version ${r.version_number}` : ''}
                            {r.revision_count ? ` · ${r.revision_count} earlier revision${r.revision_count === 1 ? '' : 's'}` : ''}
                          </p>
                          {r.submission_notes && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">“{r.submission_notes}”</p>}
                          {r.deliverable_url && (
                            <a href={r.deliverable_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Open the work
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button className={`${btnPrimary} !py-2 !bg-emerald-600 hover:!bg-emerald-700`} disabled={busy === `t${r.task_id}`} onClick={() => reviewTask(r, 'approved')}>
                            <Check className="w-4 h-4" /> Approve & send to client
                          </button>
                          <button className={`${btnSecondary} !py-2`} disabled={busy === `t${r.task_id}`} onClick={() => reviewTask(r, 'changes_requested')}>
                            Ask for changes
                          </button>
                        </div>
                      </Card>
                    ))}

                  {tab === 'stage_approvals' &&
                    list.map((r) => (
                      <Card key={r.step_id} tone="amber">
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{r.client_name}</span> ·{' '}
                            <Link to={`/flow-projects/${r.project_id}`} className="hover:text-red-600 hover:underline">
                              {r.project_name}
                            </Link>
                          </p>
                          <p className="font-bold text-slate-900">{r.stage_name}</p>
                          <p className="text-xs text-slate-500">
                            Waiting since {fmtDate(r.started_at)} · needs{' '}
                            {[r.needs_admin_approval && 'admin approval', r.needs_client_approval && 'client approval'].filter(Boolean).join(' and ') || 'a decision'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          {r.needs_admin_approval && (
                            <button className={`${btnPrimary} !py-2`} disabled={busy === `s${r.step_id}`} onClick={() => run(`s${r.step_id}`, () => projectFlowService.approveStep(r.project_id, r.step_id, 'admin'), `Admin approval recorded for “${r.stage_name}”.`)}>
                              <ShieldCheck className="w-4 h-4" /> Admin approve
                            </button>
                          )}
                          {r.needs_client_approval && (
                            <button className={`${btnPrimary} !py-2`} disabled={busy === `s${r.step_id}`} onClick={() => run(`s${r.step_id}`, () => projectFlowService.approveStep(r.project_id, r.step_id, 'client'), `Client approval recorded for “${r.stage_name}”.`)}>
                              <ShieldCheck className="w-4 h-4" /> Client approved
                            </button>
                          )}
                          <button className={`${btnSecondary} !py-2`} disabled={busy === `s${r.step_id}`} onClick={() => { setSendingBack({ kind: 'stage', r }); setNote(''); }}>
                            Send back
                          </button>
                        </div>
                      </Card>
                    ))}

                  {tab === 'changes_requested' &&
                    list.map((r) => (
                      <Card key={r.task_id} tone="orange">
                        <div className="min-w-0 space-y-1">
                          <Where r={r} />
                          <p className="font-bold text-slate-900">{r.title}</p>
                          <p className="text-xs text-slate-500">
                            {r.requested_by === 'client' ? 'The client' : 'Your team'} asked for changes · assigned to{' '}
                            <span className="font-semibold text-slate-700">{r.is_mine ? 'you' : r.assignee_name}</span>
                            {r.revision_count ? ` · revision ${r.revision_count}` : ''}
                          </p>
                          {r.reason && <p className="text-sm text-orange-900 bg-orange-50 rounded-lg px-3 py-2">“{r.reason}”</p>}
                        </div>
                        <Link to={`/flow-projects/${r.project_id}`} className={`${btnPrimary} !py-2 shrink-0`}>
                          {r.is_mine ? 'Fix & resend' : 'Open project'}
                        </Link>
                      </Card>
                    ))}

                  {tab === 'with_client' &&
                    list.map((r) => (
                      <Card key={r.task_id}>
                        <div className="min-w-0 space-y-1">
                          <Where r={r} />
                          <p className="font-bold text-slate-900">{r.title}</p>
                          <p className={`text-xs ${r.days_waiting >= 3 ? 'font-bold text-red-600' : 'text-slate-500'}`}>
                            Sent to the client {ago(r.internal_reviewed_at)}
                            {r.days_waiting >= 3 ? ' — follow up with them' : ''}
                          </p>
                        </div>
                        {r.deliverable_url && (
                          <a href={r.deliverable_url} target="_blank" rel="noreferrer" className={`${btnSecondary} !py-2 shrink-0`}>
                            <ExternalLink className="w-4 h-4" /> Open the work
                          </a>
                        )}
                      </Card>
                    ))}

                  {tab === 'my_submissions' &&
                    list.map((r) => (
                      <Card key={r.task_id}>
                        <div className="min-w-0 space-y-1">
                          <Where r={r} />
                          <p className="font-bold text-slate-900">{r.title}</p>
                          <p className="text-xs text-slate-500">
                            Sent {ago(r.submitted_at)} · waiting for <span className="font-semibold text-slate-700">{r.waiting_on === 'team' ? 'team review' : 'the client'}</span>
                          </p>
                        </div>
                        <Link to={`/flow-projects/${r.project_id}`} className={`${btnSecondary} !py-2 shrink-0`}>
                          Open project
                        </Link>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </PageState>

      {sendingBack && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h2 className="font-black text-slate-900">{sendingBack.kind === 'task' ? `Ask for changes: ${sendingBack.r.title}` : `Send back: ${sendingBack.r.stage_name}`}</h2>
            <p className="text-xs text-slate-500">
              {sendingBack.kind === 'task' ? 'The person who did it sees your note and sends a new version.' : 'The work goes back to the previous stage with your note.'}
            </p>
            <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" autoFocus aria-label="What needs to change" />
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} onClick={() => setSendingBack(null)}>
                Cancel
              </button>
              <button className={btnPrimary} onClick={confirmSendBack} disabled={!note.trim()}>
                Send back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
