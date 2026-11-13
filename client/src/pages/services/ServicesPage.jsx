import React, { useState, useEffect } from 'react';
import { servicesService, departmentsService, workflowPresetsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { ServiceModal } from './ServiceModal';
import { ServicePreviewModal } from './ServicePreviewModal';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  Layers,
  Building2,
  Clock,
  UserCheck,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  Edit2,
  Power,
  Archive,
  LayoutGrid,
  Table as TableIcon,
  GitBranch,
  Sparkles,
  Users
} from 'lucide-react';

export function ServicesPage() {
  const { hasPermission, isOwner } = usePermission();

  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [presets, setPresets] = useState([]);

  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [previewServiceId, setPreviewServiceId] = useState(null);

  const canCreate = isOwner || hasPermission('services.create') || hasPermission('services.manage');
  const canUpdate = isOwner || hasPermission('services.update') || hasPermission('services.manage');

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    fetchServices();
  }, [searchTerm, selectedCategory, selectedDeptId, selectedStatus]);

  const loadMeta = async () => {
    try {
      const [catRes, deptRes, presetRes] = await Promise.allSettled([
        servicesService.getCategories(),
        departmentsService.getDepartments({ limit: 100 }),
        workflowPresetsService.getPresets({ limit: 100 })
      ]);

      if (catRes.status === 'fulfilled' && catRes.value.data?.categories) {
        setCategories(catRes.value.data.categories);
      }
      if (deptRes.status === 'fulfilled' && deptRes.value.data?.departments) {
        setDepartments(deptRes.value.data.departments);
      }
      if (presetRes.status === 'fulfilled' && presetRes.value.data?.presets) {
        setPresets(presetRes.value.data.presets);
      }
    } catch (err) {
      console.error('Failed loading metadata:', err);
    }
  };

  const fetchServices = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await servicesService.getServices({
        search: searchTerm,
        category: selectedCategory,
        departmentId: selectedDeptId,
        status: selectedStatus,
        limit: 100
      });
      setServices(res.data.services || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load services catalogue.');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleOpenCreate = () => {
    setEditingService(null);
    setServiceModalOpen(true);
  };

  const handleOpenEdit = (svc) => {
    setEditingService(svc);
    setServiceModalOpen(true);
  };

  const handleToggleStatus = async (svc) => {
    const nextStatus = svc.status === 'active' ? 'inactive' : 'active';
    try {
      await servicesService.changeStatus(svc.id, nextStatus);
      showToast(`Service "${svc.name}" is now ${nextStatus}.`);
      fetchServices();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to update service status.');
    }
  };

  const handleArchive = async (svc) => {
    if (!window.confirm(`Are you sure you want to archive "${svc.name}"?`)) return;
    try {
      await servicesService.archiveService(svc.id);
      showToast(`Service "${svc.name}" has been archived.`);
      fetchServices();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to archive service.');
    }
  };

  // Metrics
  const activeCount = services.filter((s) => s.status === 'active').length;
  const totalDeployments = services.reduce((acc, s) => acc + (s.active_instances_count || 0), 0);
  const categoryCount = new Set(services.map((s) => s.category)).size;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notice */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Service Management
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                Master Catalogue
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Reusable agency services, execution cycles, department governance & automated workflow blueprints
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreate}
            className="px-5 py-3 rounded-2xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Define New Service
          </button>
        )}
      </div>

      {/* Metrics Counter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Total Services
          </div>
          <div className="text-2xl font-black text-slate-900">{total}</div>
          <div className="text-xs text-slate-500 mt-1 font-medium">Defined in master catalogue</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Active & Deployable
          </div>
          <div className="text-2xl font-black text-emerald-600">{activeCount}</div>
          <div className="text-xs text-emerald-600 mt-1 font-medium">Ready for client bundling</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Service Categories
          </div>
          <div className="text-2xl font-black text-blue-600">{categoryCount}</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">Digital, Creative & Tech</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Active Client Instances
          </div>
          <div className="text-2xl font-black text-purple-600">{totalDeployments}</div>
          <div className="text-xs text-purple-600 mt-1 font-medium">Live client engagements</div>
        </div>
      </div>

      {/* Filter and View Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search services or codes..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-end md:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${
              viewMode === 'grid' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Grid Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-all ${
              viewMode === 'table' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Table View"
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Services List / Grid */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          <p className="text-sm font-semibold">Loading service catalogue...</p>
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Services Found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm || selectedCategory || selectedDeptId
              ? 'No services match the active filter criteria. Try clearing filters.'
              : 'Start by creating your first service catalogue record.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Badges */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {svc.service_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        svc.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {svc.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-slate-900 group-hover:text-red-600 transition-colors line-clamp-1 mb-1">
                  {svc.name}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                  {svc.description || 'Master agency service definition ready for client assignment.'}
                </p>

                {/* Meta list */}
                <div className="space-y-2 border-t border-slate-50 pt-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="font-semibold text-slate-800">{svc.category}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {svc.department_name || 'Cross-functional'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Execution Cycle:</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {svc.execution_cycle || 'Monthly'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Workflow Template:</span>
                    <span className="font-semibold text-blue-600 flex items-center gap-1 truncate max-w-[150px]">
                      <GitBranch className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="truncate">{svc.workflow_preset_name || 'Auto-Trigger Engine'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>
                    <strong className="text-slate-800">{svc.active_instances_count}</strong> active
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewServiceId(svc.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Preview Workflow Blueprint"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {canUpdate && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(svc)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Edit Service"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(svc)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          svc.status === 'active'
                            ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={svc.status === 'active' ? 'Deactivate Service' : 'Activate Service'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleArchive(svc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Archive Service"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-5 py-3.5">Service Code</th>
                  <th className="px-5 py-3.5">Service Name</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Cycle</th>
                  <th className="px-5 py-3.5">Workflow Template</th>
                  <th className="px-5 py-3.5">Active Clients</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((svc) => (
                  <tr key={svc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-700">
                      {svc.service_code}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900 max-w-[220px] truncate">
                      {svc.name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{svc.category}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {svc.department_name || 'Cross-functional'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{svc.execution_cycle}</td>
                    <td className="px-5 py-3.5 text-blue-600 font-medium">
                      {svc.workflow_preset_name || 'Standard Automation'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold">
                        {svc.active_instances_count} live
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold ${
                          svc.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {svc.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1">
                      <button
                        onClick={() => setPreviewServiceId(svc.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                        title="Preview Workflow"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {canUpdate && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(svc)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(svc)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-amber-600"
                            title="Toggle Status"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleArchive(svc)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"
                            title="Archive"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Service Create/Edit Modal */}
      <ServiceModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        service={editingService}
        departments={departments}
        presets={presets}
        onSuccess={(msg) => {
          showToast(msg);
          fetchServices();
        }}
      />

      {/* Service Workflow Preview Drawer/Modal */}
      <ServicePreviewModal
        isOpen={Boolean(previewServiceId)}
        serviceId={previewServiceId}
        onClose={() => setPreviewServiceId(null)}
      />
    </div>
  );
}
