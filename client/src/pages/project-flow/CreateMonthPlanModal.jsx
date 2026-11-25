import React, { useMemo, useState } from 'react';
import { X, CalendarPlus, Copy, FilePlus2 } from 'lucide-react';
import { projectFlowService } from '../../services/api';
import { errorMessage, inputCls, btnPrimary, btnSecondary, monthKey, monthLabel } from './flowUi';

/** Client → pick a month → start empty or copy the latest earlier month's projects. */
export function CreateMonthPlanModal({ client, plans = [], onClose, onCreated }) {
  const taken = useMemo(() => new Set(plans.map((p) => p.plan_month)), [plans]);
  const [month, setMonth] = useState(() => {
    for (let i = 0; i < 24; i += 1) if (!taken.has(monthKey(i))) return monthKey(i);
    return monthKey(0);
  });
  const previous = useMemo(
    () => plans.filter((p) => p.plan_month < month).sort((a, b) => (a.plan_month < b.plan_month ? 1 : -1))[0] || null,
    [plans, month]
  );
  const [copy, setCopy] = useState(true);
  const [notes, setNotes] = useState('');
  const [fee, setFee] = useState('');
  const [draft, setDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const useCopy = copy && Boolean(previous) && previous.project_count > 0;
  const exists = taken.has(month);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Pick a month');
    if (exists) return setError(`${monthLabel(month)} already has a plan for this client`);
    setSaving(true);
    try {
      const res = await projectFlowService.createMonthPlan({
        clientId: client.id,
        month,
        status: draft ? 'draft' : 'active',
        notes: notes.trim() || null,
        // Left blank, a copied month keeps the previous month's fee.
        billingAmount: fee === '' ? undefined : Number(fee),
        copyFromPlanId: useCopy ? previous.id : undefined
      });
      onCreated(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not create the month plan'));
    } finally {
      setSaving(false);
    }
  };

  const Option = ({ active, onClick, icon: Icon, title, hint, disabled }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'border-red-500 bg-red-50/40' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
        <Icon className="w-4 h-4" /> {title}
      </div>
      <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-red-600" /> Plan a month
            </h2>
            <p className="text-xs text-slate-500">for {client.company_name || client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Month *</span>
            <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} required />
            {exists && <p className="text-[11px] font-semibold text-red-600 mt-1">This client already has a {monthLabel(month)} plan.</p>}
          </label>

          <div>
            <span className="text-xs font-bold text-slate-600">Start with</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Option
                active={useCopy}
                disabled={!previous || previous.project_count === 0}
                onClick={() => setCopy(true)}
                icon={Copy}
                title={previous ? `Copy ${previous.label}` : 'Copy previous'}
                hint={
                  previous
                    ? `${previous.project_count} project${previous.project_count === 1 ? '' : 's'} with the same services, people and quotas.`
                    : 'No earlier month to copy yet.'
                }
              />
              <Option active={!useCopy} onClick={() => setCopy(false)} icon={FilePlus2} title="Empty month" hint="Add each service project yourself." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Monthly fee (optional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder={useCopy && previous?.billing_amount != null ? `${previous.billing_amount} (same as ${previous.label})` : '0.00'}
              />
            </label>
            <label className="flex items-end gap-2 pb-2.5 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="w-4 h-4 accent-red-600" />
              Save as draft
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Notes for this month</span>
            <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know about this month" />
          </label>

          {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={saving || exists}>
            {saving ? 'Creating…' : `Create ${monthLabel(month)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
