import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, Plus, Trash2, Loader2, CheckCircle2, XCircle, Hourglass, Undo2, MapPin, MessageSquare } from 'lucide-react';
import { shootsService, calendarService } from '../../services/api';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { fmtRange, dayLabel } from './shootUi';
import { Modal, SHOOT_TYPES } from './ShootsTab';

const STATUS = {
  pending: { label: 'Waiting for client', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Hourglass },
  accepted: { label: 'Date picked', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  declined: { label: 'None worked', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: Undo2 }
};

/** Shoot dates offered to clients: they pick one in their portal and the shoot is posted for videographers. */
export function ProposalsTab({ canManage }) {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await shootsService.getProposals();
      setList(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load client requests'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async (p) => {
    if (!window.confirm(`Withdraw "${p.title}"? The client won't be able to pick a date any more.`)) return;
    try {
      await shootsService.withdrawProposal(p.id);
      load();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  };

  return (
    <PageState loading={loading && !list} error={error} onRetry={load}>
      {list && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 max-w-xl">
              Offer the client 2–3 dates where videographers are free. They pick one in their portal and the shoot is posted for videographers automatically.
            </p>
            {canManage && (
              <button type="button" onClick={() => setCreating(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Propose dates to client
              </button>
            )}
          </div>
          {notice && <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{notice}</p>}

          {!list.length ? (
            <Empty icon={CalendarCheck2} title="No date requests yet" text="Propose shoot dates to a client — they'll get a notification and pick one from their portal." />
          ) : (
            list.map((p) => {
              const st = STATUS[p.status] || STATUS.pending;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{p.client_name}</span>
                      <span className="text-sm font-bold text-slate-700">{p.title}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${st.cls}`}>
                        <st.icon className="w-3 h-3" /> {st.label}
                      </span>
                    </div>
                    {canManage && p.status === 'pending' && (
                      <button type="button" onClick={() => withdraw(p)} className="text-xs font-bold text-slate-500 hover:text-red-600">
                        Withdraw
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {p.area} · {p.shoot_type} · proposed by {p.proposed_by || '—'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {p.options.map((o) => {
                      const chosen = p.chosen_option_id === o.id;
                      return (
                        <span
                          key={o.id}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            chosen ? 'bg-emerald-600 text-white border-emerald-600' : o.still_possible ? 'bg-white text-slate-700 border-slate-200' : 'bg-slate-50 text-slate-400 border-slate-100 line-through'
                          }`}
                        >
                          {chosen && '✓ '}
                          {dayLabel(o.date)}, {fmtRange(o)}
                        </span>
                      );
                    })}
                  </div>
                  {p.client_note && (
                    <p className="text-xs text-slate-600 inline-flex items-start gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-slate-400" /> Client: “{p.client_note}”
                    </p>
                  )}
                  {p.status === 'accepted' && <p className="text-xs font-semibold text-emerald-700">The shoot is posted — see the Shoots tab.</p>}
                </div>
              );
            })
          )}

          {creating && (
            <ProposeModal
              onClose={() => setCreating(false)}
              onSaved={(n) => {
                setCreating(false);
                setNotice(
                  n
                    ? `Sent. ${n} client login${n === 1 ? ' was' : 's were'} notified to pick a date.`
                    : 'Saved — but this client has no active portal login, so nobody was notified. Share the dates with them directly.'
                );
                load();
              }}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

const emptyOption = () => ({ date: '', start: '10:00', end: '13:00' });

function ProposeModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ clientId: '', title: '', shootType: 'Reels', area: '', address: '', mapUrl: '', brief: '', payAmount: '', peopleNeeded: 1, message: '' });
  const [options, setOptions] = useState([emptyOption(), emptyOption()]);
  const [free, setFree] = useState({});
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    calendarService.getFilterOptions().then((r) => setClients(r.data.data?.clients || [])).catch(() => {});
  }, []);

  // Live "who's free" for every option.
  const key = options.map((o) => `${o.date}|${o.start}|${o.end}`).join(',');
  useEffect(() => {
    const t = setTimeout(() => {
      options.forEach((o, i) => {
        if (!o.date || o.start >= o.end) return;
        shootsService
          .whoIsFree({ date: o.date, start: o.start, end: o.end })
          .then((r) => setFree((f) => ({ ...f, [i]: r.data.data })))
          .catch(() => {});
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const valid = form.clientId && form.title.trim().length >= 2 && form.area.trim().length >= 2 && options.length && options.every((o) => o.date && o.start < o.end);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await shootsService.createProposal({
        clientId: Number(form.clientId),
        title: form.title,
        shootType: form.shootType,
        area: form.area,
        address: form.address || null,
        mapUrl: form.mapUrl || null,
        brief: form.brief || null,
        payAmount: form.payAmount === '' ? null : Number(form.payAmount),
        peopleNeeded: Number(form.peopleNeeded) || 1,
        message: form.message || null,
        options
      });
      onSaved(res.data.data.client_logins_notified);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal title="Propose shoot dates to the client" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-3">
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
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Title (client + videographers see it)</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. December reels shoot" maxLength={255} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Type</span>
          <select value={form.shootType} onChange={(e) => set('shootType', e.target.value)} className={inputCls}>
            {SHOOT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <div className="md:col-span-2 space-y-2">
          <p className="text-xs font-bold text-slate-600">Date options (the client picks one)</p>
          {options.map((o, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-500 w-16">Option {i + 1}</span>
                <input type="date" value={o.date} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={`${inputCls} w-40 py-1.5`} aria-label={`Option ${i + 1} date`} />
                <input type="time" value={o.start} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={`${inputCls} w-28 py-1.5`} aria-label={`Option ${i + 1} from`} />
                <span className="text-slate-400">–</span>
                <input type="time" value={o.end} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={`${inputCls} w-28 py-1.5`} aria-label={`Option ${i + 1} to`} />
                {options.length > 1 && (
                  <button type="button" onClick={() => { setOptions((os) => os.filter((_, j) => j !== i)); setFree({}); }} className="text-slate-400 hover:text-red-600" aria-label={`Remove option ${i + 1}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {o.date && o.start < o.end && (
                <p className={`text-[11px] font-bold ${free[i]?.length ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {free[i] === undefined ? (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> checking…
                    </span>
                  ) : free[i].length ? (
                    `${free[i].length} videographer${free[i].length === 1 ? '' : 's'} free: ${free[i].map((p) => p.name).join(', ')}`
                  ) : (
                    'Nobody has marked this time free — better to offer another date'
                  )}
                </p>
              )}
            </div>
          ))}
          {options.length < 3 && (
            <button type="button" onClick={() => setOptions((os) => [...os, emptyOption()])} className="text-xs font-bold text-red-600 hover:underline inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add another option
            </button>
          )}
        </div>

        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Message to the client (optional)</span>
          <input value={form.message} onChange={(e) => set('message', e.target.value)} className={inputCls} maxLength={1000} placeholder="e.g. Please keep the doctor free for 1 hour on the day." />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Area</span>
          <input value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} placeholder="e.g. T Nagar" maxLength={150} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Pay for the shoot (₹, internal)</span>
          <input type="number" min="0" value={form.payAmount} onChange={(e) => set('payAmount', e.target.value)} className={inputCls} />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Full address (internal)</span>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} maxLength={500} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Map link</span>
          <input value={form.mapUrl} onChange={(e) => set('mapUrl', e.target.value)} className={inputCls} maxLength={500} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Videographers needed</span>
          <input type="number" min="1" max="10" value={form.peopleNeeded} onChange={(e) => set('peopleNeeded', e.target.value)} className={inputCls} />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Brief / shot list (internal)</span>
          <textarea value={form.brief} onChange={(e) => set('brief', e.target.value)} rows={2} className={inputCls} maxLength={5000} />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">The client sees the title, type, area, your message and the date options — not pay, address or brief.</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
        <button type="button" disabled={saving || !valid} onClick={save} className={btnPrimary}>
          <CalendarCheck2 className="w-4 h-4" /> Send to client
        </button>
      </div>
    </Modal>
  );
}
