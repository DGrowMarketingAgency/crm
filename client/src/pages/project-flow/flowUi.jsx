import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react';

export const CATEGORIES = {
  regular: {
    label: 'Regular',
    hint: 'Monthly retainer — SEO, ads, social media, blogs. Auto-creates every month.',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500'
  },
  one_time: {
    label: 'One-Time',
    hint: 'Delivered once — website, landing page, app, branding.',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  },
  urgent: {
    label: 'Urgent / Extra',
    hint: 'Urgent or additional work inside the package.',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500'
  },
  out_of_service: {
    label: 'Out of Service',
    hint: 'Work outside the client’s package — tracked separately for billing.',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500'
  }
};

export const STATUS_BADGE = {
  planning: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-50 text-blue-700',
  on_hold: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  in_review: 'bg-purple-50 text-purple-700',
  blocked: 'bg-red-50 text-red-700',
  pending: 'bg-slate-100 text-slate-500'
};

export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || fallback;

export const fmtDate = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-').map(Number);
  if (!y) return '—';
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const humanize = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

export function CategoryBadge({ category }) {
  const meta = CATEGORIES[category];
  if (!meta) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-50 text-slate-500 border-slate-200">Legacy</span>;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badge}`}>{meta.label}</span>;
}

export function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600'}`}>
      {humanize(status)}
    </span>
  );
}

export function Progress({ done, total, className = '' }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={className}>
      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
        <span>
          {done}/{total} steps
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Initials({ name, className = '' }) {
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-red-700 text-[11px] font-bold border-2 border-white ${className}`}
    >
      {initials}
    </span>
  );
}

export function PeopleStack({ people = [], max = 4 }) {
  if (people.length === 0) return <span className="text-xs text-slate-400">Unassigned</span>;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {people.slice(0, max).map((p) => (
          <Initials key={p.id} name={p.name} />
        ))}
      </div>
      <span className="ml-2 text-xs text-slate-600 truncate max-w-[220px]">{people.map((p) => p.name).join(', ')}</span>
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="flex items-center gap-1 text-xs font-semibold text-slate-500 flex-wrap">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
          {it.to ? (
            <Link to={it.to} className="hover:text-red-600">
              {it.label}
            </Link>
          ) : (
            <span className="text-slate-800">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PageState({ loading, error, onRetry, children }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white border border-red-100 rounded-2xl p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-700">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-3 text-sm font-bold text-red-600 hover:underline">
            Try again
          </button>
        )}
      </div>
    );
  }
  return children;
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-slate-300 mx-auto mb-3" />}
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {text && <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500';
export const btnPrimary =
  'px-4 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnSecondary =
  'px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50';
