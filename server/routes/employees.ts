import { Router, Response } from 'express';
import { db, Employee, UserAccount } from '../db.js';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  hashPassword,
  logAudit,
} from '../auth.js';
import { calculateAttritionRisk, detectAbsenceAnomalies } from '../rules.js';

export const employeesRouter = Router();

// GET /api/employees (Search, filter, paginate)
employeesRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { department, status, search, page = '1', limit = '50' } = req.query;
  const state = db.get();
  const user = req.user!;

  let emps = state.employees;

  // Data scope check
  if (user.role === 'employee') {
    emps = emps.filter((e) => e.id === user.employeeId);
  }

  if (department && typeof department === 'string') {
    emps = emps.filter((e) => e.departmentId === department);
  }

  if (status && typeof status === 'string') {
    emps = emps.filter((e) => e.status === status);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    emps = emps.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q)
    );
  }

  const total = emps.length;
  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 50;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = emps.slice(startIndex, startIndex + limitNum);

  // Map with department and designation names
  const items = paginated.map((emp) => {
    const dept = state.departments.find((d) => d.id === emp.departmentId);
    const desig = state.designations.find((d) => d.id === emp.designationId);
    return {
      ...emp,
      departmentName: dept?.name || 'Unassigned',
      designationName: desig?.name || 'Unassigned',
      // Hide salary from employee role if looking at someone else (already guarded, but double security)
      ...(user.role === 'employee' && user.employeeId !== emp.id
        ? { basicSalary: undefined, hra: undefined, medical: undefined, grossSalary: undefined }
        : {}),
    };
  });

  res.json({
    items,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /api/employees/export (CSV export)
employeesRouter.get('/export', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const state = db.get();
  const headers = ['EmployeeCode', 'FirstName', 'LastName', 'Email', 'Phone', 'Gender', 'Department', 'Designation', 'JoiningDate', 'Status', 'BasicSalary', 'GrossSalary'];
  const rows = state.employees.map((e) => {
    const dept = state.departments.find((d) => d.id === e.departmentId)?.name || '';
    const desig = state.designations.find((d) => d.id === e.designationId)?.name || '';
    return [
      e.employeeCode,
      `"${e.firstName}"`,
      `"${e.lastName}"`,
      e.email,
      `"${e.phone || ''}"`,
      e.gender,
      `"${dept}"`,
      `"${desig}"`,
      e.joiningDate,
      e.status,
      e.basicSalary,
      e.grossSalary,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="hcm_employees_export.csv"');
  res.send(csv);
});

// POST /api/employees/csv-dryrun (CSV import dry-run validation)
employeesRouter.post('/csv-dryrun', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { csvText } = req.body;
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV file is empty or missing data rows' });
  }

  const state = db.get();
  const errors: { row: number; field: string; reason: string }[] = [];
  const validRows: any[] = [];

  const headers = lines[0].split(',').map((h) => h.replace(/["\r]/g, '').trim().toLowerCase());
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  const seenCodes = new Set<string>(state.employees.map((e) => e.employeeCode.toLowerCase()));
  const seenEmails = new Set<string>(state.users.map((u) => u.email.toLowerCase()));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple split ignoring commas within quotes
    const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
    const cleanVals = values.map((v) => v.replace(/^"|"$/g, '').trim());

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cleanVals[idx] || '';
    });

    const code = rowObj['employeecode'] || rowObj['code'] || `EMP-${String(state.employees.length + i).padStart(3, '0')}`;
    const email = (rowObj['email'] || '').toLowerCase();
    const firstName = rowObj['firstname'] || rowObj['name']?.split(' ')[0] || '';
    const lastName = rowObj['lastname'] || rowObj['name']?.split(' ').slice(1).join(' ') || '';
    const deptName = rowObj['department'] || '';
    const desigName = rowObj['designation'] || '';
    const joiningDate = rowObj['joiningdate'] || rowObj['date'] || '';
    const basicSalaryStr = rowObj['basicsalary'] || rowObj['salary'] || '0';
    const basicSalary = parseFloat(basicSalaryStr);

    let hasRowError = false;

    if (!firstName) {
      errors.push({ row: i, field: 'firstName', reason: 'First name is required' });
      hasRowError = true;
    }
    if (!email || !emailRegex.test(email)) {
      errors.push({ row: i, field: 'email', reason: 'Valid email address is required' });
      hasRowError = true;
    } else if (seenEmails.has(email)) {
      errors.push({ row: i, field: 'email', reason: `Email ${email} already exists in system` });
      hasRowError = true;
    }
    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ row: i, field: 'employeeCode', reason: `Employee code ${code} is already assigned` });
      hasRowError = true;
    }
    if (!joiningDate || !dateRegex.test(joiningDate)) {
      errors.push({ row: i, field: 'joiningDate', reason: 'Joining date must be in ISO format (YYYY-MM-DD)' });
      hasRowError = true;
    }
    if (isNaN(basicSalary) || basicSalary <= 0) {
      errors.push({ row: i, field: 'basicSalary', reason: 'Basic salary must be a positive number greater than 0' });
      hasRowError = true;
    }

    // Check dept
    let dept = state.departments.find((d) => d.name.toLowerCase() === deptName.toLowerCase());
    if (!dept && state.departments.length > 0) {
      dept = state.departments[0]; // fallback default
    }

    if (!hasRowError) {
      seenCodes.add(code.toLowerCase());
      seenEmails.add(email);
      validRows.push({
        employeeCode: code,
        firstName,
        lastName: lastName || 'Employee',
        email,
        phone: rowObj['phone'] || '+92 300 0000000',
        gender: (rowObj['gender'] || 'male').toLowerCase() as any,
        departmentId: dept?.id || state.departments[0]?.id || 'dept_gen',
        designationId: state.designations[0]?.id || 'des_gen',
        joiningDate,
        basicSalary,
        status: 'active',
      });
    }
  }

  res.json({
    totalRows: lines.length - 1,
    validRowCount: validRows.length,
    errorCount: errors.length,
    errors,
    preview: validRows.slice(0, 5),
    validRows: errors.length === 0 ? validRows : [],
  });
});

