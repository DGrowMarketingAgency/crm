import React, { useState, useEffect } from 'react';
import { leadsService, usersService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  TrendingUp,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  ArrowRight,
  Loader2,
  X,
  Phone,
  Mail,
  Building,
  DollarSign,
  Briefcase,
  AlertCircle
} from 'lucide-react';

const PIPELINES = [
  { id: 'D-Grow', label: 'D-Grow (Agency)', description: 'General businesses, local stores, eCommerce & corporates' },
  { id: 'MedGrowDigi', label: 'MedGrowDigi (Healthcare)', description: 'Doctors, multi-specialty clinics & hospitals' },
  { id: 'Mediqora', label: 'Mediqora (Healthcare SaaS)', description: 'Doctor clinics & diagnostic centre subscribers' }
];

export function LeadsPage() {
  const { hasPermission, isOwner } = usePermission();
  const [activePipeline, setActivePipeline] = useState('D-Grow');
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Convert Modal
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertingLead, setConvertingLead] = useState(null);
  const [accountManagers, setAccountManagers] = useState([]);
  const [selectedAM, setSelectedAM] = useState('');
  const [gstin, setGstin] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  // New Lead Modal
  const [newLeadModalOpen, setNewLeadModalOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    title: '',
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    estimatedValue: '',
    stage: 'New'
  });
  const [isCreatingLead, setIsCreatingLead] = useState(false);

  const canManageLeads = isOwner || hasPermission('leads.create');

  useEffect(() => {
    fetchLeads();
    fetchAccountManagers();
  }, [activePipeline]);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const params = { pipeline: activePipeline, limit: 100 };
      if (searchTerm.trim()) params.search = searchTerm;
      const res = await leadsService.getLeads(params);
      setLeads(res.data.leads || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
      setError('Unable to load pipeline leads.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccountManagers = async () => {
    try {
      const res = await usersService.getUsers({ limit: 100, status: 'active' });
      const ams = (res.data.users || []).filter((u) => {
        const slugs = u.roles?.map((r) => r.slug) || [];
        return slugs.includes('account-manager') || u.role === 'account_manager' || slugs.includes('owner');
      });
      setAccountManagers(ams);
    } catch (err) {
      console.error('Failed loading AMs:', err);
    }
  };

  const handleOpenConvert = (lead) => {
    setConvertingLead(lead);
    setSelectedAM('');
    setGstin('');
    setConvertModalOpen(true);
  };

  const handleConfirmConvert = async (e) => {
    e.preventDefault();
    if (!convertingLead) return;

    setIsConverting(true);
    try {
      await leadsService.convertLead(convertingLead.id, {
        account_manager_id: selectedAM ? Number(selectedAM) : null,
        gstin: gstin.trim() || null
      });
      setNotice(`Lead "${convertingLead.title}" converted to active client!`);
      setTimeout(() => setNotice(''), 4500);
      setConvertModalOpen(false);
      fetchLeads();
    } catch (err) {
      console.error('Conversion error:', err);
      setError(err.response?.data?.message || 'Failed to convert lead.');
      setTimeout(() => setError(''), 4500);
    } finally {
      setIsConverting(false);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    setIsCreatingLead(true);
    try {
      await leadsService.createLead({
        ...newLeadForm,
        pipelineEntity: activePipeline,
        estimatedValue: newLeadForm.estimatedValue ? Number(newLeadForm.estimatedValue) : null
      });
      setNotice(`Lead "${newLeadForm.title}" added to ${activePipeline} pipeline!`);
      setTimeout(() => setNotice(''), 4500);
      setNewLeadModalOpen(false);
      setNewLeadForm({
        title: '',
        company_name: '',
        contact_name: '',
        email: '',
        phone: '',
        estimatedValue: '',
        stage: 'New'
      });
      fetchLeads();
    } catch (err) {
      console.error('Lead creation error:', err);
      setError(err.response?.data?.message || 'Failed to create lead.');
      setTimeout(() => setError(''), 4500);
    } finally {
      setIsCreatingLead(false);
    }
  };

  const formatCurrency = (val) => {
    if (!val) return '—';
    return `₹${Number(val).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>Business Development</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            3 Separate BD Pipelines
          </h1>
          <p className="text-sm text-slate-500">
            Dedicated deal pipelines for D-Grow (General), MedGrowDigi (Healthcare), and Mediqora (SaaS)
          </p>
        </div>

        {canManageLeads && (
          <button
            onClick={() => setNewLeadModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-md shadow-brand-700/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Deal / Lead</span>
          </button>
        )}
      </div>

      {/* Notice / Error banners */}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Pipeline Switcher Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PIPELINES.map((p) => {
          const isActive = activePipeline === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActivePipeline(p.id)}
              className={`text-left p-4 rounded-2xl border transition ${
                isActive
                  ? 'border-brand-600 bg-brand-50/40 shadow-sm ring-1 ring-brand-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-bold ${isActive ? 'text-brand-900' : 'text-slate-800'}`}>
                  {p.label}
                </span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                )}
              </div>
              <p className="text-xs text-slate-500">{p.description}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-semibold text-slate-700">
          Viewing: <strong className="text-brand-800">{activePipeline} Pipeline Deals</strong> ({leads.length})
        </span>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
            className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-56"
          />
        </div>
      </div>

      {/* Leads Table */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-700" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Leads in {activePipeline}</h3>
          <p className="text-xs text-slate-500 mt-1">
            Capture new prospective deals or visits using the "Add Deal / Lead" button.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Deal Title & Company</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Est. Value</th>
                  <th className="py-3.5 px-4">Owner</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{l.title}</div>
                      {l.company_name && (
                        <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{l.company_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div>{l.contact_name || '—'}</div>
                      {l.phone && (
                        <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{l.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          l.stage === 'Won'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : l.stage === 'Lost'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {l.stage}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {formatCurrency(l.estimated_value)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {l.owner_name || 'Unassigned'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {l.stage !== 'Won' ? (
                        <button
                          onClick={() => handleOpenConvert(l)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Convert to Client</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                          Converted
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Convert to Client Modal */}
      {convertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Convert Deal to Active Client
              </h3>
              <button
                onClick={() => setConvertModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmConvert} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Converting <strong>{convertingLead?.title}</strong> will automatically mark this lead as{' '}
                <span className="text-emerald-700 font-bold">Won</span>, initialize a client account in lifecycle stage{' '}
                <span className="font-bold">L1 (Onboarding)</span>, and enable service bundling.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Assign Account Manager
                </label>
                <select
                  value={selectedAM}
                  onChange={(e) => setSelectedAM(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                >
                  <option value="">Select Account Manager...</option>
                  {accountManagers.map((am) => (
                    <option key={am.id} value={am.id}>
                      {am.name} ({am.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Client GSTIN (Optional)
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConvertModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
                >
                  {isConverting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm & Convert</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {newLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Add Deal to {activePipeline} Pipeline
              </h3>
              <button
                onClick={() => setNewLeadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Deal / Opportunity Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newLeadForm.title}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, title: e.target.value })}
                  placeholder="e.g. Apollo Hospital Annual SEO Contract"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Company / Clinic Name
                  </label>
                  <input
                    type="text"
                    value={newLeadForm.company_name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, company_name: e.target.value })}
                    placeholder="e.g. Apollo Hospital"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={newLeadForm.contact_name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, contact_name: e.target.value })}
                    placeholder="Dr. Shalini Gupta"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Estimated Deal Value (INR)
                  </label>
                  <input
                    type="number"
                    value={newLeadForm.estimatedValue}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, estimatedValue: e.target.value })}
                    placeholder="120000"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewLeadModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingLead}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition"
                >
                  {isCreatingLead && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Deal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

