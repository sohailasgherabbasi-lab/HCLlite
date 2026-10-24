import fs from 'fs';
import path from 'path';

export interface CompanySettings {
  companyName: string;
  currency: string;
  officeStart: string; // e.g. "09:00"
  graceMinutes: number; // e.g. 15
  halfDayHours: number; // e.g. 5
  weekendDays: number[]; // [0, 6] for Sun, Sat
  officeLat: number; // e.g. 24.8607
  officeLng: number; // e.g. 67.0011
  officeRadiusMeters: number; // e.g. 150
  leaveQuotas: {
    annual: number; // 14
    sick: number; // 8
    casual: number; // 10
    unpaid: number; // -1 (unlimited)
  };
  latePenaltyDeduction: boolean; // 3 lates = 0.5 day deduction
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
  date: string; // YYYY-MM-DD
  description?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'hr' | 'employee';
  name: string;
  employeeId?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Employee {
  id: string;
  employeeCode: string; // e.g. EMP-001
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  gender: 'male' | 'female' | 'other';
  departmentId: string;
  designationId: string;
  joiningDate: string; // YYYY-MM-DD
  status: 'active' | 'probation' | 'on_leave' | 'exited';
  exitDate?: string;
  // Salary Structure
  basicSalary: number;
  hra: number; // 40% of basic
  medical: number; // 10% of basic
  grossSalary: number; // 1.5 * basic
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkInTime: string; // ISO string
  checkOutTime?: string; // ISO string
  status: 'present' | 'late' | 'half_day' | 'absent' | 'missing_checkout';
  workedHours: number;
  source: 'web' | 'camera';
  locationVerified?: boolean;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  faceDetected?: boolean;
  notes?: string;
  createdAt: string;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  attendanceId?: string;
  date: string; // YYYY-MM-DD
  requestedCheckIn: string; // HH:MM
  requestedCheckOut: string; // HH:MM
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
  leaveType: 'annual' | 'sick' | 'casual' | 'unpaid';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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
  month: number; // 1-12
  year: number; // e.g. 2026
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

export interface AILogEntry {
  id: string;
  userId: string;
  role: string;
  prompt: string;
  response: string;
  toolCalls?: string[];
  durationMs: number;
  isFallback: boolean;
  createdAt: string;
}

export interface DatabaseSchema {
  isInitialized: boolean;
  settings: CompanySettings;
  departments: Department[];
  designations: Designation[];
  holidays: PublicHoliday[];
  users: UserAccount[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  corrections: AttendanceCorrection[];
  leaves: LeaveRequest[];
  payrollRuns: PayrollRun[];
  announcements: Announcement[];
  notifications: InAppNotification[];
  auditLogs: AuditLogEntry[];
  aiLogs: AILogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'hcm_db.json');

const DEFAULT_SETTINGS: CompanySettings = {
  companyName: 'HCM Lite Technologies',
  currency: 'PKR',
  officeStart: '09:00',
  graceMinutes: 15,
  halfDayHours: 5,
  weekendDays: [0, 6], // Sun (0), Sat (6)
  officeLat: 24.8607, // Karachi / Zaitoon Ashraf IT Park coordinates
  officeLng: 67.0011,
  officeRadiusMeters: 150,
  leaveQuotas: {
    annual: 14,
    sick: 8,
    casual: 10,
    unpaid: -1,
  },
  latePenaltyDeduction: true,
};

function createInitialDatabase(): DatabaseSchema {
  return {
    isInitialized: false,
    settings: { ...DEFAULT_SETTINGS },
    departments: [],
    designations: [],
    holidays: [],
    users: [],
    employees: [],
    attendance: [],
    corrections: [],
    leaves: [],
    payrollRuns: [],
    announcements: [],
    notifications: [],
    auditLogs: [],
    aiLogs: [],
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error loading DB file, initializing fresh:', err);
    }
    const initial = createInitialDatabase();
    this.save(initial);
    return initial;
  }

  private save(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave || this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  public get(): DatabaseSchema {
    return this.data;
  }

  public update(updater: (draft: DatabaseSchema) => void): DatabaseSchema {
    updater(this.data);
    this.save();
    return this.data;
  }

  public resetToEmpty() {
    this.data = createInitialDatabase();
    this.save();
    return this.data;
  }
}

export const db = new Database();
