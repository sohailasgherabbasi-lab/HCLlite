import { GoogleGenAI } from '@google/genai';
import { db, AILogEntry } from './db.js';
import { AuthUser } from './auth.js';
import { getWorkingDaysInMonth } from './rules.js';

const apiKey = process.env.GEMINI_API_KEY || '';
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey });
  } catch (e) {
    console.warn('Failed to initialize GoogleGenAI client:', e);
  }
}

// In-memory rate limiter: userId -> array of timestamps
const userRateLimits: Map<string, number[]> = new Map();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 25; // Brief specifies ~20 per hour

  const timestamps = userRateLimits.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (validTimestamps.length >= maxRequests) {
    return false;
  }
  validTimestamps.push(now);
  userRateLimits.set(userId, validTimestamps);
  return true;
}

// AI Tool Implementations that respect RBAC & Data Scope
export const toolExecutors = {
  get_headcount: (user: AuthUser, args: { department?: string }) => {
    if (user.role === 'employee') {
      return { error: 'Access restricted: Headcount analytics are only accessible to HR and Admin.' };
    }
    const state = db.get();
    let emps = state.employees.filter((e) => e.status === 'active' || e.status === 'probation');
    if (args.department) {
      const dept = state.departments.find(
        (d) => d.name.toLowerCase() === args.department?.toLowerCase() || d.id === args.department
      );
      if (dept) {
        emps = emps.filter((e) => e.departmentId === dept.id);
      }
    }
    return {
      totalActiveHeadcount: emps.length,
      department: args.department || 'All Departments',
      breakdownByStatus: {
        active: emps.filter((e) => e.status === 'active').length,
        probation: emps.filter((e) => e.status === 'probation').length,
      },
    };
  },

  get_attendance_summary: (user: AuthUser, args: { date?: string }) => {
    if (user.role === 'employee') {
      return { error: 'Access restricted: Company attendance summary is only accessible to HR and Admin.' };
    }
    const state = db.get();
    const today = args.date || new Date().toISOString().split('T')[0];
    const emps = state.employees.filter((e) => e.status === 'active' || e.status === 'probation');
    const records = state.attendance.filter((a) => a.date === today);

    const onLeave = state.leaves.filter(
      (l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today
    );

    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const halfDay = records.filter((r) => r.status === 'half_day').length;
    const onLeaveCount = onLeave.length;
    const totalHeadcount = emps.length;
    const absent = Math.max(0, totalHeadcount - (present + late + halfDay + onLeaveCount));

    const totalWorking = present + late + halfDay;
    const rate = totalHeadcount > onLeaveCount ? Math.round((totalWorking / (totalHeadcount - onLeaveCount)) * 100) : 100;

    return {
      date: today,
      totalHeadcount,
      present,
      late,
      halfDay,
      onLeave: onLeaveCount,
      absent,
      attendanceRate: `${rate}%`,
    };
  },

  get_late_comers: (user: AuthUser, args: { month?: number; year?: number }) => {
    if (user.role === 'employee') {
      return { error: 'Access restricted: Late comers analytics are only accessible to HR and Admin.' };
    }
    const state = db.get();
    const now = new Date();
    const month = args.month || now.getMonth() + 1;
    const year = args.year || now.getFullYear();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const lateRecords = state.attendance.filter((a) => a.date.startsWith(prefix) && a.status === 'late');
    const counts: Record<string, number> = {};
    lateRecords.forEach((r) => {
      counts[r.employeeId] = (counts[r.employeeId] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .map(([empId, count]) => {
        const emp = state.employees.find((e) => e.id === empId);
        const dept = state.departments.find((d) => d.id === emp?.departmentId);
        return {
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
          employeeCode: emp?.employeeCode || 'N/A',
          department: dept?.name || 'N/A',
          lateCount: count,
        };
      })
      .sort((a, b) => b.lateCount - a.lateCount)
      .slice(0, 5);

    return {
      month,
      year,
      topLateComers: sorted,
    };
  },

  get_leave_summary: (user: AuthUser, args: { date?: string }) => {
    if (user.role === 'employee') {
      return { error: 'Access restricted: Company leave summary is only accessible to HR and Admin.' };
    }
    const state = db.get();
    const targetDate = args.date || new Date().toISOString().split('T')[0];
    const activeLeaves = state.leaves.filter(
      (l) => l.status === 'approved' && l.startDate <= targetDate && l.endDate >= targetDate
    );

    const employeesOnLeave = activeLeaves.map((l) => {
      const emp = state.employees.find((e) => e.id === l.employeeId);
      const dept = state.departments.find((d) => d.id === emp?.departmentId);
      return {
        name: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        department: dept?.name || 'N/A',
        leaveType: l.leaveType,
        reason: l.reason,
        startDate: l.startDate,
        endDate: l.endDate,
      };
    });

    return {
      date: targetDate,
      totalOnLeave: employeesOnLeave.length,
      employees: employeesOnLeave,
    };
  },

  get_my_leave_balance: (user: AuthUser) => {
    const state = db.get();
    let employeeId = user.employeeId;
    if (!employeeId && user.role !== 'employee') {
      // Admin/HR testing on first employee or self
      const firstEmp = state.employees[0];
      employeeId = firstEmp?.id;
    }
    if (!employeeId) {
      return { error: 'No associated employee record found for user.' };
    }

    const quotas = state.settings.leaveQuotas;
    const approvedLeaves = state.leaves.filter(
      (l) => l.employeeId === employeeId && l.status === 'approved'
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

    return {
      annual: { total: quotas.annual, used: usedAnnual, remaining: Math.max(0, quotas.annual - usedAnnual) },
      sick: { total: quotas.sick, used: usedSick, remaining: Math.max(0, quotas.sick - usedSick) },
      casual: { total: quotas.casual, used: usedCasual, remaining: Math.max(0, quotas.casual - usedCasual) },
      unpaid: { used: usedUnpaid, remaining: 'Unlimited' },
    };
  },

  get_payroll_summary: (user: AuthUser, args: { month?: number; year?: number }) => {
    if (user.role === 'employee') {
      return { error: 'Access restricted: Company payroll summaries are strictly restricted to HR and Admin.' };
    }
    const state = db.get();
    const now = new Date();
    const month = args.month || now.getMonth() + 1;
    const year = args.year || now.getFullYear();

    const run = state.payrollRuns.find((r) => r.month === month && r.year === year);
    if (!run) {
      // Calculate estimated on active employees
      const emps = state.employees.filter((e) => e.status === 'active' || e.status === 'probation');
      const totalGross = emps.reduce((acc, e) => acc + (e.grossSalary || 0), 0);
      const avgSalary = emps.length ? Math.round(totalGross / emps.length) : 0;
      return {
        month,
        year,
        status: 'Not Generated Yet',
        estimatedActiveEmployees: emps.length,
        estimatedTotalGross: totalGross,
        averageGrossSalary: avgSalary,
      };
    }

    return {
      month: run.month,
      year: run.year,
      status: run.status,
      employeeCount: run.employeeCount,
      totalGross: run.totalGross,
      totalDeductions: run.totalDeductions,
      totalTax: run.totalTax,
      totalNetPay: run.totalNet,
      averageSalary: Math.round(run.totalGross / (run.employeeCount || 1)),
    };
  },

  search_employees: (user: AuthUser, args: { query?: string; department?: string }) => {
    const state = db.get();
    let emps = state.employees;

    // RBAC: An employee can ONLY search their own record
    if (user.role === 'employee') {
      emps = emps.filter((e) => e.id === user.employeeId);
    }

    if (args.department) {
      const dept = state.departments.find(
        (d) => d.name.toLowerCase() === args.department?.toLowerCase() || d.id === args.department
      );
      if (dept) {
        emps = emps.filter((e) => e.departmentId === dept.id);
      }
    }

    if (args.query) {
      const q = args.query.toLowerCase();
      emps = emps.filter(
        (e) =>
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q)
      );
    }

    return emps.slice(0, 10).map((e) => {
      const dept = state.departments.find((d) => d.id === e.departmentId);
      const desig = state.designations.find((d) => d.id === e.designationId);
      // If user is employee searching self, they see own salary. If HR/Admin, they see salary. If employee asking for colleague, blocked by earlier filter.
      return {
        id: e.id,
        code: e.employeeCode,
        name: `${e.firstName} ${e.lastName}`,
        department: dept?.name || 'N/A',
        designation: desig?.name || 'N/A',
        status: e.status,
        joiningDate: e.joiningDate,
        ...(user.role !== 'employee' || user.employeeId === e.id ? { grossSalary: e.grossSalary } : {}),
      };
    });
  },
};

const SYSTEM_PROMPT = `You are HCM Lite AI, an intelligent, authoritative Human Capital Management assistant for Saylani Hackathon 2026.
Database is the ONLY source of truth. Never fabricate numbers or statistics.
Always respect the user's role and data scope:
- Admin: Company-level access. Can view all statistics, headcount, attendance, leaves, payroll, audit logs.
- HR: People operations access. Can view department headcount, daily attendance, late-comers, leave requests, payroll drafts.
- Employee: Self-service access. Can ONLY query their OWN attendance, their OWN leave balances, and their OWN profile.
CRITICAL RBAC RULE: If an Employee asks for a colleague's salary, compensation, or private records, you MUST politely refuse: "Colleague compensation and personal records are confidential and restricted under company policy."

Company Rules:
1. Office hours start at 09:00 with a 15-minute grace period (late after 09:15).
2. Working hours under 5 hours count as half-day.
3. Weekend is Saturday & Sunday.
4. Leave Quotas: Annual = 14 days, Sick = 8 days, Casual = 10 days, Unpaid = unlimited.
5. Gross salary = 1.5 * Basic salary (HRA 40%, Medical 10%).
6. Pakistan Income Tax slabs on annual gross:
   - Up to 600k: 0%
   - 600k to 1.2M: 5% of excess
   - 1.2M to 2.4M: 30k + 15% of excess
   - 2.4M to 3.6M: 210k + 25% of excess
   - Above 3.6M: 510k + 35% of excess
7. Late penalty: 3 lates in a month = 0.5 day salary deduction.

Language & Tone:
- Professional, concise, precise.
- Support both English and Roman Urdu (e.g., "Mera leave balance kitna hai?" -> answer with their casual/sick/annual leave balances).
- Every answer must carry grounding in the tools.`;

export async function processAIChat(
  user: AuthUser,
  message: string
): Promise<{ reply: string; toolCalls: string[]; isFallback: boolean }> {
  const startTime = Date.now();
  let durationMs = 0;

  // Check rate limit
  if (!checkRateLimit(user.id)) {
    return {
      reply: 'Rate limit reached (~20 requests/hour). Please wait a few moments before trying again.',
      toolCalls: [],
      isFallback: true,
    };
  }

  // Pre-check for colleague salary inquiry by employee
  const lowerMsg = message.toLowerCase();
  if (user.role === 'employee' && (lowerMsg.includes('salary') || lowerMsg.includes('pay') || lowerMsg.includes('tankhwah'))) {
    // Check if asking about self or colleague
    const isSelf =
      lowerMsg.includes('my salary') ||
      lowerMsg.includes('my pay') ||
      lowerMsg.includes('meri salary') ||
      lowerMsg.includes('meri tankhwah');
    if (!isSelf) {
      const refusal = 'I cannot share colleague compensation data due to strict privacy and role-based access restrictions.';
      logAICall(user, message, refusal, [], Date.now() - startTime, false);
      return { reply: refusal, toolCalls: [], isFallback: false };
    }
  }

  if (!aiClient) {
    // Intelligent deterministic fallback based on brief rules and database
    const fallback = executeFallbackChat(user, message);
    durationMs = Date.now() - startTime;
    logAICall(user, message, fallback.reply, fallback.toolCalls, durationMs, true);
    return fallback;
  }

  try {
    // Call Gemini with tools
    const response = await Promise.race([
      aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Current User Role: ${user.role}, Name: ${user.name}, User ID: ${user.id}, Employee ID: ${
                  user.employeeId || 'N/A'
                }\n\nUser Question: ${message}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'get_headcount',
                  description: 'Get total active and probation headcount, optionally filtered by department.',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      department: { type: 'STRING' as any, description: 'Department name e.g. Engineering' },
                    },
                  },
                },
                {
                  name: 'get_attendance_summary',
                  description: 'Get daily attendance summary (present, late, half-day, on-leave, absent, attendance rate).',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      date: { type: 'STRING' as any, description: 'Date in YYYY-MM-DD format' },
                    },
                  },
                },
                {
                  name: 'get_late_comers',
                  description: 'Get top 5 late comers for the month.',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      month: { type: 'INTEGER' as any, description: 'Month (1-12)' },
                      year: { type: 'INTEGER' as any, description: 'Year e.g. 2026' },
                    },
                  },
                },
                {
                  name: 'get_leave_summary',
                  description: 'Get employees on leave today or for a given date.',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      date: { type: 'STRING' as any, description: 'Date in YYYY-MM-DD format' },
                    },
                  },
                },
                {
                  name: 'get_my_leave_balance',
                  description: 'Get the logged-in user own leave balances (annual, sick, casual, unpaid).',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {},
                  },
                },
                {
                  name: 'get_payroll_summary',
                  description: 'Get monthly payroll cost, tax and net totals for HR and Admin.',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      month: { type: 'INTEGER' as any, description: 'Month (1-12)' },
                      year: { type: 'INTEGER' as any, description: 'Year e.g. 2026' },
                    },
                  },
                },
                {
                  name: 'search_employees',
                  description: 'Search employees by name, code or department.',
                  parameters: {
                    type: 'OBJECT' as any,
                    properties: {
                      query: { type: 'STRING' as any, description: 'Name or email or code search string' },
                      department: { type: 'STRING' as any, description: 'Department name' },
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), 14000)),
    ]);

    const functionCalls = (response as any).functionCalls || [];
    const recordedTools: string[] = [];

    if (functionCalls.length > 0) {
      // Execute function calls
      const toolResultsParts: any[] = [];
      for (const fc of functionCalls) {
        recordedTools.push(fc.name);
        const executor = (toolExecutors as any)[fc.name];
        let result: any = { error: 'Unknown tool' };
        if (executor) {
          result = executor(user, fc.args || {});
        }
        toolResultsParts.push({
          functionResponse: {
            name: fc.name,
            response: result,
          },
        });
      }

      // Second turn with tool results
      const finalResponse = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `Current User Role: ${user.role}, Name: ${user.name}\n\nUser Question: ${message}` }],
          },
          {
            role: 'model',
            parts: response.candidates?.[0]?.content?.parts || [],
          },
          {
            role: 'user',
            parts: toolResultsParts,
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
      });

      const reply = finalResponse.text || 'I have analyzed the current data for you.';
      durationMs = Date.now() - startTime;
      logAICall(user, message, reply, recordedTools, durationMs, false);
      return { reply, toolCalls: recordedTools, isFallback: false };
    }

    const reply = response.text || 'I am ready to assist with company HR operations.';
    durationMs = Date.now() - startTime;
    logAICall(user, message, reply, recordedTools, durationMs, false);
    return { reply, toolCalls: recordedTools, isFallback: false };
  } catch (err) {
    console.warn('AI call error, falling back to deterministic business engine:', err);
    const fallback = executeFallbackChat(user, message);
    durationMs = Date.now() - startTime;
    logAICall(user, message, fallback.reply, fallback.toolCalls, durationMs, true);
    return fallback;
  }
}

