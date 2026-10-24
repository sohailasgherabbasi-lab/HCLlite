import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, UserAccount, AuditLogEntry } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hcm_lite_jwt_secret_saylani_hackathon_2026';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'hr' | 'employee';
  name: string;
  employeeId?: string;
  mustChangePassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(plainText: string): string {
  return bcrypt.hashSync(plainText, 10);
}

export function comparePassword(plainText: string, hash: string): boolean {
  return bcrypt.compareSync(plainText, hash);
}

export function generateToken(user: UserAccount): string {
  const payload: AuthUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    
    // In serverless / multi-container environments, if user is not in current container memory,
    // restore the user from the cryptographically verified JWT payload
    let current = db.get().users.find((u) => u.id === decoded.id);
    if (!current) {
      current = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || 'User',
        role: decoded.role,
        employeeId: decoded.employeeId,
        isActive: true,
        mustChangePassword: decoded.mustChangePassword,
        passwordHash: '',
        createdAt: new Date().toISOString(),
      };
      db.update((draft) => {
        draft.users.push(current!);
      });
    }

    if (current && !current.isActive) {
      return res.status(403).json({ error: 'This user account has been deactivated. Please contact your administrator.' });
    }

    req.user = {
      id: current.id,
      email: current.email,
      role: current.role,
      name: current.name,
      employeeId: current.employeeId,
      mustChangePassword: current.mustChangePassword,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication session' });
  }
}

export function requireRole(allowedRoles: ('admin' | 'hr' | 'employee')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role '${req.user.role}' is not permitted to perform this action.`,
      });
    }
    next();
  };
}

export function logAudit(params: {
  req: AuthenticatedRequest;
  action: AuditLogEntry['action'];
  entity: AuditLogEntry['entity'];
  entityId?: string;
  details: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
}) {
  const { req, action, entity, entityId, details, beforeState, afterState } = params;
  const actor = req.user || {
    id: 'system',
    name: 'First Run / System',
    role: 'system',
  };

  const entry: AuditLogEntry = {
    id: 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entity,
    entityId,
    details,
    beforeState,
    afterState,
    ip: req.ip || req.headers['x-forwarded-for']?.toString() || '127.0.0.1',
    createdAt: new Date().toISOString(),
  };

  db.update((data) => {
    data.auditLogs.unshift(entry);
    // Keep max 2000 log entries
    if (data.auditLogs.length > 2000) {
      data.auditLogs = data.auditLogs.slice(0, 2000);
    }
  });

  return entry;
}
