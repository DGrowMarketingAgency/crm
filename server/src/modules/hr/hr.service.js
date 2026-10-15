import { pool } from '../../config/db.js';

export class HRService {
  /**
   * Helper to get current Indian Standard Time (IST) date string 'YYYY-MM-DD'
   */
  static getTodayDateIST() {
    const now = new Date();
    // Offset for IST (UTC + 5:30)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffsetMs);
    return istDate.toISOString().split('T')[0];
  }

  // =========================================================================
  // 1. EMPLOYEE DIRECTORY & PROFILES
  // =========================================================================

  static async listEmployees({ departmentId, status, search, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.status AS user_status,
        ep.id AS profile_id,
        ep.employee_id,
        ep.employment_type,
        ep.joining_date,
        ep.employment_status,
        ep.work_location,
        ep.work_schedule_id,
        ws.name AS work_schedule_name,
        mgr.id AS reporting_manager_id,
        mgr.name AS reporting_manager_name,
        d.id AS department_id,
        d.name AS department_name,
        d.code AS department_code
      FROM users u
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      LEFT JOIN users mgr ON ep.reporting_manager_id = mgr.id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (departmentId) {
      sql += ' AND d.id = ?';
      params.push(departmentId);
    }

    if (status) {
      sql += ' AND ep.employment_status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR ep.employee_id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY u.id ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.id);
    const [desRows] = await pool.query('SELECT user_id, designation FROM user_designations WHERE user_id IN (?)', [userIds]);
    const [roleRows] = await pool.query(
      'SELECT ur.user_id, r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id IN (?)',
      [userIds]
    );

    const desMap = {};
    for (const d of desRows) {
      if (!desMap[d.user_id]) desMap[d.user_id] = [];
      desMap[d.user_id].push(d.designation);
    }

    const roleMap = {};
    for (const r of roleRows) {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.name);
    }

    return rows.map((r) => ({
      ...r,
      designations: desMap[r.id] || [],
      roles: roleMap[r.id] || []
    }));
  }

  static async getEmployeeProfile(userId, requestingUser = null) {
    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.status AS user_status,
        ep.id AS profile_id,
        ep.employee_id,
        ep.employment_type,
        ep.joining_date,
        ep.employment_status,
        ep.work_location,
        ep.work_schedule_id,
        ep.bank_name,
        ep.account_number,
        ep.ifsc_code,
        ep.pan_number,
        ws.name AS work_schedule_name,
        ws.start_time AS schedule_start_time,
        ws.end_time AS schedule_end_time,
        ws.working_days AS schedule_working_days,
        mgr.id AS reporting_manager_id,
        mgr.name AS reporting_manager_name,
        d.id AS department_id,
        d.name AS department_name
      FROM users u
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      LEFT JOIN users mgr ON ep.reporting_manager_id = mgr.id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE u.id = ?
    `,
      [userId]
    );

    if (rows.length === 0) return null;

    const profile = rows[0];

    const [desRows] = await pool.query('SELECT designation FROM user_designations WHERE user_id = ?', [userId]);
    const [roleRows] = await pool.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = ?',
      [userId]
    );
    profile.designations = desRows.map((d) => d.designation);
    profile.roles = roleRows.map((r) => r.name);

    // Leave balances
    profile.leaveBalances = await HRService.getLeaveBalances(userId);

    // Active salary assignment (Restricted)
    const canViewSalary =
      requestingUser &&
      (requestingUser.isOwner ||
        requestingUser.permissions?.includes('hr.salary.view_all') ||
        (requestingUser.id === Number(userId) && requestingUser.permissions?.includes('hr.salary.view_own')));

    if (canViewSalary) {
      const [salaryRows] = await pool.query(
        `
        SELECT *
        FROM employee_salary_assignments
        WHERE user_id = ? AND effective_from <= CURDATE() AND (effective_to IS NULL OR effective_to >= CURDATE())
        ORDER BY effective_from DESC
        LIMIT 1
      `,
        [userId]
      );
      profile.currentSalary = salaryRows.length > 0 ? salaryRows[0] : null;
    } else {
      profile.currentSalary = null;
      delete profile.bank_name;
      delete profile.account_number;
      delete profile.ifsc_code;
      delete profile.pan_number;
    }

    return profile;
  }

  static async updateEmployeeProfile(userId, data, actorId) {
    const [user] = await pool.query('SELECT id, name FROM users WHERE id = ?', [userId]);
    if (user.length === 0) {
      throw new Error('User not found');
    }

    const [existing] = await pool.query('SELECT id FROM employee_profiles WHERE user_id = ?', [userId]);

    const employeeId = data.employeeId || data.employee_id || `DG-EMP-${String(userId).padStart(4, '0')}`;
    const reportingManagerId = data.reportingManagerId !== undefined ? data.reportingManagerId : data.reporting_manager_id;
    const employmentType = data.employmentType || data.employment_type || 'full_time';
    const joiningDate = data.joiningDate || data.joining_date || HRService.getTodayDateIST();
    const employmentStatus = data.employmentStatus || data.employment_status || 'active';
    const workLocation = data.workLocation || data.work_location || 'On-site';
    const workScheduleId = data.workScheduleId !== undefined ? data.workScheduleId : data.work_schedule_id;
    const bankName = data.bankName !== undefined ? data.bankName : data.bank_name;
    const accountNumber = data.accountNumber !== undefined ? data.accountNumber : data.account_number;
    const ifscCode = data.ifscCode !== undefined ? data.ifscCode : data.ifsc_code;
    const panNumber = data.panNumber !== undefined ? data.panNumber : data.pan_number;

    if (existing.length === 0) {
      await pool.query(
        `
        INSERT INTO employee_profiles 
          (user_id, employee_id, reporting_manager_id, employment_type, joining_date, employment_status, work_location, work_schedule_id, bank_name, account_number, ifsc_code, pan_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          userId,
          employeeId,
          reportingManagerId || null,
          employmentType,
          joiningDate,
          employmentStatus,
          workLocation,
          workScheduleId || 1,
          bankName || null,
          accountNumber || null,
          ifscCode || null,
          panNumber || null
        ]
      );
    } else {
      await pool.query(
        `
        UPDATE employee_profiles
        SET 
          employee_id = COALESCE(?, employee_id),
          reporting_manager_id = ?,
          employment_type = COALESCE(?, employment_type),
          joining_date = COALESCE(?, joining_date),
          employment_status = COALESCE(?, employment_status),
          work_location = COALESCE(?, work_location),
          work_schedule_id = ?,
          bank_name = ?,
          account_number = ?,
          ifsc_code = ?,
          pan_number = ?
        WHERE user_id = ?
      `,
        [
          employeeId,
          reportingManagerId || null,
          employmentType,
          joiningDate,
          employmentStatus,
          workLocation,
          workScheduleId || null,
          bankName || null,
          accountNumber || null,
          ifscCode || null,
          panNumber || null,
          userId
        ]
      );
    }