/**
 * Deterministic business engine fallback ensuring 100% reliability even if offline
 */
function executeFallbackChat(
  user: AuthUser,
  message: string
): { reply: string; toolCalls: string[]; isFallback: boolean } {
  const q = message.toLowerCase();
  const toolsUsed: string[] = [];

  // 1. Leave balance check
  if (
    q.includes('leave') &&
    (q.includes('balance') || q.includes('how many') || q.includes('kitni') || q.includes('bachee') || q.includes('left'))
  ) {
    toolsUsed.push('get_my_leave_balance');
    const bal: any = toolExecutors.get_my_leave_balance(user);
    if (bal.error) {
      return { reply: bal.error || 'Failed to retrieve balance.', toolCalls: toolsUsed, isFallback: true };
    }
    return {
      reply: `Your remaining leave balances for this calendar year:
• Annual Leave: ${bal.annual.remaining} days remaining (out of ${bal.annual.total})
• Sick Leave: ${bal.sick.remaining} days remaining (out of ${bal.sick.total})
• Casual Leave: ${bal.casual.remaining} days remaining (out of ${bal.casual.total})
• Unpaid Leave: Unlimited availability (subject to approval)`,
      toolCalls: toolsUsed,
      isFallback: true,
    };
  }

  // 2. Who is on leave / leave summary
  if (q.includes('who is on leave') || q.includes('on leave today') || q.includes('chutti par')) {
    toolsUsed.push('get_leave_summary');
    const res: any = toolExecutors.get_leave_summary(user, {});
    if (res.error) {
      return { reply: res.error || 'Access restricted.', toolCalls: toolsUsed, isFallback: true };
    }
    if (res.totalOnLeave === 0) {
      return { reply: 'No employees are on leave today. All team members are active on duty.', toolCalls: toolsUsed, isFallback: true };
    }
    const list = res.employees.map((e: any) => `• ${e.name} (${e.department}): ${e.leaveType} leave - "${e.reason}"`).join('\n');
    return {
      reply: `There are ${res.totalOnLeave} employees on approved leave today:\n${list}`,
      toolCalls: toolsUsed,
      isFallback: true,
    };
  }

  // 3. Headcount
  if (q.includes('headcount') || q.includes('how many active') || q.includes('kitne employees')) {
    toolsUsed.push('get_headcount');
    const res: any = toolExecutors.get_headcount(user, {});
    if (res.error) {
      return { reply: res.error || 'Access restricted.', toolCalls: toolsUsed, isFallback: true };
    }
    return {
      reply: `Company Headcount: Total active employees is ${res.totalActiveHeadcount} (${res.breakdownByStatus.active} permanent, ${res.breakdownByStatus.probation} on probation).`,
      toolCalls: toolsUsed,
      isFallback: true,
    };
  }

  // 4. Late comers
  if (q.includes('late') && (q.includes('who') || q.includes('most often') || q.includes('top'))) {
    toolsUsed.push('get_late_comers');
    const res: any = toolExecutors.get_late_comers(user, {});
    if (res.error) {
      return { reply: res.error || 'Access restricted.', toolCalls: toolsUsed, isFallback: true };
    }
    if (res.topLateComers.length === 0) {
      return { reply: 'No recorded late arrivals for this month so far.', toolCalls: toolsUsed, isFallback: true };
    }
    const list = res.topLateComers.map((c: any) => `• ${c.employeeName} (${c.department}) — ${c.lateCount} time(s)`).join('\n');
    return {
      reply: `Top late arrivals for this month:\n${list}`,
      toolCalls: toolsUsed,
      isFallback: true,
    };
  }

  // 5. Attendance rate
  if (q.includes('attendance rate') || q.includes('rate of attendance')) {
    toolsUsed.push('get_attendance_summary');
    const res: any = toolExecutors.get_attendance_summary(user, {});
    if (res.error) {
      return { reply: res.error || 'Access restricted.', toolCalls: toolsUsed, isFallback: true };
    }
    return {
      reply: `Today's Attendance Rate is ${res.attendanceRate}. Breakdown: ${res.present} on-time, ${res.late} late, ${res.halfDay} half-day, ${res.onLeave} on approved leave.`,
      toolCalls: toolsUsed,
      isFallback: true,
    };
  }

  // 6. Policy Questions
  if (q.includes('grace') || q.includes('office hour') || q.includes('timing') || q.includes('policy')) {
    return {
      reply: `Company Work Policy:
• Official office hours start at 09:00 AM.
• Grace period is 15 minutes (check-ins after 09:15 AM are logged as Late).
• Working less than 5 hours is treated as a Half-Day.
• 3 late arrivals in a single calendar month result in a 0.5-day salary deduction.
• Standard weekend: Saturday & Sunday.`,
      toolCalls: [],
      isFallback: true,
    };
  }

  return {
    reply: `I can help you with attendance, leave balances, headcount, payroll insights, and company policy rules. Feel free to ask:
• "Who is on leave today?"
• "How many sick leaves do I have left?"
• "What is this month's attendance rate?"
• "Who came late most often this month?"`,
    toolCalls: [],
    isFallback: true,
  };
}