// POST /api/employees/csv-import (Commit verified CSV rows)
employeesRouter.post('/csv-import', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No validated rows provided for import' });
  }

  const createdCount = rows.length;
  const tempPasswords: { email: string; tempPass: string }[] = [];

  db.update((draft) => {
    rows.forEach((r) => {
      const tempPass = 'TempPass' + Math.floor(1000 + Math.random() * 9000) + '!';
      const userId = 'usr_emp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const empId = 'emp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      const userAcc: UserAccount = {
        id: userId,
        email: r.email.toLowerCase(),
        passwordHash: hashPassword(tempPass),
        role: 'employee',
        name: `${r.firstName} ${r.lastName}`,
        employeeId: empId,
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };

      const basic = Number(r.basicSalary);
      const hra = Math.round(basic * 0.4);
      const medical = Math.round(basic * 0.1);
      const gross = basic + hra + medical;

      const emp: Employee = {
        id: empId,
        employeeCode: r.employeeCode,
        userId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email.toLowerCase(),
        phone: r.phone || '',
        address: r.address || 'Address pending update',
        gender: r.gender || 'male',
        departmentId: r.departmentId,
        designationId: r.designationId,
        joiningDate: r.joiningDate,
        status: r.status || 'active',
        basicSalary: basic,
        hra,
        medical,
        grossSalary: gross,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      draft.users.push(userAcc);
      draft.employees.push(emp);
      tempPasswords.push({ email: emp.email, tempPass });
    });
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'EMPLOYEE',
    details: `Imported ${createdCount} employees via CSV`,
  });

  res.json({
    message: `Successfully imported ${createdCount} employees. Logins generated with mandatory first-sign-in password change.`,
    count: createdCount,
    tempCredentials: tempPasswords.slice(0, 5),
  });
});

// GET /api/employees/:id (Employee 360 profile)
employeesRouter.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();

  // Data scope check
  if (user.role === 'employee' && user.employeeId !== id) {
    return res.status(403).json({
      error: 'Access restricted: You are only authorized to view your own employee profile.',
    });
  }

  const emp = state.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const dept = state.departments.find((d) => d.id === emp.departmentId);
  const desig = state.designations.find((d) => d.id === emp.designationId);
  const userAcc = state.users.find((u) => u.id === emp.userId);

  // Attendance history
  const recentAttendance = state.attendance
    .filter((a) => a.employeeId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  // Leaves
  const leaves = state.leaves
    .filter((l) => l.employeeId === id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  // Payslips
  const payslips = state.payrollRuns
    .filter((r) => r.status === 'finalized')
    .map((r) => {
      const item = r.items.find((i) => i.employeeId === id);
      return item ? { runId: r.id, month: r.month, year: r.year, finalizedAt: r.finalizedAt, ...item } : null;
    })
    .filter(Boolean);

  // Risk Score & Anomaly Detection (Bonus)
  const attritionRisk = calculateAttritionRisk(emp, state.attendance, state.leaves);
  const anomaly = detectAbsenceAnomalies(emp.id, state.attendance);

  res.json({
    ...emp,
    departmentName: dept?.name || 'Unassigned',
    designationName: desig?.name || 'Unassigned',
    isActiveLogin: userAcc?.isActive ?? true,
    recentAttendance,
    leaves,
    payslips,
    attritionRisk,
    anomaly,
  });
});

