import express from 'express';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { orgRouter } from './routes/org.js';
import { usersRouter } from './routes/users.js';
import { employeesRouter } from './routes/employees.js';
import { attendanceRouter } from './routes/attendance.js';
import { leaveRouter } from './routes/leave.js';
import { payrollRouter } from './routes/payroll.js';
import { analyticsRouter } from './routes/analytics.js';
import { aiRouter } from './routes/ai.js';
import { commsRouter } from './routes/comms.js';

dotenv.config();

export function createExpressApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/leave', leaveRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api', commsRouter);

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

export const app = createExpressApp();
