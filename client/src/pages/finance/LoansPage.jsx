import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Plus, ChevronLeft, ChevronRight, Pencil, Trash2, CalendarClock, AlertTriangle, BellRing, Undo2, Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { loansService, expensesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, humanize, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr, inr0 } from './gstMath';
import { Modal, Field, Kpi, Banner, Tabs, DueChip, DUE_STYLE, PAYMENT_MODES, modeLabel, todayIso, thisMonth, shiftMonth, monthLabel, dueText } from './miscUi';

const LOAN_TYPES = [['emi', 'EMI purchase'], ['loan', 'Loan'], ['credit_card', 'Credit card EMI'], ['other', 'Other']];
const typeLabel = (t) => LOAN_TYPES.find(([k]) => k === t)?.[1] || humanize(t);

/** Due date of the n-th EMI (1-based) from a first date and due day. */
const nthDue = (first, dueDay, n) => {
  const [y, m] = first.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + (n - 1), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${d.toISOString().slice(0, 7)}-${String(Math.min(dueDay, last)).padStart(2, '0')}`;
};
const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
};

function LoanForm({ loan, staff, onClose, onSaved }) {
  const [f, setF] = useState(() => loan ? {
    lender: loan.lender, title: loan.title, loanType: loan.loan_type, principalAmount: loan.principal_amount ?? '', emiAmount: loan.emi_amount,
    dueDay: loan.due_day, firstDueDate: loan.first_due_date, count: monthsBetween(loan.first_due_date, loan.last_due_date),
    paymentMode: loan.payment_mode || '', accountRef: loan.account_ref || '', reminderDaysBefore: loan.reminder_days_before, ownerUserId: loan.owner_user_id || '', notes: loan.notes || ''
  } : {
    lender: '', title: '', loanType: 'emi', principalAmount: '', emiAmount: '', dueDay: 5, firstDueDate: '', count: 12,
    paymentMode: 'auto_debit', accountRef: '', reminderDaysBefore: 3, ownerUserId: '', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const count = Math.max(1, Math.min(600, Number(f.count) || 1));
  const dueDay = Math.max(1, Math.min(31, Number(f.dueDay) || 1));
  const first = f.firstDueDate ? nthDue(f.firstDueDate, dueDay, 1) : '';
  const last = first ? nthDue(first, dueDay, count) : '';
  const total = (Number(f.emiAmount) || 0) * count;
  const interest = f.principalAmount ? total - Number(f.principalAmount) : null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { ...f, dueDay, firstDueDate: first, lastDueDate: last, ownerUserId: f.ownerUserId || null };
      delete body.count;
      const r = loan ? await loansService.update(loan.id, body) : await loansService.create(body);
      onSaved(loan ? 'Loan updated. Unpaid EMIs follow the new amount and dates; paid EMIs are kept as they were.' : `Loan added with ${r.data.installments.length} EMIs.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
      setSaving(false);
    }
  };

  return (
    <Modal title={loan ? 'Edit loan' : 'Add EMI / loan'} subtitle="The EMI schedule is created automatically, one instalment per month." onClose={onClose} wide
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving || !first} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Lender / bank"><input className={inputCls} value={f.lender} onChange={set('lender')} placeholder="e.g. HDFC Bank" /></Field>
        <Field label="What is it for"><input className={inputCls} value={f.title} onChange={set('title')} placeholder="e.g. Office laptop EMI" /></Field>
        <Field label="Type">
          <select className={inputCls} value={f.loanType} onChange={set('loanType')}>{LOAN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Loan / purchase amount (₹)" hint="Optional — used to show the interest paid"><input type="number" min="0" className={inputCls} value={f.principalAmount} onChange={set('principalAmount')} /></Field>
        <Field label="EMI amount (₹ per month)"><input type="number" min="0" className={inputCls} value={f.emiAmount} onChange={set('emiAmount')} /></Field>
        <Field label="Due day of the month"><input type="number" min="1" max="31" className={inputCls} value={f.dueDay} onChange={set('dueDay')} /></Field>
        <Field label="First EMI month" hint="Pick any date in the month of the first EMI"><input type="date" className={inputCls} value={f.firstDueDate} onChange={set('firstDueDate')} /></Field>
        <Field label="Number of EMIs"><input type="number" min="1" max="600" className={inputCls} value={f.count} onChange={set('count')} /></Field>
      </div>
      {first && (
        <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-900">
          <b>{count} EMIs</b> of {inr(f.emiAmount || 0)} · first on <b>{fmtDate(first)}</b>, last on <b>{fmtDate(last)}</b> · total {inr0(total)}
          {interest != null && interest > 0 && <> · interest {inr0(interest)}</>}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Paid by">
          <select className={inputCls} value={f.paymentMode} onChange={set('paymentMode')}>
            <option value="">—</option>{PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Account / loan number"><input className={inputCls} value={f.accountRef} onChange={set('accountRef')} placeholder="Last 4 digits is enough" /></Field>
        <Field label="Remind me before (days)" hint="Also reminded on the due day, and every day while overdue">
          <input type="number" min="0" max="15" className={inputCls} value={f.reminderDaysBefore} onChange={set('reminderDaysBefore')} />
        </Field>
        <Field label="Responsible person" hint="Gets the reminders, along with admins">
          <select className={inputCls} value={f.ownerUserId} onChange={set('ownerUserId')}>
            <option value="">Me</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea rows={2} className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

function PayModal({ inst, onClose, onSaved }) {
  const [f, setF] = useState({ paidDate: todayIso(), amount: inst.amount, paymentMode: inst.payment_mode || inst.loan_mode || 'auto_debit', reference: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    try {
      const r = await loansService.pay(inst.id, f);
      onSaved(r.data.loan.status === 'closed' ? `Last EMI paid — ${r.data.loan.lender} ${r.data.loan.title} is now closed.` : `EMI ${inst.installment_no} paid and added to expenses.`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <Modal title={`Pay EMI ${inst.installment_no}${inst.total_count ? ` of ${inst.total_count}` : ''}`} subtitle={`${inst.lender ? `${inst.lender} — ${inst.title} · ` : ''}due ${fmtDate(inst.due_date)}`} onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={save}><CheckCircle2 className="w-4 h-4" /> Mark paid</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      {inst.is_last && <div className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-2 text-sm font-semibold text-orange-800">This is the last EMI. The loan closes once it is paid.</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid on"><input type="date" className={inputCls} value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} /></Field>
        <Field label="Amount paid (₹)" hint="Change if a penalty or part was paid"><input type="number" min="0" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Mode">
          <select className={inputCls} value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value })}>{PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Reference / UTR"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function InstRow({ i, canManage, onPay, onUndo, showLoan }) {
  const st = DUE_STYLE[i.state] || DUE_STYLE.upcoming;
  return (
    <tr className={`${st.row} align-middle`}>
      <td className="pl-4 pr-1 py-3 w-1"><span className={`block w-1.5 h-8 rounded-full ${st.bar}`} /></td>
      {showLoan && (
        <td className="px-3 py-3">
          <div className="font-semibold text-slate-800">{i.lender}</div>
          <div className="text-xs text-slate-500">{i.title}{i.carried_over && <span className="ml-1 font-bold text-red-600">· from {monthLabel(i.due_date.slice(0, 7))}</span>}</div>
        </td>
      )}
      <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-semibold">EMI {i.installment_no}{i.total_count ? `/${i.total_count}` : ''}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-slate-800">{fmtDate(i.due_date)}</div>
        {!['paid', 'skipped'].includes(i.state) && <div className={`text-xs font-semibold ${i.state === 'overdue' ? 'text-red-600' : i.state === 'upcoming' ? 'text-slate-400' : 'text-orange-600'}`}>{dueText(i.due_date)}</div>}
        {i.state === 'paid' && <div className="text-xs text-emerald-700">paid {fmtDate(i.paid_date)}{i.payment_mode ? ` · ${modeLabel(i.payment_mode)}` : ''}</div>}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-slate-900">{inr(i.paid_amount ?? i.amount)}</td>
      <td className="px-3 py-3"><DueChip state={i.state} isLast={i.is_last} /></td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        {canManage && i.state !== 'paid' && i.state !== 'skipped' && (
          <button onClick={() => onPay(i)} className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${i.state === 'overdue' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-700'}`}>Pay</button>
        )}
        {canManage && i.state === 'paid' && (
          <button onClick={() => onUndo(i)} title="Undo this payment" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><Undo2 className="w-4 h-4" /></button>
        )}
      </td>
    </tr>
  );
}

function ScheduleModal({ loanId, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => loansService.get(loanId).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err))), [loanId]);
  useEffect(() => { load(); }, [load]);
  const undo = async (i) => {
    if (!window.confirm(`Undo the payment for EMI ${i.installment_no}? Its expense entry is removed too.`)) return;
    try { await loansService.undo(i.id); load(); onChanged('Payment undone.'); } catch (err) { setError(errorMessage(err)); }
  };
  const l = data?.loan;
  return (
    <Modal title={l ? `${l.lender} — ${l.title}` : 'EMI schedule'} subtitle={l ? `${typeLabel(l.loan_type)} · ${inr(l.emi_amount)} on day ${l.due_day} · ${l.paid_count}/${l.total_count} paid` : ''} onClose={onClose} wide>
      {error && <Banner tone="error">{error}</Banner>}
      {!data ? <p className="text-sm text-slate-400">Loading…</p> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Paid" value={inr0(l.paid_amount)} tone="text-emerald-700" />
            <Kpi label="Remaining" value={inr0(l.remaining_amount)} />
            <Kpi label="Overdue" value={inr0(l.overdue_amount)} tone={l.overdue_amount ? 'text-red-600' : 'text-slate-900'} />
          </div>
          <div className="border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <tbody className="divide-y divide-slate-100">
                {data.installments.map((i) => <InstRow key={i.id} i={{ ...i, total_count: data.installments.length }} canManage={canManage} onPay={(x) => setPaying({ ...x, lender: l.lender, title: l.title, loan_mode: l.payment_mode })} onUndo={undo} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
      {paying && <PayModal inst={paying} onClose={() => setPaying(null)} onSaved={(m) => { setPaying(null); load(); onChanged(m); }} />}
    </Modal>
  );
}

function LoanCard({ l, canManage, onOpen, onEdit, onClose, onReopen, onDelete }) {
  const n = l.next_due;
  const tone = l.status === 'closed' ? 'border-slate-200' : l.overdue_count ? 'border-red-300 ring-1 ring-red-100' : l.final_phase || ['due_today', 'due_soon'].includes(n?.state) ? 'border-orange-300 ring-1 ring-orange-100' : 'border-slate-100';
  const bar = l.status === 'closed' ? 'bg-emerald-500' : l.overdue_count ? 'bg-red-500' : l.final_phase ? 'bg-orange-500' : 'bg-slate-800';
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left min-w-0">
          <div className="font-black text-slate-900 truncate hover:text-red-600">{l.lender}</div>
          <div className="text-xs text-slate-500 truncate">{l.title} · {typeLabel(l.loan_type)}</div>
        </button>
        <div className="text-right shrink-0">
          <div className="font-black text-slate-900">{inr0(l.emi_amount)}</div>
          <div className="text-[11px] text-slate-400">per month · day {l.due_day}</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1"><span>{l.paid_count}/{l.total_count} EMIs paid</span><span>{l.progress}%</span></div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${bar}`} style={{ width: `${l.progress}%` }} /></div>
      </div>
      {l.status === 'closed' ? (
        <div className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Closed{l.closed_at ? ` on ${fmtDate(String(l.closed_at).slice(0, 10))}` : ''}</div>
      ) : (
        <div className="space-y-1.5 text-sm">
          {l.overdue_count > 0 && <div className="font-bold text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {l.overdue_count} EMI{l.overdue_count > 1 ? 's' : ''} overdue · {inr0(l.overdue_amount)}</div>}
          {l.final_phase && <div className="font-bold text-orange-600 flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Closing soon — {l.remaining_count} EMI{l.remaining_count > 1 ? 's' : ''} left</div>}
          {n && <div className="flex items-center justify-between gap-2"><span className="text-slate-600">Next: <b>{fmtDate(n.date)}</b> <span className="text-xs text-slate-400">({dueText(n.date)})</span></span><DueChip state={n.state} isLast={n.is_last} /></div>}
          <div className="text-xs text-slate-500">Remaining {inr0(l.remaining_amount)} · ends {fmtDate(l.last_due_date)}{l.owner_name ? ` · ${l.owner_name}` : ''}</div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-50 mt-auto">
        <button onClick={onOpen} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">Schedule</button>
        {canManage && l.status === 'active' && <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>}
        {canManage && l.status === 'active' && <button onClick={onClose} title="Close early (prepaid / foreclosed)" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Lock className="w-4 h-4" /></button>}
        {canManage && l.status === 'closed' && <button onClick={onReopen} title="Reopen" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Unlock className="w-4 h-4" /></button>}
        {canManage && l.paid_count === 0 && <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 ml-auto"><Trash2 className="w-4 h-4" /></button>}
      </div>
    </div>
  );
}

export function LoansPage() {
  const { hasPermission, isOwner } = usePermission();
  const canManage = isOwner || hasPermission('expenses.manage');
  const [tab, setTab] = useState('month');
  const [month, setMonth] = useState(thisMonth());
  const [loans, setLoans] = useState(null);
  const [dues, setDues] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null); // { loan? }
  const [schedule, setSchedule] = useState(null);
  const [paying, setPaying] = useState(null);

  useEffect(() => { expensesService.lookups().then((r) => setStaff(r.data.staff)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setError('');
    try {
      const [l, d] = await Promise.all([loansService.list(), loansService.dues(month)]);
      setLoans(l.data);
      setDues(d.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load loans'));
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const done = (text) => { setForm(null); setPaying(null); setMsg(text); load(); };
  const act = async (fn, text) => { try { await fn(); done(text); } catch (err) { window.alert(errorMessage(err)); } };
  const undo = (i) => window.confirm(`Undo the payment for EMI ${i.installment_no}? Its expense entry is removed too.`) && act(() => loansService.undo(i.id), 'Payment undone.');
  const closeLoan = (l) => {
    const note = window.prompt(`Close ${l.lender} — ${l.title} early? Remaining ${l.remaining_count} EMIs will be marked closed. Add a note (e.g. "Foreclosed"):`, 'Foreclosed');
    if (note !== null) act(() => loansService.close(l.id, { note }), 'Loan closed.');
  };

  const active = useMemo(() => (loans?.loans || []).filter((l) => l.status === 'active'), [loans]);
  const closed = useMemo(() => (loans?.loans || []).filter((l) => l.status === 'closed'), [loans]);
  const allOverdue = useMemo(() => active.reduce((a, l) => a + l.overdue_count, 0), [active]);
  const dueNow = (dues?.items || []).filter((i) => ['due_today', 'due_soon'].includes(i.state));
  const lastOnes = active.filter((l) => l.next_due?.is_last);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5 text-orange-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">EMI & Loans</h1>
            <p className="text-sm text-slate-500">Every EMI on one monthly roster. Reminders go out before the due day, on the day, and every day while it is overdue.</p>
          </div>
        </div>
        {canManage && <button className={btnPrimary} onClick={() => setForm({})}><Plus className="w-4 h-4" /> Add EMI / loan</button>}
      </div>
      {msg && <Banner onClose={() => setMsg('')}>{msg}</Banner>}

      <PageState loading={loading} error={error} onRetry={load}>
        {loans && dues && (
          <>
            {allOverdue > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-800"><b>{allOverdue} EMI{allOverdue > 1 ? 's are' : ' is'} overdue</b> — {inr(loans.totals.overdue)} in total. Late EMIs can attract penalties and hurt the credit score; pay and mark them paid.</div>
              </div>
            )}
            {(dueNow.length > 0 || lastOnes.length > 0) && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
                <BellRing className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="text-sm text-orange-900 space-y-0.5">
                  {dueNow.length > 0 && <div><b>{dueNow.length} EMI{dueNow.length > 1 ? 's' : ''} due soon:</b> {dueNow.map((i) => `${i.lender} ${inr0(i.amount)} (${dueText(i.due_date)})`).join(' · ')}</div>}
                  {lastOnes.length > 0 && <div><b>Final EMI coming up:</b> {lastOnes.map((l) => `${l.lender} — ${l.title} on ${fmtDate(l.next_due.date)}`).join(' · ')}</div>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi label="Monthly EMI" value={inr0(loans.totals.monthlyEmi)} sub={`${loans.totals.active} active loan${loans.totals.active === 1 ? '' : 's'}`} />
              <Kpi label={`Due in ${monthLabel(month).split(' ')[0]}`} value={inr0(dues.totals.due)} sub={`${dues.totals.paidCount}/${dues.totals.count} paid`} />
              <Kpi label="Paid this month" value={inr0(dues.totals.paid)} tone="text-emerald-700" />
              <Kpi label="Overdue" value={inr0(loans.totals.overdue)} tone={loans.totals.overdue ? 'text-red-600' : 'text-slate-900'} />
              <Kpi label="Still to repay" value={inr0(loans.totals.remaining)} sub="All active loans" />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[['month', 'Monthly roster', dues.items.length], ['loans', 'Active loans', active.length], ['closed', 'Closed', closed.length]]} />

            {tab === 'month' && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
                  <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
                  <div className="text-center">
                    <div className="font-black text-slate-900">{monthLabel(month)}</div>
                    {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-[11px] font-bold text-red-600 hover:underline">Back to this month</button>}
                  </div>
                  <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-50">
                  {['overdue', 'due_today', 'due_soon', 'upcoming', 'paid'].map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${DUE_STYLE[s].bar}`} />{DUE_STYLE[s].label}</span>)}
                  <span className="inline-flex items-center gap-1.5"><span className="px-1.5 rounded bg-orange-500 text-white font-bold">Last EMI</span> final instalment</span>
                </div>
                {dues.items.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-400 text-center">No EMIs in {monthLabel(month)}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <tbody className="divide-y divide-slate-100">
                        {dues.items.map((i) => <InstRow key={i.id} i={i} showLoan canManage={canManage} onPay={setPaying} onUndo={undo} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab !== 'month' && ((tab === 'loans' ? active : closed).length === 0 ? (
              <Empty icon={Landmark} title={tab === 'loans' ? 'No active EMIs or loans' : 'No closed loans yet'} text={tab === 'loans' ? 'Add an EMI or loan and its monthly schedule is created for you.' : 'Loans close by themselves when the last EMI is paid.'} />
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {(tab === 'loans' ? active : closed).map((l) => (
                  <LoanCard key={l.id} l={l} canManage={canManage} onOpen={() => setSchedule(l.id)} onEdit={() => setForm({ loan: l })}
                    onClose={() => closeLoan(l)} onReopen={() => act(() => loansService.reopen(l.id), 'Loan reopened.')}
                    onDelete={() => window.confirm(`Delete ${l.lender} — ${l.title} and its schedule?`) && act(() => loansService.remove(l.id), 'Loan deleted.')} />
                ))}
              </div>
            ))}
          </>
        )}
      </PageState>

      {form && <LoanForm loan={form.loan} staff={staff} onClose={() => setForm(null)} onSaved={done} />}
      {paying && <PayModal inst={paying} onClose={() => setPaying(null)} onSaved={done} />}
      {schedule && <ScheduleModal loanId={schedule} canManage={canManage} onClose={() => { setSchedule(null); load(); }} onChanged={setMsg} />}
    </div>
  );
}
