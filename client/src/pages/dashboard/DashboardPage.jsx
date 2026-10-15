import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import {
  reportsService,
  usersService,
  clientsService,
  leadsService,
  projectsService,
  tasksService,
  deliverablesService,
  ticketsService,
  billingService,
  credentialsService,
  timeService
} from '../../services/api';
import {
  Users,
  Building2,
  FolderKanban,
  CheckSquare,
  TrendingUp,
  Clock,
  ShieldCheck,
  Lock,
  ArrowRight,
  Loader2,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Layers,
  ChevronRight,
  FileText,
  ExternalLink,
  Download,
  Key,
  LifeBuoy,
  Calendar,
  CreditCard,
  Send,
  Eye,
  Check,
  X,
  MessageSquare,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuth();
  const { permissions, hasPermission, roles, isOwner } = usePermission();

  // Role Determination
  const isClientUser = useMemo(() => {
    return (
      Boolean(user?.client_id || user?.clientId) ||
      user?.role === 'client' ||
      (roles || []).some((r) => r.slug === 'client')
    );
  }, [user, roles]);

  const isAdminOrOwner = useMemo(() => {
    return (
      isOwner ||
      user?.role === 'owner' ||
      user?.role === 'admin' ||
      (roles || []).some((r) => r.slug === 'owner' || r.slug === 'admin')
    );
  }, [isOwner, user, roles]);

  const isEmployee = !isClientUser && !isAdminOrOwner;

  // Render appropriate dashboard branch
  if (isClientUser) {
    return <ClientPortalDashboard user={user} />;
  }

  if (isEmployee) {
    return <EmployeeWorkspaceDashboard user={user} />;
  }

  return <ExecutiveLeadershipDashboard user={user} isOwner={isOwner} hasPermission={hasPermission} />;
}

/* =====================================================================
   BRANCH 1: CLIENT PORTAL DASHBOARD
   Strictly scoped to client's own projects, deliverables, invoices & credentials
   ===================================================================== */
