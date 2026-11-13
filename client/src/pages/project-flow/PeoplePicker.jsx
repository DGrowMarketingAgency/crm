import React from 'react';
import { X } from 'lucide-react';
import { inputCls } from './flowUi';

/** Multi-select of employees rendered as removable chips plus an "add" dropdown. */
export function PeoplePicker({ employees, value = [], onChange, placeholder = '+ Add person', ariaLabel }) {
  const selected = value.map((id) => employees.find((e) => e.id === id)).filter(Boolean);
  const available = employees.filter((e) => !value.includes(e.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-red-50 text-red-800 text-xs font-semibold border border-red-100">
          {p.name}
          <button type="button" onClick={() => onChange(value.filter((id) => id !== p.id))} className="p-0.5 rounded-full hover:bg-red-100" aria-label={`Remove ${p.name}`}>
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <select
        aria-label={ariaLabel}
        className={`${inputCls} !w-auto !py-1 !text-xs`}
        value=""
        onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])}
      >
        <option value="">{placeholder}</option>
        {available.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.department ? ` — ${e.department}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
