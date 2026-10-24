import { Router, Response } from 'express';
import { db } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../auth.js';

export const analyticsRouter = Router();

// GET /api/analytics/admin (Admin Dashboard)
analyticsRouter.get('/admin', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { department, startDate, endDate } = req.query;
  const state = db.get();

  let emps = state.employees;
  if (department && typeof department === 'string') {
    emps = emps.filter((e) => e.departmentId === department);
  }

  const activeEmps = emps.filter((e) => e.status === 'active' || e.status === 'probation');
  const exitedEmps = emps.filter((e) => e.status === 'exited');
  const totalHeadcount = activeEmps.length;

  // Attrition YTD formula: Exits in period / average headcount * 100
  const avgHeadcount = totalHeadcount + exitedEmps.length > 0 ? (totalHeadcount + (totalHeadcount + exitedEmps.length)) / 2 : 1;
  const attritionYTD = Math.round((exitedEmps.length / avgHeadcount) * 100 * 10) / 10;

  // Payroll Cost & Avg Salary
  const totalGross = activeEmps.reduce((sum, e) => sum + (e.grossSalary || 0), 0);
  const avgSalary = activeEmps.length > 0 ? Math.round(totalGross / activeEmps.length) : 0;

  // Headcount by department
  const headcountByDept = state.departments.map((dept) => {
    const count = activeEmps.filter((e) => e.departmentId === dept.id).length;
    const deptGross = activeEmps
      .filter((e) => e.departmentId === dept.id)
      .reduce((sum, e) => sum + (e.grossSalary || 0), 0);
    return {
      id: dept.id,
      name: dept.name,
      code: dept.code,
      headcount: count,
      payrollCost: deptGross,
    };
  });

  // Gender breakdown
  const genderBreakdown = {
    male: activeEmps.filter((e) => e.gender === 'male').length,
    female: activeEmps.filter((e) => e.gender === 'female').length,
    other: activeEmps.filter((e) => e.gender === 'other').length,
  };

  // Tenure breakdown
  const now = new Date();
  const tenureBreakdown = {
    under6Months: 0,
    sixTo12Months: 0,
    oneToTwoYears: 0,
    aboveTwoYears: 0,
  };

  activeEmps.forEach((e) => {
    const joining = new Date(e.joiningDate);
    const months = (now.getFullYear() - joining.getFullYear()) * 12 + (now.getMonth() - joining.getMonth());
    if (months < 6) tenureBreakdown.under6Months++;
    else if (months <= 12) tenureBreakdown.sixTo12Months++;
    else if (months <= 24) tenureBreakdown.oneToTwoYears++;
    else tenureBreakdown.aboveTwoYears++;
  });

  // Recent Audit Feed
  const recentAudit = state.auditLogs.slice(0, 10);

  res.json({
    kpis: {
      totalHeadcount,
      attritionYTD: `${attritionYTD}%`,
      totalPayrollCost: totalGross,
      averageSalary: avgSalary,
      currency: state.settings.currency,
    },
    headcountByDept,
    genderBreakdown,
    tenureBreakdown,
    recentAudit,
  });
});

