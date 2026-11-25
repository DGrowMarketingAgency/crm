import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Clapperboard, MapPin, IndianRupee, Users, CheckCircle2, AlertTriangle, X, Navigation, Phone, CalendarClock, Loader2 } from 'lucide-react';
import { shootsService } from '../../services/api';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { fmtRange, dayLabel, KindBadge } from './shootUi';
import { Modal } from './ShootsTab';
import { useAuth } from '../../hooks/useAuth';

/**
 * For videographers: /shoots/open lists shoots anyone can take (first to accept gets it; client details hidden),
 * /shoots/mine lists shoots they're booked on with the full address and brief.
 */
export default function VideographerShootsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.endsWith('/mine') ? 'mine' : location.pathname.endsWith('/payments') ? 'payments' : 'open';
  // A notice can arrive with the navigation (e.g. "It's yours" after accepting, on the My shoots tab).
  const [notice, setNotice] = useState(location.state?.notice || null);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-red-600" /> Shoots
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Open shoots go to whoever accepts first. Client name, address and brief show once the shoot is yours.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'open', label: 'Open shoots', to: '/shoots/open' },
          { key: 'mine', label: 'My shoots', to: '/shoots/mine' },
          { key: 'payments', label: 'Payments', to: '/shoots/payments' }
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(t.to)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${
              tab === t.key ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold border ${
            notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {tab === 'open' ? (
        <OpenShoots
          onAccepted={(s) => {
            const n = { tone: 'ok', text: `It's yours — ${dayLabel(s.date)}, ${fmtRange(s)}. The address and brief are below.` };
            setNotice(n);
            navigate('/shoots/mine', { state: { notice: n } });
          }}
          onError={(text) => setNotice({ tone: 'error', text })}
        />
      ) : tab === 'mine' ? (
        <MyShoots onNotice={setNotice} />
      ) : (
        <Payments />
      )}
    </div>
  );
}

