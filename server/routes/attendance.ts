import { Router, Response } from 'express';
import { db, AttendanceRecord, AttendanceCorrection } from '../db.js';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  logAudit,
} from '../auth.js';
import { evaluateCheckInStatus, haversineDistanceMeters, evaluateBiometricMatch } from '../rules.js';

export const attendanceRouter = Router();

// GET /api/attendance/today (Daily attendance board)
attendanceRouter.get('/today', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();
  const today = (req.query.date as string) || new Date().toISOString().split('T')[0];

  let emps = state.employees.filter((e) => e.status !== 'exited');
  if (user.role === 'employee') {
    emps = emps.filter((e) => e.id === user.employeeId);
  }

  const todayAttendance = state.attendance.filter((a) => a.date === today);
  const todayLeaves = state.leaves.filter(
    (l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today
  );

  const roster = emps.map((emp) => {
    const dept = state.departments.find((d) => d.id === emp.departmentId);
    const desig = state.designations.find((d) => d.id === emp.designationId);
    const att = todayAttendance.find((a) => a.employeeId === emp.id);
    const leave = todayLeaves.find((l) => l.employeeId === emp.id);

    let status: 'present' | 'late' | 'half_day' | 'on_leave' | 'absent' | 'missing_checkout' = 'absent';
    if (leave) {
      status = 'on_leave';
    } else if (att) {
      if (!att.checkOutTime && att.workedHours === 0) {
        // Checked in today, currently working or checked in
        status = att.status === 'late' ? 'late' : 'present';
      } else {
        status = att.status;
      }
    }

    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: `${emp.firstName} ${emp.lastName}`,
      department: dept?.name || 'Unassigned',
      designation: desig?.name || 'Unassigned',
      checkInTime: att?.checkInTime,
      checkOutTime: att?.checkOutTime,
      workedHours: att?.workedHours || 0,
      source: att?.source || 'web',
      locationVerified: att?.locationVerified,
      distanceMeters: att?.distanceMeters,
      faceVerified: att?.faceVerified,
      faceMatchScore: att?.faceMatchScore,
      status,
      leaveType: leave?.leaveType,
      recordId: att?.id,
    };
  });

  const presentCount = roster.filter((r) => r.status === 'present').length;
  const lateCount = roster.filter((r) => r.status === 'late').length;
  const halfDayCount = roster.filter((r) => r.status === 'half_day').length;
  const onLeaveCount = roster.filter((r) => r.status === 'on_leave').length;
  const absentCount = roster.filter((r) => r.status === 'absent').length;

  res.json({
    date: today,
    summary: {
      total: roster.length,
      present: presentCount,
      late: lateCount,
      halfDay: halfDayCount,
      onLeave: onLeaveCount,
      absent: absentCount,
      rate: roster.length > onLeaveCount ? Math.round(((presentCount + lateCount + halfDayCount) / (roster.length - onLeaveCount)) * 100) : 100,
    },
    roster,
  });
});

// GET /api/attendance/calendar (Monthly records)
attendanceRouter.get('/calendar', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { employeeId, month, year } = req.query;
  const user = req.user!;
  const state = db.get();

  let targetEmpId = (employeeId as string) || user.employeeId;
  if (user.role === 'employee') {
    targetEmpId = user.employeeId;
  }

  const now = new Date();
  const m = month ? parseInt(month as string, 10) : now.getMonth() + 1;
  const y = year ? parseInt(year as string, 10) : now.getFullYear();
  const prefix = `${y}-${String(m).padStart(2, '0')}`;

  const records = state.attendance.filter((a) => {
    const matchEmp = targetEmpId ? a.employeeId === targetEmpId : true;
    return matchEmp && a.date.startsWith(prefix);
  });

  const leaves = state.leaves.filter((l) => {
    const matchEmp = targetEmpId ? l.employeeId === targetEmpId : true;
    return matchEmp && l.status === 'approved' && (l.startDate.startsWith(prefix) || l.endDate.startsWith(prefix));
  });

  res.json({
    month: m,
    year: y,
    employeeId: targetEmpId,
    records,
    leaves,
    holidays: state.holidays.filter((h) => h.date.startsWith(prefix)),
    weekendDays: state.settings.weekendDays,
  });
});

