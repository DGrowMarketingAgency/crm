import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ReceiptIndianRupee, Plus, Search, Printer, Pencil, CopyPlus, Trash2, Ban } from 'lucide-react';
import { ActionMenu } from '../sales/salesUi';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary } from '../project-flow/flowUi';
import { inr0, INVOICE_TYPES, INVOICE_STATUS } from './gstMath';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function InvoicesRegisterPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission, isOwner } = usePermission();
  const canCreate = isOwner || hasPermission('invoices.create');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filters = {
    search: params.get('search') || '',
    type: params.get('type') || '',
    status: params.get('status') || '',
    month: params.get('month') || '',
    year: params.get('year') || '',
    clientId: params.get('clientId') || ''
  };
  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await financeService.listInvoices(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load invoices'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);
  useEffect(() => { load(); }, [load]);

  const canVoid = isOwner || hasPermission('invoices.void');
  const [msg, setMsg] = useState(null);
  const duplicate = async (inv) => {
    try {
      const r = await financeService.duplicateInvoice(inv.id);
      navigate(`/finance/invoices/${r.data.invoice.id}/edit`);
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
  };
  const removeDraft = async (inv) => {
    if (!window.confirm(`Delete this draft invoice for ${inv.client_name}? It has no invoice number yet, so nothing is lost from your series.`)) return;
    try {
      await financeService.cancelInvoice(inv.id, 'Draft deleted');
      setMsg({ ok: true, text: 'Draft deleted.' });
      load();
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
  };

  const thisYear = new Date().getFullYear();
  const t = data?.totals;
  const cards = t ? [
    ['Billed', inr0(t.billed), 'text-slate-900'],
    ['Collected', inr0(t.collected), 'text-emerald-600'],
    ['Outstanding', inr0(t.outstanding), 'text-amber-600'],
    ['Overdue', inr0(t.overdue), 'text-red-600'],
    ['GST charged', inr0(t.tax), 'text-blue-600']
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><ReceiptIndianRupee className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">GST Invoices</h1>
            <p className="text-sm text-slate-500">Draft, issue and track tax invoices. Cancelled and draft invoices are left out of the totals.</p>
          </div>
        </div>
        {canCreate && <button className={btnPrimary} onClick={() => navigate(`/finance/invoices/new${filters.clientId ? `?clientId=${filters.clientId}` : ''}`)}><Plus className="w-4 h-4" /> New invoice</button>}
      </div>

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {cards.map(([label, value, color]) => (
            <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
              <div className={`text-xl font-black mt-1 ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Invoice no. or client…" defaultValue={filters.search}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('search', e.currentTarget.value.trim())} onBlur={(e) => setFilter('search', e.target.value.trim())} />
        </div>
        <select aria-label="Type" className={`${inputCls} !w-auto`} value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">All types</option>
          {Object.entries(INVOICE_TYPES).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}
          <option value="legacy">Older invoices (no GST type)</option>
        </select>
        <select aria-label="Status" className={`${inputCls} !w-auto`} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(INVOICE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Month" className={`${inputCls} !w-auto`} value={filters.month} onChange={(e) => setFilter('month', e.target.value)}>
          <option value="">All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select aria-label="Year" className={`${inputCls} !w-auto`} value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
          <option value="">All years</option>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {filters.clientId && <button className="text-xs font-bold text-red-600 hover:underline" onClick={() => setFilter('clientId', '')}>Clear client filter</button>}
      </div>

      {msg && <div role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-700"}`}>{msg.text}</div>}
      <PageState loading={loading} error={error} onRetry={load}>
        {data?.invoices.length === 0 ? (
          <Empty icon={ReceiptIndianRupee} title="No invoices match" text="Create a GST invoice, or change the filters." />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[860px]">
              <thead>
                <tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th><th />
                </tr>
              </thead>
              <tbody>
                {data?.invoices.map((inv) => {
                  const [label, cls] = inv.is_overdue ? ['Overdue', INVOICE_STATUS.overdue[1]] : INVOICE_STATUS[inv.status] || [inv.status, ''];
                  return (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5"><Link to={`/finance/invoices/${inv.id}`} className="font-mono font-bold text-slate-800 hover:text-red-600">{inv.status === 'draft' ? 'Draft' : inv.invoice_number}</Link></td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(inv.invoice_date)}<div className="text-[11px] text-slate-400">Due {fmtDate(inv.due_date)}</div></td>
                      <td className="px-4 py-2.5"><div className="font-semibold text-slate-800">{inv.client_name}</div>{inv.project_name && <div className="text-[11px] text-slate-400">{inv.project_name}</div>}</td>
                      <td className="px-4 py-2.5">{inv.invoice_type ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${INVOICE_TYPES[inv.invoice_type].badge}`}>{inv.invoice_type}</span> : <span className="text-[11px] text-slate-400">Older</span>}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{inr0(inv.total_amount)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{Number(inv.amount_paid) ? inr0(inv.amount_paid) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{Number(inv.outstanding_balance) && inv.status !== 'void' ? inr0(inv.outstanding_balance) : '—'}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span></td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end items-center gap-1.5">
                          {inv.status === 'draft' && inv.invoice_type && canCreate
                            ? <Link to={`/finance/invoices/${inv.id}/edit`} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</Link>
                            : <Link to={`/finance/invoices/${inv.id}`} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold">View</Link>}
                          {inv.invoice_type && <a href={financeService.printUrl(inv.id)} target="_blank" rel="noreferrer" className="p-2 inline-flex rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500" title="Print / PDF" aria-label={`Print ${inv.invoice_number}`}><Printer className="w-4 h-4" /></a>}
                          {inv.invoice_type && (
                            <ActionMenu label={`Actions for ${inv.invoice_number}`} items={[
                              { label: 'Duplicate as new draft', icon: CopyPlus, onClick: () => duplicate(inv), hidden: !canCreate },
                              { label: 'Delete draft', icon: Trash2, onClick: () => removeDraft(inv), danger: true, hidden: !(inv.status === 'draft' && canVoid) },
                              { label: 'Cancel with credit note…', icon: Ban, onClick: () => navigate(`/finance/invoices/${inv.id}`), hidden: !(inv.status !== 'draft' && inv.status !== 'void' && canVoid), title: 'Opens the invoice to cancel it' }
                            ]} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageState>
    </div>
  );
}
