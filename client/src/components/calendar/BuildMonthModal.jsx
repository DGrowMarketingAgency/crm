import React, { useEffect, useMemo, useState } from 'react';
import { X, Wand2, Clapperboard, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { calendarService } from '../../services/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'Twitter / X', 'TikTok', 'Google Business Profile', 'Website', 'Other'];
const inputCls = 'w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const niceDate = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const errMsg = (err, fb) => err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || fb;

function DayPicker({ value, onChange, label }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {DAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i])}
            className={`w-11 py-1.5 rounded-lg text-xs font-bold border ${on ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
            aria-pressed={on}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Build month calendar" (Master Plan §8 Social Media Management): N Reels on the Reel days and M Posts on the Post days,
 * default pattern Reels Sat/Sun/Wed + Posts Mon/Tue/Thu, titled by rotating content pillars. Remembers the pattern per client.
 */
export function BuildMonthModal({ isOpen, onClose, onBuilt, clients = [], employees = [], fixedClientId = null, initialMonth = null }) {
  const [clientId, setClientId] = useState(fixedClientId || '');
  const [month, setMonth] = useState(initialMonth && initialMonth >= thisMonth() ? initialMonth : thisMonth());
  const [reels, setReels] = useState('');
  const [posts, setPosts] = useState('');
  const [reelDays, setReelDays] = useState([6, 0, 3]);
  const [postDays, setPostDays] = useState([1, 2, 4]);
  const [platform, setPlatform] = useState('Instagram');
  const [pillars, setPillars] = useState([]);
  const [pillarText, setPillarText] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [clientVisible, setClientVisible] = useState(true);
  const [canManage, setCanManage] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setClientId(fixedClientId || '');
      setError('');
      setPreview(null);
    }
  }, [isOpen, fixedClientId]);

  // Load the client's saved pattern (or the default one).
  useEffect(() => {
    if (!isOpen || !clientId) return;
    calendarService
      .getContentPlan(clientId)
      .then((r) => {
        const p = r.data?.data || {};
        setReels(p.reels_per_month ? String(p.reels_per_month) : '');
        setPosts(p.posts_per_month ? String(p.posts_per_month) : '');
        setReelDays(p.reel_days || [6, 0, 3]);
        setPostDays(p.post_days || [1, 2, 4]);
        setPlatform(p.platform || 'Instagram');
        setPillars(p.pillars || []);
        setAssignedTo(p.default_assignee_id ? String(p.default_assignee_id) : '');
        setClientVisible(p.client_visible !== false);
        setCanManage(p.can_manage !== false);
      })
      .catch((err) => setError(errMsg(err, 'Could not load this client’s content settings')));
  }, [isOpen, clientId]);

  const payload = useMemo(
    () => ({
      clientId: Number(clientId),
      month,
      reels: Number(reels) || 0,
      posts: Number(posts) || 0,
      reelDays,
      postDays,
      platform,
      pillars,
      assignedTo: assignedTo ? Number(assignedTo) : null,
      clientVisible
    }),
    [clientId, month, reels, posts, reelDays, postDays, platform, pillars, assignedTo, clientVisible]
  );

  // Live preview of the exact dates (server dry run), debounced.
  useEffect(() => {
    if (!isOpen || !clientId || !canManage || payload.reels + payload.posts === 0) {
      setPreview(null);
      return undefined;
    }
    const t = setTimeout(() => {
      setPreviewing(true);
      calendarService
        .buildMonth({ ...payload, dryRun: true })
        .then((r) => {
          setPreview(r.data?.data || null);
          setError('');
        })
        .catch((err) => {
          setPreview(null);
          setError(errMsg(err, 'Could not preview'));
        })
        .finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [isOpen, clientId, canManage, payload]);

  const addPillar = () => {
    const parts = pillarText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) setPillars((p) => [...new Set([...p, ...parts])].slice(0, 20));
    setPillarText('');
  };

  const build = async () => {
    setError('');
    if (!clientId) return setError('Pick a client');
    if (payload.reels + payload.posts === 0) return setError('Set how many Reels or Posts to plan');
    setSaving(true);
    try {
      const r = await calendarService.buildMonth(payload);
      onBuilt?.(r.data?.data, month);
    } catch (err) {
      setError(errMsg(err, 'Could not build the calendar'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  const items = preview?.items || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-emerald-700" /> Build month content calendar
            </h2>
            <p className="text-xs text-slate-500">Set how many Reels and Posts, on which days — every date is filled in for you.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-0">
          <div className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Client</span>
                <select className={inputCls} value={clientId} disabled={Boolean(fixedClientId)} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">— Select client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Month</span>
                <input type="month" className={inputCls} value={month} min={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
              </label>
            </div>

            {!canManage && clientId && (
              <p className="text-sm font-semibold text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                Only admins, project managers or this client’s account manager can build its content calendar.
              </p>
            )}

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-bold text-slate-800">Reels</span>
                <input type="number" min="0" max="60" className={`${inputCls} !w-24 ml-auto`} value={reels} onChange={(e) => setReels(e.target.value)} placeholder="How many" aria-label="Reels this month" />
              </div>
              <DayPicker value={reelDays} onChange={setReelDays} label="Reel days" />
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold text-slate-800">Posts</span>
                <input type="number" min="0" max="60" className={`${inputCls} !w-24 ml-auto`} value={posts} onChange={(e) => setPosts(e.target.value)} placeholder="How many" aria-label="Posts this month" />
              </div>
              <DayPicker value={postDays} onChange={setPostDays} label="Post days" />
            </div>
            <p className="text-[11px] text-slate-500 -mt-2">Default pattern: Reels on Sat, Sun, Wed and Posts on Mon, Tue, Thu — change the days to fit this client’s shoot days.</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Platform</span>
                <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Assign items to</span>
                <select className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">— Nobody yet —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-600">Content pillars / themes (approved with the client)</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {pillars.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-100">
                    {p}
                    <button type="button" onClick={() => setPillars((x) => x.filter((y) => y !== p))} className="p-0.5 rounded-full hover:bg-emerald-100" aria-label={`Remove ${p}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className={`${inputCls} !w-56 !py-1 !text-xs`}
                  value={pillarText}
                  onChange={(e) => setPillarText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addPillar();
                    }
                  }}
                  onBlur={addPillar}
                  placeholder="Type a pillar, press Enter"
                  aria-label="Add content pillar"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Items are titled in turn with each pillar, e.g. “Reel 1 — {pillars[0] || 'your pillar'}”.</p>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" className="w-4 h-4 accent-emerald-700" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
              Show these items to the client in their portal calendar
            </label>
          </div>

          {/* Preview */}
          <div className="border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/60 p-5 flex flex-col">
            <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
              Preview {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </p>
            {preview?.existing && preview.existing.reels + preview.existing.posts > 0 && (
              <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This month already has {preview.existing.reels} Reels and {preview.existing.posts} Posts — these are added on top, numbered after them.
              </p>
            )}
            {preview?.not_placed > 0 && (
              <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
                {preview.not_placed} item{preview.not_placed === 1 ? '' : 's'} could not be placed — pick more days.
              </p>
            )}
            <ul className="mt-2 space-y-1 overflow-y-auto max-h-[420px] pr-1">
              {items.length === 0 && <li className="text-xs text-slate-400">Pick a client and set the counts to see the dates.</li>}
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 text-xs bg-white rounded-lg border border-slate-100 px-2.5 py-1.5">
                  <span className="w-20 shrink-0 font-semibold text-slate-500">{niceDate(it.date)}</span>
                  {it.kind === 'reel' ? <Clapperboard className="w-3.5 h-3.5 text-rose-600 shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                  <span className="truncate text-slate-800 font-medium">{it.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error && (
          <p className="px-5 pb-2 text-sm font-semibold text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={build}
            disabled={saving || !canManage || !items.length}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> {saving ? 'Adding…' : `Add ${items.length || ''} item${items.length === 1 ? '' : 's'} to calendar`}
          </button>
        </div>
      </div>
    </div>
  );
}