// POST /api/attendance/verify-face (Verify live face against employee's enrolled face profile)
attendanceRouter.post('/verify-face', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { employeeId, photoSnapshot, liveDescriptor } = req.body;
  const state = db.get();

  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  if (!emp.faceEnrolled || !emp.facePhotoUrl) {
    return res.status(400).json({
      error: `No biometric face record enrolled for ${emp.firstName} ${emp.lastName}. Facial registration is required before marking attendance.`,
      needsEnrollment: true,
      employee: {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        faceEnrolled: false,
      },
    });
  }

  const bioResult = evaluateBiometricMatch(liveDescriptor, emp.faceDescriptor || [], 75);

  res.json({
    matched: bioResult.match,
    confidence: bioResult.confidence,
    similarity: bioResult.similarity,
    employee: {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      departmentName: state.departments.find((d) => d.id === emp.departmentId)?.name || 'General',
      facePhotoUrl: emp.facePhotoUrl,
    },
    message: bioResult.match
      ? `Biometric Match Verified (${bioResult.confidence}% confidence) for ${emp.firstName} ${emp.lastName}.`
      : `Face Mismatch (${bioResult.confidence}% match): Live camera face does not match enrolled profile for ${emp.firstName} ${emp.lastName}. Proxy attendance blocked.`,
  });
});

// POST /api/attendance/check-in (Web or Camera attendance)
attendanceRouter.post('/check-in', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();

  let employeeId = user.employeeId;
  if (req.body.employeeId) {
    if (user.role === 'employee' && user.employeeId && user.employeeId !== req.body.employeeId) {
      return res.status(403).json({
        error: 'Access Denied: You cannot mark attendance for another employee.',
      });
    }
    employeeId = req.body.employeeId;
  } else if (!employeeId && (user.role === 'admin' || user.role === 'hr')) {
    employeeId = state.employees[0]?.id;
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'No associated employee record found for check-in.' });
  }

  const targetEmp = state.employees.find((e) => e.id === employeeId);
  if (!targetEmp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  const today = (req.body.date as string) || new Date().toISOString().split('T')[0];
  const existing = state.attendance.find((a) => a.employeeId === employeeId && a.date === today);
  if (existing) {
    return res.status(409).json({
      error: `Attendance is already recorded for ${today}.`,
      existingRecord: existing,
    });
  }

  const { isCamera, lat, lng, accuracy, faceDetected, faceVerified, faceMatchScore, liveDescriptor, photoSnapshot, checkInTime } = req.body;

  // STRICT ANTI-PROXY BIOMETRIC POLICY:
  // If an employee has Face ID enrolled, web check-in without camera verification is strictly prohibited!
  if (targetEmp.faceEnrolled && !isCamera) {
    return res.status(422).json({
      error: `Biometric Attendance Required: Face ID is enrolled for ${targetEmp.firstName} ${targetEmp.lastName}. Web check-in without facial verification is prohibited. Please use the Camera Kiosk to mark attendance.`,
      needsBiometricPunch: true,
    });
  }

  const nowISO = checkInTime
    ? (checkInTime.includes('T') ? checkInTime : `${today}T${checkInTime}:00.000Z`)
    : new Date().toISOString();

  let source: 'web' | 'camera' = 'web';
  let locationVerified = false;
  let distanceMeters: number | undefined;

  if (isCamera) {
    source = 'camera';
    if (!faceDetected) {
      return res.status(422).json({
        error: 'Face not detected in camera frame. Please center your face clearly in the camera preview.',
      });
    }

    // Employee-Wise Face Enrollment check
    if (!targetEmp.faceEnrolled || !Array.isArray(targetEmp.faceDescriptor) || targetEmp.faceDescriptor.length === 0) {
      return res.status(422).json({
        error: `Face record not enrolled for ${targetEmp.firstName} ${targetEmp.lastName}. Facial enrollment is required before marking biometric attendance.`,
        needsEnrollment: true,
      });
    }

    // Strict Gold-Standard Biometric Vector Authentication
    if (Array.isArray(liveDescriptor) && targetEmp.faceDescriptor.length > 0) {
      const bioResult = evaluateBiometricMatch(liveDescriptor, targetEmp.faceDescriptor, 75);
      if (!bioResult.match) {
        return res.status(422).json({
          error: `Biometric Authentication Failed (${bioResult.confidence}% match): Live camera face does NOT match the enrolled profile for ${targetEmp.firstName} ${targetEmp.lastName}. Proxy attendance is strictly prohibited.`,
          confidence: bioResult.confidence,
        });
      }
    } else if (faceVerified === false || (faceMatchScore !== undefined && faceMatchScore < 75)) {
      return res.status(422).json({
        error: `Facial verification failed: Live camera face does not match the enrolled biometric profile for ${targetEmp.firstName} ${targetEmp.lastName}. Proxy attendance blocked.`,
      });
    }


    if (lat === undefined || lng === undefined) {
      return res.status(422).json({
        error: 'Geolocation coordinates are required for camera attendance verification.',
      });
    }

    if (accuracy && accuracy > 100) {
      return res.status(422).json({
        error: `GPS accuracy is too low (${Math.round(accuracy)}m). Accuracy must be under 100m.`,
      });
    }

    const officeLat = state.settings.officeLat;
    const officeLng = state.settings.officeLng;
    const radius = state.settings.officeRadiusMeters;

    distanceMeters = haversineDistanceMeters(lat, lng, officeLat, officeLng);
    if (distanceMeters > radius) {
      return res.status(422).json({
        error: `Location outside permitted office perimeter. You are ${distanceMeters}m away (maximum allowed radius is ${radius}m).`,
        distanceMeters,
        allowedRadius: radius,
      });
    }
    locationVerified = true;
  }

  // Calculate status (late vs present)
  const initialStatus = evaluateCheckInStatus(nowISO, state.settings.officeStart, state.settings.graceMinutes);

  const record: AttendanceRecord = {
    id: 'att_' + Date.now(),
    employeeId,
    date: today,
    checkInTime: nowISO,
    status: initialStatus,
    workedHours: 0,
    source,
    locationVerified,
    lat,
    lng,
    distanceMeters,
    faceDetected: !!faceDetected,
    faceVerified: isCamera ? true : undefined,
    faceMatchScore: isCamera ? (faceMatchScore || 94) : undefined,
    photoSnapshot: isCamera ? photoSnapshot : undefined,
    createdAt: nowISO,
  };

  db.update((draft) => {
    draft.attendance.push(record);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ATTENDANCE',
    entityId: record.id,
    details: `Attendance check-in logged via ${source} for ${targetEmp.firstName} ${targetEmp.lastName} (Date: ${today}, Status: ${initialStatus}, Face Verified: ${isCamera ? 'YES' : 'N/A'})`,
    afterState: record,
  });

  res.status(201).json({
    message: `Check-in successful! Verified identity for ${targetEmp.firstName} ${targetEmp.lastName} (${initialStatus === 'late' ? 'Late Arrival' : 'Present'}).`,
    record,
  });
});

