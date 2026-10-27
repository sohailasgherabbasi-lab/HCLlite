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
        faceEnrolled: false,
        facePhotoUrl: undefined,
        faceDescriptor: undefined,
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

import { firestore, doc, getDoc, setDoc, onSnapshot } from '../firebase.ts';

class ClientDb {
  private data: any;
  private isCloudSynced = false;
  private listeners: Array<(data: any) => void> = [];
  private syncResolve!: (value: any) => void;
  public readonly syncPromise: Promise<any>;
  private unsubscribeSnapshot: (() => void) | null = null;

  constructor() {
    this.data = this.loadLocal();
    this.syncPromise = new Promise((resolve) => {
      this.syncResolve = resolve;
    });
    this.initRealtimeFirestore();
  }

  private initRealtimeFirestore() {
    if (!firestore) {
      this.syncResolve(this.data);
      return;
    }

    try {
      const docRef = doc(firestore, 'hcm_state', 'main');
      this.unsubscribeSnapshot = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data();
            if (cloudData && typeof cloudData === 'object' && cloudData.settings) {
              this.data = cloudData;
              this.saveLocal(cloudData);
              this.isCloudSynced = true;
              this.notifyListeners();
              this.syncResolve(this.data);
              console.log('[HCM Lite Client] Real-time state synchronized from Firestore across devices.');
            }
          } else {
            // First run: Seed initial state to Firestore
            console.log('[HCM Lite Client] No remote state found in Firestore. Seeding initial database...');
            this.pushToFirestore().then(() => {
              this.isCloudSynced = true;
              this.syncResolve(this.data);
            });
          }
        },
        (error) => {
          console.warn('[HCM Lite Client] Firestore onSnapshot warning:', error.message);
          // Fall back gracefully if offline
          this.syncResolve(this.data);
        }
      );
    } catch (err: any) {
      console.warn('[HCM Lite Client] Error attaching Firestore snapshot listener:', err.message);
      this.syncResolve(this.data);
    }
  }

  public subscribe(listener: (data: any) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.data);
      } catch (e) {
        console.error('Error notifying clientDb listener:', e);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hcm_cloud_synced', { detail: this.data }));
    }
  }

  public async ensureSynced(): Promise<any> {
    if (this.isCloudSynced) return this.data;
    // Timeout race: guarantee resolution within 3.5s so offline UI never hangs
    return Promise.race([
      this.syncPromise,
      new Promise((res) => setTimeout(() => res(this.data), 3500)),
    ]);
  }

  public async syncFromFirestore(): Promise<any> {
    try {
      if (!firestore) return this.data;
      const snap = await getDoc(doc(firestore, 'hcm_state', 'main'));
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData && typeof cloudData === 'object' && cloudData.settings) {
          this.data = cloudData;
          this.saveLocal(cloudData);
          this.isCloudSynced = true;
          this.notifyListeners();
          return this.data;
        }
      } else {
        await this.pushToFirestore();
      }
    } catch (err: any) {
      console.warn('[HCM Lite Client] Firestore sync warning:', err.message);
    }
    return this.data;
  }

  public async pushToFirestore(): Promise<void> {
    try {
      if (!firestore) return;
      await setDoc(doc(firestore, 'hcm_state', 'main'), this.data);
    } catch (err: any) {
      console.warn('[HCM Lite Client] Failed to push update to Firestore:', err.message);
    }
  }

  private loadLocal() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // fallback
    }
    const initial = getInitialDbState();
    this.saveLocal(initial);
    return initial;
  }

  private saveLocal(d?: any) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(d || this.data));
    } catch {
      // ignore
    }
  }

  public get() {
    return this.data;
  }

  public async reset(empty = false) {
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
    this.saveLocal();
    await this.pushToFirestore();
    this.notifyListeners();
    return this.data;
  }

  public async mutateAsync(fn: (draft: any) => void): Promise<any> {
    fn(this.data);
    this.saveLocal();
    await this.pushToFirestore();
    this.notifyListeners();
    return this.data;
  }

  public async mutate(fn: (draft: any) => void): Promise<any> {
    fn(this.data);
    this.saveLocal();
    await this.pushToFirestore();
    this.notifyListeners();
    return this.data;
  }
}

export const clientDb = new ClientDb();

