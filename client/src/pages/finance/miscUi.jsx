import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const PAYMENT_MODES = [
  ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['card', 'Card'], ['cheque', 'Cheque'], ['auto_debit', 'Auto-debit'], ['other', 'Other']
];
export const modeLabel = (m) => PAYMENT_MODES.find(([k]) => k === m)?.[1] || m || '—';

export const PERIODS = [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['last_month', 'Last month'], ['custom', 'Custom'], ['all', 'All time']];

export const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const thisMonth = () => todayIso().slice(0, 7);
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/** Period picker value → API params (last_month is turned into YYYY-MM). */
export const periodParams = (period, from, to) => {
  if (period === 'last_month') return { period: shiftMonth(thisMonth(), -1) };
  if (period === 'custom') return from && to ? { period: 'custom', from, to } : { period: 'month' };
  return { period };
};

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Kpi({ label, value, tone = 'text-slate-900', sub }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function Banner({ tone = 'ok', children, onClose }) {
  const cls = tone === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800';
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold flex items-start justify-between gap-3 ${cls}`}>
      <span>{children}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
      {tabs.map(([k, l, n]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${value === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {l}{n != null && <span className="ml-1.5 text-[11px] text-slate-400">{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Colour language shared by the EMI roster, loan cards and schedule. */
export const DUE_STYLE = {
  overdue: { label: 'Overdue', chip: 'bg-red-100 text-red-700', row: 'bg-red-50/60', bar: 'bg-red-500' },
  due_today: { label: 'Due today', chip: 'bg-orange-100 text-orange-700', row: 'bg-orange-50/70', bar: 'bg-orange-500' },
  due_soon: { label: 'Due soon', chip: 'bg-amber-100 text-amber-800', row: 'bg-amber-50/60', bar: 'bg-amber-500' },
  upcoming: { label: 'Upcoming', chip: 'bg-slate-100 text-slate-600', row: '', bar: 'bg-slate-400' },
  paid: { label: 'Paid', chip: 'bg-emerald-100 text-emerald-700', row: '', bar: 'bg-emerald-500' },
  skipped: { label: 'Closed early', chip: 'bg-slate-100 text-slate-400', row: 'opacity-60', bar: 'bg-slate-300' }
};
export function DueChip({ state, isLast }) {
  const s = DUE_STYLE[state] || DUE_STYLE.upcoming;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.chip}`}>{s.label}</span>
      {isLast && state !== 'paid' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-500 text-white">Last EMI</span>}
    </span>
  );
}

export const daysFrom = (iso) => Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${todayIso()}T00:00:00Z`)) / 86400000);
export const dueText = (iso) => {
  const d = daysFrom(iso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return '1 day late';
  return d < 0 ? `${-d} days late` : `in ${d} days`;
};