function OpenShoots({ onAccepted, onError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await shootsService.getOpenSlots();
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load open shoots'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // shoots get taken — keep the list fresh
    return () => clearInterval(t);
  }, [load]);

  const accept = async (s) => {
    setBusy(true);
    try {
      await shootsService.acceptSlot(s.id);
      setConfirm(null);
      onAccepted(s);
    } catch (err) {
      setConfirm(null);
      onError(errorMessage(err));
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageState loading={loading} error={error} onRetry={load}>
      {data && (
        <div className="space-y-3">
          {!data.active && (
            <p className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              Your videographer profile is paused, so you can't accept shoots right now. Ask the admin.
            </p>
          )}
          {!data.slots.length ? (
            <Empty
              icon={Clapperboard}
              title="No open shoots right now"
              text="When the team posts a shoot at a time you marked free, you'll get a notification. Keep your availability up to date."
              action={
                <Link to="/shoots/availability" className={btnSecondary}>
                  <CalendarClock className="w-4 h-4" /> My availability
                </Link>
              }
            />
          ) : (
            data.slots.map((s) => (
              <div
                key={s.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  s.fits ? 'border-emerald-200' : 'border-slate-100'
                } ${s.clash ? 'opacity-60' : ''}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {dayLabel(s.date)} · {fmtRange(s)}
                    </span>
                    {s.fits && !s.clash && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Fits your availability
                      </span>
                    )}
                    {s.clash && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        Clashes with your shoot
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-700">{s.title}</p>
                  <p className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{s.shoot_type}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {s.area}
                    </span>
                    {s.pay_amount != null && (
                      <span className="inline-flex items-center gap-0.5 font-bold text-slate-700">
                        <IndianRupee className="w-3 h-3" />
                        {s.pay_amount.toLocaleString('en-IN')}
                      </span>
                    )}
                    {s.people_needed > 1 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> {s.spots_left} of {s.people_needed} spots left
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" disabled={!data.active || s.clash || busy} onClick={() => setConfirm(s)} className={`${btnPrimary} shrink-0`}>
                  <CheckCircle2 className="w-4 h-4" /> Accept
                </button>
              </div>
            ))
          )}
        </div>
      )}
      {confirm && (
        <Modal title="Take this shoot?" onClose={() => setConfirm(null)}>
          <p className="text-sm text-slate-600">
            <b>{dayLabel(confirm.date)}, {fmtRange(confirm)}</b> — {confirm.shoot_type} in {confirm.area}
            {confirm.pay_amount != null ? ` · ₹${confirm.pay_amount.toLocaleString('en-IN')}` : ''}.
          </p>
          <p className="text-xs text-slate-500">
            Once you accept it's booked for you and nobody else can take it. You can drop it yourself up to 48 hours before; after that, call the admin.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={btnSecondary}>
              Not now
            </button>
            <button type="button" disabled={busy} onClick={() => accept(confirm)} className={btnPrimary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Yes, it's mine
            </button>
          </div>
        </Modal>
      )}
    </PageState>
  );
}

function MyShoots({ onNotice }) {
  const { user } = useAuth();
  const [footageFor, setFootageFor] = useState(null);
  const [scope, setScope] = useState('upcoming');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await shootsService.getMySlots({ scope });
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your shoots'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          ['upcoming', 'Upcoming'],
          ['past', 'Past']
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setScope(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              scope === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <PageState loading={loading && !data} error={error} onRetry={load}>
        {data &&
          (!data.slots.length ? (
            <Empty icon={Clapperboard} title={scope === 'upcoming' ? 'No shoots booked yet' : 'No past shoots'} text={scope === 'upcoming' ? 'Accept one from Open shoots.' : undefined} />
          ) : (
            data.slots.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">
                    {dayLabel(s.date)} · {fmtRange(s)}
                  </span>
                  {s.pay_amount != null && <span className="text-sm font-black text-emerald-700">₹{s.pay_amount.toLocaleString('en-IN')}</span>}
                </div>
                <p className="text-sm font-bold text-slate-700">
                  {s.title} <span className="font-semibold text-slate-500">· {s.client_name} · {s.shoot_type}</span>
                </p>
                <div className="text-sm text-slate-600 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                  <span>
                    {s.address || s.area}
                    {s.map_url && (
                      <a href={s.map_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">
                        <Navigation className="w-3 h-3" /> Open map
                      </a>
                    )}
                  </span>
                </div>
                {s.brief && <p className="text-sm text-slate-600 whitespace-pre-line bg-slate-50 rounded-xl px-3 py-2">{s.brief}</p>}
                {s.crew.length > 1 && (
                  <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> With:
                    {s.crew.map((c) => (
                      <span key={c.user_id} className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        {c.name} <KindBadge kind={c.kind} />
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="text-slate-400 hover:text-red-600" aria-label={`Call ${c.name}`}>
                            <Phone className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ))}
                  </p>
                )}
                {/* After the shoot starts: hand in the footage link (completes the project's shoot stage). */}
                {s.started && (() => {
                  const me = s.crew.find((c) => Number(c.user_id) === Number(user?.id));
                  return (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      {me?.footage_url ? (
                        <span className="text-xs font-bold text-sky-800">
                          🎞 Footage handed in{me.footage_at ? ` ${me.footage_at}` : ''} ·{' '}
                          <a href={me.footage_url} target="_blank" rel="noopener noreferrer" className="underline">
                            open link
                          </a>
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-sky-800">Hand in the footage link once you've uploaded it.</span>
                      )}
                      <button type="button" onClick={() => setFootageFor({ slot: s, me })} className={`${btnSecondary} py-1 px-3 text-xs`}>
                        {me?.footage_url ? 'Update link' : 'Hand in footage'}
                      </button>
                      {me?.payout && (
                        <span className={`text-xs font-bold ${me.payout.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                          ₹{me.payout.amount.toLocaleString('en-IN')} {me.payout.status === 'paid' ? `paid ${me.payout.paid_on || ''}` : 'payment pending'}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {scope === 'upcoming' && !s.started && (
                  <div className="pt-1">
                    {s.can_withdraw ? (
                      <button type="button" onClick={() => setDropping(s)} className="text-xs font-bold text-red-600 hover:underline">
                        I can't make it — drop this shoot
                      </button>
                    ) : (
                      <p className="text-xs text-amber-700 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Less than {data.withdraw_hours} hours to go — call the admin if you can't make it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          ))}
      </PageState>
      {footageFor && (
        <FootageModal
          slot={footageFor.slot}
          current={footageFor.me}
          onClose={() => setFootageFor(null)}
          onDone={(handoff) => {
            setFootageFor(null);
            onNotice({
              tone: 'ok',
              text:
                handoff === 'stage_completed'
                  ? 'Footage received — the project moved on to editing. Thanks!'
                  : 'Footage received — the team has been told. Thanks!'
            });
            load();
          }}
        />
      )}
      {dropping && (
        <DropModal
          slot={dropping}
          onClose={() => setDropping(null)}
          onDone={() => {
            setDropping(null);
            onNotice({ tone: 'ok', text: 'Shoot dropped. The admin was told and it is open for others again.' });
            load();
          }}
        />
      )}
    </div>
  );
}

function DropModal({ slot, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Drop this shoot?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        <b>{dayLabel(slot.date)}, {fmtRange(slot)}</b> — {slot.title}. It opens up for other videographers and the admin is told.
      </p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={inputCls} maxLength={255} />
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
              await shootsService.withdrawSlot(slot.id, reason || null);
              onDone();
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
          className={btnPrimary}
        >
          Drop shoot
        </button>
      </div>
    </Modal>
  );
}

function FootageModal({ slot, current, onClose, onDone }) {
  const [url, setUrl] = useState(current?.footage_url || '');
  const [notes, setNotes] = useState(current?.footage_notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Hand in footage" onClose={onClose}>
      <p className="text-sm text-slate-600">
        <b>{slot.title}</b> — {dayLabel(slot.date)}, {fmtRange(slot)}. Paste a shareable link to the folder (Google Drive, Dropbox, WeTransfer…).
      </p>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" className={inputCls} maxLength={1000} aria-label="Footage link" />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for the editor (optional), e.g. 42 clips, 4K, B-roll in /extra"
        className={inputCls}
        maxLength={1000}
        aria-label="Notes for the editor"
      />
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
        <button
          type="button"
          disabled={busy || !/^https?:\/\/\S+$/.test(url.trim())}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const res = await shootsService.submitFootage(slot.id, { url: url.trim(), notes: notes || null });
              onDone(res.data.data.handoff);
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
          className={btnPrimary}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Hand in
        </button>
      </div>
    </Modal>
  );
}

/** A videographer's payment history (freelancers are paid per shoot). */
function Payments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      const res = await shootsService.getMyPayouts();
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your payments'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  return (
    <PageState loading={loading} error={error} onRetry={load}>
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending</p>
              <p className="text-2xl font-black text-amber-800">{rs(data.totals.pending)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Paid</p>
              <p className="text-2xl font-black text-emerald-800">{rs(data.totals.paid)}</p>
            </div>
          </div>
          {!data.payouts.length ? (
            <Empty icon={Clapperboard} title="No payments yet" text="After each shoot you attend, the payment shows here — pending until the team pays it." />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.payouts.map((p) => (
                <div key={p.slot_id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{p.title}</p>
                    <p className="text-xs text-slate-500">
                      {p.client_name} · {dayLabel(p.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">{rs(p.amount)}</p>
                    <p className={`text-xs font-bold ${p.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {p.status === 'paid' ? `Paid ${p.paid_on || ''}${p.payment_mode ? ` · ${p.payment_mode}` : ''}` : 'Pending'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageState>
  );
}