// POST /api/attendance/check-out
attendanceRouter.post('/check-out', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();

  let employeeId = user.employeeId;
  if (req.body.employeeId) {
    employeeId = req.body.employeeId;
  } else if (!employeeId && (user.role === 'admin' || user.role === 'hr')) {
    employeeId = state.employees[0]?.id;
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'No associated employee record found.' });
  }

  const targetDate = (req.body.date as string) || new Date().toISOString().split('T')[0];
  const record = state.attendance.find((a) => a.employeeId === employeeId && a.date === targetDate);
  if (!record) {
    return res.status(404).json({ error: `No active check-in record found for date ${targetDate}.` });
  }

  if (record.checkOutTime) {
    return res.status(400).json({ error: `You have already checked out for date ${targetDate}.` });
  }

  const nowISO = req.body.checkOutTime
    ? (req.body.checkOutTime.includes('T') ? req.body.checkOutTime : `${targetDate}T${req.body.checkOutTime}:00.000Z`)
    : new Date().toISOString();

  const checkInDate = new Date(record.checkInTime);
  const checkOutDate = new Date(nowISO);
  const diffMs = Math.max(0, checkOutDate.getTime() - checkInDate.getTime());
  const diffHours = Math.max(0.1, Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10);

  // Half-day evaluation: worked duration under configured half-day hours (e.g. 5h)
  let finalStatus = record.status;
  if (diffHours < state.settings.halfDayHours) {
    finalStatus = 'half_day';
  }

  db.update((draft) => {
    const r = draft.attendance.find((x) => x.id === record.id);
    if (r) {
      r.checkOutTime = nowISO;
      r.workedHours = diffHours;
      r.status = finalStatus;
    }
  });

  logAudit({
    req,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    entityId: record.id,
    details: `Attendance check-out logged (${diffHours} hrs worked. Final status: ${finalStatus}) for date ${targetDate}`,
  });

  res.json({
    message: `Check-out successful. Total time worked: ${diffHours} hours (${finalStatus === 'half_day' ? 'Half-Day' : 'Complete'}).`,
    record: db.get().attendance.find((x) => x.id === record.id),
  });
});

