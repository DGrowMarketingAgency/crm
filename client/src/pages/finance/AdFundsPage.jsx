import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, ArrowDownCircle, ArrowUpCircle, RotateCcw, FileText, Pencil, Trash2, Pause, Play, Printer, SlidersHorizontal, Settings2, Send, HandCoins, AlertTriangle } from 'lucide-react';
import { adFundsService, expensesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr, inr0 } from './gstMath';
import { Modal, Field, Kpi, Banner, Tabs, PAYMENT_MODES, PERIODS, modeLabel, periodParams, todayIso } from './miscUi';

const PLATFORMS = [['meta', 'Meta (FB / Insta)'], ['google', 'Google Ads'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['other', 'Other']];
const platformLabel = (p) => PLATFORMS.find(([k]) => k === p)?.[1] || p || '—';
const TXN = {
  deposit: { label: 'Payment received', chip: 'bg-emerald-100 text-emerald-700', sign: '+' },
  spend: { label: 'Ad spend', chip: 'bg-violet-100 text-violet-700', sign: '−' },
  refund: { label: 'Refund', chip: 'bg-amber-100 text-amber-800', sign: '−' },
  adjustment: { label: 'Adjustment', chip: 'bg-slate-100 text-slate-600', sign: '±' }
};
const HEALTH = {
  ok: ['Healthy', 'bg-emerald-100 text-emerald-700'],
  low: ['Low', 'bg-orange-100 text-orange-700'],
  empty: ['Empty', 'bg-red-100 text-red-700'],
  negative: ['Agency paid extra', 'bg-red-600 text-white'],
  due: ['Payment due', 'bg-amber-100 text-amber-800'],
  overdue: ['Overdue', 'bg-red-100 text-red-700'],
  over_limit: ['Over limit', 'bg-red-600 text-white']
};
const MODE = { prepaid: ['Prepaid', 'bg-slate-100 text-slate-600'], postpaid: ['Pay later', 'bg-blue-100 text-blue-700'] };
const FEES = [['none', 'No charges (client pays platform directly)', 0], ['gst18', 'GST 18% on ad spend', 18], ['fee5', 'Agency fee 5% on ad spend', 5], ['fee10', 'Agency fee 10% on ad spend', 10]];

/** Prepaid (client sends money first) or Pay later (agency pays the platform first, client repays). */
function WalletSettingsModal({ clientId, clientName, clients, onClose, onSaved }) {
  const [client, setClient] = useState(clientId || '');
  const [f, setF] = useState({ billingMode: 'postpaid', creditLimit: '', paymentTermsDays: 7, notes: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client) return;
    adFundsService.settings(client).then((r) => {
      const s = r.data.settings;
      setF({ billingMode: clientId ? s.billing_mode : 'postpaid', creditLimit: s.credit_limit ?? '', paymentTermsDays: s.payment_terms_days, notes: s.notes || '' });
    }).catch(() => {});
  }, [client, clientId]);
  const save = async () => {
    setError('');
    try {
      await adFundsService.saveSettings(client, f);
      onSaved(f.billingMode === 'postpaid' ? 'Saved — this client now pays later. Spend freely; the amount owed and its due date are tracked.' : 'Saved — this client pays in advance.');
    } catch (err) { setError(errorMessage(err)); }
  };
  const card = (k, title, text) => (
    <button type="button" onClick={() => setF((p) => ({ ...p, billingMode: k }))}
      className={`text-left p-3 rounded-xl border-2 transition-all ${f.billingMode === k ? 'border-red-500 bg-red-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="font-bold text-sm text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{text}</div>
    </button>
  );
  return (
    <Modal title={clientName ? `Wallet settings — ${clientName}` : 'Ad wallet settings'} subtitle="Choose how this client pays for ads." onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!client} onClick={save}>Save</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      {!clientId && (
        <Field label="Client">
          <select className={inputCls} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {card('prepaid', 'Prepaid', 'Client sends money first; we spend from it and warn when it runs low.')}
        {card('postpaid', 'Pay later', 'We pay Meta / Google first; the client pays us back. We track what they owe and chase it.')}
      </div>
      {f.billingMode === 'postpaid' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pay within (days)" hint="Counted from the oldest unpaid spend">
            <input type="number" min="0" max="180" className={inputCls} value={f.paymentTermsDays} onChange={(e) => setF({ ...f, paymentTermsDays: e.target.value })} />
          </Field>
          <Field label="Credit limit (₹)" hint="Alert when they owe more than this. Blank = no limit">
            <input type="number" min="0" className={inputCls} value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Pays every Monday by UPI" /></Field>
    </Modal>
  );
}

function TxnModal({ type, clientId, clients, amount, onClose, onSaved }) {
  const [f, setF] = useState({ clientId: clientId || '', txnType: type, txnDate: todayIso(), amount: amount || '', campaignId: '', paymentMode: type === 'deposit' || type === 'refund' ? 'bank_transfer' : '', reference: '', notes: '' });
  const [camps, setCamps] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!f.clientId || type !== 'spend') return;
    adFundsService.campaigns({ clientId: f.clientId }).then((r) => setCamps(r.data.campaigns)).catch(() => {});
  }, [f.clientId, type]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await adFundsService.record(f);
      const b = r.data.balance;
      onSaved(`${TXN[type].label} saved. ${b < 0 ? `Client still owes ${inr(-b)}.` : `Wallet balance ${inr(b)}.`}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  const titles = { deposit: 'Payment received from client', refund: 'Refund to client', adjustment: 'Adjustment', spend: 'Ad spend' };
  const subs = {
    deposit: 'An advance for ads, or the client paying back ad money the agency spent first. It clears the oldest dues first.',
    refund: 'Unused ad money returned to the client.',
    adjustment: 'Correction — use a minus amount to reduce the balance (e.g. platform fee).',
    spend: 'One spend entry. Use “Daily spend” to enter several campaigns at once.'
  };
  return (
    <Modal title={titles[type]} subtitle={subs[type]} onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={save}>Save</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Client">
        <select className={inputCls} value={f.clientId} onChange={set('clientId')}>
          <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className={inputCls} value={f.txnDate} onChange={set('txnDate')} /></Field>
        <Field label="Amount (₹)"><input type="number" step="0.01" className={inputCls} value={f.amount} onChange={set('amount')} /></Field>
      </div>
      {type === 'spend' && (
        <Field label="Campaign">
          <select className={inputCls} value={f.campaignId} onChange={set('campaignId')}>
            <option value="">No campaign</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name} · {platformLabel(c.platform)}</option>)}
          </select>
        </Field>
      )}
      {(type === 'deposit' || type === 'refund') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode"><select className={inputCls} value={f.paymentMode} onChange={set('paymentMode')}>{PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Reference / UTR"><input className={inputCls} value={f.reference} onChange={set('reference')} /></Field>
        </div>
      )}
      <Field label="Notes"><input className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

