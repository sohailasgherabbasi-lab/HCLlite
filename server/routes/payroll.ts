import { Router, Response } from 'express';
import { db, PayrollRun, PayrollItem } from '../db.js';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  logAudit,
} from '../auth.js';
import { computeEmployeePayrollItem } from '../rules.js';

export const payrollRouter = Router();

// GET /api/payroll/runs
payrollRouter.get('/runs', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();

  if (user.role === 'employee') {
    // Only return finalized runs containing employee's payslip
    const finalizedRuns = state.payrollRuns
      .filter((r) => r.status === 'finalized')
      .map((r) => {
        const item = r.items.find((i) => i.employeeId === user.employeeId);
        return item
          ? {
              id: r.id,
              month: r.month,
              year: r.year,
              status: r.status,
              finalizedAt: r.finalizedAt,
              myPayslip: item,
            }
          : null;
      })
      .filter(Boolean);
    return res.json(finalizedRuns);
  }

  // Admin & HR see full runs
  res.json(state.payrollRuns);
});

// GET /api/payroll/runs/:id
payrollRouter.get('/runs/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();

  const run = state.payrollRuns.find((r) => r.id === id);
  if (!run) {
    return res.status(404).json({ error: 'Payroll run not found' });
  }

  if (user.role === 'employee') {
    const item = run.items.find((i) => i.employeeId === user.employeeId);
    if (!item) {
      return res.status(403).json({ error: 'Access restricted: Payslip not available.' });
    }
    return res.json({
      ...run,
      items: [item],
    });
  }

  res.json(run);
});

// POST /api/payroll/draft (HR / Admin creates monthly payroll draft)
payrollRouter.post('/draft', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { month, year } = req.body;
  const user = req.user!;
  const state = db.get();

  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (!m || !y || m < 1 || m > 12) {
    return res.status(400).json({ error: 'Valid month (1-12) and year are required.' });
  }

  // Check if finalized run already exists for this period
  const existingFinalized = state.payrollRuns.find((r) => r.month === m && r.year === y && r.status === 'finalized');
  if (existingFinalized) {
    return res.status(400).json({ error: `Payroll for ${m}/${y} has already been finalized and locked.` });
  }

  const activeEmployees = state.employees.filter((e) => e.status !== 'exited');
  if (activeEmployees.length === 0) {
    return res.status(400).json({ error: 'No active employees registered to calculate payroll for.' });
  }

  const items: PayrollItem[] = activeEmployees.map((emp) => {
    const dept = state.departments.find((d) => d.id === emp.departmentId);
    const computed = computeEmployeePayrollItem(
      emp,
      m,
      y,
      state.settings,
      state.holidays,
      state.attendance,
      state.leaves
    );

    return {
      id: 'item_' + emp.id + '_' + Date.now(),
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      departmentName: dept?.name || 'Unassigned',
      ...computed,
    };
  });

  const totalGross = items.reduce((sum, i) => sum + i.grossSalary, 0);
  const totalDeductions = items.reduce((sum, i) => sum + i.totalDeductions, 0);
  const totalTax = items.reduce((sum, i) => sum + i.monthlyTax, 0);
  const totalNet = items.reduce((sum, i) => sum + i.netSalary, 0);

  // Remove previous draft for this period if present
  const newRun: PayrollRun = {
    id: 'pr_' + y + '_' + m + '_' + Date.now(),
    month: m,
    year: y,
    status: 'draft',
    totalGross,
    totalDeductions,
    totalTax,
    totalNet,
    employeeCount: items.length,
    createdBy: user.name,
    items,
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.payrollRuns = draft.payrollRuns.filter((r) => !(r.month === m && r.year === y && r.status === 'draft'));
    draft.payrollRuns.unshift(newRun);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'PAYROLL',
    entityId: newRun.id,
    details: `Payroll draft created for ${m}/${y} covering ${items.length} employees (Total Net: PKR ${totalNet.toLocaleString()})`,
    afterState: { month: m, year: y, totalNet, employeeCount: items.length },
  });

  res.status(201).json({
    message: `Payroll draft for ${m}/${y} created successfully.`,
    run: newRun,
  });
});

// POST /api/payroll/runs/:id/finalize (Admin ONLY)
payrollRouter.post('/:id/finalize', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();

  const run = state.payrollRuns.find((r) => r.id === id);
  if (!run) {
    return res.status(404).json({ error: 'Payroll run not found' });
  }

  if (run.status === 'finalized') {
    return res.status(400).json({ error: 'This payroll run is already locked and finalized.' });
  }

  const nowISO = new Date().toISOString();

  db.update((draft) => {
    const r = draft.payrollRuns.find((x) => x.id === id);
    if (r) {
      r.status = 'finalized';
      r.finalizedBy = user.name;
      r.finalizedAt = nowISO;
    }

    // Send in-app notification to all included employees
    run.items.forEach((item) => {
      const emp = draft.employees.find((e) => e.id === item.employeeId);
      if (emp) {
        draft.notifications.unshift({
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          userId: emp.userId,
          title: 'Payslip Released',
          message: `Your payslip for ${run.month}/${run.year} is now ready for view & download (Net: PKR ${item.netSalary.toLocaleString()}).`,
          type: 'payroll',
          isRead: false,
          createdAt: nowISO,
        });
      }
    });
  });

  logAudit({
    req,
    action: 'FINALIZE',
    entity: 'PAYROLL',
    entityId: id,
    details: `Payroll for ${run.month}/${run.year} finalized and locked by Admin (${user.name})`,
  });

  res.json({
    message: `Payroll for ${run.month}/${run.year} successfully locked and finalized. Payslips released.`,
    run: db.get().payrollRuns.find((x) => x.id === id),
  });
});

// GET /api/payroll/payslips/:id (Download / view single employee payslip)
payrollRouter.get('/payslips/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();

  for (const run of state.payrollRuns) {
    const item = run.items.find((i) => i.id === id || i.employeeId === id);
    if (item) {
      // Check data scope: Employee can only see own
      if (user.role === 'employee' && user.employeeId !== item.employeeId) {
        return res.status(403).json({ error: 'Access restricted: You cannot view colleague payslips.' });
      }

      const emp = state.employees.find((e) => e.id === item.employeeId);
      return res.json({
        payslip: item,
        month: run.month,
        year: run.year,
        isFinalized: run.status === 'finalized',
        finalizedAt: run.finalizedAt,
        companyName: state.settings.companyName,
        currency: state.settings.currency,
        employee: emp,
      });
    }
  }

  res.status(404).json({ error: 'Payslip not found' });
});
