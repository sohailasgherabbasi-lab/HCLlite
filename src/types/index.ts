export type UserRole = 'admin' | 'hr' | 'employee';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  mustChangePassword?: boolean;
}

export interface CompanySettings {
  companyName: string;
  currency: string;
  officeStart: string;
  graceMinutes: number;
  halfDayHours: number;
  weekendDays: number[];
  officeLat: number;
  officeLng: number;
  officeRadiusMeters: number;
  leaveQuotas: {
    annual: number;
    sick: number;
    casual: number;
    unpaid: number;
  };
  latePenaltyDeduction: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  createdAt: string;
}

export interface Designation {
  id: string;
  name: string;
  departmentId: string;
  createdAt: string;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  description?: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  gender: 'male' | 'female' | 'other';
  departmentId: string;
  departmentName?: string;
  designationId: string;
  designationName?: string;
  joiningDate: string;
  status: 'active' | 'probation' | 'on_leave' | 'exited';
  exitDate?: string;
  basicSalary?: number;
  hra?: number;
  medical?: number;
  grossSalary?: number;
  createdAt: string;
  updatedAt: string;
  // 360 profile extras
  isActiveLogin?: boolean;
  recentAttendance?: AttendanceRecord[];
  leaves?: LeaveRequest[];
  payslips?: any[];
  attritionRisk?: { score: number; level: 'Low' | 'Medium' | 'High'; reasons: string[] };
  anomaly?: { hasAnomaly: boolean; message?: string };
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'present' | 'late' | 'half_day' | 'absent' | 'missing_checkout';
  workedHours: number;
  source: 'web' | 'camera';
  locationVerified?: boolean;
  distanceMeters?: number;
  faceDetected?: boolean;
  notes?: string;
  createdAt: string;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  attendanceId?: string;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  requestedCheckIn: string;
  requestedCheckOut: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  departmentName?: string;
  leaveType: 'annual' | 'sick' | 'casual' | 'unpaid';
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt: string;
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  basicSalary: number;
  hra: number;
  medical: number;
  grossSalary: number;
  workingDaysInMonth: number;
  daysWorked: number;
  absentDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
  lateCount: number;
  latePenaltyDays: number;
  deductionAbsent: number;
  deductionUnpaidLeave: number;
  deductionHalfDay: number;
  deductionLatePenalty: number;
  totalDeductions: number;
  annualTaxable: number;
  annualTax: number;
  monthlyTax: number;
  netSalary: number;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: 'draft' | 'finalized';
  totalGross: number;
  totalDeductions: number;
  totalTax: number;
  totalNet: number;
  employeeCount: number;
  createdBy: string;
  finalizedBy?: string;
  finalizedAt?: string;
  items: PayrollItem[];
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'hr';
  priority: 'normal' | 'important';
  category: 'general' | 'policy' | 'holiday' | 'event';
  createdAt: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'leave' | 'attendance' | 'payroll' | 'system';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'FINALIZE' | 'LOGIN' | 'FIRST_RUN';
  entity: 'ORGANIZATION' | 'USER' | 'EMPLOYEE' | 'ATTENDANCE' | 'LEAVE' | 'PAYROLL' | 'ANNOUNCEMENT' | 'AUTH';
  entityId?: string;
  details: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  ip?: string;
  createdAt: string;
}
