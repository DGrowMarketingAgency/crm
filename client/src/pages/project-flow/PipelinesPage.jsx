import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Plus, Pencil, Archive, RotateCcw, ArrowUp, ArrowDown, Trash2, X, ShieldCheck, Hammer, Search } from 'lucide-react';
import { projectFlowService, servicesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageState, Empty, errorMessage, inputCls, btnPrimary, btnSecondary } from './flowUi';

const blankStep = () => ({ key: Math.random().toString(36).slice(2), name: '', description: '', stepType: 'work', needsAdminApproval: true, needsClientApproval: true, estDays: '' });

function StepChip({ step, index }) {
  const approval = step.step_type === 'approval';
  return (
    <div className="flex items-center gap-2">
      {index > 0 && <span className="text-slate-300">→</span>}
      <span
        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${
          approval ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'
        }`}
      >
        {index + 1}. {step.name}
      </span>
    </div>
  );
}

function PipelineEditor({ pipeline, services, onClose, onSaved }) {
  const [name, setName] = useState(pipeline?.name || '');
  const [description, setDescription] = useState(pipeline?.description || '');
  const [serviceId, setServiceId] = useState(pipeline?.service_id ? String(pipeline.service_id) : '');
  const [steps, setSteps] = useState(
    pipeline?.steps?.length
      ? pipeline.steps.map((s) => ({
          key: String(s.id),
          name: s.name,
          description: s.description || '',
          stepType: s.step_type,
          needsAdminApproval: Boolean(s.needs_admin_approval),
          needsClientApproval: Boolean(s.needs_client_approval),
          estDays: s.est_days ?? ''
        }))
      : [blankStep()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (i, patch) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i, dir) =>
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (steps.some((s) => !s.name.trim())) {
      setError('Every step needs a name');
      return;
    }
    if (steps.some((s) => s.stepType === 'approval' && !s.needsAdminApproval && !s.needsClientApproval)) {
      setError('Approval steps need admin approval, client approval, or both');
      return;
    }
    setSaving(true);
    const payload = {
      name,
      description,
      serviceId: serviceId ? Number(serviceId) : null,
      steps: steps.map((s) => ({
        name: s.name,
        description: s.description || null,
        stepType: s.stepType,
        needsAdminApproval: s.needsAdminApproval,
        needsClientApproval: s.needsClientApproval,
        estDays: s.estDays === '' ? null : Number(s.estDays)
      }))
    };
    try {
      if (pipeline?.id) await projectFlowService.updatePipeline(pipeline.id, payload);
      else await projectFlowService.createPipeline(payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save pipeline'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">{pipeline?.id ? 'Edit pipeline' : 'New project pipeline'}</h2>
            <p className="text-xs text-slate-500">Define the steps every project of this kind goes through. Projects keep their own copy, so editing later is safe.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Pipeline name *</span>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Development" required />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Service (auto-selects this pipeline)</span>
              <select className={inputCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">— Any service —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Description</span>
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Steps ({steps.length})</span>
              <div className="flex gap-2">
                <button type="button" className="text-xs font-bold text-slate-700 hover:text-red-600 inline-flex items-center gap-1" onClick={() => setSteps((p) => [...p, blankStep()])}>
                  <Hammer className="w-3.5 h-3.5" /> Add work step
                </button>
                <button
                  type="button"
                  className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
                  onClick={() => setSteps((p) => [...p, { ...blankStep(), name: 'Admin & client approval', stepType: 'approval' }])}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Add approval step
                </button>
              </div>
            </div>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={s.key} className={`rounded-xl border p-3 ${s.stepType === 'approval' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-6 h-6 shrink-0 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                    <div className="flex-1 grid md:grid-cols-[1fr_140px_90px] gap-2">
                      <input className={inputCls} value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Step name, e.g. Content writing" aria-label={`Step ${i + 1} name`} />
                      <select className={inputCls} value={s.stepType} onChange={(e) => update(i, { stepType: e.target.value })} aria-label={`Step ${i + 1} type`}>
                        <option value="work">Work step</option>
                        <option value="approval">Approval</option>
                      </select>
                      <input className={inputCls} type="number" min="0" value={s.estDays} onChange={(e) => update(i, { estDays: e.target.value })} placeholder="Days" aria-label={`Step ${i + 1} estimated days`} />
                      {s.stepType === 'approval' && (
                        <div className="md:col-span-3 flex gap-4 text-xs font-semibold text-slate-700">
                          <label className="inline-flex items-center gap-1.5">
                            <input type="checkbox" checked={s.needsAdminApproval} onChange={(e) => update(i, { needsAdminApproval: e.target.checked })} /> Admin / team-leader approval
                          </label>
                          <label className="inline-flex items-center gap-1.5">
                            <input type="checkbox" checked={s.needsClientApproval} onChange={(e) => update(i, { needsClientApproval: e.target.checked })} /> Client approval
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button type="button" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))} disabled={steps.length === 1} className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-30" aria-label="Remove step">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save pipeline'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function PipelinesPage() {
  const { hasPermission, isOwner } = usePermission();
  const canEdit = isOwner || hasPermission('workflows.create') || hasPermission('workflows.update');
  const [pipelines, setPipelines] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s] = await Promise.all([
        projectFlowService.getPipelines({ includeArchived: showArchived }),
        servicesService.getServices ? servicesService.getServices({ limit: 100 }).catch(() => null) : null
      ]);
      setPipelines(p.data.pipelines);
      const list = s?.data?.services || s?.data?.data || [];
      setServices(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(errorMessage(err, 'Could not load pipelines'));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArchive = async (p) => {
    try {
      await projectFlowService.setPipelineStatus(p.id, p.status === 'active' ? 'archived' : 'active');
      load();
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const filtered = pipelines.filter((p) => !search.trim() || `${p.name} ${p.service_name || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Project Pipeline</h1>
            <p className="text-sm text-slate-500">Step-by-step flows per service. Pick one when creating a project and the steps are set automatically.</p>
          </div>
        </div>
        {canEdit && (
          <button className={btnPrimary} onClick={() => setEditing({})}>
            <Plus className="w-4 h-4" /> New pipeline
          </button>
        )}
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search pipelines…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="text-xs font-semibold text-slate-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {filtered.length === 0 ? (
          <Empty
            icon={GitBranch}
            title="No pipelines yet"
            text="Create one per service — e.g. Website: Competitor & keyword analysis → Content writing → Admin & client approval → Design → Approval → Development → Testing → Final approval."
            action={canEdit && <button className={btnPrimary} onClick={() => setEditing({})}><Plus className="w-4 h-4" /> New pipeline</button>}
          />
        ) : (
          <div className="grid gap-4">
            {filtered.map((p) => (
              <div key={p.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${p.status === 'archived' ? 'opacity-60' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-900">{p.name}</h3>
                      {p.service_name && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{p.service_name}</span>}
                      {p.status === 'archived' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">Archived</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.step_count} steps · used by {p.project_count} project{Number(p.project_count) === 1 ? '' : 's'}
                      {p.description ? ` · ${p.description}` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <button className={btnSecondary} onClick={() => setEditing(p)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button className={btnSecondary} onClick={() => toggleArchive(p)}>
                        {p.status === 'active' ? <Archive className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        {p.status === 'active' ? 'Archive' : 'Restore'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-y-2 gap-x-1">
                  {p.steps.map((s, i) => (
                    <StepChip key={s.id} step={s} index={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageState>

      {editing && (
        <PipelineEditor
          pipeline={editing.id ? editing : null}
          services={services}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
