import { Router, Response } from 'express';
import { db, UserAccount } from '../db.js';
import { authenticate, requireRole, AuthenticatedRequest, hashPassword, logAudit } from '../auth.js';

export const usersRouter = Router();

// GET /api/users (Admin only)
usersRouter.get('/', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const users = db.get().users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    employeeId: u.employeeId,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }));
  res.json(users);
});

// POST /api/users/hr (Admin creates HR login)
usersRouter.post('/hr', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const state = db.get();
  if (state.users.some((u) => u.email === cleanEmail)) {
    return res.status(409).json({ error: 'A user account with this email already exists.' });
  }

  const hrUser: UserAccount = {
    id: 'usr_hr_' + Date.now(),
    name: name.trim(),
    email: cleanEmail,
    passwordHash: hashPassword(password),
    role: 'hr',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.users.push(hrUser);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'USER',
    entityId: hrUser.id,
    details: `HR manager account created for ${hrUser.name} (${hrUser.email})`,
    afterState: { name: hrUser.name, email: hrUser.email, role: 'hr' },
  });

  res.status(201).json({
    id: hrUser.id,
    name: hrUser.name,
    email: hrUser.email,
    role: hrUser.role,
    isActive: hrUser.isActive,
    createdAt: hrUser.createdAt,
  });
});

// PATCH /api/users/:id/status (Admin activate/deactivate or reset password)
usersRouter.patch('/:id/status', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { isActive, resetPassword } = req.body;

  const state = db.get();
  const user = state.users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent admin from deactivating themselves
  if (user.id === req.user!.id && isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own active admin account.' });
  }

  const before = { isActive: user.isActive };
  let tempPass = '';

  db.update((draft) => {
    const u = draft.users.find((x) => x.id === id);
    if (u) {
      if (isActive !== undefined) {
        u.isActive = Boolean(isActive);
      }
      if (resetPassword) {
        tempPass = resetPassword;
        u.passwordHash = hashPassword(resetPassword);
        u.mustChangePassword = true;
      }
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'USER',
    entityId: id,
    details: `User status updated for ${user.email}: active=${isActive}${resetPassword ? ', password reset' : ''}`,
    beforeState: before,
    afterState: { isActive, passwordReset: !!resetPassword },
  });

  res.json({
    message: 'User account updated successfully',
    tempPassword: tempPass || undefined,
  });
});
