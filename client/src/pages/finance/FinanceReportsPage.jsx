import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { financeService } from '../../services/api';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnSecondary } from '../project-flow/flowUi';
import { inr, inr0, INVOICE_STATUS } from './gstMath';

const TABS = [['sales-register', 'Sales register'], ['gst-summary', 'GST summary'], ['aging', 'Receivables aging'], ['payments', 'Payments received']];
const METHOD = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', card: 'Card', payment_gateway: 'Gateway', other: 'Other' };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function presets() {
  const t = new Date();
  const fyStart = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  const q = Math.floor(((t.getMonth() + 9) % 12) / 3); // FY quarter: Apr–Jun = 0
  const qStartMonth = (3 + q * 3) % 12;
  const qStart = new Date(qStartMonth < 3 ? fyStart + 1 : fyStart, qStartMonth, 1);
  return {
    'This month': [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)],
    'Last month': [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))],
    'This quarter': [ymd(qStart), ymd(t)],
    'This FY': [`${fyStart}-04-01`, ymd(t)]
  };
}

const Th = ({ children, right }) => <th className={`px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400 ${right ? 'text-right' : ''}`}>{children}</th>;
const Td = ({ children, right, bold }) => <td className={`px-3 py-2 ${right ? 'text-right whitespace-nowrap' : ''} ${bold ? 'font-bold' : ''}`}>{children}</td>;
const Card = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className={`text-xl font-black mt-1 ${tone}`}>{value}</div></div>
);
const Table = ({ children, min = 760 }) => <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto"><table className="w-full text-sm text-left" style={{ minWidth: min }}>{children}</table></div>;

