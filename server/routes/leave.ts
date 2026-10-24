import { Router, Response } from 'express';
import { db, LeaveRequest } from '../db.js';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  logAudit,
} from '../auth.js';
import { calculateWorkingDays } from '../rules.js';

export const leaveRouter = Router();

// GET /api/leave/balances
leaveRouter.get('/balances', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();
  const targetEmpId = (req.query.employeeId as string) || user.employeeId || state.employees[0]?.id;

  if (!targetEmpId) {
    return res.status(400).json({ error: 'No employee specified or found.' });
  }

  // Employee data-scope
  if (user.role === 'employee' && user.employeeId !== targetEmpId) {
    return res.status(403).json({ error: 'Access restricted: You may only view your own leave balances.' });
  }

  const quotas = state.settings.leaveQuotas;
  const approvedLeaves = state.leaves.filter(
    (l) => l.employeeId === targetEmpId && l.status === 'approved'
  );

  let usedAnnual = 0;
  let usedSick = 0;
  let usedCasual = 0;
  let usedUnpaid = 0;

  approvedLeaves.forEach((l) => {
    if (l.leaveType === 'annual') usedAnnual += l.workingDays;
    if (l.leaveType === 'sick') usedSick += l.workingDays;
    if (l.leaveType === 'casual') usedCasual += l.workingDays;
    if (l.leaveType === 'unpaid') usedUnpaid += l.workingDays;
  });

  res.json({
    annual: { total: quotas.annual, used: usedAnnual, remaining: Math.max(0, quotas.annual - usedAnnual) },
    sick: { total: quotas.sick, used: usedSick, remaining: Math.max(0, quotas.sick - usedSick) },
    casual: { total: quotas.casual, used: usedCasual, remaining: Math.max(0, quotas.casual - usedCasual) },
    unpaid: { used: usedUnpaid, remaining: 'Unlimited' },
  });
});

// GET /api/leave/requests
leaveRouter.get('/requests', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();

  let list = state.leaves;
  if (user.role === 'employee') {
    list = list.filter((l) => l.employeeId === user.employeeId);
  }

  const enriched = list.map((l) => {
    const emp = state.employees.find((e) => e.id === l.employeeId);
    const dept = state.departments.find((d) => d.id === emp?.departmentId);
    return {
      ...l,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
      employeeCode: emp?.employeeCode || 'N/A',
      departmentName: dept?.name || 'N/A',
    };
  });

  res.json(enriched);
});

// POST /api/leave/apply
leaveRouter.post('/apply', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();
  const { leaveType, startDate, endDate, reason } = req.body;

  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'Leave type, start date, end date, and reason are required.' });
  }

  const empId = user.employeeId || state.employees[0]?.id;
  if (!empId) {
    return res.status(400).json({ error: 'No associated employee record found.' });
  }

  // 1. Calculate working days (skipping weekends & public holidays)
  const workingDays = calculateWorkingDays(startDate, endDate, state.settings.weekendDays, state.holidays);
  if (workingDays <= 0) {
    return res.status(400).json({
      error: 'Selected date range falls entirely on weekends or public holidays (0 working days).',
    });
  }

  // 2. Overlap check: 422 if dates overlap with existing pending or approved leave
  const hasOverlap = state.leaves.some(
    (l) =>
      l.employeeId === empId &&
      l.status !== 'rejected' &&
      l.status !== 'cancelled' &&
      !(endDate < l.startDate || startDate > l.endDate)
  );

  if (hasOverlap) {
    return res.status(422).json({
      error: 'Leave request dates overlap with an existing pending or approved leave application.',
    });
  }

  // 3. Over-balance check: 422 if requested days exceed remaining quota
  if (leaveType !== 'unpaid') {
    const quota = state.settings.leaveQuotas[leaveType as 'annual' | 'sick' | 'casual'] || 0;
    const used = state.leaves
      .filter((l) => l.employeeId === empId && l.status === 'approved' && l.leaveType === leaveType)
      .reduce((acc, l) => acc + l.workingDays, 0);

    const remaining = Math.max(0, quota - used);
    if (workingDays > remaining) {
      return res.status(422).json({
        error: `Insufficient leave quota. You requested ${workingDays} working days, but only have ${remaining} days remaining for ${leaveType} leave.`,
        requestedDays: workingDays,
        remainingBalance: remaining,
      });
    }
  }

  const newLeave: LeaveRequest = {
    id: 'leave_' + Date.now(),
    employeeId: empId,
    leaveType,
    startDate,
    endDate,
    workingDays,
    reason: reason.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.leaves.unshift(newLeave);

    // Notify HR team
    draft.users
      .filter((u) => u.role === 'hr' || u.role === 'admin')
      .forEach((u) => {
        draft.notifications.unshift({
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
          userId: u.id,
          title: 'New Leave Application',
          message: `${user.name} applied for ${workingDays} day(s) ${leaveType} leave (${startDate} to ${endDate})`,
          type: 'leave',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      });
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'LEAVE',
    entityId: newLeave.id,
    details: `Applied for ${workingDays} days of ${leaveType} leave (${startDate} to ${endDate}): "${reason}"`,
    afterState: newLeave,
  });

  res.status(201).json({
    message: 'Leave application submitted successfully.',
    leave: newLeave,
  });
});

