import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Plus, Copy, MessageCircle, Pencil, CopyPlus, Ban, Trash2 } from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../hooks/useAuth';
import { PageState, Empty, errorMessage, fmtDate, btnPrimary } from '../project-flow/flowUi';
import { inr0 } from '../finance/gstMath';
import { QUOTE_STATUS, quoteRules } from './quoteUi';
import { ActionMenu } from './salesUi';

const TABS = [['', 'All'], ['requested', 'Awaiting price'], ['open', 'Sent / open'], ['negotiating', 'In negotiation'], ['approved', 'Accepted'], ['rejected', 'Declined'], ['converted', 'Converted'], ['cancelled', 'Cancelled']];
export const quoteLink = (token) => `${window.location.origin}/q/${token}`;

export function QuotationsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const canPrice = isOwner || hasPermission('sales_quotes.price');
  const canRequest = canPrice || hasPermission('sales_quotes.request');
  const { user: me } = useAuth();
  const [tab, setTab] = useState(() => (canPrice ? 'requested' : ''));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await salesService.listQuotes(tab ? { status: tab } : {})).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load quotations'));
    } finally {
      setLoading(false);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const copy = async (q) => {
    try { await navigator.clipboard.writeText(quoteLink(q.public_token)); setCopied(q.id); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };
  const [msg, setMsg] = useState(null);
  const act = async (fn, ok) => {
    setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: ok }); load(); return r; } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); return null; }
  };
  const duplicate = async (q) => {
    const r = await act(() => salesService.duplicateQuote(q.id), `${q.quote_number} duplicated.`);
    if (r) navigate(`/sales/quotes/${r.data.quote.id}`, { state: { flash: { ok: true, text: `Copied from ${q.quote_number} as ${r.data.quote.quote_number}.` } } });
  };
  const cancel = (q) => {
    const reason = window.prompt(`Cancel ${q.quote_number}? The client's link will say it is no longer valid.\n\nReason (optional):`, '');
    if (reason === null) return;
    act(() => salesService.cancelQuote(q.id, reason.trim() || null), `${q.quote_number} cancelled.`);
  };
  const remove = (q) => window.confirm(`Delete ${q.quote_number} for ${q.party_name}? This cannot be undone.`)
    && act(() => salesService.deleteQuote(q.id), `${q.quote_number} deleted.`);
  const c = data?.counts;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><FileSpreadsheet className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Quotations</h1>
            <p className="text-sm text-slate-500">
              {canPrice ? 'Price requests from marketing, send quotations to clients and handle negotiation rounds.' : 'Request a quotation with the services your client wants. The admin adds the prices and sends it.'}
            </p>
          </div>
        </div>
        {canRequest && <button className={btnPrimary} onClick={() => navigate('/sales/quotes/new')}><Plus className="w-4 h-4" /> {canPrice ? 'New quotation' : 'Request quotation'}</button>}
      </div>

      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{msg.text}</div>}

      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[['Awaiting price', c.awaiting_price, 'text-amber-600', 'border-l-amber-500'], ['Sent / open', c.sent, 'text-sky-600', 'border-l-sky-500'],
            ['In negotiation', c.negotiating, 'text-orange-600', 'border-l-orange-500'], ['Accepted', c.approved + c.converted, 'text-emerald-600', 'border-l-emerald-500'],
            ['Open pipeline', inr0(c.pipeline), 'text-violet-600', 'border-l-violet-500']].map(([l, v, col, b]) => (
            <div key={l} className={`bg-white p-4 rounded-2xl border border-slate-100 border-l-4 ${b} shadow-sm`}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div>
              <div className={`text-2xl font-black mt-1 ${col}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-100 w-fit" role="tablist" aria-label="Status">
        {TABS.map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === v ? 'bg-red-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data?.quotes.length === 0 ? (
          <Empty icon={FileSpreadsheet} title="No quotations here" text={canPrice ? 'Requests from marketing people show up under “Awaiting price”.' : 'Request a quotation from an enquiry or here.'} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[980px]">
              <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">Quote #</th><th className="px-4 py-3">Client / prospect</th><th className="px-4 py-3">Services</th>
                <th className="px-4 py-3">Requested by</th><th className="px-4 py-3">Date & validity</th><th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody>
                {data?.quotes.map((q) => {
                  const [label, cls] = QUOTE_STATUS[q.status] || [q.status, ''];
                  const live = ['sent', 'viewed', 'negotiating'].includes(q.status);
                  return (
                    <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                      <td className="px-4 py-3"><Link to={`/sales/quotes/${q.id}`} className="font-mono font-bold hover:text-red-600">{q.quote_number}</Link>
                        {q.revisions > 0 && <div className="text-[11px] text-orange-600 font-bold">{q.revisions} revision{q.revisions === 1 ? '' : 's'}</div>}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{q.party_name || '—'}</div><div className="text-xs text-slate-500">{q.title}</div></td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[220px]">{q.services || '—'}</td>
                      <td className="px-4 py-3 text-xs">{q.requested_by_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(q.quote_date)}{q.valid_until && <div>Valid till {fmtDate(q.valid_until)}</div>}</td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{q.status === 'requested' ? <span className="text-amber-600 text-xs">Awaiting price</span> : inr0(q.total_amount)}
                        {q.status !== 'requested' && <div className="text-[11px] font-normal text-slate-400">{q.gst_mode === 'gst' ? 'incl. GST' : 'No GST'}</div>}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls}`}>{label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Link to={`/sales/quotes/${q.id}`} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1">
                            {canPrice && q.status === 'requested' ? 'Add prices' : quoteRules(q, { canPrice, userId: me?.id }).edit ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : 'View'}
                          </Link>
                          <ActionMenu label={`Actions for ${q.quote_number}`} items={[
                            { label: 'Duplicate', icon: CopyPlus, onClick: () => duplicate(q), hidden: !canRequest },
                            { label: 'Cancel quotation', icon: Ban, onClick: () => cancel(q), hidden: !quoteRules(q, { canPrice, userId: me?.id }).cancel },
                            { label: 'Delete', icon: Trash2, onClick: () => remove(q), danger: true, hidden: !quoteRules(q, { canPrice, userId: me?.id }).delete }
                          ]} />
                          {canPrice && live && q.public_token && (
                            <>
                              <button className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" title="Copy client link" aria-label="Copy client link" onClick={() => copy(q)}>
                                {copied === q.id ? <span className="text-[11px] font-bold text-emerald-700">Copied</span> : <Copy className="w-4 h-4" />}
                              </button>
                              <a className="p-2 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700" title="Share on WhatsApp" aria-label="Share on WhatsApp" target="_blank" rel="noreferrer"
                                href={`https://wa.me/?text=${encodeURIComponent(`Quotation ${q.quote_number} for ${q.party_name}: ${quoteLink(q.public_token)}`)}`}><MessageCircle className="w-4 h-4" /></a>
                            </>
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
