import { HRService } from './hr.service.js';

export class HRController {
  // =========================================================================
  // DASHBOARD
  // =========================================================================

  static async getHRDashboard(req, res, next) {
    try {
      const data = await HRService.getHRDashboardMetrics();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // EMPLOYEES
  // =========================================================================

  static async listEmployees(req, res, next) {
    try {
      const { departmentId, status, search, limit, offset } = req.query;
      const data = await HRService.listEmployees({
        departmentId: departmentId ? Number(departmentId) : undefined,
        status,
        search,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeeProfile(req, res, next) {
    try {
      const userId = Number(req.params.id);
      const data = await HRService.getEmployeeProfile(userId, req.user);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { message: 'Employee profile not found', code: 'NOT_FOUND' }
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async updateEmployeeProfile(req, res, next) {
    try {
      const userId = Number(req.params.id);
      const data = await HRService.updateEmployeeProfile(userId, req.body, req.user.id);
      res.json({ success: true, message: 'Employee profile updated successfully', data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // ATTENDANCE
  // =========================================================================

  static async getTodayAttendance(req, res, next) {
    try {
      const data = await HRService.getTodayAttendance(req.user.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async checkIn(req, res, next) {
    try {
      const data = await HRService.checkIn(req.user.id, req.body);
      res.status(201).json({ success: true, message: 'Check-in recorded successfully', data });
    } catch (error) {
      if (error.code === 'DUPLICATE_CHECK_IN') {
        return res.status(400).json({
          success: false,
          error: { message: error.message, code: error.code }
        });
      }
      next(error);
    }
  }

  static async checkOut(req, res, next) {
    try {
      const data = await HRService.checkOut(req.user.id, req.body);
      res.json({ success: true, message: 'Check-out recorded successfully', data });
    } catch (error) {
      if (error.code === 'INVALID_CHECK_OUT' || error.code === 'ALREADY_CHECKED_OUT') {
        return res.status(400).json({
          success: false,
          error: { message: error.message, code: error.code }
        });
      }
      next(error);
    }
  }

  static async getAttendanceHistory(req, res, next) {
    try {
      const targetUserId = req.params.userId ? Number(req.params.userId) : req.user.id;

      // Ownership check: users can only view their own history unless they have team or admin permission
      const isSelf = targetUserId === req.user.id;
      const canViewAll = req.user.isOwner || req.user.permissions?.includes('hr.attendance.manage_all') || req.user.permissions?.includes('hr.attendance.view_team');

      if (!isSelf && !canViewAll) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied to target user attendance records', code: 'FORBIDDEN' }
        });
      }

      const { month, year, startDate, endDate } = req.query;
      const data = await HRService.getAttendanceHistory(targetUserId, {
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
        startDate,
        endDate
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async getTeamAttendance(req, res, next) {
    try {
      const { date, departmentId } = req.query;
      const isFullAdmin = req.user.isOwner || req.user.permissions?.includes('hr.attendance.manage_all');
      const data = await HRService.getTeamAttendance(
        req.user.id,
        {
          date,
          departmentId: departmentId ? Number(departmentId) : undefined
        },
        isFullAdmin
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async requestAttendanceCorrection(req, res, next) {
    try {
      const data = await HRService.requestAttendanceCorrection(req.user.id, req.body);
      res.status(201).json({ success: true, message: 'Attendance correction request submitted', data });
    } catch (error) {
      next(error);
    }
  }

  static async listAttendanceCorrections(req, res, next) {
    try {
      const { status, myOnly } = req.query;
      const isFullAdmin = req.user.isOwner || req.user.permissions?.includes('hr.attendance.approve_corrections') || req.user.permissions?.includes('hr.attendance.manage_all');
      const userId = myOnly === 'true' || !isFullAdmin ? req.user.id : undefined;

      const data = await HRService.listAttendanceCorrections({ status, userId });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async reviewAttendanceCorrection(req, res, next) {
    try {
      const correctionId = Number(req.params.id);
      const data = await HRService.reviewAttendanceCorrection(correctionId, req.body, req.user.id);
      res.json({ success: true, message: `Correction request ${req.body.status}`, data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // LEAVE MANAGEMENT
  // =========================================================================

  static async getLeaveTypes(req, res, next) {
    try {
      const data = await HRService.getLeaveTypes();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async getLeaveBalances(req, res, next) {
    try {
      const targetUserId = req.params.userId ? Number(req.params.userId) : req.user.id;
      const isSelf = targetUserId === req.user.id;
      const canViewAll = req.user.isOwner || req.user.permissions?.includes('hr.leave.manage_all') || req.user.permissions?.includes('hr.leave.view_team');

      if (!isSelf && !canViewAll) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied to target user leave balances', code: 'FORBIDDEN' }
        });
      }

      const year = req.query.year ? Number(req.query.year) : undefined;
      const data = await HRService.getLeaveBalances(targetUserId, year);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async applyLeave(req, res, next) {
    try {
      const data = await HRService.applyLeave(req.user.id, req.body);
      res.status(201).json({ success: true, message: 'Leave request submitted successfully', data });
    } catch (error) {
      if (error.code === 'OVERLAPPING_LEAVE' || error.code === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({
          success: false,
          error: { message: error.message, code: error.code }
        });
      }
      next(error);
    }
  }

  static async cancelLeave(req, res, next) {
    try {
      const requestId = Number(req.params.id);
      const isManager = req.user.isOwner || req.user.permissions?.includes('hr.leave.manage_all');
      const data = await HRService.cancelLeave(requestId, req.user.id, isManager);
      res.json({ success: true, message: 'Leave request cancelled successfully', data });
    } catch (error) {
      next(error);
    }
  }

  static async reviewLeave(req, res, next) {
    try {
      const requestId = Number(req.params.id);
      const data = await HRService.reviewLeave(requestId, req.body, req.user.id);
      res.json({ success: true, message: `Leave request ${req.body.status}`, data });
    } catch (error) {
      next(error);
    }
  }

  static async getLeaveRequests(req, res, next) {
    try {
      const { status, myOnly } = req.query;
      const isFullAdmin = req.user.isOwner || req.user.permissions?.includes('hr.leave.manage_all');
      const isManager = req.user.permissions?.includes('hr.leave.view_team');

      let userId = undefined;
      let managerId = undefined;

      if (myOnly === 'true' || (!isFullAdmin && !isManager)) {
        userId = req.user.id;
      } else if (!isFullAdmin && isManager) {
        managerId = req.user.id;
      }

      const data = await HRService.getLeaveRequests({
        userId,
        status,
        managerId,
        isFullAdmin
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // SALARY STRUCTURE
  // =========================================================================

  static async getSalaryComponents(req, res, next) {
    try {
      const data = await HRService.getSalaryComponents();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async assignEmployeeSalary(req, res, next) {
    try {
      const targetUserId = Number(req.params.userId);
      const data = await HRService.assignEmployeeSalary(targetUserId, req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Salary assigned successfully', data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // PAYROLL PROCESSING
  // =========================================================================

  static async createPayrollRun(req, res, next) {
    try {
      const data = await HRService.createPayrollRun(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Payroll run created successfully', data });
    } catch (error) {
      if (error.code === 'DUPLICATE_PAYROLL_RUN') {
        return res.status(400).json({
          success: false,
          error: { message: error.message, code: error.code }
        });
      }
      next(error);
    }
  }

  static async getPayrollRuns(req, res, next) {
    try {
      const { year, status } = req.query;
      const data = await HRService.getPayrollRuns({
        year: year ? Number(year) : undefined,
        status
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async getPayrollRunDetails(req, res, next) {
    try {
      const runId = Number(req.params.id);
      const data = await HRService.getPayrollRunDetails(runId);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { message: 'Payroll run not found', code: 'NOT_FOUND' }
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async updatePayrollStatus(req, res, next) {
    try {
      const runId = Number(req.params.id);
      const data = await HRService.updatePayrollStatus(runId, req.body, req.user.id);
      res.json({ success: true, message: `Payroll status updated to ${req.body.status}`, data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // PAYSLIPS
  // =========================================================================

  static async getPayslip(req, res, next) {
    try {
      const payslipId = Number(req.params.id);
      const data = await HRService.getPayslip(payslipId, req.user);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { message: 'Payslip not found', code: 'NOT_FOUND' }
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      if (error.statusCode === 403 || error.code === 'FORBIDDEN') {
        return res.status(403).json({
          success: false,
          error: { message: error.message, code: 'FORBIDDEN' }
        });
      }
      next(error);
    }
  }

  static async getMyPayslips(req, res, next) {
    try {
      const targetUserId = req.params.userId ? Number(req.params.userId) : req.user.id;
      const isSelf = targetUserId === req.user.id;
      const canViewAll = req.user.isOwner || req.user.permissions?.includes('hr.payslips.view_all');

      if (!isSelf && !canViewAll) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied to target user payslips', code: 'FORBIDDEN' }
        });
      }

      const { year } = req.query;
      const data = await HRService.getMyPayslips(targetUserId, {
        year: year ? Number(year) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // EMPLOYEE PERFORMANCE SUMMARY
  // =========================================================================

  static async getEmployeePerformance(req, res, next) {
    try {
      const targetUserId = req.params.userId ? Number(req.params.userId) : req.user.id;
      const data = await HRService.getEmployeePerformanceSummary(targetUserId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}
