import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock, Trash2, X, Zap, AlertTriangle, ArrowLeft, Plus } from 'lucide-react';
import { shootsService } from '../../services/api';
import { PageState, errorMessage, fmtDate, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { WEEKDAYS, PRESETS, fmtRange, longMonth, dayLabel, monthGrid, KindBadge } from './shootUi';

/**
 * A videographer's month: which dates and times they are free for shoots.
 * Managers open it with ?userId= to fill it in for someone.
 */
export default function MyAvailabilityPage() {
  const [params] = useSearchParams();
  const userId = params.get('userId') || undefined;
  const [month, setMonth] = useState(params.get('month') || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await shootsService.getAvailability({ month: month || undefined, userId });
      setData(res.data.data);
      if (!month) setMonth(res.data.data.month);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your availability'));
    } finally {
      setLoading(false);
    }
  }, [month, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = {};
    (data?.slots || []).forEach((s) => {
      (map[s.date] = map[s.date] || []).push(s);
    });
    return map;
  }, [data]);

  const shootsByDate = useMemo(() => {
    const map = {};
    (data?.shoots || []).forEach((s) => {
      (map[s.date] = map[s.date] || []).push(s);
    });
    return map;
  }, [data]);

  const add = async (body, label) => {
    setBusy(true);
    try {
      const res = await shootsService.addAvailability({ ...body, userId });
      const { added, skipped } = res.data.data;
      setNotice({
        tone: added ? 'ok' : 'warn',
        text: added
          ? `${label}: added to ${added} day${added === 1 ? '' : 's'}.${skipped.length ? ` Skipped ${skipped.length} that already had overlapping times.` : ''}`
          : `Nothing added — those days already have overlapping times.`
      });
      await load();
      return true;
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slot) => {
    setBusy(true);
    try {
      await shootsService.removeAvailability(slot.id);
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const clearDay = async (date) => {
    setBusy(true);
    try {
      await shootsService.clearDay({ date, userId });
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const toggleDone = async () => {
    setBusy(true);
    try {
      const res = await shootsService.submitMonth({ month: data.month, userId, done: !data.submitted_at });
      setData(res.data.data);
      setNotice({
        tone: 'ok',
        text: res.data.data.submitted_at
          ? `Thanks — ${longMonth(data.month)} is marked as done. You can still change it.`
          : `${longMonth(data.month)} is open again.`
      });
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const isPast = (ymd) => data && ymd < data.today;
  const freeDays = Object.keys(byDate).length;
  const forSomeoneElse = Boolean(userId);
  const isCurrentMonth = data && data.month === data.today.slice(0, 7);
  const overdue = data && !data.submitted_at && !isCurrentMonth && data.today > data.due_date;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {forSomeoneElse && (
        <Link to="/shoots?tab=team" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-red-600">
          <ArrowLeft className="w-4 h-4" /> Shoot Planner
        </Link>
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-red-600" />
            {forSomeoneElse && data ? `${data.videographer.name}'s availability` : 'My Shoot Availability'}
            {data && <KindBadge kind={data.videographer.kind} />}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mark the dates and times you are free to shoot. The team fixes client shoot days only when someone is free.
          </p>
        </div>
        {data && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl self-start">
            {data.months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setOpenDay(null);
                  setMonth(m);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                  m === data.month ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {longMonth(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold border ${
            notice.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
              : notice.tone === 'warn'
              ? 'bg-amber-50 text-amber-800 border-amber-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <PageState loading={loading} error={error} onRetry={load}>
        {data && (
          <>
            {/* Month status: due date + "I'm done" */}
            <div
              className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                data.submitted_at ? 'bg-emerald-50 border-emerald-100' : overdue ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
              }`}
            >
              <div className="flex items-start gap-3">
                {data.submitted_at ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                ) : overdue ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                ) : (
                  <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {data.submitted_at
                      ? `${longMonth(data.month)} marked as done on ${fmtDate(data.submitted_at)}`
                      : isCurrentMonth
                      ? `Keep the rest of ${longMonth(data.month)} up to date`
                      : `${longMonth(data.month)} availability is due by ${fmtDate(data.due_date)}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Free on {freeDays} day{freeDays === 1 ? '' : 's'} this month.{' '}
                    {data.submitted_at
                      ? 'You can still add or remove times — the team always sees the latest.'
                      : 'When you have filled every day you can shoot, mark the month as done.'}
                  </p>
                </div>
              </div>
              {data.editable && (
                <button type="button" onClick={toggleDone} disabled={busy} className={data.submitted_at ? btnSecondary : btnPrimary}>
                  {data.submitted_at ? 'Reopen month' : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> I'm done for {longMonth(data.month)}
                    </>
                  )}
                </button>
              )}
            </div>

            {data.editable && <QuickFill data={data} busy={busy} onApply={add} />}

            <Calendar
              month={data.month}
              byDate={byDate}
              shootsByDate={shootsByDate}
              isPast={isPast}
              today={data.today}
              editable={data.editable}
              onOpen={setOpenDay}
            />

            {openDay && (
              <DayPanel
                date={openDay}
                slots={byDate[openDay] || []}
                shoots={shootsByDate[openDay] || []}
                busy={busy}
                onClose={() => setOpenDay(null)}
                onAdd={(body, label) => add({ ...body, dates: [openDay] }, label)}
                onRemove={remove}
                onClear={() => clearDay(openDay)}
              />
            )}
          </>
        )}
      </PageState>
    </div>
  );
}

/** "Every Sat and Sun, full day" in one click. */
function QuickFill({ data, busy, onApply }) {
  const [days, setDays] = useState([6, 0]);
  const [preset, setPreset] = useState('full');
  const [custom, setCustom] = useState({ start: '10:00', end: '18:00' });

  const dates = useMemo(() => {
    const out = [];
    monthGrid(data.month).flat().forEach((c) => {
      if (c && days.includes(c.weekday) && c.ymd >= data.today) out.push(c.ymd);
    });
    return out;
  }, [data.month, data.today, days]);

  const p = PRESETS.find((x) => x.key === preset);
  const body = preset === 'custom' ? { start: custom.start, end: custom.end } : p.fullDay ? { fullDay: true } : { start: p.start, end: p.end };
  const label = preset === 'custom' ? `${custom.start}–${custom.end}` : p.label;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500" /> Quick fill — repeat the same time on chosen weekdays
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {WEEKDAYS.map((w, i) => (
          <button
            key={w}
            type="button"
            onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((d) => d !== i) : [...cur, i]))}
            className={`w-12 py-1.5 rounded-lg text-xs font-bold border transition ${
              days.includes(i) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {w}
          </button>
        ))}
        <span className="w-px h-6 bg-slate-200 mx-1" />
        {[...PRESETS, { key: 'custom', label: 'Custom' }].map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setPreset(x.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              preset === x.key ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {x.label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-1">
            <input type="time" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={`${inputCls} w-32 py-1.5`} aria-label="From" />
            <span className="text-slate-400">–</span>
            <input type="time" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={`${inputCls} w-32 py-1.5`} aria-label="To" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {dates.length
            ? `Adds ${label} to ${dates.length} date${dates.length === 1 ? '' : 's'} in ${longMonth(data.month)} (from today on). Days that already overlap are skipped.`
            : 'Pick at least one weekday that is still ahead this month.'}
        </p>
        <button type="button" disabled={busy || !dates.length || (preset === 'custom' && custom.start >= custom.end)} onClick={() => onApply({ ...body, dates }, label)} className={btnPrimary}>
          <Plus className="w-4 h-4" /> Apply to {dates.length} day{dates.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function Calendar({ month, byDate, shootsByDate = {}, isPast, today, editable, onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {w}
          </div>
        ))}
      </div>
      {monthGrid(month).map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
          {week.map((c, ci) => {
            if (!c) return <div key={ci} className="min-h-[92px] bg-slate-50/50 border-r border-slate-100 last:border-r-0" />;
            const slots = byDate[c.ymd] || [];
            const past = isPast(c.ymd);
            const clickable = editable && !past;
            return (
              <button
                key={c.ymd}
                type="button"
                disabled={!clickable}
                onClick={() => onOpen(c.ymd)}
                aria-label={`${dayLabel(c.ymd)}: ${slots.length ? slots.map(fmtRange).join(', ') : 'not marked'}`}
                className={`min-h-[92px] p-1.5 text-left border-r border-slate-100 last:border-r-0 align-top transition ${
                  past ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'hover:bg-red-50/40'
                } ${slots.length && !past ? 'bg-emerald-50/40' : ''}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    c.ymd === today ? 'bg-red-600 text-white' : past ? '' : 'text-slate-700'
                  }`}
                >
                  {c.day}
                </span>
                <div className="mt-1 space-y-1">
                  {(shootsByDate[c.ymd] || []).map((sh) => (
                    <div key={`shoot-${sh.id}`} className="text-[10px] font-black rounded px-1.5 py-0.5 truncate bg-red-600 text-white">
                      🎬 {fmtRange(sh)}
                    </div>
                  ))}
                  {slots.map((s) => (
                    <div
                      key={s.id}
                      className={`text-[10px] font-bold rounded px-1.5 py-0.5 truncate ${
                        past ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {fmtRange(s)}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayPanel({ date, slots, shoots = [], busy, onClose, onAdd, onRemove, onClear }) {
  const [custom, setCustom] = useState({ start: '10:00', end: '14:00', note: '' });
  const hasFull = slots.some((s) => s.full_day);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Availability on ${dayLabel(date)}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">{dayLabel(date)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {shoots.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">Booked shoots</p>
            {shoots.map((sh) => (
              <Link key={sh.id} to="/shoots/mine" className="block rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-sm">
                <b className="text-red-700">{fmtRange(sh)}</b> <span className="text-slate-600">· {sh.title} · {sh.area}</span>
              </Link>
            ))}
            <p className="text-[11px] text-slate-500">Free time around a booked shoot can't be removed — drop the shoot first.</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">You're free</p>
          {slots.length ? (
            slots.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-emerald-800">{fmtRange(s)}</p>
                  {s.note && <p className="text-xs text-emerald-700/80">{s.note}</p>}
                </div>
                <button type="button" disabled={busy} onClick={() => onRemove(s)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${fmtRange(s)}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Not marked — the team will treat you as busy this day.</p>
          )}
        </div>

        {!hasFull && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Add a time</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={busy}
                  onClick={() => onAdd(p.fullDay ? { fullDay: true } : { start: p.start, end: p.end }, p.label)}
                  className={`${btnSecondary} py-2`}
                >
                  {p.label}
                  {!p.fullDay && <span className="text-[11px] font-semibold text-slate-400">{fmtRange(p)}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="time" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={`${inputCls} py-1.5`} aria-label="From" />
              <span className="text-slate-400">–</span>
              <input type="time" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={`${inputCls} py-1.5`} aria-label="To" />
            </div>
            <input
              value={custom.note}
              onChange={(e) => setCustom((c) => ({ ...c, note: e.target.value }))}
              placeholder="Note (optional), e.g. only near Anna Nagar"
              className={inputCls}
              maxLength={255}
            />
            <button
              type="button"
              disabled={busy || custom.start >= custom.end}
              onClick={async () => {
                const ok = await onAdd({ start: custom.start, end: custom.end, note: custom.note || null }, 'Custom time');
                if (ok) setCustom((c) => ({ ...c, note: '' }));
              }}
              className={`${btnPrimary} w-full`}
            >
              <Plus className="w-4 h-4" /> Add {custom.start}–{custom.end}
            </button>
          </div>
        )}

        {slots.length > 0 && (
          <button type="button" disabled={busy} onClick={onClear} className="w-full text-sm font-bold text-red-600 hover:underline">
            I'm not free this day — clear it
          </button>
        )}
      </div>
    </div>
  );
}
