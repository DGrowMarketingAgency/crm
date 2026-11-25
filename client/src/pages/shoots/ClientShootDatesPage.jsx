import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, CheckCircle2, XCircle, MapPin, MessageSquare, Loader2, X } from 'lucide-react';
import { shootsService } from '../../services/api';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { fmtRange, dayLabel } from './shootUi';

/** Client portal: pick one of the shoot dates the agency offered (or say none work). */
export default function ClientShootDatesPage() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await shootsService.getClientProposals();
      setList(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your shoot dates'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = (list || []).filter((p) => p.status === 'pending');
  const answered = (list || []).filter((p) => p.status !== 'pending');

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <CalendarCheck2 className="w-6 h-6 text-red-600" /> Shoot Dates
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          We offer dates when our videographers are free. Pick the one that suits you and we lock it in straight away.
        </p>
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

      <PageState loading={loading} error={error} onRetry={load}>
        {list && (
          <>
            {!pending.length ? (
              <Empty icon={CalendarCheck2} title="Nothing to pick right now" text="When we propose dates for your next shoot, they'll show up here and you'll get a notification." />
            ) : (
              pending.map((p) => (
                <PickCard
                  key={p.id}
                  p={p}
                  onDone={(text, tone = 'ok') => {
                    setNotice({ text, tone });
                    load();
                  }}
                />
              ))
            )}

            {answered.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 pt-2">Recently answered</p>
                {answered.map((p) => {
                  const chosen = p.options.find((o) => o.id === p.chosen_option_id);
                  return (
                    <div key={p.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-700">{p.title}</span>
                      {p.status === 'accepted' && chosen ? (
                        <span className="font-bold text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> {dayLabel(chosen.date)}, {fmtRange(chosen)}
                        </span>
                      ) : (
                        <span className="font-bold text-slate-500 inline-flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> None worked — we'll send new dates
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageState>
    </div>
  );
}

function PickCard({ p, onDone }) {
  const open = p.options.filter((o) => o.still_possible);
  const [choice, setChoice] = useState(open[0]?.id || null);
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (body) => {
    setBusy(true);
    setError('');
    try {
      await shootsService.respondProposal(p.id, body);
      if (body.noneWork) onDone("Thanks — we'll send you new dates.");
      else {
        const o = p.options.find((x) => x.id === body.optionId);
        onDone(`Booked: ${dayLabel(o.date)}, ${fmtRange(o)}. It's on your Campaign Calendar.`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 space-y-4">
      <div>
        <p className="text-lg font-black text-slate-900">{p.title}</p>
        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3" /> {p.area} · {p.shoot_type} shoot
        </p>
        {p.message_to_client && (
          <p className="text-sm text-slate-600 mt-2 flex items-start gap-1.5">
            <MessageSquare className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /> {p.message_to_client}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Choose a date</legend>
        {p.options.map((o) => (
          <label
            key={o.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              !o.still_possible ? 'opacity-40 cursor-not-allowed' : choice === o.id ? 'border-red-500 bg-red-50/50 cursor-pointer' : 'border-slate-200 cursor-pointer hover:border-slate-400'
            }`}
          >
            <input type="radio" name={`p-${p.id}`} disabled={!o.still_possible || busy} checked={choice === o.id} onChange={() => setChoice(o.id)} />
            <span className="text-sm font-bold text-slate-800">{dayLabel(o.date)}</span>
            <span className="text-sm text-slate-600">{fmtRange(o)}</span>
            {!o.still_possible && <span className="text-xs text-slate-500">(passed)</span>}
          </label>
        ))}
      </fieldset>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={declining ? 'Tell us what works instead (e.g. any weekday after the 15th)' : 'Note for the team (optional)'} className={inputCls} maxLength={1000} />
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="flex flex-wrap justify-between gap-2">
        {!declining ? (
          <>
            <button type="button" disabled={busy} onClick={() => setDeclining(true)} className={btnSecondary}>
              None of these work
            </button>
            <button type="button" disabled={busy || !choice} onClick={() => send({ optionId: choice, note: note || null })} className={btnPrimary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm this date
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setDeclining(false)} className={btnSecondary}>
              Back
            </button>
            <button type="button" disabled={busy} onClick={() => send({ noneWork: true, note: note || null })} className={btnPrimary}>
              Send — ask for new dates
            </button>
          </>
        )}
      </div>
    </div>
  );
}
