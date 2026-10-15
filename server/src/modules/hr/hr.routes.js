import { Router } from 'express';
import { HRController } from './hr.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, requireAnyPermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import {
  updateEmployeeProfileSchema,
  checkInSchema,
  checkOutSchema,
  attendanceCorrectionSchema,
  reviewCorrectionSchema,
  applyLeaveSchema,
  reviewLeaveSchema,
  assignSalarySchema,
  createPayrollRunSchema,
  updatePayrollStatusSchema
} from './hr.validation.js';

const router = Router();

// Enforce JWT authentication across all HR endpoints
router.use(authenticate);

// =========================================================================
// 1. DASHBOARD & OVERVIEW
// =========================================================================
router.get(
  '/hr/dashboard',
  requireAnyPermission(['hr.employees.view', 'hr.attendance.view_own']),
  HRController.getHRDashboard
);

// =========================================================================
// 2. EMPLOYEES DIRECTORY & PROFILES
// =========================================================================
router.get(
  '/hr/employees',
  requirePermission('hr.employees.view'),
  HRController.listEmployees
);

router.get(
  '/hr/employees/:id',
  requirePermission('hr.employees.view'),
  HRController.getEmployeeProfile
);

router.put(
  '/hr/employees/:id',
  requirePermission('hr.employees.manage'),
  validate(updateEmployeeProfileSchema),
  HRController.updateEmployeeProfile
);

router.get(
  '/hr/employees/:userId/performance',
  requirePermission('hr.employees.view'),
  HRController.getEmployeePerformance
);

// =========================================================================
// 3. ATTENDANCE MANAGEMENT
// =========================================================================
router.get(
  '/hr/attendance/today',
  requirePermission('hr.attendance.record_own'),
  HRController.getTodayAttendance
);

router.post(
  '/hr/attendance/check-in',
  requirePermission('hr.attendance.record_own'),
  validate(checkInSchema),
  HRController.checkIn
);

router.post(
  '/hr/attendance/check-out',
  requirePermission('hr.attendance.record_own'),
  validate(checkOutSchema),
  HRController.checkOut
);

router.get(
  '/hr/attendance/history',
  requirePermission('hr.attendance.view_own'),
  HRController.getAttendanceHistory
);

router.get(
  '/hr/attendance/user/:userId',
  requireAnyPermission(['hr.attendance.view_team', 'hr.attendance.manage_all', 'hr.attendance.view_own']),
  HRController.getAttendanceHistory
);

router.get(
  '/hr/attendance/team',
  requireAnyPermission(['hr.attendance.view_team', 'hr.attendance.manage_all']),
  HRController.getTeamAttendance
);

router.post(
  '/hr/attendance/corrections',
  requirePermission('hr.attendance.record_own'),
  validate(attendanceCorrectionSchema),
  HRController.requestAttendanceCorrection
);

router.get(
  '/hr/attendance/corrections',
  requireAnyPermission(['hr.attendance.approve_corrections', 'hr.attendance.record_own']),
  HRController.listAttendanceCorrections
);

router.put(
  '/hr/attendance/corrections/:id/review',
  requirePermission('hr.attendance.approve_corrections'),
  validate(reviewCorrectionSchema),
  HRController.reviewAttendanceCorrection
);

// =========================================================================
// 4. LEAVE MANAGEMENT
// =========================================================================
router.get(
  '/hr/leave/types',
  requirePermission('hr.leave.view_own'),
  HRController.getLeaveTypes
);

router.get(
  '/hr/leave/balances',
  requirePermission('hr.leave.view_own'),
  HRController.getLeaveBalances
);

router.get(
  '/hr/leave/balances/user/:userId',
  requireAnyPermission(['hr.leave.view_team', 'hr.leave.manage_all', 'hr.leave.view_own']),
  HRController.getLeaveBalances
);

router.post(
  '/hr/leave/apply',
  requirePermission('hr.leave.apply_own'),
  validate(applyLeaveSchema),
  HRController.applyLeave
);

router.post(
  '/hr/leave/:id/cancel',
  requirePermission('hr.leave.apply_own'),
  HRController.cancelLeave
);

router.get(
  '/hr/leave/requests',
  requirePermission('hr.leave.view_own'),
  HRController.getLeaveRequests
);

router.put(
  '/hr/leave/requests/:id/review',
  requirePermission('hr.leave.approve'),
  validate(reviewLeaveSchema),
  HRController.reviewLeave
);

// =========================================================================
// 5. SALARY STRUCTURE MANAGEMENT
// =========================================================================
router.get(
  '/hr/salary/components',
  requireAnyPermission(['hr.salary.manage', 'hr.salary.view_all']),
  HRController.getSalaryComponents
);

router.post(
  '/hr/salary/assign/:userId',
  requirePermission('hr.salary.manage'),
  validate(assignSalarySchema),
  HRController.assignEmployeeSalary
);

// =========================================================================
// 6. PAYROLL PROCESSING
// =========================================================================
router.post(
  '/hr/payroll/runs',
  requirePermission('hr.payroll.manage'),
  validate(createPayrollRunSchema),
  HRController.createPayrollRun
);

router.get(
  '/hr/payroll/runs',
  requireAnyPermission(['hr.payroll.view', 'hr.payroll.manage']),
  HRController.getPayrollRuns
);

router.get(
  '/hr/payroll/runs/:id',
  requireAnyPermission(['hr.payroll.view', 'hr.payroll.manage']),
  HRController.getPayrollRunDetails
);

router.put(
  '/hr/payroll/runs/:id/status',
  requireAnyPermission(['hr.payroll.manage', 'hr.payroll.approve']),
  validate(updatePayrollStatusSchema),
  HRController.updatePayrollStatus
);

// =========================================================================
// 7. PAYSLIPS
// =========================================================================
router.get(
  '/hr/payslips/my',
  requirePermission('hr.payslips.view_own'),
  HRController.getMyPayslips
);

router.get(
  '/hr/payslips/user/:userId',
  requireAnyPermission(['hr.payslips.view_all', 'hr.payslips.view_own']),
  HRController.getMyPayslips
);

router.get(
  '/hr/payslips/:id',
  requireAnyPermission(['hr.payslips.view_own', 'hr.payslips.view_all']),
  HRController.getPayslip
);

export default router;
