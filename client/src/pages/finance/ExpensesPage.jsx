import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Plus, ShoppingCart, FolderTree, Search, Pencil, Trash2, CheckCircle2, Download, Landmark } from 'lucide-react';
import { expensesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, fmtDate, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { inr, inr0 } from './gstMath';
import { Modal, Field, Kpi, Banner, PAYMENT_MODES, PERIODS, modeLabel, periodParams, todayIso } from './miscUi';

const GST_RATES = [5, 12, 18, 28];
const blank = (isPurchase = false) => ({
  expenseDate: todayIso(), categoryId: '', subcategoryId: '', description: '', amount: '', paymentMode: 'upi', status: 'paid', paidDate: '',
  clientId: '', payee: '', reference: '', isPurchase, vendorGstin: '', billNumber: '', gstAmount: '', notes: ''
});
const fromRow = (e) => ({
  expenseDate: e.expense_date, categoryId: e.category_id, subcategoryId: e.subcategory_id || '', description: e.description, amount: e.amount,
  paymentMode: e.payment_mode || '', status: e.status, paidDate: e.paid_date || '', clientId: e.client_id || '', payee: e.payee || '',
  reference: e.reference || '', isPurchase: e.is_purchase, vendorGstin: e.vendor_gstin || '', billNumber: e.bill_number || '',
  gstAmount: e.gst_amount ?? '', notes: e.notes || ''
});

const NEW = '__new';

function ExpenseForm({ initial, id, categories, clients, canManage, onCategoriesChanged, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const cats = categories.filter((c) => c.kind === 'expense' || c.id === Number(f.categoryId));
  const cat = categories.find((c) => c.id === Number(f.categoryId));

  // "+ New category" / "+ New sub-category" straight from the dropdowns: created and selected in one go.
  const createInline = async (kind) => {
    const name = window.prompt(kind === 'cat' ? 'Name of the new category' : `New sub-category under "${cat?.name}"`)?.trim();
    if (!name) return;
    if (name.length < 2) { setError('The name needs at least 2 letters'); return; }
    setError('');
    try {
      const r = kind === 'cat' ? await expensesService.addCategory({ name }) : await expensesService.addSubcategory(cat.id, { name });
      const list = r.data.categories;
      onCategoriesChanged(list);
      if (kind === 'cat') {
        const c = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
        setF((p) => ({ ...p, categoryId: c ? String(c.id) : '', subcategoryId: '' }));
      } else {
        const s = list.find((x) => x.id === cat.id)?.subcategories.find((x) => x.name.toLowerCase() === name.toLowerCase());
        setF((p) => ({ ...p, subcategoryId: s ? String(s.id) : '' }));
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not add it'));
    }
  };
  const onCategory = (e) => (e.target.value === NEW ? createInline('cat') : setF((p) => ({ ...p, categoryId: e.target.value, subcategoryId: '' })));
  const onSub = (e) => (e.target.value === NEW ? createInline('sub') : setF((p) => ({ ...p, subcategoryId: e.target.value })));
  const amount = Number(f.amount) || 0;
  const gst = Number(f.gstAmount) || 0;
  // GST included in the bill amount: gst = amount × r / (100 + r)
  const applyRate = (r) => setF((p) => ({ ...p, gstAmount: amount ? (Math.round((amount * r / (100 + r)) * 100) / 100).toString() : '' }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { ...f, subcategoryId: f.subcategoryId || null, clientId: f.clientId || null };
      if (!body.isPurchase) Object.assign(body, { vendorGstin: '', billNumber: '', gstAmount: '' });
      if (id) await expensesService.update(id, body);
      else await expensesService.create(body);
      onSaved(id ? 'Expense updated.' : f.isPurchase ? 'Purchase recorded.' : 'Expense recorded.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
      setSaving(false);
    }
  };

  return (
    <Modal title={id ? 'Edit entry' : f.isPurchase ? 'New purchase' : 'New expense'} subtitle={f.isPurchase ? 'Purchases keep the vendor, bill number and GST paid (input tax).' : 'Office running cost or a client-related spend.'}
      onClose={onClose} wide
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={f.isPurchase} onChange={set('isPurchase')} className="rounded" /> This is a purchase with a GST bill
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className={inputCls} value={f.expenseDate} onChange={set('expenseDate')} /></Field>
        <Field label="Amount (₹, incl. GST)"><input type="number" min="0" step="0.01" className={inputCls} value={f.amount} onChange={set('amount')} placeholder="0.00" /></Field>
        <Field label="Category">
          <select className={inputCls} value={f.categoryId} onChange={onCategory}>
            <option value="">Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {canManage && <option value={NEW}>+ New category…</option>}
          </select>
        </Field>
        <Field label="Sub-category" hint={!cat ? 'Pick a category first' : undefined}>
          <select className={inputCls} value={f.subcategoryId} onChange={onSub} disabled={!cat}>
            <option value="">{!cat ? 'Pick a category first' : cat.subcategories.length ? 'Choose… (optional)' : 'None yet (optional)'}</option>
            {cat?.subcategories?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {cat && canManage && <option value={NEW}>+ New sub-category…</option>}
          </select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={set('description')} placeholder="What was it for?" /></Field>
        <Field label={f.isPurchase ? 'Vendor' : 'Paid to'}><input className={inputCls} value={f.payee} onChange={set('payee')} placeholder={f.isPurchase ? 'Vendor / shop name' : 'Optional'} /></Field>
        <Field label="Client (if for a client)">
          <select className={inputCls} value={f.clientId} onChange={set('clientId')}>
            <option value="">Agency (not for a client)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      {f.isPurchase && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 grid sm:grid-cols-3 gap-3">
          <Field label="Vendor GSTIN"><input className={`${inputCls} uppercase`} value={f.vendorGstin} onChange={set('vendorGstin')} placeholder="15 characters" maxLength={15} /></Field>
          <Field label="Bill / invoice no."><input className={inputCls} value={f.billNumber} onChange={set('billNumber')} /></Field>
          <Field label="GST in this bill (₹)">
            <input type="number" min="0" step="0.01" className={inputCls} value={f.gstAmount} onChange={set('gstAmount')} />
          </Field>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-semibold">Work out GST from the amount at</span>
            {GST_RATES.map((r) => <button key={r} type="button" onClick={() => applyRate(r)} className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold hover:border-red-300">{r}%</button>)}
            <span className="ml-auto text-slate-600">Taxable <b>{inr(Math.max(0, amount - gst))}</b> + GST <b>{inr(gst)}</b></span>
          </div>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Status">
          <select className={inputCls} value={f.status} onChange={set('status')}>
            <option value="paid">Paid</option>
            <option value="pending">Not paid yet</option>
          </select>
        </Field>
        <Field label="Payment mode">
          <select className={inputCls} value={f.paymentMode} onChange={set('paymentMode')}>
            <option value="">—</option>
            {PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR"><input className={inputCls} value={f.reference} onChange={set('reference')} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

function CategoryManager({ categories, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [sub, setSub] = useState({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [fresh, setFresh] = useState(null); // { catId, subName } just added → highlighted
  const [busy, setBusy] = useState(false);
  const top = React.useRef(null);

  const run = async (fn, label, mark) => {
    if (busy) return false;
    setError('');
    setOk('');
    setBusy(true);
    try {
      const r = await fn();
      const list = r.data.categories;
      onChanged(list);
      const m = mark(list);
      setFresh(m);
      setOk(label);
      setTimeout(() => document.getElementById(`cat-${m?.catId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Could not add it'));
      top.current?.scrollIntoView({ block: 'start' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addCat = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) { setError('Type a category name (at least 2 letters)'); return; }
    if (await run(() => expensesService.addCategory({ name: n }), `Category "${n}" added — add its sub-categories below.`,
      (list) => ({ catId: list.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id }))) setName('');
  };
  const addSub = (c) => async (e) => {
    e.preventDefault();
    const n = (sub[c.id] || '').trim();
    if (n.length < 2) { setError(`Type a sub-category name for "${c.name}" (at least 2 letters)`); return; }
    if (await run(() => expensesService.addSubcategory(c.id, { name: n }), `Sub-category "${n}" added to ${c.name}.`, () => ({ catId: c.id, subName: n.toLowerCase() })))
      setSub((p) => ({ ...p, [c.id]: '' }));
  };

  return (
    <Modal title="Categories" subtitle="Add your own categories and sub-categories. Type a name and press Enter or Add." onClose={onClose} wide>
      <div ref={top} />
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {ok && <Banner onClose={() => setOk('')}>{ok}</Banner>}
      <form onSubmit={addCat} className="flex gap-2">
        <input className={inputCls} placeholder="New category name, e.g. Marketing Events" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={btnPrimary} disabled={busy}><Plus className="w-4 h-4" /> Add</button>
      </form>
      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {categories.map((c) => (
          <div key={c.id} id={`cat-${c.id}`} className={`p-3 transition-colors ${fresh?.catId === c.id ? 'bg-emerald-50/70' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-slate-800">
                {c.name}
                {c.kind === 'emi' && <span className="ml-2 text-[11px] font-bold text-orange-600">EMI payments</span>}
                {c.sort_order >= 900 && <span className="ml-2 text-[11px] font-bold text-blue-600">Custom</span>}
              </span>
              <span className="text-[11px] text-slate-400">{c.subcategories.length} sub</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {c.subcategories.length === 0 && <span className="text-[11px] text-slate-400">No sub-categories yet</span>}
              {c.subcategories.map((s) => (
                <span key={s.id} className={`px-2 py-0.5 rounded-full text-[11px] ${fresh?.catId === c.id && fresh?.subName === s.name.toLowerCase() ? 'bg-emerald-200 text-emerald-900 font-bold' : 'bg-slate-100 text-slate-600'}`}>{s.name}</span>
              ))}
            </div>
            <form onSubmit={addSub(c)} className="flex gap-2 mt-2">
              <input className={`${inputCls} py-1.5`} placeholder={`Add sub-category to ${c.name}`} value={sub[c.id] || ''} onChange={(e) => setSub((p) => ({ ...p, [c.id]: e.target.value }))} />
              <button type="submit" className={`${btnSecondary} py-1.5`} disabled={busy}>Add</button>
            </form>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function MarkPaid({ row, onClose, onSaved }) {
  const [f, setF] = useState({ paidDate: todayIso(), paymentMode: row.payment_mode || 'upi', reference: row.reference || '' });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await expensesService.markPaid(row.id, f);
      onSaved('Marked as paid.');
    } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal title="Mark as paid" subtitle={`${row.description} · ${inr(row.amount)}`} onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save}>Mark paid</button></>}>
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Paid on"><input type="date" className={inputCls} value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} /></Field>
      <Field label="Payment mode">
        <select className={inputCls} value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value })}>
          {PAYMENT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Reference / UTR"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
    </Modal>
  );
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function ExpensesPage() {
  const { hasPermission, isOwner } = usePermission();
  const canManage = isOwner || hasPermission('expenses.manage');
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState({ categoryId: '', subcategoryId: '', clientId: '', status: '', purchase: '' });
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // { initial, id }
  const [paying, setPaying] = useState(null);
  const [catsOpen, setCatsOpen] = useState(false);

  useEffect(() => {
    Promise.all([expensesService.categories(), expensesService.lookups()])
      .then(([c, l]) => { setCategories(c.data.categories); setClients(l.data.clients); })
      .catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = { ...periodParams(period, range.from, range.to), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), search: q || undefined };
      setData((await expensesService.list(params)).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load expenses'));
    } finally {
      setLoading(false);
    }
  }, [period, range, filters, q]);
  useEffect(() => { load(); }, [load]);

  const done = (text) => { setForm(null); setPaying(null); setMsg(text); load(); };
  const remove = async (e) => {
    if (!window.confirm(`Delete "${e.description}" (${inr(e.amount)})? This cannot be undone.`)) return;
    try { await expensesService.remove(e.id); done('Entry deleted.'); } catch (err) { setMsg(''); setError(''); window.alert(errorMessage(err)); }
  };
  const selCat = categories.find((c) => c.id === Number(filters.categoryId));
  const setFilter = (k) => (e) => setFilters((p) => ({ ...p, [k]: e.target.value, ...(k === 'categoryId' ? { subcategoryId: '' } : {}) }));

  const exportCsv = () => {
    const head = ['Date', 'Description', 'Category', 'Sub-category', 'Client', 'Paid to / vendor', 'Vendor GSTIN', 'Bill no.', 'Taxable', 'GST', 'Amount', 'Status', 'Paid on', 'Mode', 'Reference'];
    const lines = data.expenses.map((e) => [e.expense_date, e.description, e.category_name, e.subcategory_name, e.client_name, e.payee, e.vendor_gstin, e.bill_number,
      e.taxable_amount ?? '', e.gst_amount ?? '', e.amount, e.status, e.paid_date, modeLabel(e.payment_mode), e.reference].map(csvCell).join(','));
    const blob = new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `expenses_${data.range.from}_${data.range.to}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const maxCat = useMemo(() => Math.max(1, ...(data?.byCategory || []).map((c) => c.total)), [data]);
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center shrink-0"><Wallet className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Expenses & Purchases</h1>
            <p className="text-sm text-slate-500">Office running costs, client-related spends and GST purchase bills. EMI payments land here automatically from EMI & Loans.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.expenses?.length > 0 && <button className={btnSecondary} onClick={exportCsv}><Download className="w-4 h-4" /> Export</button>}
          {canManage && <button className={btnSecondary} onClick={() => setCatsOpen(true)}><FolderTree className="w-4 h-4" /> Categories</button>}
          {canManage && <button className={btnSecondary} onClick={() => setForm({ initial: blank(true) })}><ShoppingCart className="w-4 h-4" /> Add purchase</button>}
          {canManage && <button className={btnPrimary} onClick={() => setForm({ initial: blank() })}><Plus className="w-4 h-4" /> Add expense</button>}
        </div>
      </div>
      {msg && <Banner onClose={() => setMsg('')}>{msg}</Banner>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-wrap gap-2 items-center">
        <select aria-label="Period" className={`${inputCls} w-auto`} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {period === 'custom' && (
          <>
            <input aria-label="From" type="date" className={`${inputCls} w-auto`} value={range.from} onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))} />
            <input aria-label="To" type="date" className={`${inputCls} w-auto`} value={range.to} onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))} />
          </>
        )}
        <select aria-label="Category" className={`${inputCls} w-auto`} value={filters.categoryId} onChange={setFilter('categoryId')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {selCat?.subcategories?.length > 0 && (
          <select aria-label="Sub-category" className={`${inputCls} w-auto`} value={filters.subcategoryId} onChange={setFilter('subcategoryId')}>
            <option value="">All sub-categories</option>
            {selCat.subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select aria-label="Client" className={`${inputCls} w-auto`} value={filters.clientId} onChange={setFilter('clientId')}>
          <option value="">Agency + clients</option>
          <option value="agency">Agency only</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Status" className={`${inputCls} w-auto`} value={filters.status} onChange={setFilter('status')}>
          <option value="">Paid + pending</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
        </select>
        <select aria-label="Type" className={`${inputCls} w-auto`} value={filters.purchase} onChange={setFilter('purchase')}>
          <option value="">Expenses + purchases</option>
          <option value="true">GST purchases only</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search description, vendor, bill no." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <Kpi label="Total spent" value={inr0(t.total)} sub={`${t.n} entr${t.n === 1 ? 'y' : 'ies'} · ${fmtDate(data.range.from)} – ${fmtDate(data.range.to)}`} />
              <Kpi label="Paid" value={inr0(t.paid)} tone="text-emerald-700" />
              <Kpi label="Pending" value={inr0(t.pending)} tone={t.pending ? 'text-amber-600' : 'text-slate-900'} />
              <Kpi label="GST input (purchases)" value={inr0(t.gst_input)} tone="text-blue-700" sub="Claimable input tax" />
              <Kpi label="EMI paid" value={inr0(t.emi_paid)} tone="text-orange-600" sub={<Link to="/finance/loans" className="hover:underline">EMI & Loans →</Link>} />
              <Kpi label="Client ad spend" value={inr0(t.adSpend)} tone="text-violet-700" sub={<Link to="/finance/ad-funds" className="hover:underline">From client wallets →</Link>} />
            </div>

            {data.byCategory.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <h2 className="font-black text-slate-900 mb-3 text-sm">Where the money went</h2>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                  {data.byCategory.map((c) => (
                    <button key={c.id} onClick={() => setFilters((p) => ({ ...p, categoryId: String(c.id), subcategoryId: '' }))} className="text-left group">
                      <div className="flex justify-between text-xs font-semibold"><span className="text-slate-700 group-hover:text-red-600">{c.name} <span className="text-slate-400">· {c.n}</span></span><span className="text-slate-900">{inr0(c.total)}</span></div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full rounded-full ${c.kind === 'emi' ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {data.expenses.length === 0 ? (
              <Empty icon={Wallet} title="No entries for these filters" text="Add an expense or a purchase bill, or widen the period." />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                    <tr><th className="text-left px-4 py-2.5">Date</th><th className="text-left px-3">Description</th><th className="text-left px-3">Category</th><th className="text-left px-3">Client</th><th className="text-left px-3">Mode</th><th className="text-right px-3">Amount</th><th className="text-left px-3">Status</th><th className="px-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/60 align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(e.expense_date)}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-800">{e.description}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                            {e.payee && <span>{e.payee}</span>}
                            {e.is_purchase && <span className="text-blue-700 font-semibold">GST bill{e.bill_number ? ` ${e.bill_number}` : ''}{e.vendor_gstin ? ` · ${e.vendor_gstin}` : ''}</span>}
                            {e.reference && <span>Ref {e.reference}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3"><div className="text-slate-700">{e.category_name}</div>{e.subcategory_name && <div className="text-xs text-slate-400">{e.subcategory_name}</div>}</td>
                        <td className="px-3 py-3 text-slate-600">{e.client_name || <span className="text-slate-400">Agency</span>}</td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{modeLabel(e.payment_mode)}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap"><div className="font-bold text-slate-900">{inr(e.amount)}</div>{e.is_purchase && e.gst_amount > 0 && <div className="text-[11px] text-blue-700">GST {inr(e.gst_amount)}</div>}</td>
                        <td className="px-3 py-3">
                          {e.status === 'paid'
                            ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">Paid</span>
                            : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Pending</span>}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {e.loan_id ? (
                            <Link to="/finance/loans" className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"><Landmark className="w-3.5 h-3.5" /> EMI</Link>
                          ) : canManage && (
                            <span className="inline-flex gap-1">
                              {e.status === 'pending' && <button title="Mark paid" onClick={() => setPaying(e)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-4 h-4" /></button>}
                              <button title="Edit" onClick={() => setForm({ initial: fromRow(e), id: e.id })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                              <button title="Delete" onClick={() => remove(e)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PageState>

      {form && <ExpenseForm {...form} categories={categories} clients={clients} canManage={canManage} onCategoriesChanged={setCategories} onClose={() => setForm(null)} onSaved={done} />}
      {paying && <MarkPaid row={paying} onClose={() => setPaying(null)} onSaved={done} />}
      {catsOpen && <CategoryManager categories={categories} onClose={() => setCatsOpen(false)} onChanged={setCategories} />}
    </div>
  );
}
