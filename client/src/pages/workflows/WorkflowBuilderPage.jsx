import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { workflowPresetsService, departmentsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  Layers,
  ArrowLeft,
  Plus,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  Building2,
  Lock,
  Unlock,
  GitBranch,
  Trash2,
  Edit3,
  MoveLeft,
  MoveRight,
  ShieldCheck,
  UserCheck,
  FileCheck,
  CheckSquare,
  Link,
  Loader2,
  Eye,
  Send,
  Archive,
  AlertTriangle,
  X
} from 'lucide-react';

export function WorkflowBuilderPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const isNew = !id;
  const initialDeptId = searchParams.get('departmentId') || '';

  // Data State
  const [preset, setPreset] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [version, setVersion] = useState(null);
  const [stages, setStages] = useState([]);
  const [allVersions, setAllVersions] = useState([]);

  // New Preset Form State (if isNew)
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(initialDeptId);
  const [serviceCategory, setServiceCategory] = useState('Digital Marketing');
  const [workflowType, setWorkflowType] = useState('standard');

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals & Panels
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  const [dependencyModalOpen, setDependencyModalOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState(null);

  const [validationReport, setValidationReport] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const isDraft = version?.status === 'draft';
  const isPublished = version?.status === 'published';
  const canPublish = isOwner || hasPermission('workflows.publish');
  const canEdit = (isOwner || hasPermission('workflows.update')) && isDraft;

  useEffect(() => {
    fetchDepartments();
    if (!isNew) {
      loadPreset();
    }
  }, [id]);

  const fetchDepartments = async () => {
    try {
      const res = await departmentsService.getDepartments({ limit: 100 });
      setDepartments(res.data.departments || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPreset = async (versionId = null) => {
    setIsLoading(true);
    setError('');
    try {
      const [pRes, vRes] = await Promise.all([
        workflowPresetsService.getPreset(id, versionId ? { versionId } : undefined),
        workflowPresetsService.getVersions(id)
      ]);

      setPreset(pRes.data);
      setVersion(pRes.data.version);
      setStages(pRes.data.stages || []);
      setAllVersions(vRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load workflow builder.');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  // --- Handle New Preset Creation ---
  const handleCreateNewPreset = async (e) => {
    e.preventDefault();
    if (!name.trim() || !departmentId) {
      setError('Please provide a Preset Name and select a Department.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const res = await workflowPresetsService.createPreset({
        name: name.trim(),
        preset_code: code.trim() ? code.trim().toUpperCase() : undefined,
        description: description.trim() || null,
        department_id: Number(departmentId),
        service_category: serviceCategory,
        workflow_type: workflowType
      });

      showToast('Preset initialized in Draft status.');
      navigate(`/workflows/${res.data.id}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to initialize preset.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Branch into New Draft Version ---
  const handleCreateDraftVersion = async () => {
    if (!window.confirm('Create a new Draft version branching from this published workflow?')) return;
    setIsSaving(true);
    try {
      const res = await workflowPresetsService.createDraftVersion(preset.id);
      showToast(`Branched to Draft Version v${res.data.version.version_number}.`);
      loadPreset(res.data.version.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Failed to create draft version.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Validate Workflow ---
  const handleRunValidation = async () => {
    if (!version) return;
    setIsValidating(true);
    try {
      const res = await workflowPresetsService.validateVersion(preset.id, version.id);
      setValidationReport(res.data);
      setValidationPanelOpen(true);
      if (res.data.valid) {
        showToast('All workflow rules passed validation check!');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  // --- Publish Workflow ---
  const handleConfirmPublish = async () => {
    setIsPublishing(true);
    try {
      const res = await workflowPresetsService.publishVersion(preset.id, version.id);
      showToast('Workflow preset published! Version is now immutable and ready for execution pipelines.');
      setPublishModalOpen(false);
      loadPreset(version.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Publishing failed. Resolve validation errors first.');
    } finally {
      setIsPublishing(false);
    }
  };

  // --- Reorder Stages ---
  const handleMoveStage = async (stageIndex, direction) => {
    if (!canEdit) return;
    const targetIndex = stageIndex + direction;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const newStages = [...stages];
    const temp = newStages[stageIndex];
    newStages[stageIndex] = newStages[targetIndex];
    newStages[targetIndex] = temp;

    const orders = newStages.map((s, idx) => ({
      stageId: s.id,
      displayOrder: idx + 1
    }));

    setStages(newStages);

    try {
      await workflowPresetsService.reorderStages(preset.id, version.id, { orders });
    } catch (err) {
      console.error(err);
      loadPreset(version.id);
    }
  };

  // --- Delete Stage ---
  const handleDeleteStage = async (stageId, stageName) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete stage "${stageName}" and its task templates?`)) return;

    try {
      await workflowPresetsService.deleteStage(preset.id, version.id, stageId);
      showToast(`Stage "${stageName}" removed.`);
      loadPreset(version.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Failed to delete stage.');
    }
  };

  // --- Delete Task ---
  const handleDeleteTask = async (taskId, taskTitle) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete task template "${taskTitle}"?`)) return;

    try {
      await workflowPresetsService.deleteTask(preset.id, version.id, taskId);
      showToast(`Task "${taskTitle}" removed.`);
      loadPreset(version.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Failed to delete task.');
    }
  };

  // --- RENDER NEW PRESET FORM ---
  if (isNew) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div>
          <button
            onClick={() => navigate('/workflows')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Presets
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 font-extrabold text-lg shadow-sm">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Create Workflow Preset</h1>
              <p className="text-xs text-slate-500">Initialize a draft operational blueprint for department services</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreateNewPreset} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
              Preset Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!code) {
                  setCode('WP_' + e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20));
                }
              }}
              placeholder="e.g., SEO Technical Audit & On-Page Plan"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                required
              >
                <option value="">Select Department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Preset Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., WP_SEO_AUDIT"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Service Category
              </label>
              <select
                value={serviceCategory}
                onChange={(e) => setServiceCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              >
                <option value="Digital Marketing">Digital Marketing</option>
                <option value="Paid Search">Paid Search</option>
                <option value="Paid Social">Paid Social</option>
                <option value="Design & Creative">Design & Creative</option>
                <option value="Creative Production">Creative Production</option>
                <option value="Development">Development</option>
                <option value="Social Media">Social Media</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Workflow Type
              </label>
              <select
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              >
                <option value="standard">Standard Execution</option>
                <option value="recurring_monthly">Recurring Monthly</option>
                <option value="one_time">One-Time Project</option>
                <option value="custom">Custom Framework</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
              Description
            </label>
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline the operational objective, cadence, and service scope..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => navigate('/workflows')}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/30 flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save & Open Builder
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- RENDER WORKFLOW BUILDER ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <span className="text-sm font-semibold text-slate-600">Loading workflow builder...</span>
      </div>
    );
  }

  if (!preset || !version) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-white rounded-2xl border border-red-200 text-center shadow-sm">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">Preset Not Found</h3>
        <p className="text-sm text-slate-500 mb-6">{error || 'Unable to load workflow preset.'}</p>
        <button
          onClick={() => navigate('/workflows')}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
        >
          Back to Presets
        </button>
      </div>
    );
  }

  // Calculate total tasks
  const allTasks = stages.flatMap((s) => s.tasks || []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Toast Notice */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{notice}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate('/workflows')}
              className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors mt-0.5"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {preset.name}
                </h1>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg">
                  {preset.preset_code}
                </span>

                {/* Status & Immutability Badge */}
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                    isPublished
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {isPublished ? (
                    <>
                      <Lock className="w-3 h-3 text-emerald-600" />
                      Published (Immutable v{version.version_number})
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3 text-amber-600" />
                      Draft (Editing v{version.version_number})
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Department: <strong className="text-slate-700">{preset.department_name}</strong> • Category: <strong className="text-slate-700">{preset.service_category}</strong> • Total Stages: <strong className="text-slate-700">{stages.length}</strong> • Tasks: <strong className="text-slate-700">{allTasks.length}</strong>
              </p>
            </div>
          </div>

          {/* Builder Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Version Switcher */}
            {allVersions.length > 1 && (
              <select
                value={version.id}
                onChange={(e) => loadPreset(Number(e.target.value))}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
              >
                {allVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} ({v.status})
                  </option>
                ))}
              </select>
            )}

            {/* Validate Button */}
            <button
              onClick={handleRunValidation}
              disabled={isValidating}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
            >
              {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />}
              Validate Rules
            </button>

            {/* If Draft: Publish Button */}
            {isDraft && canPublish && (
              <button
                onClick={() => setPublishModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                Publish Version
              </button>
            )}

            {/* If Published: Branch New Draft Button */}
            {isPublished && (
              <button
                onClick={handleCreateDraftVersion}
                disabled={isSaving}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-bold rounded-xl shadow-md shadow-red-600/20 flex items-center gap-1.5 transition-all"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Branch New Draft (v{allVersions[0]?.version_number + 1 || version.version_number + 1})
              </button>
            )}

            {/* Add Stage Button */}
            {canEdit && (
              <button
                onClick={() => {
                  setEditingStage(null);
                  setStageModalOpen(true);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Stage
              </button>
            )}
          </div>
        </div>

        {/* Immutability Alert Banner */}
        {isPublished && (
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-800">
            <span className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Published Immutable Version:</strong> Direct edits to stages and tasks are locked to safeguard live project templates. To modify stages, click <strong>"Branch New Draft"</strong>.
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Pipeline Stages View */}
      {stages.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200/80 shadow-sm text-center">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">No Stages Configured</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
            Add stages to define the sequence of work (e.g., Audit, Strategy, Execution, Reporting).
          </p>
          {canEdit && (
            <button
              onClick={() => {
                setEditingStage(null);
                setStageModalOpen(true);
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl"
            >
              Add First Stage
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {stages.map((stage, stageIdx) => (
            <div
              key={stage.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
            >
              {/* Stage Header */}
              <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                    {stage.display_order}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{stage.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">({stage.stage_key})</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-200/60 text-slate-700 rounded capitalize">
                        {stage.stage_category}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stage Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                  {stage.is_client_facing && (
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded">
                      Client-Facing
                    </span>
                  )}
                  {stage.is_review_required && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                      Review Required
                    </span>
                  )}
                  {stage.requires_deliverable && (
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                      Deliverable Required
                    </span>
                  )}

                  {/* Stage Reorder Controls */}
                  {canEdit && (
                    <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                      <button
                        disabled={stageIdx === 0}
                        onClick={() => handleMoveStage(stageIdx, -1)}
                        className="p-1 hover:bg-slate-200 text-slate-500 rounded disabled:opacity-30"
                        title="Move Stage Up"
                      >
                        <MoveLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={stageIdx === stages.length - 1}
                        onClick={() => handleMoveStage(stageIdx, 1)}
                        className="p-1 hover:bg-slate-200 text-slate-500 rounded disabled:opacity-30"
                        title="Move Stage Down"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingStage(stage);
                          setStageModalOpen(true);
                        }}
                        className="p-1 hover:bg-slate-200 text-slate-600 rounded ml-1"
                        title="Edit Stage"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStage(stage.id, stage.name)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                        title="Delete Stage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks List within Stage */}
              <div className="p-5 space-y-3">
                {(!stage.tasks || stage.tasks.length === 0) ? (
                  <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                    No task templates defined for this stage yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stage.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-4 bg-slate-50/70 border border-slate-200/70 rounded-xl space-y-2 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                  task.priority === 'urgent'
                                    ? 'bg-red-100 text-red-700'
                                    : task.priority === 'high'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {task.priority}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {task.task_key}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              {task.title}
                            </h4>
                          </div>

                          {/* Task Actions */}
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setTargetTaskId(task.id);
                                  setDependencyModalOpen(true);
                                }}
                                className="p-1 hover:bg-slate-200 text-slate-500 rounded"
                                title="Manage Dependencies"
                              >
                                <Link className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTask(task);
                                  setTargetStageId(stage.id);
                                  setTaskModalOpen(true);
                                }}
                                className="p-1 hover:bg-slate-200 text-slate-600 rounded"
                                title="Edit Task"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id, task.title)}
                                className="p-1 hover:bg-red-100 text-red-600 rounded"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Task Metadata */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500 pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {task.estimated_duration_hours}h
                          </span>
                          <span>•</span>
                          <span>Deadline: +{task.relative_deadline_days}d</span>
                          {task.default_assignee_role && (
                            <>
                              <span>•</span>
                              <span className="text-slate-700">{task.default_assignee_role}</span>
                            </>
                          )}
                        </div>

                        {/* Dependencies Badges */}
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div className="pt-1.5 flex flex-wrap gap-1">
                            {task.dependencies.map((dep, dIdx) => {
                              const prerequisite = allTasks.find((t) => t.id === dep.dependsOnTaskId);
                              return (
                                <span
                                  key={dIdx}
                                  className="text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded flex items-center gap-1"
                                >
                                  <Link className="w-2.5 h-2.5" />
                                  Depends on: {prerequisite?.title || `Task #${dep.dependsOnTaskId}`}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Task Button for this Stage */}
                {canEdit && (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setEditingTask(null);
                        setTargetStageId(stage.id);
                        setTaskModalOpen(true);
                      }}
                      className="w-full py-2 border border-dashed border-slate-300 hover:border-red-400 hover:bg-red-50/40 text-slate-600 hover:text-red-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Task Template to {stage.name}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Validation Panel Drawer */}
      {validationPanelOpen && validationReport && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50 border-l border-slate-200 p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">Validation Summary</h3>
            </div>
            <button
              onClick={() => setValidationPanelOpen(false)}
              className="p-1 hover:bg-slate-100 rounded text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold ${
                validationReport.valid
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {validationReport.valid ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Preset passed all validation checks! Ready to publish.</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{validationReport.errors.length} configuration error(s) must be resolved.</span>
                </>
              )}
            </div>

            {/* Errors List */}
            {validationReport.errors.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-slate-500">Errors</span>
                {validationReport.errors.map((err, i) => (
                  <div key={i} className="p-3 bg-red-50/70 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
                    <strong className="block text-red-900 font-bold">{err.code}</strong>
                    <p>{err.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings List */}
            {validationReport.warnings.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase text-slate-500">Warnings</span>
                {validationReport.warnings.map((warn, i) => (
                  <div key={i} className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                    <strong className="block font-bold">{warn.code}</strong>
                    <p>{warn.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage Edit/Create Modal */}
      {stageModalOpen && (
        <StageModal
          isOpen={stageModalOpen}
          onClose={() => setStageModalOpen(false)}
          stage={editingStage}
          allStages={stages}
          onSave={async (data) => {
            if (editingStage) {
              await workflowPresetsService.updateStage(preset.id, version.id, editingStage.id, data);
            } else {
              await workflowPresetsService.addStage(preset.id, version.id, data);
            }
            setStageModalOpen(false);
            loadPreset(version.id);
          }}
        />
      )}

      {/* Task Edit/Create Modal */}
      {taskModalOpen && (
        <TaskModal
          isOpen={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          task={editingTask}
          stageId={targetStageId}
          onSave={async (data) => {
            if (editingTask) {
              await workflowPresetsService.updateTask(preset.id, version.id, editingTask.id, data);
            } else {
              await workflowPresetsService.addTask(preset.id, version.id, data);
            }
            setTaskModalOpen(false);
            loadPreset(version.id);
          }}
        />
      )}

      {/* Dependency Modal */}
      {dependencyModalOpen && targetTaskId && (
        <DependencyModal
          isOpen={dependencyModalOpen}
          onClose={() => setDependencyModalOpen(false)}
          currentTask={allTasks.find((t) => t.id === targetTaskId)}
          allTasks={allTasks}
          onAdd={async (dependsOnTaskId) => {
            await workflowPresetsService.addDependency(preset.id, version.id, targetTaskId, {
              dependsOnTaskId,
              dependencyType: 'finish_to_start'
            });
            loadPreset(version.id);
          }}
          onRemove={async (depTaskId) => {
            await workflowPresetsService.removeDependency(preset.id, version.id, targetTaskId, depTaskId);
            loadPreset(version.id);
          }}
        />
      )}

      {/* Publish Confirmation Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Publish Workflow Version {version.version_number}
            </h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Publishing will make this version <strong>immutable</strong> and live for department service pipelines.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1 mb-5">
              <p className="font-semibold text-slate-800">Operational Guarantee:</p>
              <p>• Publishing this preset will <strong>NOT</strong> generate any active tasks until explicitly applied to a project.</p>
              <p>• Existing project pipelines will retain their historical versions.</p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                disabled={isPublishing}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isPublishing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SUB-MODALS: STAGE, TASK, DEPENDENCY
// ==========================================

function StageModal({ isOpen, onClose, stage, allStages, onSave }) {
  const isEditing = Boolean(stage);
  const [name, setName] = useState(stage?.name || '');
  const [key, setKey] = useState(stage?.stage_key || '');
  const [category, setCategory] = useState(stage?.stage_category || 'execution');
  const [description, setDescription] = useState(stage?.description || '');
  const [isClientFacing, setIsClientFacing] = useState(Boolean(stage?.is_client_facing));
  const [isReviewRequired, setIsReviewRequired] = useState(Boolean(stage?.is_review_required));
  const [requiresDeliverable, setRequiresDeliverable] = useState(Boolean(stage?.requires_deliverable));
  const [reviewerRole, setReviewerRole] = useState(stage?.reviewer_policy?.role || 'manager');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        stage_key: key.trim() ? key.trim().toLowerCase() : undefined,
        stage_category: category,
        description: description.trim() || null,
        is_client_facing: isClientFacing,
        is_review_required: isReviewRequired,
        requires_deliverable: requiresDeliverable,
        reviewer_policy: (isReviewRequired || stage?.requires_client_approval) ? { role: reviewerRole } : null,
        completion_conditions: requiresDeliverable ? { deliverable_submitted: true } : null
      });
    } catch (e) {
      alert(e.response?.data?.error?.message || 'Failed to save stage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          {isEditing ? 'Edit Stage' : 'Add Stage'}
        </h3>
        <p className="text-xs text-slate-500 mb-4">Configure stage pipeline rules</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Stage Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEditing && !key) {
                  setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                }
              }}
              placeholder="e.g., Audit & Discovery"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-red-500"
              >
                <option value="planning">Planning</option>
                <option value="execution">Execution</option>
                <option value="review">Review</option>
                <option value="delivery">Delivery</option>
                <option value="reporting">Reporting</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Stage Key</label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase())}
                placeholder="e.g., audit-discovery"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={isClientFacing}
                onChange={(e) => setIsClientFacing(e.target.checked)}
                className="rounded text-red-600"
              />
              Client-Facing Stage
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={isReviewRequired}
                onChange={(e) => setIsReviewRequired(e.target.checked)}
                className="rounded text-red-600"
              />
              Internal Review Required
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={requiresDeliverable}
                onChange={(e) => setRequiresDeliverable(e.target.checked)}
                className="rounded text-red-600"
              />
              Requires Deliverable Submission
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl shadow-md"
            >
              {isSubmitting ? 'Saving...' : 'Save Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskModal({ isOpen, onClose, task, stageId, onSave }) {
  const isEditing = Boolean(task);
  const [title, setTitle] = useState(task?.title || '');
  const [role, setRole] = useState(task?.default_assignee_role || 'member');
  const [hours, setHours] = useState(task?.estimated_duration_hours || 4);
  const [days, setDays] = useState(task?.relative_deadline_days || 2);
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [description, setDescription] = useState(task?.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        stage_id: stageId,
        title: title.trim(),
        default_assignee_role: role.trim() || null,
        estimated_duration_hours: Number(hours),
        relative_deadline_days: Number(days),
        priority,
        description: description.trim() || null
      });
    } catch (e) {
      alert(e.response?.data?.error?.message || 'Failed to save task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          {isEditing ? 'Edit Task Template' : 'Add Task Template'}
        </h3>
        <p className="text-xs text-slate-500 mb-4">Configure work item details</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Audit competitor keywords and SERP ranking"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Deadline (+d)</label>
              <input
                type="number"
                min="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Default Assignee Role
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., SEO Specialist, Graphic Designer, Lead Dev"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Instructions & Deliverable Description
            </label>
            <textarea
              rows="2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline steps or deliverables expected..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl shadow-md"
            >
              {isSubmitting ? 'Saving...' : 'Save Task Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DependencyModal({ isOpen, onClose, currentTask, allTasks, onAdd, onRemove }) {
  const [selectedPrereqId, setSelectedPrereqId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentTask) return null;

  // Filter tasks that can be picked as prerequisite (cannot depend on self)
  const candidateTasks = allTasks.filter((t) => t.id !== currentTask.id);

  const handleAddDependency = async (e) => {
    e.preventDefault();
    if (!selectedPrereqId) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onAdd(Number(selectedPrereqId));
      setSelectedPrereqId('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add dependency. Possible circular loop.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Task Dependencies for: {currentTask.title}
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Tasks that must finish before this task can start
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Existing Dependencies */}
        <div className="space-y-2 mb-4">
          <span className="text-[11px] font-bold uppercase text-slate-400">Current Prerequisites:</span>
          {(!currentTask.dependencies || currentTask.dependencies.length === 0) ? (
            <p className="text-xs text-slate-400 italic">No dependencies configured.</p>
          ) : (
            currentTask.dependencies.map((dep, i) => {
              const prereq = allTasks.find((t) => t.id === dep.dependsOnTaskId);
              return (
                <div
                  key={i}
                  className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800 truncate">
                    {prereq?.title || `Task #${dep.dependsOnTaskId}`}
                  </span>
                  <button
                    onClick={() => onRemove(dep.dependsOnTaskId)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove dependency"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add Dependency Form */}
        <form onSubmit={handleAddDependency} className="space-y-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Add Prerequisite Task
            </label>
            <select
              value={selectedPrereqId}
              onChange={(e) => setSelectedPrereqId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              <option value="">Select Task...</option>
              {candidateTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.task_key})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedPrereqId}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              Add Prerequisite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