    return HRService.getEmployeeProfile(userId, { id: actorId, isOwner: true });
  }

  // =========================================================================
  // 2. ATTENDANCE MANAGEMENT
  // =========================================================================

  static async getTodayAttendance(userId) {
    const today = HRService.getTodayDateIST();
    const [rows] = await pool.query(
      `
      SELECT ar.*, ws.start_time AS schedule_start_time, ws.end_time AS schedule_end_time
      FROM attendance_records ar
      LEFT JOIN employee_profiles ep ON ar.user_id = ep.user_id
      LEFT JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      WHERE ar.user_id = ? AND ar.attendance_date = ?
    `,
      [userId, today]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  static async checkIn(userId, { notes = null } = {}) {
    const today = HRService.getTodayDateIST();

    const [existing] = await pool.query(
      'SELECT id, check_in_time FROM attendance_records WHERE user_id = ? AND attendance_date = ?',
      [userId, today]
    );

    if (existing.length > 0 && existing[0].check_in_time) {
      const err = new Error('Already checked in for today');
      err.code = 'DUPLICATE_CHECK_IN';
      throw err;
    }

    const [schedRows] = await pool.query(
      `
      SELECT ws.*
      FROM employee_profiles ep
      JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      WHERE ep.user_id = ?
    `,
      [userId]
    );

    const schedule = schedRows.length > 0 ? schedRows[0] : {
      start_time: '10:00:00',
      grace_period_minutes: 15
    };

    const now = new Date();
    const [h, m, s] = (schedule.start_time || '10:00:00').split(':').map(Number);
    const scheduleStartTime = new Date();
    scheduleStartTime.setHours(h, m + (schedule.grace_period_minutes || 15), s || 0, 0);

    const isLate = now > scheduleStartTime ? 1 : 0;
    const status = isLate ? 'late' : 'present';

    if (existing.length > 0) {
      await pool.query(
        `
        UPDATE attendance_records
        SET check_in_time = NOW(), status = ?, is_late = ?, notes = COALESCE(?, notes)
        WHERE id = ?
      `,
        [status, isLate, notes, existing[0].id]
      );
      return HRService.getTodayAttendance(userId);
    }

    await pool.query(
      `
      INSERT INTO attendance_records 
        (user_id, attendance_date, check_in_time, status, is_late, notes)
      VALUES (?, ?, NOW(), ?, ?, ?)
    `,
      [userId, today, status, isLate, notes]
    );

    return HRService.getTodayAttendance(userId);
  }

  static async checkOut(userId, { notes = null } = {}) {
    const today = HRService.getTodayDateIST();

    const [existing] = await pool.query(
      `
      SELECT ar.*, ws.end_time, ws.half_day_threshold_hours, ws.full_day_threshold_hours, ws.overtime_allowed
      FROM attendance_records ar
      LEFT JOIN employee_profiles ep ON ar.user_id = ep.user_id
      LEFT JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      WHERE ar.user_id = ? AND ar.attendance_date = ?
    `,
      [userId, today]
    );

    if (existing.length === 0 || !existing[0].check_in_time) {
      const err = new Error('Cannot check out without checking in first');
      err.code = 'INVALID_CHECK_OUT';
      throw err;
    }

    if (existing[0].check_out_time) {
      const err = new Error('Already checked out for today');
      err.code = 'ALREADY_CHECKED_OUT';
      throw err;
    }

    const checkIn = new Date(existing[0].check_in_time);
    const checkOut = new Date();
    const durationHours = Math.max(0, (checkOut - checkIn) / (1000 * 60 * 60));

    const halfDayThreshold = Number(existing[0].half_day_threshold_hours || 4.0);
    const fullDayThreshold = Number(existing[0].full_day_threshold_hours || 8.0);
    const overtimeAllowed = existing[0].overtime_allowed !== 0;

    let status = existing[0].status;
    if (durationHours < halfDayThreshold) {
      status = 'half_day';
    }

    let overtimeHours = 0;
    if (overtimeAllowed && durationHours > fullDayThreshold) {
      overtimeHours = Number((durationHours - fullDayThreshold).toFixed(2));
    }

    await pool.query(
      `
      UPDATE attendance_records
      SET 
        check_out_time = NOW(),
        total_working_hours = ?,
        status = ?,
        overtime_hours = ?,
        notes = COALESCE(?, notes)
      WHERE id = ?
    `,
      [durationHours.toFixed(2), status, overtimeHours, notes, existing[0].id]
    );

    return HRService.getTodayAttendance(userId);
  }

  static async getAttendanceHistory(userId, { month, year, startDate, endDate } = {}) {
    let sql = `
      SELECT ar.*, ws.name AS work_schedule_name
      FROM attendance_records ar
      LEFT JOIN employee_profiles ep ON ar.user_id = ep.user_id
      LEFT JOIN work_schedules ws ON ep.work_schedule_id = ws.id
      WHERE ar.user_id = ?
    `;
    const params = [userId];

    if (startDate && endDate) {
      sql += ' AND ar.attendance_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (month && year) {
      sql += ' AND MONTH(ar.attendance_date) = ? AND YEAR(ar.attendance_date) = ?';
      params.push(month, year);
    }

    sql += ' ORDER BY ar.attendance_date DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async getTeamAttendance(managerId, { date = null, departmentId = null } = {}, isFullAdmin = false) {
    const targetDate = date || HRService.getTodayDateIST();

    let sql = `
      SELECT 
        u.id AS user_id,
        u.name,
        u.email,
        ep.employee_id,
        d.name AS department_name,
        ar.id AS attendance_id,
        ar.attendance_date,
        ar.check_in_time,
        ar.check_out_time,
        ar.total_working_hours,
        COALESCE(ar.status, 'absent') AS status,
        ar.is_late,
        ar.overtime_hours
      FROM users u
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      LEFT JOIN attendance_records ar ON u.id = ar.user_id AND ar.attendance_date = ?
      WHERE u.status = 'active'
    `;
    const params = [targetDate];

    if (!isFullAdmin) {
      sql += ' AND (ep.reporting_manager_id = ? OR dm.department_id = (SELECT department_id FROM department_members WHERE user_id = ? LIMIT 1))';
      params.push(managerId, managerId);
    }

    if (departmentId) {
      sql += ' AND d.id = ?';
      params.push(departmentId);
    }

    sql += ' ORDER BY u.name ASC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async requestAttendanceCorrection(userId, data) {
    const attendanceDate = data.attendanceDate || data.attendance_date;
    const requestedCheckIn = data.requestedCheckIn || data.requested_check_in;
    const requestedCheckOut = data.requestedCheckOut || data.requested_check_out;
    const reason = data.reason;

    const [attRows] = await pool.query(
      'SELECT id FROM attendance_records WHERE user_id = ? AND attendance_date = ?',
      [userId, attendanceDate]
    );
    const attendanceRecordId = attRows.length > 0 ? attRows[0].id : null;

    const [result] = await pool.query(
      `
      INSERT INTO attendance_corrections 
        (attendance_record_id, user_id, attendance_date, requested_check_in, requested_check_out, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
      [attendanceRecordId, userId, attendanceDate, requestedCheckIn, requestedCheckOut, reason]
    );

    return {
      id: result.insertId,
      userId,
      attendanceDate,
      status: 'pending',
      reason
    };
  }

  static async listAttendanceCorrections({ status = null, userId = null } = {}) {
    let sql = `
      SELECT ac.*, u.name AS user_name, u.email AS user_email, ep.employee_id, reviewer.name AS reviewer_name
      FROM attendance_corrections ac
      JOIN users u ON ac.user_id = u.id
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN users reviewer ON ac.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND ac.status = ?';
      params.push(status);
    }

    if (userId) {
      sql += ' AND ac.user_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY ac.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async reviewAttendanceCorrection(correctionId, { status, reviewNotes = null }, reviewerId) {
    const [corrections] = await pool.query(
      'SELECT * FROM attendance_corrections WHERE id = ?',
      [correctionId]
    );

    if (corrections.length === 0) {
      throw new Error('Correction request not found');
    }

    const corr = corrections[0];
    if (corr.status !== 'pending') {
      throw new Error(`Correction request is already ${corr.status}`);
    }

    await pool.query(
      `
      UPDATE attendance_corrections
      SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
      WHERE id = ?
    `,
      [status, reviewerId, reviewNotes, correctionId]
    );

    if (status === 'approved') {
      const inTime = new Date(corr.requested_check_in);
      const outTime = new Date(corr.requested_check_out);
      const totalHours = Math.max(0, (outTime - inTime) / (1000 * 60 * 60));

      const [existing] = await pool.query(
        'SELECT id FROM attendance_records WHERE user_id = ? AND attendance_date = ?',
        [corr.user_id, corr.attendance_date]
      );

      if (existing.length > 0) {
        await pool.query(
          `
          UPDATE attendance_records
          SET 
            check_in_time = ?,
            check_out_time = ?,
            total_working_hours = ?,
            status = 'present',
            notes = CONCAT(COALESCE(notes, ''), ' [Corrected by admin]')
          WHERE id = ?
        `,
          [corr.requested_check_in, corr.requested_check_out, totalHours.toFixed(2), existing[0].id]
        );
      } else {
        await pool.query(
          `
          INSERT INTO attendance_records 
            (user_id, attendance_date, check_in_time, check_out_time, total_working_hours, status, notes)
          VALUES (?, ?, ?, ?, ?, 'present', '[Created via approved correction]')
        `,
          [corr.user_id, corr.attendance_date, corr.requested_check_in, corr.requested_check_out, totalHours.toFixed(2)]
        );
      }
    }

    return { id: correctionId, status, reviewedBy: reviewerId };
  }

  // =========================================================================
  // 3. LEAVE MANAGEMENT
  // =========================================================================

  static async getLeaveTypes() {
    const [rows] = await pool.query('SELECT * FROM leave_types ORDER BY id ASC');
    return rows;
  }

  static async getLeaveBalances(userId, year = null) {
    const currentYear = year || new Date().getFullYear();

    const [rows] = await pool.query(
      `
      SELECT 
        lb.id,
        lb.user_id,
        lb.leave_type_id,
        lb.year,
        lb.opening_balance,
        lb.accrued,
        lb.used,
        lb.adjusted,
        (lb.opening_balance + lb.accrued + lb.adjusted - lb.used) AS available_balance,
        lt.name,
        lt.code,
        lt.description,
        lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.user_id = ? AND lb.year = ?
      ORDER BY lt.id ASC
    `,
      [userId, currentYear]
    );

    if (rows.length === 0) {
      // Auto-initialize balance records for the employee for this year
      const [types] = await pool.query('SELECT id, annual_quota FROM leave_types');
      for (const t of types) {
        await pool.query(
          `
          INSERT IGNORE INTO leave_balances 
            (user_id, leave_type_id, year, opening_balance, accrued, used, adjusted)
          VALUES (?, ?, ?, ?, 0.00, 0.00, 0.00)
        `,
          [userId, t.id, currentYear, t.annual_quota]
        );
      }
      return HRService.getLeaveBalances(userId, currentYear);
    }

    return rows;
  }

  static async applyLeave(userId, data) {
    const leaveTypeId = Number(data.leaveTypeId || data.leave_type_id);
    const startDate = data.startDate || data.start_date;
    const endDate = data.endDate || data.end_date;
    const isHalfDay = Boolean(data.isHalfDay || data.is_half_day);
    const halfDaySession = data.halfDaySession || data.half_day_session || null;
    const reason = data.reason;
    const attachmentUrl = data.attachmentUrl || data.attachment_url || null;

    if (new Date(endDate) < new Date(startDate)) {
      throw new Error('End date cannot be earlier than start date');
    }

    let durationDays = 1;
    if (isHalfDay) {
      durationDays = 0.5;
    } else {
      const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
      durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    // 1. Check for overlapping requests
    const [overlapping] = await pool.query(
      `
      SELECT id FROM leave_requests
      WHERE user_id = ?
        AND status IN ('pending', 'approved')
        AND ((start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?))
    `,
      [userId, endDate, startDate, startDate, endDate]
    );

    if (overlapping.length > 0) {
      const err = new Error('You already have an active leave request overlapping these dates');
      err.code = 'OVERLAPPING_LEAVE';
      throw err;
    }

    // 2. Validate leave balance for paid leave
    const [types] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [leaveTypeId]);
    if (types.length === 0) {
      throw new Error('Invalid leave type');
    }
    const leaveType = types[0];

    const currentYear = new Date(startDate).getFullYear();
    const balances = await HRService.getLeaveBalances(userId, currentYear);
    const balance = balances.find((b) => Number(b.leave_type_id) === leaveTypeId);

    if (leaveType.is_paid && balance) {
      const [pendingRows] = await pool.query(
        `
        SELECT COALESCE(SUM(duration_days), 0) AS pending_days 
        FROM leave_requests 
        WHERE user_id = ? AND leave_type_id = ? AND status = 'pending' AND YEAR(start_date) = ?
      `,
        [userId, leaveTypeId, currentYear]
      );
      const pendingDays = Number(pendingRows[0].pending_days || 0);
      const netAvailable = Number(balance.available_balance || 0) - pendingDays;

      if (netAvailable < durationDays) {
        const err = new Error(`Insufficient leave balance. Available: ${netAvailable} days, Requested: ${durationDays} days`);
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }
    }

    // 3. Create request
    const [res] = await pool.query(
      `
      INSERT INTO leave_requests 
        (user_id, leave_type_id, start_date, end_date, duration_days, is_half_day, half_day_session, reason, attachment_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
      [userId, leaveTypeId, startDate, endDate, durationDays, isHalfDay ? 1 : 0, halfDaySession, reason, attachmentUrl]
    );

    return {
      id: res.insertId,
      userId,
      leaveTypeId,
      startDate,
      endDate,
      durationDays,
      status: 'pending'
    };
  }

  static async cancelLeave(requestId, userId, isManager = false) {
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [requestId]);
    if (rows.length === 0) {
      throw new Error('Leave request not found');
    }

    const leave = rows[0];
    if (!isManager && Number(leave.user_id) !== Number(userId)) {
      throw new Error('Access denied. You can only cancel your own leave requests.');
    }

    if (leave.status === 'cancelled' || leave.status === 'rejected') {
      throw new Error(`Cannot cancel a leave request that is already ${leave.status}`);
    }

    const currentYear = new Date(leave.start_date).getFullYear();

    if (leave.status === 'approved') {
      // Revert deducted balance
      await pool.query(
        `
        UPDATE leave_balances
        SET used = GREATEST(0.00, used - ?)
        WHERE user_id = ? AND leave_type_id = ? AND year = ?
      `,
        [leave.duration_days, leave.user_id, leave.leave_type_id, currentYear]
      );

      // Revert attendance status on those dates
      await pool.query(
        `
        DELETE FROM attendance_records
        WHERE user_id = ? AND status = 'on_leave' AND attendance_date BETWEEN ? AND ?
      `,
        [leave.user_id, leave.start_date, leave.end_date]
      );
    }

    await pool.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [requestId]);

    return { id: requestId, status: 'cancelled' };
  }

  static async reviewLeave(requestId, { status, reviewNotes = null }, reviewerId) {
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [requestId]);
    if (rows.length === 0) {
      throw new Error('Leave request not found');
    }

    const leave = rows[0];
    if (leave.status !== 'pending') {
      throw new Error(`Leave request has already been reviewed (${leave.status})`);
    }

    const currentYear = new Date(leave.start_date).getFullYear();

    if (status === 'approved') {
      // Increase used days
      await pool.query(
        `
        UPDATE leave_balances
        SET used = used + ?
        WHERE user_id = ? AND leave_type_id = ? AND year = ?
      `,
        [leave.duration_days, leave.user_id, leave.leave_type_id, currentYear]
      );

      // Mark attendance records as 'on_leave' for the duration
      const curr = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      while (curr <= end) {
        const dStr = curr.toISOString().split('T')[0];
        await pool.query(
          `
          INSERT INTO attendance_records (user_id, attendance_date, status, notes)
          VALUES (?, ?, 'on_leave', ?)
          ON DUPLICATE KEY UPDATE status = 'on_leave', notes = VALUES(notes)
        `,
          [leave.user_id, dStr, `Approved leave: ${leave.reason}`]
        );
        curr.setDate(curr.getDate() + 1);
      }
    }

    await pool.query(
      `
      UPDATE leave_requests
      SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
      WHERE id = ?
    `,
      [status, reviewerId, reviewNotes, requestId]
    );

    return { id: requestId, status, reviewedBy: reviewerId };
  }

  static async getLeaveRequests({ userId = null, status = null, managerId = null, isFullAdmin = false } = {}) {
    let sql = `
      SELECT 
        lr.*,
        lt.name AS leave_type_name,
        lt.code AS leave_type_code,
        lt.is_paid,
        u.name AS user_name,
        u.email AS user_email,
        ep.employee_id,
        d.name AS department_name,
        reviewer.name AS reviewer_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN users u ON lr.user_id = u.id
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      LEFT JOIN users reviewer ON lr.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND lr.user_id = ?';
      params.push(userId);
    }

    if (status) {
      sql += ' AND lr.status = ?';
      params.push(status);
    }

    if (!isFullAdmin && managerId && !userId) {
      sql += ' AND (ep.reporting_manager_id = ? OR dm.department_id = (SELECT department_id FROM department_members WHERE user_id = ? LIMIT 1))';
      params.push(managerId, managerId);
    }

    sql += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  // =========================================================================
  // 4. SALARY STRUCTURE MANAGEMENT
  // =========================================================================

  static async getSalaryComponents() {
    const [rows] = await pool.query('SELECT * FROM salary_components ORDER BY type DESC, id ASC');
    return rows;
  }

  static async assignEmployeeSalary(userId, data, actorId) {
    const effectiveFrom = data.effectiveFrom || data.effective_from;
    const effectiveTo = data.effectiveTo || data.effective_to || null;
    const grossBaseSalary = Number(data.grossBaseSalary || data.gross_base_salary);
    const netMonthlySalary = Number(data.netMonthlySalary || data.net_monthly_salary);
    const componentsJson = data.componentsJson || data.components_json || {};

    await pool.query(
      `
      UPDATE employee_salary_assignments
      SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
      WHERE user_id = ? AND (effective_to IS NULL OR effective_to >= ?)
    `,
      [effectiveFrom, userId, effectiveFrom]
    );

    const [res] = await pool.query(
      `
      INSERT INTO employee_salary_assignments
        (user_id, effective_from, effective_to, gross_base_salary, components_json, net_monthly_salary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [userId, effectiveFrom, effectiveTo, grossBaseSalary, JSON.stringify(componentsJson), netMonthlySalary, actorId]
    );

    return {
      id: res.insertId,
      userId,
      effectiveFrom,
      grossBaseSalary,
      netMonthlySalary
    };
  }

  // =========================================================================
  // 5. PAYROLL PROCESSING
  // =========================================================================

  static async createPayrollRun({ month, year, notes = null }, actorId) {
    const [existing] = await pool.query(
      `
      SELECT id, run_code, status FROM payroll_runs
      WHERE month = ? AND year = ? AND status != 'reversed'
    `,
      [month, year]
    );

    if (existing.length > 0) {
      const err = new Error(`A payroll run for ${month}/${year} already exists (${existing[0].run_code}, status: ${existing[0].status})`);
      err.code = 'DUPLICATE_PAYROLL_RUN';
      throw err;
    }

    const runCode = `PR-${year}-${String(month).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [employees] = await pool.query(`
      SELECT 
        u.id AS user_id,
        u.name,
        ep.employee_id,
        COALESCE(esa.gross_base_salary, 50000.00) AS base_salary,
        esa.components_json
      FROM users u
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN employee_salary_assignments esa ON u.id = esa.user_id 
        AND esa.effective_from <= ? 
        AND (esa.effective_to IS NULL OR esa.effective_to >= ?)
      WHERE u.status = 'active'
    `, [periodEnd, periodStart]);

    const [runRes] = await pool.query(
      `
      INSERT INTO payroll_runs 
        (run_code, month, year, period_start, period_end, total_employees, status, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `,
      [runCode, month, year, periodStart, periodEnd, employees.length, actorId, notes]
    );
    const runId = runRes.insertId;

    let grossTotal = 0;
    let totalDeductionsAll = 0;
    let netTotalAll = 0;

    for (const emp of employees) {
      const workingDaysInMonth = 26;

      const [att] = await pool.query(
        `
        SELECT 
          SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) AS days_present,
          SUM(CASE WHEN status = 'half_day' THEN 0.5 ELSE 0 END) AS half_days,
          SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS paid_leave_days,
          SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_days
        FROM attendance_records
        WHERE user_id = ? AND attendance_date BETWEEN ? AND ?
      `,
        [emp.user_id, periodStart, periodEnd]
      );

      const daysPresent = Number(att[0]?.days_present || 0) + Number(att[0]?.half_days || 0);
      const paidLeaveDays = Number(att[0]?.paid_leave_days || 0);
      const absentDays = Number(att[0]?.absent_days || 0);

      const baseSalary = Number(emp.base_salary);
      const perDayRate = baseSalary / workingDaysInMonth;

      const unpaidLeaveDeduction = Number((absentDays * perDayRate).toFixed(2));
      const pfDeduction = Number((baseSalary * 0.12).toFixed(2));
      const profTax = 200.00;

      const totalDeductions = Number((unpaidLeaveDeduction + pfDeduction + profTax).toFixed(2));
      const grossEarnings = Number(baseSalary.toFixed(2));
      const netPay = Math.max(0, Number((grossEarnings - totalDeductions).toFixed(2)));

      const breakdown = {
        base_salary: baseSalary,
        hra: Number((baseSalary * 0.4).toFixed(2)),
        special_allowance: Number((baseSalary * 0.2).toFixed(2)),
        pf_employee: pfDeduction,
        prof_tax: profTax,
        lwp_deduction: unpaidLeaveDeduction,
        working_days: workingDaysInMonth,
        days_present: daysPresent,
        paid_leave: paidLeaveDays,
        unpaid_leave: absentDays
      };

      await pool.query(
        `
        INSERT INTO payroll_items
          (payroll_run_id, user_id, base_salary, working_days_in_month, days_present, paid_leave_days, unpaid_leave_days, gross_earnings, total_deductions, net_pay, breakdown_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated')
      `,
        [
          runId,
          emp.user_id,
          baseSalary,
          workingDaysInMonth,
          daysPresent,
          paidLeaveDays,
          absentDays,
          grossEarnings,
          totalDeductions,
          netPay,
          JSON.stringify(breakdown)
        ]
      );

      grossTotal += grossEarnings;
      totalDeductionsAll += totalDeductions;
      netTotalAll += netPay;
    }

    await pool.query(
      `
      UPDATE payroll_runs
      SET gross_total = ?, total_deductions = ?, net_total = ?
      WHERE id = ?
    `,
      [grossTotal.toFixed(2), totalDeductionsAll.toFixed(2), netTotalAll.toFixed(2), runId]
    );

    return HRService.getPayrollRunDetails(runId);
  }

  static async getPayrollRuns({ year = null, status = null } = {}) {
    let sql = `
      SELECT pr.*, creator.name AS created_by_name, approver.name AS approved_by_name
      FROM payroll_runs pr
      JOIN users creator ON pr.created_by = creator.id
      LEFT JOIN users approver ON pr.approved_by = approver.id
      WHERE 1=1
    `;
    const params = [];

    if (year) {
      sql += ' AND pr.year = ?';
      params.push(year);
    }

    if (status) {
      sql += ' AND pr.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY pr.year DESC, pr.month DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async getPayrollRunDetails(runId) {
    const [runs] = await pool.query(
      `
      SELECT pr.*, creator.name AS created_by_name, approver.name AS approved_by_name, finalizer.name AS finalized_by_name
      FROM payroll_runs pr
      JOIN users creator ON pr.created_by = creator.id
      LEFT JOIN users approver ON pr.approved_by = approver.id
      LEFT JOIN users finalizer ON pr.finalized_by = finalizer.id
      WHERE pr.id = ?
    `,
      [runId]
    );

    if (runs.length === 0) return null;
    const run = runs[0];

    const [items] = await pool.query(
      `
      SELECT pi.*, u.name, u.email, ep.employee_id, d.name AS department_name
      FROM payroll_items pi
      JOIN users u ON pi.user_id = u.id
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE pi.payroll_run_id = ?
      ORDER BY u.name ASC
    `,
      [runId]
    );

    run.items = items;
    return run;
  }

  static async updatePayrollStatus(runId, { status, paymentDate = null, paymentReference = null, notes = null }, actorId) {
    const [runs] = await pool.query('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
    if (runs.length === 0) {
      throw new Error('Payroll run not found');
    }
    const run = runs[0];

    if (run.status === 'finalized' && status === 'draft') {
      throw new Error('Cannot revert a finalized payroll run back to draft');
    }

    if (status === 'approved') {
      await pool.query(
        `
        UPDATE payroll_runs
        SET status = 'approved', approved_by = ?, approved_at = NOW(), notes = COALESCE(?, notes)
        WHERE id = ?
      `,
        [actorId, notes, runId]
      );
      await pool.query("UPDATE payroll_items SET status = 'approved' WHERE payroll_run_id = ?", [runId]);
    } else if (status === 'finalized') {
      await pool.query(
        `
        UPDATE payroll_runs
        SET status = 'finalized', finalized_by = ?, finalized_at = NOW(), notes = COALESCE(?, notes)
        WHERE id = ?
      `,
        [actorId, notes, runId]
      );
      await pool.query("UPDATE payroll_items SET status = 'finalized' WHERE payroll_run_id = ?", [runId]);

      // Generate Payslips
      const [items] = await pool.query('SELECT * FROM payroll_items WHERE payroll_run_id = ?', [runId]);
      for (const item of items) {
        const payslipNumber = `PS-${run.year}${String(run.month).padStart(2, '0')}-${String(item.user_id).padStart(4, '0')}`;
        await pool.query(
          `
          INSERT INTO payslips 
            (payslip_number, payroll_item_id, payroll_run_id, user_id, month, year, gross_earnings, total_deductions, net_payable, details_json, is_published)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE 
            gross_earnings = VALUES(gross_earnings),
            total_deductions = VALUES(total_deductions),
            net_payable = VALUES(net_payable),
            details_json = VALUES(details_json)
        `,
          [
            payslipNumber,
            item.id,
            runId,
            item.user_id,
            run.month,
            run.year,
            item.gross_earnings,
            item.total_deductions,
            item.net_pay,
            JSON.stringify(item.breakdown_json)
          ]
        );
      }
    } else if (status === 'paid') {
      if (run.status !== 'finalized') {
        throw new Error('Payroll run must be finalized before recording payment');
      }
      await pool.query(
        `
        UPDATE payroll_runs
        SET status = 'paid', payment_date = COALESCE(?, CURDATE()), payment_reference = ?, notes = COALESCE(?, notes)
        WHERE id = ?
      `,
        [paymentDate, paymentReference, notes, runId]
      );
      await pool.query("UPDATE payroll_items SET status = 'paid' WHERE payroll_run_id = ?", [runId]);
    } else {
      await pool.query(
        'UPDATE payroll_runs SET status = ?, notes = COALESCE(?, notes) WHERE id = ?',
        [status, notes, runId]
      );
    }

    return HRService.getPayrollRunDetails(runId);
  }

  // =========================================================================
  // 6. PAYSLIP GENERATION & DOWNLOAD
  // =========================================================================

  static async getPayslip(payslipId, requestingUser) {
    const [rows] = await pool.query('SELECT * FROM payslips WHERE id = ?', [payslipId]);
    if (rows.length === 0) return null;
    const slip = rows[0];

    const isSelf = Number(slip.user_id) === Number(requestingUser.id);
    const hasAdminAccess =
      requestingUser.isOwner || requestingUser.permissions?.includes('hr.payslips.view_all');

    if (!isSelf && !hasAdminAccess) {
      const err = new Error('Access denied. You can only view your own payslips.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const [userRows] = await pool.query(
      `
      SELECT 
        u.name AS employee_name,
        u.email AS employee_email,
        ep.employee_id,
        ep.joining_date,
        ep.pan_number,
        ep.bank_name,
        ep.account_number,
        d.name AS department_name
      FROM users u
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id
      LEFT JOIN department_members dm ON u.id = dm.user_id
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE u.id = ?
    `,
      [slip.user_id]
    );

    const [runRows] = await pool.query(
      'SELECT run_code, period_start, period_end, status AS payroll_status, payment_date, payment_reference FROM payroll_runs WHERE id = ?',
      [slip.payroll_run_id]
    );

    const [desRows] = await pool.query('SELECT designation FROM user_designations WHERE user_id = ?', [slip.user_id]);

    return {
      ...slip,
      ...(userRows[0] || {}),
      ...(runRows[0] || {}),
      designations: desRows.map((d) => d.designation)
    };
  }

  static async getMyPayslips(userId, { year = null } = {}) {
    let sql = `
      SELECT ps.*, pr.run_code, pr.period_start, pr.period_end, pr.payment_date
      FROM payslips ps
      JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
      WHERE ps.user_id = ?
    `;
    const params = [userId];

    if (year) {
      sql += ' AND ps.year = ?';
      params.push(year);
    }

    sql += ' ORDER BY ps.year DESC, ps.month DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  // =========================================================================
  // 7. EMPLOYEE PERFORMANCE RECORDS
  // =========================================================================

  static async getEmployeePerformanceSummary(userId) {
    const [taskMetrics] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT t.id) AS total_assigned_tasks,
        SUM(CASE WHEN t.status IN ('completed', 'done') THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN t.status IN ('in_progress', 'todo') THEN 1 ELSE 0 END) AS active_tasks,
        SUM(CASE WHEN t.status NOT IN ('completed', 'done') AND t.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_tasks
      FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.user_id = ?
    `,
      [userId]
    );

    const [deliverableMetrics] = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_submissions,
        SUM(CASE WHEN internal_review_status = 'approved' OR client_approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_deliverables,
        SUM(CASE WHEN internal_review_status = 'changes_requested' OR client_approval_status = 'revision_requested' THEN 1 ELSE 0 END) AS revisions_requested
      FROM deliverable_submissions
      WHERE submitted_by = ?
    `,
      [userId]
    );

    const [timeMetrics] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS total_hours_logged
      FROM time_entries
      WHERE user_id = ? AND work_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND deleted_at IS NULL
    `,
      [userId]
    );

    const tm = taskMetrics[0] || {};
    const dm = deliverableMetrics[0] || {};
    const totalAssigned = Number(tm.total_assigned_tasks || 0);
    const completed = Number(tm.completed_tasks || 0);
    const completionRate = totalAssigned > 0 ? Number(((completed / totalAssigned) * 100).toFixed(1)) : 100;

    return {
      userId,
      taskMetrics: {
        totalAssigned,
        completed,
        active: Number(tm.active_tasks || 0),
        overdue: Number(tm.overdue_tasks || 0),
        completionRate
      },
      deliverableMetrics: {
        totalSubmissions: Number(dm.total_submissions || 0),
        approved: Number(dm.approved_deliverables || 0),
        revisions: Number(dm.revisions_requested || 0)
      },
      timeLoggedLast30DaysHours: Number(Number(timeMetrics[0]?.total_hours_logged || 0).toFixed(1))
    };
  }

  // =========================================================================
  // 8. HR DASHBOARD & HIGH-LEVEL METRICS
  // =========================================================================

  static async getHRDashboardMetrics() {
    const today = HRService.getTodayDateIST();

    const [empCount] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE status = 'active'");

    const [attStats] = await pool.query(
      `
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) AS half_day_count,
        SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave_count
      FROM attendance_records
      WHERE attendance_date = ?
    `,
      [today]
    );

    const [pendingLeave] = await pool.query("SELECT COUNT(*) AS cnt FROM leave_requests WHERE status = 'pending'");
    const [pendingCorrections] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM attendance_corrections WHERE status = 'pending'"
    );

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const [payroll] = await pool.query(
      'SELECT id, run_code, status, gross_total, net_total FROM payroll_runs WHERE month = ? AND year = ? LIMIT 1',
      [currentMonth, currentYear]
    );

    return {
      activeEmployees: Number(empCount[0]?.total || 0),
      todayAttendance: {
        date: today,
        present: Number(attStats[0]?.present_count || 0),
        late: Number(attStats[0]?.late_count || 0),
        halfDay: Number(attStats[0]?.half_day_count || 0),
        onLeave: Number(attStats[0]?.on_leave_count || 0)
      },
      pendingApprovals: {
        leaveRequests: Number(pendingLeave[0]?.cnt || 0),
        attendanceCorrections: Number(pendingCorrections[0]?.cnt || 0)
      },
      currentPayroll: payroll.length > 0 ? payroll[0] : null
    };
  }
}