// POST /api/leave/:id/cancel (Employee cancels pending leave)
leaveRouter.post('/:id/cancel', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const state = db.get();

  const leave = state.leaves.find((l) => l.id === id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  if (user.role === 'employee' && user.employeeId !== leave.employeeId) {
    return res.status(403).json({ error: 'Access denied: You may only cancel your own leave requests.' });
  }

  if (leave.status !== 'pending') {
    return res.status(400).json({ error: `Cannot cancel leave that is already ${leave.status}.` });
  }

  db.update((draft) => {
    const l = draft.leaves.find((x) => x.id === id);
    if (l) {
      l.status = 'cancelled';
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'LEAVE',
    entityId: id,
    details: `Leave application cancelled for ${leave.startDate} to ${leave.endDate}`,
  });

  res.json({ message: 'Leave request cancelled' });
});

// POST /api/leave/:id/action (HR / Admin approves or rejects)
leaveRouter.post('/:id/action', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { action, reviewComment } = req.body; // action: 'approve' | 'reject'
  const user = req.user!;
  const state = db.get();

  const leave = state.leaves.find((l) => l.id === id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  if (leave.status !== 'pending') {
    return res.status(400).json({ error: `Leave request has already been ${leave.status}.` });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  db.update((draft) => {
    const l = draft.leaves.find((x) => x.id === id);
    if (l) {
      l.status = newStatus;
      l.reviewedBy = user.id;
      l.reviewedAt = new Date().toISOString();
      l.reviewComment = reviewComment?.trim();
    }

    // In-app notification to employee
    const targetEmp = draft.employees.find((e) => e.id === leave.employeeId);
    if (targetEmp) {
      draft.notifications.unshift({
        id: 'notif_' + Date.now(),
        userId: targetEmp.userId,
        title: `Leave Application ${newStatus.toUpperCase()}`,
        message: `Your ${leave.leaveType} leave request (${leave.startDate} to ${leave.endDate}) was ${newStatus} by HR${
          reviewComment ? ': ' + reviewComment : '.'
        }`,
        type: 'leave',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }
  });

  logAudit({
    req,
    action: newStatus === 'approved' ? 'APPROVE' : 'REJECT',
    entity: 'LEAVE',
    entityId: id,
    details: `Leave request for ${leave.startDate} to ${leave.endDate} was ${newStatus} by ${user.name}`,
  });

  res.json({ message: `Leave request has been ${newStatus}.`, leave: db.get().leaves.find((x) => x.id === id) });
});
