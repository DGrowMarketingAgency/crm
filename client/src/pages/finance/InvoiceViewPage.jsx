import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Printer, Pencil, Send, Ban, IndianRupee, X, CopyPlus } from 'lucide-react';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { Breadcrumbs, PageState, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr, todayLocal, INVOICE_TYPES, INVOICE_STATUS } from './gstMath';

const METHODS = [['upi', 'UPI (GPay / PhonePe / Paytm)'], ['bank_transfer', 'Bank transfer (NEFT / IMPS)'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['card', 'Card'], ['other', 'Other']];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-12">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InvoiceViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const can = (p) => isOwner || hasPermission(p);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ amount: '', paymentDate: todayLocal(), paymentMethod: 'upi', transactionReference: '', notes: '' });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [frameKey, setFrameKey] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await financeService.getInvoice(id);
      setDoc(res.data);
      setFrameKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err, 'Could not load invoice'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, after) => {
    setBusy(true);
    setActionError('');
    try {
      const res = await fn();
      after?.(res);
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const inv = doc?.invoice;
  const legacy = inv && !inv.invoice_type;
  const balance = Number(inv?.outstanding_balance || 0);
  const [statusLabel, statusCls] = inv ? INVOICE_STATUS[inv.status] || [inv.status, ''] : ['', ''];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'GST Invoices', to: '/finance/invoices' }, { label: inv ? (inv.status === 'draft' ? 'Draft invoice' : inv.invoice_number) : '…' }]} />
      <PageState loading={loading} error={error} onRetry={load}>
        {inv && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {inv.invoice_type && <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${INVOICE_TYPES[inv.invoice_type].badge}`}>{inv.invoice_type} · {INVOICE_TYPES[inv.invoice_type].label}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusCls}`}>{statusLabel}</span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 mt-1 font-mono">{inv.status === 'draft' ? 'Draft — number on issue' : inv.invoice_number}</h1>
                <p className="text-sm text-slate-500">
                  {inv.client_company || inv.client_name} · {fmtDate(inv.invoice_date)} · Due {fmtDate(inv.due_date)}
                  {inv.project_name && <> · <Link to={`/flow-projects/${inv.project_id}`} className="hover:text-red-600">{inv.project_name}</Link></>}
                </p>
                {inv.status === 'void' && <p className="text-sm font-semibold text-red-700 mt-1">Cancelled by credit note {inv.credit_note_number}{inv.cancel_reason ? ` — ${inv.cancel_reason}` : ''}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="text-right mr-2">
                  <div className="text-[11px] font-bold uppercase text-slate-400">Total</div>
                  <div className="text-xl font-black">{inr(inv.total_amount)}</div>
                  {inv.status !== 'draft' && inv.status !== 'void' && <div className={`text-xs font-bold ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{balance > 0 ? `Balance ${inr(balance)}` : 'Fully paid'}</div>}
                </div>
                {inv.status === 'draft' && !legacy && can('invoices.create') && <button className={btnSecondary} onClick={() => navigate(`/finance/invoices/${id}/edit`)}><Pencil className="w-4 h-4" /> Edit</button>}
                {inv.status === 'draft' && !legacy && can('invoices.issue') && (
                  <button className={btnPrimary} disabled={busy} onClick={() => window.confirm(`Issue this invoice for ${inr(inv.total_amount)} to ${inv.client_name}? It gets the next ${inv.invoice_type} number and can no longer be edited — only cancelled with a credit note.`) && act(() => financeService.issueInvoice(id), (r) => { setDoc(r.data); setFrameKey((k) => k + 1); setNotice(`Issued as ${r.data.invoice.invoice_number}.`); })}>
                    <Send className="w-4 h-4" /> Issue invoice
                  </button>
                )}
                {['issued', 'partially_paid', 'overdue'].includes(inv.status) && can('payments.record') && (
                  <button className={btnPrimary} onClick={() => { setPay((p) => ({ ...p, amount: balance })); setPaying(true); }}><IndianRupee className="w-4 h-4" /> Record payment</button>
                )}
                {!legacy && <a className={btnSecondary} href={financeService.printUrl(id)} target="_blank" rel="noreferrer"><Printer className="w-4 h-4" /> Print / PDF</a>}
                {!legacy && can('invoices.create') && (
                  <button className={btnSecondary} disabled={busy} title="Copy into a new draft (to correct an issued invoice: cancel it, then duplicate)"
                    onClick={() => act(() => financeService.duplicateInvoice(id), (r) => navigate(`/finance/invoices/${r.data.invoice.id}/edit`))}>
                    <CopyPlus className="w-4 h-4" /> Duplicate
                  </button>
                )}
                {inv.status !== 'void' && !legacy && can('invoices.void') && (
                  <button className={`${btnSecondary} !text-red-600`} onClick={() => setCancelling(true)}><Ban className="w-4 h-4" /> {inv.status === 'draft' ? 'Delete draft' : 'Cancel'}</button>
                )}
              </div>
            </div>

            {notice && <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>}
            {actionError && <div role="alert" className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</div>}
            {legacy && <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">This invoice was created in the older billing screen without GST details. Open it from Quotations & Invoices to print it.</div>}

            <div className="grid xl:grid-cols-[1fr_320px] gap-4">
              {!legacy && (
                <iframe key={frameKey} title="Invoice preview" src={financeService.printUrl(id)} className="w-full h-[900px] bg-white rounded-2xl border border-slate-100 shadow-sm" />
              )}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-fit">
                <h2 className="font-black text-slate-900 mb-3">Payments</h2>
                {doc.payments.length === 0 ? (
                  <p className="text-sm text-slate-400">No payments recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {doc.payments.map((p) => {
                      const reversed = p.payment_status === 'reversed';
                      return (
                        <li key={p.id} className={`rounded-xl px-3 py-2 text-sm ${reversed ? 'bg-red-50/60' : 'bg-slate-50'}`}>
                          <div className="flex justify-between font-bold">
                            <span className={reversed ? 'line-through text-slate-400' : ''}>{inr(p.amount)}</span>
                            <span className="text-xs text-slate-500">{fmtDate(p.payment_date)}</span>
                          </div>
                          <div className="text-xs text-slate-500">{(METHODS.find(([k]) => k === p.payment_method) || [, p.payment_method])[1]}{p.transaction_reference ? ` · ${p.transaction_reference}` : ''}</div>
                          <div className="text-[11px] text-slate-400">Recorded by {p.recorded_by_name}</div>
                          {reversed && <div className="text-[11px] font-bold text-red-700 mt-0.5">Reversed{p.reversed_by_name ? ` by ${p.reversed_by_name}` : ''}{p.reversal_reason ? ` — ${p.reversal_reason}` : ''}</div>}
                          {!reversed && inv.status !== 'void' && can('payments.record') && (
                            <button className="text-[11px] font-bold text-red-600 hover:underline mt-1" disabled={busy} onClick={() => {
                              const reason = window.prompt(`Reverse this ${inr(p.amount)} payment? It stays on record as reversed and the balance goes back up.\n\nReason (e.g. cheque bounced, wrong amount):`, '');
                              if (reason === null) return;
                              if (reason.trim().length < 3) { window.alert('Please give a reason (at least 3 characters).'); return; }
                              act(() => financeService.reversePayment(id, p.id, reason.trim()), (r) => { setDoc(r.data); setFrameKey((k) => k + 1); setNotice('Payment reversed. The balance is updated.'); });
                            }}>Reverse payment</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </PageState>

      {paying && inv && (
        <Modal title="Record payment" onClose={() => setPaying(false)}>
          <form className="p-5 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => financeService.recordPayment(id, { ...pay, amount: Number(pay.amount) }), () => {});
            if (ok) { setPaying(false); setNotice('Payment recorded.'); load(); }
          }}>
            <p className="text-sm text-slate-500">Balance due: <b className="text-slate-900">{inr(balance)}</b></p>
            <label className="block"><span className="text-xs font-bold text-slate-600">Amount ₹ *</span>
              <input type="number" min="0.01" step="0.01" max={balance} required className={inputCls} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Payment date *</span>
              <input type="date" required className={inputCls} value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Mode</span>
              <select className={inputCls} value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Reference / UTR / cheque no.</span>
              <input className={inputCls} value={pay.transactionReference} onChange={(e) => setPay({ ...pay, transactionReference: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Notes</span>
              <input className={inputCls} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></label>
            {actionError && <p className="text-sm font-semibold text-red-600" role="alert">{actionError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnSecondary} onClick={() => setPaying(false)}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={busy}>Save payment</button>
            </div>
          </form>
        </Modal>
      )}

      {cancelling && inv && (
        <Modal title={inv.status === 'draft' ? 'Delete draft?' : 'Cancel invoice'} onClose={() => setCancelling(false)}>
          <form className="p-5 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() => financeService.cancelInvoice(id, inv.status === 'draft' ? 'Draft deleted' : reason), (r) => {
              if (r.data.deleted) navigate('/finance/invoices');
              else { setNotice(`Cancelled. Credit note ${r.data.creditNote} issued.`); }
            });
            if (ok) { setCancelling(false); if (inv.status !== 'draft') load(); }
          }}>
            <p className="text-sm text-slate-600">
              {inv.status === 'draft'
                ? 'The draft has no invoice number yet, so it is deleted.'
                : `Issued invoices are never deleted. A credit note is issued for ${inr(inv.total_amount)} and the invoice is marked cancelled. Invoices with payments must have them reversed first.`}
            </p>
            {inv.status !== 'draft' && (
              <label className="block"><span className="text-xs font-bold text-slate-600">Reason *</span>
                <textarea rows={2} required minLength={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Raised against the wrong client" /></label>
            )}
            {actionError && <p className="text-sm font-semibold text-red-600" role="alert">{actionError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnSecondary} onClick={() => setCancelling(false)}>Keep invoice</button>
              <button type="submit" className={`${btnPrimary} !bg-red-700`} disabled={busy}>{inv.status === 'draft' ? 'Delete draft' : 'Cancel with credit note'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
