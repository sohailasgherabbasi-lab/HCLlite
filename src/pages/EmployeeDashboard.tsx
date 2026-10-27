import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import {
  CalendarCheck,
  Clock,
  CalendarRange,
  DollarSign,
  Camera,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Megaphone,
  ScanFace,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { FaceEnrollmentModal } from '../components/employee/FaceEnrollmentModal.tsx';

interface EmployeeDashboardProps {
  onOpenSmartLeave: () => void;
  onOpenCameraAttendance: () => void;
  onNavigateToLeaves: () => void;
  onNavigateToPayslips: () => void;
}

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

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  onOpenSmartLeave,
  onOpenCameraAttendance,
  onNavigateToLeaves,
  onNavigateToPayslips,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.getEmployeeAnalytics();
      setData(res);
    } catch (err) {
      console.error('Failed to load employee dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleWebCheckIn = async () => {
    if (emp?.faceEnrolled) {
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

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Self-Service Workspace...</span>
      </div>
    );
  }

  const today = data?.todayStatus || {};
  const weekly = data?.weeklyStats || {};
  const monthly = data?.monthlyStats || {};
  const balances = data?.leaveBalance || {};
  const emp = data?.employee || {};

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Card */}
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-indigo-800/60">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-indigo-300 tracking-wider uppercase">
            Employee Self-Service Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-bold">
            Welcome back, {emp.firstName || 'Employee'}!
          </h1>
          <p className="text-xs text-indigo-200/80">
            {emp.employeeCode} · {emp.departmentName || 'Engineering'} · {emp.designationName || 'Team Member'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowFaceModal(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer ${
              emp.faceEnrolled
                ? 'bg-indigo-800/80 hover:bg-indigo-700/80 text-white border border-indigo-700/80'
                : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 animate-pulse'
            }`}
            title="Biometric Face ID Profile"
          >
            {emp.faceEnrolled ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Face ID Active</span>
              </>
            ) : (
              <>
                <ScanFace className="w-3.5 h-3.5 text-neutral-950" />
                <span>Enroll Face ID</span>
              </>
            )}
          </button>

          {emp.faceEnrolled && (
            <button
              onClick={async () => {
                if (!confirm('Are you sure you want to remove your Face ID biometric profile?')) return;
                setActionLoading(true);
                try {
                  const res = await api.deleteFace(emp.id);
                  setFeedback({ type: 'success', message: res.message || 'Face ID removed successfully.' });
                  await loadData();
                } catch (err: any) {
                  setFeedback({ type: 'error', message: err.message || 'Failed to remove Face ID.' });
                } finally {
                  setActionLoading(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              title="Delete your biometric facial profile"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-300" />
              <span>Delete Face ID</span>
            </button>
          )}

          <button
            onClick={onOpenSmartLeave}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-900 hover:bg-neutral-100 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Smart Leave Assistant</span>
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
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Primary 3-Column Strip: Daily Check-in / Work Hours / Late Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Check-in Widget */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-indigo-500" />
              <span>Today's Check-in</span>
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                today.hasCheckedOut
                  ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                  : today.hasCheckedIn
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {today.hasCheckedOut
                ? 'Checked Out'
                : today.hasCheckedIn
                ? today.status === 'late'
                  ? 'Checked In (Late)'
                  : 'Checked In'
                : today.status === 'on_leave'
                ? 'On Approved Leave'
                : 'Not Checked In'}
            </span>
          </div>

          <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <div className="flex justify-between">
              <span>Punch In:</span>
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {formatTime(today.checkInTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Punch Out:</span>
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {formatTime(today.checkOutTime)}
              </span>
            </div>
          </div>

          {!emp.faceEnrolled && (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-[10px] text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span>Face ID required for camera punch</span>
              </span>
              <button
                type="button"
                onClick={() => setShowFaceModal(true)}
                className="font-bold underline cursor-pointer"
              >
                Enroll Now
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
            {!today.hasCheckedIn ? (
              emp.faceEnrolled ? (
                <button
                  onClick={onOpenCameraAttendance}
                  disabled={actionLoading || today.status === 'on_leave'}
                  className="w-full py-2.5 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  <ScanFace className="w-4 h-4" />
                  <span>Face ID Punch (Biometric Active)</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleWebCheckIn}
                    disabled={actionLoading || today.status === 'on_leave'}
                    className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                  >
                    Web Check-In
                  </button>
                  <button
                    onClick={onOpenCameraAttendance}
                    disabled={actionLoading || today.status === 'on_leave'}
                    className="p-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 rounded-xl border border-indigo-200 dark:border-indigo-900 cursor-pointer flex items-center gap-1 text-xs font-semibold"
                    title="Biometric Facial Recognition Check-in"
                  >
                    <ScanFace className="w-4 h-4 text-indigo-500" />
                  </button>
                </>
              )
            ) : !today.hasCheckedOut ? (
              <button
                onClick={handleWebCheckOut}
                disabled={actionLoading}
                className="w-full py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                Web Check-Out
              </button>
            ) : (
              <div className="w-full text-center py-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Day Completed. Good work!
              </div>
            )}
          </div>
        </div>

        {/* Weekly Hours vs 40 Hours */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Hours This Week</span>
            </span>
            <span className="text-xs font-mono font-bold text-neutral-900 dark:text-white tabular-nums">
              {weekly.hoursWorked ?? 0} / 40 hrs
            </span>
          </div>

          <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${weekly.completionRate || 0}%` }}
              className="h-full bg-emerald-500 transition-all duration-500"
            />
          </div>

          <div className="text-[11px] text-neutral-500 flex justify-between">
            <span>Progress: {weekly.completionRate || 0}%</span>
            <span>Standard: 40h / week</span>
          </div>
        </div>

        {/* Monthly Late Count */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Monthly Late Arrivals</span>
            </span>
            <span
              className={`text-base font-bold font-mono px-2 py-0.5 rounded ${
                monthly.warningIssued
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                  : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
              } tabular-nums`}
            >
              {monthly.lateCount ?? 0} time(s)
            </span>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Office starts 09:00 with 15 min grace (cutoff 09:15).
          </p>

          {monthly.warningIssued ? (
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-[11px] text-rose-600 dark:text-rose-400">
              Penalty Rule Active: 3 lates = 0.5 day salary deduction applied in payroll.
            </div>
          ) : (
            <div className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-[11px] text-neutral-400">
              {3 - (monthly.lateCount || 0)} more late arrival(s) before 0.5-day deduction.
            </div>
          )}
        </div>
      </div>

      {/* Leave Balances Grid */}
      <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-indigo-500" />
            <span>My Leave Balances (Annual Quota)</span>
          </h3>
          <button
            onClick={onNavigateToLeaves}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View Full History</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
            <span className="block text-xs font-medium text-neutral-400">Annual Leave</span>
            <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
              {balances.annual ?? 14}
            </span>
            <span className="block text-[11px] text-neutral-500">days left (quota 14)</span>
          </div>

          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
            <span className="block text-xs font-medium text-neutral-400">Sick Leave</span>
            <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
              {balances.sick ?? 8}
            </span>
            <span className="block text-[11px] text-neutral-500">days left (quota 8)</span>
          </div>

          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
            <span className="block text-xs font-medium text-neutral-400">Casual Leave</span>
            <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
              {balances.casual ?? 10}
            </span>
            <span className="block text-[11px] text-neutral-500">days left (quota 10)</span>
          </div>

          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
            <span className="block text-xs font-medium text-neutral-400">Unpaid Leave</span>
            <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
              Unlimited
            </span>
            <span className="block text-[11px] text-neutral-500">salary deducted</span>
          </div>
        </div>
      </div>

      {/* Grid: Latest Payslip & Recent Announcements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Latest Payslip Card */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span>Latest Released Payslip</span>
            </h3>
            <button
              onClick={onNavigateToPayslips}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              All Payslips
            </button>
          </div>

          {data?.lastPayslip ? (
            <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Month: {data.lastPayslip.month}/{data.lastPayslip.year}
                </span>
                <p className="text-[11px] text-neutral-400">
                  Finalized: {new Date(data.lastPayslip.finalizedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-500 block">Take-Home Pay</span>
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  PKR {Number(data.lastPayslip.netSalary).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-neutral-400">
              No finalized monthly payslip released yet.
            </div>
          )}
        </div>

        {/* Company Announcements */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-indigo-500" />
              <span>Company Announcements</span>
            </h3>
          </div>

          {data?.recentAnnouncements?.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-400">
              No recent announcements.
            </div>
          ) : (
            <div className="space-y-2">
              {data?.recentAnnouncements?.map((a: any) => (
                <div
                  key={a.id}
                  className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800 text-xs"
                >
                  <div className="flex items-center justify-between font-semibold text-neutral-900 dark:text-white">
                    <span>{a.title}</span>
                    <span className="text-[10px] text-neutral-400 font-normal">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-neutral-600 dark:text-neutral-300 mt-1 line-clamp-2">
                    {a.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {emp && (
        <FaceEnrollmentModal
          isOpen={showFaceModal}
          onClose={() => setShowFaceModal(false)}
          employee={emp}
          onSuccess={(updated) => {
            loadData();
            setShowFaceModal(false);
          }}
        />
      )}
    </div>
  );
};
