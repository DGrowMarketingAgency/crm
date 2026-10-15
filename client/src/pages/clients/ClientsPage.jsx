import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clientsService, servicesCatalogService, usersService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Sparkles,
  Layers,
  CheckCircle2,
  Clock,
  User,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Loader2,
  X,
  Tag,
  Briefcase,
  Activity,
  AlertTriangle,
  Download,
  Calendar,
  Users,
  ChevronLeft,
  ArrowUpDown,
  Phone,
  Mail,
  CheckSquare
} from 'lucide-react';

const LIFECYCLE_OPTIONS = [
  { key: 'all', label: 'All Lifecycle Stages' },
  { key: 'lead', label: 'Lead / Opportunity' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal / Discussion' },
  { key: 'won', label: 'Won' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'offboarded', label: 'Offboarded / Completed' },
  // Backward compatibility L0-L6
  { key: 'L0', label: 'L0: Signed Client' },
  { key: 'L1', label: 'L1: Onboarding' },
  { key: 'L2', label: 'L2: Strategy' },
  { key: 'L3', label: 'L3: Execution' },
  { key: 'L4', label: 'L4: Review' },
  { key: 'L5', label: 'L5: Reporting' },
  { key: 'L6', label: 'L6: Renewal' }
];

export function ClientsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner, user } = usePermission();

  const [clients, setClients] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedAm, setSelectedAm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  // Bundling Modal (Phase 1 preservation)
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundlingClient, setBundlingClient] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [isBundling, setIsBundling] = useState(false);

  // New Client Modal
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    clientCode: '',
    companyName: '',
    industry: '',
    website: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'India',
    entity: 'D-Grow',
    vertical: 'General',
    lifecycleStage: 'onboarding',
    accountManagerId: '',
    requirementsNotes: '',
    primaryContact: {
      name: '',
      designation: '',
      email: '',
      phone: ''
    }
  });

  const [accountManagers, setAccountManagers] = useState([]);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const canCreateClient = isOwner || hasPermission('clients.create');
  const canExport = isOwner || hasPermission('clients.export');
  const canBundle = isOwner || hasPermission('services.bundle') || hasPermission('services.manage');

  useEffect(() => {
    fetchDashboardStats();
    fetchCatalog();
    fetchAccountManagers();
  }, []);

  useEffect(() => {
    fetchClients();
  }, [page, searchTerm, selectedStatus, selectedEntity, selectedStage, selectedAm, selectedIndustry, sortBy, sortOrder]);

  const fetchDashboardStats = async () => {
    setIsStatsLoading(true);
    try {
      const res = await clientsService.getDashboardStats();
      setDashboardStats(res.data.stats || {});
    } catch (err) {
      console.warn('Dashboard stats fetch error:', err);
    } finally {
      setIsStatsLoading(false);
    }
  };

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const params = {
        limit,
        offset: (page - 1) * limit,
        sortBy,
        sortOrder
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedEntity !== 'all') params.entity = selectedEntity;
      if (selectedStage !== 'all') params.lifecycleStage = selectedStage;
      if (selectedAm) params.accountManagerId = selectedAm;
      if (selectedIndustry.trim()) params.industry = selectedIndustry.trim();

      const res = await clientsService.getClients(params);
      setClients(res.data.clients || []);
      setTotalCount(res.data.total || 0);
    } catch (err) {
      console.error('Failed to load clients:', err);
      setError('Unable to fetch clients list.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await servicesCatalogService.getCatalog();
      setCatalog(res.data.catalog || res.data.services || []);
    } catch (err) {
      console.error('Failed to load service catalog:', err);
    }
  };

  const fetchAccountManagers = async () => {
    try {
      const res = await clientsService.getEligibleAccountManagers();
      setAccountManagers(res.data.managers || []);
    } catch (err) {
      console.error('Failed to load account managers:', err);
    }
  };

  const handleExportClients = async () => {
    setIsExporting(true);
    try {
      const res = await clientsService.exportClients();
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dgrow-clients-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export clients data.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenBundleModal = (client) => {
    setBundlingClient(client);
    setSelectedServices([]);
    setBundleModalOpen(true);
  };

  const toggleServiceSelection = (code) => {
    setSelectedServices((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmitBundle = async (e) => {
    e.preventDefault();
    if (!bundlingClient || selectedServices.length === 0) return;

    setIsBundling(true);
    try {
      const res = await clientsService.bundleServices(bundlingClient.id, {
        serviceTypes: selectedServices
      });
      setNotice(`Successfully bundled ${selectedServices.length} service(s) onto ${bundlingClient.name}!`);
      setTimeout(() => setNotice(''), 4500);
      setBundleModalOpen(false);
      fetchClients();
      fetchDashboardStats();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to bundle services onto client.');
      setTimeout(() => setError(''), 4500);
    } finally {
      setIsBundling(false);
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setIsCreatingClient(true);
    try {
      const payload = {
        ...newClientForm,
        accountManagerId: newClientForm.accountManagerId ? Number(newClientForm.accountManagerId) : null,
        primaryContact: newClientForm.primaryContact.name ? newClientForm.primaryContact : undefined
      };
      await clientsService.createClient(payload);
      setNotice(`Client "${newClientForm.name}" created successfully!`);
      setTimeout(() => setNotice(''), 4500);
      setNewClientModalOpen(false);
      setNewClientForm({
        name: '',
        clientCode: '',
        companyName: '',
        industry: '',
        website: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'India',
        entity: 'D-Grow',
        vertical: 'General',
        lifecycleStage: 'onboarding',
        accountManagerId: '',
        requirementsNotes: '',
        primaryContact: { name: '', designation: '', email: '', phone: '' }
      });
      fetchClients();
      fetchDashboardStats();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create client.');
      setTimeout(() => setError(''), 4500);
    } finally {
      setIsCreatingClient(false);
    }
  };

  const getStageBadgeColor = (stage) => {
    switch (stage?.toLowerCase()) {
      case 'lead':
      case 'l0': return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'qualified':
      case 'proposal': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'won':
      case 'onboarding':
      case 'l1': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'active':
      case 'l2':
      case 'l3':
      case 'l4':
      case 'l5': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'paused': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'completed':
      case 'offboarded':
      case 'l6': return 'bg-slate-200 text-slate-700 border-slate-400';
      default: return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Client Management Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Full client lifecycle oversight, account ownership, onboarding sequences, and service workflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canExport && (
            <button
              onClick={handleExportClients}
              disabled={isExporting}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-slate-500" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}

          {canCreateClient && (
            <button
              onClick={() => setNewClientModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              New Client
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 1. Client Management Dashboard: Real Database Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Clients</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {isStatsLoading ? '—' : dashboardStats?.totalClients || 0}
          </p>
          <span className="text-[11px] text-slate-400">Database verified</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Active Clients</span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {isStatsLoading ? '—' : dashboardStats?.activeClients || 0}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">In execution & retainers</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">In Onboarding</span>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {isStatsLoading ? '—' : dashboardStats?.onboardingClients || 0}
          </p>
          <span className="text-[11px] text-blue-600 font-medium">Checklist in progress</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Paused Clients</span>
          <p className="text-2xl font-bold text-rose-700 mt-1">
            {isStatsLoading ? '—' : dashboardStats?.pausedClients || 0}
          </p>
          <span className="text-[11px] text-rose-600 font-medium">Temporarily on hold</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Awaiting Required Info</span>
          <p className="text-2xl font-bold text-amber-700 mt-1">
            {isStatsLoading ? '—' : dashboardStats?.awaitingInfoClients || 0}
          </p>
          <span className="text-[11px] text-amber-600 font-medium">Missing GST/Overdue items</span>
        </div>
      </div>

      {/* 2. Breakdown Widgets (AMs, Lifecycle Stages, Upcoming Milestones) */}
      {dashboardStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Account Manager Grouping */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" /> Clients by Account Manager
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
              {dashboardStats.byAccountManager?.map((am, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded">
                  <span className="font-medium text-slate-800 truncate pr-2">{am.accountManagerName}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-bold font-mono">
                      {am.clientCount} clients
                    </span>
                    <span className="text-emerald-600 text-[11px]">({am.activeCount} active)</span>
                  </div>
                </div>
              ))}
              {(!dashboardStats.byAccountManager || dashboardStats.byAccountManager.length === 0) && (
                <p className="text-slate-400 text-xs italic">No client allocations recorded.</p>
              )}
            </div>
          </div>

          {/* Lifecycle Stages Grouping */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> By Lifecycle Stage
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
              {dashboardStats.byLifecycleStage?.map((st, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded">
                  <span className={`px-2 py-0.5 rounded font-medium border ${getStageBadgeColor(st.stage)}`}>
                    {st.stage}
                  </span>
                  <span className="font-bold text-slate-800 font-mono">{st.count} clients</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Milestones / Renewals */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-600" /> Upcoming Renewals (60 Days)
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
              {dashboardStats.upcomingRenewals?.map((rn, idx) => (
                <div key={idx} className="p-1.5 bg-amber-50/50 rounded border border-amber-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 truncate">{rn.name}</p>
                    <span className="text-[10px] text-slate-500">AM: {rn.account_manager_name || 'Unassigned'}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    {rn.days_remaining}d left
                  </span>
                </div>
              ))}
              {(!dashboardStats.upcomingRenewals || dashboardStats.upcomingRenewals.length === 0) && (
                <p className="text-slate-400 text-xs italic">No contract expirations in the next 60 days.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Search and Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client name, code, contact or email..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
            className="px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="paused">Paused</option>
            <option value="offboarded">Offboarded</option>
          </select>

          {/* Lifecycle Stage Filter */}
          <select
            value={selectedStage}
            onChange={(e) => { setSelectedStage(e.target.value); setPage(1); }}
            className="px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
          >
            {LIFECYCLE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          {/* Account Manager Filter */}
          <select
            value={selectedAm}
            onChange={(e) => { setSelectedAm(e.target.value); setPage(1); }}
            className="px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
          >
            <option value="">All Account Managers</option>
            {accountManagers.map((am) => (
              <option key={am.id} value={am.id}>{am.name}</option>
            ))}
          </select>
        </div>

        {/* Secondary filters row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>Entity:</span>
            {['all', 'D-Grow', 'MedGrowDigi'].map((ent) => (
              <button
                key={ent}
                onClick={() => { setSelectedEntity(ent); setPage(1); }}
                className={`px-2 py-0.5 rounded font-medium ${
                  selectedEntity === ent ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {ent === 'all' ? 'All Entities' : ent}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span>Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs border-0 bg-transparent text-slate-700 font-medium cursor-pointer"
            >
              <option value="name">Name</option>
              <option value="created_at">Created Date</option>
              <option value="lifecycle_stage">Lifecycle Stage</option>
              <option value="client_code">Client Code</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
              className="p-1 hover:bg-slate-100 rounded"
              title="Toggle Sort Order"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Client Directory Listing Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-xs text-slate-400">Loading authorized client records...</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-semibold text-slate-700">No Clients Found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No matching client records found with current filters or scope permissions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-3 px-4">Client / Code</th>
                  <th className="py-3 px-4">Primary Contact</th>
                  <th className="py-3 px-4">Account Manager</th>
                  <th className="py-3 px-4">Lifecycle Stage</th>
                  <th className="py-3 px-4">Onboarding</th>
                  <th className="py-3 px-4">Services</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    {/* Client Name & Code */}
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/clients/${c.id}`}
                          className="hover:text-blue-600 text-slate-900 font-bold flex items-center gap-1.5"
                        >
                          {c.name}
                        </Link>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 border text-slate-700 rounded font-semibold">
                          {c.client_code || 'CLT-—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs font-normal text-slate-500">
                        {c.company_name && <span>{c.company_name}</span>}
                        {c.industry && <span className="text-[11px] text-slate-400">({c.industry})</span>}
                        <span className="text-[10px] px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded">
                          {c.entity}
                        </span>
                      </div>
                    </td>

                    {/* Primary Contact */}
                    <td className="py-3.5 px-4 text-xs">
                      <p className="font-medium text-slate-800">{c.primary_contact_name || c.name}</p>
                      <p className="text-slate-400 truncate max-w-[160px]">{c.primary_contact_email || c.email}</p>
                    </td>

                    {/* Account Manager */}
                    <td className="py-3.5 px-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                          {(c.account_manager_name || 'U')[0]}
                        </div>
                        <span className="font-medium text-slate-700">{c.account_manager_name || 'Unassigned'}</span>
                      </div>
                    </td>

                    {/* Lifecycle Stage */}
                    <td className="py-3.5 px-4">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getStageBadgeColor(c.lifecycle_stage)}`}>
                        {c.lifecycle_stage}
                      </span>
                    </td>

                    {/* Onboarding Progress */}
                    <td className="py-3.5 px-4 text-xs">
                      <div className="flex items-center gap-2 w-28">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${c.onboarding_progress || 0}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">{c.onboarding_progress || 0}%</span>
                      </div>
                    </td>

                    {/* Bundled Services */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-bold text-slate-700 font-mono bg-slate-100 px-2 py-0.5 rounded">
                        {c.bundled_services_count || 0} active
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        c.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        c.status === 'paused' ? 'bg-rose-50 text-rose-700' :
                        c.status === 'onboarding' ? 'bg-blue-50 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : c.status === 'paused' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                        {c.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {canBundle && (
                        <button
                          onClick={() => handleOpenBundleModal(c)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium inline-flex items-center gap-1 transition"
                          title="Bundle Catalog Services"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" /> Bundle
                        </button>
                      )}
                      <Link
                        to={`/clients/${c.id}`}
                        className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold inline-flex items-center gap-1 transition"
                      >
                        Workspace <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>Showing {clients.length} of {totalCount} total clients</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 border rounded hover:bg-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-800">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 border rounded hover:bg-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ===================== MODALS ===================== */}

      {/* New Client Creation Modal */}
      {newClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Register New Client
              </h3>
              <button onClick={() => setNewClientModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              {/* Business Information Section */}
              <div className="space-y-2">
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Business Information</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Client Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Health Systems"
                      value={newClientForm.name}
                      onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Company / Legal Name</label>
                    <input
                      type="text"
                      placeholder="Apex Health Systems Pvt Ltd"
                      value={newClientForm.companyName}
                      onChange={(e) => setNewClientForm({ ...newClientForm, companyName: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Client Code</label>
                    <input
                      type="text"
                      placeholder="Auto if blank (e.g. CLT-001)"
                      value={newClientForm.clientCode}
                      onChange={(e) => setNewClientForm({ ...newClientForm, clientCode: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Industry</label>
                    <input
                      type="text"
                      placeholder="Healthcare, Retail..."
                      value={newClientForm.industry}
                      onChange={(e) => setNewClientForm({ ...newClientForm, industry: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Website URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newClientForm.website}
                      onChange={(e) => setNewClientForm({ ...newClientForm, website: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Entity Pipeline</label>
                    <select
                      value={newClientForm.entity}
                      onChange={(e) => setNewClientForm({
                        ...newClientForm,
                        entity: e.target.value,
                        vertical: e.target.value === 'MedGrowDigi' ? 'Healthcare' : 'General'
                      })}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="D-Grow">D-Grow (General)</option>
                      <option value="MedGrowDigi">MedGrowDigi (Healthcare)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Account Manager</label>
                    <select
                      value={newClientForm.accountManagerId}
                      onChange={(e) => setNewClientForm({ ...newClientForm, accountManagerId: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="">-- Assign Later --</option>
                      {accountManagers.map((am) => (
                        <option key={am.id} value={am.id}>{am.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Primary Contact Section */}
              <div className="space-y-2 border-t pt-3">
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Primary Contact Details</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      placeholder="Dr. Ramesh Sharma"
                      value={newClientForm.primaryContact.name}
                      onChange={(e) => setNewClientForm({
                        ...newClientForm,
                        primaryContact: { ...newClientForm.primaryContact, name: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Designation</label>
                    <input
                      type="text"
                      placeholder="Managing Director"
                      value={newClientForm.primaryContact.designation}
                      onChange={(e) => setNewClientForm({
                        ...newClientForm,
                        primaryContact: { ...newClientForm.primaryContact, designation: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Business Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="contact@company.com"
                      value={newClientForm.email}
                      onChange={(e) => {
                        const em = e.target.value;
                        setNewClientForm({
                          ...newClientForm,
                          email: em,
                          primaryContact: { ...newClientForm.primaryContact, email: em }
                        });
                      }}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+91 9876543210"
                      value={newClientForm.phone}
                      onChange={(e) => {
                        const ph = e.target.value;
                        setNewClientForm({
                          ...newClientForm,
                          phone: ph,
                          primaryContact: { ...newClientForm.primaryContact, phone: ph }
                        });
                      }}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Operational Requirements Section */}
              <div className="space-y-2 border-t pt-3">
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Operational Requirements</span>
                <div>
                  <textarea
                    rows="2"
                    placeholder="Brief client objectives, requested deliverables, communication preferences..."
                    value={newClientForm.requirementsNotes}
                    onChange={(e) => setNewClientForm({ ...newClientForm, requirementsNotes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setNewClientModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingClient}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {isCreatingClient ? 'Creating...' : 'Register Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bundling Catalog Modal (Phase 1 Preservation) */}
      {bundleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Bundle Services Catalog
                </h3>
                <p className="text-xs text-slate-500">
                  Select services to bundle onto <strong className="text-slate-800">{bundlingClient?.name}</strong>.
                </p>
              </div>
              <button onClick={() => setBundleModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSubmitBundle} className="space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {catalog.map((service) => {
                  const isChecked = selectedServices.includes(service.code || service.key);
                  return (
                    <label
                      key={service.code || service.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        isChecked ? 'bg-blue-50/70 border-blue-300' : 'hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleServiceSelection(service.code || service.key)}
                        className="mt-1 rounded text-blue-600"
                      />
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{service.label || service.title}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-bold">
                            {service.code || service.key}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          {(service.stagesCount ?? service.stages?.length ?? 0)} sequential stages • Cycle: {service.cycle || 'Monthly'}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-3 border-t text-xs">
                <span className="text-slate-600 font-medium">Selected: {selectedServices.length} service(s)</span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setBundleModalOpen(false)}
                    className="px-3.5 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBundling || selectedServices.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {isBundling ? 'Bundling...' : 'Confirm Bundling'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientsPage;
