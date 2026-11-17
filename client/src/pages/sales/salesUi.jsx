import React, { useState } from 'react';
import { X, MoreHorizontal } from 'lucide-react';
import { salesService } from '../../services/api';
import { errorMessage, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';

export const STAGE_LABEL = {
  New: 'New', Contacted: 'Contacted', DiscoveryCallDone: 'Discovery done', ProposalSent: 'Proposal sent',
  Negotiation: 'Negotiation', Won: 'Won', Lost: 'Lost',
  DemoScheduled: 'Demo scheduled', DemoDone: 'Demo done', Trial: 'Trial', PlanSelected: 'Plan selected'
};
export const STAGE_TONE = {
  New: 'bg-slate-100 text-slate-700', Contacted: 'bg-sky-50 text-sky-700', DiscoveryCallDone: 'bg-indigo-50 text-indigo-700',
  ProposalSent: 'bg-violet-50 text-violet-700', Negotiation: 'bg-amber-50 text-amber-700', Won: 'bg-emerald-50 text-emerald-700', Lost: 'bg-red-50 text-red-700'
};
export const INTERACTION_LABEL = {
  call: 'Call', negotiation: 'Negotiation', note: 'Note', quote_followup: 'Quote follow-up', meeting: 'Meeting', stage_change: 'Stage change', proposal: 'Proposal'
};
export const PROPOSAL_STATUS = {
  draft: ['Draft', 'bg-slate-100 text-slate-600'], sent: ['Shared', 'bg-sky-50 text-sky-700'], viewed: ['Viewed by client', 'bg-violet-50 text-violet-700'],
  accepted: ['Accepted', 'bg-emerald-50 text-emerald-700'], rejected: ['Declined', 'bg-red-50 text-red-700'], converted: ['Converted', 'bg-emerald-100 text-emerald-800'],
  withdrawn: ['Withdrawn', 'bg-slate-100 text-slate-500']
};

/**
 * Compact "⋯" actions menu for list rows and page headers.
 * items: [{ label, icon: Icon, onClick, danger, hidden, title }]
 */
export function ActionMenu({ items, label = 'More actions', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((i) => i && !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="relative inline-block text-left">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className={`absolute z-30 mt-1 min-w-[190px] rounded-xl border border-slate-200 bg-white shadow-lg py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {visible.map(({ label: l, icon: Icon, onClick, danger, title }) => (
            <button key={l} type="button" role="menuitem" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onClick(); }}
              className={`w-full text-left px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 ${danger ? 'text-red-600' : 'text-slate-700'}`}>
              {Icon && <Icon className="w-4 h-4" />}{l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export const CYCLES = { monthly: 'Monthly retainer', quarterly: 'Quarterly plan', half_yearly: 'Half-yearly (6 months)', annual: 'Annual (12 months)', one_time: 'One-time project' };
export const CYCLE_SUFFIX = { monthly: '/month', quarterly: '/quarter', half_yearly: '/6 months', annual: '/year', one_time: '' };

export const StageBadge = ({ stage }) => (
  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${STAGE_TONE[stage] || 'bg-slate-100 text-slate-600'}`}>{STAGE_LABEL[stage] || stage}</span>
);

export const fmtDateTime = (v) => {
  if (!v) return '';
  const s = String(v).replace(' ', 'T');
  const d = new Date(s.endsWith('Z') ? s.slice(0, -1) : s);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const toLocalInput = (v) => (v ? String(v).replace(' ', 'T').slice(0, 16) : '');

export function Modal({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-10`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Sources where a named person brought the lead in. */
export const REFERRER_SOURCES = ['Referral', 'Marketing Person'];

export const waUrl = (phone, text = '') => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const SourceBadge = ({ source, referrer }) => {
  if (!source && !referrer) return <span className="text-slate-400">—</span>;
  const ref = referrer && REFERRER_SOURCES.includes(source);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold leading-snug ${ref ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}>
      {ref ? `${source === 'Referral' ? 'Ref' : 'Rep'}: ${referrer}` : source || 'Other'}
      {!ref && referrer ? ` · ${referrer}` : ''}
    </span>
  );
};

// Defined at module level so inputs keep focus between renders.
const L = ({ label, children, wide }) => (
  <label className={`block ${wide ? 'md:col-span-2' : ''}`}><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>
);

const EMPTY_LEAD = { title: '', companyName: '', contactName: '', phone: '', email: '', source: '', referrerName: '', servicesInterested: '', estimatedValue: '', ownerUserId: '', repUserId: '', nextFollowupDate: '', notes: '' };

/** Create (no lead) or edit an enquiry. */
export function LeadFormModal({ lead, sources, owners = [], canAssign, onClose, onSaved }) {
  const [f, setF] = useState(() => (lead ? {
    ...EMPTY_LEAD, title: lead.title || '', companyName: lead.company_name || '', contactName: lead.contact_name || '', phone: lead.phone || '',
    email: lead.email || '', source: lead.source || '', referrerName: lead.referrer_name || '', servicesInterested: lead.services_interested || '',
    estimatedValue: lead.estimated_value ?? '', notes: lead.notes || '', repUserId: lead.rep_user_id ? String(lead.rep_user_id) : ''
  } : EMPTY_LEAD));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const showReferrer = REFERRER_SOURCES.includes(f.source) || f.referrerName;
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      ...f, title: (lead ? f.title : '') || f.companyName || f.contactName,
      estimatedValue: f.estimatedValue === '' ? null : Number(f.estimatedValue), source: f.source || null, referrerName: f.referrerName || null,
      ownerUserId: f.ownerUserId ? Number(f.ownerUserId) : null,
      // Only managers set the REP; for a marketing person the server makes them the REP.
      repUserId: canAssign ? (f.repUserId ? Number(f.repUserId) : null) : undefined
    };
    try {
      const res = lead ? await salesService.updateLead(lead.id, payload) : await salesService.createLead(payload);
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the enquiry'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={lead ? 'Edit enquiry' : 'New enquiry'} onClose={onClose} wide>
      <form onSubmit={submit} className="p-5 grid md:grid-cols-2 gap-3">
        <L label="Business / company *"><input className={inputCls} required value={f.companyName} onChange={set('companyName')} /></L>
        <L label="Contact person"><input className={inputCls} value={f.contactName} onChange={set('contactName')} /></L>
        <L label="Mobile"><input className={inputCls} inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></L>
        <L label="Email"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></L>
        <L label="Lead source *">
          <select required className={inputCls} value={f.source} onChange={set('source')}>
            <option value="">— Where did it come from? —</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </L>
        {showReferrer ? (
          <L label={f.source === 'Marketing Person' ? 'Marketing person name' : 'Referred by'}>
            <input className={inputCls} value={f.referrerName} onChange={set('referrerName')} placeholder="e.g. Selvaraj Sir (Sugam Physio)" />
          </L>
        ) : (
          <L label="Estimated budget ₹"><input type="number" min="0" className={inputCls} value={f.estimatedValue} onChange={set('estimatedValue')} /></L>
        )}
        {showReferrer && <L label="Estimated budget ₹"><input type="number" min="0" className={inputCls} value={f.estimatedValue} onChange={set('estimatedValue')} /></L>}
        <L label="Services interested" wide={!showReferrer}><input className={inputCls} value={f.servicesInterested} onChange={set('servicesInterested')} placeholder="e.g. Meta leads generation, SEO" /></L>
        {lead && <L label="Lead name *" wide><input className={inputCls} required value={f.title} onChange={set('title')} /></L>}
        {canAssign && (
          <L label="REP (marketing person who brought it in)">
            <select className={inputCls} value={f.repUserId} onChange={set('repUserId')}>
              <option value="">Direct (no REP)</option>
              {lead?.rep_user_id && !owners.some((o) => o.id === lead.rep_user_id) && <option value={lead.rep_user_id}>{lead.rep_name}</option>}
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isMarketer ? ' (marketer)' : ''}</option>)}
            </select>
          </L>
        )}
        {!lead && canAssign && (
          <L label="Assign to">
            <select className={inputCls} value={f.ownerUserId} onChange={set('ownerUserId')}>
              <option value="">Unassigned (assign later)</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isMarketer ? ' (marketer)' : ''}</option>)}
            </select>
          </L>
        )}
        {!lead && <L label="Next follow-up"><input type="date" className={inputCls} value={f.nextFollowupDate} onChange={set('nextFollowupDate')} /></L>}
        <L label="Notes" wide><textarea rows={2} className={inputCls} value={f.notes} onChange={set('notes')} /></L>
        {error && <p className="md:col-span-2 text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : lead ? 'Save changes' : 'Save enquiry'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Pick the marketer / staff member who owns the lead. */
export function AssignLeadModal({ lead, owners, onClose, onSaved }) {
  const [ownerId, setOwnerId] = useState(lead.owner_user_id ? String(lead.owner_user_id) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!ownerId) return setError('Choose someone');
    setSaving(true);
    try {
      onSaved((await salesService.assignLead(lead.id, Number(ownerId))).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not assign'));
      setSaving(false);
    }
  };
  return (
    <Modal title="Assign marketer" subtitle={lead.company_name || lead.title} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <select aria-label="Assign to" className={inputCls} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— Choose —</option>
          {lead.owner_user_id && !owners.some((o) => o.id === lead.owner_user_id) && <option value={lead.owner_user_id}>{lead.owner_name}</option>}
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isMarketer ? ' (marketer)' : ''}</option>)}
        </select>
        <p className="text-xs text-slate-500">They get a notification and the lead shows in their list.</p>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Assign'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Schedule a meeting for a lead or a client. Pass leadId to lock it to one lead. */
export function ScheduleMeetingModal({ leadId, leads = [], clients = [], kind: initialKind = 'client', onClose, onSaved }) {
  const [kind, setKind] = useState(initialKind);
  const [f, setF] = useState({ target: leadId ? `lead:${leadId}` : '', title: '', mode: 'online', startsAt: '', location: '', agenda: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const [kind, idStr] = f.target.split(':');
    if (!idStr) return setError('Choose a lead or client');
    setSaving(true);
    try {
      await salesService.createMeeting({
        leadId: kind === 'lead' ? Number(idStr) : null, clientId: kind === 'client' ? Number(idStr) : null,
        title: f.title, mode: f.mode, startsAt: f.startsAt, location: f.location || null, agenda: f.agenda || null
      });
      onSaved({ kind: kind === 'client' ? 'client' : 'prospect' });
    } catch (err) {
      setError(errorMessage(err, 'Could not schedule'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Schedule meeting" onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        {!leadId && (
          <>
            <div>
              <span className="text-xs font-bold text-slate-600">Meeting with *</span>
              <div className="grid grid-cols-2 gap-2 mt-1" role="radiogroup" aria-label="Meeting with">
                {[['client', 'Onboarded client', 'Existing client: reviews, reporting, renewals'], ['prospect', 'Prospect (enquiry)', 'Not onboarded yet: discovery, pitch, negotiation']].map(([k, label, sub]) => (
                  <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setF((p) => ({ ...p, target: '' })); }}
                    className={`text-left rounded-xl border p-3 ${kind === k ? (k === 'client' ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50') : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-sm font-bold text-slate-900">{label}</div>
                    <div className="text-[11px] text-slate-500">{sub}</div>
                  </button>
                ))}
              </div>
            </div>
            <label className="block"><span className="text-xs font-bold text-slate-600">{kind === 'client' ? 'Client *' : 'Enquiry *'}</span>
              <select className={inputCls} value={f.target} onChange={set('target')} required>
                <option value="">{kind === 'client' ? '— Select client —' : '— Select enquiry —'}</option>
                {kind === 'client'
                  ? clients.map((c) => <option key={`c${c.id}`} value={`client:${c.id}`}>{c.name}</option>)
                  : leads.map((l) => <option key={`l${l.id}`} value={`lead:${l.id}`}>{l.company_name || l.title}{l.contact_name ? ` · ${l.contact_name}` : ''}</option>)}
              </select>
              {kind === 'client' && clients.length === 0 && <span className="text-[11px] text-slate-500">No onboarded clients you can book for yet.</span>}
              {kind === 'prospect' && leads.length === 0 && <span className="text-[11px] text-slate-500">No open enquiries. Onboarded or lost enquiries are not listed here.</span>}
            </label>
          </>
        )}
        <label className="block"><span className="text-xs font-bold text-slate-600">Title *</span>
          <input className={inputCls} required minLength={2} value={f.title} onChange={set('title')} placeholder="e.g. Discovery meeting" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Mode</span>
            <select className={inputCls} value={f.mode} onChange={set('mode')}><option value="online">Online (Meet / Zoom)</option><option value="offline">In person</option></select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Date & time *</span>
            <input type="datetime-local" required className={inputCls} value={f.startsAt} onChange={set('startsAt')} /></label>
        </div>
        <label className="block"><span className="text-xs font-bold text-slate-600">{f.mode === 'online' ? 'Meeting link' : 'Venue'}</span>
          <input className={inputCls} value={f.location} onChange={set('location')} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Agenda</span>
          <textarea rows={2} className={inputCls} value={f.agenda} onChange={set('agenda')} /></label>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Schedule'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Record minutes and decisions; optionally mark done. */
export function MinutesModal({ meeting, onClose, onSaved }) {
  const [minutes, setMinutes] = useState(meeting.minutes || '');
  const [decisions, setDecisions] = useState(meeting.decisions || '');
  const [done, setDone] = useState(meeting.status !== 'completed');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await salesService.updateMeeting(meeting.id, { minutes, decisions, ...(done ? { status: 'completed' } : {}) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Meeting minutes" subtitle={meeting.title} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <label className="block"><span className="text-xs font-bold text-slate-600">Minutes</span>
          <textarea rows={4} className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="What was discussed" /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Key decisions & next actions {done ? '*' : ''}</span>
          <textarea rows={3} className={inputCls} value={decisions} onChange={(e) => setDecisions(e.target.value)} placeholder="e.g. Send 3-tier proposal by Friday" /></label>
        {meeting.status !== 'completed' && (
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Mark meeting as done
          </label>
        )}
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save minutes'}</button>
        </div>
      </form>
    </Modal>
  );
}
