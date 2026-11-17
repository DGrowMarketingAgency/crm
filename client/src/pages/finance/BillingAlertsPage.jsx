import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Send, RefreshCw } from 'lucide-react';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, errorMessage, fmtDate, btnSecondary } from '../project-flow/flowUi';
import { inr0 } from './gstMath';

function Section({ title, tone, items, render, empty }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className={`font-black ${tone}`}>{title}</h2>
        <span className="text-xs font-bold text-slate-500">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">{empty}</p> : <ul className="divide-y divide-slate-50">{items.map(render)}</ul>}
    </section>
  );
}

const InvoiceRow = (label) => (r) => (
  <li key={r.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <Link to={`/finance/invoices/${r.id}`} className="font-mono font-bold hover:text-red-600 w-24">{r.invoice_number}</Link>
    <span className="font-semibold flex-1 min-w-[160px]">{r.client_name}</span>
    <span className="text-xs text-slate-500 w-40">{label(r)}</span>
    <span className="text-xs text-slate-500 w-36 truncate">{r.account_manager ? `AM: ${r.account_manager}` : 'No account manager'}</span>
    <span className="font-bold w-24 text-right">{inr0(r.outstanding_balance)}</span>
  </li>
);

export function BillingAlertsPage() {
  const { hasPermission, isOwner } = usePermission();
  const canRun = isOwner || hasPermission('finance.settings.manage');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await financeService.alerts()).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load alerts'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setMsg('');
    try {
      const r = await financeService.runReminders();
      setMsg(r.data.sent ? `Sent ${r.data.sent} reminder${r.data.sent === 1 ? '' : 's'}.` : 'Everyone has already been reminded for now.');
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><BellRing className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Billing Alerts</h1>
            <p className="text-sm text-slate-500">Overdue and due invoices, and retainers renewing soon. Reminders go to the invoice owner and the client's account manager every 6 hours.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</button>
          {canRun && <button className={btnSecondary} onClick={run}><Send className="w-4 h-4" /> Send reminders now</button>}
        </div>
      </div>
      {msg && <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800">{msg}</div>}

      <PageState loading={loading} error={error} onRetry={load}>
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[['Overdue', data.overdue.length, 'text-red-600'], ['Overdue amount', inr0(data.totals.overdue), 'text-red-600'],
                ['Due today / in 3 days', data.dueToday.length + data.dueSoon.length, 'text-amber-600'], ['Renewing in 14 days', data.renewals.length, 'text-blue-600']].map(([l, v, c]) => (
                <div key={l} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div><div className={`text-xl font-black mt-1 ${c}`}>{v}</div></div>
              ))}
            </div>
            <Section title="Overdue" tone="text-red-700" items={data.overdue} empty="Nothing overdue." render={InvoiceRow((r) => `${r.days} day${r.days === 1 ? '' : 's'} late (due ${fmtDate(r.due_date)})`)} />
            <Section title="Due today" tone="text-amber-700" items={data.dueToday} empty="Nothing due today." render={InvoiceRow(() => 'Due today')} />
            <Section title="Due in the next 3 days" tone="text-slate-900" items={data.dueSoon} empty="Nothing due soon." render={InvoiceRow((r) => `Due ${fmtDate(r.due_date)}`)} />
            <Section title="Retainers renewing soon" tone="text-blue-700" items={data.renewals}
              empty="No renewals in the next 14 days (the list fills up from the middle of each month)."
              render={(r) => (
                <li key={r.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link to={`/flow-projects/${r.id}`} className="font-semibold hover:text-red-600 flex-1 min-w-[200px]">{r.name}</Link>
                  <span className="text-xs text-slate-500 w-40">{r.client_name}</span>
                  <span className="text-xs text-slate-500 w-36">{r.cycle} in {r.days} day{r.days === 1 ? '' : 's'}</span>
                  {r.retainer_auto_invoice && r.billing_amount
                    ? <span className="text-xs font-bold text-emerald-700 w-44 text-right">Auto-draft {inr0(r.billing_amount)}</span>
                    : <Link to={`/flow-projects/${r.id}`} className="text-xs font-bold text-amber-700 w-44 text-right hover:underline">No monthly fee set →</Link>}
                </li>
              )} />
          </>
        )}
      </PageState>
    </div>
  );
}
