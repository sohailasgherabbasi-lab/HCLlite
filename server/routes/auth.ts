import { Router, Response } from 'express';
import { db, UserAccount, CompanySettings, Department, Designation, Employee } from '../db.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authenticate,
  AuthenticatedRequest,
  logAudit,
} from '../auth.js';

export const authRouter = Router();

// GET /api/auth/status
authRouter.get('/status', (req, res) => {
  const state = db.get();
  res.json({
    isInitialized: state.isInitialized,
    companyName: state.settings.companyName,
    adminCount: state.users.filter((u) => u.role === 'admin').length,
    employeeCount: state.employees.length,
  });
});

// POST /api/auth/first-run
authRouter.post('/first-run', (req, res) => {
  const state = db.get();
  if (state.isInitialized) {
    return res.status(400).json({ error: 'System is already configured.' });
  }

  const {
    companyName,
    currency = 'PKR',
    officeStart = '09:00',
    graceMinutes = 15,
    halfDayHours = 5,
    weekendDays = [0, 6],
    officeLat = 24.8607,
    officeLng = 67.0011,
    officeRadiusMeters = 150,
    adminName,
    adminEmail,
    adminPassword,
  } = req.body;

  if (!companyName || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Company name and admin credentials are required.' });
  }

  const adminUser: UserAccount = {
    id: 'usr_admin_' + Date.now(),
    email: adminEmail.trim().toLowerCase(),
    passwordHash: hashPassword(adminPassword),
    role: 'admin',
    name: adminName.trim(),
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const defaultDepts: Department[] = [
    { id: 'dept_eng', name: 'Engineering', code: 'ENG', createdAt: new Date().toISOString() },
    { id: 'dept_hr', name: 'Human Resources', code: 'HR', createdAt: new Date().toISOString() },
    { id: 'dept_sales', name: 'Sales & Marketing', code: 'SLS', createdAt: new Date().toISOString() },
    { id: 'dept_fin', name: 'Finance & Accounts', code: 'FIN', createdAt: new Date().toISOString() },
  ];

  const defaultDesignations: Designation[] = [
    { id: 'des_se', name: 'Senior Software Engineer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
    { id: 'des_fe', name: 'Frontend Developer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
    { id: 'des_hrm', name: 'HR Operations Manager', departmentId: 'dept_hr', createdAt: new Date().toISOString() },
    { id: 'des_ae', name: 'Account Executive', departmentId: 'dept_sales', createdAt: new Date().toISOString() },
  ];

  const defaultHolidays = [
    { id: 'hol_1', name: 'Pakistan Day', date: '2026-03-23' },
    { id: 'hol_2', name: 'Labour Day', date: '2026-05-01' },
    { id: 'hol_3', name: 'Independence Day', date: '2026-08-14' },
    { id: 'hol_4', name: 'Iqbal Day', date: '2026-11-09' },
    { id: 'hol_5', name: 'Quaid-e-Azam Day', date: '2026-12-25' },
  ];

  const updatedSettings: CompanySettings = {
    ...state.settings,
    companyName: companyName.trim(),
    currency: currency || 'PKR',
    officeStart,
    graceMinutes: Number(graceMinutes),
    halfDayHours: Number(halfDayHours),
    weekendDays,
    officeLat: Number(officeLat),
    officeLng: Number(officeLng),
    officeRadiusMeters: Number(officeRadiusMeters),
  };

  db.update((draft) => {
    draft.isInitialized = true;
    draft.settings = updatedSettings;
    draft.users.push(adminUser);
    draft.departments = defaultDepts;
    draft.designations = defaultDesignations;
    draft.holidays = defaultHolidays;
  });

  const token = generateToken(adminUser);

  logAudit({
    req: {
      user: {
        id: adminUser.id,
        name: adminUser.name,
        role: adminUser.role,
        email: adminUser.email,
      },
      ip: req.ip,
      headers: req.headers,
    } as any,
    action: 'FIRST_RUN',
    entity: 'ORGANIZATION',
    entityId: adminUser.id,
    details: `First run setup completed by ${adminUser.name} (${adminUser.email})`,
    afterState: { companyName, adminEmail },
  });

  res.status(201).json({
    token,
    user: {
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      mustChangePassword: false,
    },
    settings: updatedSettings,
  });
});

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const state = db.get();
  const user = state.users.find((u) => u.email === cleanEmail);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact your administrator.' });
  }

  const isValid = comparePassword(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Update last login
  db.update((draft) => {
    const u = draft.users.find((x) => x.id === user.id);
    if (u) {
      u.lastLoginAt = new Date().toISOString();
    }
  });

  const token = generateToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      mustChangePassword: !!user.mustChangePassword,
    },
  });
});