// GET /api/analytics/hr (HR Dashboard)
analyticsRouter.get('/hr', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { department } = req.query;
  const state = db.get();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let emps = state.employees.filter((e) => e.status !== 'exited');
  if (department && typeof department === 'string') {
    emps = emps.filter((e) => e.departmentId === department);
  }

  const empIds = new Set(emps.map((e) => e.id));

  // Today attendance
  const todayAttendance = state.attendance.filter((a) => a.date === today && empIds.has(a.employeeId));
  const todayLeaves = state.leaves.filter(
    (l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today && empIds.has(l.employeeId)
  );

  const present = todayAttendance.filter((a) => a.status === 'present').length;
  const late = todayAttendance.filter((a) => a.status === 'late').length;
  const halfDay = todayAttendance.filter((a) => a.status === 'half_day').length;
  const onLeave = todayLeaves.length;
  const totalHeadcount = emps.length;
  const absent = Math.max(0, totalHeadcount - (present + late + halfDay + onLeave));

  // Pending approvals
  const pendingLeaves = state.leaves.filter((l) => l.status === 'pending' && empIds.has(l.employeeId)).length;
  const pendingCorrections = state.corrections.filter((c) => c.status === 'pending' && empIds.has(c.employeeId)).length;
  const pendingApprovals = pendingLeaves + pendingCorrections;

  // Attendance Trend (Last 7 days)
  const attendanceTrend: { date: string; present: number; late: number; onLeave: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const dAtt = state.attendance.filter((a) => a.date === dateStr && empIds.has(a.employeeId));
    const dLeaves = state.leaves.filter(
      (l) => l.status === 'approved' && l.startDate <= dateStr && l.endDate >= dateStr && empIds.has(l.employeeId)
    );

    attendanceTrend.push({
      date: dateStr,
      present: dAtt.filter((a) => a.status === 'present' || a.status === 'half_day').length,
      late: dAtt.filter((a) => a.status === 'late').length,
      onLeave: dLeaves.length,
    });
  }

  // Absenteeism by Department
  const absenteeismByDept = state.departments.map((dept) => {
    const deptEmps = state.employees.filter((e) => e.departmentId === dept.id && e.status !== 'exited');
    const deptEmpIds = new Set(deptEmps.map((e) => e.id));
    const deptAttendance = state.attendance.filter((a) => a.date === today && deptEmpIds.has(a.employeeId));
    const deptOnLeave = state.leaves.filter(
      (l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today && deptEmpIds.has(l.employeeId)
    );

    const attended = deptAttendance.length;
    const leaveCount = deptOnLeave.length;
    const absentCount = Math.max(0, deptEmps.length - (attended + leaveCount));
    const rate = deptEmps.length > 0 ? Math.round((absentCount / deptEmps.length) * 100) : 0;

    return {
      departmentName: dept.name,
      totalEmployees: deptEmps.length,
      absentCount,
      absenteeismRate: `${rate}%`,
    };
  });

  // Leave utilization by type
  const leaveByType = {
    annual: state.leaves.filter((l) => l.status === 'approved' && l.leaveType === 'annual' && empIds.has(l.employeeId)).reduce((sum, l) => sum + l.workingDays, 0),
    sick: state.leaves.filter((l) => l.status === 'approved' && l.leaveType === 'sick' && empIds.has(l.employeeId)).reduce((sum, l) => sum + l.workingDays, 0),
    casual: state.leaves.filter((l) => l.status === 'approved' && l.leaveType === 'casual' && empIds.has(l.employeeId)).reduce((sum, l) => sum + l.workingDays, 0),
    unpaid: state.leaves.filter((l) => l.status === 'approved' && l.leaveType === 'unpaid' && empIds.has(l.employeeId)).reduce((sum, l) => sum + l.workingDays, 0),
  };

  // Top 5 late comers for this month
  const monthLates = state.attendance.filter(
    (a) => a.date.startsWith(currentMonthPrefix) && a.status === 'late' && empIds.has(a.employeeId)
  );

  const lateCounts: Record<string, number> = {};
  monthLates.forEach((a) => {
    lateCounts[a.employeeId] = (lateCounts[a.employeeId] || 0) + 1;
  });

  const topLateComers = Object.entries(lateCounts)
    .map(([empId, count]) => {
      const e = state.employees.find((x) => x.id === empId);
      const d = state.departments.find((x) => x.id === e?.departmentId);
      return {
        employeeName: e ? `${e.firstName} ${e.lastName}` : 'Unknown',
        employeeCode: e?.employeeCode || 'N/A',
        department: d?.name || 'N/A',
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    kpis: {
      totalHeadcount,
      present,
      onLeave,
      late,
      halfDay,
      absent,
      pendingApprovals,
      attendanceRate: totalHeadcount > onLeave ? `${Math.round(((present + late + halfDay) / (totalHeadcount - onLeave)) * 100)}%` : '100%',
    },
    attendanceTrend,
    absenteeismByDept,
    leaveByType,
    topLateComers,
  });
});

// GET /api/analytics/employee (Employee Self-Service Dashboard)
analyticsRouter.get('/employee', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();
  const empId = user.employeeId || state.employees[0]?.id;

  if (!empId) {
    return res.status(400).json({ error: 'No employee account linked' });
  }

  const emp = state.employees.find((e) => e.id === empId);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Today check-in status
  const todayRecord = state.attendance.find((a) => a.employeeId === empId && a.date === today);
  const todayLeave = state.leaves.find(
    (l) => l.employeeId === empId && l.status === 'approved' && l.startDate <= today && l.endDate >= today
  );

  // Hours worked this week (from Monday)
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(monday.getDate() - dayOfWeek);
  const mondayStr = monday.toISOString().split('T')[0];

  const thisWeekRecords = state.attendance.filter(
    (a) => a.employeeId === empId && a.date >= mondayStr && a.date <= today
  );
  const hoursThisWeek = Math.round(thisWeekRecords.reduce((sum, a) => sum + (a.workedHours || 0), 0) * 10) / 10;

  // Late count this month
  const monthAttendance = state.attendance.filter((a) => a.employeeId === empId && a.date.startsWith(monthPrefix));
  const lateCountThisMonth = monthAttendance.filter((a) => a.status === 'late').length;

  // Leave balances
  const quotas = state.settings.leaveQuotas;
  const empApprovedLeaves = state.leaves.filter((l) => l.employeeId === empId && l.status === 'approved');
  let usedAnnual = 0;
  let usedSick = 0;
  let usedCasual = 0;

  empApprovedLeaves.forEach((l) => {
    if (l.leaveType === 'annual') usedAnnual += l.workingDays;
    if (l.leaveType === 'sick') usedSick += l.workingDays;
    if (l.leaveType === 'casual') usedCasual += l.workingDays;
  });

  const leaveBalance = {
    annual: Math.max(0, quotas.annual - usedAnnual),
    sick: Math.max(0, quotas.sick - usedSick),
    casual: Math.max(0, quotas.casual - usedCasual),
  };

  // Last payslip
  const finalizedRuns = state.payrollRuns.filter((r) => r.status === 'finalized');
  let lastPayslip: any = null;
  if (finalizedRuns.length > 0) {
    const latestRun = finalizedRuns[0];
    const item = latestRun.items.find((i) => i.employeeId === empId);
    if (item) {
      lastPayslip = {
        month: latestRun.month,
        year: latestRun.year,
        netSalary: item.netSalary,
        grossSalary: item.grossSalary,
        finalizedAt: latestRun.finalizedAt,
      };
    }
  }

  // Announcements
  const recentAnnouncements = state.announcements.slice(0, 3);

  res.json({
    employee: emp,
    todayStatus: {
      hasCheckedIn: !!todayRecord,
      hasCheckedOut: !!todayRecord?.checkOutTime,
      checkInTime: todayRecord?.checkInTime,
      checkOutTime: todayRecord?.checkOutTime,
      status: todayLeave ? 'on_leave' : todayRecord?.status || 'not_checked_in',
      leaveType: todayLeave?.leaveType,
    },
    weeklyStats: {
      hoursWorked: hoursThisWeek,
      targetHours: 40,
      completionRate: Math.min(100, Math.round((hoursThisWeek / 40) * 100)),
    },
    monthlyStats: {
      lateCount: lateCountThisMonth,
      warningIssued: lateCountThisMonth >= 3,
    },
    leaveBalance,
    lastPayslip,
    recentAnnouncements,
  });
});
