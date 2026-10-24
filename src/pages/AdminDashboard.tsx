import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import {
  Users,
  TrendingDown,
  DollarSign,
  Briefcase,
  Sparkles,
  RefreshCw,
  Building2,
  Calendar,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
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
        api.getAdminAnalytics({ department: departmentFilter || undefined }),
        api.getOrgSettings(),
      ]);
      setData(analytics);
      setDepartments(org.departments);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
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
        departmentBreakdown: data.headcountByDept,
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
        <span>Loading Executive Overview...</span>
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
            Company Executive Overview
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Real-time organizational headcount, attrition trends, and payroll obligation
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

      {/* AI Summary Card (if triggered) */}
      {aiSummary.length > 0 && (
        <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>AI Executive Insights</span>
            </span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
              Grounded in live database numbers
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

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs">
            <span>Total Active Headcount</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {kpis.totalHeadcount ?? 0}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Permanent + probation staff</p>
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs">
            <span>Attrition Rate (YTD)</span>
            <TrendingDown className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {kpis.attritionYTD ?? '0%'}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Exits ÷ average active headcount</p>
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs">
            <span>Monthly Payroll Cost</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {kpis.currency || 'PKR'} {Number(kpis.totalPayrollCost ?? 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Gross salary obligation / month</p>
        </div>

        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs">
            <span>Average Gross Salary</span>
            <Briefcase className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
            {kpis.currency || 'PKR'} {Number(kpis.averageSalary ?? 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Per active employee</p>
        </div>
      </div>

      {/* Grid: Department Distribution & Workforce Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Table */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Department Headcount & Cost Distribution
            </h3>
            <span className="text-[11px] text-neutral-400">
              {data?.headcountByDept?.length || 0} Departments
            </span>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data?.headcountByDept?.map((d: any) => (
              <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-neutral-900 dark:text-white">{d.name}</span>
                  <span className="text-neutral-400 ml-2 font-mono">[{d.code}]</span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                    {d.headcount} employee{d.headcount !== 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono tabular-nums min-w-[90px]">
                    {kpis.currency || 'PKR'} {Number(d.payrollCost).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tenure & Gender Demographics */}
        <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Workforce Demographics & Tenure
          </h3>

          <div className="space-y-3">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Tenure Spectrum:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <span className="block text-[11px] text-neutral-400">&lt; 6 Months</span>
                <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {data?.tenureBreakdown?.under6Months ?? 0}
                </span>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <span className="block text-[11px] text-neutral-400">6 - 12 Months</span>
                <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {data?.tenureBreakdown?.sixTo12Months ?? 0}
                </span>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <span className="block text-[11px] text-neutral-400">1 - 2 Years</span>
                <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {data?.tenureBreakdown?.oneToTwoYears ?? 0}
                </span>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <span className="block text-[11px] text-neutral-400">&gt; 2 Years</span>
                <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {data?.tenureBreakdown?.aboveTwoYears ?? 0}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
            <span>Gender Distribution:</span>
            <div className="flex items-center gap-4 text-neutral-800 dark:text-neutral-200 font-mono">
              <span>Male: {data?.genderBreakdown?.male ?? 0}</span>
              <span>Female: {data?.genderBreakdown?.female ?? 0}</span>
              <span>Other: {data?.genderBreakdown?.other ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Audit Feed */}
      <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            <span>Recent System Audit Stream</span>
          </h3>
          <span className="text-[11px] text-neutral-400">Immutable Ledger</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-2 font-medium">Timestamp</th>
                <th className="py-2 font-medium">Actor</th>
                <th className="py-2 font-medium">Action</th>
                <th className="py-2 font-medium">Entity</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data?.recentAudit?.map((log: any) => (
                <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-2 text-neutral-400 font-mono tabular-nums">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2 font-medium text-neutral-900 dark:text-white">
                    {log.actorName} <span className="text-[10px] text-neutral-400">({log.actorRole})</span>
                  </td>
                  <td className="py-2 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {log.action}
                  </td>
                  <td className="py-2 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                    {log.entity}
                  </td>
                  <td className="py-2 text-neutral-700 dark:text-neutral-300 max-w-xs truncate">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
