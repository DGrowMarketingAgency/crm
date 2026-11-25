import React, { useCallback, useEffect, useState } from 'react';
import { HandCoins, Plus, Pencil, Trash2, Undo2, Phone, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { borrowingsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr0, inr } from './gstMath';
import { Modal, Field, Kpi, Banner, Tabs, PAYMENT_MODES, modeLabel, todayIso, dueText } from './miscUi';

/** Money the agency borrowed from people, and what has been given back so far. */
export function BorrowedMoneyPage() {
  const { hasPermission, isOwner } = usePermission();
  const canManage = isOwner || hasPermission('expenses.manage');
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null); // {} new, or borrowing to edit
  const [returning, setReturning] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await borrowingsService.list({ status: tab === 'all' ? '' : tab, search });
      setData(r.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load borrowed money'));
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const done = (text) => {
    setForm(null);
    setReturning(null);
    setMsg(text);
    load();
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete the entry for ${inr0(b.amount)} from ${b.lender_name}${b.returns_count ? ` and its ${b.returns_count} return(s)` : ''}? This can't be undone.`)) return;
    try {
      await borrowingsService.remove(b.id);
      done('Entry deleted.');
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <HandCoins className="w-6 h-6 text-red-600" /> Borrowed Money
          </h1>
          <p className="text-sm text-slate-500 mt-1">Money borrowed from people — add it when you take it, and add each return as you pay it back.</p>
        </div>
        {canManage && (
          <button className={btnPrimary} onClick={() => setForm({})}>
            <Plus className="w-4 h-4" /> Add borrowed money
          </button>
        )}
      </div>

      {msg && <Banner onClose={() => setMsg('')}>{msg}</Banner>}

      <PageState loading={loading && !data} error={error} onRetry={load}>
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Still to return" value={inr0(t.outstanding)} tone={t.outstanding > 0 ? 'text-red-700' : 'text-emerald-700'} sub={`${t.open_count} open`} />
              <Kpi label="Borrowed (all time)" value={inr0(t.borrowed)} />
              <Kpi label="Returned (all time)" value={inr0(t.returned)} tone="text-emerald-700" />
              <Kpi label="Past return date" value={t.overdue_count} tone={t.overdue_count ? 'text-red-700' : 'text-slate-900'} sub={t.overdue_count ? 'Return date has passed' : 'Nothing late'} />
            </div>

            {data.lenders.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Who we owe</p>
                <div className="flex flex-wrap gap-2">
                  {data.lenders.map((l) => (
                    <span key={l.lender_name} className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-100 text-sm">
                      <b className="text-slate-900">{l.lender_name}</b> <span className="font-black text-red-700">{inr0(l.balance)}</span>
                      {l.count > 1 && <span className="text-xs text-slate-500"> · {l.count} entries</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Tabs tabs={[['open', 'To return'], ['settled', 'Fully returned'], ['all', 'All']]} value={tab} onChange={setTab} />
              <div className="relative sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className={`${inputCls} pl-9`} placeholder="Search name, phone or purpose" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
              </div>
            </div>

            {!data.borrowings.length ? (
              <Empty
                icon={HandCoins}
                title={tab === 'open' ? 'Nothing to return' : 'No entries'}
                text={tab === 'open' ? 'When you borrow money from someone, add it here so you never lose track of what you owe.' : undefined}
              />
            ) : (
              <div className="space-y-3">
                {data.borrowings.map((b) => {
                  const pct = b.amount ? Math.min(100, Math.round((b.returned / b.amount) * 100)) : 0;
                  return (
                    <div key={b.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${b.overdue ? 'border-red-200' : 'border-slate-100'}`}>
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-black text-slate-900">{b.lender_name}</span>
                            {b.status === 'settled' ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Fully returned{b.settled_on ? ` ${fmtDate(b.settled_on)}` : ''}
                              </span>
                            ) : b.overdue ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Return date passed ({dueText(b.return_by)})
                              </span>
                            ) : b.return_by ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">Return by {fmtDate(b.return_by)}</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                            <span>Borrowed {fmtDate(b.borrowed_on)}{b.received_mode ? ` · ${modeLabel(b.received_mode)}` : ''}</span>
                            {b.purpose && <span>For: {b.purpose}</span>}
                            {b.lender_phone && (
                              <a href={`tel:${b.lender_phone}`} className="inline-flex items-center gap-1 hover:text-red-600">
                                <Phone className="w-3 h-3" /> {b.lender_phone}
                              </a>
                            )}
                          </p>
                          {b.notes && <p className="text-xs text-slate-500 whitespace-pre-line">{b.notes}</p>}
                        </div>
                        <div className="md:text-right shrink-0">
                          <div className="text-[11px] font-bold uppercase text-slate-400">{b.status === 'settled' ? 'Borrowed' : 'Still to return'}</div>
                          <div className={`text-xl font-black ${b.status === 'settled' ? 'text-slate-700' : 'text-red-700'}`}>{inr0(b.status === 'settled' ? b.amount : b.balance)}</div>
                          <div className="text-xs text-slate-500">
                            of {inr0(b.amount)} · returned {inr0(b.returned)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden" aria-label={`${pct}% returned`}>
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {canManage && b.status === 'open' && (
                          <button className={`${btnPrimary} py-1.5 px-3 text-xs`} onClick={() => setReturning(b)}>
                            <Undo2 className="w-3.5 h-3.5" /> Add return
                          </button>
                        )}
                        <button className={`${btnSecondary} py-1.5 px-3 text-xs`} onClick={() => setHistory(b.id)}>
                          Returns ({b.returns_count})
                        </button>
                        {canManage && (
                          <>
                            <button className={`${btnSecondary} py-1.5 px-3 text-xs`} onClick={() => setForm(b)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button className={`${btnSecondary} py-1.5 px-3 text-xs !text-red-600`} onClick={() => remove(b)}>
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </>
                        )}
                        {b.last_returned_on && <span className="text-xs text-slate-400 ml-auto">Last return {fmtDate(b.last_returned_on)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageState>

      {form && <BorrowingForm b={form.id ? form : null} onClose={() => setForm(null)} onSaved={done} />}
      {returning && <ReturnForm b={returning} onClose={() => setReturning(null)} onSaved={done} />}
      {history && <ReturnsHistory id={history} canManage={canManage} onClose={() => setHistory(null)} onChanged={(text) => { setMsg(text); load(); }} />}
    </div>
  );
}

function BorrowingForm({ b, onClose, onSaved }) {
  const [f, setF] = useState(() =>
    b
      ? { lenderName: b.lender_name, lenderPhone: b.lender_phone || '', amount: b.amount, borrowedOn: b.borrowed_on, receivedMode: b.received_mode || '', purpose: b.purpose || '', returnBy: b.return_by || '', notes: b.notes || '' }
      : { lenderName: '', lenderPhone: '', amount: '', borrowedOn: todayIso(), receivedMode: 'upi', purpose: '', returnBy: '', notes: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { ...f, amount: Number(f.amount) };
      if (b) await borrowingsService.update(b.id, body);
      else await borrowingsService.create(body);
      onSaved(b ? 'Updated.' : `Added: ${inr0(body.amount)} borrowed from ${f.lenderName.trim()}.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={b ? 'Edit borrowed money' : 'Add borrowed money'}
      subtitle="Who gave the money, how much, and when."
      onClose={onClose}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={saving || f.lenderName.trim().length < 2 || !(Number(f.amount) > 0) || !f.borrowedOn} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Borrowed from *"><input className={inputCls} value={f.lenderName} onChange={set('lenderName')} placeholder="Person's name" maxLength={150} /></Field>
        <Field label="Their phone"><input className={inputCls} value={f.lenderPhone} onChange={set('lenderPhone')} maxLength={20} /></Field>
        <Field label="Amount ₹ *"><input type="number" min="1" className={inputCls} value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Borrowed on *"><input type="date" className={inputCls} value={f.borrowedOn} onChange={set('borrowedOn')} /></Field>
        <Field label="Received by">
          <select className={inputCls} value={f.receivedMode} onChange={set('receivedMode')}>
            <option value="">—</option>
            {PAYMENT_MODES.filter(([k]) => k !== 'auto_debit').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Return by (optional)" hint="We flag it red once this date passes."><input type="date" className={inputCls} value={f.returnBy} onChange={set('returnBy')} /></Field>
        <Field label="What it was for" className="sm:col-span-2"><input className={inputCls} value={f.purpose} onChange={set('purpose')} placeholder="e.g. Salary advance for November, new camera" maxLength={255} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.notes} onChange={set('notes')} maxLength={2000} /></Field>
      </div>
      {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
    </Modal>
  );
}

function ReturnForm({ b, onClose, onSaved }) {
  const [f, setF] = useState({ amount: b.balance, paidOn: todayIso(), paymentMode: 'upi', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const amt = Number(f.amount) || 0;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await borrowingsService.addReturn(b.id, { ...f, amount: amt });
      onSaved(
        r.data.borrowing.status === 'settled'
          ? `All returned to ${b.lender_name} — marked as fully returned.`
          : `${inr0(amt)} returned to ${b.lender_name}. ${inr0(r.data.borrowing.balance)} still to return.`
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Return money to ${b.lender_name}`}
      subtitle={`Still to return: ${inr(b.balance)} of ${inr(b.amount)}`}
      onClose={onClose}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={saving || amt <= 0 || amt > b.balance || !f.paidOn} onClick={save}>{saving ? 'Saving…' : 'Save return'}</button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Amount returned ₹ *" hint={amt > b.balance ? `More than the ${inr0(b.balance)} left` : amt === b.balance ? 'This settles it fully' : `${inr0(b.balance - amt)} will still be left`}>
          <input type="number" min="1" max={b.balance} className={inputCls} value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Returned on *"><input type="date" className={inputCls} value={f.paidOn} onChange={set('paidOn')} /></Field>
        <Field label="Paid by">
          <select className={inputCls} value={f.paymentMode} onChange={set('paymentMode')}>
            <option value="">—</option>
            {PAYMENT_MODES.filter(([k]) => k !== 'auto_debit').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input className={inputCls} value={f.reference} onChange={set('reference')} placeholder="UTR / txn id" maxLength={100} /></Field>
        <Field label="Note" className="sm:col-span-2"><input className={inputCls} value={f.notes} onChange={set('notes')} maxLength={255} /></Field>
      </div>
      {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
    </Modal>
  );
}

function ReturnsHistory({ id, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => borrowingsService.get(id).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const undo = async (r) => {
    if (!window.confirm(`Remove the ${inr0(r.amount)} return on ${fmtDate(r.paid_on)}? Use this only if it was entered by mistake.`)) return;
    try {
      await borrowingsService.removeReturn(r.id);
      await load();
      onChanged('Return removed.');
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  const b = data?.borrowing;
  return (
    <Modal title={b ? `Returns to ${b.lender_name}` : 'Returns'} subtitle={b ? `${inr0(b.returned)} returned of ${inr0(b.amount)} · ${inr0(b.balance)} left` : ''} onClose={onClose}>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {!data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data.returns.length ? (
        <p className="text-sm text-slate-500">Nothing returned yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.returns.map((r) => (
            <li key={r.id} className="py-2.5 flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-900">{inr(r.amount)}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(r.paid_on)}{r.payment_mode ? ` · ${modeLabel(r.payment_mode)}` : ''}{r.reference ? ` · ${r.reference}` : ''}
                </div>
                {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
                {r.recorded_by && <div className="text-[11px] text-slate-400">Added by {r.recorded_by}</div>}
              </div>
              {canManage && (
                <button className="text-xs font-bold text-red-600 hover:underline shrink-0" onClick={() => undo(r)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