/**
 * Smart Leave parser: Converts natural language request into structured JSON
 */
export async function parseSmartLeave(
  input: string
): Promise<{ leaveType: 'annual' | 'sick' | 'casual' | 'unpaid'; startDate: string; endDate: string; reason: string }> {
  // Use current date as reference
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (aiClient) {
    try {
      const prompt = `Convert the following employee leave request into a JSON object:
Input: "${input}"
Today's Date: ${todayStr}

Return strictly a JSON object with:
- "leaveType": one of "annual", "sick", "casual", "unpaid" (weddings, family events, personal errands are usually "casual"; fever, doctor visits are "sick"; vacation is "annual")
- "startDate": "YYYY-MM-DD"
- "endDate": "YYYY-MM-DD"
- "reason": clean 1-line explanation

JSON:`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const raw = response.text || '';
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (parsed.leaveType && parsed.startDate && parsed.endDate) {
        return parsed;
      }
    } catch (e) {
      console.warn('AI smart-leave parse failed, falling back to deterministic extraction:', e);
    }
  }

  // Deterministic fallback for common phrasing like "Need next Monday and Tuesday off for my sister's wedding"
  let leaveType: 'annual' | 'sick' | 'casual' | 'unpaid' = 'casual';
  const lower = input.toLowerCase();
  if (lower.includes('sick') || lower.includes('fever') || lower.includes('hospital') || lower.includes('doctor') || lower.includes('tabiyat')) {
    leaveType = 'sick';
  } else if (lower.includes('vacation') || lower.includes('trip') || lower.includes('tour') || lower.includes('annual')) {
    leaveType = 'annual';
  } else if (lower.includes('unpaid') || lower.includes('bina tankhwah')) {
    leaveType = 'unpaid';
  }

  // Calculate upcoming Monday and Tuesday if specified
  const targetStart = new Date(now);
  const targetEnd = new Date(now);

  if (lower.includes('next monday') || lower.includes('monday') || lower.includes('somwar')) {
    const day = targetStart.getDay();
    const daysUntilNextMonday = (8 - day) % 7 || 7;
    targetStart.setDate(targetStart.getDate() + daysUntilNextMonday);
    targetEnd.setDate(targetStart.getDate() + (lower.includes('tuesday') || lower.includes('mangal') ? 1 : 0));
  } else if (lower.includes('tomorrow') || lower.includes('kal')) {
    targetStart.setDate(targetStart.getDate() + 1);
    targetEnd.setDate(targetStart.getDate());
  } else {
    // Default to tomorrow
    targetStart.setDate(targetStart.getDate() + 1);
    targetEnd.setDate(targetStart.getDate() + 1);
  }

  const sStr = targetStart.toISOString().split('T')[0];
  const eStr = targetEnd.toISOString().split('T')[0];

  return {
    leaveType,
    startDate: sStr,
    endDate: eStr,
    reason: input.trim(),
  };
}

