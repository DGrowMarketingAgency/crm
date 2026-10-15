import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 8: HR Management, Attendance, Leave & Payroll Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let hrAdminCookie = '';
  let hrAdminId;

  let employeeCookie = '';
  let employeeId;

  let otherEmployeeCookie = '';
  let otherEmployeeId;

  let createdCorrectionId;
  let createdLeaveRequestId;
  let createdPayrollRunId;
  let generatedPayslipId;

  beforeAll(async () => {
    // 1. Ensure RBAC seeded
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const setupUser = async (email, name, roleSlug, dept = 'HR') => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, status, department, role)
         VALUES (?, ?, ?, 'active', ?, ?)
         ON DUPLICATE KEY UPDATE status = 'active', department = ?, role = ?`,
        [name, email, passwordHash, dept, roleSlug, dept, roleSlug]
      );

      const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const userId = users[0].id;

      const [roles] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (roles.length > 0) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
          [userId, roles[0].id]
        );
      }

      // Login to get session cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = loginRes.headers['set-cookie'] || [];
      const sessionCookie = setCookies.find((c) => c.startsWith('access_token='));

      return { userId, cookie: sessionCookie };
    };

    const hrAdmin = await setupUser('hr.director.test@dgrow.agency', 'HR Director', 'hr-admin');
    hrAdminId = hrAdmin.userId;
    hrAdminCookie = hrAdmin.cookie;

    const emp1 = await setupUser('sarah.developer.test@dgrow.agency', 'Sarah Dev', 'dev-exec');
    employeeId = emp1.userId;
    employeeCookie = emp1.cookie;

    const emp2 = await setupUser('alex.designer.test@dgrow.agency', 'Alex Design', 'design-exec');
    otherEmployeeId = emp2.userId;
    otherEmployeeCookie = emp2.cookie;

    // Clean up test data for test users
    const today = new Date().toISOString().split('T')[0];
    await pool.query('DELETE FROM attendance_records WHERE user_id IN (?, ?) AND attendance_date = ?', [
      employeeId,
      otherEmployeeId,
      today
    ]);
    await pool.query('DELETE FROM leave_requests WHERE user_id IN (?, ?)', [
      employeeId,
      otherEmployeeId
    ]);
    await pool.query('UPDATE leave_balances SET used = 0 WHERE user_id IN (?, ?)', [
      employeeId,
      otherEmployeeId
    ]);
    await pool.query('DELETE FROM attendance_corrections WHERE user_id IN (?, ?)', [
      employeeId,
      otherEmployeeId
    ]);
  });

  afterAll(async () => {
    // Clean up created records if needed
  });

  // =========================================================================
  // 1. EMPLOYEE DIRECTORY & PROFILES
  // =========================================================================
  describe('Employee Directory & Profile Management', () => {
    it('HR Admin can list employees with department and designation metadata', async () => {
      const res = await request(app)
        .get('/api/hr/employees')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('Employee can retrieve own comprehensive profile including leave balances', async () => {
      const res = await request(app)
        .get(`/api/hr/employees/${employeeId}`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(employeeId);
      expect(Array.isArray(res.body.data.leaveBalances)).toBe(true);
    });

    it('HR Admin can update an employee profile with work schedule and employment type', async () => {
      const res = await request(app)
        .put(`/api/hr/employees/${employeeId}`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          employmentType: 'full_time',
          employmentStatus: 'confirmed',
          workLocation: 'Bangalore HQ',
          workScheduleId: 1
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.employment_status).toBe('confirmed');
      expect(res.body.data.work_location).toBe('Bangalore HQ');
    });

    it('Ordinary employee cannot update HR profile fields of other employees', async () => {
      const res = await request(app)
        .put(`/api/hr/employees/${otherEmployeeId}`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          employmentStatus: 'terminated'
        });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. ATTENDANCE MANAGEMENT
  // =========================================================================
  describe('Attendance Tracking, Kiosk & Corrections', () => {
    it('Employee can record a valid check-in', async () => {
      const res = await request(app)
        .post('/api/hr/attendance/check-in')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Arrived on time at office' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.user_id).toBe(employeeId);
      expect(res.body.data.check_in_time).toBeDefined();
    });

    it('Employee cannot perform a duplicate check-in on the same day', async () => {
      const res = await request(app)
        .post('/api/hr/attendance/check-in')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Second check-in attempt' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_CHECK_IN');
    });

    it('Employee can retrieve today attendance status', async () => {
      const res = await request(app)
        .get('/api/hr/attendance/today')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user_id).toBe(employeeId);
      expect(res.body.data.check_in_time).not.toBeNull();
    });

    it('Employee can record a valid check-out', async () => {
      const res = await request(app)
        .post('/api/hr/attendance/check-out')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Leaving for the day' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.check_out_time).not.toBeNull();
      expect(Number(res.body.data.total_working_hours)).toBeGreaterThanOrEqual(0);
    });

    it('Employee cannot check out a second time on the same day', async () => {
      const res = await request(app)
        .post('/api/hr/attendance/check-out')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Second checkout attempt' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_CHECKED_OUT');
    });

    it('Employee can submit an attendance correction request', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = await request(app)
        .post('/api/hr/attendance/corrections')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          attendanceDate: yesterday,
          requestedCheckIn: `${yesterday} 10:00:00`,
          requestedCheckOut: `${yesterday} 19:00:00`,
          reason: 'Biometric kiosk was offline during arrival'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      createdCorrectionId = res.body.data.id;
    });

    it('HR Admin can review and approve attendance correction', async () => {
      const res = await request(app)
        .put(`/api/hr/attendance/corrections/${createdCorrectionId}/review`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'approved',
          reviewNotes: 'Verified with security register'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
    });

    it('HR Admin can view team attendance records', async () => {
      const res = await request(app)
        .get('/api/hr/attendance/team')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // =========================================================================
  // 3. LEAVE MANAGEMENT
  // =========================================================================
  describe('Leave Applications, Balances & Approvals', () => {
    it('Employee can retrieve active leave types', async () => {
      const res = await request(app)
        .get('/api/hr/leave/types')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });

    it('Employee can apply for casual leave', async () => {
      // Pick dates in future month to avoid conflicts
      const futureStart = '2026-11-10';
      const futureEnd = '2026-11-11';

      const res = await request(app)
        .post('/api/hr/leave/apply')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          leaveTypeId: 1, // Casual Leave
          startDate: futureStart,
          endDate: futureEnd,
          reason: 'Family function attendance'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.durationDays).toBe(2);
      expect(res.body.data.status).toBe('pending');
      createdLeaveRequestId = res.body.data.id;
    });

    it('System prevents overlapping leave applications', async () => {
      const res = await request(app)
        .post('/api/hr/leave/apply')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          leaveTypeId: 1,
          startDate: '2026-11-11',
          endDate: '2026-11-12',
          reason: 'Overlapping request'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OVERLAPPING_LEAVE');
    });

    it('HR Admin can review and approve leave request', async () => {
      const res = await request(app)
        .put(`/api/hr/leave/requests/${createdLeaveRequestId}/review`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'approved',
          reviewNotes: 'Approved. Enjoy the family event.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
    });

    it('Employee can cancel eligible leave and restore balances', async () => {
      // Apply a one-day leave to cancel
      const appRes = await request(app)
        .post('/api/hr/leave/apply')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          leaveTypeId: 2, // Sick Leave
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          reason: 'Medical checkup'
        });

      expect(appRes.status).toBe(201);
      const reqId = appRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/hr/leave/${reqId}/cancel`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });
  });

  // =========================================================================
  // 4. SALARY STRUCTURES & PAYROLL
  // =========================================================================
  describe('Salary Structures, Payroll Runs & Payslips', () => {
    it('HR Admin can fetch configured salary components', async () => {
      const res = await request(app)
        .get('/api/hr/salary/components')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    });

    it('HR Admin can assign an effective-dated salary structure to an employee', async () => {
      const res = await request(app)
        .post(`/api/hr/salary/assign/${employeeId}`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          effectiveFrom: '2026-01-01',
          grossBaseSalary: 75000,
          netMonthlySalary: 67200,
          componentsJson: {
            basic: 37500,
            hra: 18750,
            special_allowance: 18750
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.grossBaseSalary)).toBe(75000);
    });

    it('Ordinary employee cannot access salary components configuration', async () => {
      const res = await request(app)
        .get('/api/hr/salary/components')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(403);
    });

    it('HR Admin can create a draft monthly payroll run', async () => {
      // Use test period month 8, year 2026
      const month = 8;
      const year = 2026;

      // Clean up previous test run if any
      await pool.query('DELETE FROM payroll_runs WHERE month = ? AND year = ?', [month, year]);

      const res = await request(app)
        .post('/api/hr/payroll/runs')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          month,
          year,
          notes: 'August 2026 agency payroll run'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('draft');
      expect(Number(res.body.data.total_employees)).toBeGreaterThan(0);
      expect(Number(res.body.data.gross_total)).toBeGreaterThan(0);
      createdPayrollRunId = res.body.data.id;
    });

    it('System prevents creating duplicate payroll runs for the same period', async () => {
      const res = await request(app)
        .post('/api/hr/payroll/runs')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          month: 8,
          year: 2026,
          notes: 'Duplicate attempt'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_PAYROLL_RUN');
    });

    it('HR Admin can transition payroll lifecycle from draft to approved to finalized', async () => {
      // 1. Submit for approval
      const subRes = await request(app)
        .put(`/api/hr/payroll/runs/${createdPayrollRunId}/status`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ status: 'pending_approval' });
      expect(subRes.status).toBe(200);

      // 2. Approve
      const appRes = await request(app)
        .put(`/api/hr/payroll/runs/${createdPayrollRunId}/status`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ status: 'approved' });
      expect(appRes.status).toBe(200);

      // 3. Finalize
      const finRes = await request(app)
        .put(`/api/hr/payroll/runs/${createdPayrollRunId}/status`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ status: 'finalized' });
      expect(finRes.status).toBe(200);
      expect(finRes.body.data.status).toBe('finalized');
    });

    it('Finalizing payroll creates immutable payslips for employees', async () => {
      const [slips] = await pool.query('SELECT * FROM payslips WHERE payroll_run_id = ?', [
        createdPayrollRunId
      ]);

      expect(slips.length).toBeGreaterThan(0);
      const empSlip = slips.find((s) => s.user_id === employeeId);
      expect(empSlip).toBeDefined();
      generatedPayslipId = empSlip.id;
    });

    it('Employee can securely view their own finalized payslip', async () => {
      const res = await request(app)
        .get(`/api/hr/payslips/${generatedPayslipId}`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user_id).toBe(employeeId);
      expect(Number(res.body.data.net_payable)).toBeGreaterThan(0);
    });

    it('Employee cannot view another employee payslip', async () => {
      const res = await request(app)
        .get(`/api/hr/payslips/${generatedPayslipId}`)
        .set('Cookie', [otherEmployeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(403);
    });

    it('HR Admin can mark finalized payroll run as paid with payment reference', async () => {
      const res = await request(app)
        .put(`/api/hr/payroll/runs/${createdPayrollRunId}/status`)
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'paid',
          paymentDate: '2026-08-31',
          paymentReference: 'NEFT-DGROW-AUG26-78921'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.payment_reference).toBe('NEFT-DGROW-AUG26-78921');
    });
  });

  // =========================================================================
  // 5. EMPLOYEE PERFORMANCE SUMMARY & HR DASHBOARD
  // =========================================================================
  describe('Performance Summaries & HR Dashboard Metrics', () => {
    it('Can fetch objective employee performance summary from tasks and deliverables', async () => {
      const res = await request(app)
        .get(`/api/hr/employees/${employeeId}/performance`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.taskMetrics).toBeDefined();
      expect(res.body.data.deliverableMetrics).toBeDefined();
    });

    it('HR Dashboard returns live aggregate metrics from database', async () => {
      const res = await request(app)
        .get('/api/hr/dashboard')
        .set('Cookie', [hrAdminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeEmployees).toBeGreaterThanOrEqual(1);
      expect(res.body.data.todayAttendance).toBeDefined();
      expect(res.body.data.pendingApprovals).toBeDefined();
    });
  });
});
