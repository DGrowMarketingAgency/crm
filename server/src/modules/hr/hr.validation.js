import { z } from 'zod';

export const updateEmployeeProfileSchema = z.object({
  employeeId: z.string().min(2).max(50).optional(),
  employee_id: z.string().min(2).max(50).optional(),
  reportingManagerId: z.number().int().positive().nullable().optional(),
  reporting_manager_id: z.number().int().positive().nullable().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  employmentStatus: z.enum(['probation', 'confirmed', 'notice_period', 'resigned', 'terminated', 'active']).optional(),
  employment_status: z.enum(['probation', 'confirmed', 'notice_period', 'resigned', 'terminated', 'active']).optional(),
  workLocation: z.string().max(100).optional(),
  work_location: z.string().max(100).optional(),
  workScheduleId: z.number().int().positive().nullable().optional(),
  work_schedule_id: z.number().int().positive().nullable().optional(),
  bankName: z.string().max(100).nullable().optional(),
  bank_name: z.string().max(100).nullable().optional(),
  accountNumber: z.string().max(100).nullable().optional(),
  account_number: z.string().max(100).nullable().optional(),
  ifscCode: z.string().max(50).nullable().optional(),
  ifsc_code: z.string().max(50).nullable().optional(),
  panNumber: z.string().max(50).nullable().optional(),
  pan_number: z.string().max(50).nullable().optional()
});

export const checkInSchema = z.object({
  notes: z.string().max(500).optional().nullable()
});

export const checkOutSchema = z.object({
  notes: z.string().max(500).optional().nullable()
});

export const attendanceCorrectionSchema = z.object({
  attendanceRecordId: z.number().int().positive().optional().nullable(),
  attendance_record_id: z.number().int().positive().optional().nullable(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  requestedCheckIn: z.string().min(5, 'Check-in time is required'),
  requested_check_in: z.string().optional(),
  requestedCheckOut: z.string().min(5, 'Check-out time is required'),
  requested_check_out: z.string().optional(),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(1000)
});

export const reviewCorrectionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().max(1000).optional().nullable(),
  review_notes: z.string().max(1000).optional().nullable()
});

export const applyLeaveSchema = z.object({
  leaveTypeId: z.number().int().positive(),
  leave_type_id: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  isHalfDay: z.boolean().optional().default(false),
  is_half_day: z.boolean().optional(),
  halfDaySession: z.enum(['first_half', 'second_half']).nullable().optional(),
  half_day_session: z.enum(['first_half', 'second_half']).nullable().optional(),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(1000),
  attachmentUrl: z.string().max(500).nullable().optional(),
  attachment_url: z.string().max(500).nullable().optional()
});

export const reviewLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().max(1000).optional().nullable(),
  review_notes: z.string().max(1000).optional().nullable()
});

export const assignSalarySchema = z.object({
  userId: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD').optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  grossBaseSalary: z.number().positive('Gross base salary must be greater than zero'),
  gross_base_salary: z.number().positive().optional(),
  componentsJson: z.any().optional(),
  components_json: z.any().optional(),
  netMonthlySalary: z.number().positive('Net monthly salary must be greater than zero'),
  net_monthly_salary: z.number().positive().optional()
});

export const createPayrollRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2050),
  notes: z.string().max(1000).optional().nullable()
});

export const updatePayrollStatusSchema = z.object({
  status: z.enum(['processing', 'pending_approval', 'approved', 'finalized', 'paid', 'reversed']),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  paymentReference: z.string().max(100).nullable().optional(),
  payment_reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).optional().nullable()
});
