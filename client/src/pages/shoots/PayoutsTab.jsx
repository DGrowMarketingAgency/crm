import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, CheckCircle2, Hourglass, ExternalLink } from 'lucide-react';
import { shootsService } from '../../services/api';
import { PageState, Empty, errorMessage, btnPrimary, btnSecondary, inputCls } from '../project-flow/flowUi';
import { dayLabel, fmtRange } from './shootUi';
import { Modal } from './ShootsTab';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Freelancer payouts: created when a freelancer attends a shoot (or hands in footage); the admin pays them here. */
export function PayoutsTab() {
  const [filter, setFilter] = useState('pending');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const res = await shootsService.getPayouts(filter === 'all' ? {} : { status: filter });
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load payouts'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageState loading={loading && !data} error={error} onRetry={load}>
      {data && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">To pay</p>
              <p className="text-2xl font-black text-amber-800">{rupees(data.totals.pending)}</p>
              <p className="text-xs text-amber-700">{data.totals.pending_count} payout{data.totals.pending_count === 1 ? '' : 's'} waiting</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Paid (all time)</p>
              <p className="text-2xl font-black text-emerald-800">{rupees(data.totals.paid)}</p>
              <p className="text-xs text-emerald-700">Also listed in Expenses & Purchases as “Client Shoot Expense”</p>
            </div>
          </div>

          <div className="flex gap-2">
            {[
              ['pending', 'To pay'],
              ['paid', 'Paid'],
              ['all', 'All']
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  filter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {notice && <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{notice}</p>}

          {!data.payouts.length ? (
            <Empty
              icon={Wallet}
              title={filter === 'pending' ? 'Nothing to pay right now' : 'No payouts yet'}
              text="A payout is created when a freelance videographer attends a shoot that has a pay amount (marked attended, or they hand in footage)."
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.payouts.map((p) => (
                <div key={p.booking_id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      {p.name} <span className="font-bold text-slate-500">· {rupees(p.amount)}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.title} · {p.client_name} · {dayLabel(p.date)}, {fmtRange(p)}
                      {p.footage_url && (
                        <a href={p.footage_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-bold text-sky-700 hover:underline">
                          footage <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </p>
                  </div>
                  {p.status === 'paid' ? (
                    <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-4 h-4" /> Paid {p.paid_on}
                      {p.payment_mode ? ` · ${p.payment_mode}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-amber-700 inline-flex items-center gap-1">
                        <Hourglass className="w-3.5 h-3.5" /> Pending
                      </span>
                      <button type="button" onClick={() => setPaying(p)} className={`${btnPrimary} py-1.5 px-3 text-xs`}>
                        Mark paid
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {paying && (
            <PayModal
              p={paying}
              onClose={() => setPaying(null)}
              onDone={(msg) => {
                setPaying(null);
                setNotice(msg);
                load();
              }}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

function PayModal({ p, onClose, onDone }) {
  const [form, setForm] = useState({ paidDate: today(), paymentMode: 'UPI', reference: '', amount: p.amount });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={`Pay ${p.name}`} onClose={onClose}>
      <p className="text-sm text-slate-600">
        {p.title} · {p.client_name} · {dayLabel(p.date)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
          <input type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Paid on</span>
          <input type="date" value={form.paidDate} onChange={(e) => set('paidDate', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Mode</span>
          <select value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)} className={inputCls}>
            {['UPI', 'Bank transfer', 'Cash', 'Cheque'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Reference</span>
          <input value={form.reference} onChange={(e) => set('reference', e.target.value)} className={inputCls} placeholder="UTR / txn id" maxLength={100} />
        </label>
      </div>
      {Number(form.amount) !== Number(p.amount) && <p className="text-[11px] text-amber-700 font-semibold">Changing the amount from {rupees(p.amount)} (e.g. travel or an extra hour).</p>}
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Close
        </button>
        <button
          type="button"
          disabled={busy || form.amount === '' || !form.paidDate}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const res = await shootsService.payPayout(p.booking_id, {
                paidDate: form.paidDate,
                paymentMode: form.paymentMode,
                reference: form.reference || null,
                amount: Number(form.amount)
              });
              onDone(`Paid ${p.name} ${rupees(res.data.data.amount)} — they were notified.`);
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
          className={btnPrimary}
        >
          <CheckCircle2 className="w-4 h-4" /> Mark paid
        </button>
      </div>
    </Modal>
  );
}
