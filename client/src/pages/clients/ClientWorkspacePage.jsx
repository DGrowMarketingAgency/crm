import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { clientsService, departmentsService, workflowPresetsService, deliverablesService, billingService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { WorkflowPreviewModal } from '../../components/automation/WorkflowPreviewModal';
import {
  Building2,
  ArrowLeft,
  User,
  Users,
  CheckCircle2,
  Clock,
  Briefcase,
  Layers,
  FileText,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Plus,
  ExternalLink,
  Mail,
  Phone,
  Globe,
  MapPin,
  Calendar,
  Sparkles,
  Edit3,
  Trash2,
  Star,
  CheckSquare,
  Square,
  AlertCircle,
  FolderKanban,
  Send,
  Loader2,
  X,
  ChevronRight,
  RefreshCw,
  Info,
  Download,
  ThumbsUp,
  RotateCcw,
  Check,
  LifeBuoy,
  CreditCard,
  Printer
} from 'lucide-react';
import { ClientCalendarTab } from '../../components/calendar/ClientCalendarTab';

export function ClientWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner, user } = usePermission();

  const [activeTab, setActiveTab] = useState('overview');
  const [workspace, setWorkspace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals state
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);
  const [isAssignAmModalOpen, setIsAssignAmModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isServicePreviewOpen, setIsServicePreviewOpen] = useState(false);
  const [selectedPreviewService, setSelectedPreviewService] = useState(null);

  // Form states
  const [editClientForm, setEditClientForm] = useState({});
  const [lifecycleForm, setLifecycleForm] = useState({ stage: '', reason: '', notes: '' });
  const [assignAmForm, setAssignAmForm] = useState({ accountManagerId: '', reason: '' });
  const [contactForm, setContactForm] = useState({
    name: '', designation: '', email: '', phone: '', isPrimary: false, status: 'active', portalAccessEnabled: false
  });
  const [editingContactId, setEditingContactId] = useState(null);
  const [onboardingForm, setOnboardingForm] = useState({
    title: '', description: '', ownerUserId: '', dueDate: '', notes: ''
  });
  const [serviceForm, setServiceForm] = useState({
    label: '', departmentId: '', workflowPresetId: '', serviceFrequency: 'Monthly',
    scopeDescription: '', expectedDeliverables: '', startDate: '', endDate: '', status: 'active', operationalNotes: ''
  });

  // Meta data
  const [eligibleAms, setEligibleAms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [workflowPresets, setWorkflowPresets] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEditClient = isOwner || hasPermission('clients.update');
  const canAssignAm = isOwner || hasPermission('clients.assign_am');
  const canManageContacts = isOwner || hasPermission('clients.manage_contacts');
  const canManageOnboarding = isOwner || hasPermission('clients.manage_onboarding');
  const canManageServices = isOwner || hasPermission('clients.manage_services');
  const canUpdateLifecycle = isOwner || hasPermission('lifecycle.update');
  const canClientApprove = isOwner || hasPermission('deliverables.review_client');
  const canClientRequestRevision = isOwner || hasPermission('deliverables.request_revision');

  const [clientApprovalModal, setClientApprovalModal] = useState({ open: false, submissionId: null, action: 'approve', reason: '' });

  const handleClientPortalDecision = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      if (clientApprovalModal.action === 'approve') {
        await deliverablesService.clientApprove(clientApprovalModal.submissionId, {
          feedback: clientApprovalModal.reason?.trim() || null
        });
        setNotice('Deliverable approved! Task completed.');
      } else {
        if (!clientApprovalModal.reason || clientApprovalModal.reason.trim().length < 5) {
          setError('A clear revision explanation of at least 5 characters is required');
          setIsSubmitting(false);
          return;
        }
        await deliverablesService.clientRequestRevision(clientApprovalModal.submissionId, {
          revisionReason: clientApprovalModal.reason.trim()
        });
        setNotice('Revision requested. Assigned agency team notified for rework.');
      }
      setClientApprovalModal({ open: false, submissionId: null, action: 'approve', reason: '' });
      await fetchWorkspace();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Client decision error:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to record approval decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
    fetchMetadata();
  }, [id]);

  const fetchWorkspace = async () => {
    setIsLoading(true);
    try {
      const res = await clientsService.getWorkspace(id);
      setWorkspace(res.data.workspace);
      setEditClientForm(res.data.workspace.overview);
      setLifecycleForm({
        stage: res.data.workspace.overview.lifecycle_stage,
        reason: res.data.workspace.overview.offboarding_reason || '',
        notes: ''
      });
    } catch (err) {
      console.error('Failed to load client workspace:', err);
      setError(err.response?.data?.message || 'Unable to fetch client workspace.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [amsRes, deptRes, presetsRes] = await Promise.all([
        clientsService.getEligibleAccountManagers().catch(() => ({ data: { managers: [] } })),
        departmentsService.getDepartments({ limit: 100 }).catch(() => ({ data: { departments: [] } })),
        workflowPresetsService.getPresets({ limit: 100, status: 'published' }).catch(() => ({ data: { presets: [] } }))
      ]);
      setEligibleAms(amsRes.data.managers || []);
      setDepartments(deptRes.data.departments || []);
      setWorkflowPresets(presetsRes.data.presets || []);
    } catch (err) {
      console.warn('Metadata fetch warning:', err);
    }
  };

  const showNotification = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  // Lifecycle transition
  const handleLifecycleTransition = async (e) => {
    e.preventDefault();
    if (!lifecycleForm.stage) return;
    setIsSubmitting(true);
    try {
      await clientsService.updateLifecycle(id, {
        stage: lifecycleForm.stage,
        reason: lifecycleForm.reason,
        notes: lifecycleForm.notes
      });
      showNotification(`Lifecycle stage successfully updated to "${lifecycleForm.stage}"`);
      setIsLifecycleModalOpen(false);
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update lifecycle stage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassign AM
  const handleAssignAm = async (e) => {
    e.preventDefault();
    if (!assignAmForm.accountManagerId) return;
    setIsSubmitting(true);
    try {
      await clientsService.assignAccountManager(id, {
        accountManagerId: Number(assignAmForm.accountManagerId),
        reason: assignAmForm.reason
      });
      showNotification('Account Manager reassigned successfully.');
      setIsAssignAmModalOpen(false);
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reassign Account Manager.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Client Details
  const handleUpdateClient = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await clientsService.updateClient(id, editClientForm);
      showNotification('Client details updated successfully.');
      setIsEditClientOpen(false);
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add / Edit Contact
  const handleSaveContact = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingContactId) {
        await clientsService.updateContact(id, editingContactId, contactForm);
        showNotification('Contact updated successfully.');
      } else {
        await clientsService.addContact(id, contactForm);
        showNotification('New contact added successfully.');
      }
      setIsContactModalOpen(false);
      setEditingContactId(null);
      setContactForm({
        name: '', designation: '', email: '', phone: '', isPrimary: false, status: 'active', portalAccessEnabled: false
      });
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save contact.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPrimaryContact = async (contactId) => {
    try {
      await clientsService.setPrimaryContact(id, contactId);
      showNotification('Primary contact designated.');
      fetchWorkspace();
    } catch (err) {
      setError('Failed to update primary contact.');
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
    try {
      await clientsService.deleteContact(id, contactId);
      showNotification('Contact deleted.');
      fetchWorkspace();
    } catch (err) {
      setError('Failed to delete contact.');
    }
  };

  // Onboarding Toggle & Add
  const handleToggleOnboardingItem = async (itemId, currentStatus) => {
    try {
      await clientsService.updateOnboardingItem(id, itemId, { isCompleted: !currentStatus });
      fetchWorkspace();
    } catch (err) {
      setError('Failed to update checklist item status.');
    }
  };

  const handleAddOnboardingItem = async (e) => {
    e.preventDefault();
    if (!onboardingForm.title) return;
    setIsSubmitting(true);
    try {
      await clientsService.addOnboardingItem(id, {
        ...onboardingForm,
        ownerUserId: onboardingForm.ownerUserId ? Number(onboardingForm.ownerUserId) : null
      });
      showNotification('Checklist item added.');
      setIsOnboardingModalOpen(false);
      setOnboardingForm({ title: '', description: '', ownerUserId: '', dueDate: '', notes: '' });
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add checklist item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Configure Client Service
  const handleSaveService = async (e) => {
    e.preventDefault();
    if (!serviceForm.label) return;
    setIsSubmitting(true);
    try {
      await clientsService.createService(id, {
        ...serviceForm,
        departmentId: serviceForm.departmentId ? Number(serviceForm.departmentId) : null,
        workflowPresetId: serviceForm.workflowPresetId ? Number(serviceForm.workflowPresetId) : null
      });
      showNotification('Service configuration added successfully.');
      setIsServiceModalOpen(false);
      setServiceForm({
        label: '', departmentId: '', workflowPresetId: '', serviceFrequency: 'Monthly',
        scopeDescription: '', expectedDeliverables: '', startDate: '', endDate: '', status: 'active', operationalNotes: ''
      });
      fetchWorkspace();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to configure service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-3" />
        <p className="text-slate-500 font-medium text-sm">Loading Client Workspace...</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Client Not Found</h2>
        <p className="text-slate-500 mb-4">{error || 'Unable to locate client record.'}</p>
        <Link to="/clients" className="px-4 py-2 bg-blue-600 text-white rounded-lg inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Clients Directory
        </Link>
      </div>
    );
  }

  const client = workspace.overview;
  const onboarding = workspace.onboarding || { progressPercent: 0, items: [] };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'contacts', label: `Contacts (${workspace.contacts?.length || 0})`, icon: Users },
    { key: 'onboarding', label: `Onboarding (${onboarding.progressPercent || 0}%)`, icon: CheckCircle2 },
    { key: 'services', label: `Services (${workspace.services?.length || 0})`, icon: Layers },
    { key: 'projects', label: `Projects (${workspace.projects?.length || 0})`, icon: FolderKanban },
    { key: 'tasks', label: `Tasks (${workspace.tasks?.length || 0})`, icon: CheckSquare },
    { key: 'calendar', label: 'Work & Content Calendar', icon: Calendar },
    { key: 'deliverables', label: 'Deliverables', icon: Sparkles },
    { key: 'approvals', label: `Approvals (${workspace.approvals?.length || 0})`, icon: ShieldCheck },
    { key: 'tickets', label: `Support Tickets (${workspace.tickets?.length || 0})`, icon: LifeBuoy },
    { key: 'billing', label: `Invoices & Billing (${workspace.invoices?.length || 0})`, icon: CreditCard },
    { key: 'reports', label: 'Reports', icon: Activity },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'activity', label: 'Activity Timeline', icon: Clock }
  ];

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/clients')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Back to Clients"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-semibold">
                {client.client_code || 'CLT-UNASSIGNED'}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getStageBadgeColor(client.lifecycle_stage)}`}>
                {client.lifecycle_stage?.toUpperCase()}
              </span>
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium">
                {client.entity}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              {client.name}
              {client.company_name && (
                <span className="text-sm font-normal text-slate-500">({client.company_name})</span>
              )}
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canUpdateLifecycle && (
            <button
              onClick={() => setIsLifecycleModalOpen(true)}
              className="px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm flex items-center gap-2 transition"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
              Transition Stage
            </button>
          )}

          {canAssignAm && (
            <button
              onClick={() => setIsAssignAmModalOpen(true)}
              className="px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm flex items-center gap-2 transition"
            >
              <User className="w-4 h-4 text-slate-500" />
              Reassign AM
            </button>
          )}

          {canEditClient && (
            <button
              onClick={() => setIsEditClientOpen(true)}
              className="px-3.5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-2 transition"
            >
              <Edit3 className="w-4 h-4" />
              Edit Client
            </button>
          )}
        </div>
      </div>

      {/* Notifications banner */}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPI Header Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Account Manager</span>
          <div className="mt-1 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              {(client.account_manager_name || 'U')[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">
                {client.account_manager_name || 'Unassigned'}
              </p>
              <p className="text-xs text-slate-500">{client.account_manager_email || 'No email'}</p>
            </div>
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Primary Contact</span>
          <div className="mt-1">
            <p className="text-sm font-semibold text-slate-900 leading-tight">
              {client.primaryContact?.name || client.name}
            </p>
            <p className="text-xs text-slate-500">
              {client.primaryContact?.phone || client.phone || client.email}
            </p>
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Onboarding Progress</span>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${onboarding.progressPercent || 0}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700">{onboarding.progressPercent || 0}%</span>
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status & Contract</span>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${client.status === 'active' ? 'bg-emerald-500' : client.status === 'paused' ? 'bg-rose-500' : 'bg-blue-500'}`} />
            <span className="text-sm font-semibold text-slate-900 capitalize">{client.status}</span>
            {client.contract_end_date && (
              <span className="text-xs text-slate-500 font-mono">
                until {new Date(client.contract_end_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-1 overflow-x-auto py-1" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Business Information Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-4 h-4 text-blue-600" /> Business Information
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-400 font-medium">Company Name</span>
                <p className="font-semibold text-slate-800">{client.company_name || client.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-slate-400 font-medium">Industry / Sector</span>
                  <p className="font-medium text-slate-800">{client.industry || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium">Vertical</span>
                  <p className="font-medium text-slate-800">{client.vertical}</p>
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">Website</span>
                {client.website ? (
                  <p>
                    <a
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {client.website} <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                ) : (
                  <p className="text-slate-400 italic">None provided</p>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">Business Address</span>
                <p className="text-slate-700">
                  {client.address ? `${client.address}, ` : ''}
                  {client.city ? `${client.city}, ` : ''}
                  {client.country || 'India'}
                </p>
              </div>
              {client.gstin && (
                <div>
                  <span className="text-xs text-slate-400 font-medium">GSTIN</span>
                  <p className="font-mono text-slate-800">{client.gstin}</p>
                </div>
              )}
            </div>
          </div>

          {/* Primary Contact & Account Ownership */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="w-4 h-4 text-emerald-600" /> Key Stakeholders
            </h3>
            <div className="space-y-4 text-sm">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase">Primary Contact</span>
                <p className="font-semibold text-slate-900">{client.primaryContact?.name || client.name}</p>
                <p className="text-xs text-slate-500">{client.primaryContact?.designation || 'Primary Stakeholder'}</p>
                <div className="flex flex-col gap-1 pt-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /> {client.primaryContact?.email || client.email}</span>
                  {(client.primaryContact?.phone || client.phone) && (
                    <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {client.primaryContact?.phone || client.phone}</span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                <span className="text-xs font-bold text-blue-700 uppercase">Assigned Account Manager</span>
                <p className="font-semibold text-slate-900">{client.account_manager_name || 'Unassigned'}</p>
                <p className="text-xs text-blue-600">{client.account_manager_email || 'No email'}</p>
              </div>

              {client.onboarding_owner_name && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1">
                  <span className="text-xs font-bold text-purple-700 uppercase">Onboarding Owner</span>
                  <p className="font-semibold text-slate-900">{client.onboarding_owner_name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Operational Information & Notes */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Briefcase className="w-4 h-4 text-indigo-600" /> Operational Scoping
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-400 font-medium">Requirements & Notes</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                  {client.requirements_notes || 'No operational requirements noted yet.'}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-400 font-medium">Communication Preferences</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {client.communication_preferences ? (
                    typeof client.communication_preferences === 'object' ? (
                      Object.entries(client.communication_preferences).map(([k, v]) => (
                        <span key={k} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-medium">
                          {k}: {String(v)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        {String(client.communication_preferences)}
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-slate-400 italic">Default Email / Phone loop</span>
                  )}
                </div>
              </div>

              {client.offboarding_reason && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <span className="text-xs font-bold text-rose-700 uppercase">Offboarding Record</span>
                  <p className="text-xs text-rose-800 mt-1">{client.offboarding_reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTACTS */}
      {activeTab === 'contacts' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Client Contacts Directory</h3>
              <p className="text-xs text-slate-500">Maintain multiple internal and external client representatives.</p>
            </div>
            {canManageContacts && (
              <button
                onClick={() => {
                  setEditingContactId(null);
                  setContactForm({
                    name: '', designation: '', email: '', phone: '', isPrimary: false, status: 'active', portalAccessEnabled: false
                  });
                  setIsContactModalOpen(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" /> Add Contact
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Business Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role / Primary</th>
                  <th className="py-3 px-4">Portal Access</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspace.contacts?.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {c.name[0]}
                      </div>
                      <div>
                        {c.name}
                        {c.is_primary ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Primary
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{c.designation || '—'}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{c.phone || '—'}</td>
                    <td className="py-3 px-4">
                      {c.is_primary ? (
                        <span className="text-xs text-emerald-700 font-medium">Primary Contact</span>
                      ) : canManageContacts ? (
                        <button
                          onClick={() => handleSetPrimaryContact(c.id)}
                          className="text-xs text-slate-500 hover:text-blue-600 underline font-medium"
                        >
                          Make Primary
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Secondary</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {c.portal_access_enabled ? (
                        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">Enabled</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">Not Granted</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {canManageContacts && (
                        <>
                          <button
                            onClick={() => {
                              setEditingContactId(c.id);
                              setContactForm({
                                name: c.name,
                                designation: c.designation || '',
                                email: c.email,
                                phone: c.phone || '',
                                isPrimary: Boolean(c.is_primary),
                                status: c.status,
                                portalAccessEnabled: Boolean(c.portal_access_enabled)
                              });
                              setIsContactModalOpen(true);
                            }}
                            className="p-1 hover:text-blue-600 text-slate-400"
                            title="Edit Contact"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(c.id)}
                            className="p-1 hover:text-rose-600 text-slate-400"
                            title="Delete Contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {(!workspace.contacts || workspace.contacts.length === 0) && (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      No contacts recorded yet. Add primary and billing contacts above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ONBOARDING CHECKLIST */}
      {activeTab === 'onboarding' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-lg">Client Onboarding Checklist</h3>
                <span className="text-xs px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold">
                  {onboarding.completedItems} / {onboarding.totalItems} Completed
                </span>
                {onboarding.overdueItems > 0 && (
                  <span className="text-xs px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {onboarding.overdueItems} Overdue
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Standard 8-step agency onboarding sequence with configurable owners, due dates, and progress.
              </p>
            </div>
            {canManageOnboarding && (
              <button
                onClick={() => setIsOnboardingModalOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
          </div>

          <div className="space-y-3">
            {onboarding.items?.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.is_completed
                    ? 'bg-slate-50/70 border-slate-200 opacity-90'
                    : item.is_overdue
                    ? 'bg-rose-50/40 border-rose-200'
                    : 'bg-white border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    disabled={!canManageOnboarding}
                    onClick={() => handleToggleOnboardingItem(item.id, item.is_completed)}
                    className="mt-0.5 text-blue-600 focus:outline-none"
                    title={item.is_completed ? 'Mark incomplete' : 'Mark completed'}
                  >
                    {item.is_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                  <div>
                    <h4 className={`text-sm font-semibold ${item.is_completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                      {item.title}
                    </h4>
                    {item.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-1.5 inline-block">
                        Notes: {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs self-end sm:self-auto">
                  {item.owner_name && (
                    <span className="text-slate-600 flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <User className="w-3.5 h-3.5 text-slate-400" /> {item.owner_name}
                    </span>
                  )}
                  {item.due_date && (
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                      item.is_overdue && !item.is_completed ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Calendar className="w-3.5 h-3.5" /> {new Date(item.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {item.is_completed && item.completed_at && (
                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md font-medium">
                      Done {new Date(item.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SERVICES */}
      {activeTab === 'services' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Configured Client Services</h3>
              <p className="text-xs text-slate-500">
                Active service commitments linked to departments and published workflow presets.
              </p>
            </div>
            {canManageServices && (
              <button
                onClick={() => setIsServiceModalOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" /> Configure Service
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workspace.services?.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {s.service_frequency || 'Monthly'}
                    </span>
                    <h4 className="font-bold text-slate-900 text-base mt-1">{s.label}</h4>
                  </div>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                    s.status === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    s.status === 'paused' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    'bg-slate-100 text-slate-800 border-slate-300'
                  }`}>
                    {s.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">Department</span>
                    <p className="font-semibold text-slate-800">{s.department_name || 'General'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Workflow Preset</span>
                    <p className="font-semibold text-slate-800">{s.workflow_preset_name || 'Custom Workflow'}</p>
                  </div>
                </div>

                {s.scope_description && (
                  <div className="text-xs">
                    <span className="text-slate-400 font-medium">Scope Description</span>
                    <p className="text-slate-700 mt-0.5 bg-white p-2 rounded border border-slate-200">{s.scope_description}</p>
                  </div>
                )}

                {s.expected_deliverables && (
                  <div className="text-xs">
                    <span className="text-slate-400 font-medium">Expected Deliverables</span>
                    <p className="text-indigo-900 bg-indigo-50/80 p-2 rounded border border-indigo-100 mt-0.5 font-medium">
                      {s.expected_deliverables}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                  <span>Cycle: #{s.cycle || 1}</span>
                  {s.start_date && (
                    <span>Period: {new Date(s.start_date).toLocaleDateString()} {s.end_date ? `to ${new Date(s.end_date).toLocaleDateString()}` : ''}</span>
                  )}
                </div>

                {s.workflow_preset_id && (
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setSelectedPreviewService(s);
                        setIsServicePreviewOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#047857] hover:underline"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#047857]" /> Preview Workflow Tasks
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {s.status === 'active' ? 'Automated Tasks Active' : 'Activates on Start'}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {(!workspace.services || workspace.services.length === 0) && (
              <div className="col-span-2 py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                No active services configured yet. Use "+ Configure Service" to link published workflow presets.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: PROJECTS */}
      {activeTab === 'projects' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-lg">Associated Projects</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Manager</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspace.projects?.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{p.name}</div>
                      <span className="font-mono text-xs text-slate-400">{p.project_code}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{p.manager_name || 'Unassigned'}</td>
                    <td className="py-3 px-4 capitalize text-slate-600">{p.priority || 'Medium'}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-semibold text-slate-700">{p.completed_tasks} / {p.total_tasks} tasks</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium capitalize">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link to={`/projects/${p.id}`} className="text-blue-600 hover:underline text-xs font-medium inline-flex items-center gap-1">
                        View Project <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {(!workspace.projects || workspace.projects.length === 0) && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      No projects currently associated with this client.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: TASKS */}
      {activeTab === 'tasks' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-lg">Active Client Tasks</h3>
          <div className="space-y-2">
            {workspace.tasks?.map((t) => (
              <div key={t.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-sm">
                <div>
                  <h4 className="font-semibold text-slate-900">{t.title}</h4>
                  <p className="text-xs text-slate-500">Project: {t.project_name || 'General'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded capitalize">{t.column_status || t.status}</span>
                  {t.assignee_name && (
                    <span className="text-xs text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                      {t.assignee_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(!workspace.tasks || workspace.tasks.length === 0) && (
              <p className="text-slate-400 text-center py-6 text-sm">No live tasks found for this client.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: DELIVERABLES */}
      {activeTab === 'deliverables' && (
        <div className="space-y-6">
          {/* Live Deliverables Submissions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Client Deliverable Submissions
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Client-facing files, documents, and reports submitted for your engagement
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                {workspace.deliverableSubmissions?.length || 0} Submissions
              </span>
            </div>

            {(!workspace.deliverableSubmissions || workspace.deliverableSubmissions.length === 0) ? (
              <div className="py-12 text-center text-slate-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs">No client-facing deliverables submitted yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {workspace.deliverableSubmissions.map((sub) => {
                  const isApproved = sub.client_approval_status === 'approved';
                  const isPending = sub.client_approval_status === 'pending';
                  const isRevision = sub.client_approval_status === 'revision_requested';

                  return (
                    <div
                      key={sub.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">
                              v{sub.version_number}
                            </span>
                            <span className="text-[11px] capitalize px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">
                              {sub.deliverable_type}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mt-1">{sub.title}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Task: #{sub.task_code} • {sub.task_title}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize border ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isRevision
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isPending
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {sub.client_approval_status === 'pending'
                            ? 'Awaiting Signoff'
                            : sub.client_approval_status || 'Draft'}
                        </span>
                      </div>

                      {/* Assets / File buttons */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
                        {sub.deliverable_url && (
                          <a
                            href={sub.deliverable_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Asset</span>
                          </a>
                        )}

                        {sub.file_name && (
                          <a
                            href={`/api/deliverables/${sub.id}/download`}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold transition"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Download ({sub.file_size ? `${(sub.file_size / 1024).toFixed(0)} KB` : 'File'})</span>
                          </a>
                        )}

                        {isPending && (canClientApprove || isOwner) && (
                          <button
                            onClick={() => {
                              setActiveTab('approvals');
                            }}
                            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Review & Signoff</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expected Service Deliverables */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              Contracted Service Deliverable Catalog
            </h3>
            <div className="space-y-3">
              {workspace.deliverables?.map((d, i) => (
                <div key={i} className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{d.serviceLabel}</h4>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-bold uppercase">
                        {d.frequency}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{d.expectedDeliverables}</p>
                  </div>
                </div>
              ))}
              {(!workspace.deliverables || workspace.deliverables.length === 0) && (
                <p className="text-slate-400 text-center py-4 text-xs">No service deliverable rules configured.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: APPROVALS */}
      {activeTab === 'approvals' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                Client Approvals & Signoffs
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review submitted deliverables, approve signoffs, or request adjustments with feedback
              </p>
            </div>
          </div>

          {/* 1. Pending Approvals Queue */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Awaiting Client Approval ({workspace.deliverableSubmissions?.filter(s => s.client_approval_status === 'pending').length || 0})
              </h4>
            </div>

            {(!workspace.deliverableSubmissions || workspace.deliverableSubmissions.filter(s => s.client_approval_status === 'pending').length === 0) ? (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
                All client deliverables are up to date. No pending approvals awaiting signoff.
              </div>
            ) : (
              <div className="space-y-3">
                {workspace.deliverableSubmissions
                  .filter((s) => s.client_approval_status === 'pending')
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="p-5 rounded-xl border border-blue-200 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-blue-300"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">
                            v{sub.version_number}
                          </span>
                          <span className="text-xs font-bold text-slate-900">{sub.title}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                            {sub.deliverable_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Task: <span className="font-semibold text-slate-800">#{sub.task_code}</span> ({sub.task_title}) • Submitted by {sub.submitter_name}
                        </p>

                        <div className="flex items-center gap-3 pt-1">
                          {sub.deliverable_url && (
                            <a
                              href={sub.deliverable_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Open Deliverable
                            </a>
                          )}
                          {sub.file_name && (
                            <a
                              href={`/api/deliverables/${sub.id}/download`}
                              download
                              className="text-xs font-semibold text-slate-700 hover:underline inline-flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-600" /> Download File
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Client Decision Action Buttons */}
                      {(canClientApprove || isOwner) && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() =>
                              setClientApprovalModal({
                                open: true,
                                submissionId: sub.id,
                                action: 'approve',
                                reason: ''
                              })
                            }
                            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve Deliverable</span>
                          </button>
                          <button
                            onClick={() =>
                              setClientApprovalModal({
                                open: true,
                                submissionId: sub.id,
                                action: 'revision',
                                reason: ''
                              })
                            }
                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Request Revision</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* 2. Historical Client Approval Decisions */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Historical Decisions & Review Archive
            </h4>
            <div className="space-y-2">
              {workspace.deliverableSubmissions
                ?.filter((s) => s.client_approval_status !== 'pending')
                .map((a) => (
                  <div
                    key={a.id}
                    className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-slate-200 rounded">
                          v{a.version_number}
                        </span>
                        <h5 className="font-semibold text-slate-900">{a.title}</h5>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {a.client_reviewer_name ? `Decided by ${a.client_reviewer_name}` : `Submitted on ${new Date(a.submitted_at || a.created_at).toLocaleDateString()}`}
                        {a.client_feedback && ` • "${a.client_feedback}"`}
                      </p>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                        a.client_approval_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : a.client_approval_status === 'revision_requested'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {a.client_approval_status || 'Draft'}
                    </span>
                  </div>
                ))}
              {(!workspace.deliverableSubmissions || workspace.deliverableSubmissions.filter(s => s.client_approval_status !== 'pending').length === 0) && (
                <p className="text-slate-400 text-xs text-center py-4">No historical approval decisions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: SUPPORT TICKETS */}
      {activeTab === 'tickets' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-[#047857]" />
                Client Support Tickets & Requests
              </h3>
              <p className="text-xs text-slate-500">Track and manage queries raised for this client organization</p>
            </div>
            <Link
              to="/tickets"
              className="px-3.5 py-2 bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Raise New Ticket
            </Link>
          </div>

          <div className="space-y-2.5">
            {workspace.tickets?.map((t) => (
              <div
                key={t.id}
                className="p-3.5 bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-white border rounded text-slate-800">
                      {t.ticket_number}
                    </span>
                    <span className="font-bold text-slate-900">{t.subject}</span>
                    <span className="text-[10px] text-slate-500 font-medium bg-slate-200/60 px-2 py-0.2 rounded-full">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Created on {new Date(t.created_at).toLocaleDateString()}
                    {t.assignee_name && ` • Assigned to ${t.assignee_name}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                      t.status === 'resolved'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : t.status === 'in_progress'
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                  <Link
                    to="/tickets"
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                    title="Open in Support Desk"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}

            {(!workspace.tickets || workspace.tickets.length === 0) && (
              <div className="text-center py-8 space-y-2">
                <LifeBuoy className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-400">No support tickets currently raised for this client.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: INVOICES & BILLING */}
      {activeTab === 'billing' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#047857]" />
                Client Invoices & Quotations
              </h3>
              <p className="text-xs text-slate-500">Financial records, approved estimates, and payment history</p>
            </div>
            <Link
              to="/billing"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#047857]" /> Go to Billing Desk
            </Link>
          </div>

          {/* Quotations Subsection */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quotations & Proposals</h4>
            <div className="space-y-2">
              {workspace.quotations?.map((q) => (
                <div
                  key={q.id}
                  className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-white border rounded text-slate-800">
                        {q.quotation_number}
                      </span>
                      <span className="font-bold text-slate-900">{q.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Issued on {new Date(q.quotation_date).toLocaleDateString()} • Expiry: {new Date(q.expiry_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹ {Number(q.total_amount).toLocaleString()}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                        q.status === 'accepted' || q.status === 'converted'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : q.status === 'sent'
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {q.status}
                    </span>
                    <a
                      href={`/api/billing/documents/quotation/${q.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-slate-400 hover:text-[#047857] rounded-lg"
                      title="Print / View Quotation"
                    >
                      <Printer className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}

              {(!workspace.quotations || workspace.quotations.length === 0) && (
                <p className="text-xs text-slate-400 py-2">No quotations prepared for this client.</p>
              )}
            </div>
          </div>

          {/* Invoices Subsection */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tax Invoices & Balances</h4>
            <div className="space-y-2">
              {workspace.invoices?.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-white border rounded text-slate-800">
                        {inv.invoice_number}
                      </span>
                      <span className="font-bold text-slate-900">
                        Total: ₹ {Number(inv.total_amount).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Paid: <strong className="text-emerald-700">₹ {Number(inv.amount_paid).toLocaleString()}</strong>
                      {Number(inv.outstanding_balance) > 0 && (
                        <span> • Balance Due: <strong className="text-rose-700">₹ {Number(inv.outstanding_balance).toLocaleString()}</strong></span>
                      )}
                      {' • '}Due Date: {new Date(inv.due_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : inv.status === 'partially_paid'
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : inv.status === 'overdue'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-purple-100 text-purple-800 border-purple-200'
                      }`}
                    >
                      {inv.status.replace('_', ' ')}
                    </span>
                    <a
                      href={`/api/billing/documents/invoice/${inv.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-slate-400 hover:text-[#047857] rounded-lg"
                      title="Print / View Invoice"
                    >
                      <Printer className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}

              {(!workspace.invoices || workspace.invoices.length === 0) && (
                <p className="text-xs text-slate-400 py-2">No invoices issued for this client yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: REPORTS */}
      {activeTab === 'reports' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center space-y-3">
          <Activity className="w-12 h-12 text-blue-500 mx-auto" />
          <h3 className="font-bold text-slate-900 text-lg">Executive Performance Reporting</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {workspace.reports?.message || 'Automated client cycle reporting compiles at the end of active service intervals.'}
          </p>
          <div className="pt-2 flex justify-center gap-4 text-xs font-semibold text-slate-700">
            <span className="p-2 bg-slate-50 rounded border">Total Services: {workspace.reports?.totalServices || 0}</span>
            <span className="p-2 bg-slate-50 rounded border">Active: {workspace.reports?.activeServices || 0}</span>
            <span className="p-2 bg-slate-50 rounded border">Completed Deliverables: {workspace.reports?.completedTasks || 0}</span>
          </div>
        </div>
      )}

      {/* TAB 10: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-lg">Client Documents & Assets Vault</h3>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Info className="w-4 h-4 text-blue-500" />
              Requirements Brief
            </div>
            <p className="text-xs text-slate-600 bg-white p-3 rounded border border-slate-200 whitespace-pre-wrap">
              {workspace.documents?.requirementsNotes || 'No document briefs uploaded yet.'}
            </p>
          </div>
          <p className="text-xs text-slate-400 italic text-center">
            {workspace.documents?.message || 'Dedicated cloud document vault integration activates in Phase 4.'}
          </p>
        </div>
      )}

      {/* TAB 11: ACTIVITY TIMELINE */}
      {activeTab === 'activity' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-lg">Client Activity History</h3>
          <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 py-2">
            {workspace.activity?.map((log) => (
              <div key={log.id} className="relative pl-6">
                <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900 text-sm">{log.title}</h4>
                    <span className="text-[11px] text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.description && <p className="text-xs text-slate-600 mt-0.5">{log.description}</p>}
                  {log.actor_name && (
                    <span className="text-[11px] text-slate-400 font-medium">Logged by {log.actor_name}</span>
                  )}
                </div>
              </div>
            ))}
            {(!workspace.activity || workspace.activity.length === 0) && (
              <p className="text-slate-400 text-sm pl-4">No logged activity recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB: WORK & CONTENT CALENDAR */}
      {activeTab === 'calendar' && (
        <ClientCalendarTab
          clientId={id}
          clientName={client.company_name || client.name}
        />
      )}

      {/* ===================== MODALS ===================== */}

      {/* 1. Transition Stage Modal */}
      {isLifecycleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">Change Lifecycle Stage</h3>
              <button onClick={() => setIsLifecycleModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleLifecycleTransition} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Target Stage</label>
                <select
                  value={lifecycleForm.stage}
                  onChange={(e) => setLifecycleForm({ ...lifecycleForm, stage: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                  required
                >
                  <option value="lead">Lead / Opportunity</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal / Discussion</option>
                  <option value="won">Won</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused (Hold)</option>
                  <option value="completed">Completed</option>
                  <option value="offboarded">Offboarded</option>
                </select>
              </div>

              {(lifecycleForm.stage === 'paused' || lifecycleForm.stage === 'offboarded' || lifecycleForm.stage === 'completed') && (
                <div>
                  <label className="block font-medium text-rose-700 mb-1">
                    Reason for {lifecycleForm.stage.toUpperCase()} (Required Confirmation)
                  </label>
                  <textarea
                    rows="3"
                    value={lifecycleForm.reason}
                    onChange={(e) => setLifecycleForm({ ...lifecycleForm, reason: e.target.value })}
                    placeholder="State reason for holding or offboarding client engagement..."
                    className="w-full px-3 py-2 border border-rose-300 rounded-lg focus:ring-rose-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Operational Notes (Optional)</label>
                <textarea
                  rows="2"
                  value={lifecycleForm.notes}
                  onChange={(e) => setLifecycleForm({ ...lifecycleForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsLifecycleModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Reassign Account Manager Modal */}
      {isAssignAmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">Reassign Account Manager</h3>
              <button onClick={() => setIsAssignAmModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAssignAm} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Account Manager</label>
                <select
                  value={assignAmForm.accountManagerId}
                  onChange={(e) => setAssignAmForm({ ...assignAmForm, accountManagerId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                  required
                >
                  <option value="">-- Choose Account Manager --</option>
                  {eligibleAms.map((am) => (
                    <option key={am.id} value={am.id}>
                      {am.name} ({am.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Reassignment Reason / Context</label>
                <textarea
                  rows="3"
                  value={assignAmForm.reason}
                  onChange={(e) => setAssignAmForm({ ...assignAmForm, reason: e.target.value })}
                  placeholder="e.g. Portfolio redistribution or leave replacement"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAssignAmModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Assigning...' : 'Assign Account Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add/Edit Contact Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingContactId ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button onClick={() => setIsContactModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveContact} className="space-y-3 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. CMO, Marketing Director"
                  value={contactForm.designation}
                  onChange={(e) => setContactForm({ ...contactForm, designation: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Business Email *</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contactForm.isPrimary}
                    onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Designate as Primary Contact</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Add Onboarding Item Modal */}
      {isOnboardingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">Add Checklist Item</h3>
              <button onClick={() => setIsOnboardingModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddOnboardingItem} className="space-y-3 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Item Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Google Analytics property transfer"
                  value={onboardingForm.title}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={onboardingForm.description}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Assigned Owner</label>
                  <select
                    value={onboardingForm.ownerUserId}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, ownerUserId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">-- Unassigned --</option>
                    {eligibleAms.map((am) => (
                      <option key={am.id} value={am.id}>{am.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={onboardingForm.dueDate}
                    onChange={(e) => setOnboardingForm({ ...onboardingForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsOnboardingModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Configure Client Service Modal */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">Configure Client Service</h3>
              <button onClick={() => setIsServiceModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveService} className="space-y-3 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Service Label *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Meta Performance Ads (Q4 Retargeting)"
                  value={serviceForm.label}
                  onChange={(e) => setServiceForm({ ...serviceForm, label: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Department</label>
                  <select
                    value={serviceForm.departmentId}
                    onChange={(e) => setServiceForm({ ...serviceForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">-- General / None --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Published Workflow Preset</label>
                  <select
                    value={serviceForm.workflowPresetId}
                    onChange={(e) => setServiceForm({ ...serviceForm, workflowPresetId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">-- Custom (No Preset) --</option>
                    {workflowPresets.map((wp) => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Frequency</label>
                  <select
                    value={serviceForm.serviceFrequency}
                    onChange={(e) => setServiceForm({ ...serviceForm, serviceFrequency: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="One-time">One-time Sprint</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-weekly">Bi-weekly</option>
                    <option value="Monthly">Monthly Retainer</option>
                    <option value="Quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Service Status</label>
                  <select
                    value={serviceForm.status}
                    onChange={(e) => setServiceForm({ ...serviceForm, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="pending_activation">Pending Activation</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Scope & Inclusions</label>
                <textarea
                  rows="2"
                  placeholder="Define scope, expected creative limits, review frequency..."
                  value={serviceForm.scopeDescription}
                  onChange={(e) => setServiceForm({ ...serviceForm, scopeDescription: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Expected Deliverables</label>
                <textarea
                  rows="2"
                  placeholder="e.g. 5 Ad banners, 2 Reels, bi-weekly analytics report"
                  value={serviceForm.expectedDeliverables}
                  onChange={(e) => setServiceForm({ ...serviceForm, expectedDeliverables: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={serviceForm.startDate}
                    onChange={(e) => setServiceForm({ ...serviceForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={serviceForm.endDate}
                    onChange={(e) => setServiceForm({ ...serviceForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Configuring...' : 'Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Client Information Modal */}
      {isEditClientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-lg">Edit Client Record</h3>
              <button onClick={() => setIsEditClientOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleUpdateClient} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Client Name *</label>
                  <input
                    type="text"
                    required
                    value={editClientForm.name || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Client Code</label>
                  <input
                    type="text"
                    value={editClientForm.client_code || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, clientCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company / Legal Name</label>
                  <input
                    type="text"
                    value={editClientForm.company_name || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, companyName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={editClientForm.industry || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, industry: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={editClientForm.website || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, website: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={editClientForm.city || ''}
                    onChange={(e) => setEditClientForm({ ...editClientForm, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editClientForm.address || ''}
                  onChange={(e) => setEditClientForm({ ...editClientForm, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Operational Requirements</label>
                <textarea
                  rows="3"
                  value={editClientForm.requirements_notes || ''}
                  onChange={(e) => setEditClientForm({ ...editClientForm, requirementsNotes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditClientOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Update Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service Workflow Preview Modal */}
      {selectedPreviewService && (
        <WorkflowPreviewModal
          isOpen={isServicePreviewOpen}
          onClose={() => {
            setIsServicePreviewOpen(false);
            setSelectedPreviewService(null);
          }}
          workflowPresetId={selectedPreviewService.workflow_preset_id}
          workflowPresetVersionId={selectedPreviewService.workflow_preset_version_id}
          clientId={id}
          serviceInstanceId={selectedPreviewService.id}
          startDate={selectedPreviewService.start_date}
          canExecute={canManageServices}
          onExecuted={(res) => {
            showNotification(res.message || 'Service workflow automation executed successfully.');
            fetchWorkspace();
          }}
        />
      )}

      {/* Client Approval / Revision Decision Modal */}
      {clientApprovalModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    clientApprovalModal.action === 'approve'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {clientApprovalModal.action === 'approve' ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <RotateCcw className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {clientApprovalModal.action === 'approve' ? 'Approve Deliverable' : 'Request Deliverable Revision'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {clientApprovalModal.action === 'approve'
                      ? 'Confirm sign-off and mark work as approved'
                      : 'Provide actionable feedback for rework'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClientApprovalModal({ open: false, submissionId: null, action: 'approve', reason: '' })}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                {clientApprovalModal.action === 'approve' ? 'Approval Comments (Optional)' : 'Revision Feedback / Reason (Required)'}
              </label>
              <textarea
                rows={4}
                value={clientApprovalModal.reason}
                onChange={(e) => setClientApprovalModal({ ...clientApprovalModal, reason: e.target.value })}
                placeholder={
                  clientApprovalModal.action === 'approve'
                    ? 'E.g., Looks great! Ready for publishing.'
                    : 'Please detail specifically what adjustments or revisions are needed...'
                }
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent placeholder:text-slate-400"
              />
              {clientApprovalModal.action === 'revision' && (
                <p className="text-[11px] text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  Requesting a revision will move this task into Rework and notify the assigned agency team for internal revision before returning to you.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClientApprovalModal({ open: false, submissionId: null, action: 'approve', reason: '' })}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || (clientApprovalModal.action === 'revision' && (!clientApprovalModal.reason || clientApprovalModal.reason.trim().length < 5))}
                onClick={handleClientPortalDecision}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition disabled:opacity-50 ${
                  clientApprovalModal.action === 'approve'
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isSubmitting ? 'Processing...' : clientApprovalModal.action === 'approve' ? 'Confirm Approval' : 'Submit Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientWorkspacePage;
