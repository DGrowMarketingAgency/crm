import React, { useEffect, useState } from 'react';
import { Play, Pause, CheckCircle2, Timer } from 'lucide-react';

/** 3725 → "1h 02m 05s"; under an hour → "12m 05s". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${m}m ${pad(sec)}s`;
}

/**
 * Re-renders every second while anything is running. Live values are derived from the server's elapsed
 * seconds plus time since the data was fetched, so the browser clock never has to agree with the DB clock.
 */
export function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function liveSeconds(time, syncedAt) {
  if (!time) return 0;
  const drift = time.running ? Math.floor((Date.now() - syncedAt) / 1000) : 0;
  return (time.total_seconds || 0) + drift;
}

/** Start / Pause / Resume / Complete controls plus the task's running total. */
export function TaskTracker({ task, syncedAt, canTrack, busy, onAction }) {
  const time = task.time || {};
  const running = time.running;
  const runningMine = running?.mine;
  const completed = task.status === 'completed';
  const total = liveSeconds(time, syncedAt);
  const started = (time.sessions || 0) > 0 || running;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={`inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums whitespace-nowrap ${
          running ? 'text-blue-600' : completed ? 'text-emerald-600' : 'text-slate-500'
        }`}
        title={`${time.sessions || 0} session(s)${running && !runningMine ? ` · running for ${running.user_name}` : ''}`}
      >
        <Timer className={`w-3.5 h-3.5 ${running ? 'animate-pulse' : ''}`} />
        {formatDuration(total)}
      </span>

      {canTrack && !completed && (
        <>
          {runningMine ? (
            <button
              onClick={() => onAction(task, 'pause')}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
              aria-label={`Pause ${task.title}`}
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          ) : (
            <button
              onClick={() => onAction(task, 'start')}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
              aria-label={`${started ? 'Resume' : 'Start'} ${task.title}`}
            >
              <Play className="w-3.5 h-3.5" /> {started ? 'Resume' : 'Start'}
            </button>
          )}
          <button
            onClick={() => onAction(task, 'complete')}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
            aria-label={`Complete ${task.title}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
          </button>
        </>
      )}
    </div>
  );
}
