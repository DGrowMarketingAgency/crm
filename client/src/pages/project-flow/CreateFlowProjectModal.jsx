import React, { useEffect, useMemo, useState } from 'react';
import { X, User, Users, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { projectFlowService, servicesService } from '../../services/api';
import { CATEGORIES, errorMessage, inputCls, btnPrimary, btnSecondary } from './flowUi';
import { PeoplePicker } from './PeoplePicker';

const DELIVERABLE_PRESETS = ['Social media posts', 'Reels / videos', 'Blogs', 'Backlinks', 'Ad creatives', 'Keywords tracked'];

export function CreateFlowProjectModal({ client, onClose, onCreated }) {
  const [category, setCategory] = useState('one_time');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dueDate, setDueDate] = useState('');
  const [mode, setMode] = useState('individual');
  const [assigneeId, setAssigneeId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [stepAssignees, setStepAssignees] = useState({});
  const [deliverables, setDeliverables] = useState([{ label: 'Social media posts', qty: 12 }]);
  const [billingAmount, setBillingAmount] = useState('');

  const [services, setServices] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const pipeline = useMemo(() => pipelines.find((p) => String(p.id) === String(pipelineId)), [pipelines, pipelineId]);

  const onServiceChange = (id) => {
    setServiceId(id);
    // Choosing a service auto-selects its pipeline, which sets the project's step flow.
    const match = pipelines.find((p) => String(p.service_id) === String(id));
    if (match) setPipelineId(String(match.id));
    const svc = services.find((s) => String(s.id) === String(id));
    if (svc && !name.trim()) setName(`${svc.name}${client ? ` — ${client.company_name || client.name}` : ''}`);
  };

  const setStepPeople = (stepId, ids) => setStepAssignees((prev) => ({ ...prev, [stepId]: ids }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'individual' && !assigneeId) return setError('Select the person who will do this project');
    if (mode === 'team' && !leaderId) return setError('Select a team leader');
    if (category !== 'regular' && dueDate && startDate && dueDate < startDate) return setError('Due date cannot be before start date');

    const payload = {
      clientId: client.id,
      name,
      description: description || null,
      category,
      serviceId: serviceId ? Number(serviceId) : null,
      pipelineId: pipelineId ? Number(pipelineId) : null,
      assignmentMode: mode,
      assigneeId: mode === 'individual' ? Number(assigneeId) : null,
      teamLeaderId: mode === 'team' ? Number(leaderId) : null,
      stepAssignees: mode === 'team' ? Object.fromEntries(Object.entries(stepAssignees).filter(([, v]) => v.length)) : undefined,
      priority,
      startDate: category === 'regular' ? null : startDate || null,
      dueDate: category === 'regular' ? null : dueDate || null,
      monthlyDeliverables: category === 'regular' ? deliverables.filter((d) => d.label.trim() && Number(d.qty) > 0).map((d) => ({ label: d.label.trim(), qty: Number(d.qty) })) : undefined,
      billingAmount: category === 'out_of_service' && billingAmount !== '' ? Number(billingAmount) : null
    };
    setSaving(true);
    try {
      const res = await projectFlowService.createProject(payload);
      onCreated(res.data.project);
    } catch (err) {
      setError(errorMessage(err, 'Could not create project'));
    } finally {
      setSaving(false);
    }
  };

  const steps = pipeline?.steps || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">New project</h2>
            <p className="text-xs text-slate-500">for {client.company_name || client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. Category */}
          <section>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">1 · Project type</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(CATEGORIES).map(([key, meta]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${category === key ? 'border-red-500 bg-red-50/40' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className="font-bold text-sm text-slate-900">{meta.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{meta.hint}</p>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Details */}
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">2 · Details & pipeline</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Service</span>
                <select className={inputCls} value={serviceId} onChange={(e) => onServiceChange(e.target.value)}>
                  <option value="">— Select service —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Project pipeline (step flow)</span>
                <select className={inputCls} value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  <option value="">— No pipeline (single step) —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.step_count} steps)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-bold text-slate-600">Project name *</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="e.g. Company website redesign" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-bold text-slate-600">Description / scope</span>
                <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Priority</span>
                <select className={inputCls} value={category === 'urgent' ? 'urgent' : priority} disabled={category === 'urgent'} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              {category !== 'regular' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Start</span>
                    <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Due</span>
                    <input type="date" className={inputCls} value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
                  </label>
                </div>
              )}
              {category === 'out_of_service' && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Billable amount (separate bill)</span>
                  <input type="number" min="0" step="0.01" className={inputCls} value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)} placeholder="0.00" />
                </label>
              )}
            </div>

            {steps.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[11px]">
                {steps.map((s, i) => (
                  <span key={s.id} className={`px-2 py-1 rounded-lg border font-semibold ${s.step_type === 'approval' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    {i + 1}. {s.name}
                  </span>
                ))}
              </div>
            )}

            {category === 'regular' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-xs font-bold text-slate-700">Monthly deliverables</p>
                <p className="text-[11px] text-slate-500 mb-2">A new monthly cycle is created automatically each month with these quotas as tasks.</p>
                <div className="space-y-2">
                  {deliverables.map((d, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={inputCls} value={d.label} onChange={(e) => setDeliverables((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Social media posts" aria-label="Deliverable" />
                      <input type="number" min="1" className={`${inputCls} !w-24`} value={d.qty} onChange={(e) => setDeliverables((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label="Per month" />
                      <button type="button" onClick={() => setDeliverables((p) => p.filter((_, j) => j !== i))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Remove deliverable">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DELIVERABLE_PRESETS.filter((l) => !deliverables.some((d) => d.label === l)).map((l) => (
                    <button key={l} type="button" onClick={() => setDeliverables((p) => [...p, { label: l, qty: 4 }])} className="px-2 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-blue-300">
                      + {l}
                    </button>
                  ))}
                  <button type="button" onClick={() => setDeliverables((p) => [...p, { label: '', qty: 1 }])} className="px-2 py-1 rounded-full bg-white border border-dashed border-slate-300 text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Custom
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 3. Assignment */}
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">3 · Who does the work</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['individual', User, 'Individual', 'One person does every step, start to end.'],
                ['team', Users, 'Team', 'A team leader plus people assigned per step.']
              ].map(([key, Icon, label, hint]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setMode(key)}
                  className={`text-left rounded-xl border-2 p-3 ${mode === key ? 'border-red-500 bg-red-50/40' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <Icon className="w-4 h-4" /> {label}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
                </button>
              ))}
            </div>

            {mode === 'individual' ? (
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Assigned person *</span>
                <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">— Select employee —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.department ? ` — ${e.department}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Team leader *</span>
                  <select className={inputCls} value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                    <option value="">— Select team leader —</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.department ? ` — ${e.department}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {steps.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {steps.map((s, i) => (
                      <div key={s.id} className="p-3 grid md:grid-cols-[minmax(0,220px)_1fr] gap-2 items-center">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          {s.step_type === 'approval' && <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                          {i + 1}. {s.name}
                        </div>
                        <div>
                          <PeoplePicker employees={employees} value={stepAssignees[s.id] || []} onChange={(ids) => setStepPeople(s.id, ids)} ariaLabel={`Assign people to ${s.name}`} />
                          {!(stepAssignees[s.id] || []).length && <p className="text-[11px] text-slate-400 mt-1">Defaults to the team leader</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Pick a pipeline to assign people per step. Without one, the team leader owns the single execution step.</p>
                )}
              </div>
            )}
          </section>

          {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}