/**
 * Summarize Dashboard KPI JSON into 3-5 high-signal bullet points
 */
export async function summarizeDashboard(kpiData: Record<string, any>): Promise<string[]> {
  if (aiClient) {
    try {
      const prompt = `You are an HR analytics expert. Summarize the following HCM dashboard KPIs into exactly 3 to 5 clear, high-signal bullet points. Only use the numbers provided.
KPI Data:
${JSON.stringify(kpiData, null, 2)}

Return strictly a JSON array of strings, e.g. ["Point 1", "Point 2", "Point 3"].`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const raw = response.text || '';
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const list = JSON.parse(clean);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    } catch (e) {
      console.warn('Dashboard summarize error, falling back:', e);
    }
  }

  // Fallback summary generator
  const bullets: string[] = [];
  if (kpiData.totalHeadcount !== undefined) {
    bullets.push(`Total active organizational headcount stands at ${kpiData.totalHeadcount} employees.`);
  }
  if (kpiData.attendanceRate) {
    bullets.push(`Current attendance rate is ${kpiData.attendanceRate} with ${kpiData.present || 0} on-time arrivals.`);
  }
  if (kpiData.late !== undefined && kpiData.late > 0) {
    bullets.push(`${kpiData.late} employees arrived past the 09:15 grace threshold today.`);
  }
  if (kpiData.onLeave !== undefined) {
    bullets.push(`${kpiData.onLeave} employees are currently on approved planned leave.`);
  }
  if (kpiData.payrollCost) {
    bullets.push(`Total gross monthly payroll obligation is PKR ${Number(kpiData.payrollCost).toLocaleString()}.`);
  }
  return bullets.length ? bullets : ['Operational indicators are within standard parameters across departments.'];
}

function logAICall(
  user: AuthUser,
  prompt: string,
  response: string,
  toolCalls: string[],
  durationMs: number,
  isFallback: boolean
) {
  const entry: AILogEntry = {
    id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    userId: user.id,
    role: user.role,
    prompt,
    response,
    toolCalls,
    durationMs,
    isFallback,
    createdAt: new Date().toISOString(),
  };

  db.update((data) => {
    data.aiLogs.unshift(entry);
    if (data.aiLogs.length > 500) {
      data.aiLogs = data.aiLogs.slice(0, 500);
    }
  });
}
