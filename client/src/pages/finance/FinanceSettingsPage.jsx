import React, { useCallback, useEffect, useState } from 'react';
import { Settings2, Save, Landmark, FileSignature, ScrollText, Hash, Tags } from 'lucide-react';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, errorMessage, inputCls, btnPrimary } from '../project-flow/flowUi';
import { GST_RATES } from './gstMath';

const Field = ({ label, children, hint, wide }) => (
  <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
    <span className="text-xs font-bold text-slate-600">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);

const Card = ({ icon: Icon, title, subtitle, children }) => (
  <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-red-600" />
      <div>
        <h2 className="font-black text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

function SeriesRow({ s, canEdit, onSaved }) {
  const [f, setF] = useState({ prefix: s.prefix, nextNumber: s.next_number, padding: s.padding, fyReset: s.fy_reset });
  const [msg, setMsg] = useState('');
  const dirty = f.prefix !== s.prefix || Number(f.nextNumber) !== s.next_number || Number(f.padding) !== s.padding || f.fyReset !== s.fy_reset;
  const save = async () => {
    setMsg('');
    try {
      await financeService.updateSeries(s.code, { ...f, nextNumber: Number(f.nextNumber), padding: Number(f.padding) });
      onSaved();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-3">
        <div className="font-bold text-slate-800 text-sm">{s.code}</div>
        <div className="text-[11px] text-slate-500">{s.label}</div>
      </td>
      <td className="py-2 pr-3"><input aria-label={`${s.code} prefix`} disabled={!canEdit} className={`${inputCls} !w-24`} value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></td>
      <td className="py-2 pr-3"><input aria-label={`${s.code} next number`} disabled={!canEdit} type="number" min="1" className={`${inputCls} !w-24`} value={f.nextNumber} onChange={(e) => setF({ ...f, nextNumber: e.target.value })} /></td>
      <td className="py-2 pr-3"><input aria-label={`${s.code} digits`} disabled={!canEdit} type="number" min="1" max="8" className={`${inputCls} !w-16`} value={f.padding} onChange={(e) => setF({ ...f, padding: e.target.value })} /></td>
      <td className="py-2 pr-3"><input aria-label={`${s.code} reset each financial year`} disabled={!canEdit} type="checkbox" checked={f.fyReset} onChange={(e) => setF({ ...f, fyReset: e.target.checked })} /></td>
      <td className="py-2 pr-3 font-mono text-xs text-slate-600">{s.preview}</td>
      <td className="py-2 text-right">
        {canEdit && dirty && <button className="text-xs font-bold text-red-600 hover:underline" onClick={save}>Save</button>}
        {msg && <div className="text-[11px] text-red-600">{msg}</div>}
      </td>
    </tr>
  );
}

function ServiceRow({ s, canEdit, onSaved }) {
  const [f, setF] = useState({ sacCode: s.sac_code || '', defaultRate: s.default_rate ?? '', gstRate: s.gst_rate, billingDetails: s.billing_details || '' });
  const [msg, setMsg] = useState('');
  const dirty = f.sacCode !== (s.sac_code || '') || String(f.defaultRate) !== String(s.default_rate ?? '') || Number(f.gstRate) !== s.gst_rate || f.billingDetails !== (s.billing_details || '');
  const save = async () => {
    setMsg('');
    try {
      await financeService.updateServiceTax(s.id, { ...f, defaultRate: f.defaultRate === '' ? null : Number(f.defaultRate), gstRate: Number(f.gstRate) });
      onSaved();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-3"><div className="font-semibold text-sm text-slate-800">{s.name}</div><div className="text-[11px] text-slate-400">{s.category}</div></td>
      <td className="py-2 pr-3"><input aria-label={`${s.name} SAC`} disabled={!canEdit} className={`${inputCls} !w-24`} placeholder="998361" value={f.sacCode} onChange={(e) => setF({ ...f, sacCode: e.target.value })} /></td>
      <td className="py-2 pr-3"><input aria-label={`${s.name} default rate`} disabled={!canEdit} type="number" min="0" className={`${inputCls} !w-28`} placeholder="—" value={f.defaultRate} onChange={(e) => setF({ ...f, defaultRate: e.target.value })} /></td>
      <td className="py-2 pr-3">
        <select aria-label={`${s.name} GST rate`} disabled={!canEdit} className={`${inputCls} !w-20`} value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })}>
          {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      <td className="py-2 pr-3 min-w-[200px]"><textarea aria-label={`${s.name} invoice details`} disabled={!canEdit} rows={1} className={inputCls} placeholder="Default sub-lines on invoices" value={f.billingDetails} onChange={(e) => setF({ ...f, billingDetails: e.target.value })} /></td>
      <td className="py-2 text-right">
        {canEdit && dirty && <button className="text-xs font-bold text-red-600 hover:underline" onClick={save}>Save</button>}
        {msg && <div className="text-[11px] text-red-600">{msg}</div>}
      </td>
    </tr>
  );
}

export function FinanceSettingsPage() {
  const { hasPermission, isOwner } = usePermission();
  const canEdit = isOwner || hasPermission('finance.settings.manage');
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await financeService.getLookups();
      setData(res.data);
      setForm(res.data.settings);
    } catch (err) {
      setError(errorMessage(err, 'Could not load finance settings'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const gstinState = /^\d{2}/.test(form.gstin || '') ? data?.states.find((s) => s.code === form.gstin.slice(0, 2)) : null;

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    const keys = ['agency_name', 'legal_name', 'gstin', 'pan', 'phone', 'email', 'website', 'address', 'city', 'state_code', 'pincode', 'bank_name', 'account_name', 'account_number', 'ifsc', 'branch', 'upi_id', 'gpay_number', 'signatory_name', 'signatory_title', 'terms_scope', 'terms_payment', 'terms_third_party', 'terms_confidentiality', 'terms_cancellation', 'default_payment_terms_days'];
    const payload = Object.fromEntries(keys.map((k) => [k, form[k] ?? null]));
    payload.default_payment_terms_days = Number(form.default_payment_terms_days || 0);
    try {
      const res = await financeService.updateSettings(payload);
      setForm(res.data.settings);
      setSaveMsg({ ok: true, text: 'Saved. New invoices use these details.' });
    } catch (err) {
      setSaveMsg({ ok: false, text: errorMessage(err, 'Could not save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center"><Settings2 className="w-5 h-5 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Finance Settings</h1>
            <p className="text-sm text-slate-500">Agency GST profile, bank details and terms printed on every invoice.</p>
          </div>
        </div>
        {canEdit && <button className={btnPrimary} onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save settings'}</button>}
      </div>
      {saveMsg && <div role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold border ${saveMsg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>{saveMsg.text}</div>}
      {!canEdit && <p className="text-xs text-slate-500">You can view these settings; only owners and admins can change them.</p>}

      <PageState loading={loading} error={error} onRetry={load}>
        {data && (
          <fieldset disabled={!canEdit} className="space-y-6">
            <Card icon={Settings2} title="Agency profile" subtitle="The registration state decides CGST + SGST (same state) or IGST (other state).">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Agency name *"><input className={inputCls} value={form.agency_name || ''} onChange={set('agency_name')} /></Field>
                <Field label="Legal name (if different)"><input className={inputCls} value={form.legal_name || ''} onChange={set('legal_name')} /></Field>
                <Field label="GSTIN" hint={gstinState ? `Registered in ${gstinState.name} (${gstinState.code})` : '15 characters; sets the state automatically'}>
                  <input className={`${inputCls} uppercase`} maxLength={15} value={form.gstin || ''} onChange={set('gstin')} placeholder="33ABCDE1234F1Z5" />
                </Field>
                <Field label="PAN"><input className={`${inputCls} uppercase`} maxLength={10} value={form.pan || ''} onChange={set('pan')} /></Field>
                <Field label="State (place of registration)">
                  <select className={inputCls} value={gstinState?.code || form.state_code || ''} disabled={Boolean(gstinState)} onChange={set('state_code')}>
                    {data.states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                  </select>
                </Field>
                <Field label="Default payment terms (days)"><input type="number" min="0" className={inputCls} value={form.default_payment_terms_days ?? 7} onChange={set('default_payment_terms_days')} /></Field>
                <Field label="Address" wide><textarea rows={2} className={inputCls} value={form.address || ''} onChange={set('address')} /></Field>
                <Field label="City"><input className={inputCls} value={form.city || ''} onChange={set('city')} /></Field>
                <Field label="Pincode"><input className={inputCls} value={form.pincode || ''} onChange={set('pincode')} /></Field>
                <Field label="Phone numbers"><input className={inputCls} value={form.phone || ''} onChange={set('phone')} /></Field>
                <Field label="Email"><input type="email" className={inputCls} value={form.email || ''} onChange={set('email')} /></Field>
              </div>
            </Card>

            <Card icon={Landmark} title="Bank & UPI" subtitle="Printed in the “Pay to” box of each invoice.">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Account name"><input className={inputCls} value={form.account_name || ''} onChange={set('account_name')} /></Field>
                <Field label="Bank name"><input className={inputCls} value={form.bank_name || ''} onChange={set('bank_name')} /></Field>
                <Field label="Account number"><input className={inputCls} value={form.account_number || ''} onChange={set('account_number')} /></Field>
                <Field label="IFSC"><input className={`${inputCls} uppercase`} maxLength={11} value={form.ifsc || ''} onChange={set('ifsc')} /></Field>
                <Field label="Branch"><input className={inputCls} value={form.branch || ''} onChange={set('branch')} /></Field>
                <Field label="UPI ID"><input className={inputCls} value={form.upi_id || ''} onChange={set('upi_id')} /></Field>
                <Field label="GPay number"><input className={inputCls} value={form.gpay_number || ''} onChange={set('gpay_number')} /></Field>
              </div>
            </Card>

            <Card icon={FileSignature} title="Authorised signatory">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Name"><input className={inputCls} value={form.signatory_name || ''} onChange={set('signatory_name')} /></Field>
                <Field label="Title"><input className={inputCls} value={form.signatory_title || ''} onChange={set('signatory_title')} placeholder="Director" /></Field>
              </div>
            </Card>

            <Card icon={ScrollText} title="Invoice terms & conditions" subtitle="Empty sections are left off the invoice.">
              <div className="grid gap-3">
                {[['terms_scope', 'Scope of work'], ['terms_payment', 'Payment terms'], ['terms_third_party', 'Third-party tools & credits'], ['terms_confidentiality', 'Confidentiality'], ['terms_cancellation', 'Cancellation policy']].map(([k, l]) => (
                  <Field key={k} label={l}><textarea rows={2} className={inputCls} value={form[k] || ''} onChange={set(k)} /></Field>
                ))}
              </div>
            </Card>
          </fieldset>
        )}

        {data && (
          <>
            <Card icon={Hash} title="Invoice number series" subtitle="Numbers are taken only when an invoice is issued, so drafts never leave gaps. To continue the old portal's numbering, set the next number.">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400"><th className="pb-2">Series</th><th className="pb-2">Prefix</th><th className="pb-2">Next no.</th><th className="pb-2">Digits</th><th className="pb-2">Reset each FY</th><th className="pb-2">Next will be</th><th /></tr></thead>
                  <tbody>{data.series.map((s) => <SeriesRow key={`${s.code}-${s.next_number}-${s.prefix}-${s.fy_reset}`} s={s} canEdit={canEdit} onSaved={load} />)}</tbody>
                </table>
              </div>
            </Card>

            <Card icon={Tags} title="Service tax codes" subtitle="Picked automatically when a service is added to an invoice.">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="text-[11px] font-black uppercase tracking-wider text-slate-400"><th className="pb-2">Service</th><th className="pb-2">SAC</th><th className="pb-2">Default rate ₹</th><th className="pb-2">GST</th><th className="pb-2">Invoice details</th><th /></tr></thead>
                  <tbody>{data.services.map((s) => <ServiceRow key={`${s.id}-${s.sac_code}-${s.gst_rate}-${s.default_rate}-${s.billing_details}`} s={s} canEdit={canEdit} onSaved={load} />)}</tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </PageState>
    </div>
  );
}
