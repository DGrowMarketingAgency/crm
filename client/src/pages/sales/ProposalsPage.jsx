import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Eye, Pencil, Copy, Trash2, Undo2 } from 'lucide-react';
import { salesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary } from '../project-flow/flowUi';
import { PROPOSAL_STATUS, CYCLES, ActionMenu } from './salesUi';
import { inr0 } from '../finance/gstMath';

/** Mirrors the server: drafts edit/delete; shared ones edit/withdraw; accepted/converted are kept (duplicate instead). */
export const proposalRules = (p) => ({
  edit: ['draft', 'sent', 'viewed'].includes(p.status),
  withdraw: ['sent', 'viewed'].includes(p.status),
  delete: ['draft', 'withdrawn', 'rejected'].includes(p.status)
});

export function ProposalsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const canCreate = isOwner || hasPermission('proposals.create');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await salesService.listProposals({ status: status || undefined, search: search || undefined })).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load proposals'));
    } finally {
      setLoading(false);
    }
  }, [status, search]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: ok });
      load();
      return r;
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
      return null;
    }
  };
  const duplicate = async (p) => {
    const r = await act(() => salesService.duplicateProposal(p.id), `${p.proposal_code} duplicated.`);
    if (r) navigate(`/sales/proposals/${r.data.proposal.id}`);
  };
  const withdraw = (p) => window.confirm(`Withdraw ${p.proposal_code}? The client's link will say it is no longer available.`)
    && act(() => salesService.withdrawProposal(p.id), `${p.proposal_code} withdrawn.`);
  const remove = (p) => window.confirm(`Delete ${p.proposal_code} (${p.title})? This cannot be undone.`)
    && act(() => salesService.deleteProposal(p.id), `${p.proposal_code} deleted.`);

  const c = data?.counts;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><FileText className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Proposals</h1>
            <p className="text-sm text-slate-500">3-package proposals shared by link. The client picks a plan; you turn it into a quotation, then an invoice.</p>
          </div>
        </div>
        {canCreate && <button className={btnPrimary} onClick={() => navigate('/sales/proposals/new')}><Plus className="w-4 h-4" /> New proposal</button>}
      </div>

      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{msg.text}</div>}

      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['Shared, awaiting reply', c.shared], ['Opened by client', c.viewed], ['Accepted', c.accepted], ['Converted', c.converted]].map(([l, v]) => (
            <div key={l} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</div><div className="text-xl font-black mt-1">{v}</div></div>
          ))}
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Code, title or client…" aria-label="Search proposals" onKeyDown={(e) => e.key === 'Enter' && setSearch(e.currentTarget.value.trim())} onBlur={(e) => setSearch(e.target.value.trim())} />
        </div>
        <select aria-label="Status" className={`${inputCls} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(PROPOSAL_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data?.proposals.length === 0 ? <Empty icon={FileText} title="No proposals yet" text="Create one from a lead, or with New proposal." /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[880px]">
              <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2.5">Proposal</th><th className="px-4 py-2.5">Client / lead</th><th className="px-4 py-2.5">Packages</th>
                <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Views</th><th className="px-4 py-2.5">Created</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
              <tbody>
                {data?.proposals.map((p) => {
                  const r = proposalRules(p);
                  const [label, cls] = PROPOSAL_STATUS[p.status] || [p.status, ''];
                  return (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5"><Link to={`/sales/proposals/${p.id}`} className="font-mono text-xs font-bold hover:text-red-600">{p.proposal_code}</Link><div className="font-semibold">{p.title}</div><div className="text-[11px] text-slate-400">{CYCLES[p.billing_cycle]}</div></td>
                      <td className="px-4 py-2.5">{p.party_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs">{p.tiers.map((t) => <div key={t.name} className={p.accepted_tier === t.name ? 'font-bold text-emerald-700' : ''}>{t.name} · {inr0(t.price)}</div>)}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {p.view_count}</span></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Link to={`/sales/proposals/${p.id}`} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1">
                            {canCreate && r.edit ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><Eye className="w-3.5 h-3.5" /> View</>}
                          </Link>
                          {canCreate && (
                            <ActionMenu label={`Actions for ${p.proposal_code}`} items={[
                              { label: 'Duplicate', icon: Copy, onClick: () => duplicate(p) },
                              { label: 'Withdraw', icon: Undo2, onClick: () => withdraw(p), hidden: !r.withdraw },
                              { label: 'Delete', icon: Trash2, onClick: () => remove(p), danger: true, hidden: !r.delete }
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
      <p className="text-xs text-slate-400">Single-price quotations are under <Link to="/sales/quotes" className="hover:text-red-600">Quotations</Link>. Accepted and converted proposals are kept as the record of what the client agreed — duplicate one to start a new version.</p>
    </div>
  );
}
