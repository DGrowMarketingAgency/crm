import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  Calendar,
  CreditCard,
  TrendingUp,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Download,
  Eye,
  FileText,
  UserCheck,
  Building,
  Briefcase,
  ChevronRight,
  Shield,
  DollarSign,
  Coffee,
  Check,
  X,
  RefreshCw,
  Printer
} from 'lucide-react';
import { hrService, departmentsService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';

export function HRHubPage() {
  const { user } = useAuth();
  const { hasPermission, isOwner } = usePermission();

  // Active top-level Tab
  // 'overview' | 'employees' | 'attendance' | 'leave' | 'payroll' | 'payslips' | 'performance'
  const [activeTab, setActiveTab] = useState('overview');

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Data states
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [teamAttendance, setTeamAttendance] = useState([]);
  const [attendanceCorrections, setAttendanceCorrections] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [salaryComponents, setSalaryComponents] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [myPayslips, setMyPayslips] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [performanceSummary, setPerformanceSummary] = useState(null);

  // Modals & Drawers
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showNewPayrollModal, setShowNewPayrollModal] = useState(false);
  const [selectedPayrollRun, setSelectedPayrollRun] = useState(null);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [showSalaryAssignModal, setShowSalaryAssignModal] = useState(false);

  // Form states
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    halfDaySession: 'first_half',
    reason: ''
  });

  const [correctionForm, setCorrectionForm] = useState({
    attendanceDate: new Date().toISOString().split('T')[0],
    requestedCheckIn: '10:00:00',
    requestedCheckOut: '19:00:00',
    reason: ''
  });

  const [payrollForm, setPayrollForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: ''
  });

  const [salaryForm, setSalaryForm] = useState({
    userId: '',
    grossBaseSalary: '',
    netMonthlySalary: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    basic: '',
    hra: '',
    specialAllowance: ''
  });

  const [empSearch, setEmpSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const isHRAdmin =
    Boolean(
      isOwner ||
        user?.isOwner ||
        hasPermission?.('hr.employees.manage') ||
        hasPermission?.('hr.payroll.manage') ||
        user?.role === 'hr-admin' ||
        user?.role === 'admin' ||
        user?.role === 'owner'
    );

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 5000);
  };

  // Initial Data Fetch
  useEffect(() => {
    fetchInitialData();
  }, [activeTab]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const [dashRes, todayRes, balRes] = await Promise.all([
          hrService.getDashboard().catch(() => ({ data: { data: null } })),
          hrService.getTodayAttendance().catch(() => ({ data: { data: null } })),
          hrService.getLeaveBalances().catch(() => ({ data: { data: [] } }))
        ]);
        setDashboardMetrics(dashRes.data.data);
        setTodayAttendance(todayRes.data.data);
        setLeaveBalances(balRes.data.data || []);
      } else if (activeTab === 'employees') {
        const [empRes, deptRes] = await Promise.all([
          hrService.getEmployees({ search: empSearch, departmentId: deptFilter }),
          departmentsService.getAll()
        ]);
        setEmployees(empRes.data.data || []);
        setDepartments(deptRes.data.data || []);
      } else if (activeTab === 'attendance') {
        const [todayRes, histRes, corrRes] = await Promise.all([
          hrService.getTodayAttendance().catch(() => ({ data: { data: null } })),
          hrService.getAttendanceHistory().catch(() => ({ data: { data: [] } })),
          hrService.getAttendanceCorrections().catch(() => ({ data: { data: [] } }))
        ]);
        setTodayAttendance(todayRes.data.data);
        setAttendanceHistory(histRes.data.data || []);
        setAttendanceCorrections(corrRes.data.data || []);
        if (isHRAdmin) {
          const teamRes = await hrService.getTeamAttendance().catch(() => ({ data: { data: [] } }));
          setTeamAttendance(teamRes.data.data || []);
        }
      } else if (activeTab === 'leave') {
        const [typeRes, balRes, reqRes] = await Promise.all([
          hrService.getLeaveTypes(),
          hrService.getLeaveBalances(),
          hrService.getLeaveRequests()
        ]);
        setLeaveTypes(typeRes.data.data || []);
        setLeaveBalances(balRes.data.data || []);
        setLeaveRequests(reqRes.data.data || []);
      } else if (activeTab === 'payroll') {
        if (isHRAdmin) {
          const [runsRes, compRes] = await Promise.all([
            hrService.getPayrollRuns(),
            hrService.getSalaryComponents()
          ]);
          setPayrollRuns(runsRes.data.data || []);
          setSalaryComponents(compRes.data.data || []);
        }
        const slipsRes = await hrService.getMyPayslips().catch(() => ({ data: { data: [] } }));
        setMyPayslips(slipsRes.data.data || []);
      } else if (activeTab === 'payslips') {
        const slipsRes = await hrService.getMyPayslips().catch(() => ({ data: { data: [] } }));
        setMyPayslips(slipsRes.data.data || []);
      } else if (activeTab === 'performance') {
        const perfRes = await hrService.getEmployeePerformance(user.id);
        setPerformanceSummary(perfRes.data.data);
      }
    } catch (error) {
      console.error('HR fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check-In Handler
  const handleCheckIn = async () => {
    try {
      const res = await hrService.checkIn({ notes: 'Web portal check-in' });
      setTodayAttendance(res.data.data);
      showFeedback('success', 'Checked in successfully!');
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Check-in failed');
    }
  };

  // Check-Out Handler
  const handleCheckOut = async () => {
    try {
      const res = await hrService.checkOut({ notes: 'Web portal check-out' });
      setTodayAttendance(res.data.data);
      showFeedback('success', 'Checked out successfully! Total working duration recorded.');
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Check-out failed');
    }
  };

  // Submit Leave Application
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    try {
      await hrService.applyLeave({
        ...leaveForm,
        leaveTypeId: Number(leaveForm.leaveTypeId)
      });
      showFeedback('success', 'Leave application submitted successfully for manager approval');
      setShowApplyLeaveModal(false);
      setLeaveForm({
        leaveTypeId: '',
        startDate: '',
        endDate: '',
        isHalfDay: false,
        halfDaySession: 'first_half',
        reason: ''
      });
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Leave application failed');
    }
  };

  // Review Leave
  const handleReviewLeave = async (id, status) => {
    try {
      await hrService.reviewLeave(id, { status, reviewNotes: `Reviewed by ${user.name}` });
      showFeedback('success', `Leave request marked as ${status}`);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Review failed');
    }
  };

  // Cancel Leave
  const handleCancelLeave = async (id) => {
    try {
      await hrService.cancelLeave(id);
      showFeedback('success', 'Leave request cancelled and quota restored');
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Cancellation failed');
    }
  };

  // Submit Attendance Correction
  const handleApplyCorrection = async (e) => {
    e.preventDefault();
    try {
      await hrService.requestAttendanceCorrection({
        attendanceDate: correctionForm.attendanceDate,
        requestedCheckIn: `${correctionForm.attendanceDate} ${correctionForm.requestedCheckIn}`,
        requestedCheckOut: `${correctionForm.attendanceDate} ${correctionForm.requestedCheckOut}`,
        reason: correctionForm.reason
      });
      showFeedback('success', 'Attendance correction request submitted to HR');
      setShowCorrectionModal(false);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Submission failed');
    }
  };

  // Review Attendance Correction
  const handleReviewCorrection = async (id, status) => {
    try {
      await hrService.reviewAttendanceCorrection(id, {
        status,
        reviewNotes: `Correction ${status} by ${user.name}`
      });
      showFeedback('success', `Correction request ${status}`);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Review failed');
    }
  };

  // Create Payroll Run
  const handleCreatePayrollRun = async (e) => {
    e.preventDefault();
    try {
      await hrService.createPayrollRun({
        month: Number(payrollForm.month),
        year: Number(payrollForm.year),
        notes: payrollForm.notes
      });
      showFeedback('success', 'Monthly payroll run generated in draft state');
      setShowNewPayrollModal(false);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Payroll run creation failed');
    }
  };

  // Update Payroll Lifecycle Status
  const handleUpdatePayrollStatus = async (runId, newStatus) => {
    try {
      const payload = { status: newStatus };
      if (newStatus === 'paid') {
        payload.paymentDate = new Date().toISOString().split('T')[0];
        payload.paymentReference = `NEFT-DGROW-${Date.now().toString().slice(-6)}`;
      }
      const res = await hrService.updatePayrollStatus(runId, payload);
      setSelectedPayrollRun(res.data.data);
      showFeedback('success', `Payroll run status advanced to ${newStatus}`);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Status update failed');
    }
  };

  // Save Salary Structure
  const handleSaveSalary = async (e) => {
    e.preventDefault();
    try {
      await hrService.assignSalary(salaryForm.userId, {
        grossBaseSalary: Number(salaryForm.grossBaseSalary),
        netMonthlySalary: Number(salaryForm.netMonthlySalary),
        effectiveFrom: salaryForm.effectiveFrom,
        componentsJson: {
          basic: Number(salaryForm.basic || 0),
          hra: Number(salaryForm.hra || 0),
          special_allowance: Number(salaryForm.specialAllowance || 0)
        }
      });
      showFeedback('success', 'Salary structure assigned successfully');
      setShowSalaryAssignModal(false);
      fetchInitialData();
    } catch (error) {
      showFeedback('error', error.response?.data?.error?.message || 'Salary assignment failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* HEADER & TOP NAVIGATION TABS */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white flex items-center justify-center shadow-md shadow-brand-500/20">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">HR & Workforce Operations</h1>
              <p className="text-xs text-slate-500">
                Attendance kiosk, leave applications, employee directory, and automated payroll runs.
              </p>
            </div>
          </div>

          {/* Quick Status / Clock-in pill */}
          <div className="flex items-center gap-2">
            {todayAttendance?.check_in_time ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  Checked In at {new Date(todayAttendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!todayAttendance.check_out_time ? (
                  <button
                    onClick={handleCheckOut}
                    className="ml-2 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold transition shadow-xs"
                  >
                    Check Out
                  </button>
                ) : (
                  <span className="text-slate-500 ml-1 font-normal">(Shift Completed)</span>
                )}
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-brand-500/25"
              >
                <Clock className="w-4 h-4" />
                <span>Check In Now</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback Toast */}
        {feedback.message && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-6 border-b border-slate-200/80 overflow-x-auto text-xs font-medium">
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'employees', label: 'Employee Directory', icon: Users },
            { id: 'attendance', label: 'Attendance Kiosk', icon: Clock },
            { id: 'leave', label: 'Leave Management', icon: Calendar },
            { id: 'payroll', label: 'Payroll & Compensation', icon: CreditCard },
            { id: 'payslips', label: 'My Payslips', icon: FileText },
            { id: 'performance', label: 'Performance Records', icon: UserCheck }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
                  isActive
                    ? 'border-brand-600 text-brand-700 font-bold bg-brand-50/40 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW & DASHBOARD */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Workforce</span>
                <Users className="w-4 h-4 text-brand-600" />
              </div>
              <p className="text-2xl font-bold text-slate-800">{dashboardMetrics?.activeEmployees || 0}</p>
              <span className="text-[11px] text-slate-400">Total onboarded staff</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Present Today</span>
                <Clock className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-slate-800">{dashboardMetrics?.todayAttendance?.present || 0}</p>
              <span className="text-[11px] text-emerald-600 font-medium">
                {dashboardMetrics?.todayAttendance?.late || 0} late arrivals
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Leave</span>
                <Calendar className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {dashboardMetrics?.pendingApprovals?.leaveRequests || 0}
              </p>
              <span className="text-[11px] text-amber-600 font-medium">Awaiting manager approval</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Current Payroll</span>
                <DollarSign className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {dashboardMetrics?.currentPayroll?.status?.toUpperCase() || 'NOT STARTED'}
              </p>
              <span className="text-[11px] text-slate-400">
                {dashboardMetrics?.currentPayroll?.run_code || 'Ready for generation'}
              </span>
            </div>
          </div>

          {/* Quick Leave Quota Grid */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">My Leave Quota & Balances</h3>
                <p className="text-xs text-slate-400">Current annual entitlement and available usage</p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('leave');
                  setShowApplyLeaveModal(true);
                }}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Apply Leave</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {leaveBalances.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 col-span-full border border-dashed border-slate-200 rounded-xl">
                  No leave quotas or balance policies assigned for this period.
                </div>
              ) : (
                leaveBalances.map((bal) => (
                  <div key={bal.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      {bal.name} ({bal.code})
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-extrabold text-brand-700">
                        {Number(bal.available_balance || 0).toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">/ {Number(bal.opening_balance || 0).toFixed(0)} days</span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
                      <span>Used: {Number(bal.used || 0).toFixed(1)}</span>
                      <span className={bal.is_paid ? 'text-emerald-600' : 'text-slate-400'}>
                        {bal.is_paid ? 'Paid' : 'Unpaid (LWP)'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: EMPLOYEE DIRECTORY */}
      {/* ========================================================= */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by name, email, employee ID..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchInitialData()}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  fetchInitialData();
                }}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-600"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Employee Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Emp ID</th>
                  <th className="p-3.5">Department & Role</th>
                  <th className="p-3.5">Employment</th>
                  <th className="p-3.5">Reporting Manager</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-xs text-slate-400">
                      No employee records found matching current filters.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-200/80 flex items-center justify-center font-bold text-xs">
                            {emp.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{emp.name}</p>
                            <p className="text-[10px] text-slate-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-[11px] font-semibold text-slate-700">
                        {emp.employee_id || `DG-EMP-${String(emp.id).padStart(4, '0')}`}
                      </td>
                      <td className="p-3.5">
                        <p className="font-medium text-slate-800">{emp.department_name || 'General'}</p>
                        <p className="text-[10px] text-slate-400">
                          {emp.designations?.join(', ') || emp.roles?.join(', ')}
                        </p>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                          {emp.employment_status || 'Active'}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5 capitalize">
                          {(emp.employment_type || 'Full Time').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {emp.reporting_manager_name || <span className="text-slate-400 italic">None assigned</span>}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={async () => {
                              const res = await hrService.getEmployeeProfile(emp.id);
                              setSelectedProfile(res.data.data);
                            }}
                            className="p-1 text-slate-400 hover:text-brand-600 rounded transition"
                            title="View Profile Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isHRAdmin && (
                            <button
                              onClick={() => {
                                setSalaryForm((prev) => ({
                                  ...prev,
                                  userId: emp.id,
                                  grossBaseSalary: emp.currentSalary?.gross_base_salary || '',
                                  netMonthlySalary: emp.currentSalary?.net_monthly_salary || ''
                                }));
                                setShowSalaryAssignModal(true);
                              }}
                              className="p-1 text-slate-400 hover:text-purple-600 rounded transition"
                              title="Assign Salary Structure"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ATTENDANCE KIOSK */}
      {/* ========================================================= */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Today's Kiosk Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center font-bold">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Attendance Terminal</h3>
                <p className="text-xs text-slate-400">
                  Standard Shift: 10:00 AM - 07:00 PM IST · 15-minute grace period enforced
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span>
                    Status:{' '}
                    <strong className="capitalize text-slate-800">
                      {todayAttendance ? todayAttendance.status : 'Not Checked In'}
                    </strong>
                  </span>
                  {todayAttendance?.total_working_hours > 0 && (
                    <span>
                      Duration Worked: <strong>{todayAttendance.total_working_hours} hrs</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!todayAttendance?.check_in_time ? (
                <button
                  onClick={handleCheckIn}
                  className="px-6 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition active:scale-95"
                >
                  Record Check In
                </button>
              ) : !todayAttendance.check_out_time ? (
                <button
                  onClick={handleCheckOut}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition active:scale-95"
                >
                  Record Check Out
                </button>
              ) : (
                <div className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-semibold">
                  Shift Completed
                </div>
              )}
              <button
                onClick={() => setShowCorrectionModal(true)}
                className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition"
              >
                Request Correction
              </button>
            </div>
          </div>

          {/* Attendance History */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Attendance Logs</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-[11px] text-slate-500 uppercase">
                  <tr>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Check In</th>
                    <th className="p-3.5">Check Out</th>
                    <th className="p-3.5">Total Hours</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-xs text-slate-400">
                        No attendance records logged for this account.
                      </td>
                    </tr>
                  ) : (
                    attendanceHistory.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-medium text-slate-800">{rec.attendance_date}</td>
                      <td className="p-3.5 font-mono text-[11px]">
                        {rec.check_in_time
                          ? new Date(rec.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="p-3.5 font-mono text-[11px]">
                        {rec.check_out_time
                          ? new Date(rec.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700">{rec.total_working_hours} hrs</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            rec.status === 'present'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : rec.status === 'late'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : rec.status === 'on_leave'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 italic truncate max-w-xs">{rec.notes || '—'}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: LEAVE MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Action Row */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Leave Applications & Approvals</h3>
              <p className="text-xs text-slate-400">View and manage time-off requests</p>
            </div>
            <button
              onClick={() => setShowApplyLeaveModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-brand-500/20 hover:from-brand-500 hover:to-brand-600 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Leave</span>
            </button>
          </div>

          {/* Leave Requests Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
                  <tr>
                    <th className="p-3.5">Employee</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Dates</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Reason</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-xs text-slate-400">
                        No leave requests submitted yet.
                      </td>
                    </tr>
                  ) : (
                    leaveRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-bold text-slate-800">{req.user_name || user.name}</td>
                      <td className="p-3.5 font-medium text-brand-700">{req.leave_type_name}</td>
                      <td className="p-3.5">
                        {req.start_date} to {req.end_date}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700">{req.duration_days} day(s)</td>
                      <td className="p-3.5 text-slate-600 max-w-xs truncate">{req.reason}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            req.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : req.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {req.status === 'pending' && isHRAdmin && (
                            <>
                              <button
                                onClick={() => handleReviewLeave(req.id, 'approved')}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                title="Approve Leave"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReviewLeave(req.id, 'rejected')}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                title="Reject Leave"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {req.status === 'pending' && req.user_id === user.id && (
                            <button
                              onClick={() => handleCancelLeave(req.id)}
                              className="px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50 rounded font-medium border border-rose-200"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: PAYROLL & COMPENSATION */}
      {/* ========================================================= */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Monthly Agency Payroll Runs</h3>
              <p className="text-xs text-slate-400">
                Automated monthly salary calculation based on attendance, approved leave, and salary structures
              </p>
            </div>
            {isHRAdmin && (
              <button
                onClick={() => setShowNewPayrollModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-brand-500/20 transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Payroll Run</span>
              </button>
            )}
          </div>

          {/* Payroll Runs Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
                  <tr>
                    <th className="p-3.5">Run Code</th>
                    <th className="p-3.5">Period</th>
                    <th className="p-3.5">Staff Count</th>
                    <th className="p-3.5">Gross Payroll</th>
                    <th className="p-3.5">Deductions</th>
                    <th className="p-3.5">Net Payable</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollRuns.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-xs text-slate-400">
                        No payroll runs generated yet. Use "Create Payroll Run" to initiate a pay cycle.
                      </td>
                    </tr>
                  ) : (
                    payrollRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono text-[11px] font-bold text-slate-800">{run.run_code}</td>
                      <td className="p-3.5">
                        {run.month}/{run.year}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700">{run.total_employees} staff</td>
                      <td className="p-3.5">₹{Number(run.gross_total).toLocaleString()}</td>
                      <td className="p-3.5 text-rose-600 font-medium">₹{Number(run.total_deductions).toLocaleString()}</td>
                      <td className="p-3.5 font-bold text-brand-700">₹{Number(run.net_total).toLocaleString()}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            run.status === 'finalized'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : run.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : run.status === 'approved'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={async () => {
                            const res = await hrService.getPayrollRunDetails(run.id);
                            setSelectedPayrollRun(res.data.data);
                          }}
                          className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                        >
                          Inspect Run
                        </button>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: MY PAYSLIPS */}
      {/* ========================================================= */}
      {activeTab === 'payslips' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Historical Payslips</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
                <tr>
                  <th className="p-3.5">Slip Number</th>
                  <th className="p-3.5">Month/Year</th>
                  <th className="p-3.5">Gross Earnings</th>
                  <th className="p-3.5">Deductions</th>
                  <th className="p-3.5">Net Disbursed</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myPayslips.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-xs text-slate-400">
                      No finalized payslips available for this account.
                    </td>
                  </tr>
                ) : (
                  myPayslips.map((ps) => (
                  <tr key={ps.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 font-mono text-[11px] font-bold text-slate-800">{ps.payslip_number}</td>
                    <td className="p-3.5 font-semibold text-slate-700">
                      {ps.month}/{ps.year}
                    </td>
                    <td className="p-3.5">₹{Number(ps.gross_earnings).toLocaleString()}</td>
                    <td className="p-3.5 text-rose-600 font-medium">₹{Number(ps.total_deductions).toLocaleString()}</td>
                    <td className="p-3.5 font-bold text-brand-700">₹{Number(ps.net_payable).toLocaleString()}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={async () => {
                          const res = await hrService.getPayslip(ps.id);
                          setSelectedPayslip(res.data.data);
                        }}
                        className="px-3 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg text-xs font-semibold hover:bg-brand-100 transition flex items-center gap-1 inline-flex"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>View Payslip</span>
                      </button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: PERFORMANCE SUMMARY */}
      {/* ========================================================= */}
      {activeTab === 'performance' && (
        !performanceSummary ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center text-xs text-slate-400">
            No performance summary records found for this employee account.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Tasks Completed
                </span>
                <p className="text-3xl font-extrabold text-slate-800">
                  {performanceSummary.taskMetrics?.completed} / {performanceSummary.taskMetrics?.totalAssigned}
                </p>
                <div className="mt-2 text-xs text-slate-500">
                  Completion Rate: <strong>{performanceSummary.taskMetrics?.completionRate}%</strong>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Deliverable Quality
                </span>
                <p className="text-3xl font-extrabold text-emerald-600">
                  {performanceSummary.deliverableMetrics?.approved} Approved
                </p>
                <div className="mt-2 text-xs text-slate-500">
                  Revisions requested: {performanceSummary.deliverableMetrics?.revisions}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Time Logged (30 Days)
                </span>
                <p className="text-3xl font-extrabold text-brand-700">
                  {performanceSummary.timeLoggedLast30DaysHours} hrs
                </p>
                <div className="mt-2 text-xs text-slate-500">Verified working entries</div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ========================================================= */}
      {/* MODAL: APPLY LEAVE */}
      {/* ========================================================= */}
      {showApplyLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Apply for Leave</h3>
              <button onClick={() => setShowApplyLeaveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleApplyLeave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type *</label>
                <select
                  required
                  value={leaveForm.leaveTypeId}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leaveTypeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select type...</option>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.is_paid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the reason for leave..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-xs font-bold hover:from-brand-500 hover:to-brand-600 shadow-xs"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ATTENDANCE CORRECTION */}
      {/* ========================================================= */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Request Attendance Correction</h3>
              <button onClick={() => setShowCorrectionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleApplyCorrection} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={correctionForm.attendanceDate}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, attendanceDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Check In *</label>
                  <input
                    type="time"
                    step="1"
                    required
                    value={correctionForm.requestedCheckIn}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckIn: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Check Out *</label>
                  <input
                    type="time"
                    step="1"
                    required
                    value={correctionForm.requestedCheckOut}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckOut: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why correction is required..."
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-xs font-bold hover:from-brand-500 hover:to-brand-600 shadow-xs"
                >
                  Submit Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NEW PAYROLL RUN */}
      {/* ========================================================= */}
      {showNewPayrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Generate Monthly Payroll Run</h3>
              <button onClick={() => setShowNewPayrollModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreatePayrollRun} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Month (1-12) *</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={payrollForm.month}
                    onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Year *</label>
                  <input
                    type="number"
                    min="2024"
                    max="2030"
                    required
                    value={payrollForm.year}
                    onChange={(e) => setPayrollForm({ ...payrollForm, year: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional internal remarks for this payroll batch..."
                  value={payrollForm.notes}
                  onChange={(e) => setPayrollForm({ ...payrollForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPayrollModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-xs font-bold hover:from-brand-500 hover:to-brand-600 shadow-xs"
                >
                  Calculate & Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DRAWER: INSPECT PAYROLL RUN */}
      {/* ========================================================= */}
      {selectedPayrollRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Payroll Run: {selectedPayrollRun.run_code} ({selectedPayrollRun.month}/{selectedPayrollRun.year})
                </h3>
                <p className="text-xs text-slate-400 capitalize">Current Status: {selectedPayrollRun.status}</p>
              </div>
              <button onClick={() => setSelectedPayrollRun(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-center">
                <div>
                  <span className="text-slate-400 block">Gross Total</span>
                  <strong className="text-slate-800 text-sm">₹{Number(selectedPayrollRun.gross_total).toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Deductions</span>
                  <strong className="text-rose-600 text-sm">₹{Number(selectedPayrollRun.total_deductions).toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Net Disbursed</span>
                  <strong className="text-brand-700 text-sm">₹{Number(selectedPayrollRun.net_total).toLocaleString()}</strong>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                    <tr>
                      <th className="p-2.5">Staff Name</th>
                      <th className="p-2.5">Base</th>
                      <th className="p-2.5">Present</th>
                      <th className="p-2.5">LWP Days</th>
                      <th className="p-2.5">Deductions</th>
                      <th className="p-2.5">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPayrollRun.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2.5 font-bold text-slate-800">{item.name}</td>
                        <td className="p-2.5">₹{Number(item.base_salary).toLocaleString()}</td>
                        <td className="p-2.5">{item.days_present} d</td>
                        <td className="p-2.5 text-rose-500">{item.unpaid_leave_days} d</td>
                        <td className="p-2.5 text-rose-600">₹{Number(item.total_deductions).toLocaleString()}</td>
                        <td className="p-2.5 font-bold text-brand-700">₹{Number(item.net_pay).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lifecycle Buttons */}
            {isHRAdmin && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
                <span className="text-xs text-slate-500 font-medium capitalize">Status: {selectedPayrollRun.status}</span>
                <div className="flex gap-2">
                  {selectedPayrollRun.status === 'draft' && (
                    <button
                      onClick={() => handleUpdatePayrollStatus(selectedPayrollRun.id, 'pending_approval')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Submit for Approval
                    </button>
                  )}
                  {selectedPayrollRun.status === 'pending_approval' && (
                    <button
                      onClick={() => handleUpdatePayrollStatus(selectedPayrollRun.id, 'approved')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Approve Run
                    </button>
                  )}
                  {selectedPayrollRun.status === 'approved' && (
                    <button
                      onClick={() => handleUpdatePayrollStatus(selectedPayrollRun.id, 'finalized')}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Finalize & Generate Payslips
                    </button>
                  )}
                  {selectedPayrollRun.status === 'finalized' && (
                    <button
                      onClick={() => handleUpdatePayrollStatus(selectedPayrollRun.id, 'paid')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PAYSLIP VIEWER */}
      {/* ========================================================= */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold tracking-tight">D-GROW AGENCY</h3>
                <p className="text-xs text-slate-300">Confidential Salary Statement</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs text-brand-300">{selectedPayslip.payslip_number}</span>
                <p className="text-xs text-slate-400">
                  Month: {selectedPayslip.month}/{selectedPayslip.year}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-700">
              {/* Employee metadata */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block font-semibold">Employee Name</span>
                  <strong className="text-slate-900 text-sm">{selectedPayslip.employee_name}</strong>
                  <p className="text-slate-500">{selectedPayslip.employee_email}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block font-semibold">Department & ID</span>
                  <strong>{selectedPayslip.department_name}</strong>
                  <p className="font-mono">{selectedPayslip.employee_id}</p>
                </div>
              </div>

              {/* Earnings & Deductions Breakdown */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h5 className="font-bold text-slate-900 border-b pb-1 mb-2">Earnings</h5>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span>Base Salary:</span>
                      <strong>₹{Number(selectedPayslip.gross_earnings).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-bold text-slate-900 border-b pb-1 mb-2">Deductions</h5>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-rose-600">
                      <span>Total Deductions:</span>
                      <strong>₹{Number(selectedPayslip.total_deductions).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Pay Callout */}
              <div className="p-4 bg-brand-50 border border-brand-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-brand-800 text-[11px] font-bold uppercase tracking-wider block">
                    Net Take-Home Pay
                  </span>
                  <span className="text-2xl font-black text-brand-700">
                    ₹{Number(selectedPayslip.net_payable).toLocaleString()}
                  </span>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <span>Status: Disbursed</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
              >
                Print / Save PDF
              </button>
              <button
                onClick={() => setSelectedPayslip(null)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ASSIGN SALARY STRUCTURE */}
      {/* ========================================================= */}
      {showSalaryAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Assign Salary Structure</h3>
              <button onClick={() => setShowSalaryAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSalary} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Gross Base Salary (₹) *</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 75000"
                  value={salaryForm.grossBaseSalary}
                  onChange={(e) => {
                    const gross = Number(e.target.value);
                    setSalaryForm({
                      ...salaryForm,
                      grossBaseSalary: e.target.value,
                      netMonthlySalary: Math.round(gross * 0.88),
                      basic: Math.round(gross * 0.5),
                      hra: Math.round(gross * 0.25),
                      specialAllowance: Math.round(gross * 0.25)
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Net Monthly Salary (₹) *</label>
                <input
                  type="number"
                  required
                  value={salaryForm.netMonthlySalary}
                  onChange={(e) => setSalaryForm({ ...salaryForm, netMonthlySalary: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Date *</label>
                <input
                  type="date"
                  required
                  value={salaryForm.effectiveFrom}
                  onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSalaryAssignModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-xs font-bold hover:from-brand-500 hover:to-brand-600 shadow-xs"
                >
                  Save Salary
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HRHubPage;
