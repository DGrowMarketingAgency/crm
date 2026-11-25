/** Shared bits for the shoot pages (videographer availability + planner). */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Quick time presets. "Full day" is sent as fullDay and stored as 06:00–22:00. */
export const PRESETS = [
  { key: 'morning', label: 'Morning', start: '09:00', end: '13:00' },
  { key: 'afternoon', label: 'Afternoon', start: '13:00', end: '17:00' },
  { key: 'evening', label: 'Evening', start: '17:00', end: '21:00' },
  { key: 'full', label: 'Full day', fullDay: true }
];

const pad = (n) => String(n).padStart(2, '0');

/** "14:30" → "2:30 pm" */
export const fmtTime = (hm) => {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${pad(m)} ${suffix}` : `${h12} ${suffix}`;
};

export const fmtRange = (slot) => (slot.full_day ? 'Full day' : `${fmtTime(slot.start)} – ${fmtTime(slot.end)}`);

/** "2026-12" → "December 2026" */
export const longMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** "2026-12-05" → "Sat, 5 Dec" */
export const dayLabel = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

/** The month as calendar weeks: arrays of 7 cells, each null (padding) or { ymd, day, weekday }. */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push({ ymd: `${ym}-${pad(d)}`, day: d, weekday: new Date(y, m - 1, d).getDay() });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const KIND_BADGE = {
  in_house: { label: 'In-house', cls: 'bg-sky-50 text-sky-700 border-sky-100' },
  freelance: { label: 'Freelance', cls: 'bg-violet-50 text-violet-700 border-violet-100' }
};

export function KindBadge({ kind }) {
  const k = KIND_BADGE[kind] || KIND_BADGE.freelance;
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${k.cls}`}>{k.label}</span>;
}

/** A login that only has the freelance-videographer role: gets the stripped-down shoot menu. */
export const isFreelanceOnly = (roles) =>
  Boolean(roles?.length) && roles.every((r) => r.slug === 'freelance-videographer');
