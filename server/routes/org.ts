import { Router, Response } from 'express';
import { db, Department, Designation, PublicHoliday } from '../db.js';
import { authenticate, requireRole, AuthenticatedRequest, logAudit } from '../auth.js';

export const orgRouter = Router();

// GET /api/org/settings
orgRouter.get('/settings', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const state = db.get();
  res.json({
    settings: state.settings,
    departments: state.departments,
    designations: state.designations,
    holidays: state.holidays,
  });
});

// PUT /api/org/settings (Admin only)
orgRouter.put('/settings', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const state = db.get();
  const before = { ...state.settings };
  const updates = req.body;

  db.update((draft) => {
    draft.settings = {
      ...draft.settings,
      ...updates,
      graceMinutes: Number(updates.graceMinutes ?? draft.settings.graceMinutes),
      halfDayHours: Number(updates.halfDayHours ?? draft.settings.halfDayHours),
      officeLat: Number(updates.officeLat ?? draft.settings.officeLat),
      officeLng: Number(updates.officeLng ?? draft.settings.officeLng),
      officeRadiusMeters: Number(updates.officeRadiusMeters ?? draft.settings.officeRadiusMeters),
      leaveQuotas: {
        ...draft.settings.leaveQuotas,
        ...(updates.leaveQuotas || {}),
      },
    };
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'ORGANIZATION',
    details: 'Company operational settings and policies updated',
    beforeState: before,
    afterState: db.get().settings,
  });

  res.json({ settings: db.get().settings });
});

// GET /api/org/departments
orgRouter.get('/departments', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.json(db.get().departments);
});

// POST /api/org/departments (Admin only)
orgRouter.post('/departments', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, description } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Department name and code are required' });
  }

  const dept: Department = {
    id: 'dept_' + Date.now(),
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description: description?.trim(),
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.departments.push(dept);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ORGANIZATION',
    entityId: dept.id,
    details: `Department created: ${dept.name} (${dept.code})`,
    afterState: dept,
  });

  res.status(201).json(dept);
});

// DELETE /api/org/departments/:id (Admin only)
orgRouter.delete('/departments/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state = db.get();
  const dept = state.departments.find((d) => d.id === id);
  if (!dept) {
    return res.status(404).json({ error: 'Department not found' });
  }

  // Check if assigned to any active employee
  const hasEmployees = state.employees.some((e) => e.departmentId === id && e.status !== 'exited');
  if (hasEmployees) {
    return res.status(400).json({ error: 'Cannot delete department that has active employees assigned to it.' });
  }

  db.update((draft) => {
    draft.departments = draft.departments.filter((d) => d.id !== id);
  });

  logAudit({
    req,
    action: 'DELETE',
    entity: 'ORGANIZATION',
    entityId: id,
    details: `Department deleted: ${dept.name}`,
    beforeState: dept,
  });

  res.json({ message: 'Department removed successfully' });
});

// GET /api/org/designations
orgRouter.get('/designations', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.json(db.get().designations);
});

// POST /api/org/designations (Admin only)
orgRouter.post('/designations', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name, departmentId } = req.body;
  if (!name || !departmentId) {
    return res.status(400).json({ error: 'Designation name and department are required' });
  }

  const desig: Designation = {
    id: 'des_' + Date.now(),
    name: name.trim(),
    departmentId,
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.designations.push(desig);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ORGANIZATION',
    entityId: desig.id,
    details: `Designation created: ${desig.name}`,
    afterState: desig,
  });

  res.status(201).json(desig);
});

// GET /api/org/holidays
orgRouter.get('/holidays', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.json(db.get().holidays);
});

// POST /api/org/holidays (Admin only)
orgRouter.post('/holidays', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name, date, description } = req.body;
  if (!name || !date) {
    return res.status(400).json({ error: 'Holiday name and date are required' });
  }

  const holiday: PublicHoliday = {
    id: 'hol_' + Date.now(),
    name: name.trim(),
    date,
    description,
  };

  db.update((draft) => {
    draft.holidays.push(holiday);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ORGANIZATION',
    entityId: holiday.id,
    details: `Public holiday registered: ${holiday.name} on ${holiday.date}`,
    afterState: holiday,
  });

  res.status(201).json(holiday);
});

// DELETE /api/org/holidays/:id (Admin only)
orgRouter.delete('/holidays/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state = db.get();
  const hol = state.holidays.find((h) => h.id === id);
  if (!hol) {
    return res.status(404).json({ error: 'Holiday not found' });
  }

  db.update((draft) => {
    draft.holidays = draft.holidays.filter((h) => h.id !== id);
  });

  logAudit({
    req,
    action: 'DELETE',
    entity: 'ORGANIZATION',
    entityId: id,
    details: `Public holiday removed: ${hol.name} on ${hol.date}`,
    beforeState: hol,
  });

  res.json({ message: 'Holiday deleted' });
});