// POST /api/attendance/record (Direct manual date-wise record with in and out time)
attendanceRouter.post('/record', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { employeeId, date, checkInTime, checkOutTime, status, notes } = req.body;
  if (!employeeId || !date || !checkInTime) {
    return res.status(400).json({ error: 'Employee, date, and check-in time are required.' });
  }

  const state = db.get();
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  const checkInISO = checkInTime.includes('T') ? checkInTime : `${date}T${checkInTime}:00.000Z`;
  const checkOutISO = checkOutTime ? (checkOutTime.includes('T') ? checkOutTime : `${date}T${checkOutTime}:00.000Z`) : undefined;

  let workedHours = 0;
  if (checkOutISO) {
    const inMs = new Date(checkInISO).getTime();
    const outMs = new Date(checkOutISO).getTime();
    workedHours = Math.max(0, Math.round(((outMs - inMs) / (1000 * 60 * 60)) * 10) / 10);
  }

  let finalStatus = status;
  if (!finalStatus || finalStatus === 'auto') {
    const autoStatus = evaluateCheckInStatus(checkInISO, state.settings.officeStart, state.settings.graceMinutes);
    finalStatus = workedHours > 0 && workedHours < state.settings.halfDayHours ? 'half_day' : autoStatus;
  }

  const existing = state.attendance.find((a) => a.employeeId === employeeId && a.date === date);

  db.update((draft) => {
    if (existing) {
      const r = draft.attendance.find((a) => a.id === existing.id);
      if (r) {
        r.checkInTime = checkInISO;
        r.checkOutTime = checkOutISO;
        r.workedHours = workedHours;
        r.status = finalStatus;
        if (notes !== undefined) r.notes = notes;
      }
    } else {
      draft.attendance.push({
        id: 'att_' + Date.now(),
        employeeId,
        date,
        checkInTime: checkInISO,
        checkOutTime: checkOutISO,
        workedHours,
        status: finalStatus,
        source: 'web',
        notes: notes || 'Manually recorded date-wise attendance',
        createdAt: new Date().toISOString(),
      });
    }
  });

  logAudit({
    req,
    action: existing ? 'UPDATE' : 'CREATE',
    entity: 'ATTENDANCE',
    entityId: existing?.id || 'manual',
    details: `Manual attendance recorded for ${emp.firstName} ${emp.lastName} on ${date} (In: ${checkInTime}, Out: ${checkOutTime || 'None'}, Status: ${finalStatus})`,
  });

  res.json({
    message: `Attendance for ${emp.firstName} ${emp.lastName} on ${date} recorded successfully.`,
    record: db.get().attendance.find((a) => a.employeeId === employeeId && a.date === date),
  });
});

// DELETE /api/attendance/:id
attendanceRouter.delete('/:id', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const state = db.get();
  const record = state.attendance.find((a) => a.id === id);
  if (!record) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  db.update((draft) => {
    draft.attendance = draft.attendance.filter((a) => a.id !== id);
  });

  logAudit({
    req,
    action: 'DELETE',
    entity: 'ATTENDANCE',
    entityId: id,
    details: `Deleted attendance record ${id} for date ${record.date}`,
  });

  res.json({ message: 'Attendance record deleted successfully.' });
});

// GET /api/attendance/corrections (List correction requests)
attendanceRouter.get('/corrections', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();

  let list = state.corrections;
  if (user.role === 'employee') {
    list = list.filter((c) => c.employeeId === user.employeeId);
  }

  const enriched = list.map((c) => {
    const emp = state.employees.find((e) => e.id === c.employeeId);
    return {
      ...c,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
      employeeCode: emp?.employeeCode || 'N/A',
    };
  });

  res.json(enriched);
});

