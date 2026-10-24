import { CompanySettings, PublicHoliday, AttendanceRecord, LeaveRequest, Employee } from './db.js';

/**
 * Calculates whether a specific date (YYYY-MM-DD) is a working day,
 * checking against configured weekend days and public holidays.
 */
export function isWorkingDay(
  dateStr: string,
  weekendDays: number[] = [0, 6],
  holidays: PublicHoliday[] = []
): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
  if (weekendDays.includes(dayOfWeek)) {
    return false;
  }
  const isHoliday = holidays.some((h) => h.date === dateStr);
  return !isHoliday;
}

/**
 * Calculates number of working days between two ISO date strings (inclusive)
 */
export function calculateWorkingDays(
  startDateStr: string,
  endDateStr: string,
  weekendDays: number[] = [0, 6],
  holidays: PublicHoliday[] = []
): number {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  if (end < start) return 0;

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (isWorkingDay(dateStr, weekendDays, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Total working days in a given month and year
 */
export function getWorkingDaysInMonth(
  year: number,
  month: number, // 1 - 12
  weekendDays: number[] = [0, 6],
  holidays: PublicHoliday[] = []
): number {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return calculateWorkingDays(startDate, endDate, weekendDays, holidays);
}

/**
 * Determines attendance check-in status (present vs late)
 * based on office start time and grace period minutes.
 */
export function evaluateCheckInStatus(
  checkInISO: string,
  officeStart: string = '09:00',
  graceMinutes: number = 15
): 'present' | 'late' {
  const checkInDate = new Date(checkInISO);
  const hours = checkInDate.getHours();
  const minutes = checkInDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const [startH, startM] = officeStart.split(':').map(Number);
  const cutoffMinutes = startH * 60 + startM + graceMinutes;

  return totalMinutes > cutoffMinutes ? 'late' : 'present';
}

/**
 * Calculates distance in meters between two coordinates using the Haversine formula
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculates Pakistan Annual Income Tax based on Section 3 of Hackathon Brief:
 * - 0 to 600,000: 0%
 * - 600,001 to 1,200,000: 5% of amount > 600k
 * - 1,200,001 to 2,400,000: 30,000 + 15% of amount > 1.2M
 * - 2,400,001 to 3,600,000: 210,000 + 25% of amount > 2.4M
 * - Above 3,600,000: 510,000 + 35% of amount > 3.6M
 */
export function calculateAnnualTax(annualGross: number): number {
  if (annualGross <= 600000) {
    return 0;
  } else if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  } else {
    return 510000 + (annualGross - 3600000) * 0.35;
  }
}

/**
 * Computes monthly payroll line item for an employee
 */
export function computeEmployeePayrollItem(
  employee: Employee,
  month: number,
  year: number,
  settings: CompanySettings,
  holidays: PublicHoliday[],
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[]
) {
  const basicSalary = employee.basicSalary || 0;
  const hra = Math.round(basicSalary * 0.4);
  const medical = Math.round(basicSalary * 0.1);
  const grossSalary = basicSalary + hra + medical;

  const workingDaysInMonth = getWorkingDaysInMonth(year, month, settings.weekendDays, holidays) || 22;
  const perDayRate = grossSalary / workingDaysInMonth;

  // Filter attendance for this month & year
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const empAttendance = attendanceRecords.filter(
    (a) => a.employeeId === employee.id && a.date.startsWith(monthPrefix)
  );

  let halfDays = 0;
  let lateCount = 0;
  let attendedDays = 0;

  empAttendance.forEach((att) => {
    attendedDays++;
    if (att.status === 'half_day') {
      halfDays++;
    } else if (att.status === 'late') {
      lateCount++;
    }
  });

  // Approved unpaid leaves in this month
  const empLeaves = leaveRequests.filter(
    (l) =>
      l.employeeId === employee.id &&
      l.status === 'approved' &&
      (l.startDate.startsWith(monthPrefix) || l.endDate.startsWith(monthPrefix))
  );

  let unpaidLeaveDays = 0;
  empLeaves.forEach((leave) => {
    if (leave.leaveType === 'unpaid') {
      unpaidLeaveDays += leave.workingDays;
    }
  });

  // Proration for joiners or leavers
  let activeWorkingDays = workingDaysInMonth;
  const joiningDate = new Date(employee.joiningDate + 'T00:00:00');
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  if (joiningDate > monthStart && joiningDate <= monthEnd) {
    // Joined mid month
    activeWorkingDays = calculateWorkingDays(
      employee.joiningDate,
      `${year}-${String(month).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`,
      settings.weekendDays,
      holidays
    );
  }

  // Absent days: expected active working days minus attended days minus approved leaves
  let approvedPaidLeaveDays = 0;
  empLeaves.forEach((leave) => {
    if (leave.leaveType !== 'unpaid') {
      approvedPaidLeaveDays += leave.workingDays;
    }
  });

  let absentDays = Math.max(0, activeWorkingDays - (attendedDays + approvedPaidLeaveDays + unpaidLeaveDays));

  // Late penalty rule: 3 lates = 0.5 day deduction
  let latePenaltyDays = 0;
  if (settings.latePenaltyDeduction && lateCount >= 3) {
    latePenaltyDays = Math.floor(lateCount / 3) * 0.5;
  }

  const deductionAbsent = Math.round(absentDays * perDayRate);
  const deductionUnpaidLeave = Math.round(unpaidLeaveDays * perDayRate);
  const deductionHalfDay = Math.round(halfDays * 0.5 * perDayRate);
  const deductionLatePenalty = Math.round(latePenaltyDays * perDayRate);

  const totalDeductions = deductionAbsent + deductionUnpaidLeave + deductionHalfDay + deductionLatePenalty;

  // Annual gross and tax
  const annualGross = grossSalary * 12;
  const annualTax = Math.round(calculateAnnualTax(annualGross));
  const monthlyTax = Math.round(annualTax / 12);

  const netSalary = Math.max(0, Math.round(grossSalary - totalDeductions - monthlyTax));

  return {
    basicSalary,
    hra,
    medical,
    grossSalary,
    workingDaysInMonth,
    daysWorked: attendedDays,
    absentDays,
    unpaidLeaveDays,
    halfDays,
    lateCount,
    latePenaltyDays,
    deductionAbsent,
    deductionUnpaidLeave,
    deductionHalfDay,
    deductionLatePenalty,
    totalDeductions,
    annualTaxable: annualGross,
    annualTax,
    monthlyTax,
    netSalary,
  };
}

/**
 * Computes Attrition Risk Score (0 - 100) and indicators (Bonus +10 pts)
 */
export function calculateAttritionRisk(
  employee: Employee,
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[]
): { score: number; level: 'Low' | 'Medium' | 'High'; reasons: string[] } {
  let score = 15; // baseline
  const reasons: string[] = [];

  const joining = new Date(employee.joiningDate);
  const now = new Date();
  const monthsTenure = (now.getFullYear() - joining.getFullYear()) * 12 + (now.getMonth() - joining.getMonth());

  if (monthsTenure < 6) {
    score += 15;
    reasons.push('Probation / First 6 months adjustment phase');
  } else if (monthsTenure > 24) {
    score += 20;
    reasons.push('Approaching 2-year tenure mobility window');
  }

  // Recent 30 days attendance
  const empAtt = attendanceRecords.filter((a) => a.employeeId === employee.id);
  const lates = empAtt.filter((a) => a.status === 'late').length;
  if (lates >= 4) {
    score += 25;
    reasons.push(`Frequent morning late arrivals (${lates} times)`);
  }

  // Leaves
  const approvedLeaves = leaveRequests.filter(
    (l) => l.employeeId === employee.id && l.status === 'approved'
  );
  if (approvedLeaves.length >= 4) {
    score += 15;
    reasons.push('High frequency of short-notice leave requests');
  }

  score = Math.min(95, Math.max(5, score));
  const level = score > 60 ? 'High' : score > 35 ? 'Medium' : 'Low';

  return { score, level, reasons };
}

/**
 * Detects Absence Anomalies e.g. Monday / Friday absenteeism patterns
 */
export function detectAbsenceAnomalies(
  employeeId: string,
  attendanceRecords: AttendanceRecord[]
): { hasAnomaly: boolean; message?: string } {
  const records = attendanceRecords.filter((a) => a.employeeId === employeeId);
  let monFriLatesOrHalfs = 0;

  records.forEach((r) => {
    const d = new Date(r.date + 'T00:00:00');
    const day = d.getDay();
    if ((day === 1 || day === 5) && (r.status === 'late' || r.status === 'half_day')) {
      monFriLatesOrHalfs++;
    }
  });

  if (monFriLatesOrHalfs >= 3) {
    return {
      hasAnomaly: true,
      message: `Pattern detected: ${monFriLatesOrHalfs} late/half-days clustered around Mondays and Fridays`,
    };
  }

  return { hasAnomaly: false };
}
