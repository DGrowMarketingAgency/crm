import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import { credentialsService, clientService } from '../../services/api';
import { AddCredentialModal } from '../../components/credentials/AddCredentialModal';
import { AuthorizedEmployeesModal } from '../../components/credentials/AuthorizedEmployeesModal';
import { AuditHistoryModal } from '../../components/credentials/AuditHistoryModal';
import { RevealCredentialModal } from '../../components/credentials/RevealCredentialModal';
import {
  Key,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Plus,
  Search,
  Filter,
  Eye,
  Users,
  History,
  Edit2,
  Trash2,
  ExternalLink,
  RefreshCw,
  Building,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Clock
} from 'lucide-react';

const CATEGORIES = [
  'All Categories',
  'Social Media',
  'Website Administration',
  'Hosting and Domain',
  'Email Services',
  'SEO Tools',
  'Advertising Accounts',
  'Analytics',
  'Business Listings',
  'Other'
];

export function PasswordManagerPage() {
  const { user } = useAuth();
  const { hasPermission, isOwner, roles } = usePermission();

  const isClientUser = Boolean(user?.client_id) || (roles || []).some((r) => r.slug === 'client');
  const isAdminUser =
    isOwner ||
    (roles || []).some((r) => r.slug === 'owner' || r.slug === 'admin') ||
    hasPermission('credentials.manage') ||
    hasPermission('credentials.view_all');

  const [credentials, setCredentials] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedClientId, setSelectedClientId] = useState('');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingCred, setEditingCred] = useState(null);
  const [grantModalCred, setGrantModalCred] = useState(null);
  const [auditModalCred, setAuditModalCred] = useState(null);

  // Reveal state
  const [revealingId, setRevealingId] = useState(null);
  const [revealedData, setRevealedData] = useState(null);
  const [revealedCredMeta, setRevealedCredMeta] = useState(null);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (selectedCategory !== 'All Categories') params.category = selectedCategory;
      if (selectedClientId) params.clientId = selectedClientId;
      if (searchTerm) params.search = searchTerm;

      const res = await credentialsService.getCredentials(params);
      if (res.data?.success) {
        setCredentials(res.data.credentials || []);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load credentials.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedClientId, searchTerm]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Load clients list for Admin filter dropdown
  useEffect(() => {
    if (isAdminUser) {
      clientService
        .getClients({ limit: 100 })
        .then((res) => {
          if (res.data?.success) {
            setClients(res.data.clients || []);
          }
        })
        .catch(() => {});
    }
  }, [isAdminUser]);

  // Handle Reveal Action
  const handleReveal = async (cred) => {
    setRevealingId(cred.id);
    setError('');
    try {
      const res = await credentialsService.revealCredential(cred.id);
      if (res.data?.success) {
        setRevealedData(res.data.revealed);
        setRevealedCredMeta(cred);
      }
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          'Failed to reveal credential. You may lack permission or the rate limit was reached.'
      );
    } finally {
      setRevealingId(null);
    }
  };

  // Handle Client-initiated Revocation of all employee grants
  const handleClientRevokeAll = async (cred) => {
    if (
      !window.confirm(
        `Are you sure you want to revoke all team access to "${cred.platform_name}"? Authorized employees will immediately lose access.`
      )
    ) {
      return;
    }

    try {
      await credentialsService.clientRevokeAllAccess(cred.id);
      setSuccessMsg(`All employee access to ${cred.platform_name} has been revoked.`);
      fetchCredentials();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to revoke access.');
    }
  };

  // Handle Archive Credential
  const handleArchive = async (cred) => {
    if (
      !window.confirm(
        `Are you sure you want to archive "${cred.platform_name}"? It will be removed from active credentials.`
      )
    ) {
      return;
    }

    try {
      await credentialsService.archiveCredential(cred.id);
      setSuccessMsg(`"${cred.platform_name}" has been archived.`);
      fetchCredentials();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to archive credential.');
    }
  };

  // Dynamic Page Title & Subtitle
  const pageTitle = isClientUser
    ? 'Account & Security — Shared Credentials'
    : isAdminUser
    ? 'Password Manager — Client Credentials Vault'
    : 'Authorized Client Credentials';

  const pageSubtitle = isClientUser
    ? 'Manage your external platform credentials securely. Encrypted at rest using AES-256-GCM.'
    : isAdminUser
    ? 'Enterprise-grade credential access control. Admin-only access by default with explicit employee grants.'
    : 'Platform credentials explicitly authorized for your assigned workflows.';

  // Statistics
  const totalCreds = credentials.length;
  const totalGrants = credentials.reduce((sum, c) => sum + (c.authorized_employee_count || 0), 0);
  const categoriesCount = new Set(credentials.map((c) => c.category)).size;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-700/20 shrink-0">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              {pageTitle}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                AES-256-GCM
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{pageSubtitle}</p>
          </div>
        </div>

        {/* Action Button: Add Credential (Admin or Client) */}
        {(isAdminUser || isClientUser) && (
          <button
            onClick={() => {
              setEditingCred(null);
              setAddModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            {isClientUser ? 'Add New Credential' : 'Register Client Credential'}
          </button>
        )}
      </div>

      {/* Security Status & Metric Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              {isClientUser ? 'My Platform Logins' : 'Total Credentials'}
            </span>
            <span className="text-2xl font-black text-slate-800">{totalCreds}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <Key className="w-5 h-5 text-emerald-700" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              {isClientUser ? 'Active Staff Grants' : 'Authorized Access Grants'}
            </span>
            <span className="text-2xl font-black text-slate-800">{totalGrants}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Categories Active
            </span>
            <span className="text-2xl font-black text-slate-800">{categoriesCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <Filter className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Access Policy
            </span>
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Zero Default Access
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800">
            &times;
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3 w-full">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search platform, username, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Client Filter (Admin only) */}
          {isAdminUser && (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 max-w-[200px]"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={fetchCredentials}
          title="Refresh List"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors self-end md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Credentials Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            Loading credentials...
          </div>
        ) : credentials.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Lock className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No Credentials Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {isClientUser
                ? 'You have not submitted any platform credentials yet. Click "Add New Credential" above to get started.'
                : isAdminUser
                ? 'No client credentials match your selected filter criteria.'
                : 'You have not been granted access to any client credentials yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-5">Platform & Service</th>
                  {!isClientUser && <th className="py-3 px-5">Client</th>}
                  <th className="py-3 px-5">Username</th>
                  <th className="py-3 px-5">Password</th>
                  <th className="py-3 px-5">Access Grants</th>
                  <th className="py-3 px-5">Last Updated</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credentials.map((cred) => {
                  const isRevealingThis = revealingId === cred.id;
                  const canEdit =
                    isAdminUser ||
                    isClientUser ||
                    ['edit_credentials', 'manage_access'].includes(cred.access_level);
                  const canManageGrants =
                    isAdminUser || cred.access_level === 'manage_access';
                  const isMetadataOnly = cred.access_level === 'metadata_only';

                  return (
                    <tr key={cred.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Platform & Service */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {cred.platform_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              {cred.platform_name}
                              {cred.login_url && (
                                <a
                                  href={cred.login_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open login page"
                                  className="text-slate-400 hover:text-emerald-700 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                              {cred.category}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Client (for Admin & Employee) */}
                      {!isClientUser && (
                        <td className="py-4 px-5">
                          <span className="font-semibold text-slate-700 block">
                            {cred.client_name}
                          </span>
                          {cred.company_name && (
                            <span className="text-[10px] text-slate-400">
                              {cred.company_name}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Username */}
                      <td className="py-4 px-5">
                        <span className="font-mono text-slate-700 text-xs">
                          {cred.username_masked || cred.username || '—'}
                        </span>
                      </td>

                      {/* Password (Masked by default) */}
                      <td className="py-4 px-5">
                        <span className="font-mono text-slate-400 text-xs select-none">
                          ••••••••••••
                        </span>
                      </td>

                      {/* Access Grants & Permissions */}
                      <td className="py-4 px-5">
                        {!isClientUser && cred.access_level ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              cred.access_level === 'metadata_only'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {cred.access_level === 'metadata_only'
                              ? 'Metadata Only'
                              : 'Authorized View'}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              if (canManageGrants) {
                                setGrantModalCred(cred);
                              }
                            }}
                            disabled={!canManageGrants}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-colors ${
                              canManageGrants
                                ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 cursor-pointer'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>{cred.authorized_employee_count || 0} Authorized</span>
                          </button>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td className="py-4 px-5 text-slate-500 text-[11px]">
                        {new Date(cred.updated_at || cred.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Reveal Button */}
                          {!isMetadataOnly && (
                            <button
                              onClick={() => handleReveal(cred)}
                              disabled={isRevealingThis}
                              title="Reveal secret credentials"
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              {isRevealingThis ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              <span>Reveal</span>
                            </button>
                          )}

                          {/* Manage Access Button (Admin / Manage Access) */}
                          {canManageGrants && (
                            <button
                              onClick={() => setGrantModalCred(cred)}
                              title="Manage Authorized Employees"
                              className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                            >
                              <Users className="w-4 h-4" />
                            </button>
                          )}

                          {/* Client-initiated complete revocation */}
                          {isClientUser && cred.authorized_employee_count > 0 && (
                            <button
                              onClick={() => handleClientRevokeAll(cred)}
                              title="Revoke all shared employee access"
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Audit History (Admin or Client) */}
                          {(isAdminUser || isClientUser) && (
                            <button
                              onClick={() => setAuditModalCred(cred)}
                              title="View Security Audit History"
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit / Replace Password */}
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingCred(cred);
                                setAddModalOpen(true);
                              }}
                              title="Update Credential or Replace Password"
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Archive (Admin or Client) */}
                          {(isAdminUser || isClientUser) && (
                            <button
                              onClick={() => handleArchive(cred)}
                              title="Archive Credential"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddCredentialModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setEditingCred(null);
        }}
        onCreated={() => {
          setSuccessMsg(editingCred ? 'Credential updated successfully.' : 'New credential encrypted and stored.');
          fetchCredentials();
        }}
        isClientUser={isClientUser}
        currentClientId={user?.client_id}
        initialData={editingCred}
      />

      <AuthorizedEmployeesModal
        isOpen={Boolean(grantModalCred)}
        onClose={() => setGrantModalCred(null)}
        credential={grantModalCred}
        onUpdated={fetchCredentials}
      />

      <AuditHistoryModal
        isOpen={Boolean(auditModalCred)}
        onClose={() => setAuditModalCred(null)}
        credential={auditModalCred}
      />

      <RevealCredentialModal
        isOpen={Boolean(revealedData)}
        onClose={() => {
          setRevealedData(null);
          setRevealedCredMeta(null);
        }}
        revealedData={revealedData}
        platformName={revealedCredMeta?.platform_name || ''}
        category={revealedCredMeta?.category || ''}
        loginUrl={revealedCredMeta?.login_url}
      />
    </div>
  );
}
