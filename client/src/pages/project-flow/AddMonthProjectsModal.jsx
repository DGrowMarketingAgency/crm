import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, ShieldCheck, User, Users } from 'lucide-react';
import { projectFlowService, servicesService } from '../../services/api';
import { errorMessage, inputCls, btnPrimary, btnSecondary } from './flowUi';
import { PeoplePicker } from './PeoplePicker';

const QUOTA_PRESETS = ['Reels / videos', 'Posts / graphics', 'Stories', 'Blogs', 'Backlinks', 'Ad creatives'];

// Inside a month "regular" means this month's share of the client's ongoing service.
export const MONTH_CATEGORIES = [
  ['regular', 'Monthly work'],
  ['one_time', 'One-time'],
  ['urgent', 'Urgent / extra'],
  ['out_of_service', 'Out of service (billed separately)']
];

let rowSeq = 0;
const blankRow = () => ({
  key: (rowSeq += 1),
  serviceId: '',
  pipelineId: '',
  name: '',
  category: 'regular',
  mode: 'individual',
  assigneeId: '',
  leaderId: '',
  stepPeople: {},
  quotas: [],
  dueDate: '',
  billingAmount: ''
});

/** Add one or many service projects to a client's month in one go (all saved together, or none). */
export function AddMonthProjectsModal({ plan, client, onClose, onAdded }) {
  const [rows, setRows] = useState(() => [blankRow()]);
  const [services, setServices] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The row + field that failed the last check, so it can be outlined and scrolled into view.
  const [invalid, setInvalid] = useState(null);
  const flag = (row, field, message) => {
    setInvalid({ key: row.key, field, message });
    setError(message);
    requestAnimationFrame(() => document.getElementById(`mp-${row.key}-${field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const bad = (row, field) => invalid?.key === row.key && invalid.field === field;
  const badCls = '!border-red-500 ring-2 ring-red-500/20';

  useEffect(() => {
    Promise.all([
      servicesService.getServices({ limit: 100, status: 'active' }).catch(() => ({ data: { services: [] } })),
      projectFlowService.getPipelines(),
      projectFlowService.getEmployees()
    ])
      .then(([s, p, e]) => {
        setServices(s.data.services || []);
        setPipelines(p.data.pipelines);
        setEmployees(e.data.employees);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load form data')));
  }, []);

  const pipelineById = useMemo(() => Object.fromEntries(pipelines.map((p) => [String(p.id), p])), [pipelines]);
  const serviceById = useMemo(() => Object.fromEntries(services.map((s) => [String(s.id), s])), [services]);

  const update = (key, patch) => {
    if (invalid?.key === key) {
      setInvalid(null);
      setError('');
    }
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  };

  const onService = (key, id) =>
    update(key, () => {
      // Choosing a service picks its pipeline, which sets the step flow.
      const match = pipelines.find((p) => String(p.service_id) === String(id));
      return { serviceId: id, pipelineId: match ? String(match.id) : '', stepPeople: {} };
    });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInvalid(null);
    for (const [i, r] of rows.entries()) {
      if (!r.serviceId && !r.name.trim()) return flag(r, 'service', `Project ${i + 1}: pick a service or type a name`);
      if (r.mode === 'individual' && !r.assigneeId) return flag(r, 'assignee', `Project ${i + 1}: choose who will do it`);
      if (r.mode === 'team' && !r.leaderId) return flag(r, 'leader', `Project ${i + 1}: choose a team leader — they own the project and cover any step left empty`);
    }
    const payload = rows.map((r) => {
      const steps = pipelineById[r.pipelineId]?.steps || [];
      return {
        name: r.name.trim() || undefined,
        category: r.category,
        serviceId: r.serviceId ? Number(r.serviceId) : null,
        pipelineId: r.pipelineId ? Number(r.pipelineId) : null,
        assignmentMode: r.mode,
        assigneeId: r.mode === 'individual' ? Number(r.assigneeId) : null,
        teamLeaderId: r.mode === 'team' ? Number(r.leaderId) : null,
        stepAssignees:
          r.mode === 'team'
            ? Object.fromEntries(
                (steps.length ? steps.map((s) => String(s.id)) : ['idx0']).filter((k) => r.stepPeople[k]?.length).map((k) => [k, r.stepPeople[k]])
              )
            : undefined,
        dueDate: r.dueDate || null,
        monthlyDeliverables: r.quotas.filter((q) => q.label.trim() && Number(q.qty) > 0).map((q) => ({ label: q.label.trim(), qty: Number(q.qty) })),
        billingAmount: r.category === 'out_of_service' && r.billingAmount !== '' ? Number(r.billingAmount) : null
      };
    });
    setSaving(true);
    try {
      const res = await projectFlowService.addMonthPlanProjects(plan.id, payload);
      onAdded(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the projects'));
    } finally {
      setSaving(false);
    }
  };

  const personOptions = employees.map((emp) => (
    <option key={emp.id} value={emp.id}>
      {emp.name}
      {emp.department ? ` — ${emp.department}` : ''}
    </option>
  ));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">Add projects to {plan.label}</h2>
            <p className="text-xs text-slate-500">
              {client.company_name || client.name} · one project per service
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {rows.map((r, i) => {
            const steps = pipelineById[r.pipelineId]?.steps || [];
            const svc = serviceById[r.serviceId];
            const stepKeys = steps.length ? steps.map((s) => ({ key: String(s.id), name: s.name, approval: s.step_type === 'approval' })) : [{ key: 'idx0', name: 'Execution' }];
            return (
              <section key={r.key} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Project {i + 1}</h3>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" aria-label={`Remove project ${i + 1}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Service</span>
                    <select id={`mp-${r.key}-service`} className={`${inputCls} ${bad(r, 'service') ? badCls : ''}`} value={r.serviceId} onChange={(e) => onService(r.key, e.target.value)}>
                      <option value="">— Select service —</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.category ? `${s.category} · ` : ''}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Pipeline (step flow)</span>
                    <select className={inputCls} value={r.pipelineId} onChange={(e) => update(r.key, { pipelineId: e.target.value, stepPeople: {} })}>
                      <option value="">— Single step —</option>
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.step_count} steps)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Type</span>
                    <select className={inputCls} value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}>
                      {MONTH_CATEGORIES.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs font-bold text-slate-600">Name</span>
                    <input
                      className={inputCls}
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                      placeholder={`${svc?.name || 'Service'} — ${plan.label}`}
                      maxLength={255}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Due (default: month end)</span>
                    <input type="date" className={inputCls} value={r.dueDate} min={plan.start} onChange={(e) => update(r.key, { dueDate: e.target.value })} />
                  </label>
                  {r.category === 'out_of_service' && (
                    <label className="block">
                      <span className="text-xs font-bold text-slate-600">Billable amount</span>
                      <input type="number" min="0" step="0.01" className={inputCls} value={r.billingAmount} onChange={(e) => update(r.key, { billingAmount: e.target.value })} placeholder="0.00" />
                    </label>
                  )}
                </div>

                {steps.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {steps.map((s, si) => (
                      <span key={s.id} className={`px-2 py-0.5 rounded-lg border font-semibold ${s.step_type === 'approval' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                        {si + 1}. {s.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quotas for the month: each becomes a task the owner splits further. */}
                <div className="rounded-xl bg-blue-50/40 border border-blue-100 p-3">
                  <p className="text-xs font-bold text-slate-700">This month's deliverables</p>
                  <div className="space-y-2 mt-2">
                    {r.quotas.map((q, qi) => (
                      <div key={qi} className="flex gap-2">
                        <input
                          className={inputCls}
                          value={q.label}
                          onChange={(e) => update(r.key, (cur) => ({ quotas: cur.quotas.map((x, j) => (j === qi ? { ...x, label: e.target.value } : x)) }))}
                          placeholder="Deliverable"
                          aria-label="Deliverable"
                        />
                        <input
                          type="number"
                          min="1"
                          className={`${inputCls} !w-24`}
                          value={q.qty}
                          onChange={(e) => update(r.key, (cur) => ({ quotas: cur.quotas.map((x, j) => (j === qi ? { ...x, qty: e.target.value } : x)) }))}
                          aria-label="Quantity this month"
                        />
                        <button type="button" onClick={() => update(r.key, (cur) => ({ quotas: cur.quotas.filter((_, j) => j !== qi) }))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Remove deliverable">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUOTA_PRESETS.filter((l) => !r.quotas.some((q) => q.label === l)).map((l) => (
                      <button key={l} type="button" onClick={() => update(r.key, (cur) => ({ quotas: [...cur.quotas, { label: l, qty: 4 }] }))} className="px-2 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-blue-300">
                        + {l}
                      </button>
                    ))}
                    <button type="button" onClick={() => update(r.key, (cur) => ({ quotas: [...cur.quotas, { label: '', qty: 1 }] }))} className="px-2 py-1 rounded-full bg-white border border-dashed border-slate-300 text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Custom
                    </button>
                  </div>
                </div>

                {/* Who does it */}
                <div className="grid md:grid-cols-[auto_1fr] gap-3 items-start">
                  <div className="inline-flex rounded-xl border border-slate-200 p-0.5" role="group" aria-label="Who does the work">
                    {[
                      ['individual', User, 'Individual'],
                      ['team', Users, 'Team']
                    ].map(([k, Icon, l]) => (
                      <button key={k} type="button" onClick={() => update(r.key, { mode: k })} className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${r.mode === k ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <Icon className="w-3.5 h-3.5" /> {l}
                      </button>
                    ))}
                  </div>
                  {r.mode === 'individual' ? (
                    <div>
                      <select id={`mp-${r.key}-assignee`} className={`${inputCls} ${bad(r, 'assignee') ? badCls : ''}`} value={r.assigneeId} onChange={(e) => update(r.key, { assigneeId: e.target.value })} aria-label={`Person for project ${i + 1}`}>
                        <option value="">— Who will do it? * —</option>
                        {personOptions}
                      </select>
                      {bad(r, 'assignee') && <p className="text-[11px] font-semibold text-red-600 mt-1">Choose who will do this project.</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <select id={`mp-${r.key}-leader`} className={`${inputCls} ${bad(r, 'leader') ? badCls : ''}`} value={r.leaderId} onChange={(e) => update(r.key, { leaderId: e.target.value })} aria-label={`Team leader for project ${i + 1}`}>
                          <option value="">— Team leader * —</option>
                          {personOptions}
                        </select>
                        {bad(r, 'leader') && <p className="text-[11px] font-semibold text-red-600 mt-1">Choose a team leader — they own the project and cover any step left empty.</p>}
                      </div>
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {stepKeys.map((s, si) => (
                          <div key={s.key} className="p-2 grid sm:grid-cols-[minmax(0,180px)_1fr] gap-2 items-center">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              {s.approval && <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />}
                              {si + 1}. {s.name}
                            </span>
                            <PeoplePicker
                              employees={employees}
                              value={r.stepPeople[s.key] || []}
                              onChange={(ids) => update(r.key, (cur) => ({ stepPeople: { ...cur.stepPeople, [s.key]: ids } }))}
                              placeholder="+ Add (default: leader)"
                              ariaLabel={`People for ${s.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="w-full rounded-2xl border-2 border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/30 py-3 text-sm font-bold text-slate-600 inline-flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add another service project
          </button>

          {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : `Add ${rows.length} project${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