// POST /api/employees (HR registers an employee)
employeesRouter.post('/', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    address,
    gender = 'male',
    departmentId,
    designationId,
    joiningDate,
    basicSalary,
    status = 'active',
    tempPassword,
  } = req.body;

  if (!firstName || !lastName || !email || !departmentId || !designationId || !joiningDate || !basicSalary) {
    return res.status(400).json({ error: 'All primary employee details and salary are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const state = db.get();

  if (state.users.some((u) => u.email === cleanEmail) || state.employees.some((e) => e.email === cleanEmail)) {
    return res.status(409).json({ error: 'An employee with this email address already exists.' });
  }

  const code = `EMP-${String(state.employees.length + 1).padStart(3, '0')}`;
  const generatedTempPass = tempPassword || `Saylani${Math.floor(1000 + Math.random() * 9000)}!`;
  const userId = 'usr_emp_' + Date.now();
  const empId = 'emp_' + Date.now();

  const userAcc: UserAccount = {
    id: userId,
    email: cleanEmail,
    passwordHash: hashPassword(generatedTempPass),
    role: 'employee',
    name: `${firstName.trim()} ${lastName.trim()}`,
    employeeId: empId,
    isActive: true,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };

  const basic = Number(basicSalary);
  const hra = Math.round(basic * 0.4);
  const medical = Math.round(basic * 0.1);
  const gross = basic + hra + medical;

  const emp: Employee = {
    id: empId,
    employeeCode: code,
    userId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: cleanEmail,
    phone: phone?.trim() || '',
    address: address?.trim() || '',
    gender,
    departmentId,
    designationId,
    joiningDate,
    status,
    basicSalary: basic,
    hra,
    medical,
    grossSalary: gross,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.users.push(userAcc);
    draft.employees.push(emp);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'EMPLOYEE',
    entityId: emp.id,
    details: `Employee registered: ${emp.firstName} ${emp.lastName} (${emp.employeeCode}). Temporary password issued.`,
    afterState: { code: emp.employeeCode, name: userAcc.name, email: emp.email },
  });

  res.status(201).json({
    employee: emp,
    tempPassword: generatedTempPass,
  });
});

// PUT /api/employees/:id (Edit details)
employeesRouter.put('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();
  const emp = state.employees.find((e) => e.id === id);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Employee self-service scope: can only edit own phone & address
  if (user.role === 'employee') {
    if (user.employeeId !== id) {
      return res.status(403).json({ error: 'Access denied: You may only modify your own phone and address.' });
    }
    const { phone, address } = req.body;
    db.update((draft) => {
      const e = draft.employees.find((x) => x.id === id);
      if (e) {
        if (phone !== undefined) e.phone = phone.trim();
        if (address !== undefined) e.address = address.trim();
        e.updatedAt = new Date().toISOString();
      }
    });

    logAudit({
      req,
      action: 'UPDATE',
      entity: 'EMPLOYEE',
      entityId: id,
      details: `Employee self-service contact update by ${emp.firstName} ${emp.lastName}`,
    });

    return res.json({ message: 'Contact details updated successfully' });
  }

  // HR / Admin can update full profile
  const {
    firstName,
    lastName,
    phone,
    address,
    departmentId,
    designationId,
    joiningDate,
    status,
    basicSalary,
  } = req.body;

  const before = { ...emp };

  db.update((draft) => {
    const e = draft.employees.find((x) => x.id === id);
    if (e) {
      if (firstName) e.firstName = firstName.trim();
      if (lastName) e.lastName = lastName.trim();
      if (phone !== undefined) e.phone = phone.trim();
      if (address !== undefined) e.address = address.trim();
      if (departmentId) e.departmentId = departmentId;
      if (designationId) e.designationId = designationId;
      if (joiningDate) e.joiningDate = joiningDate;
      if (status) e.status = status;
      if (basicSalary !== undefined) {
        const basic = Number(basicSalary);
        e.basicSalary = basic;
        e.hra = Math.round(basic * 0.4);
        e.medical = Math.round(basic * 0.1);
        e.grossSalary = basic + e.hra + e.medical;
      }
      e.updatedAt = new Date().toISOString();

      // Sync name in user table
      const u = draft.users.find((x) => x.id === e.userId);
      if (u) {
        u.name = `${e.firstName} ${e.lastName}`;
      }
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'EMPLOYEE',
    entityId: id,
    details: `Employee profile updated for ${emp.employeeCode}`,
    beforeState: before,
    afterState: db.get().employees.find((x) => x.id === id),
  });

  res.json({ message: 'Employee updated successfully', employee: db.get().employees.find((x) => x.id === id) });
});

