import { Router, Response } from 'express';
import { db, Announcement } from '../db.js';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  logAudit,
} from '../auth.js';

export const commsRouter = Router();

// GET /api/announcements
commsRouter.get('/announcements', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.json(db.get().announcements);
});

// POST /api/announcements (Admin and HR only)
commsRouter.post('/announcements', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { title, content, priority = 'normal', category = 'general' } = req.body;
  const user = req.user!;

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  const item: Announcement = {
    id: 'ann_' + Date.now(),
    title: title.trim(),
    content: content.trim(),
    authorId: user.id,
    authorName: user.name,
    authorRole: user.role as 'admin' | 'hr',
    priority,
    category,
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.announcements.unshift(item);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ANNOUNCEMENT',
    entityId: item.id,
    details: `Announcement published: "${item.title}" (${item.priority})`,
    afterState: item,
  });

  res.status(201).json(item);
});

// DELETE /api/announcements/:id (Admin and HR)
commsRouter.delete('/announcements/:id', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state = db.get();
  const item = state.announcements.find((a) => a.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Announcement not found' });
  }

  db.update((draft) => {
    draft.announcements = draft.announcements.filter((a) => a.id !== id);
  });

  logAudit({
    req,
    action: 'DELETE',
    entity: 'ANNOUNCEMENT',
    entityId: id,
    details: `Announcement removed: "${item.title}"`,
  });

  res.json({ message: 'Announcement deleted' });
});

// GET /api/notifications (User's own notifications)
commsRouter.get('/notifications', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const notifs = db.get().notifications.filter((n) => n.userId === user.id);
  res.json(notifs);
});

// PATCH /api/notifications/:id/read
commsRouter.patch('/notifications/:id/read', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  db.update((draft) => {
    const n = draft.notifications.find((x) => x.id === id && x.userId === user.id);
    if (n) {
      n.isRead = true;
    }
  });

  res.json({ message: 'Notification marked as read' });
});

// POST /api/notifications/mark-all-read
commsRouter.post('/notifications/mark-all-read', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  db.update((draft) => {
    draft.notifications.forEach((n) => {
      if (n.userId === user.id) {
        n.isRead = true;
      }
    });
  });

  res.json({ message: 'All notifications marked as read' });
});

// GET /api/audit-log (Admin ONLY, immutable audit log)
commsRouter.get('/audit-log', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { action, entity, search } = req.query;
  let logs = db.get().auditLogs;

  if (action && typeof action === 'string') {
    logs = logs.filter((l) => l.action === action);
  }

  if (entity && typeof entity === 'string') {
    logs = logs.filter((l) => l.entity === entity);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.actorName.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        (l.entityId && l.entityId.toLowerCase().includes(q))
    );
  }

  res.json(logs);
});
