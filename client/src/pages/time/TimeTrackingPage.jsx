import React, { useState, useEffect } from 'react';
import { timeService, tasksService, projectsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { LogTimeModal } from './LogTimeModal';
import { TimesheetDetailsModal } from './TimesheetDetailsModal';
import {
  Clock,
  Calendar,
  Play,
  Square,
  Plus,
  Filter,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  Trash2,
  Edit2,
  Users,
  ChevronRight,
  Loader2,
  Layers,
  ArrowUpRight
} from 'lucide-react';

const STATUS_BADGES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-purple-50 text-purple-700 border-purple-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200'
};

export function TimeTrackingPage() {
  const { isOwner, hasPermission, user: currentUser } = usePermission();

  const [activeTab, setActiveTab] = useState('logs'); // 'logs' | 'timesheets' | 'review'
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [reviewTimesheets, setReviewTimesheets] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Quick Start Timer state
  const [myTasks, setMyTasks] = useState([]);
  const [selectedQuickTask, setSelectedQuickTask] = useState('');
  const [timerNotes, setTimerNotes] = useState('');
  const [isStartingTimer, setIsStartingTimer] = useState(false);

  // Modals state
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTimesheetId, setSelectedTimesheetId] = useState(null);
  const [prepareTimesheetOpen, setPrepareTimesheetOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [isPreparingTimesheet, setIsPreparingTimesheet] = useState(false);

  // Permissions
  const canViewTeam = isOwner || hasPermission('timesheets.view_team') || hasPermission('timesheets.review');
  const canReview = isOwner || hasPermission('timesheets.review') || hasPermission('timesheets.approve');

  useEffect(() => {
    // Default current week dates for timesheet preparation
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMonday));
    const sunday = new Date(now.setDate(monday.getDate() + 6));
    setPeriodStart(monday.toISOString().slice(0, 10));
    setPeriodEnd(sunday.toISOString().slice(0, 10));

    loadInitialData();

    // Listen for custom timer stop events
    const handleEntryCreated = () => {
      loadInitialData();
    };
    window.addEventListener('time-entry-created', handleEntryCreated);
    return () => window.removeEventListener('time-entry-created', handleEntryCreated);
  }, []);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => {
      const started = new Date(activeTimer.startedAt).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const loadInitialData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [sumRes, entRes, tsRes, timerRes, tasksRes] = await Promise.all([
        timeService.getSummary().catch(() => ({ data: { summary: null } })),
        timeService.getTimeEntries({ limit: 50 }).catch(() => ({ data: { entries: [] } })),
        timeService.getTimesheets({ limit: 20 }).catch(() => ({ data: { timesheets: [] } })),
        timeService.getActiveTimer().catch(() => ({ data: { timer: null } })),
        tasksService.getMyTasks({ limit: 30 }).catch(() => ({ data: { tasks: [] } }))
      ]);

      setSummary(sumRes.data.summary);
      setEntries(entRes.data.entries || []);
      setTimesheets(tsRes.data.timesheets || []);
      setActiveTimer(timerRes.data.timer);
      if (timerRes.data.timer) {
        setElapsedSeconds(timerRes.data.timer.elapsedSeconds || 0);
      }
      setMyTasks(tasksRes.data.tasks || []);

      if (canReview) {
        const reviewRes = await timeService.getTimesheets({ status: 'submitted', limit: 30 }).catch(() => ({ data: { timesheets: [] } }));
        setReviewTimesheets(reviewRes.data.timesheets || []);
      }
    } catch (err) {
      console.error('Failed to load time tracking dashboard:', err);
      setError('Failed to load time tracking records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTimer = async (e) => {
    e.preventDefault();
    if (!selectedQuickTask) return;
    setIsStartingTimer(true);
    setError('');
    try {
      const res = await timeService.startTimer(selectedQuickTask, timerNotes);
      setActiveTimer(res.data.timer);
      setElapsedSeconds(0);
      setTimerNotes('');
      setNotice('Task timer started!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to start timer');
    } finally {
      setIsStartingTimer(false);
    }
  };

  const handleStopTimer = async () => {
    if (!activeTimer) return;
    if (!window.confirm('Stop active timer and log recorded effort?')) return;
    try {
      await timeService.stopTimer(activeTimer.id, { isBillable: true });
      setActiveTimer(null);
      setNotice('Timer stopped and recorded as draft work entry');
      await loadInitialData();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to stop timer');
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      await timeService.deleteTimeEntry(id);
      setNotice('Work log removed');
      await loadInitialData();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete time entry');
    }
  };

  const handlePrepareTimesheet = async (e) => {
    e.preventDefault();
    setIsPreparingTimesheet(true);
    setError('');
    try {
      const res = await timeService.createTimesheet({ periodStart, periodEnd });
      setNotice('Timesheet generated with linked draft work entries!');
      setPrepareTimesheetOpen(false);
      setSelectedTimesheetId(res.data.timesheet.id);
      setDetailsModalOpen(true);
      await loadInitialData();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to prepare timesheet');
    } finally {
      setIsPreparingTimesheet(false);
    }
  };

  const formatTimer = (totalSec) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Time Tracking & Timesheets
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track billable task hours, submit periodic timesheets, and monitor project effort
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setEditingEntry(null);
              setLogModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/80 rounded-xl transition shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Log Manual Time</span>
          </button>

          <button
            onClick={() => setPrepareTimesheetOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Prepare Timesheet</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice('')} className="text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ACTIVE TIMER HERO CARD */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 overflow-hidden">
        {activeTimer ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Timer Running
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    {activeTimer.taskCode}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">
                  {activeTimer.taskTitle}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Project: <span className="text-slate-700 font-semibold">{activeTimer.projectName}</span>
                  {activeTimer.description && ` • "${activeTimer.description}"`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 self-start md:self-auto">
              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 tracking-tight block">
                  {formatTimer(elapsedSeconds)}
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                  Live Server Elapsed
                </span>
              </div>

              <button
                onClick={handleStopTimer}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop & Save</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStartTimer} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Play className="w-5 h-5 ml-0.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Task Timer</h3>
                <p className="text-xs text-slate-500">
                  Select an assigned task and start tracking time
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-xl">
              <select
                required
                value={selectedQuickTask}
                onChange={(e) => setSelectedQuickTask(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Select assigned task...</option>
                {myTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.task_code || `#${t.id}`} — {t.title}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Session notes (optional)..."
                value={timerNotes}
                onChange={(e) => setTimerNotes(e.target.value)}
                className="sm:w-48 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />

              <button
                type="submit"
                disabled={isStartingTimer || !selectedQuickTask}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50 whitespace-nowrap"
              >
                {isStartingTimer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>Start Timer</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SUMMARY STATS ROW */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Logged
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-slate-900">{summary.totalHours}</span>
              <span className="text-xs text-slate-500 font-semibold">hrs</span>
            </div>
            <span className="text-[11px] text-slate-400 block">{summary.totalEntries} entries recorded</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
              Billable Hours
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-emerald-900">{summary.billableHours}</span>
              <span className="text-xs text-emerald-700 font-semibold">hrs</span>
            </div>
            <span className="text-[11px] text-emerald-700/80 block">
              {summary.totalHours > 0 ? Math.round((summary.billableHours / summary.totalHours) * 100) : 0}% of effort
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Non-Billable
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-slate-700">{summary.nonBillableHours}</span>
              <span className="text-xs text-slate-500 font-semibold">hrs</span>
            </div>
            <span className="text-[11px] text-slate-400 block">Internal agency tasks</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block">
              Approved
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-emerald-800">{summary.approvedHours}</span>
              <span className="text-xs text-emerald-700 font-semibold">hrs</span>
            </div>
            <span className="text-[11px] text-slate-400 block">Manager verified</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 block">
              In Review
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-purple-900">{summary.submittedHours}</span>
              <span className="text-xs text-purple-700 font-semibold">hrs</span>
            </div>
            <span className="text-[11px] text-purple-700/80 block">Awaiting sign-off</span>
          </div>
        </div>
      )}

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'logs'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Work Logs ({entries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('timesheets')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'timesheets'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>My Timesheets ({timesheets.length})</span>
        </button>

        {canReview && (
          <button
            onClick={() => setActiveTab('review')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'review'
                ? 'border-brand-600 text-brand-700 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Approvals ({reviewTimesheets.length})</span>
          </button>
        )}
      </div>

      {/* 1. WORK LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Recorded Work Entries</h3>
              <p className="text-xs text-slate-500">
                Individual task efforts tracked via timers or manual entries
              </p>
            </div>

            <button
              onClick={() => {
                setEditingEntry(null);
                setLogModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Time</span>
            </button>
          </div>

          {entries.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-xs">No time entries recorded yet. Start a timer or log time manually.</p>
            </div>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3.5">Task & Project</th>
                    <th className="py-3 px-3.5">Duration</th>
                    <th className="py-3 px-3.5">Type & Billable</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5">Notes</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const isDraft = entry.approval_status === 'draft';
                    const isOwn = entry.user_id === currentUser?.id;

                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                          {entry.work_date?.slice(0, 10)}
                        </td>
                        <td className="py-3 px-3.5">
                          <p className="font-bold text-slate-900">{entry.task_title}</p>
                          <p className="text-[11px] text-brand-700 font-medium">
                            {entry.task_code} • {entry.project_name}
                          </p>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900 text-sm">
                            {(entry.duration_minutes / 60).toFixed(1)} hrs
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({entry.duration_minutes}m)
                          </span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap space-y-1">
                          <div>
                            {entry.is_billable ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Billable
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                Non-billable
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 capitalize block">
                            via {entry.entry_type}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                              STATUS_BADGES[entry.approval_status] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {entry.approval_status}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 text-[11px] max-w-[200px] truncate" title={entry.description}>
                          {entry.description || '—'}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          {isDraft && (isOwn || isOwner) ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingEntry(entry);
                                  setLogModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                                title="Edit Entry"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. TIMESHEETS TAB */}
      {activeTab === 'timesheets' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Period Timesheets</h3>
              <p className="text-xs text-slate-500">
                Weekly reporting periods for manager evaluation and approval
              </p>
            </div>

            <button
              onClick={() => setPrepareTimesheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Prepare Timesheet</span>
            </button>
          </div>

          {timesheets.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-xs">No timesheets generated yet. Click 'Prepare Timesheet' to bundle your weekly entries.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {timesheets.map((ts) => (
                <div
                  key={ts.id}
                  onClick={() => {
                    setSelectedTimesheetId(ts.id);
                    setDetailsModalOpen(true);
                  }}
                  className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-300 hover:shadow-sm bg-slate-50/50 hover:bg-white transition cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-500">
                        #{ts.id}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_BADGES[ts.status]}`}>
                        {ts.status}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-700 transition">
                      {ts.period_start?.slice(0, 10)} to {ts.period_end?.slice(0, 10)}
                    </h4>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tracked</span>
                        <span className="font-bold text-slate-800">{(ts.total_minutes / 60).toFixed(1)} hrs</span>
                      </div>
                      <div>
                        <span className="text-emerald-700 block text-[10px]">Billable</span>
                        <span className="font-bold text-emerald-800">{(ts.billable_minutes / 60).toFixed(1)} hrs</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                    <span>{ts.entry_count || 0} entries</span>
                    <span className="text-brand-700 font-semibold group-hover:underline inline-flex items-center gap-0.5">
                      <span>View details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. MANAGER REVIEW TAB */}
      {activeTab === 'review' && canReview && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Submitted Team Timesheets</h3>
            <p className="text-xs text-slate-500">
              Timesheets submitted by staff members awaiting manager review and sign-off
            </p>
          </div>

          {reviewTimesheets.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-600" />
              <p className="text-xs">All clear! No timesheets currently awaiting review.</p>
            </div>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-3.5">Employee</th>
                    <th className="py-3 px-3.5">Reporting Period</th>
                    <th className="py-3 px-3.5">Total Hours</th>
                    <th className="py-3 px-3.5">Billable</th>
                    <th className="py-3 px-3.5">Submitted</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reviewTimesheets.map((ts) => (
                    <tr key={ts.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 font-bold text-[11px] flex items-center justify-center">
                            {ts.user_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{ts.user_name}</p>
                            <p className="text-[10px] text-slate-400">{ts.user_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-semibold text-slate-800">
                        {ts.period_start?.slice(0, 10)} to {ts.period_end?.slice(0, 10)}
                      </td>
                      <td className="py-3 px-3.5 font-bold text-slate-900">
                        {(ts.total_minutes / 60).toFixed(1)} hrs
                      </td>
                      <td className="py-3 px-3.5 font-bold text-emerald-800">
                        {(ts.billable_minutes / 60).toFixed(1)} hrs
                      </td>
                      <td className="py-3 px-3.5 text-slate-500">
                        {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString() : 'Recent'}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <button
                          onClick={() => {
                            setSelectedTimesheetId(ts.id);
                            setDetailsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                        >
                          <span>Review</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Prepare Timesheet Dialog */}
      {prepareTimesheetOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Prepare Periodic Timesheet</h3>
                <p className="text-xs text-slate-500">
                  Bundles eligible draft work logs into an official timesheet
                </p>
              </div>
            </div>

            <form onSubmit={handlePrepareTimesheet} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    Period Start
                  </label>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    Period End
                  </label>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPrepareTimesheetOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPreparingTimesheet}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition disabled:opacity-50"
                >
                  {isPreparingTimesheet ? 'Generating...' : 'Generate Timesheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      <LogTimeModal
        isOpen={logModalOpen}
        onClose={() => {
          setLogModalOpen(false);
          setEditingEntry(null);
        }}
        onSuccess={loadInitialData}
        editEntry={editingEntry}
      />

      {/* Timesheet Details Modal */}
      <TimesheetDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => {
          setDetailsModalOpen(false);
          setSelectedTimesheetId(null);
        }}
        timesheetId={selectedTimesheetId}
        onStatusChange={loadInitialData}
      />
    </div>
  );
}