// POST /api/employees/:id/enroll-face (Enroll/Update Face Biometric ID)
employeesRouter.post('/:id/enroll-face', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();
  const emp = state.employees.find((e) => e.id === id);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Permission check: Admins/HR can enroll anyone, regular employee can only enroll their own face
  if (user.role === 'employee' && user.employeeId !== id) {
    return res.status(403).json({ error: 'You are only authorized to manage your own biometric face record.' });
  }

  const { photoSnapshot, descriptor } = req.body;
  if (!photoSnapshot) {
    return res.status(400).json({ error: 'Face photo snapshot is required for biometric enrollment.' });
  }

  const enrolledAt = new Date().toISOString();

  db.update((draft) => {
    const target = draft.employees.find((e) => e.id === id);
    if (target) {
      target.faceEnrolled = true;
      target.facePhotoUrl = photoSnapshot;
      target.faceDescriptor = Array.isArray(descriptor) ? descriptor : [];
      target.faceEnrolledAt = enrolledAt;
      target.faceEnrolledBy = user.name;
      target.updatedAt = enrolledAt;
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'EMPLOYEE',
    entityId: id,
    details: `Biometric Face ID enrolled for ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) by ${user.name}`,
  });

  res.json({
    message: `Face ID successfully registered for ${emp.firstName} ${emp.lastName}!`,
    employee: db.get().employees.find((e) => e.id === id),
  });
});

// DELETE /api/employees/:id/face (Remove Face Biometric Record)
employeesRouter.delete('/:id/face', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();
  const emp = state.employees.find((e) => e.id === id);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  if (user.role === 'employee' && user.employeeId !== id) {
    return res.status(403).json({ error: 'You are only authorized to manage your own biometric face record.' });
  }

  db.update((draft) => {
    const target = draft.employees.find((e) => e.id === id);
    if (target) {
      target.faceEnrolled = false;
      target.facePhotoUrl = undefined;
      target.faceDescriptor = undefined;
      target.faceEnrolledAt = undefined;
      target.faceEnrolledBy = undefined;
      target.updatedAt = new Date().toISOString();
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'EMPLOYEE',
    entityId: id,
    details: `Biometric Face ID removed for ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) by ${user.name}`,
  });

  res.json({
    message: `Face ID profile removed for ${emp.firstName} ${emp.lastName}.`,
    employee: db.get().employees.find((e) => e.id === id),
  });
});

// POST /api/employees/:id/reset-password (Admin/HR resets employee password)
employeesRouter.post('/:id/reset-password', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const user = req.user!;
  const state = db.get();
  const emp = state.employees.find((e) => e.id === id);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  const cleanPass = newPassword.trim();
  const passHash = hashPassword(cleanPass);

  db.update((draft) => {
    let u = draft.users.find(
      (x) => x.id === emp.userId || x.employeeId === emp.id || x.email.toLowerCase() === emp.email.toLowerCase()
    );

    if (u) {
      u.passwordHash = passHash;
      u.mustChangePassword = true;
    } else {
      // Create user record if none linked yet
      const newUserId = 'usr_' + emp.id;
      draft.users.push({
        id: newUserId,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email.toLowerCase(),
        passwordHash: passHash,
        role: 'employee',
        employeeId: emp.id,
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      });
      const targetEmp = draft.employees.find((e) => e.id === emp.id);
      if (targetEmp) {
        targetEmp.userId = newUserId;
      }
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'USER',
    entityId: emp.id,
    details: `Password reset by ${user.name} for employee ${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
  });

  res.json({
    message: `Password successfully reset for ${emp.firstName} ${emp.lastName}.`,
    employeeCode: emp.employeeCode,
    email: emp.email,
  });
});

// DELETE /api/employees/:id (Admin/HR permanently deletes employee and cascades records)
employeesRouter.delete('/:id', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();
  const emp = state.employees.find((e) => e.id === id);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  db.update((draft) => {
    // Delete employee
    draft.employees = draft.employees.filter((e) => e.id !== id);
    // Delete associated user account
    draft.users = draft.users.filter((u) => u.id !== emp.userId && u.employeeId !== id && u.email.toLowerCase() !== emp.email.toLowerCase());
    // Delete attendance records
    draft.attendance = draft.attendance.filter((a) => a.employeeId !== id);
    // Delete leave requests
    draft.leaves = draft.leaves.filter((l) => l.employeeId !== id);
    // Delete corrections
    draft.corrections = draft.corrections.filter((c) => c.employeeId !== id);
  });

  logAudit({
    req,
    action: 'DELETE',
    entity: 'EMPLOYEE',
    entityId: id,
    details: `Employee ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) and all linked records permanently deleted by ${user.name}`,
  });

  res.json({
    message: `Employee ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) has been permanently deleted.`,
  });
});