export function FinanceReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'sales-register';
  const p = presets();
  const [from, setFrom] = useState(p['This month'][0]);
  const [to, setTo] = useState(p['This month'][1]);
  const [asOf, setAsOf] = useState(ymd(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const query = tab === 'aging' ? { asOf } : { from, to };

  useEffect(() => { setData(null); }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData((await financeService.report(tab, query)).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the report'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, from, to, asOf]);
  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await financeService.reportXlsx(tab, query);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tab}-${tab === 'aging' ? asOf : `${from}-to-${to}`}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Reports & GST</h1>
            <p className="text-sm text-slate-500">Sales register, GST return summary, who owes what, and money received. Export any report to Excel.</p>
          </div>
        </div>
        <button className={btnSecondary} onClick={download} disabled={downloading}><Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Export Excel'}</button>
      </div>

      <div className="flex gap-1 overflow-x-auto bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setParams({ tab: k }, { replace: true })} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-2 items-center">
        {tab === 'aging' ? (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">As of <input type="date" className={`${inputCls} !w-auto`} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        ) : (
          <>
            {Object.entries(p).map(([l, [f, t]]) => (
              <button key={l} onClick={() => { setFrom(f); setTo(t); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${from === f && to === t ? 'bg-red-600 text-white border-red-600' : 'border-slate-200 text-slate-600'}`}>{l}</button>
            ))}
            <input aria-label="From" type="date" className={`${inputCls} !w-auto`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-slate-400">to</span>
            <input aria-label="To" type="date" className={`${inputCls} !w-auto`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>

      <PageState loading={loading && !data} error={error} onRetry={load}>
        {data && tab === 'sales-register' && data.rows && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card label="Invoices" value={`${data.totals.count}${data.totals.cancelled ? ` (+${data.totals.cancelled} cancelled)` : ''}`} />
              <Card label="Taxable value" value={inr0(data.totals.taxable)} />
              <Card label="GST" value={inr0(data.totals.cgst + data.totals.sgst + data.totals.igst)} tone="text-blue-600" />
              <Card label="Billed" value={inr0(data.totals.total)} />
              <Card label="Outstanding" value={inr0(data.totals.outstanding)} tone="text-amber-600" />
            </div>
            {data.rows.length === 0 ? <Empty icon={BarChart3} title="No invoices in this period" /> : (
              <Table min={1000}>
                <thead><tr className="border-b border-slate-100"><Th>Invoice</Th><Th>Date</Th><Th>Client</Th><Th>GSTIN</Th><Th>Place</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={`border-b border-slate-50 ${r.cancelled ? 'text-slate-400 line-through' : ''}`}>
                      <Td><Link to={`/finance/invoices/${r.id}`} className="font-mono font-bold hover:text-red-600">{r.invoice_number}</Link></Td>
                      <Td>{fmtDate(r.invoice_date)}</Td><Td>{r.client_name}</Td><Td><span className="font-mono text-xs">{r.client_gstin || '—'}</span></Td><Td>{r.place_of_supply}</Td>
                      <Td right>{inr(r.taxable_amount)}</Td><Td right>{inr(r.cgst_amount)}</Td><Td right>{inr(r.sgst_amount)}</Td><Td right>{inr(r.igst_amount)}</Td><Td right bold>{inr(r.total_amount)}</Td>
                      <Td><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold no-underline ${INVOICE_STATUS[r.status]?.[1]}`}>{INVOICE_STATUS[r.status]?.[0]}</span></Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="font-bold border-t-2 border-slate-200"><Td>Total</Td><Td /><Td /><Td /><Td /><Td right>{inr(data.totals.taxable)}</Td><Td right>{inr(data.totals.cgst)}</Td><Td right>{inr(data.totals.sgst)}</Td><Td right>{inr(data.totals.igst)}</Td><Td right>{inr(data.totals.total)}</Td><Td /></tr></tfoot>
              </Table>
            )}
          </>
        )}

        {data && tab === 'gst-summary' && data.totals?.net && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card label="Taxable outward supplies" value={inr0(data.totals.net.taxable)} />
              <Card label="CGST" value={inr(data.totals.net.cgst)} tone="text-blue-600" />
              <Card label="SGST" value={inr(data.totals.net.sgst)} tone="text-blue-600" />
              <Card label="IGST" value={inr(data.totals.net.igst)} tone="text-blue-600" />
              <Card label="Net GST payable" value={inr(data.totals.net.tax)} tone="text-red-600" />
            </div>
            <p className="text-xs text-slate-500">Net of {data.creditNotes.length} credit note{data.creditNotes.length === 1 ? '' : 's'} in the period. Non-GST (IND) invoices: {data.nonGst.count}, {inr0(data.nonGst.value)} (no tax).</p>
            <h2 className="font-black text-slate-900">B2B — registered clients ({data.b2b.length})</h2>
            {data.b2b.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <Table>
                <thead><tr className="border-b border-slate-100"><Th>Invoice</Th><Th>Date</Th><Th>Client</Th><Th>GSTIN</Th><Th>Place</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                <tbody>{data.b2b.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50"><Td><span className="font-mono font-bold">{r.invoice_number}</span></Td><Td>{fmtDate(r.invoice_date)}</Td><Td>{r.client_name}</Td><Td><span className="font-mono text-xs">{r.client_gstin}</span></Td><Td>{r.place_of_supply}</Td>
                    <Td right>{inr(r.taxable_amount)}</Td><Td right>{inr(r.cgst_amount)}</Td><Td right>{inr(r.sgst_amount)}</Td><Td right>{inr(r.igst_amount)}</Td></tr>
                ))}</tbody>
              </Table>
            )}
            <h2 className="font-black text-slate-900">B2C — unregistered clients, by place of supply & rate</h2>
            {data.b2c.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <Table min={600}>
                <thead><tr className="border-b border-slate-100"><Th>Place of supply</Th><Th right>GST %</Th><Th right>Invoices</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                <tbody>{data.b2c.map((r) => (
                  <tr key={`${r.place_state_code}-${r.tax_rate}`} className="border-b border-slate-50"><Td>{r.place_of_supply} ({r.place_state_code})</Td><Td right>{Number(r.tax_rate)}%</Td><Td right>{r.invoices}</Td>
                    <Td right>{inr(r.taxable)}</Td><Td right>{inr(r.cgst)}</Td><Td right>{inr(r.sgst)}</Td><Td right>{inr(r.igst)}</Td></tr>
                ))}</tbody>
              </Table>
            )}
            <h2 className="font-black text-slate-900">SAC summary</h2>
            {data.sac.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <Table min={600}>
                <thead><tr className="border-b border-slate-100"><Th>SAC</Th><Th right>GST %</Th><Th right>Qty</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                <tbody>{data.sac.map((r) => (
                  <tr key={`${r.sac_code}-${r.tax_rate}`} className="border-b border-slate-50"><Td><span className="font-mono">{r.sac_code}</span></Td><Td right>{Number(r.tax_rate)}%</Td><Td right>{r.quantity}</Td>
                    <Td right>{inr(r.taxable)}</Td><Td right>{inr(r.cgst)}</Td><Td right>{inr(r.sgst)}</Td><Td right>{inr(r.igst)}</Td></tr>
                ))}</tbody>
              </Table>
            )}
            {data.creditNotes.length > 0 && (
              <>
                <h2 className="font-black text-slate-900">Credit notes</h2>
                <Table>
                  <thead><tr className="border-b border-slate-100"><Th>Credit note</Th><Th>Date</Th><Th>Against</Th><Th>Client</Th><Th right>Taxable</Th><Th right>Tax</Th><Th>Reason</Th></tr></thead>
                  <tbody>{data.creditNotes.map((r) => (
                    <tr key={r.credit_note_number} className="border-b border-slate-50"><Td><span className="font-mono font-bold">{r.credit_note_number}</span></Td><Td>{fmtDate(r.note_date)}</Td><Td>{r.invoice_number}</Td><Td>{r.client_name}</Td>
                      <Td right>{inr(r.taxable_amount)}</Td><Td right>{inr(Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount))}</Td><Td>{r.reason}</Td></tr>
                  ))}</tbody>
                </Table>
              </>
            )}
          </>
        )}

        {data && tab === 'aging' && data.clients && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <Card label="Not yet due" value={inr0(data.totals.current)} />
              <Card label="1–30 days" value={inr0(data.totals.d30)} tone="text-amber-600" />
              <Card label="31–60 days" value={inr0(data.totals.d60)} tone="text-orange-600" />
              <Card label="61–90 days" value={inr0(data.totals.d90)} tone="text-red-600" />
              <Card label="90+ days" value={inr0(data.totals.d90plus)} tone="text-red-700" />
              <Card label="Total receivable" value={inr0(data.totals.total)} />
            </div>
            {data.clients.length === 0 ? <Empty icon={BarChart3} title="Nothing outstanding" text="Every issued invoice is paid." /> : (
              <Table>
                <thead><tr className="border-b border-slate-100"><Th>Client</Th><Th>Account manager</Th><Th right>Not due</Th><Th right>1–30</Th><Th right>31–60</Th><Th right>61–90</Th><Th right>90+</Th><Th right>Total</Th></tr></thead>
                <tbody>{data.clients.map((c) => (
                  <tr key={c.client_id} className="border-b border-slate-50">
                    <Td><Link to={`/finance/invoices?clientId=${c.client_id}&status=overdue`} className="font-semibold hover:text-red-600">{c.client_name}</Link><div className="text-[11px] text-slate-400">{c.invoices} invoice{c.invoices === 1 ? '' : 's'}, oldest {c.oldest_days > 0 ? `${c.oldest_days} days late` : 'not due'}</div></Td>
                    <Td>{c.account_manager || '—'}</Td>
                    {['current', 'd30', 'd60', 'd90', 'd90plus'].map((k) => <Td key={k} right>{c[k] ? inr0(c[k]) : '—'}</Td>)}
                    <Td right bold>{inr0(c.total)}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </>
        )}

        {data && tab === 'payments' && data.rows && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card label="Payments" value={data.totals.count} />
              <Card label="Received" value={inr0(data.totals.amount)} tone="text-emerald-600" />
              {Object.entries(data.totals.byMode).slice(0, 2).map(([m, v]) => <Card key={m} label={METHOD[m] || m} value={inr0(v)} />)}
            </div>
            {data.rows.length === 0 ? <Empty icon={BarChart3} title="No payments in this period" /> : (
              <Table>
                <thead><tr className="border-b border-slate-100"><Th>Date</Th><Th>Invoice</Th><Th>Client</Th><Th>Mode</Th><Th>Reference</Th><Th right>Amount</Th><Th>Recorded by</Th></tr></thead>
                <tbody>{data.rows.map((r) => (
                  <tr key={r.payment_reference} className="border-b border-slate-50"><Td>{fmtDate(r.payment_date)}</Td><Td><span className="font-mono">{r.invoice_number}</span></Td><Td>{r.client_name}</Td>
                    <Td>{METHOD[r.payment_method] || r.payment_method}</Td><Td><span className="font-mono text-xs">{r.transaction_reference || '—'}</span></Td><Td right bold>{inr(r.amount)}</Td><Td>{r.recorded_by}</Td></tr>
                ))}</tbody>
              </Table>
            )}
          </>
        )}
      </PageState>
    </div>
  );
}
