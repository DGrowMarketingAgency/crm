import React, { useState } from 'react';
import { X } from 'lucide-react';
import { financeService } from '../../services/api';
import { errorMessage, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';

/** Edit a client's GST / billing profile (GSTIN sets the state automatically). */
export function ClientGstModal({ client, states, onClose, onSaved }) {
  const [f, setF] = useState({
    gstin: client.gstin || '',
    pan: client.pan || '',
    billingAddress: client.billing_address || client.address || '',
    city: client.city || '',
    stateCode: client.state_code || '',
    pincode: client.pincode || '',
    paymentTermsDays: client.payment_terms_days ?? ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const gstinState = /^\d{2}/.test(f.gstin) ? states.find((s) => s.code === f.gstin.slice(0, 2)) : null;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await financeService.updateClientBilling(client.id, {
        ...f,
        gstin: f.gstin.trim(),
        pan: f.pan.trim(),
        stateCode: gstinState ? gstinState.code : f.stateCode,
        paymentTermsDays: f.paymentTermsDays === '' ? null : Number(f.paymentTermsDays)
      });
      onSaved(res.data.client);
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">GST & billing profile</h2>
            <p className="text-xs text-slate-500">{client.company_name || client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">GSTIN</span>
            <input className={`${inputCls} uppercase`} maxLength={15} value={f.gstin} onChange={set('gstin')} placeholder="Leave empty if unregistered" />
            <span className="text-[11px] text-slate-400">{gstinState ? `Registered in ${gstinState.name}` : 'Needed for INC invoices'}</span>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">PAN</span>
            <input className={`${inputCls} uppercase`} maxLength={10} value={f.pan} onChange={set('pan')} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-bold text-slate-600">Billing address</span>
            <textarea rows={2} className={inputCls} value={f.billingAddress} onChange={set('billingAddress')} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">City</span>
            <input className={inputCls} value={f.city} onChange={set('city')} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Pincode</span>
            <input className={inputCls} value={f.pincode} onChange={set('pincode')} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">State (place of supply)</span>
            <select className={inputCls} value={gstinState?.code || f.stateCode} disabled={Boolean(gstinState)} onChange={set('stateCode')}>
              <option value="">— Select state —</option>
              {states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Payment terms (days)</span>
            <input type="number" min="0" className={inputCls} value={f.paymentTermsDays} onChange={set('paymentTermsDays')} placeholder="Agency default" />
          </label>
          {error && <p className="md:col-span-2 text-sm font-semibold text-red-600" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
    </div>
  );
}
