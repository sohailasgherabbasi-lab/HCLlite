import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import {
  Users,
  CheckCircle2,
  Clock,
  CalendarRange,
  AlertCircle,
  Sparkles,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

export const HRDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analytics, org] = await Promise.all([
        api.getHRAnalytics({ department: departmentFilter || undefined }),
        api.getOrgSettings(),
      ]);
      setData(analytics);
      setDepartments(org.departments);
    } catch (err) {
      console.error('Failed to load HR dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [departmentFilter]);

  const handleSummarize = async () => {
    if (!data?.kpis) return;
    setSummarizing(true);
    try {
      const res = await api.aiSummarize({
        ...data.kpis,
        topLateComers: data.topLateComers,
        absenteeismByDept: data.absenteeismByDept,
      });
      setAiSummary(res.bullets);
    } catch (err: any) {
      alert(err.message || 'Failed to generate AI summary');
    } finally {
      setSummarizing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading People Operations Dashboard...</span>
      </div>
    );
  }

  const kpis = data?.kpis || {};

  return (
    <div className="space-y-6">
      {/* Top Banner & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            HR People Operations Dashboard
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Daily attendance status, pending approvals queue, and absenteeism tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs rounded-xl px-3 py-2 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleSummarize}
            disabled={summarizing}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            {summarizing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>AI Summarize</span>
          </button>
        </div>
      </div>

      {/* AI Summary Card */}
      {aiSummary.length > 0 && (
        <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>AI Operations Summary</span>
            </span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
              3–5 high-signal bullet insights
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-indigo-900 dark:text-indigo-200">
            {aiSummary.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5 Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Total Staff</span>
            <Users className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {kpis.totalHeadcount ?? 0}
          </div>
          <span className="text-[11px] text-neutral-400">Rate: {kpis.attendanceRate}</span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Present Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {kpis.present ?? 0}
          </div>
          <span className="text-[11px] text-neutral-400">{kpis.halfDay ?? 0} half-days</span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Late Today</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            {kpis.late ?? 0}
          </div>
          <span className="text-[11px] text-neutral-400">Past 09:15 grace</span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>On Leave Today</span>
            <CalendarRange className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
            {kpis.onLeave ?? 0}
          </div>
          <span className="text-[11px] text-neutral-400">Approved leaves</span>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Pending Approvals</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {kpis.pendingApprovals ?? 0}
          </div>
          <span className="text-[11px] text-neutral-400">Leaves & corrections</span>
        </div>
      </div>

      {/* Grid: 7-Day Trend & Top Late Comers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Trend Bar representation */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <span>7-Day Attendance Trend</span>
            </h3>
            <span className="text-[11px] text-neutral-400">Daily Volumes</span>
          </div>

          <div className="space-y-2">
            {data?.attendanceTrend?.map((t: any) => (
              <div key={t.date} className="flex items-center text-xs gap-3">
                <span className="w-20 text-neutral-400 font-mono text-[11px]">{t.date.slice(5)}</span>
                <div className="flex-1 h-5 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, (t.present / (kpis.totalHeadcount || 1)) * 100)}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Present: ${t.present}`}
                  />
                  <div
                    style={{ width: `${Math.min(100, (t.late / (kpis.totalHeadcount || 1)) * 100)}%` }}
                    className="bg-amber-500 h-full"
                    title={`Late: ${t.late}`}
                  />
                  <div
                    style={{ width: `${Math.min(100, (t.onLeave / (kpis.totalHeadcount || 1)) * 100)}%` }}
                    className="bg-indigo-500 h-full"
                    title={`On Leave: ${t.onLeave}`}
                  />
                </div>
                <span className="w-16 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                  {t.present + t.late} att
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> On-Time
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> On Leave
            </span>
          </div>
        </div>

        {/* Top 5 Late Comers */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Top 5 Late Arrivals This Month</span>
            </h3>
            <span className="text-[11px] text-neutral-400">3 Lates = 0.5 Day Penalty</span>
          </div>

          {data?.topLateComers?.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No late arrivals recorded this month. Excellent punctuality!
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data?.topLateComers?.map((c: any, idx: number) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {c.employeeName}
                    </span>
                    <span className="text-neutral-400 text-[11px] ml-2">
                      ({c.department})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded font-bold tabular-nums ${
                        c.count >= 3
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                      }`}
                    >
                      {c.count} time{c.count > 1 ? 's' : ''}
                    </span>
                    {c.count >= 3 && (
                      <span className="text-[10px] text-rose-500 font-semibold">
                        Penalty active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Absenteeism by Department & Leave Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Absenteeism Rate By Department
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data?.absenteeismByDept?.map((d: any, idx: number) => (
              <div key={idx} className="py-2 flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-900 dark:text-white">{d.departmentName}</span>
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span className="text-neutral-400">{d.absentCount} absent today</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{d.absenteeismRate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Leave Utilization This Year
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <span className="block text-[11px] text-neutral-400">Annual</span>
              <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {data?.leaveByType?.annual ?? 0}
              </span>
              <span className="text-[10px] text-neutral-400">days taken</span>
            </div>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <span className="block text-[11px] text-neutral-400">Sick</span>
              <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {data?.leaveByType?.sick ?? 0}
              </span>
              <span className="text-[10px] text-neutral-400">days taken</span>
            </div>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <span className="block text-[11px] text-neutral-400">Casual</span>
              <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {data?.leaveByType?.casual ?? 0}
              </span>
              <span className="text-[10px] text-neutral-400">days taken</span>
            </div>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <span className="block text-[11px] text-neutral-400">Unpaid</span>
              <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                {data?.leaveByType?.unpaid ?? 0}
              </span>
              <span className="text-[10px] text-neutral-400">days taken</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
