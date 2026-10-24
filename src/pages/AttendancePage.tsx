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
} from 'lucide-react';
import { AttendanceCorrection } from '../types/index.ts';

interface AttendancePageProps {
  onOpenCameraAttendance: () => void;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ onOpenCameraAttendance }) => {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const canApprove = user?.role === 'admin' || user?.role === 'hr';

  const [activeTab, setActiveTab] = useState<'board' | 'calendar' | 'corrections'>('board');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [todayData, setTodayData] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<any>(null);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Correction request modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqDate, setReqDate] = useState(new Date().toISOString().split('T')[0]);
  const [reqCheckIn, setReqCheckIn] = useState('09:00');
  const [reqCheckOut, setReqCheckOut] = useState('17:30');
  const [reqReason, setReqReason] = useState('');

  // Review modal
  const [selectedCorrection, setSelectedCorrection] = useState<AttendanceCorrection | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [todayRes, corRes] = await Promise.all([
        api.getTodayAttendance(selectedDate),
        api.getCorrections(),
      ]);
      setTodayData(todayRes);
      setCorrections(corRes);

      // Load calendar
      const now = new Date();
      const calRes = await api.getMonthlyCalendar({ month: now.getMonth() + 1, year: now.getFullYear() });
      setCalendarData(calRes);
    } catch (err) {
      console.error('Failed to load attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleWebCheckIn = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await api.checkIn({ isCamera: false });
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check-in failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleWebCheckOut = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await api.checkOut();
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check-out failed' });
    } finally {
      setActionLoading(false);
    }
  };

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

  if (loading && !todayData) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Attendance Records...</span>
      </div>
    );
  }

  const summary = todayData?.summary || {};
  const roster = todayData?.roster || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Attendance Center</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Real-time daily roster, geolocation camera attendance, and HR punch corrections
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Quick employee punch actions */}
          <button
            onClick={handleWebCheckIn}
            disabled={actionLoading}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            Web Punch In
          </button>
          <button
            onClick={handleWebCheckOut}
            disabled={actionLoading}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl transition-colors cursor-pointer"
          >
            Punch Out
          </button>
          <button
            onClick={onOpenCameraAttendance}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-colors cursor-pointer"
            title="Camera + Geofence Attendance"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera Attendance</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('board')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'board'
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Daily Roster Board
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Monthly Calendar
          </button>
          <button
            onClick={() => setActiveTab('corrections')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'corrections'
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Corrections Queue ({corrections.filter((c) => c.status === 'pending').length})
          </button>
        </div>

        {activeTab === 'board' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-400">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-white font-mono"
            />
          </div>
        )}

        {activeTab === 'corrections' && (
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Request Correction</span>
          </button>
        )}
      </div>

      {/* Tab: Daily Board */}
      {activeTab === 'board' && (
        <div className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block">Total Staff</span>
              <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {summary.total ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block">Present On-Time</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                {summary.present ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block">Late Arrivals</span>
              <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {summary.late ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <span className="text-[11px] text-neutral-400 block">On Leave</span>
              <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                {summary.onLeave ?? 0}
              </span>
            </div>
            <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[11px] text-neutral-400 block">Attendance Rate</span>
              <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {summary.rate ?? 100}%
              </span>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Check In</th>
                  <th className="px-4 py-3 font-medium">Check Out</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Source / Geofence</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {roster.map((r: any) => (
                  <tr key={r.employeeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900 dark:text-white">{r.name}</div>
                      <div className="text-[11px] text-neutral-400 font-mono">
                        {r.employeeCode} · {r.department}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-700 dark:text-neutral-300 tabular-nums">
                      {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-700 dark:text-neutral-300 tabular-nums">
                      {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500 tabular-nums">
                      {r.workedHours > 0 ? `${r.workedHours} hrs` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                        {r.source === 'camera' ? (
                          <>
                            <Camera className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Camera (GPS Verified)</span>
                          </>
                        ) : (
                          <span>Web Portal</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Monthly Calendar */}
      {activeTab === 'calendar' && (
        <div className="p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Monthly Calendar Grid ({calendarData?.month}/{calendarData?.year})
            </span>
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
              const isWeekend = (i % 7 === 0 || i % 7 === 6);

              return (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between h-20 transition-colors ${
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
                  <span className="font-mono text-neutral-500 font-bold text-[11px]">{dayNum}</span>
                  <div className="text-[10px]">
                    {att && (
                      <span className="font-semibold text-neutral-900 dark:text-white capitalize block">
                        {att.status}
                      </span>
                    )}
                    {leave && (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 capitalize block">
                        {leave.leaveType}
                      </span>
                    )}
                    {!att && !leave && isWeekend && (
                      <span className="text-neutral-400 block">Weekend</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Corrections Queue */}
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
                  <td colSpan={6} className="text-center py-8 text-neutral-400">
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
                      {canApprove && c.status === 'pending' ? (
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

      {/* Submit Correction Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Request Attendance Correction
            </h3>
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
                  placeholder="e.g. Offsite client presentation, biometric scanner offline"
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

      {/* Review Correction Modal (HR / Admin) */}
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
                placeholder="e.g. Verified with project manager"
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
