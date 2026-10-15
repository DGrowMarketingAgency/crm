import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Shield,
  ShieldAlert,
  Clock,
  Trash2,
  Edit2,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';
import { credentialsService } from '../../services/api';

const ACCESS_LEVEL_LABELS = {
  metadata_only: {
    label: 'Metadata Only',
    desc: 'Can view platform name, category, and URL. Cannot reveal passwords.',
    color: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  view_credentials: {
    label: 'View Credentials',
    desc: 'Can decrypt and reveal username and password on-demand.',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  edit_credentials: {
    label: 'Edit Credentials',
    desc: 'Can update credential metadata and replace passwords.',
    color: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  manage_access: {
    label: 'Manage Access',
    desc: 'Can grant or revoke permissions for other employees.',
    color: 'bg-purple-50 text-purple-700 border-purple-200'
  }
};

export function AuthorizedEmployeesModal({ isOpen, onClose, credential, onUpdated }) {
  const [grants, setGrants] = useState([]);
  const [eligibleEmployees, setEligibleEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form for new grant
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [accessLevel, setAccessLevel] = useState('view_credentials');
  const [expiresAt, setExpiresAt] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Editing grant state
  const [editingGrantId, setEditingGrantId] = useState(null);
  const [editLevel, setEditLevel] = useState('');
  const [editExpires, setEditExpires] = useState('');

  useEffect(() => {
    if (isOpen && credential?.id) {
      setError('');
      setSuccessMsg('');
      loadGrants();
      loadEligibleEmployees();
    }
  }, [isOpen, credential?.id]);

  const loadGrants = async () => {
    setLoading(true);
    try {
      const res = await credentialsService.getCredentialDetails(credential.id);
      if (res.data?.success) {
        setGrants(res.data.authorizedEmployees || []);
      }
    } catch (err) {
      setError('Failed to load access grants.');
    } finally {
      setLoading(false);
    }
  };

  const loadEligibleEmployees = async () => {
    try {
      const res = await credentialsService.getEligibleEmployees();
      if (res.data?.success) {
        setEligibleEmployees(res.data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load eligible employees:', err);
    }
  };

  const handleGrantSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError('Please select an employee.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      await credentialsService.grantAccess(credential.id, {
        employee_id: selectedEmployeeId,
        access_level: accessLevel,
        expires_at: expiresAt || null,
        access_reason: accessReason || null
      });

      setSuccessMsg('Access granted successfully.');
      setSelectedEmployeeId('');
      setAccessReason('');
      setExpiresAt('');
      setAccessLevel('view_credentials');
      await loadGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to grant access.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (grantId) => {
    if (!window.confirm('Are you sure you want to revoke this employee’s access immediately?')) {
      return;
    }

    try {
      await credentialsService.revokeGrant(credential.id, grantId);
      setSuccessMsg('Access revoked successfully.');
      await loadGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError('Failed to revoke access.');
    }
  };

  const handleSaveEditGrant = async (grantId) => {
    try {
      await credentialsService.updateGrant(credential.id, grantId, {
        access_level: editLevel,
        expires_at: editExpires || null
      });
      setEditingGrantId(null);
      setSuccessMsg('Grant updated successfully.');
      await loadGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError('Failed to update grant.');
    }
  };

  if (!isOpen || !credential) return null;

  const activeGrants = grants.filter((g) => !g.revoked_at);
  const revokedGrants = grants.filter((g) => g.revoked_at);

  const filteredEmployees = eligibleEmployees.filter((emp) => {
    const q = searchFilter.toLowerCase();
    return (
      emp.name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  Authorized Employees & Access Control
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  {credential.platform_name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Client: {credential.client_name || 'Organization'} · Explicit grants enforce zero default access.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section: Grant New Employee Access */}
          <div className="p-5 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                Grant New Employee Access
              </h4>
              <span className="text-[11px] text-slate-500">
                Minimum necessary privilege principle
              </span>
            </div>

            <form onSubmit={handleGrantSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Employee Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Select Eligible Employee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  >
                    <option value="">-- Choose employee --</option>
                    {filteredEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.department || emp.role || 'Staff'}) · {emp.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Access Level */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Permitted Access Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  >
                    <option value="metadata_only">Metadata Only (Cannot Reveal)</option>
                    <option value="view_credentials">View Credentials (Can Reveal Secret)</option>
                    <option value="edit_credentials">Edit Credentials (Can Update & Reveal)</option>
                    <option value="manage_access">Manage Access (Can Grant to Others)</option>
                  </select>
                </div>
              </div>

              {/* Explanatory badge for selected level */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/70 text-[11px] flex items-start gap-2 text-slate-600">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>{ACCESS_LEVEL_LABELS[accessLevel]?.label}:</strong>{' '}
                  {ACCESS_LEVEL_LABELS[accessLevel]?.desc}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Expiry Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Access Expiry Date <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>

                {/* Access Reason */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Internal Access Reason / Project Assignment
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Assigned to conduct Google Ads sprint"
                    value={accessReason}
                    onChange={(e) => setAccessReason(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Granting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm Access Grant
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Section: Currently Authorized Employees Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Active Employee Access Grants ({activeGrants.length})
              </h4>
              <span className="text-[11px] text-slate-500">
                Revoked grants stop working immediately
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading grants...</div>
            ) : activeGrants.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
                <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-600">No employees currently have access.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  This credential is strictly Admin-only.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Access Level</th>
                      <th className="py-2.5 px-4">Expires</th>
                      <th className="py-2.5 px-4">Reason / Notes</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeGrants.map((grant) => {
                      const levelMeta = ACCESS_LEVEL_LABELS[grant.access_level] || ACCESS_LEVEL_LABELS.view_credentials;
                      const isEditingThis = editingGrantId === grant.grant_id;

                      return (
                        <tr key={grant.grant_id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{grant.employee_name}</div>
                            <div className="text-[10px] text-slate-400">
                              {grant.department || 'General'} · {grant.employee_email}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {isEditingThis ? (
                              <select
                                value={editLevel}
                                onChange={(e) => setEditLevel(e.target.value)}
                                className="px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white"
                              >
                                <option value="metadata_only">Metadata Only</option>
                                <option value="view_credentials">View Credentials</option>
                                <option value="edit_credentials">Edit Credentials</option>
                                <option value="manage_access">Manage Access</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${levelMeta.color}`}
                              >
                                {levelMeta.label}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            {isEditingThis ? (
                              <input
                                type="datetime-local"
                                value={editExpires}
                                onChange={(e) => setEditExpires(e.target.value)}
                                className="px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white"
                              />
                            ) : grant.expires_at ? (
                              <div className="flex items-center gap-1 text-[11px] text-amber-700">
                                <Clock className="w-3 h-3" />
                                {new Date(grant.expires_at).toLocaleDateString()}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">Never expires</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-600 text-[11px] max-w-[180px] truncate">
                            {grant.access_reason || '—'}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditingThis ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditGrant(grant.grant_id)}
                                    className="px-2 py-1 text-[11px] bg-emerald-700 text-white rounded-lg hover:bg-emerald-800"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingGrantId(null)}
                                    className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-lg"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingGrantId(grant.grant_id);
                                      setEditLevel(grant.access_level);
                                      setEditExpires(grant.expires_at ? grant.expires_at.slice(0, 16) : '');
                                    }}
                                    title="Edit Grant"
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRevoke(grant.grant_id)}
                                    title="Revoke Access Immediately"
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
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

          {/* Revoked Grants History Accordion */}
          {revokedGrants.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                Past Revoked Grants ({revokedGrants.length})
              </span>
              <div className="border border-slate-200/70 rounded-xl bg-slate-50/50 divide-y divide-slate-100 text-xs">
                {revokedGrants.map((g) => (
                  <div key={g.grant_id} className="p-3 flex items-center justify-between text-slate-500">
                    <div>
                      <span className="font-semibold text-slate-700">{g.employee_name}</span>
                      <span className="text-[10px] text-slate-400 ml-2">({g.access_level})</span>
                    </div>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      Revoked on {new Date(g.revoked_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
