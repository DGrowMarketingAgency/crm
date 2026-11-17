import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Star, Loader2 } from 'lucide-react';
import { salesService } from '../../services/api';

const SUFFIX = { monthly: '/ month', quarterly: '/ quarter', half_yearly: '/ 6 months', annual: '/ year', one_time: '' };
const inr = (v) => `₹${Math.round(Number(v || 0)).toLocaleString('en-IN')}`;
const errText = (e, f) => e?.response?.data?.error?.message || f;

/** The page a client opens from a shared proposal link. No login. */
export function PublicProposalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    salesService.publicProposal(token).then((r) => {
      setData(r.data);
      const rec = r.data.tiers.find((t) => t.recommended);
      setPicked(rec ? rec.id : null);
    }).catch((e) => setError(errText(e, 'This proposal link is not valid.')));
  }, [token]);

  const decide = async (decision) => {
    setFormError('');
    if (name.trim().length < 2) return setFormError('Please enter your name');
    if (decision === 'accept' && !picked) return setFormError('Please choose a package');
    setBusy(true);
    try {
      const r = await salesService.decideProposal(token, { decision, tierId: decision === 'accept' ? picked : null, name: name.trim(), note: note.trim() || null });
      setData(r.data);
      setDeclining(false);
    } catch (e) {
      setFormError(errText(e, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md"><h1 className="text-lg font-black text-slate-900">Proposal unavailable</h1><p className="text-sm text-slate-500 mt-2">{error}</p></div></div>;
  }
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const { proposal: p, tiers, agency } = data;
  const withdrawn = p.status === 'withdrawn';
  const decided = ['accepted', 'converted', 'rejected'].includes(p.status) || withdrawn;
  const acceptedTier = tiers.find((t) => t.id === p.acceptedTierId);
  const open = !decided && !p.expired;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="font-black text-red-700 text-lg">{agency?.agency_name || 'D-GROW'}</div>
          <div className="text-xs text-slate-500 text-right">{[agency?.phone, agency?.email].filter(Boolean).join(' · ')}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Proposal {p.code}{p.partyName ? ` · for ${p.partyName}` : ''}</p>
          <h1 className="text-3xl font-black mt-1">{p.title}</h1>
          {p.intro && <p className="text-slate-600 mt-3 max-w-3xl whitespace-pre-line">{p.intro}</p>}
          {p.validUntil && !decided && <p className="text-xs text-slate-500 mt-2">Valid until {new Date(`${String(p.validUntil).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        </div>

        {decided && (
          <div role="status" className={`rounded-2xl p-5 border ${p.status === 'rejected' || withdrawn ? 'bg-slate-100 border-slate-200' : 'bg-emerald-50 border-emerald-200'}`}>
            {withdrawn ? <p className="font-bold">This proposal is no longer available. Please contact us for an updated one.</p> : p.status === 'rejected'
              ? <p className="font-bold">You declined this proposal. Thank you for letting us know{p.decidedByName ? `, ${p.decidedByName}` : ''}.</p>
              : <p className="font-bold text-emerald-800">Thank you{p.decidedByName ? `, ${p.decidedByName}` : ''}! You chose the {acceptedTier?.name} package. Our team will contact you shortly.</p>}
          </div>
        )}
        {!decided && p.expired && <div role="status" className="rounded-2xl p-5 border bg-amber-50 border-amber-200 font-bold text-amber-800">This proposal has expired. Please contact us for an updated one.</div>}

        <div className={`grid gap-4 ${tiers.length >= 3 ? 'md:grid-cols-3' : tiers.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {tiers.map((t) => {
            const active = (decided ? p.acceptedTierId : picked) === t.id;
            return (
              <button key={t.id} type="button" disabled={!open} onClick={() => setPicked(t.id)}
                className={`relative text-left bg-white rounded-2xl border-2 p-5 transition-all ${active ? 'border-red-600 shadow-lg' : 'border-slate-200'} ${open ? 'hover:border-red-300' : ''}`}>
                {t.recommended && <span className="absolute -top-3 left-5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-black"><Star className="w-3 h-3" fill="currentColor" /> Recommended</span>}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black">{t.name}</h2>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-red-600 bg-red-600' : 'border-slate-300'}`}>{active && <Check className="w-3 h-3 text-white" />}</span>
                </div>
                <div className="mt-2"><span className="text-3xl font-black">{inr(t.price)}</span> <span className="text-sm text-slate-500">{SUFFIX[p.billingCycle]}</span></div>
                <p className="text-[11px] text-slate-400">{p.gstMode === 'gst' ? '+ 18% GST' : 'No GST'}</p>
                {t.inclusions && (
                  <ul className="mt-4 space-y-1.5">
                    {t.inclusions.split('\n').filter((x) => x.trim()).map((x, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />{x}</li>)}
                  </ul>
                )}
              </button>
            );
          })}
        </div>

        {open && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-xl space-y-3">
            <h2 className="font-black">{declining ? 'Decline this proposal' : 'Accept the selected package'}</h2>
            <label className="block"><span className="text-xs font-bold text-slate-600">Your name *</span>
              <input className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">{declining ? 'Reason (optional)' : 'Message (optional)'}</span>
              <textarea rows={2} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            {formError && <p className="text-sm font-semibold text-red-600" role="alert">{formError}</p>}
            {declining ? (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => decide('reject')} className="px-4 py-2.5 rounded-xl font-bold text-sm bg-slate-800 text-white">Decline proposal</button>
                <button onClick={() => setDeclining(false)} className="px-4 py-2.5 rounded-xl font-bold text-sm border border-slate-200">Back</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button disabled={busy} onClick={() => decide('accept')} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white">
                  Accept {tiers.find((t) => t.id === picked)?.name || 'package'}
                </button>
                <button onClick={() => setDeclining(true)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Not now / decline</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