// POST /api/auth/change-password
authRouter.post('/change-password', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const state = db.get();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // If not first-time mandatory reset, check old password
  if (!user.mustChangePassword && oldPassword) {
    if (!comparePassword(oldPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
  }

  db.update((draft) => {
    const u = draft.users.find((x) => x.id === user.id);
    if (u) {
      u.passwordHash = hashPassword(newPassword);
      u.mustChangePassword = false;
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'AUTH',
    entityId: user.id,
    details: `Password changed for user ${user.name} (${user.email})`,
  });

  const updated = db.get().users.find((x) => x.id === user.id) || { ...user, mustChangePassword: false };
  const newToken = generateToken(updated);

  res.json({
    message: 'Password updated successfully',
    token: newToken,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      employeeId: updated.employeeId,
      mustChangePassword: false,
    },
  });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const state = db.get();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  let employeeProfile: Employee | undefined;
  if (user.employeeId) {
    employeeProfile = state.employees.find((e) => e.id === user.employeeId);
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      mustChangePassword: !!user.mustChangePassword,
    },
    employeeProfile,
    settings: state.settings,
  });
});

// POST /api/auth/seed-demo (Judges quick-start test helper)
authRouter.post('/seed-demo', (req, res) => {
  const state = db.get();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Reset to clean slate first, then seed realistic company data
  const adminPass = hashPassword('Admin123!');
  const hrPass = hashPassword('Hr123!');
  const empPass = hashPassword('Emp123!');

  const adminUser: UserAccount = {
    id: 'usr_admin_1',
    email: 'admin@hcmlite.com',
    passwordHash: adminPass,
    role: 'admin',
    name: 'Sohail Abbasi (Admin)',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const hrUser: UserAccount = {
    id: 'usr_hr_1',
    email: 'hr@hcmlite.com',
    passwordHash: hrPass,
    role: 'hr',
    name: 'Ayesha Khan (HR Lead)',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const depts: Department[] = [
    { id: 'dept_eng', name: 'Engineering', code: 'ENG', description: 'Software Development & Systems', createdAt: new Date().toISOString() },
    { id: 'dept_hr', name: 'Human Resources', code: 'HR', description: 'People & Culture', createdAt: new Date().toISOString() },
    { id: 'dept_sales', name: 'Sales & Growth', code: 'SLS', description: 'Client acquisition & partnerships', createdAt: new Date().toISOString() },
  ];

  const designations: Designation[] = [
    { id: 'des_se', name: 'Senior Full Stack Engineer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
    { id: 'des_fe', name: 'UI/UX Developer', departmentId: 'dept_eng', createdAt: new Date().toISOString() },
    { id: 'des_hr', name: 'People Operations Lead', departmentId: 'dept_hr', createdAt: new Date().toISOString() },
    { id: 'des_sls', name: 'Enterprise Sales Executive', departmentId: 'dept_sales', createdAt: new Date().toISOString() },
  ];

  // Employees
  const emp1User: UserAccount = {
    id: 'usr_emp_1',
    email: 'ali.raza@hcmlite.com',
    passwordHash: empPass,
    role: 'employee',
    name: 'Ali Raza',
    employeeId: 'emp_1',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const emp2User: UserAccount = {
    id: 'usr_emp_2',
    email: 'fatima.zahra@hcmlite.com',
    passwordHash: empPass,
    role: 'employee',
    name: 'Fatima Zahra',
    employeeId: 'emp_2',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const emp3User: UserAccount = {
    id: 'usr_emp_3',
    email: 'bilal.tariq@hcmlite.com',
    passwordHash: empPass,
    role: 'employee',
    name: 'Bilal Tariq',
    employeeId: 'emp_3',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const employees: Employee[] = [
    {
      id: 'emp_1',
      employeeCode: 'EMP-001',
      userId: emp1User.id,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'emp_2',
      employeeCode: 'EMP-002',
      userId: emp2User.id,
      firstName: 'Fatima',
      lastName: 'Zahra',
      email: 'fatima.zahra@hcmlite.com',
      phone: '+92 321 7654321',
      address: 'Clifton Block 5, Karachi',
      gender: 'female',
      departmentId: 'dept_eng',
      designationId: 'des_fe',
      joiningDate: '2025-06-01',
      status: 'active',
      basicSalary: 120000,
      hra: 48000,
      medical: 12000,
      grossSalary: 180000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'emp_3',
      employeeCode: 'EMP-003',
      userId: emp3User.id,
      firstName: 'Bilal',
      lastName: 'Tariq',
      email: 'bilal.tariq@hcmlite.com',
      phone: '+92 333 9876543',
      address: 'PECHS Block 2, Karachi',
      gender: 'male',
      departmentId: 'dept_sales',
      designationId: 'des_sls',
      joiningDate: '2025-09-10',
      status: 'probation',
      basicSalary: 100000,
      hra: 40000,
      medical: 10000,
      grossSalary: 150000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Attendance for today
  const attendance = [
    {
      id: 'att_1',
      employeeId: 'emp_1',
      date: todayStr,
      checkInTime: `${todayStr}T08:55:00.000Z`,
      checkOutTime: `${todayStr}T17:15:00.000Z`,
      status: 'present' as const,
      workedHours: 8.3,
      source: 'camera' as const,
      locationVerified: true,
      faceDetected: true,
      createdAt: `${todayStr}T08:55:00.000Z`,
    },
    {
      id: 'att_2',
      employeeId: 'emp_2',
      date: todayStr,
      checkInTime: `${todayStr}T09:25:00.000Z`,
      status: 'late' as const,
      workedHours: 0,
      source: 'web' as const,
      createdAt: `${todayStr}T09:25:00.000Z`,
    },
  ];

  // Sample approved leave
  const leaves = [
    {
      id: 'leave_1',
      employeeId: 'emp_3',
      leaveType: 'casual' as const,
      startDate: todayStr,
      endDate: todayStr,
      workingDays: 1,
      reason: 'Personal family matter',
      status: 'approved' as const,
      reviewedBy: 'usr_hr_1',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Approved by HR Lead.',
      createdAt: new Date().toISOString(),
    },
  ];

  const announcements = [
    {
      id: 'ann_1',
      title: 'Welcome to HCM Lite — Saylani Hackathon 2026',
      content: 'Company policies, automated attendance, leave quotas, and payroll are now officially active. AI Assistant is online.',
      authorId: adminUser.id,
      authorName: adminUser.name,
      authorRole: 'admin' as const,
      priority: 'important' as const,
      category: 'policy' as const,
      createdAt: new Date().toISOString(),
    },
  ];

  db.update((draft) => {
    draft.isInitialized = true;
    draft.settings = {
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
    };
    draft.users = [adminUser, hrUser, emp1User, emp2User, emp3User];
    draft.departments = depts;
    draft.designations = designations;
    draft.employees = employees;
    draft.attendance = attendance;
    draft.leaves = leaves;
    draft.announcements = announcements;
    draft.notifications = [
      {
        id: 'notif_1',
        userId: emp1User.id,
        title: 'System Initialized',
        message: 'Welcome to your employee portal. Check in and manage leaves seamlessly.',
        type: 'system',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ];
  });

  res.json({
    message: 'Demo dataset successfully loaded!',
    demoCredentials: {
      admin: { email: 'admin@hcmlite.com', password: 'Admin123!' },
      hr: { email: 'hr@hcmlite.com', password: 'Hr123!' },
      employee: { email: 'ali.raza@hcmlite.com', password: 'Emp123!' },
    },
  });
});

// POST /api/auth/reset-demo
authRouter.post('/reset-demo', (req, res) => {
  db.resetToEmpty();
  res.json({ message: 'Database reset to empty initial first-run state.' });
});
