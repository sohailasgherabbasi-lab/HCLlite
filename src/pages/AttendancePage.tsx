import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  CalendarCheck,
  Calendar,
  Clock,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  X,
  FileCheck,
  ShieldCheck,
  MapPin,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LogIn,
  Edit3,
  Trash2,
  UserCheck,
  ScanFace,
} from 'lucide-react';
import { AttendanceCorrection } from '../types/index.ts';

interface AttendancePageProps {
  onOpenCameraAttendance: () => void;
}

// Safe time formatter supporting both ISO strings and HH:MM
const formatTime = (timeStr?: string): string => {
  if (!timeStr) return '—';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(Number(h), Number(m));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
};

export const AttendancePage: React.FC<AttendancePageProps> = ({ onOpenCameraAttendance }) => {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const canManage = user?.role === 'admin' || user?.role === 'hr';

  const todayStr = new Date().toISOString().split('T')[0];
  const [activeTab, setActiveTab] = useState<'board' | 'calendar' | 'corrections'>('board');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [todayData, setTodayData] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<any>(null);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manual Date-wise Attendance Record Modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordEmpId, setRecordEmpId] = useState('');
  const [recordDate, setRecordDate] = useState(todayStr);
  const [recordCheckIn, setRecordCheckIn] = useState('09:00');
  const [recordCheckOut, setRecordCheckOut] = useState('17:30');
  const [recordStatus, setRecordStatus] = useState('auto');
  const [recordNotes, setRecordNotes] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  // Employee Correction request modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqDate, setReqDate] = useState(todayStr);
  const [reqCheckIn, setReqCheckIn] = useState('09:00');
  const [reqCheckOut, setReqCheckOut] = useState('17:30');
  const [reqReason, setReqReason] = useState('');

  // HR Review modal
  const [selectedCorrection, setSelectedCorrection] = useState<AttendanceCorrection | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [todayRes, corRes, empRes] = await Promise.all([
        api.getTodayAttendance(selectedDate),
        api.getCorrections(),
        api.getEmployees({ limit: 100 }),
      ]);
      setTodayData(todayRes);
      setCorrections(corRes || []);
      setAllEmployees(empRes?.items || []);

      // Load calendar for selected date's month and year
      const d = new Date(selectedDate);
      const m = isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
      const y = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
      const calRes = await api.getMonthlyCalendar({ month: m, year: y });
      setCalendarData(calRes);
    } catch (err) {
      console.error('Failed to load attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleSync = () => {
      loadData();
    };
    window.addEventListener('hcm_cloud_synced', handleSync);
    return () => {
      window.removeEventListener('hcm_cloud_synced', handleSync);
    };
  }, [selectedDate]);

  // Date navigation helpers
  const handleShiftDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const myEmp = allEmployees.find(
    (e: any) => e.id === user?.employeeId || (!isEmployee && e.id === todayData?.roster?.[0]?.employeeId)
  );
  const isMyFaceEnrolled = myEmp?.faceEnrolled;

  const handleWebCheckIn = async () => {
    if (isMyFaceEnrolled) {
      setFeedback({
        type: 'error',
        message: 'Face ID is enrolled for your profile. Facial biometric authentication via camera is required to mark attendance.',
      });
      onOpenCameraAttendance();
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await api.checkIn({
        isCamera: false,
        date: selectedDate,
        employeeId: user?.employeeId,
      });
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check-in failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleWebCheckOut = async (empId?: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const targetEmpId = empId || user?.employeeId;
      const res = await api.checkOut({
        employeeId: targetEmpId,
        date: selectedDate,
      });
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check-out failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open manual record modal
  const handleOpenRecordModal = (employeeId?: string) => {
    const targetId =
      employeeId ||
      user?.employeeId ||
      (todayData?.roster && todayData.roster[0]?.employeeId) ||
      (allEmployees[0]?.id ?? '');
    setRecordEmpId(targetId);
    setRecordDate(selectedDate);

    // If employee already has punch on this date, populate existing values
    const existing = todayData?.roster?.find((r: any) => r.employeeId === targetId);
    if (existing?.checkInTime) {
      const inTime = formatTime24(existing.checkInTime);
      setRecordCheckIn(inTime || '09:00');
      const outTime = existing.checkOutTime ? formatTime24(existing.checkOutTime) : '17:30';
      setRecordCheckOut(outTime || '17:30');
      setRecordStatus(existing.status || 'auto');
      setRecordNotes(existing.notes || '');
    } else {
      setRecordCheckIn('09:00');
      setRecordCheckOut('17:30');
      setRecordStatus('auto');
      setRecordNotes('');
    }

    setShowRecordModal(true);
  };

  // Convert ISO string or timestamp to HH:MM format for HTML input
  const formatTime24 = (t?: string): string => {
    if (!t) return '';
    if (/^\d{2}:\d{2}$/.test(t)) return t;
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return '09:00';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return '09:00';
    }
  };

  // Calculate worked hours live in modal
  const computeModalHours = (): number => {
    if (!recordCheckIn || !recordCheckOut) return 0;
    const [inH, inM] = recordCheckIn.split(':').map(Number);
    const [outH, outM] = recordCheckOut.split(':').map(Number);
    const inTotal = inH * 60 + inM;
    const outTotal = outH * 60 + outM;
    if (outTotal <= inTotal) return 0;
    return Math.round(((outTotal - inTotal) / 60) * 10) / 10;
  };

  // Save manual date-wise record
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordEmpId || !recordDate || !recordCheckIn) {
      alert('Employee, date, and check-in time are required.');
      return;
    }

    setSavingRecord(true);
    try {
      const res = await api.recordAttendance({
        employeeId: recordEmpId,
        date: recordDate,
        checkInTime: recordCheckIn,
        checkOutTime: recordCheckOut || undefined,
        status: recordStatus,
        notes: recordNotes,
      });
      setShowRecordModal(false);
      setFeedback({ type: 'success', message: res.message });
      // If recorded for a different date, switch to that date to see it
      if (recordDate !== selectedDate) {
        setSelectedDate(recordDate);
      } else {
        await loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save attendance record.');
    } finally {
      setSavingRecord(false);
    }
  };

  // Delete attendance record
  const handleDeleteRecord = async (recordId: string, empName: string) => {
    if (!confirm(`Are you sure you want to delete the attendance record for ${empName} on ${selectedDate}?`)) {
      return;
    }
    try {
      await api.deleteAttendance(recordId);
      setFeedback({ type: 'success', message: 'Attendance record removed.' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete record');
    }
  };

  // Submit correction request (employee)
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqDate || !reqCheckIn || !reqCheckOut || !reqReason) return;
    try {
      await api.requestCorrection({
        date: reqDate,
        requestedCheckIn: reqCheckIn,
        requestedCheckOut: reqCheckOut,
        reason: reqReason,
      });
      setShowRequestModal(false);
      setReqReason('');
      setFeedback({ type: 'success', message: 'Attendance correction request submitted to HR.' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit correction request');
    }
  };

  // Review correction (HR)
  const handleReviewCorrection = async (action: 'approve' | 'reject') => {
    if (!selectedCorrection) return;
    try {
      await api.reviewCorrection(selectedCorrection.id, { action, reviewComment });
      setSelectedCorrection(null);
      setReviewComment('');
      setFeedback({ type: 'success', message: `Correction request has been ${action}d.` });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to process correction review');
    }
  };

  const summary = todayData?.summary || {};
  const roster = todayData?.roster || [];

  // Active user's record on selected date
  const myRosterRecord = roster.find(
    (r: any) =>
      r.employeeId === user?.employeeId ||
      (!isEmployee && r.employeeId === (todayData?.roster[0]?.employeeId))
  );
  const isCurrentlyCheckedIn = myRosterRecord?.checkInTime && !myRosterRecord?.checkOutTime;
  const isPastDate = selectedDate < todayStr;
  const isToday = selectedDate === todayStr;

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Punch Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Attendance Center</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Record, track, and punch date-wise attendance with live check-in and check-out timestamps
          </p>
        </div>

        {/* Quick Punch Bar for Current User */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isCurrentlyCheckedIn ? (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Punched In: {formatTime(myRosterRecord.checkInTime)}
              </span>
              <button
                onClick={() => handleWebCheckOut(myRosterRecord.employeeId)}
                disabled={actionLoading}
                className="ml-2 flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Punch Out Now</span>
              </button>
            </div>
          ) : myRosterRecord?.checkInTime && myRosterRecord?.checkOutTime ? (
            <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>
                Completed: In {formatTime(myRosterRecord.checkInTime)} · Out {formatTime(myRosterRecord.checkOutTime)} ({myRosterRecord.workedHours}h)
              </span>
            </div>
          ) : isMyFaceEnrolled ? (
            <button
              onClick={onOpenCameraAttendance}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer shadow-xs"
              title="Biometric Facial Recognition Check-in"
            >
              <ScanFace className="w-3.5 h-3.5" />
              <span>Biometric Face Punch</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleWebCheckIn}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Web Punch In</span>
              </button>
              <button
                onClick={onOpenCameraAttendance}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-colors cursor-pointer"
                title="Camera + Geofence Attendance"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Attendance</span>
              </button>
            </>
          )}

          {/* Admin / HR Manual Date-wise Record Button */}
          {canManage && (
            <button
              onClick={() => handleOpenRecordModal()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-100 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500" />
              <span>Record / Mark Attendance</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between gap-2 border animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-neutral-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs & Date Navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {/* Tab switchers */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('board')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'board'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Daily Roster Board
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Monthly Calendar
          </button>
          <button
            onClick={() => setActiveTab('corrections')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'corrections'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <span>Corrections Queue</span>
            {corrections.filter((c) => c.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                {corrections.filter((c) => c.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* Date Selector & Shortcuts for Roster Board */}
        {activeTab === 'board' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Prev / Next day buttons */}
            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => handleShiftDate(-1)}
                className="p-1 text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-700 rounded cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleShiftDate(1)}
                className="p-1 text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-700 rounded cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick date presets */}
            <button
              onClick={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                setSelectedDate(y.toISOString().split('T')[0]);
              }}
              className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer font-medium transition-colors ${
                selectedDate === new Date(Date.now() - 86400000).toISOString().split('T')[0]
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300 font-semibold'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50'
              }`}
            >
              Yesterday
            </button>

            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer font-medium transition-colors ${
                isToday
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300 font-semibold'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50'
              }`}
            >
              Today
            </button>

            {/* Date input */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs text-neutral-900 dark:text-white font-mono outline-hidden cursor-pointer"
              />
            </div>
          </div>
        )}

        {activeTab === 'corrections' && (
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 dark:bg-neutral-100 dark:hover:bg-white dark:text-neutral-900 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Request Correction</span>
          </button>
        )}
      </div>

      {/* Date Notice Banner if viewing previous or future date */}
      {activeTab === 'board' && !isToday && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>
              Viewing records for <strong>{selectedDate}</strong> ({isPastDate ? 'Previous Date' : 'Future Date'}).
              You can view, modify, or manually record punches date-wise below.
            </span>
          </div>
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="text-xs underline font-semibold text-amber-900 dark:text-amber-200 hover:opacity-80 cursor-pointer"
          >
            Jump to Today
          </button>
        </div>
      )}

      {/* TAB 1: DAILY ROSTER BOARD */}
      {activeTab === 'board' && (
        <div className="space-y-4">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block font-medium">Total Staff</span>
              <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {summary.total ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block font-medium">Present</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                {summary.present ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block font-medium">Late Arrivals</span>
              <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {summary.late ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block font-medium">On Leave</span>
              <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                {summary.onLeave ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[11px] text-neutral-400 block font-medium">Attendance Rate</span>
              <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {summary.rate ?? '100%'}
              </span>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Punch In</th>
                    <th className="px-4 py-3 font-medium">Punch Out</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-neutral-400">
                        No employees found for this date.
                      </td>
                    </tr>
                  ) : (
                    roster.map((r: any) => {
                      const hasIn = !!r.checkInTime;
                      const hasOut = !!r.checkOutTime;
                      const inProgress = hasIn && !hasOut;

                      return (
                        <tr key={r.employeeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-neutral-900 dark:text-white">{r.name}</div>
                            <div className="text-[11px] text-neutral-400 font-mono">
                              {r.employeeCode} · {r.department}
                            </div>
                          </td>

                          <td className="px-4 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                            {selectedDate}
                          </td>

                          <td className="px-4 py-3 font-mono tabular-nums">
                            {hasIn ? (
                              <span className="text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                {formatTime(r.checkInTime)}
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono tabular-nums">
                            {hasOut ? (
                              <span className="text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                {formatTime(r.checkOutTime)}
                              </span>
                            ) : inProgress ? (
                              <span className="text-amber-700 dark:text-amber-300 text-[11px] font-medium animate-pulse">
                                In Progress...
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono tabular-nums">
                            {r.workedHours > 0 ? (
                              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                {r.workedHours} hrs
                              </span>
                            ) : inProgress ? (
                              <span className="text-[11px] text-neutral-400 italic">Tracking</span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {r.source === 'camera' ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                  <ScanFace className="w-3.5 h-3.5" />
                                  <span>Face ID Kiosk</span>
                                </span>
                                {r.faceVerified && (
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                    ✓ Match {r.faceMatchScore || 94}%
                                  </span>
                                )}
                              </div>
                            ) : r.checkInTime ? (
                              <span className="text-[11px] text-neutral-600 dark:text-neutral-400">Web Portal</span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                                r.status === 'present'
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900'
                                  : r.status === 'late'
                                  ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900'
                                  : r.status === 'half_day'
                                  ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:border-purple-900'
                                  : r.status === 'on_leave'
                                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900'
                                  : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900'
                              }`}
                            >
                              {r.status.replace('_', ' ')}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Punch Out button if currently checked in */}
                              {inProgress && (
                                <button
                                  onClick={() => handleWebCheckOut(r.employeeId)}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                  title="Punch Out this employee now"
                                >
                                  <LogOut className="w-3 h-3" />
                                  <span>Punch Out</span>
                                </button>
                              )}

                              {/* Admin/HR Mark or Edit Punch */}
                              {canManage && (
                                <button
                                  onClick={() => handleOpenRecordModal(r.employeeId)}
                                  className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-md text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Edit or Mark In/Out Times for this date"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{hasIn ? 'Edit' : 'Mark'}</span>
                                </button>
                              )}

                              {/* Delete record if exists */}
                              {canManage && r.recordId && (
                                <button
                                  onClick={() => handleDeleteRecord(r.recordId, r.name)}
                                  className="p-1 text-neutral-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remove Attendance Record"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MONTHLY CALENDAR GRID */}
      {activeTab === 'calendar' && (
        <div className="p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-xs uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Monthly Attendance Calendar ({calendarData?.month}/{calendarData?.year})
              </span>
              <p className="text-[11px] text-neutral-400">Click any day cell to jump directly to that date's attendance</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Late
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Leave
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-neutral-300" /> Weekend
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d} className="font-bold text-neutral-400 py-1">
                {d}
              </span>
            ))}

            {Array.from({ length: 31 }, (_, i) => {
              const dayNum = i + 1;
              const dateStr = `${calendarData?.year}-${String(calendarData?.month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const att = calendarData?.records?.find((r: any) => r.date === dateStr);
              const leave = calendarData?.leaves?.find((l: any) => l.startDate <= dateStr && l.endDate >= dateStr);
              const isWeekend = i % 7 === 0 || i % 7 === 6;
              const isSelected = dateStr === selectedDate;

              return (
                <div
                  key={i}
                  onClick={() => {
                    setSelectedDate(dateStr);
                    setActiveTab('board');
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between h-20 transition-all cursor-pointer hover:border-indigo-400 hover:shadow-xs ${
                    isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                  } ${
                    att?.status === 'present'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'
                      : att?.status === 'late'
                      ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                      : leave
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40'
                      : isWeekend
                      ? 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-800 opacity-70'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-neutral-600 dark:text-neutral-400 font-bold text-[11px]">
                      {dayNum}
                    </span>
                    {att?.workedHours ? (
                      <span className="text-[9px] text-neutral-400 font-mono">{att.workedHours}h</span>
                    ) : null}
                  </div>
                  <div className="text-[10px]">
                    {att && (
                      <span className="font-semibold text-neutral-900 dark:text-white capitalize block truncate">
                        {att.status} {att.checkInTime ? `(${formatTime(att.checkInTime)})` : ''}
                      </span>
                    )}
                    {leave && (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 capitalize block truncate">
                        {leave.leaveType}
                      </span>
                    )}
                    {!att && !leave && isWeekend && (
                      <span className="text-neutral-400 block">Weekend</span>
                    )}
                    {!att && !leave && !isWeekend && (
                      <span className="text-neutral-400/80 block hover:text-indigo-500">+ Mark</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CORRECTIONS QUEUE */}
      {activeTab === 'corrections' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Target Date</th>
                <th className="px-4 py-3 font-medium">Requested Hours</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-neutral-400">
                    No attendance corrections requested.
                  </td>
                </tr>
              ) : (
                corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      {c.employeeName}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-600 dark:text-neutral-300">
                      {c.date}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500">
                      {c.requestedCheckIn} — {c.requestedCheckOut}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300 max-w-xs truncate">
                      "{c.reason}"
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                          c.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : c.status === 'rejected'
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && c.status === 'pending' ? (
                        <button
                          onClick={() => setSelectedCorrection(c)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg cursor-pointer"
                        >
                          Review Request
                        </button>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: RECORD / MARK ATTENDANCE DATE-WISE (Admin / HR) */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Record Date-wise Attendance
                  </h3>
                  <p className="text-[11px] text-neutral-400">Set punch in and out times for any date</p>
                </div>
              </div>
              <button
                onClick={() => setShowRecordModal(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3.5">
              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Employee
                </label>
                <select
                  required
                  value={recordEmpId}
                  onChange={(e) => setRecordEmpId(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white cursor-pointer focus:ring-1 focus:ring-indigo-500"
                >
                  {allEmployees.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeCode} · {e.firstName} {e.lastName} ({e.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Attendance Date (Past or Present)
                </label>
                <input
                  type="date"
                  required
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Punch In and Out Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Punch In Time
                  </label>
                  <input
                    type="time"
                    required
                    value={recordCheckIn}
                    onChange={(e) => setRecordCheckIn(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Punch Out Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={recordCheckOut}
                    onChange={(e) => setRecordCheckOut(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Live duration calculation banner */}
              {recordCheckIn && recordCheckOut && (
                <div className="p-2.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs flex items-center justify-between font-mono">
                  <span className="text-neutral-500">Calculated Work Duration:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {computeModalHours()} hours
                  </span>
                </div>
              )}

              {/* Status Override */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Attendance Status
                </label>
                <select
                  value={recordStatus}
                  onChange={(e) => setRecordStatus(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white cursor-pointer focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="auto">Auto (Calculate based on office start & hours)</option>
                  <option value="present">Present (Full Day)</option>
                  <option value="late">Late Arrival</option>
                  <option value="half_day">Half Day (&lt; 5 hours)</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Notes / Reason
                </label>
                <input
                  type="text"
                  value={recordNotes}
                  onChange={(e) => setRecordNotes(e.target.value)}
                  placeholder="e.g. Marked manually by Admin, client off-site meeting"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-3.5 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRecord}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  {savingRecord ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Attendance Record</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST ATTENDANCE CORRECTION (Employee) */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Request Attendance Correction
            </h3>
            <p className="text-[11px] text-neutral-500">
              Submit your punch in and punch out times for previous missed days for HR approval
            </p>
            <form onSubmit={handleSubmitCorrection} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  required
                  value={reqDate}
                  onChange={(e) => setReqDate(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                    Actual Check-In
                  </label>
                  <input
                    type="time"
                    required
                    value={reqCheckIn}
                    onChange={(e) => setReqCheckIn(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                    Actual Check-Out
                  </label>
                  <input
                    type="time"
                    required
                    value={reqCheckOut}
                    onChange={(e) => setReqCheckOut(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Correction Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="e.g. Biometric scanner offline, forgot card, off-site client deployment"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REVIEW ATTENDANCE CORRECTION (HR / Admin) */}
      {selectedCorrection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Review Attendance Correction
            </h3>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl space-y-1 text-xs">
              <div><strong>Employee:</strong> {selectedCorrection.employeeName}</div>
              <div><strong>Date:</strong> {selectedCorrection.date}</div>
              <div><strong>Times:</strong> {selectedCorrection.requestedCheckIn} to {selectedCorrection.requestedCheckOut}</div>
              <div><strong>Reason:</strong> {selectedCorrection.reason}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                HR Review Comment
              </label>
              <input
                type="text"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="e.g. Verified with team supervisor"
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedCorrection(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReviewCorrection('reject')}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleReviewCorrection('approve')}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Approve & Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
