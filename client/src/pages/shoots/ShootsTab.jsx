import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clapperboard, Plus, MapPin, IndianRupee, Users, X, UserPlus, Ban, Pencil, Loader2, CheckCircle2 } from 'lucide-react';
import { shootsService, calendarService } from '../../services/api';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { fmtRange, longMonth, dayLabel, KindBadge } from './shootUi';

export const SHOOT_TYPES = ['Reels', 'Photo', 'Product', 'Event', 'Interview', 'Other'];

export const STATUS = {
  open: { label: 'Open', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  booked: { label: 'Booked', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  completed: { label: 'Done', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
};

export function StatusPill({ slot }) {
  const s = STATUS[slot.status] || STATUS.open;
  const label = slot.status === 'open' && slot.people_needed > 1 ? `Open · ${slot.spots_left} of ${slot.people_needed} left` : s.label;
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${s.cls}`}>{label}</span>;
}

const rupees = (n) => (n == null ? null : `₹${Number(n).toLocaleString('en-IN')}`);

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-5 space-y-4 max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
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

/** The month's shoots for managers: post, assign, edit, cancel. */
export function ShootsTab({ month, canManage, newShootSeed, onSeedUsed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // {} = new, slot = edit
  const [assigning, setAssigning] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await shootsService.getSlots({ month });
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load shoots'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (newShootSeed) {
      setEditing(newShootSeed);
      onSeedUsed?.();
    }
  }, [newShootSeed, onSeedUsed]);

  const slots = useMemo(() => (data?.slots || []).filter((s) => filter === 'all' || s.status === filter), [data, filter]);
  const byDate = useMemo(() => {
    const m = {};
    slots.forEach((s) => (m[s.date] = m[s.date] || []).push(s));
    return Object.entries(m);
  }, [slots]);
  const counts = useMemo(() => {
    const c = { all: 0, open: 0, booked: 0, completed: 0, cancelled: 0 };
    (data?.slots || []).forEach((s) => {
      c.all += 1;
      c[s.status] = (c[s.status] || 0) + 1;
    });
    return c;
  }, [data]);

  const mark = async (slot, person, attendance) => {
    try {
      await shootsService.markAttendance(slot.id, person.user_id, attendance);
      setNotice(attendance === 'attended' ? `${person.name} marked as attended.` : `${person.name} marked as a no-show — it counts on their record.`);
      load();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  };

  const removeCrew = async (slot, person) => {
    if (!window.confirm(`Take ${person.name} off this shoot? The slot reopens and free videographers are told.`)) return;
    try {
      await shootsService.unassignSlot(slot.id, person.user_id);
      setNotice(`${person.name} removed — the shoot is open again.`);
      load();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  };

  return (
    <PageState loading={loading && !data} error={error} onRetry={load}>
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All'],
                ['open', 'Open'],
                ['booked', 'Booked'],
                ['completed', 'Done'],
                ['cancelled', 'Cancelled']
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    filter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {label} <span className="opacity-60">{counts[k] || 0}</span>
                </button>
              ))}
            </div>
            {canManage && (
              <button type="button" onClick={() => setEditing({})} className={btnPrimary}>
                <Plus className="w-4 h-4" /> New shoot
              </button>
            )}
          </div>

          {notice && (
            <div className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold border bg-emerald-50 text-emerald-800 border-emerald-100">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!byDate.length ? (
            <Empty
              icon={Clapperboard}
              title={`No shoots ${filter === 'all' ? '' : `${filter} `}in ${longMonth(month)}`}
              text="Post a shoot once the client approves the date and time. Videographers who marked that time as free are told straight away; the first to accept gets it."
            />
          ) : (
            byDate.map(([date, list]) => (
              <div key={date} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">{dayLabel(date)}</p>
                {list.map((s) => (
                  <div key={s.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{fmtRange(s)}</span>
                          <span className="text-sm font-bold text-slate-700">{s.title}</span>
                          <StatusPill slot={s} />
                        </div>
                        <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-semibold text-slate-700">{s.client_name}</span>
                          <span>{s.shoot_type}</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {s.area}
                          </span>
                          {s.pay_amount != null && (
                            <span className="inline-flex items-center gap-0.5">
                              <IndianRupee className="w-3 h-3" />
                              {Number(s.pay_amount).toLocaleString('en-IN')}
                            </span>
                          )}
                          {s.people_needed > 1 && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" /> {s.people_needed} needed
                            </span>
                          )}
                        </p>
                        {s.status === 'cancelled' && s.cancel_reason && <p className="text-xs text-slate-500">Cancelled: {s.cancel_reason}</p>}
                        {s.project_name && <p className="text-xs text-slate-500">Feeds project: <span className="font-semibold text-slate-700">{s.project_name}</span></p>}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {s.crew.map((p) => (
                            <span key={p.user_id} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                              {p.name}
                              <KindBadge kind={p.kind} />
                              {p.assigned && <span className="text-[10px] font-semibold text-slate-400">assigned</span>}
                              {p.attendance === 'attended' && <span className="text-[10px] font-black text-emerald-700">✓ attended</span>}
                              {p.attendance === 'no_show' && <span className="text-[10px] font-black text-red-600">✗ no-show</span>}
                              {p.footage_url && (
                                <a href={p.footage_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-sky-700 hover:underline" title={p.footage_notes || 'Footage'}>
                                  🎞 footage
                                </a>
                              )}
                              {p.payout && (
                                <span className={`text-[10px] font-black ${p.payout.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                  ₹{p.payout.amount.toLocaleString('en-IN')} {p.payout.status === 'paid' ? 'paid' : 'to pay'}
                                </span>
                              )}
                              {/* After the shoot: mark who turned up */}
                              {canManage && s.ended && !p.attendance && s.status !== 'cancelled' && (
                                <>
                                  <button type="button" onClick={() => mark(s, p, 'attended')} className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-600 text-white" aria-label={`${p.name} attended`}>
                                    Attended
                                  </button>
                                  <button type="button" onClick={() => mark(s, p, 'no_show')} className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white" aria-label={`${p.name} no-show`}>
                                    No-show
                                  </button>
                                </>
                              )}
                              {canManage && !s.ended && s.status !== 'cancelled' && (
                                <button type="button" onClick={() => removeCrew(s, p)} className="text-slate-400 hover:text-red-600 p-0.5" aria-label={`Remove ${p.name}`}>
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          ))}
                          {canManage && s.ended && s.crew.some((p) => !p.attendance) && s.status !== 'cancelled' && (
                            <span className="text-xs font-bold text-amber-700">Shoot is over — mark who attended</span>
                          )}
                          {s.status === 'open' && !s.crew.length && <span className="text-xs text-amber-700 font-semibold">Waiting for a videographer to accept</span>}
                        </div>
                      </div>
                      {canManage && !s.ended && !['cancelled', 'completed'].includes(s.status) && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                          {s.status === 'open' && (
                            <button type="button" onClick={() => setAssigning(s)} className={`${btnSecondary} py-1.5 px-3 text-xs`}>
                              <UserPlus className="w-3.5 h-3.5" /> Assign
                            </button>
                          )}
                          <button type="button" onClick={() => setEditing(s)} className={`${btnSecondary} py-1.5 px-3 text-xs`}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button type="button" onClick={() => setCancelling(s)} className={`${btnSecondary} py-1.5 px-3 text-xs text-red-600`}>
                            <Ban className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          {editing && (
            <ShootFormModal
              slot={editing.id ? editing : null}
              seed={editing.id ? null : editing}
              onClose={() => setEditing(null)}
              onSaved={(msg) => {
                setEditing(null);
                setNotice(msg);
                load();
              }}
            />
          )}
          {assigning && (
            <AssignModal
              slot={assigning}
              onClose={() => setAssigning(null)}
              onDone={(msg) => {
                setAssigning(null);
                setNotice(msg);
                load();
              }}
            />
          )}
          {cancelling && (
            <CancelModal
              slot={cancelling}
              onClose={() => setCancelling(null)}
              onDone={() => {
                setCancelling(null);
                setNotice('Shoot cancelled. Anyone booked was told, and the calendar item is cancelled.');
                load();
              }}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

const blank = { clientId: '', title: '', shootType: 'Reels', date: '', start: '10:00', end: '13:00', area: '', address: '', mapUrl: '', brief: '', payAmount: '', peopleNeeded: 1, clientVisible: true, projectId: '' };

/** New shoot (or edit). Shows, live, who has marked that time as free. */
function ShootFormModal({ slot, seed, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    slot
      ? {
          ...blank,
          clientId: slot.client_id,
          title: slot.title,
          shootType: slot.shoot_type,
          date: slot.date,
          start: slot.start,
          end: slot.end,
          area: slot.area,
          address: slot.address || '',
          mapUrl: slot.map_url || '',
          brief: slot.brief || '',
          payAmount: slot.pay_amount ?? '',
          peopleNeeded: slot.people_needed,
          projectId: slot.project_id || ''
        }
      : { ...blank, ...(seed || {}) }
  );
  const [clients, setClients] = useState([]);
  const [free, setFree] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const locked = Boolean(slot?.crew?.length); // date/time can't move while someone is booked

  useEffect(() => {
    if (!slot) calendarService.getFilterOptions().then((r) => setClients(r.data.data?.clients || [])).catch(() => {});
  }, [slot]);

  // The client's projects this shoot can feed (footage completes the project's "Shoot" stage).
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    if (!form.clientId) {
      setProjects([]);
      return;
    }
    shootsService.getClientProjects(form.clientId).then((r) => setProjects(r.data.data || [])).catch(() => setProjects([]));
  }, [form.clientId]);

  useEffect(() => {
    if (!form.date || !form.start || !form.end || form.start >= form.end) {
      setFree(null);
      return undefined;
    }
    const t = setTimeout(() => {
      shootsService
        .whoIsFree({ date: form.date, start: form.start, end: form.end })
        .then((r) => setFree(r.data.data))
        .catch(() => setFree(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form.date, form.start, form.end]);

  const save = async () => {
    setSaving(true);
    setError('');
    const body = {
      title: form.title,
      shootType: form.shootType,
      date: form.date,
      start: form.start,
      end: form.end,
      area: form.area,
      address: form.address || null,
      mapUrl: form.mapUrl || null,
      brief: form.brief || null,
      payAmount: form.payAmount === '' ? null : Number(form.payAmount),
      peopleNeeded: Number(form.peopleNeeded) || 1,
      projectId: form.projectId ? Number(form.projectId) : null
    };
    try {
      if (slot) {
        if (locked) {
          delete body.date;
          delete body.start;
          delete body.end;
        }
        await shootsService.updateSlot(slot.id, body);
        onSaved('Shoot updated.');
      } else {
        const res = await shootsService.createSlot({ ...body, clientId: Number(form.clientId), clientVisible: form.clientVisible });
        const n = res.data.data.notified?.length || 0;
        onSaved(
          n
            ? `Shoot posted. ${n} videographer${n === 1 ? '' : 's'} free at that time ${n === 1 ? 'was' : 'were'} told — first to accept gets it.`
            : 'Shoot posted. Nobody has marked that time as free yet — you can assign someone directly.'
        );
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const valid = (slot || form.clientId) && form.title.trim().length >= 2 && form.area.trim().length >= 2 && form.date && form.start < form.end;

  return (
    <Modal title={slot ? 'Edit shoot' : 'New shoot'} onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-3">
        {!slot && (
          <label className="block md:col-span-2">
            <span className="text-xs font-bold text-slate-600">Client</span>
            <select value={form.clientId} onChange={(e) => set('clientId', e.target.value)} className={inputCls}>
              <option value="">— Pick a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Title (videographers see this)</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. Clinic reels — doctor intro + walkthrough" maxLength={255} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Type</span>
          <select value={form.shootType} onChange={(e) => set('shootType', e.target.value)} className={inputCls}>
            {SHOOT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Date (client-approved)</span>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} disabled={locked} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">From</span>
          <input type="time" value={form.start} onChange={(e) => set('start', e.target.value)} className={inputCls} disabled={locked} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">To</span>
          <input type="time" value={form.end} onChange={(e) => set('end', e.target.value)} className={inputCls} disabled={locked} />
        </label>
        {locked && <p className="md:col-span-2 text-[11px] text-amber-700 font-semibold">Someone is booked, so the date and time are locked. Remove them first to move the shoot.</p>}

        {/* Live: who has this time free */}
        <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          {!form.date ? (
            <p className="text-xs text-slate-500">Pick a date and time to see who is free.</p>
          ) : free === null ? (
            <p className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking who's free…
            </p>
          ) : free.length ? (
            <div className="space-y-1">
              <p className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {free.length} free for the whole {fmtRange(form)} — they'll be told when you post
              </p>
              <div className="flex flex-wrap gap-1.5">
                {free.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                    {p.name} <KindBadge kind={p.kind} />
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs font-bold text-amber-700">
              Nobody has marked {dayLabel(form.date)}, {fmtRange(form)} as free. Check the "Who's free" tab before confirming this date with the client.
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-600">Area (shown before they accept)</span>
          <input value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} placeholder="e.g. Anna Nagar" maxLength={150} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Pay for this shoot (₹)</span>
          <input type="number" min="0" value={form.payAmount} onChange={(e) => set('payAmount', e.target.value)} className={inputCls} placeholder="e.g. 3000" />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Full address (only the booked videographer sees it)</span>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} maxLength={500} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Map link</span>
          <input value={form.mapUrl} onChange={(e) => set('mapUrl', e.target.value)} className={inputCls} placeholder="https://maps.google.com/…" maxLength={500} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Videographers needed</span>
          <input type="number" min="1" max="10" value={form.peopleNeeded} onChange={(e) => set('peopleNeeded', e.target.value)} className={inputCls} />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Feeds this client project (optional)</span>
          <select value={form.projectId} onChange={(e) => set('projectId', e.target.value)} className={inputCls} disabled={!form.clientId}>
            <option value="">— Not linked —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.shoot_stage ? ` · ${p.shoot_stage} (${p.shoot_stage_status === 'in_progress' ? 'open now' : p.shoot_stage_status})` : ''}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">When the videographer hands in the footage, the project's shoot stage completes and it moves on to editing.</span>
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Brief / shot list (only after booking)</span>
          <textarea value={form.brief} onChange={(e) => set('brief', e.target.value)} rows={3} className={inputCls} maxLength={5000} />
        </label>
        {!slot && (
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.clientVisible} onChange={(e) => set('clientVisible', e.target.checked)} />
            Show the shoot on the client's portal calendar
          </label>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
        <button type="button" disabled={saving || !valid} onClick={save} className={btnPrimary}>
          {slot ? 'Save changes' : (
            <>
              <Clapperboard className="w-4 h-4" /> Post shoot
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

function AssignModal({ slot, onClose, onDone }) {
  const [free, setFree] = useState(null);
  const [all, setAll] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    shootsService.getSlot(slot.id).then((r) => setFree(r.data.data.free_now || [])).catch(() => setFree([]));
    shootsService.getVideographers({ month: slot.date.slice(0, 7) }).then((r) => setAll((r.data.data.videographers || []).filter((v) => v.is_active && !v.invite_pending))).catch(() => {});
  }, [slot.id, slot.date]);

  const assign = async (v) => {
    setBusy(true);
    setError('');
    try {
      await shootsService.assignSlot(slot.id, v.id);
      onDone(`${v.name} is booked for ${dayLabel(slot.date)}, ${fmtRange(slot)} and has been told.`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const relOf = (id) => all.find((v) => v.id === id)?.reliability ?? null;
  const freeIds = new Set((free || []).map((f) => f.id));
  const crewIds = new Set(slot.crew.map((c) => c.user_id));
  const others = all.filter((v) => !freeIds.has(v.id) && !crewIds.has(v.id));

  return (
    <Modal title={`Assign — ${dayLabel(slot.date)}, ${fmtRange(slot)}`} onClose={onClose}>
      {free === null ? (
        <p className="text-sm text-slate-500 inline-flex items-center gap-1">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Marked this time free</p>
          {free.filter((f) => !crewIds.has(f.id)).length ? (
            free
              .filter((f) => !crewIds.has(f.id))
              .map((v) => (
                <button key={v.id} type="button" disabled={busy} onClick={() => assign(v)} className="w-full flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 hover:bg-emerald-50">
                  <span className="text-sm font-bold text-slate-800">
                    {v.name}
                    {relOf(v.id) != null && <span className="ml-2 text-[11px] font-semibold text-slate-500">{relOf(v.id)}% reliable</span>}
                  </span>
                  <KindBadge kind={v.kind} />
                </button>
              ))
          ) : (
            <p className="text-sm text-slate-500">Nobody has marked this time as free.</p>
          )}
          {others.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-2">Others (not marked free — check with them first)</p>
              {others.map((v) => (
                <button key={v.id} type="button" disabled={busy} onClick={() => assign(v)} className="w-full flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50">
                  <span className="text-sm font-semibold text-slate-600">
                    {v.name}
                    {relOf(v.id) != null && <span className="ml-2 text-[11px] font-semibold text-slate-400">{relOf(v.id)}% reliable</span>}
                  </span>
                  <KindBadge kind={v.kind} />
                </button>
              ))}
            </>
          )}
        </>
      )}
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </Modal>
  );
}

function CancelModal({ slot, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Cancel this shoot?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        <b>{slot.title}</b> — {dayLabel(slot.date)}, {fmtRange(slot)}.{' '}
        {slot.crew.length ? `${slot.crew.map((c) => c.name).join(', ')} will be told.` : 'Nobody is booked yet.'} The calendar item is cancelled too.
      </p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (sent to the videographer), e.g. client rescheduled" className={inputCls} maxLength={255} />
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Keep it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await shootsService.cancelSlot(slot.id, { reason: reason || null });
              onDone();
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
          className={`${btnPrimary}`}
        >
          <Ban className="w-4 h-4" /> Cancel shoot
        </button>
      </div>
    </Modal>
  );
}

export { rupees, Modal };
