import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireRole } from '../auth.js';
import { processAIChat, summarizeDashboard, parseSmartLeave } from '../ai.js';
import { db } from '../db.js';

export const aiRouter = Router();

// POST /api/ai/chat
aiRouter.post('/chat', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const result = await processAIChat(req.user!, message.trim());
  res.json({
    reply: result.reply,
    toolCalls: result.toolCalls,
    isFallback: result.isFallback,
    isAIGenerated: true,
  });
});

// POST /api/ai/summarize (Admin and HR only)
aiRouter.post('/summarize', authenticate, requireRole(['admin', 'hr']), async (req: AuthenticatedRequest, res: Response) => {
  const { kpiData } = req.body;
  if (!kpiData) {
    return res.status(400).json({ error: 'KPI data payload is required' });
  }

  const bullets = await summarizeDashboard(kpiData);
  res.json({
    bullets,
    isAIGenerated: true,
  });
});

// POST /api/ai/smart-leave (Self-service leave parsing)
aiRouter.post('/smart-leave', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Leave description prompt is required' });
  }

  const parsed = await parseSmartLeave(prompt.trim());
  res.json({
    ...parsed,
    isAIGenerated: true,
  });
});

// GET /api/ai/logs (Admin only audit of AI interactions)
aiRouter.get('/logs', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  res.json(db.get().aiLogs);
});
