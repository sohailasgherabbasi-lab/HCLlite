// Client-side local database fallback engine
// Active whenever backend /api returns 404 (e.g. static Vercel, GitHub Pages, or serverless cold-error)

import {
  calculateWorkingDays,
  evaluateCheckInStatus,
  haversineDistanceMeters,
  computeEmployeePayrollItem,
  calculateAttritionRisk,
  detectAbsenceAnomalies,
} from '../../server/rules.ts';

const LOCAL_STORAGE_KEY = 'hcm_lite_browser_db_v1';

function getInitialDbState() {
  return {
    isInitialized: true,
    settings: {
      companyName: 'Zaitoon Tech Hub (HCM Lite)',
      currency: 'PKR',
      officeStart: '09:00',
      graceMinutes: 15,
      halfDayHours: 5,
      weekendDays: [0, 6],
      officeLat: 24.8607,
      officeLng: 67.0011,
      officeRadiusMeters: 150,
      leaveQuotas: { annual: 14, sick: 8, casual: 10, unpaid: -1 },
      latePenaltyDeduction: true,
    },
    users: [
      {
        id: 'usr_admin_1',
        email: 'admin@hcmlite.com',
        role: 'admin',
        name: 'Sohail Abbasi (Admin)',
        password: 'Admin123!',
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_hr_1',
        email: 'hr@hcmlite.com',
        role: 'hr',
        name: 'Ayesha Khan (HR Lead)',
        password: 'Hr123!',
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_emp_1',
        email: 'ali.raza@hcmlite.com',
        role: 'employee',
        name: 'Ali Raza',
        password: 'Emp123!',
        employeeId: 'emp_1',
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
    ],
    departments: [
      { id: 'dept_eng', name: 'Engineering', code: 'ENG', description: 'Software & Systems', createdAt: new Date().toISOString() },
      { id: 'dept_hr', name: 'Human Resources', code: 'HR', description: 'People Operations', createdAt: new Date().toISOString() },
      { id: 'dept_sales', name: 'Sales & Growth', code: 'SLS', description: 'Business Growth', createdAt: new Date().toISOString() },
    ],
    designations: [
      { id: 'des_se', name: 'Senior Full Stack Engineer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
      { id: 'des_fe', name: 'UI/UX Developer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
      { id: 'des_hr', name: 'People Operations Lead', departmentId: 'dept_hr', createdAt: new Date().toISOString() },
    ],
    holidays: [
      { id: 'hol_1', name: 'Pakistan Day', date: '2026-03-23' },
      { id: 'hol_2', name: 'Labour Day', date: '2026-05-01' },
      { id: 'hol_3', name: 'Independence Day', date: '2026-08-14' },
      { id: 'hol_4', name: 'Quaid-e-Azam Day', date: '2026-12-25' },
    ],
    employees: [
      {
        id: 'emp_1',
        employeeCode: 'EMP-001',
        userId: 'usr_emp_1',
        firstName: 'Ali',
        lastName: 'Raza',
        email: 'ali.raza@hcmlite.com',
        phone: '+92 300 1234567',
        address: 'Gulshan-e-Iqbal, Block 4, Karachi',
        gender: 'male',
        departmentId: 'dept_eng',
        designationId: 'des_se',
        joiningDate: '2025-01-15',
        status: 'active',
        basicSalary: 160000,
        hra: 64000,
        medical: 16000,
        grossSalary: 240000,
        faceEnrolled: true,
        facePhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
        faceDescriptor: Array(64).fill(0.125),
        faceEnrolledAt: '2025-01-20T10:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    attendance: [
      {
        id: 'att_1',
        employeeId: 'emp_1',
        date: new Date().toISOString().split('T')[0],
        checkInTime: `${new Date().toISOString().split('T')[0]}T08:55:00.000Z`,
        status: 'present',
        workedHours: 0,
        source: 'web',
        createdAt: new Date().toISOString(),
      },
    ],
    corrections: [],
    leaves: [],
    payrollRuns: [],
    announcements: [
      {
        id: 'ann_1',
        title: 'Welcome to HCM Lite — Saylani Hackathon 2026',
        content: 'System active on Vercel deployment. Full attendance, leave quotas, payroll and AI assistant ready.',
        authorId: 'usr_admin_1',
        authorName: 'Sohail Abbasi (Admin)',
        authorRole: 'admin',
        priority: 'important',
        category: 'policy',
        createdAt: new Date().toISOString(),
      },
    ],
    notifications: [],
    auditLogs: [],
  };
}

class ClientDb {
  private data: any;

  constructor() {
    this.data = this.load();
  }

  private load() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // fallback
    }
    const initial = getInitialDbState();
    this.save(initial);
    return initial;
  }

  private save(d?: any) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(d || this.data));
    } catch {
      // ignore
    }
  }

  public get() {
    return this.data;
  }

  public reset(empty = false) {
    if (empty) {
      this.data = {
        isInitialized: false,
        settings: { ...getInitialDbState().settings },
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
      };
    } else {
      this.data = getInitialDbState();
    }
    this.save();
    return this.data;
  }

  public mutate(fn: (draft: any) => void) {
    fn(this.data);
    this.save();
    return this.data;
  }
}

export const clientDb = new ClientDb();
