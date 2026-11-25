import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, Handshake, XCircle, Printer } from 'lucide-react';
import { salesService } from '../../services/api';

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr0 = (v) => `₹${Math.round(Number(v || 0)).toLocaleString('en-IN')}`;
const errText = (e, f) => e?.response?.data?.error?.message || f;
const fmt = (d) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const field = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500';

/** The page a client opens from a quotation link. No login. They can accept, ask to negotiate, or decline. */
export function PublicQuotePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // 'accept' | 'negotiate' | 'reject'
  const [form, setForm] = useState({ name: '', note: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    salesService.publicQuote(token).then((r) => setData(r.data)).catch((e) => setError(errText(e, 'This quotation link is not valid.')));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.name.trim().length < 2) return setFormError('Please enter your name');
    if (mode === 'negotiate' && form.note.trim().length < 2) return setFormError('Tell us what you would like changed');
    setBusy(true);
    try {
      const r = await salesService.publicQuoteDecision(token, { decision: mode, name: form.name.trim(), note: form.note.trim() || null, amount: form.amount === '' ? null : Number(form.amount) });
      setData(r.data);
      setDone(mode === 'accept' ? 'Thank you! Your acceptance is recorded. Our team will contact you to get started.'
        : mode === 'negotiate' ? 'Thanks — we have your request. We will send a revised quotation on this same link.'
          : 'Thank you for letting us know.');
      setMode(null);
    } catch (err) {
      setFormError(errText(err, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6"><p className="text-slate-600 font-semibold">{error}</p></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-6 h-6 animate-spin text-red-600" /></div>;
  const { quote: q, items, totals, rounds, agency } = data;
  const open = ['sent', 'viewed', 'negotiating'].includes(q.status) && !q.expired;
  const revisions = rounds.filter((r) => r.kind === 'revision');

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="text-lg font-black text-red-700">{agency?.agency_name || 'D-GROW Marketing'}</div>
              <div className="text-xs text-slate-500">{[agency?.address, agency?.city].filter(Boolean).join(', ')}</div>
              <div className="text-xs text-slate-500">{[agency?.phone, agency?.email].filter(Boolean).join(' · ')}{agency?.gstin ? ` · GSTIN ${agency.gstin}` : ''}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Quotation</div>
              <div className="font-mono font-black text-slate-900">{q.number}</div>
              <div className="text-xs text-slate-500">Date {fmt(q.quoteDate)}{q.validUntil ? ` · valid till ${fmt(q.validUntil)}` : ''}</div>
              <a href={salesService.publicQuotePrintUrl(token)} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Printer className="w-3.5 h-3.5" /> Download / Print PDF
              </a>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-slate-400">Prepared for</div>
            <div className="text-xl font-black text-slate-900">{q.partyName}</div>
            <div className="text-sm text-slate-600">{q.title}</div>
          </div>
        </header>

        {(done || !open) && (
          <div className={`rounded-2xl p-4 text-sm font-semibold border ${q.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : ['rejected', 'cancelled'].includes(q.status) ?'bg-slate-100 border-slate-200 text-slate-700' : q.expired ? 'bg-red-50 border-red-100 text-red-700' : 'bg-sky-50 border-sky-100 text-sky-800'}`}>
            {done || (q.status === 'approved' ? `Accepted${q.decidedByName ? ` by ${q.decidedByName}` : ''}. Thank you!`
              : q.status === 'rejected' ? 'This quotation was declined.'
                : q.status === 'cancelled' ? 'This quotation is no longer valid. Please contact us for an updated one.'
                : q.expired ? 'This quotation has expired. Please contact us for an updated one.' : '')}
          </div>
        )}
        {q.status === 'negotiating' && !done && <div className="rounded-2xl p-4 text-sm font-semibold border bg-orange-50 border-orange-100 text-orange-800">We have your request to negotiate and will send a revised price here soon.</div>}
        {revisions.length > 0 && <div className="rounded-2xl p-3 text-sm border bg-amber-50 border-amber-100 text-amber-800">Revised quotation (round {revisions[revisions.length - 1].round}){revisions[revisions.length - 1].note ? ` — ${revisions[revisions.length - 1].note}` : ''}</div>}

        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 text-left">
              <th className="px-4 py-3">Service</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Rate</th>
              {q.gstMode === 'gst' && <th className="px-4 py-3 text-right">GST</th>}<th className="px-4 py-3 text-right">Amount</th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-50 align-top">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{it.description}</div>{it.details && <div className="text-xs text-slate-500 whitespace-pre-line">{it.details}</div>}{it.sac && <div className="text-[11px] text-slate-400">SAC {it.sac}</div>}</td>
                  <td className="px-4 py-3 text-right">{it.quantity}</td>
                  <td className="px-4 py-3 text-right">{inr(it.unitPrice)}</td>
                  {q.gstMode === 'gst' && <td className="px-4 py-3 text-right">{it.gstRate}%</td>}
                  <td className="px-4 py-3 text-right font-semibold">{inr(it.unitPrice * it.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 flex justify-end">
            <dl className="w-full sm:w-72 text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{inr(totals.subtotal)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{inr(totals.discount)}</dd></div>}
              {q.gstMode === 'gst' && (totals.igst ? <div className="flex justify-between"><dt className="text-slate-500">IGST</dt><dd>{inr(totals.igst)}</dd></div> : (
                <><div className="flex justify-between"><dt className="text-slate-500">CGST</dt><dd>{inr(totals.cgst)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">SGST</dt><dd>{inr(totals.sgst)}</dd></div></>
              ))}
              {totals.roundOff !== 0 && <div className="flex justify-between"><dt className="text-slate-500">Round off</dt><dd>{inr(totals.roundOff)}</dd></div>}
              <div className="flex justify-between text-lg font-black border-t border-slate-100 pt-2"><dt>Total</dt><dd className="text-emerald-700">{inr0(totals.total)}</dd></div>
              {q.gstMode !== 'gst' && <div className="text-[11px] text-slate-400 text-right">No GST</div>}
            </dl>
          </div>
        </section>

        {q.terms && <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"><h2 className="font-black text-slate-900 mb-1">Terms</h2><p className="text-sm text-slate-600 whitespace-pre-line">{q.terms}</p></section>}

        {open && !done && (
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            {!mode ? (
              <div className="grid sm:grid-cols-3 gap-2">
                <button className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center justify-center gap-2" onClick={() => setMode('accept')}><CheckCircle2 className="w-5 h-5" /> Accept</button>
                {q.status !== 'negotiating' && <button className="px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 font-bold inline-flex items-center justify-center gap-2" onClick={() => setMode('negotiate')}><Handshake className="w-5 h-5" /> Ask to negotiate</button>}
                <button className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold inline-flex items-center justify-center gap-2" onClick={() => setMode('reject')}><XCircle className="w-5 h-5" /> Not now</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h2 className="font-black text-slate-900">{mode === 'accept' ? `Accept ${inr0(totals.total)}` : mode === 'negotiate' ? 'Ask for a better price' : 'Decline this quotation'}</h2>
                <label className="block"><span className="text-xs font-bold text-slate-600">Your name *</span><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                {mode === 'negotiate' && (
                  <label className="block"><span className="text-xs font-bold text-slate-600">Your budget ₹ (optional)</span><input type="number" min="0" className={field} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
                )}
                <label className="block"><span className="text-xs font-bold text-slate-600">{mode === 'negotiate' ? 'What would you like changed? *' : 'Message (optional)'}</span>
                  <textarea rows={3} className={field} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                {formError && <p className="text-sm font-semibold text-red-600" role="alert">{formError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600" onClick={() => setMode(null)}>Back</button>
                  <button className={`px-4 py-2.5 rounded-xl text-white font-bold ${mode === 'accept' ? 'bg-emerald-600' : mode === 'negotiate' ? 'bg-orange-600' : 'bg-slate-700'}`} disabled={busy}>
                    {busy ? 'Sending…' : mode === 'accept' ? 'Confirm acceptance' : mode === 'negotiate' ? 'Send request' : 'Decline'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