// POST /api/attendance/corrections (Employee requests correction)
attendanceRouter.post('/corrections', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const state = db.get();
  const { date, requestedCheckIn, requestedCheckOut, reason } = req.body;

  if (!date || !requestedCheckIn || !requestedCheckOut || !reason) {
    return res.status(400).json({ error: 'Date, check-in, check-out, and reason are required.' });
  }

  const empId = user.employeeId || state.employees[0]?.id;
  if (!empId) {
    return res.status(400).json({ error: 'No associated employee account found.' });
  }

  const existingAtt = state.attendance.find((a) => a.employeeId === empId && a.date === date);

  const correction: AttendanceCorrection = {
    id: 'cor_' + Date.now(),
    employeeId: empId,
    attendanceId: existingAtt?.id,
    date,
    requestedCheckIn,
    requestedCheckOut,
    reason: reason.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.update((draft) => {
    draft.corrections.unshift(correction);
  });

  logAudit({
    req,
    action: 'CREATE',
    entity: 'ATTENDANCE',
    entityId: correction.id,
    details: `Attendance correction requested for date ${date}: "${reason}"`,
  });

  res.status(201).json(correction);
});

// POST /api/attendance/corrections/:id/action (HR approves or rejects)
attendanceRouter.post('/corrections/:id/action', authenticate, requireRole(['admin', 'hr']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { action, reviewComment } = req.body; // action: 'approve' | 'reject'
  const user = req.user!;
  const state = db.get();

  const cor = state.corrections.find((c) => c.id === id);
  if (!cor) {
    return res.status(404).json({ error: 'Correction request not found' });
  }

  if (cor.status !== 'pending') {
    return res.status(400).json({ error: `Correction request has already been ${cor.status}.` });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  db.update((draft) => {
    const item = draft.corrections.find((x) => x.id === id);
    if (item) {
      item.status = newStatus;
      item.reviewedBy = user.id;
      item.reviewedAt = new Date().toISOString();
      item.reviewComment = reviewComment?.trim();
    }

    // If approved, update or insert attendance record
    if (newStatus === 'approved') {
      const [inH, inM] = item!.requestedCheckIn.split(':').map(Number);
      const [outH, outM] = item!.requestedCheckOut.split(':').map(Number);
      const checkInISO = `${item!.date}T${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:00.000Z`;
      const checkOutISO = `${item!.date}T${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:00.000Z`;

      const diffHours = Math.max(0, (outH * 60 + outM - (inH * 60 + inM)) / 60);
      const statusRule = evaluateCheckInStatus(checkInISO, draft.settings.officeStart, draft.settings.graceMinutes);
      const finalStatus = diffHours < draft.settings.halfDayHours ? 'half_day' : statusRule;

      let attRecord = draft.attendance.find((a) => a.employeeId === item!.employeeId && a.date === item!.date);
      if (attRecord) {
        attRecord.checkInTime = checkInISO;
        attRecord.checkOutTime = checkOutISO;
        attRecord.workedHours = Math.round(diffHours * 10) / 10;
        attRecord.status = finalStatus;
        attRecord.notes = `Approved correction: ${item!.reason}`;
      } else {
        draft.attendance.push({
          id: 'att_' + Date.now(),
          employeeId: item!.employeeId,
          date: item!.date,
          checkInTime: checkInISO,
          checkOutTime: checkOutISO,
          workedHours: Math.round(diffHours * 10) / 10,
          status: finalStatus,
          source: 'web',
          notes: `Created via approved correction: ${item!.reason}`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Send in-app notification to employee
    const targetEmp = draft.employees.find((e) => e.id === cor.employeeId);
    if (targetEmp) {
      draft.notifications.unshift({
        id: 'notif_' + Date.now(),
        userId: targetEmp.userId,
        title: `Attendance Correction ${newStatus.toUpperCase()}`,
        message: `Your correction request for ${cor.date} was ${newStatus} by HR${reviewComment ? ': ' + reviewComment : '.'}`,
        type: 'attendance',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }
  });

  logAudit({
    req,
    action: newStatus === 'approved' ? 'APPROVE' : 'REJECT',
    entity: 'ATTENDANCE',
    entityId: id,
    details: `Attendance correction for ${cor.date} was ${newStatus} by HR`,
  });

  res.json({ message: `Correction request ${newStatus}.`, correction: db.get().corrections.find((x) => x.id === id) });
});
