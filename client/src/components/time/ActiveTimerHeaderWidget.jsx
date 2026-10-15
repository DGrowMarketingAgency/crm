import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { timeService } from '../../services/api';
import { Play, Square, Clock, Loader2, Check } from 'lucide-react';

export function ActiveTimerHeaderWidget() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [stopNotes, setStopNotes] = useState('');
  const [stopBillable, setStopBillable] = useState(true);

  useEffect(() => {
    fetchActiveTimer();
    const interval = setInterval(fetchActiveTimer, 15000); // Check every 15s for multi-tab sync
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeTimer) return;

    const timerInterval = setInterval(() => {
      const started = new Date(activeTimer.startedAt).getTime();
      const current = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((current - started) / 1000)));
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [activeTimer]);

  const fetchActiveTimer = async () => {
    try {
      const res = await timeService.getActiveTimer();
      setActiveTimer(res.data.timer);
      if (res.data.timer) {
        setElapsedSeconds(res.data.timer.elapsedSeconds || 0);
      }
    } catch (err) {
      // Quietly ignore in case of unauthenticated state
    }
  };

  const handleConfirmStop = async () => {
    if (!activeTimer) return;
    setIsStopping(true);
    try {
      await timeService.stopTimer(activeTimer.id, {
        description: stopNotes.trim() || undefined,
        isBillable: stopBillable
      });
      setActiveTimer(null);
      setStopModalOpen(false);
      setStopNotes('');
      // Trigger a custom event for other pages
      window.dispatchEvent(new CustomEvent('time-entry-created'));
    } catch (err) {
      console.error('Stop timer error:', err);
    } finally {
      setIsStopping(false);
    }
  };

  const formatTimer = (totalSec) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!activeTimer) {
    return (
      <Link
        to="/time"
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition"
        title="Time Tracking & Timesheets"
      >
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <span>Time Tracking</span>
      </Link>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/90 px-3 py-1.5 rounded-xl shadow-2xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
        </span>

        <span className="font-mono font-bold text-xs text-emerald-800">
          {formatTimer(elapsedSeconds)}
        </span>

        <Link
          to={`/tasks/${activeTimer.taskId}`}
          className="text-[11px] font-semibold text-emerald-900 max-w-[120px] truncate hover:underline"
          title={`${activeTimer.taskCode} • ${activeTimer.taskTitle}`}
        >
          {activeTimer.taskCode || activeTimer.taskTitle}
        </Link>

        <button
          onClick={() => setStopModalOpen(true)}
          className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition ml-1"
          title="Stop & log time entry"
        >
          <Square className="w-3 h-3 fill-current" />
        </button>
      </div>

      {/* Stop Timer Modal */}
      {stopModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Square className="w-3.5 h-3.5 fill-current" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Stop Task Timer</h3>
                <p className="text-xs text-slate-500">
                  Elapsed: <span className="font-mono font-bold text-emerald-700">{formatTimer(elapsedSeconds)}</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Work Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={stopNotes}
                onChange={(e) => setStopNotes(e.target.value)}
                placeholder="What was completed during this work session?"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={stopBillable}
                onChange={(e) => setStopBillable(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Mark as billable work</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStopModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isStopping}
                onClick={handleConfirmStop}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition disabled:opacity-50"
              >
                {isStopping ? 'Saving...' : 'Save Work Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