function DailySpendModal({ clientId, clients, onClose, onSaved }) {
  const [client, setClient] = useState(clientId || '');
  const [date, setDate] = useState(todayIso());
  const [camps, setCamps] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAmounts({});
    if (!client) { setCamps([]); return; }
    adFundsService.campaigns({ clientId: client }).then((r) => setCamps(r.data.campaigns.filter((c) => c.status !== 'ended'))).catch(() => {});
  }, [client]);
  const total = Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0);
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const entries = Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ campaignId: k === 'none' ? null : Number(k), amount: Number(v) }));
      const r = await adFundsService.dailySpend({ clientId: client, txnDate: date, entries });
      const b = r.data.balance;
      onSaved(`${r.data.recorded} spend entr${r.data.recorded === 1 ? 'y' : 'ies'} saved. ${b < 0 ? `Client owes ${inr(-b)}.` : `Wallet balance ${inr(b)}.`}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <Modal title="Daily ad spend" subtitle="Enter what each campaign spent (from Ads Manager / Google Ads). Leave blank to skip." onClose={onClose}
      footer={<><span className="mr-auto self-center text-sm font-bold text-slate-700">Total {inr(total)}</span><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving || total <= 0} onClick={save}>Save spend</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <select className={inputCls} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Spend date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {client && (
        <div className="border border-slate-100 rounded-xl divide-y divide-slate-100">
          {[...camps, { id: 'none', name: 'Other / no campaign', platform: null, daily_budget: 0 }].map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{c.name}{c.status === 'paused' && <span className="ml-1.5 text-[11px] text-slate-400">paused</span>}</div>
                {c.platform && <div className="text-[11px] text-slate-500">{platformLabel(c.platform)}{c.daily_budget ? ` · budget ${inr0(c.daily_budget)}/day` : ''}</div>}
              </div>
              <input type="number" min="0" step="0.01" aria-label={`Spend for ${c.name}`} className={`${inputCls} w-32 text-right`} placeholder="0" value={amounts[c.id] ?? ''} onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CampaignForm({ camp, clients, onClose, onSaved }) {
  const [f, setF] = useState(camp ? { clientId: camp.client_id, name: camp.name, platform: camp.platform, dailyBudget: camp.daily_budget || '', status: camp.status, startDate: camp.start_date || '', notes: camp.notes || '' }
    : { clientId: '', name: '', platform: 'meta', dailyBudget: '', status: 'active', startDate: todayIso(), notes: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    try {
      if (camp) await adFundsService.updateCampaign(camp.id, f);
      else await adFundsService.createCampaign(f);
      onSaved(camp ? 'Campaign updated.' : 'Campaign added.');
    } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal title={camp ? 'Edit campaign' : 'New campaign'} subtitle="The daily budget is used to warn you before a client's wallet runs out." onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save}>Save</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Client">
        <select className={inputCls} value={f.clientId} onChange={set('clientId')}>
          <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Campaign name"><input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Lead gen – Chennai" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Platform"><select className={inputCls} value={f.platform} onChange={set('platform')}>{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Daily budget (₹)"><input type="number" min="0" className={inputCls} value={f.dailyBudget} onChange={set('dailyBudget')} /></Field>
        <Field label="Status"><select className={inputCls} value={f.status} onChange={set('status')}><option value="active">Running</option><option value="paused">Paused</option><option value="ended">Ended</option></select></Field>
        <Field label="Start date"><input type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} /></Field>
      </div>
      <Field label="Notes"><input className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function StatementModal({ clientId, clientName, onClose }) {
  const first = `${todayIso().slice(0, 7)}-01`;
  const [range, setRange] = useState({ from: first, to: todayIso() });
  const [fee, setFee] = useState('none');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    adFundsService.statement(clientId, range).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
  }, [clientId, range]);
  const rate = FEES.find(([k]) => k === fee)[2];
  const charges = data ? Math.round(data.totals.spend * rate) / 100 : 0;
  const owed = data?.dues?.owed || 0;
  const payable = Math.round((owed + (owed ? charges : 0)) * 100) / 100;
  const dueLine = owed && data?.dues?.due_date
    ? `Amount due ${inr(payable)}${charges && owed ? ` (ad spend ${inr(owed)} + charges ${inr(charges)})` : ''} — please pay by ${fmtDate(data.dues.due_date)}${data.dues.overdue_days ? ` (${data.dues.overdue_days} days overdue)` : ''}.`
    : '';
  const whatsapp = () => {
    const text = `Hi ${data.client.name}, ad spend summary ${fmtDate(data.from)} – ${fmtDate(data.to)}: spent ${inr(data.totals.spend)}${charges ? ` + charges ${inr(charges)}` : ''}, received ${inr(data.totals.deposits)}. ${dueLine || `Balance with us: ${inr(data.closing)}.`} Thank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const print = () => {
    const a = data.agency || {};
    const rows = data.lines.map((l) => `<tr><td>${esc(fmtDate(l.txn_date))}</td><td>${esc(TXN[l.txn_type].label)}${l.campaign_name ? ` — ${esc(l.campaign_name)}` : ''}${l.reference ? ` <small>(${esc(l.reference)})</small>` : ''}${l.notes ? `<br><small>${esc(l.notes)}</small>` : ''}</td>
      <td class="r">${l.delta > 0 ? esc(inr(l.delta)) : ''}</td><td class="r">${l.delta < 0 ? esc(inr(-l.delta)) : ''}</td><td class="r"><b>${esc(signed(l.running))}</b></td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ad fund statement — ${esc(data.client.name)}</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#64748b}.r{text-align:right}
      .head{display:flex;justify-content:space-between;gap:24px}.box{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.box div{border:1px solid #e2e8f0;border-radius:8px;padding:8px}
      small{color:#64748b}.muted{color:#64748b}</style></head><body>
      <div class="head"><div><h1>${esc(a.agency_name || 'Agency')}</h1><div class="muted">${esc([a.address, a.city].filter(Boolean).join(', '))}</div>
      <div class="muted">${esc([a.gstin && `GSTIN ${a.gstin}`, a.phone, a.email].filter(Boolean).join(' · '))}</div></div>
      <div style="text-align:right"><h1>Ad fund statement</h1><div><b>${esc(data.client.name)}</b></div><div class="muted">${esc(fmtDate(data.from))} – ${esc(fmtDate(data.to))}</div></div></div>
      <div class="box"><div><small>Opening balance</small><br><b>${esc(inr(data.opening))}</b></div><div><small>Received</small><br><b>${esc(inr(data.totals.deposits))}</b></div>
      <div><small>Ad spend</small><br><b>${esc(inr(data.totals.spend))}</b></div><div><small>${data.closing < 0 ? 'Amount due from you' : 'Closing balance'}</small><br><b>${esc(data.closing < 0 ? inr(-data.closing) : inr(data.closing))}</b></div></div>
      ${dueLine ? `<p style="margin-top:14px;padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px"><b>${esc(dueLine)}</b>${a.upi_id ? `<br><small>UPI: ${esc(a.upi_id)}</small>` : ''}</p>` : ''}
      ${data.totals.refunds ? `<p>Refunded: <b>${esc(inr(data.totals.refunds))}</b></p>` : ''}
      ${rate ? `<p>${esc(FEES.find(([k]) => k === fee)[1])}: <b>${esc(inr(charges))}</b> (billed separately)</p>` : ''}
      <table><thead><tr><th>Date</th><th>Details</th><th class="r">Credit</th><th class="r">Debit</th><th class="r">Balance</th></tr></thead><tbody>
      <tr><td></td><td><i>Opening balance</i></td><td></td><td></td><td class="r"><b>${esc(inr(data.opening))}</b></td></tr>${rows}</tbody></table>
      <p class="muted" style="margin-top:24px">Generated on ${esc(fmtDate(todayIso()))}. Spend figures are taken from the ad platforms' billing.</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal title={`Statement — ${clientName}`} subtitle="Opening balance, every deposit and spend, and the closing balance." onClose={onClose} wide
      footer={<><button className={btnSecondary} onClick={onClose}>Close</button><button className={btnSecondary} disabled={!data} onClick={whatsapp}><Send className="w-4 h-4" /> WhatsApp</button><button className={btnPrimary} disabled={!data} onClick={print}><Printer className="w-4 h-4" /> Print / PDF</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      {dueLine && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{dueLine}</div>}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="From"><input type="date" className={inputCls} value={range.from} onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={range.to} onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))} /></Field>
        <Field label="Charges on spend"><select className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)}>{FEES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="Opening" value={inr0(data.opening)} />
            <Kpi label="Received" value={inr0(data.totals.deposits)} tone="text-emerald-700" />
            <Kpi label="Ad spend" value={inr0(data.totals.spend)} tone="text-violet-700" sub={rate ? `+ charges ${inr(charges)}` : undefined} />
            <Kpi label={data.closing < 0 ? 'Client owes' : 'Closing'} value={inr0(Math.abs(data.closing))} tone={data.closing < 0 ? 'text-red-600' : 'text-slate-900'} />
          </div>
          <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-80">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 sticky top-0"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-3">Details</th><th className="text-right px-3">Amount</th><th className="text-right px-3">Balance</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.lines.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No entries in this period.</td></tr>}
                {data.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(l.txn_date)}</td>
                    <td className="px-3 py-2">{TXN[l.txn_type].label}{l.campaign_name ? ` — ${l.campaign_name}` : ''}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${l.delta >= 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{l.delta >= 0 ? '+' : '−'}{inr(Math.abs(l.delta))}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap font-bold ${l.running < 0 ? 'text-red-600' : ''}`}>{signed(l.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

export function AdFundsPage() {
  const { hasPermission, isOwner } = usePermission();
  const canManage = isOwner || hasPermission('adfunds.manage');
  const [tab, setTab] = useState('wallets');
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [camps, setCamps] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [ledgerFilter, setLedgerFilter] = useState({ clientId: '', type: '' });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState(null); // { kind, ... }

  useEffect(() => { expensesService.lookups().then((r) => setClients(r.data.clients)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setError('');
    try {
      const pp = periodParams(period);
      const [s, c, t] = await Promise.all([
        adFundsService.summary(pp), adFundsService.campaigns(),
        adFundsService.transactions({ ...pp, ...Object.fromEntries(Object.entries(ledgerFilter).filter(([, v]) => v)) })
      ]);
      setSummary(s.data);
      setCamps(c.data.campaigns);
      setLedger(t.data.transactions);
    } catch (err) {
      setError(errorMessage(err, 'Could not load ad funds'));
    } finally {
      setLoading(false);
    }
  }, [period, ledgerFilter]);
  useEffect(() => { load(); }, [load]);

  const done = (text) => { setModal(null); setMsg(text); load(); };
  const act = async (fn, text) => { try { await fn(); done(text); } catch (err) { window.alert(errorMessage(err)); } };
  const low = useMemo(() => (summary?.wallets || []).filter((w) => ['low', 'empty'].includes(w.health)), [summary]);
  const owing = useMemo(() => (summary?.wallets || []).filter((w) => w.owed > 0).sort((a, b) => b.overdue_days - a.overdue_days || b.owed - a.owed), [summary]);
  const shown = tab === 'collect' ? owing : summary?.wallets || [];
  const periodName = PERIODS.find(([k]) => k === period)?.[1];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5 text-violet-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Client Ad Funds</h1>
            <p className="text-sm text-slate-500">Client ad money — paid in advance, or spent by us first and collected later. Kept apart from the agency's own expenses.</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={() => setModal({ kind: 'settings' })}><Settings2 className="w-4 h-4" /> Wallet settings</button>
            <button className={btnSecondary} onClick={() => setModal({ kind: 'campaign' })}><Plus className="w-4 h-4" /> Campaign</button>
            <button className={btnSecondary} onClick={() => setModal({ kind: 'daily' })}><ArrowUpCircle className="w-4 h-4" /> Daily spend</button>
            <button className={btnPrimary} onClick={() => setModal({ kind: 'txn', type: 'deposit' })}><ArrowDownCircle className="w-4 h-4" /> Payment received</button>
          </div>
        )}
      </div>
      {msg && <Banner onClose={() => setMsg('')}>{msg}</Banner>}

      <PageState loading={loading} error={error} onRetry={load}>
        {summary && (
          <>
            {owing.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 flex-1">
                  <b>To collect {inr0(summary.toCollect)}</b> from {owing.length} client{owing.length > 1 ? 's' : ''} for ad money we already spent
                  {summary.overdueCollect > 0 && <> — <b>{inr0(summary.overdueCollect)} overdue</b></>}:{' '}
                  {owing.slice(0, 4).map((w) => `${w.client_name} ${inr0(w.owed)}${w.overdue_days ? ` (${w.overdue_days}d late)` : w.due_date ? ` (due ${fmtDate(w.due_date)})` : ''}`).join(' · ')}
                  {owing.length > 4 && ' …'}
                </div>
                <button onClick={() => setTab('collect')} className="text-xs font-bold text-red-700 hover:underline whitespace-nowrap">View all →</button>
              </div>
            )}
            {low.length > 0 && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                <b>Top-up needed:</b> {low.map((w) => `${w.client_name} (${inr0(w.balance)} · ${w.days_left ?? 0} day${w.days_left === 1 ? '' : 's'} left)`).join(' · ')}
              </div>
            )}
            <div className="flex justify-end">
              <select aria-label="Period" className={`${inputCls} w-auto`} value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIODS.filter(([k]) => k !== 'custom').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <Kpi label="To collect" value={inr0(summary.toCollect)} tone={summary.toCollect ? 'text-red-600' : 'text-slate-900'} sub={summary.clientsOwing ? `${summary.clientsOwing} client${summary.clientsOwing > 1 ? 's' : ''} · ${inr0(summary.overdueCollect)} overdue` : 'Nobody owes ad money'} />
              <Kpi label="Held for clients" value={inr0(summary.totalBalance)} sub="Advances not spent yet" />
              <Kpi label={`Received · ${periodName}`} value={inr0(summary.period.deposits)} tone="text-emerald-700" />
              <Kpi label={`Spent · ${periodName}`} value={inr0(summary.period.spend)} tone="text-violet-700" />
              <Kpi label="Running cost / day" value={inr0(summary.dailyRunningCost)} sub="Active campaign budgets" />
              <Kpi label="Wallets low" value={summary.lowWallets} tone={summary.lowWallets ? 'text-orange-600' : 'text-slate-900'} sub="Prepaid, < 3 days left" />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[['wallets', 'Client wallets', summary.wallets.length], ['collect', 'To collect', owing.length], ['campaigns', 'Campaigns', camps.length], ['ledger', 'Ledger', ledger.length]]} />

            {(tab === 'wallets' || tab === 'collect') && (shown.length === 0 ? (
              tab === 'collect'
                ? <Empty icon={HandCoins} title="Nothing to collect" text="Every client has paid for the ad spend so far." />
                : <Empty icon={Megaphone} title="No ad wallets yet" text="Record a payment, add a campaign, or open Wallet settings to set up a pay-later client." />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                    <tr><th className="text-left px-4 py-2.5">Client</th><th className="text-right px-3">Received</th><th className="text-right px-3">Spent</th><th className="text-right px-3">Balance / due</th><th className="text-left px-3">{tab === 'collect' ? 'Owed since · due by' : 'Runway / dues'}</th><th className="text-left px-3">Status</th><th className="px-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {shown.map((w) => (
                      <tr key={w.client_id} className={['ok', 'due'].includes(w.health) ? '' : w.health === 'low' ? 'bg-orange-50/50' : 'bg-red-50/60'}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">{w.client_name}<span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${MODE[w.billing_mode][1]}`}>{MODE[w.billing_mode][0]}</span></div>
                          <div className="text-xs text-slate-400">{w.active_campaigns} running · last {fmtDate(w.last_activity)}{w.daily_budget ? ` · ${inr0(w.daily_budget)}/day` : ''}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-700">{inr0(w.deposits)}</td>
                        <td className="px-3 py-3 text-right text-violet-700">{inr0(w.spend)}{w.refunds ? <div className="text-[11px] text-slate-400">refunded {inr0(w.refunds)}</div> : null}</td>
                        <td className="px-3 py-3 text-right">
                          {w.owed > 0
                            ? <><div className="font-black text-red-600">{inr(w.owed)}</div><div className="text-[11px] font-semibold text-red-500">client owes</div></>
                            : <><div className="font-black text-slate-900">{inr(w.balance)}</div><div className="text-[11px] text-slate-400">{w.balance > 0 ? 'advance left' : 'settled'}</div></>}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {w.owed > 0 ? (
                            <>
                              <div>since {fmtDate(w.owed_since)} · due {fmtDate(w.due_date)}</div>
                              {w.overdue_days > 0 && <div className="font-bold text-red-600">{w.overdue_days} day{w.overdue_days > 1 ? 's' : ''} overdue</div>}
                              {w.credit_limit != null && (
                                <div className="mt-1 w-36">
                                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${w.credit_used_pct > 100 ? 'bg-red-600' : w.credit_used_pct > 75 ? 'bg-orange-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, w.credit_used_pct)}%` }} /></div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{w.credit_used_pct}% of {inr0(w.credit_limit)} limit</div>
                                </div>
                              )}
                            </>
                          ) : w.days_left != null ? `${w.days_left} day${w.days_left === 1 ? '' : 's'} of budget left` : w.billing_mode === 'postpaid' ? `Pay within ${w.payment_terms_days} days` : '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${HEALTH[w.health][1]}`}>{HEALTH[w.health][0]}</span></td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="inline-flex gap-1">
                            {canManage && w.owed > 0 && <button onClick={() => setModal({ kind: 'txn', type: 'deposit', clientId: w.client_id, amount: w.owed })} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">Receive</button>}
                            {canManage && w.owed === 0 && <button title="Payment received" onClick={() => setModal({ kind: 'txn', type: 'deposit', clientId: w.client_id })} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><ArrowDownCircle className="w-4 h-4" /></button>}
                            {canManage && <button title="Wallet settings" onClick={() => setModal({ kind: 'settings', clientId: w.client_id, clientName: w.client_name })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Settings2 className="w-4 h-4" /></button>}
                            {canManage && <button title="Daily spend" onClick={() => setModal({ kind: 'daily', clientId: w.client_id })} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600"><ArrowUpCircle className="w-4 h-4" /></button>}
                            {canManage && <button title="Refund" onClick={() => setModal({ kind: 'txn', type: 'refund', clientId: w.client_id })} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"><RotateCcw className="w-4 h-4" /></button>}
                            {canManage && <button title="Adjustment" onClick={() => setModal({ kind: 'txn', type: 'adjustment', clientId: w.client_id })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><SlidersHorizontal className="w-4 h-4" /></button>}
                            <button title="Statement" onClick={() => setModal({ kind: 'statement', clientId: w.client_id, clientName: w.client_name })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><FileText className="w-4 h-4" /></button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {tab === 'campaigns' && (camps.length === 0 ? (
              <Empty icon={Megaphone} title="No campaigns" text="Add each running campaign with its daily budget to get low-balance warnings." />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                    <tr><th className="text-left px-4 py-2.5">Campaign</th><th className="text-left px-3">Client</th><th className="text-left px-3">Platform</th><th className="text-right px-3">Budget / day</th><th className="text-right px-3">Spent so far</th><th className="text-left px-3">Status</th><th className="px-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {camps.map((c) => (
                      <tr key={c.id} className={c.status === 'ended' ? 'opacity-60' : ''}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{c.name}<div className="text-xs font-normal text-slate-400">since {fmtDate(c.start_date)}</div></td>
                        <td className="px-3 py-3 text-slate-600">{c.client_name}</td>
                        <td className="px-3 py-3 text-slate-600">{platformLabel(c.platform)}</td>
                        <td className="px-3 py-3 text-right">{c.daily_budget ? inr0(c.daily_budget) : '—'}</td>
                        <td className="px-3 py-3 text-right font-bold text-violet-700">{inr0(c.total_spend)}</td>
                        <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : c.status === 'paused' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{c.status === 'active' ? 'Running' : c.status === 'paused' ? 'Paused' : 'Ended'}</span></td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {canManage && (
                            <span className="inline-flex gap-1">
                              {c.status !== 'ended' && (
                                <button title={c.status === 'active' ? 'Pause' : 'Resume'} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                                  onClick={() => act(() => adFundsService.updateCampaign(c.id, { clientId: c.client_id, name: c.name, platform: c.platform, dailyBudget: c.daily_budget, status: c.status === 'active' ? 'paused' : 'active', startDate: c.start_date, notes: c.notes }), c.status === 'active' ? 'Campaign paused.' : 'Campaign resumed.')}>
                                  {c.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>
                              )}
                              <button title="Edit" onClick={() => setModal({ kind: 'campaign', camp: c })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                              {c.total_spend === 0 && <button title="Delete" onClick={() => window.confirm(`Delete campaign "${c.name}"?`) && act(() => adFundsService.removeCampaign(c.id), 'Campaign deleted.')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {tab === 'ledger' && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100">
                  <select aria-label="Client" className={`${inputCls} w-auto`} value={ledgerFilter.clientId} onChange={(e) => setLedgerFilter((p) => ({ ...p, clientId: e.target.value }))}>
                    <option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select aria-label="Type" className={`${inputCls} w-auto`} value={ledgerFilter.type} onChange={(e) => setLedgerFilter((p) => ({ ...p, type: e.target.value }))}>
                    <option value="">All entries</option>{Object.entries(TXN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {ledger.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No entries for {periodName.toLowerCase()}.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                      <tbody className="divide-y divide-slate-50">
                        {ledger.map((t) => (
                          <tr key={t.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(t.txn_date)}</td>
                            <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${TXN[t.txn_type].chip}`}>{TXN[t.txn_type].label}</span></td>
                            <td className="px-3 py-3"><div className="font-semibold text-slate-800">{t.client_name}</div><div className="text-xs text-slate-500">{[t.campaign_name, t.platform && platformLabel(t.platform), t.payment_mode && modeLabel(t.payment_mode), t.reference, t.notes].filter(Boolean).join(' · ')}</div></td>
                            <td className={`px-3 py-3 text-right whitespace-nowrap font-bold ${t.txn_type === 'deposit' ? 'text-emerald-700' : 'text-slate-900'}`}>{TXN[t.txn_type].sign === '±' ? (t.amount < 0 ? '−' : '+') : TXN[t.txn_type].sign}{inr(Math.abs(t.amount))}</td>
                            <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{t.created_by_name}</td>
                            <td className="px-3 py-3 text-right">{canManage && <button title="Delete entry" onClick={() => window.confirm('Delete this entry? The wallet balance changes accordingly.') && act(() => adFundsService.removeTxn(t.id), 'Entry deleted.')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </PageState>

      {modal?.kind === 'txn' && <TxnModal type={modal.type} clientId={modal.clientId} amount={modal.amount} clients={clients} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'settings' && <WalletSettingsModal clientId={modal.clientId} clientName={modal.clientName} clients={clients} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'daily' && <DailySpendModal clientId={modal.clientId} clients={clients} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'campaign' && <CampaignForm camp={modal.camp} clients={clients} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'statement' && <StatementModal clientId={modal.clientId} clientName={modal.clientName} onClose={() => setModal(null)} />}
    </div>
  );
}
