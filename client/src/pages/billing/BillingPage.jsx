import React, { useState, useEffect } from 'react';
import { billingService, clientsService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import {
  FileText,
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Printer,
  Building2,
  Calendar,
  X,
  Trash2,
  RotateCcw,
  Check,
  Send,
  Eye,
  FileSpreadsheet,
  ChevronRight,
  TrendingUp,
  DollarSign
} from 'lucide-react';

export function BillingPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();

  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'quotations'
  const [stats, setStats] = useState({
    totalInvoices: 0,
    totalInvoiced: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    paidCount: 0,
    partiallyPaidCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    totalQuotations: 0,
    acceptedQuotes: 0,
    pendingQuotes: 0
  });

  const [invoices, setInvoices] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [documentModalUrl, setDocumentModalUrl] = useState(null);

  // Client Selection list
  const [clientsList, setClientsList] = useState([]);

  // Form states
  const [quotationForm, setQuotationForm] = useState({
    clientId: '',
    title: '',
    quotationDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    currency: 'INR',
    termsAndConditions: 'Payment due within 15 days upon issuance.',
    notes: '',
    items: [
      { item_description: 'Digital Marketing & Growth Retainer', quantity: 1, unitPrice: 25000, discountPercent: 0, taxRate: 18 }
    ]
  });

  const [invoiceForm, setInvoiceForm] = useState({
    clientId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    currency: 'INR',
    paymentTerms: 'Due upon receipt',
    notes: '',
    status: 'issued',
    items: [
      { item_description: 'Creative Design & Ad Deliverables', quantity: 1, unitPrice: 15000, discountPercent: 0, taxRate: 18 }
    ]
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer',
    transactionReference: '',
    notes: ''
  });

  const isClientUser = Boolean(user?.client_id);
  const canCreateQuotation = !isClientUser && hasPermission('quotations.create');
  const canCreateInvoice = !isClientUser && hasPermission('invoices.create');
  const canRecordPayment = !isClientUser && hasPermission('payments.record');

  useEffect(() => {
    fetchStats();
    if (activeTab === 'invoices') {
      fetchInvoices();
    } else {
      fetchQuotations();
    }
    if (!isClientUser) {
      loadClients();
    }
  }, [activeTab]);

  const loadClients = async () => {
    try {
      const res = await clientsService.getClients({ limit: 100 });
      setClientsList(res.data.clients || []);
    } catch (e) {
      console.error('Failed to load clients', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await billingService.getStats();
      setStats(res.data.stats || {});
    } catch (e) {
      console.error('Failed to load billing stats', e);
    }
  };

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const res = await billingService.listInvoices();
      setInvoices(res.data.invoices || []);
    } catch (err) {
      setError('Failed to load invoices');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuotations = async () => {
    setIsLoading(true);
    try {
      const res = await billingService.listQuotations();
      setQuotations(res.data.quotations || []);
    } catch (err) {
      setError('Failed to load quotations');
    } finally {
      setIsLoading(false);
    }
  };

  // Line item helpers
  const addItemToForm = (setter, form) => {
    setter({
      ...form,
      items: [
        ...form.items,
        { item_description: '', quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 18 }
      ]
    });
  };

  const updateItemInForm = (setter, form, index, field, value) => {
    const updated = [...form.items];
    updated[index] = { ...updated[index], [field]: value };
    setter({ ...form, items: updated });
  };

  const removeItemFromForm = (setter, form, index) => {
    if (form.items.length <= 1) return;
    const updated = form.items.filter((_, i) => i !== index);
    setter({ ...form, items: updated });
  };

  // Calculations
  const calculateFormTotals = (items) => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const disc = Number(item.discountPercent) || 0;
      const tx = Number(item.taxRate) || 0;

      const base = qty * price;
      const discAmt = base * (disc / 100);
      const taxable = base - discAmt;
      const txAmt = taxable * (tx / 100);

      subtotal += base;
      discount += discAmt;
      tax += txAmt;
    });
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((subtotal - discount + tax) * 100) / 100
    };
  };

  // Actions
  const handleCreateQuotation = async (e) => {
    e.preventDefault();
    try {
      await billingService.createQuotation(quotationForm);
      setIsQuotationModalOpen(false);
      fetchQuotations();
      fetchStats();
      setNotice('Quotation created successfully in Draft status.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create quotation');
    }
  };

  const handleIssueQuotation = async (id) => {
    try {
      await billingService.issueQuotation(id);
      fetchQuotations();
      fetchStats();
      setNotice('Quotation issued and published to Client Portal!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to issue quotation');
    }
  };

  const handleConvertQuotation = async (id) => {
    try {
      await billingService.convertQuotation(id);
      fetchQuotations();
      fetchStats();
      setNotice('Quotation converted to active Tax Invoice successfully!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to convert quotation');
    }
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    try {
      await billingService.createInvoice(invoiceForm);
      setIsInvoiceModalOpen(false);
      fetchInvoices();
      fetchStats();
      setNotice('Tax Invoice created successfully.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create invoice');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;
    try {
      await billingService.recordPayment(selectedInvoiceForPayment.id, paymentForm);
      setIsPaymentModalOpen(false);
      setSelectedInvoiceForPayment(null);
      setPaymentForm({
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        transactionReference: '',
        notes: ''
      });
      fetchInvoices();
      fetchStats();
      setNotice('Payment recorded and applied against invoice successfully!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment');
    }
  };

  const handleOpenPaymentModal = (inv) => {
    setSelectedInvoiceForPayment(inv);
    setPaymentForm({
      amount: inv.outstanding_balance,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'bank_transfer',
      transactionReference: '',
      notes: ''
    });
    setIsPaymentModalOpen(true);
  };

  const handlePrintDocument = (type, id) => {
    const url = billingService.getDocumentUrl(type, id);
    window.open(url, '_blank');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'partially_paid':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'issued':
      case 'sent':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'accepted':
      case 'converted':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'overdue':
      case 'rejected':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'draft':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'void':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const quoteTotals = calculateFormTotals(quotationForm.items);
  const invTotals = calculateFormTotals(invoiceForm.items);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Quotations, Invoices & Payments</h1>
              <p className="text-xs text-slate-500">Manage financial quotes, tax invoices, and verified receipts</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCreateQuotation && (
            <button
              onClick={() => setIsQuotationModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4 text-[#047857]" />
              <span>New Quotation</span>
            </button>
          )}

          {canCreateInvoice && (
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="px-4 py-2 bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Invoice</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Invoiced</span>
          <p className="text-xl font-extrabold text-slate-900">₹ {Number(stats.totalInvoiced || 0).toLocaleString()}</p>
          <span className="text-[10px] text-slate-400 font-medium">{stats.totalInvoices || 0} issued invoices</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Collected</span>
          <p className="text-xl font-extrabold text-emerald-700">₹ {Number(stats.totalCollected || 0).toLocaleString()}</p>
          <span className="text-[10px] text-emerald-600 font-medium">{stats.paidCount || 0} fully settled</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Outstanding Balance</span>
          <p className="text-xl font-extrabold text-rose-700">₹ {Number(stats.totalOutstanding || 0).toLocaleString()}</p>
          <span className="text-[10px] text-rose-600 font-medium">{stats.overdueCount || 0} overdue invoices</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Active Quotations</span>
          <p className="text-xl font-extrabold text-indigo-700">{stats.totalQuotations || 0}</p>
          <span className="text-[10px] text-indigo-600 font-medium">{stats.acceptedQuotes || 0} accepted by clients</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-3 px-1 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'invoices'
                ? 'border-[#047857] text-[#047857]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Tax Invoices ({invoices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('quotations')}
            className={`pb-3 px-1 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'quotations'
                ? 'border-[#047857] text-[#047857]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Quotations & Estimates ({quotations.length})</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: INVOICES TABLE */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No Invoices Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No invoices recorded yet. Convert an accepted quotation or create a standalone invoice.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {inv.client_company_name || inv.client_name}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(inv.invoice_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(inv.due_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ₹ {Number(inv.total_amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        ₹ {Number(inv.amount_paid).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-700">
                        ₹ {Number(inv.outstanding_balance).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getStatusBadge(inv.status)}`}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handlePrintDocument('invoice', inv.id)}
                          title="Print Document"
                          className="p-1.5 text-slate-500 hover:text-[#047857] hover:bg-emerald-50 rounded-lg transition"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {canRecordPayment && Number(inv.outstanding_balance) > 0 && inv.status !== 'void' && (
                          <button
                            onClick={() => handleOpenPaymentModal(inv)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#047857] rounded-lg font-bold text-[11px] transition"
                          >
                            Record Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: QUOTATIONS TABLE */}
      {activeTab === 'quotations' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading quotations...</div>
          ) : quotations.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No Quotations Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No quotations have been prepared yet. Click "New Quotation" to draft one.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Quotation #</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Expiry</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {q.quotation_number}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {q.client_company_name || q.client_name}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {q.title}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(q.quotation_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(q.expiry_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ₹ {Number(q.total_amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getStatusBadge(q.status)}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handlePrintDocument('quotation', q.id)}
                          title="Print Document"
                          className="p-1.5 text-slate-500 hover:text-[#047857] hover:bg-emerald-50 rounded-lg transition"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {!isClientUser && q.status === 'draft' && (
                          <button
                            onClick={() => handleIssueQuotation(q.id)}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-bold text-[11px] transition"
                          >
                            Issue
                          </button>
                        )}

                        {!isClientUser && q.status === 'accepted' && (
                          <button
                            onClick={() => handleConvertQuotation(q.id)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#047857] rounded-lg font-bold text-[11px] transition"
                          >
                            Convert to Invoice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CREATE QUOTATION */}
      {isQuotationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Draft New Quotation</h3>
              <button onClick={() => setIsQuotationModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Client *</label>
                  <select
                    required
                    value={quotationForm.clientId}
                    onChange={(e) => setQuotationForm({ ...quotationForm, clientId: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="">-- Select Client --</option>
                    {clientsList.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name || c.name} ({c.client_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quotation Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., SEO & Performance Retainer Q4"
                    value={quotationForm.title}
                    onChange={(e) => setQuotationForm({ ...quotationForm, title: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quotation Date *</label>
                  <input
                    type="date"
                    required
                    value={quotationForm.quotationDate}
                    onChange={(e) => setQuotationForm({ ...quotationForm, quotationDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={quotationForm.expiryDate}
                    onChange={(e) => setQuotationForm({ ...quotationForm, expiryDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Line Items Builder */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Line Items</span>
                  <button
                    type="button"
                    onClick={() => addItemToForm(setQuotationForm, quotationForm)}
                    className="text-xs font-bold text-[#047857] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {quotationForm.items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Item description..."
                        value={item.item_description}
                        onChange={(e) => updateItemInForm(setQuotationForm, quotationForm, idx, 'item_description', e.target.value)}
                        className="flex-1 text-xs p-2 rounded-lg border border-slate-200 bg-white"
                      />
                      {quotationForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemFromForm(setQuotationForm, quotationForm, idx)}
                          className="p-1 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400">Qty</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.quantity}
                          onChange={(e) => updateItemInForm(setQuotationForm, quotationForm, idx, 'quantity', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Unit Price (₹)</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.unitPrice}
                          onChange={(e) => updateItemInForm(setQuotationForm, quotationForm, idx, 'unitPrice', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Disc %</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.discountPercent}
                          onChange={(e) => updateItemInForm(setQuotationForm, quotationForm, idx, 'discountPercent', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Tax %</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.taxRate}
                          onChange={(e) => updateItemInForm(setQuotationForm, quotationForm, idx, 'taxRate', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between text-xs font-semibold">
                <span>Subtotal: ₹ {quoteTotals.subtotal.toLocaleString()}</span>
                <span>Tax: ₹ {quoteTotals.tax.toLocaleString()}</span>
                <span className="font-bold text-[#047857]">Grand Total: ₹ {quoteTotals.total.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuotationModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#047857] hover:bg-[#065f46] rounded-xl shadow-sm"
                >
                  Save Draft Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE INVOICE */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Generate Standalone Tax Invoice</h3>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Client *</label>
                  <select
                    required
                    value={invoiceForm.clientId}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, clientId: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="">-- Select Client --</option>
                    {clientsList.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name || c.name} ({c.client_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={invoiceForm.status}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="issued">Issued</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.invoiceDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Line Items</span>
                  <button
                    type="button"
                    onClick={() => addItemToForm(setInvoiceForm, invoiceForm)}
                    className="text-xs font-bold text-[#047857] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {invoiceForm.items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Item description..."
                        value={item.item_description}
                        onChange={(e) => updateItemInForm(setInvoiceForm, invoiceForm, idx, 'item_description', e.target.value)}
                        className="flex-1 text-xs p-2 rounded-lg border border-slate-200 bg-white"
                      />
                      {invoiceForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemFromForm(setInvoiceForm, invoiceForm, idx)}
                          className="p-1 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400">Qty</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.quantity}
                          onChange={(e) => updateItemInForm(setInvoiceForm, invoiceForm, idx, 'quantity', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Unit Price (₹)</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.unitPrice}
                          onChange={(e) => updateItemInForm(setInvoiceForm, invoiceForm, idx, 'unitPrice', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Disc %</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.discountPercent}
                          onChange={(e) => updateItemInForm(setInvoiceForm, invoiceForm, idx, 'discountPercent', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Tax %</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.taxRate}
                          onChange={(e) => updateItemInForm(setInvoiceForm, invoiceForm, idx, 'taxRate', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between text-xs font-semibold">
                <span>Subtotal: ₹ {invTotals.subtotal.toLocaleString()}</span>
                <span>Tax: ₹ {invTotals.tax.toLocaleString()}</span>
                <span className="font-bold text-[#047857]">Grand Total: ₹ {invTotals.total.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#047857] hover:bg-[#065f46] rounded-xl shadow-sm"
                >
                  Generate Tax Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD PAYMENT */}
      {isPaymentModalOpen && selectedInvoiceForPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Record Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="py-4 space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedInvoiceForPayment.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Amount:</span>
                  <span className="font-bold text-slate-800">₹ {Number(selectedInvoiceForPayment.total_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>Outstanding Balance:</span>
                  <span>₹ {Number(selectedInvoiceForPayment.outstanding_balance).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={selectedInvoiceForPayment.outstanding_balance}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Method *</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Ref / Cheque #</label>
                <input
                  type="text"
                  placeholder="E.g., UTR / IMPS ref # / Bank Txn ID"
                  value={paymentForm.transactionReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm"
                >
                  Confirm & Apply Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingPage;
