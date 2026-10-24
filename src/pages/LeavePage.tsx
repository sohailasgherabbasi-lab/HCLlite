import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  CalendarRange,
  Sparkles,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Check,
  X,
} from 'lucide-react';
import { LeaveRequest } from '../types/index.ts';

interface LeavePageProps {
  onOpenSmartLeave: () => void;
}

export const LeavePage: React.FC<LeavePageProps> = ({ onOpenSmartLeave }) => {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const canApprove = user?.role === 'admin' || user?.role === 'hr';

  const [activeTab, setActiveTab] = useState<'requests' | 'inbox' | 'apply'>('requests');
  const [balances, setBalances] = useState<any>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Apply form
  const [leaveType, setLeaveType] = useState<'casual' | 'sick' | 'annual' | 'unpaid'>('casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  // Review modal
  const [reviewModalLeave, setReviewModalLeave] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        api.getLeaveBalances(),
        api.getLeaveRequests(),
      ]);
      setBalances(balRes);
      setRequests(reqRes);
    } catch (err) {
      console.error('Failed to load leave records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await api.applyLeave({ leaveType, startDate, endDate, reason });
      setFeedback({ type: 'success', message: res.message });
      setReason('');
      setStartDate('');
      setEndDate('');
      setActiveTab('requests');
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply for leave' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelLeave = async (id: string) => {
    if (!confirm('Cancel this pending leave application?')) return;
    try {
      await api.cancelLeave(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel leave');
    }
  };

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewModalLeave) return;
    try {
      await api.reviewLeave(reviewModalLeave.id, { action, reviewComment });
      setReviewModalLeave(null);
      setReviewComment('');
      setFeedback({ type: 'success', message: `Leave application ${action}d successfully.` });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    }
  };

  if (loading && !balances) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Leave Balances...</span>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Leave Management & Approvals</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Automated quota deduction, holiday/weekend exclusion, and smart leave parsing
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenSmartLeave}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Leave (Natural Language)</span>
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

      {/* Quotas & Balances Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <span className="text-xs font-medium text-neutral-400 block">Annual Leave</span>
          <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {balances?.annual?.remaining ?? 14}
          </span>
          <span className="text-[11px] text-neutral-400 block mt-1">
            Quota: {balances?.annual?.total ?? 14} ({balances?.annual?.used ?? 0} used)
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <span className="text-xs font-medium text-neutral-400 block">Sick Leave</span>
          <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {balances?.sick?.remaining ?? 8}
          </span>
          <span className="text-[11px] text-neutral-400 block mt-1">
            Quota: {balances?.sick?.total ?? 8} ({balances?.sick?.used ?? 0} used)
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <span className="text-xs font-medium text-neutral-400 block">Casual Leave</span>
          <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {balances?.casual?.remaining ?? 10}
          </span>
          <span className="text-[11px] text-neutral-400 block mt-1">
            Quota: {balances?.casual?.total ?? 10} ({balances?.casual?.used ?? 0} used)
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <span className="text-xs font-medium text-neutral-400 block">Unpaid Leave</span>
          <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white">
            Unlimited
          </span>
          <span className="text-[11px] text-neutral-400 block mt-1">
            {balances?.unpaid?.used ?? 0} days taken
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-indigo-600 text-white'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          {isEmployee ? 'My Leave Applications' : 'All Leave Requests'} ({requests.length})
        </button>

        {canApprove && (
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'inbox'
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <span>HR Approval Inbox</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('apply')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'apply'
              ? 'bg-indigo-600 text-white'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Standard Apply Form
        </button>
      </div>

      {/* Tab: Standard Apply Form */}
      {activeTab === 'apply' && (
        <div className="max-w-xl mx-auto p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
            Submit Leave Request
          </h3>
          <p className="text-xs text-neutral-400">
            Working days are calculated automatically skipping Saturday, Sunday, and public holidays.
          </p>

          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                Leave Category
              </label>
              <select
                value={leaveType}
                onChange={(e: any) => setLeaveType(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
              >
                <option value="casual">Casual Leave (Remaining: {balances?.casual?.remaining})</option>
                <option value="sick">Sick Leave (Remaining: {balances?.sick?.remaining})</option>
                <option value="annual">Annual Leave (Remaining: {balances?.annual?.remaining})</option>
                <option value="unpaid">Unpaid Leave (Unlimited, salary deducted)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                Reason / Remarks
              </label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Brief reason for your absence"
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              {actionLoading ? 'Verifying & Submitting...' : 'Submit Application'}
            </button>
          </form>
        </div>
      )}

      {/* Tab: Requests Table */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                {!isEmployee && <th className="px-4 py-3 font-medium">Employee</th>}
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Date Range</th>
                <th className="px-4 py-3 font-medium">Working Days</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-neutral-400">
                    No leave applications recorded.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    {!isEmployee && (
                      <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                        {r.employeeName}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium capitalize text-neutral-800 dark:text-neutral-200">
                      {r.leaveType}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-600 dark:text-neutral-300">
                      {r.startDate} → {r.endDate}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500 tabular-nums">
                      {r.workingDays} day{r.workingDays > 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300 max-w-xs truncate">
                      {r.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                          r.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : r.status === 'rejected'
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : r.status === 'cancelled'
                            ? 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'pending' && isEmployee ? (
                        <button
                          onClick={() => handleCancelLeave(r.id)}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      ) : canApprove && r.status === 'pending' ? (
                        <button
                          onClick={() => setReviewModalLeave(r)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg cursor-pointer"
                        >
                          Review
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

      {/* Tab: HR Approval Inbox */}
      {activeTab === 'inbox' && (
        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl">
              All leave applications have been reviewed. Inbox zero!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingRequests.map((r) => (
                <div
                  key={r.id}
                  className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                        {r.employeeName}
                      </h4>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {r.departmentName}
                      </span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 capitalize">
                      {r.leaveType} Leave
                    </span>
                  </div>

                  <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1 font-mono">
                    <div>Dates: {r.startDate} to {r.endDate}</div>
                    <div>Working days: {r.workingDays} working day(s)</div>
                    <div className="text-neutral-700 dark:text-neutral-200 font-sans italic mt-1">
                      "{r.reason}"
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-2">
                    <button
                      onClick={() => setReviewModalLeave(r)}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer"
                    >
                      Decision Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Decision Review Modal */}
      {reviewModalLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Review Leave Application
            </h3>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl space-y-1 text-xs">
              <div><strong>Applicant:</strong> {reviewModalLeave.employeeName}</div>
              <div><strong>Category:</strong> {reviewModalLeave.leaveType} ({reviewModalLeave.workingDays} working days)</div>
              <div><strong>Dates:</strong> {reviewModalLeave.startDate} to {reviewModalLeave.endDate}</div>
              <div><strong>Reason:</strong> {reviewModalLeave.reason}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                HR Comment / Feedback (Sent in notification)
              </label>
              <input
                type="text"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="e.g. Approved. Please ensure handoff to team."
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalLeave(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReview('reject')}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Reject Leave
              </button>
              <button
                type="button"
                onClick={() => handleReview('approve')}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Approve Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
