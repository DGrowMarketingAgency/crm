import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, Users, UserPlus, X, Copy, Check, CheckCircle2, Clock, Pencil, CalendarClock, Mail, Clapperboard, Plus, CalendarCheck2, Wallet } from 'lucide-react';
import { shootsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { ShootsTab } from './ShootsTab';
import { ProposalsTab } from './ProposalsTab';
import { PayoutsTab } from './PayoutsTab';
import { PageState, Empty, errorMessage, fmtDate, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { WEEKDAYS, PRESETS, fmtRange, longMonth, shiftMonth, dayLabel, monthGrid, KindBadge } from './shootUi';

const WINDOWS = [{ key: 'any', label: 'Any time' }, ...PRESETS.filter((p) => !p.fullDay)];
const pad = (n) => String(n).padStart(2, '0');
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** Is this person free for the whole window on that day? */
const covers = (slots, win) => (win.key === 'any' ? slots.length > 0 : slots.some((s) => s.start <= win.start && s.end >= win.end));

export default function ShootPlannerPage() {
  const [params, setParams] = useSearchParams();
  const tab = ['free', 'team', 'requests', 'payouts'].includes(params.get('tab')) ? params.get('tab') : 'shoots';
  const [month, setMonth] = useState(thisMonth());
  const { hasPermission, isOwner } = usePermission();
  const canManage = Boolean(isOwner || hasPermission('shoots.manage'));
  const [seed, setSeed] = useState(null);
  /** From a day on "Who's free": open the New shoot form with that date and time window. */
  const postOn = (date, win) => {
    setSeed({ date, ...(win?.start ? { start: win.start, end: win.end } : {}) });
    setParams({});
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-red-600" /> Shoot Planner
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            See which videographers are free before you fix a client's shoot day. In-house and freelance, one view.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className={`${btnSecondary} px-2.5`} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-black text-slate-800 w-36 text-center">{longMonth(month)}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className={`${btnSecondary} px-2.5`} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto whitespace-nowrap">
        {[
          { key: 'shoots', label: 'Shoots', icon: Clapperboard },
          { key: 'requests', label: 'Date requests', icon: CalendarCheck2 },
          { key: 'free', label: "Who's free", icon: CalendarClock },
          { key: 'team', label: 'Videographers', icon: Users },
          canManage && { key: 'payouts', label: 'Payouts', icon: Wallet }
        ].filter(Boolean).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams(t.key === 'shoots' ? {} : { tab: t.key })}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px inline-flex items-center gap-2 shrink-0 ${
              tab === t.key ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'shoots' && <ShootsTab month={month} canManage={canManage} newShootSeed={seed} onSeedUsed={() => setSeed(null)} />}
      {tab === 'requests' && <ProposalsTab canManage={canManage} />}
      {tab === 'free' && <WhoIsFree month={month} canManage={canManage} onPost={postOn} />}
      {tab === 'team' && <Team month={month} />}
      {tab === 'payouts' && canManage && <PayoutsTab />}
    </div>
  );
}

function WhoIsFree({ month, canManage, onPost }) {
  const [data, setData] = useState(null);
  const [shoots, setShoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');
  const [winKey, setWinKey] = useState('any');
  const [openDay, setOpenDay] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const [res, sl] = await Promise.all([shootsService.getBoard({ month }), shootsService.getSlots({ month }).catch(() => null)]);
      setData(res.data.data);
      setShoots((sl?.data?.data?.slots || []).filter((s) => s.status !== 'cancelled'));
    } catch (err) {
      setError(errorMessage(err, 'Could not load availability'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const win = WINDOWS.find((w) => w.key === winKey);
  const people = useMemo(() => (data?.videographers || []).filter((p) => kind === 'all' || p.kind === kind), [data, kind]);

  /** date → [{ person, slots }] for people free in the chosen window */
  const freeByDate = useMemo(() => {
    const slotsBy = {};
    (data?.slots || []).forEach((s) => {
      const k = `${s.date}|${s.user_id}`;
      (slotsBy[k] = slotsBy[k] || []).push(s);
    });
    const out = {};
    monthGrid(month).flat().forEach((c) => {
      if (!c) return;
      out[c.ymd] = people
        .map((p) => ({ person: p, slots: slotsBy[`${c.ymd}|${p.id}`] || [] }))
        .filter((x) => covers(x.slots, win));
    });
    return out;
  }, [data, people, win, month]);

  const done = people.filter((p) => p.submitted_at).length;

  return (
    <PageState loading={loading && !data} error={error} onRetry={load}>
      {data && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'Everyone' },
                { key: 'in_house', label: 'In-house' },
                { key: 'freelance', label: 'Freelance' }
              ].map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    kind === k.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {k.label}
                </button>
              ))}
              <span className="w-px h-6 bg-slate-200 mx-1" />
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => setWinKey(w.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    winKey === w.key ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {w.label}
                  {w.start && <span className="font-semibold opacity-70"> {fmtRange(w)}</span>}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {done} of {people.length} marked {longMonth(month)} as done · due {fmtDate(data.due_date)}
            </p>
          </div>

          {!data.videographers.length ? (
            <Empty
              icon={Camera}
              title="No videographers yet"
              text="Add your in-house shooters and freelancers in the Videographers tab. They then mark their free dates here."
            />
          ) : (
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
                    if (!c) return <div key={ci} className="min-h-[96px] bg-slate-50/50 border-r border-slate-100 last:border-r-0" />;
                    const free = freeByDate[c.ymd] || [];
                    const past = c.ymd < data.today;
                    const tone = past ? 'text-slate-300' : free.length >= 2 ? 'bg-emerald-50' : free.length === 1 ? 'bg-amber-50' : '';
                    return (
                      <button
                        key={c.ymd}
                        type="button"
                        onClick={() => setOpenDay(c.ymd)}
                        aria-label={`${dayLabel(c.ymd)}: ${free.length} free`}
                        className={`min-h-[96px] p-1.5 text-left border-r border-slate-100 last:border-r-0 hover:ring-2 hover:ring-inset hover:ring-red-200 ${tone}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${c.ymd === data.today ? 'bg-red-600 text-white' : ''}`}>
                            {c.day}
                          </span>
                          {!past && (
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                free.length >= 2 ? 'bg-emerald-600 text-white' : free.length === 1 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {free.length} free
                            </span>
                          )}
                        </div>
                        {shoots.some((s) => s.date === c.ymd) && (
                          <p className="mt-1 text-[10px] font-black text-red-700 inline-flex items-center gap-1">
                            <Clapperboard className="w-3 h-3" /> {shoots.filter((s) => s.date === c.ymd).length} shoot
                            {shoots.filter((s) => s.date === c.ymd).length === 1 ? '' : 's'}
                          </p>
                        )}
                        {!past && (
                          <div className="mt-1 space-y-0.5">
                            {free.slice(0, 3).map(({ person }) => (
                              <p key={person.id} className="text-[10px] font-semibold text-slate-600 truncate">
                                {person.name}
                              </p>
                            ))}
                            {free.length > 3 && <p className="text-[10px] font-bold text-slate-400">+{free.length - 3} more</p>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500">
            <span className="inline-block w-3 h-3 rounded bg-emerald-100 align-middle mr-1" /> 2+ free{' '}
            <span className="inline-block w-3 h-3 rounded bg-amber-100 align-middle mx-1 ml-3" /> only 1 free — book them early{' '}
            <span className="ml-3">Blank: nobody has marked that day yet.</span>
          </p>

          {openDay && (
            <DayDetail
              date={openDay}
              people={people}
              slots={(data.slots || []).filter((s) => s.date === openDay)}
              shoots={shoots.filter((s) => s.date === openDay)}
              win={win}
              canPost={canManage && openDay >= data.today}
              onPost={() => onPost(openDay, win)}
              onClose={() => setOpenDay(null)}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

function DayDetail({ date, people, slots, shoots = [], win, canPost, onPost, onClose }) {
  const rows = people.map((p) => {
    const mine = slots.filter((s) => s.user_id === p.id);
    return { person: p, slots: mine, fits: covers(mine, win) };
  });
  rows.sort((a, b) => Number(b.fits) - Number(a.fits) || b.slots.length - a.slots.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Who's free on ${dayLabel(date)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">{dayLabel(date)}</h2>
            <p className="text-xs text-slate-500">
              {win.key === 'any' ? 'Free at any time this day' : `Free for the whole ${win.label.toLowerCase()} (${fmtRange(win)})`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        {rows.map(({ person, slots: s, fits }) => (
          <div key={person.id} className={`rounded-xl border px-3 py-2.5 ${fits ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-bold ${fits ? 'text-slate-900' : 'text-slate-400'}`}>{person.name}</p>
              <KindBadge kind={person.kind} />
            </div>
            <p className={`text-xs mt-0.5 ${s.length ? 'text-emerald-800 font-semibold' : 'text-slate-400'}`}>
              {s.length ? s.map((x) => fmtRange(x) + (x.note ? ` (${x.note})` : '')).join(' · ') : person.submitted_at ? 'Not free' : 'Not marked yet'}
            </p>
            {person.areas && <p className="text-[11px] text-slate-400 mt-0.5">Covers: {person.areas}</p>}
          </div>
        ))}
        {shoots.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Shoots this day</p>
            {shoots.map((s) => (
              <p key={s.id} className="text-xs text-slate-700">
                <b>{fmtRange(s)}</b> · {s.client_name} · {s.title} ·{' '}
                <span className={s.status === 'booked' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                  {s.crew.length ? s.crew.map((c) => c.name).join(', ') : 'open'}
                </span>
              </p>
            ))}
          </div>
        )}
        {canPost && (
          <button type="button" onClick={onPost} className={`${btnPrimary} w-full`}>
            <Plus className="w-4 h-4" /> Post a shoot on {dayLabel(date)}
            {win.start ? ` (${fmtRange(win)})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function Team({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await shootsService.getVideographers({ month });
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load videographers'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageState loading={loading && !data} error={error} onRetry={load}>
      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {longMonth(month)} availability is due by <b className="text-slate-700">{fmtDate(data.due_date)}</b>.
            </p>
            {data.can_manage && (
              <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
                <UserPlus className="w-4 h-4" /> Add videographer
              </button>
            )}
          </div>

          {!data.videographers.length ? (
            <Empty icon={Users} title="No videographers yet" text="Add an in-house shooter or invite a freelancer — they get a login with only their availability calendar." />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.videographers.map((v) => (
                <div key={v.id} className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${v.is_active ? '' : 'opacity-50'}`}>
                  <div className="min-w-0 md:flex-1 md:min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-slate-900">{v.name}</p>
                      <KindBadge kind={v.kind} />
                      {v.invite_pending && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                          Invite not accepted
                        </span>
                      )}
                      {!v.is_active && <span className="text-[10px] font-bold uppercase text-slate-400">Inactive</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {v.email}
                      {v.phone ? ` · ${v.phone}` : ''}
                      {v.rate_amount != null ? ` · ₹${v.rate_amount.toLocaleString('en-IN')} per ${v.rate_unit}` : ''}
                    </p>
                    {(v.kit || v.areas) && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {[v.kit && `Kit: ${v.kit}`, v.areas && `Areas: ${v.areas}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center md:justify-end gap-x-3 gap-y-1.5">
                    <span className={`text-xs font-bold inline-flex items-center gap-1 ${v.submitted_at ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {v.submitted_at ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      {v.free_days} free day{v.free_days === 1 ? '' : 's'}
                      {v.submitted_at ? ' · done' : ' · not done'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500" title="All-time track record">
                      {v.reliability != null && (
                        <span
                          className={`mr-1.5 px-1.5 py-0.5 rounded font-black ${v.reliability >= 90 ? 'bg-emerald-100 text-emerald-800' : v.reliability >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}
                          title="Reliability: shoots done ÷ (done + no-shows + drops)"
                        >
                          {v.reliability}% reliable
                        </span>
                      )}
                      {v.shoots_done} shot
                      {v.no_shows > 0 && <span className="text-red-600 font-bold"> · {v.no_shows} no-show{v.no_shows === 1 ? '' : 's'}</span>}
                      {v.dropped > 0 && <span className="text-amber-700"> · {v.dropped} dropped</span>}
                    </span>
                    {data.can_manage && (
                      <>
                        <Link to={`/shoots/availability?userId=${v.id}&month=${month}`} className={`${btnSecondary} py-1.5 px-3 text-xs`}>
                          <CalendarClock className="w-3.5 h-3.5" /> Availability
                        </Link>
                        <button type="button" onClick={() => setEditing(v)} className={`${btnSecondary} py-1.5 px-3 text-xs`}>
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {adding && <AddVideographerModal onClose={() => setAdding(false)} onAdded={load} />}
          {editing && (
            <EditVideographerModal
              v={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

function ProfileFields({ form, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Rate (₹)</span>
          <input type="number" min="0" value={form.rateAmount ?? ''} onChange={(e) => set('rateAmount', e.target.value)} className={inputCls} placeholder="e.g. 3000" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Per</span>
          <select value={form.rateUnit} onChange={(e) => set('rateUnit', e.target.value)} className={inputCls}>
            <option value="shoot">Shoot</option>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">Kit</span>
        <input value={form.kit || ''} onChange={(e) => set('kit', e.target.value)} className={inputCls} placeholder="e.g. Sony A7 IV, gimbal, drone, 2 lights" maxLength={500} />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">Areas they cover</span>
        <input value={form.areas || ''} onChange={(e) => set('areas', e.target.value)} className={inputCls} placeholder="e.g. Chennai city, OMR, Tambaram" maxLength={500} />
      </label>
    </>
  );
}

const profilePayload = (f) => ({
  rateAmount: f.rateAmount === '' || f.rateAmount == null ? null : Number(f.rateAmount),
  rateUnit: f.rateUnit,
  kit: f.kit || null,
  areas: f.areas || null
});

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddVideographerModal({ onClose, onAdded }) {
  const [kind, setKind] = useState('freelance');
  const [form, setForm] = useState({ name: '', email: '', phone: '', userId: '', rateAmount: '', rateUnit: 'shoot', kit: '', areas: '' });
  const [staff, setStaff] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (kind === 'in_house' && !staff.length) {
      shootsService.getCandidates().then((r) => setStaff(r.data.data)).catch(() => {});
    }
  }, [kind, staff.length]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body =
        kind === 'freelance'
          ? { kind, name: form.name, email: form.email, phone: form.phone, ...profilePayload(form) }
          : { kind, userId: Number(form.userId), ...profilePayload(form) };
      const res = await shootsService.addVideographer(body);
      setResult(res.data.data);
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Modal title="Videographer added" onClose={onClose}>
        {result.invite_url ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Send <b>{result.name}</b> this link (WhatsApp or email). They set a password and land on their availability calendar.
              The link works for 7 days.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={result.invite_url} className={`${inputCls} text-xs`} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(result.invite_url).then(() => setCopied(true)).catch(() => {});
                }}
                className={`${btnSecondary} px-3`}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            <b>{result.name}</b> can now open <b>My Shoot Availability</b> from their menu and mark their free days.
          </p>
        )}
        <button type="button" onClick={onClose} className={`${btnPrimary} w-full`}>
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Add videographer" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
        {[
          { key: 'freelance', label: 'Freelancer (new login)' },
          { key: 'in_house', label: 'In-house staff' }
        ].map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`py-2 rounded-lg text-xs font-bold ${kind === k.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'freelance' ? (
        <>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} maxLength={100} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Email (their login)</span>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} maxLength={20} />
          </label>
          <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
            <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Their login only shows their availability calendar and notifications — no clients, tasks or finance.
          </p>
        </>
      ) : (
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Staff member</span>
          <select value={form.userId} onChange={(e) => set('userId', e.target.value)} className={inputCls}>
            <option value="">— Pick someone —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.department ? ` (${s.department})` : ''}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">If their role can't mark availability yet, they also get the Video Executive role.</span>
        </label>
      )}

      <ProfileFields form={form} set={set} />

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="button"
        disabled={saving || (kind === 'freelance' ? !form.name.trim() || !form.email.trim() : !form.userId)}
        onClick={save}
        className={`${btnPrimary} w-full`}
      >
        <UserPlus className="w-4 h-4" /> {kind === 'freelance' ? 'Create login & get invite link' : 'Add as videographer'}
      </button>
    </Modal>
  );
}

function EditVideographerModal({ v, onClose, onSaved }) {
  const [form, setForm] = useState({ rateAmount: v.rate_amount ?? '', rateUnit: v.rate_unit || 'shoot', kit: v.kit || '', areas: v.areas || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));

  const save = async (extra = {}) => {
    setSaving(true);
    setError('');
    try {
      await shootsService.updateVideographer(v.id, { ...profilePayload(form), ...extra });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit ${v.name}`} onClose={onClose}>
      <ProfileFields form={form} set={set} />
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => save({ isActive: !v.is_active })} className={`${btnSecondary} flex-1`}>
          {v.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button type="button" disabled={saving} onClick={() => save()} className={`${btnPrimary} flex-1`}>
          Save
        </button>
      </div>
      {v.is_active && <p className="text-[11px] text-slate-500">Deactivated videographers drop off the "Who's free" view. Their login stays as it is.</p>}
    </Modal>
  );
}