function ClientPortalDashboard({ user }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Client Data States
  const [projects, setProjects] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [credentialsCount, setCredentialsCount] = useState(0);

  // Approval / Revision Modal State
  const [revisionModal, setRevisionModal] = useState({ open: false, item: null, feedback: '', isSubmitting: false });
  const [approvalLoading, setApprovalLoading] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');

  const clientId = user?.clientId || user?.client_id;

  const fetchClientData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');

    try {
      const promises = [
        projectsService.getProjects({ limit: 20 }),
        clientId ? deliverablesService.getClientDeliverables(clientId) : Promise.resolve({ data: { deliverables: [] } }),
        ticketsService.list({ limit: 10 }).catch(() => ({ data: { tickets: [] } })),
        credentialsService.getCredentials({ limit: 1 }).catch(() => ({ data: { total: 0 } }))
      ];

      const [projRes, delivRes, tickRes, credRes] = await Promise.allSettled(promises);

      if (projRes.status === 'fulfilled' && projRes.value?.data) {
        setProjects(projRes.value.data.projects || []);
      }

      if (delivRes.status === 'fulfilled' && delivRes.value?.data) {
        const rawDelivs = delivRes.value.data.deliverables || delivRes.value.data.data?.deliverables || [];
        setDeliverables(rawDelivs);
      }

      if (tickRes.status === 'fulfilled' && tickRes.value?.data) {
        setTickets(tickRes.value.data.tickets || []);
      }

      if (credRes.status === 'fulfilled' && credRes.value?.data) {
        setCredentialsCount(credRes.value.data.total ?? (credRes.value.data.credentials?.length || 0));
      }
    } catch (err) {
      console.error('Failed to load client portal data:', err);
      setError('Could not refresh portal data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  // Deliverable Actions
  const handleApproveDeliverable = async (deliverableId) => {
    setApprovalLoading(deliverableId);
    setActionSuccess('');
    try {
      await deliverablesService.clientApprove(deliverableId, {
        feedback: 'Approved by Client via Client Portal'
      });
      setActionSuccess('Deliverable approved successfully!');
      setTimeout(() => setActionSuccess(''), 4000);
      fetchClientData(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve deliverable.');
    } finally {
      setApprovalLoading(null);
    }
  };

  const handleOpenRevisionModal = (item) => {
    setRevisionModal({ open: true, item, feedback: '', isSubmitting: false });
  };

  const handleSubmitRevision = async (e) => {
    e.preventDefault();
    if (!revisionModal.feedback.trim()) return;

    setRevisionModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await deliverablesService.clientRequestRevision(revisionModal.item.id, {
        feedback: revisionModal.feedback.trim()
      });
      setRevisionModal({ open: false, item: null, feedback: '', isSubmitting: false });
      setActionSuccess('Revision request submitted to the creative team.');
      setTimeout(() => setActionSuccess(''), 4000);
      fetchClientData(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit revision request.');
      setRevisionModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Filter pending review deliverables
  const pendingDeliverables = deliverables.filter(
    (d) => d.client_approval_status === 'pending' || d.client_approval_status === 'in_review'
  );

  return (
    <div className="space-y-6">
      {/* 1. Client Welcome Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-rose-950 rounded-2xl p-6 sm:p-7 text-white shadow-md relative overflow-hidden border border-rose-900/30">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#e3272e] text-white text-[10px] font-bold uppercase tracking-wider shadow-sm shadow-red-700/50">
                Client Portal
              </span>
              <span className="text-xs font-semibold text-rose-200/80">Business Command Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Welcome, {user?.name || 'Valued Client'}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Track your active projects, review deliverables awaiting sign-off, access campaign schedules, and manage shared credentials.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => fetchClientData(true)}
              disabled={isRefreshing}
              title="Refresh Portal Data"
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/10 transition-colors flex items-center gap-2 backdrop-blur-sm shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-rose-400' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to="/tickets"
              className="px-4 py-2 rounded-xl bg-[#e3272e] hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-600/40 flex items-center gap-1.5"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>Raise Ticket</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Success notification */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-semibold">{actionSuccess}</span>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Client Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Projects */}
        <Link
          to="/projects"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FolderKanban className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {projects.filter((p) => p.status === 'in_progress' || p.status === 'planning').length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Active Projects
            </span>
          </div>
        </Link>

        {/* Deliverables Pending Approval */}
        <div
          className={`p-5 rounded-2xl border shadow-sm transition-all flex flex-col justify-between ${
            pendingDeliverables.length > 0
              ? 'bg-amber-50/50 border-amber-300 shadow-amber-50'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                pendingDeliverables.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <CheckSquare className="w-5 h-5" />
            </div>
            {pendingDeliverables.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold animate-pulse">
                Action Required
              </span>
            )}
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {pendingDeliverables.length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Deliverables for Review
            </span>
          </div>
        </div>

        {/* Open Support Tickets */}
        <Link
          to="/tickets"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Support Tickets
            </span>
          </div>
        </Link>

        {/* Shared Credentials */}
        <Link
          to="/shared-credentials"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Key className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {credentialsCount}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Shared Credentials
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Action Center: Deliverables Awaiting Client Approval */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Deliverables Awaiting Your Approval
              </h2>
              <p className="text-xs text-slate-500">
                Review creative work, design assets, and campaign deliverables submitted by the team.
              </p>
            </div>
          </div>
          <Link
            to="/projects"
            className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
          >
            <span>All Projects</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : pendingDeliverables.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-bold text-slate-800">All deliverables are approved!</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              There are no pending submissions waiting for your sign-off right now. You will be notified as soon as new assets are ready.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingDeliverables.map((item) => (
              <div
                key={item.id}
                className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Version {item.version_number || 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Project: {item.project_name || 'Agency Project'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.task_title || item.title || 'Creative Deliverable Submission'}
                  </h3>
                  {item.submission_notes && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 max-w-2xl">
                      <span className="font-semibold text-slate-700">Team Notes: </span>
                      {item.submission_notes}
                    </p>
                  )}
                  {item.file_name && (
                    <div className="flex items-center gap-2 pt-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-600 font-mono">{item.file_name}</span>
                      {item.file_size && (
                        <span className="text-[11px] text-slate-400">
                          ({(item.file_size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Download / Preview */}
                  <a
                    href={deliverablesService.getDownloadUrl(item.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download</span>
                  </a>

                  {/* Request Revision */}
                  <button
                    onClick={() => handleOpenRevisionModal(item)}
                    className="px-3.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold shadow-sm transition-colors flex items-center gap-1"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                    <span>Request Revision</span>
                  </button>

                  {/* Approve */}
                  <button
                    onClick={() => handleApproveDeliverable(item.id)}
                    disabled={approvalLoading === item.id}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {approvalLoading === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Approve Work</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Active Projects & Milestones */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-[#e3272e]" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Your Active Projects & Delivery Milestones
            </h2>
          </div>
          <Link
            to="/projects"
            className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
          >
            <span>View Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No active projects found under your client account. Contact your Account Manager to launch a project.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Project Name</th>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Target Completion</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {projects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      <Link to={`/projects/${proj.id}`} className="hover:text-[#e3272e] transition-colors">
                        {proj.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-500">
                      {proj.project_code || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          proj.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : proj.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {proj.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {proj.target_date ? new Date(proj.target_date).toLocaleDateString() : 'Active Pipeline'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/projects/${proj.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#e3272e] hover:text-red-700"
                      >
                        <span>Open Project</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Client Business Launchpad (Strictly client-focused tools) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/shared-credentials"
          className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Key className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#e3272e] transition-colors">
              Shared Credentials Vault
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Securely access shared account logins, CMS portals, and ad accounts.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-700 mt-3 flex items-center gap-1">
            <span>Open Vault</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          to="/calendar"
          className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#e3272e] flex items-center justify-center group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#e3272e] transition-colors">
              Campaign Calendar
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              View upcoming social media posts, campaign launches, and live schedules.
            </p>
          </div>
          <span className="text-xs font-semibold text-[#e3272e] mt-3 flex items-center gap-1">
            <span>View Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          to="/billing"
          className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#e3272e] transition-colors">
              Invoices & Quotations
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Download tax invoices, approve service quotations, and view transaction records.
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-700 mt-3 flex items-center gap-1">
            <span>View Invoices</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          to="/tickets"
          className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/40 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#e3272e] transition-colors">
              Support Desk
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Have questions or request updates? Open a high-priority ticket with our account team.
            </p>
          </div>
          <span className="text-xs font-semibold text-purple-700 mt-3 flex items-center gap-1">
            <span>Get Support</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      </div>

      {/* Revision Request Modal */}
      {revisionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Request Deliverable Revision</h3>
              </div>
              <button
                onClick={() => setRevisionModal({ open: false, item: null, feedback: '', isSubmitting: false })}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRevision} className="space-y-4">
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  Please describe the exact adjustments or changes you would like our team to make on{' '}
                  <span className="font-bold text-slate-800">
                    "{revisionModal.item?.task_title || revisionModal.item?.title || 'this deliverable'}"
                  </span>
                  :
                </p>
                <textarea
                  required
                  rows={4}
                  value={revisionModal.feedback}
                  onChange={(e) => setRevisionModal((prev) => ({ ...prev, feedback: e.target.value }))}
                  placeholder="e.g. Please change the headline font to Outfit and update the product photo on slide 2..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#e3272e] focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevisionModal({ open: false, item: null, feedback: '', isSubmitting: false })}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revisionModal.isSubmitting || !revisionModal.feedback.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {revisionModal.isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Submit Revision Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   BRANCH 2: EMPLOYEE WORKSPACE DASHBOARD
   Strictly scoped to employee's assigned tasks & assigned client projects
   ===================================================================== */
function EmployeeWorkspaceDashboard({ user }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Employee Specific Data
  const [myTasks, setMyTasks] = useState([]);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timeSummary, setTimeSummary] = useState(null);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

  const fetchEmployeeData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');

    try {
      const [tasksRes, projRes, timerRes, summaryRes] = await Promise.allSettled([
        tasksService.getMyTasks({ limit: 25 }),
        projectsService.getProjects({ limit: 12 }),
        timeService.getActiveTimer().catch(() => ({ data: { timer: null } })),
        timeService.getSummary({ period: 'today' }).catch(() => ({ data: { summary: {} } }))
      ]);

      if (tasksRes.status === 'fulfilled' && tasksRes.value?.data) {
        setMyTasks(tasksRes.value.data.tasks || []);
      }

      if (projRes.status === 'fulfilled' && projRes.value?.data) {
        setAssignedProjects(projRes.value.data.projects || []);
      }

      if (timerRes.status === 'fulfilled' && timerRes.value?.data) {
        setActiveTimer(timerRes.value.data.timer || null);
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value?.data) {
        setTimeSummary(summaryRes.value.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load employee workspace:', err);
      setError('Could not refresh workspace data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployeeData();
  }, [user?.id]);

  // Quick Status Updater for employee tasks
  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    setUpdatingTaskId(taskId);
    try {
      await tasksService.changeStatus(taskId, newStatus);
      setMyTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update task status.');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const pendingTasks = myTasks.filter((t) => t.status !== 'done' && t.status !== 'completed');
  const inReviewTasks = myTasks.filter((t) => t.status === 'in_review');
  const completedTasks = myTasks.filter((t) => t.status === 'done' || t.status === 'completed');

  return (
    <div className="space-y-6">
      {/* 1. Employee Welcome Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider">
                My Workspace
              </span>
              {user?.department && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold">
                  {user.department}
                </span>
              )}
              {user?.designations && user.designations.length > 0 && (
                <span className="text-xs font-semibold text-slate-500">
                  {user.designations.join(' • ')}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, {user?.name || 'Team Member'}!
            </h1>
            <p className="text-xs text-slate-500">
              Your direct assignments, active client projects, work timers, and daily task checklist.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchEmployeeData(true)}
              disabled={isRefreshing}
              title="Refresh My Workspace"
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#e3272e]' : ''}`} />
            </button>
            <Link
              to="/time"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span>{activeTimer ? 'Timer Running' : 'Track Time'}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Employee Key Performance Metrics (4 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Pending Tasks */}
        <Link
          to="/tasks"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckSquare className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {pendingTasks.length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              My Pending Tasks
            </span>
          </div>
        </Link>

        {/* Assigned Client Projects */}
        <Link
          to="/projects"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FolderKanban className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {assignedProjects.length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Assigned Projects
            </span>
          </div>
        </Link>

        {/* Tasks in Review */}
        <Link
          to="/tasks"
          className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-amber-600">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {inReviewTasks.length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              In Review Work
            </span>
          </div>
        </Link>

        {/* Completed Tasks */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Completed
            </span>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black text-slate-900 block leading-tight">
              {completedTasks.length}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
              Completed Tasks
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Section: Priority Tasks & Status Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#e3272e]" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              My Priority Tasks
            </h2>
          </div>
          <Link
            to="/tasks"
            className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
          >
            <span>Full Task Board</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : pendingTasks.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-xs font-bold text-slate-700">All caught up!</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              You have no active pending tasks assigned to you right now. Take a break or check project boards.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingTasks.slice(0, 8).map((task) => (
              <div
                key={task.id}
                className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {task.task_code || `#${task.id}`}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        task.priority === 'urgent'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : task.priority === 'high'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {task.priority || 'Normal'}
                    </span>
                    {task.project_name && (
                      <span className="text-xs font-semibold text-slate-500">
                        {task.project_name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {task.title}
                  </h3>
                  {task.due_date && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                      {new Date(task.due_date) < new Date() && (
                        <span className="text-red-600 font-bold ml-1">(Overdue)</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status Change Selector */}
                  <select
                    value={task.status}
                    disabled={updatingTaskId === task.id}
                    onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                    className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#e3272e] disabled:opacity-50"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Completed</option>
                  </select>

                  <Link
                    to="/tasks"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Open in Task Board"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. My Assigned Client Projects */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-[#e3272e]" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              My Assigned Client Projects
            </h2>
          </div>
          <Link
            to="/projects"
            className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
          >
            <span>All Projects</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : assignedProjects.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            You are not currently assigned to any active client projects.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {assignedProjects.map((proj) => (
              <Link
                key={proj.id}
                to={`/projects/${proj.id}`}
                className="p-4 rounded-xl border border-slate-200/80 hover:border-[#e3272e]/50 hover:shadow-sm transition-all bg-slate-50/40 hover:bg-white flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      {proj.project_code || 'PRJ'}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        proj.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-blue-50 text-blue-800'
                      }`}
                    >
                      {proj.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 mt-1 line-clamp-1">
                    {proj.name}
                  </h3>
                  {proj.client_name && (
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      <span>{proj.client_name}</span>
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                  <span>Target: {proj.target_date ? new Date(proj.target_date).toLocaleDateString() : 'Active'}</span>
                  <span className="text-[#e3272e] flex items-center gap-0.5">
                    <span>Open</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 5. Employee Quick Launchpad */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Link
          to="/tasks"
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 transition-all flex flex-col items-center text-center space-y-2"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-[#e3272e] flex items-center justify-center">
            <CheckSquare className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">Task Kanban</span>
        </Link>

        <Link
          to="/time"
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 transition-all flex flex-col items-center text-center space-y-2"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">Time Tracker</span>
        </Link>

        <Link
          to="/authorized-credentials"
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 transition-all flex flex-col items-center text-center space-y-2"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Key className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">Client Logins</span>
        </Link>

        <Link
          to="/chat"
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 transition-all flex flex-col items-center text-center space-y-2"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">Team Chat</span>
        </Link>

        <Link
          to="/hr"
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 transition-all flex flex-col items-center text-center space-y-2"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Briefcase className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">Leaves & HR</span>
        </Link>
      </div>
    </div>
  );
}

/* =====================================================================
   BRANCH 3: EXECUTIVE LEADERSHIP DASHBOARD
   Full agency matrix for Owner & Admin roles
   ===================================================================== */
function ExecutiveLeadershipDashboard({ user, isOwner, hasPermission }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Live metrics states
  const [dashboardData, setDashboardData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);

  const fetchLiveMetrics = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');

    try {
      const [dashRes, usersRes, clientsRes, leadsRes] = await Promise.allSettled([
        hasPermission('reports.view_dashboard')
          ? reportsService.getDashboard({ period: '30d' })
          : Promise.resolve({ data: null }),
        hasPermission('users.view')
          ? usersService.getUsers({ limit: 50 })
          : Promise.resolve({ data: { users: [] } }),
        hasPermission('clients.view')
          ? clientsService.getClients({ limit: 1 })
          : Promise.resolve({ data: { total: 0 } }),
        hasPermission('leads.view')
          ? leadsService.getLeads({ limit: 1 })
          : Promise.resolve({ data: { total: 0 } })
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.data) {
        setDashboardData(dashRes.value.data);
      }

      if (usersRes.status === 'fulfilled' && usersRes.value?.data) {
        setTeamMembers(usersRes.value.data.users || []);
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value?.data) {
        setClientCount(clientsRes.value.data.total ?? clientsRes.value.data.clients?.length ?? 0);
      }

      if (leadsRes.status === 'fulfilled' && leadsRes.value?.data) {
        setLeadsCount(leadsRes.value.data.total ?? leadsRes.value.data.leads?.length ?? 0);
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setError('Failed to fetch some live metrics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
  }, []);

  const kpis = dashboardData?.kpis || {
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    inReviewTasks: 0,
    totalHours: 0
  };

  return (
    <div className="space-y-6">
      {/* 1. Executive Welcome Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-[#e3272e] text-white text-[11px] font-bold uppercase tracking-wider shadow-sm shadow-red-600/30">
                D-GROW OS
              </span>
              <span className="text-xs font-semibold text-slate-400">Live Executive Matrix</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              Welcome back, {user?.name || 'Administrator'}!
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Agency Operations, Client Pipelines, Workload Matrices & Leadership Governance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold">
              Primary Role: {user?.role?.toUpperCase()}
            </span>
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                user?.status === 'active'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              Status: {user?.status?.toUpperCase()}
            </span>
            <button
              onClick={() => fetchLiveMetrics(true)}
              disabled={isRefreshing}
              title="Refresh Live Data"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#e3272e]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Real Operational Metrics (6 Matrix Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Team Members */}
        <Link
          to="/users"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {teamMembers.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Agency Team
            </span>
          </div>
        </Link>

        {/* Card 2: Clients */}
        <Link
          to="/clients"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Building2 className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {clientCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Total Clients
            </span>
          </div>
        </Link>

        {/* Card 3: Active Projects */}
        <Link
          to="/projects"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FolderKanban className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.activeProjects || 0}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Active Projects
            </span>
          </div>
        </Link>

        {/* Card 4: Tasks */}
        <Link
          to="/tasks"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.totalTasks || 0}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Task Board
            </span>
          </div>
        </Link>

        {/* Card 5: BD Pipelines & Leads */}
        <Link
          to="/leads"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {leadsCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              BD Pipeline Leads
            </span>
          </div>
        </Link>

        {/* Card 6: Hours Tracked */}
        <Link
          to="/time"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.totalHours || 0}h
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Hours Logged
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Agency Team & Multi-Designations Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#e3272e]" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Agency Team & Multi-Designation Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Real agency accounts reconciled with designated roles and permissions.
            </p>
          </div>
          <Link
            to="/users"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e3272e] hover:text-red-700"
          >
            <span>Manage Team Directory</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No team members provisioned yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-5 py-3">Team Member</th>
                  <th className="px-5 py-3">Designations</th>
                  <th className="px-5 py-3">System Roles</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {teamMembers.slice(0, 5).map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name & Email */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#e3272e] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm shadow-red-700/30">
                          {member.name[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block leading-tight">
                            {member.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {member.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Multi-Designations */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {member.designations && member.designations.length > 0 ? (
                          member.designations.map((des, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-900 border border-rose-200"
                            >
                              {des}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>

                    {/* Assigned Roles */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {member.roles && member.roles.length > 0 ? (
                          member.roles.map((r) => (
                            <span
                              key={r.id}
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                r.slug === 'owner'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : r.slug === 'admin'
                                  ? 'bg-red-50 text-red-800 border border-red-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {r.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 capitalize">
                            {member.primary_role || 'Member'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {member.department || '—'}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          member.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {member.status === 'inactive' ? 'Pending Invite' : member.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Directory Link Footer if more than 5 members */}
        {teamMembers.length > 5 && (
          <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              Showing top 5 of {teamMembers.length} team members
            </span>
            <Link
              to="/users"
              className="font-semibold text-[#e3272e] hover:text-red-700 inline-flex items-center gap-1 transition-colors"
            >
              <span>View All {teamMembers.length} in Directory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* 4. Operational Columns & Empty States */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Task Board Operational Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#e3272e]" />
              <h3 className="text-sm font-bold text-slate-900">Task Board Pipeline</h3>
            </div>
            <Link
              to="/tasks"
              className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
            >
              <span>View Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 4-Column Distribution Indicators */}
          <div className="grid grid-cols-4 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-xs font-semibold text-slate-500 block">To Do</span>
              <span className="text-xl font-bold text-slate-800 block mt-1">
                {kpis.todoTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
              <span className="text-xs font-semibold text-blue-700 block">In Progress</span>
              <span className="text-xl font-bold text-blue-900 block mt-1">
                {kpis.inProgressTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100 text-center">
              <span className="text-xs font-semibold text-amber-700 block">In Review</span>
              <span className="text-xl font-bold text-amber-900 block mt-1">
                {kpis.inReviewTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-center">
              <span className="text-xs font-semibold text-emerald-700 block">Completed</span>
              <span className="text-xl font-bold text-emerald-900 block mt-1">
                {kpis.completedTasks || 0}
              </span>
            </div>
          </div>

          {kpis.totalTasks === 0 && (
            <div className="mt-5 p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">All task columns are clear</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                No active internal tasks or client deliverable assignments exist. Create a task or trigger a service workflow.
              </p>
              <div className="pt-2">
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#e3272e] hover:bg-red-700 rounded-lg shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Task</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right: Clients & Project Delivery Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#e3272e]" />
              <h3 className="text-sm font-bold text-slate-900">Clients & Service Delivery</h3>
            </div>
            <Link
              to="/clients"
              className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
            >
              <span>View Clients</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-xs font-semibold text-slate-500 block">Total Clients</span>
              <span className="text-xl font-bold text-slate-800 block mt-1">
                {clientCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
              <span className="text-xs font-semibold text-blue-700 block">Active Projects</span>
              <span className="text-xl font-bold text-blue-900 block mt-1">
                {kpis.activeProjects || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100 text-center">
              <span className="text-xs font-semibold text-purple-700 block">BD Funnels</span>
              <span className="text-xl font-bold text-purple-900 block mt-1">
                {leadsCount}
              </span>
            </div>
          </div>

          {clientCount === 0 && (
            <div className="mt-5 p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">No active clients in pipeline</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                No active clients in pipeline. Ready to onboard new agency clients and projects.
              </p>
              <div className="pt-2">
                <Link
                  to="/clients"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#e3272e] hover:bg-red-700 rounded-lg shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Onboard First Client</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. RBAC & Security Quick Links */}
      {hasPermission('roles.view') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Link
            to="/roles"
            className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex items-start justify-between"
          >
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Custom Roles & Permissions Matrix
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Fine-tune granular permission matrices across all agency modules and enforce strict role boundaries.
              </p>
            </div>
            <span className="p-2 rounded-lg bg-slate-50 text-slate-400 group-hover:text-rose-700 group-hover:bg-rose-50 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>

          <Link
            to="/audit-logs"
            className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex items-start justify-between"
          >
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Security Audit Trail
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Inspect immutable audit logs for role modifications, user privilege events, and security access logs.
              </p>
            </div>
            <span className="p-2 rounded-lg bg-slate-50 text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
