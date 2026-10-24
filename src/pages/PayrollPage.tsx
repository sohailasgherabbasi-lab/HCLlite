import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  DollarSign,
  Lock,
  FileText,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  X,
  Building2,
  Calendar,
  Briefcase,
  ShieldAlert,
} from 'lucide-react';
import { PayrollRun, PayrollItem } from '../types/index.ts';

export const PayrollPage: React.FC = () => {
  const { user, settings } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isEmployee = user?.role === 'employee';
  const canManage = user?.role === 'admin' || user?.role === 'hr';

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Draft Modal
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftMonth, setDraftMonth] = useState(new Date().getMonth() + 1);
  const [draftYear, setDraftYear] = useState(new Date().getFullYear());

  // Payslip Modal
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getPayrollRuns();
      setRuns(data);
      if (data.length > 0 && !selectedRun) {
        // If employee, first run contains myPayslip
        if (isEmployee) {
          setSelectedPayslip({ ...data[0].myPayslip, month: data[0].month, year: data[0].year, finalizedAt: data[0].finalizedAt });
        } else {
          const first = await api.getPayrollRunDetails(data[0].id);
          setSelectedRun(first);
        }
      }
    } catch (err) {
      console.error('Failed to load payroll runs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setFeedback(null);
    try {
      const res = await api.createPayrollDraft({ month: draftMonth, year: draftYear });
      setShowDraftModal(false);
      setSelectedRun(res.run);
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to create draft' });
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedRun || !isAdmin) return;
    if (!confirm(`Finalize and lock payroll for ${selectedRun.month}/${selectedRun.year}? Finalized runs cannot be edited and payslips will be released immediately.`)) return;

    setFinalizing(true);
    setFeedback(null);
    try {
      const res = await api.finalizePayroll(selectedRun.id);
      setSelectedRun(res.run);
      setFeedback({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to finalize payroll' });
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrintPayslip = () => {
    window.print();
  };

  if (loading && runs.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Payroll Records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Payroll Lite & Statutory Tax Engine</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isAdmin
              ? 'Review draft runs, compute attendance deductions & tax slabs, and lock monthly payroll'
              : canManage
              ? 'Prepare and review monthly payroll draft (Finalization locked to Admin)'
              : 'View and download your monthly salary slips'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowDraftModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Prepare Monthly Draft</span>
          </button>
        )}
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

      {/* Employee self-service view */}
      {isEmployee ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Released Payslips Archive
            </h3>
          </div>

          {runs.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl">
              No finalized payroll runs have been published yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-neutral-900 dark:text-white">
                      Payslip: {r.month}/{r.year}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Finalized
                    </span>
                  </div>

                  <div className="text-xs font-mono space-y-1 text-neutral-600 dark:text-neutral-300">
                    <div className="flex justify-between">
                      <span>Gross Salary:</span>
                      <span className="tabular-nums">PKR {Number(r.myPayslip?.grossSalary).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Deductions:</span>
                      <span className="text-rose-500 tabular-nums">
                        -PKR {Number(r.myPayslip?.totalDeductions).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly Tax:</span>
                      <span className="text-rose-500 tabular-nums">
                        -PKR {Number(r.myPayslip?.monthlyTax).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800 font-bold text-neutral-900 dark:text-white">
                      <span>Net Salary:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                        PKR {Number(r.myPayslip?.netSalary).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setSelectedPayslip({
                        ...r.myPayslip,
                        month: r.month,
                        year: r.year,
                        finalizedAt: r.finalizedAt,
                      })
                    }
                    className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View & Download Payslip</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Admin & HR View */
        <div className="space-y-6">
          {/* Runs selector bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {runs.map((r) => {
              const isSelected = selectedRun?.id === r.id;
              return (
                <button
                  key={r.id}
                  onClick={async () => {
                    const full = await api.getPayrollRunDetails(r.id);
                    setSelectedRun(full);
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900'
                      : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {r.month}/{r.year}
                    </span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                        r.status === 'finalized'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedRun && (
            <div className="space-y-6">
              {/* Summary KPIs for selected run */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-neutral-400 block">Total Gross Obligation</span>
                  <span className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                    PKR {Number(selectedRun.totalGross).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    {selectedRun.employeeCount} Employees
                  </span>
                </div>

                <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-neutral-400 block">Attendance Deductions</span>
                  <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                    -PKR {Number(selectedRun.totalDeductions).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    Absent, unpaid & late penalties
                  </span>
                </div>

                <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-neutral-400 block">Withholding Income Tax</span>
                  <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                    -PKR {Number(selectedRun.totalTax).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    Statutory annual slabs ÷ 12
                  </span>
                </div>

                <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-neutral-400 block">Total Net Disbursement</span>
                  <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    PKR {Number(selectedRun.totalNet).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    Direct bank payment total
                  </span>
                </div>
              </div>

              {/* Status bar & Admin finalize action */}
              <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Run Status:
                  </span>
                  <span
                    className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${
                      selectedRun.status === 'finalized'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {selectedRun.status}
                  </span>
                  {selectedRun.finalizedAt && (
                    <span className="text-neutral-400 font-mono text-[11px]">
                      (Locked by {selectedRun.finalizedBy} on {new Date(selectedRun.finalizedAt).toLocaleDateString()})
                    </span>
                  )}
                </div>

                {isAdmin && selectedRun.status === 'draft' && (
                  <button
                    onClick={handleFinalize}
                    disabled={finalizing}
                    className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {finalizing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>Finalize & Lock Payroll</span>
                  </button>
                )}
              </div>

              {/* Line Items Table */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Employee</th>
                      <th className="px-4 py-3 font-medium">Gross</th>
                      <th className="px-4 py-3 font-medium">Attended / Work Days</th>
                      <th className="px-4 py-3 font-medium">Deductions</th>
                      <th className="px-4 py-3 font-medium">Tax</th>
                      <th className="px-4 py-3 font-medium">Net Pay</th>
                      <th className="px-4 py-3 font-medium text-right">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {selectedRun.items?.map((item) => (
                      <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900 dark:text-white">
                            {item.employeeName}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-mono">
                            {item.employeeCode} · {item.departmentName}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-neutral-900 dark:text-white">
                          PKR {item.grossSalary.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                          {item.daysWorked} / {item.workingDaysInMonth} days
                          {item.latePenaltyDays > 0 && (
                            <span className="block text-[10px] text-rose-500">
                              Penalty: -{item.latePenaltyDays}d (3 lates)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-rose-600 dark:text-rose-400 font-medium">
                          -PKR {item.totalDeductions.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-rose-600 dark:text-rose-400 font-medium">
                          -PKR {item.monthlyTax.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                          PKR {item.netSalary.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() =>
                              setSelectedPayslip({
                                ...item,
                                month: selectedRun.month,
                                year: selectedRun.year,
                                isFinalized: selectedRun.status === 'finalized',
                                finalizedAt: selectedRun.finalizedAt,
                              })
                            }
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold text-xs rounded-lg cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prepare Draft Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Prepare Monthly Payroll Draft
            </h3>
            <p className="text-xs text-neutral-400">
              Computes working days, attendance deductions, late penalties, and Pakistan income tax slabs.
            </p>

            <form onSubmit={handleCreateDraft} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Month
                </label>
                <select
                  value={draftMonth}
                  onChange={(e) => setDraftMonth(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2026, i).toLocaleString('default', { month: 'long' })} ({i + 1})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {generating ? 'Calculating...' : 'Generate Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Payslip Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:w-full print:p-0 print:border-none">
            {/* Payslip Header */}
            <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
                    H
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                      {settings?.companyName || 'HCM Lite'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Official Confidential Salary Statement
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handlePrintPayslip}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Employee details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl text-xs font-mono">
              <div>
                <span className="text-neutral-400 block text-[10px]">Employee</span>
                <span className="font-bold text-neutral-900 dark:text-white font-sans">{selectedPayslip.employeeName}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Code</span>
                <span className="font-bold text-neutral-900 dark:text-white">{selectedPayslip.employeeCode}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Department</span>
                <span className="font-bold text-neutral-900 dark:text-white font-sans">{selectedPayslip.departmentName}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Period</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {selectedPayslip.month}/{selectedPayslip.year}
                </span>
              </div>
            </div>

            {/* Earnings & Deductions Tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Earnings */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Earnings Breakdown
                </h4>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Basic Salary:</span>
                    <span className="tabular-nums">PKR {Number(selectedPayslip.basicSalary).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">House Rent Allowance (40%):</span>
                    <span className="tabular-nums">PKR {Number(selectedPayslip.hra).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Medical Allowance (10%):</span>
                    <span className="tabular-nums">PKR {Number(selectedPayslip.medical).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-neutral-200 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                    <span className="font-sans">Gross Salary (1.5 × Basic):</span>
                    <span className="tabular-nums">PKR {Number(selectedPayslip.grossSalary).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Deductions Breakdown
                </h4>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Absent Days ({selectedPayslip.absentDays}d):</span>
                    <span className="text-rose-500 tabular-nums">
                      -PKR {Number(selectedPayslip.deductionAbsent).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Unpaid Leaves ({selectedPayslip.unpaidLeaveDays}d):</span>
                    <span className="text-rose-500 tabular-nums">
                      -PKR {Number(selectedPayslip.deductionUnpaidLeave).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Late Penalty ({selectedPayslip.latePenaltyDays}d):</span>
                    <span className="text-rose-500 tabular-nums">
                      -PKR {Number(selectedPayslip.deductionLatePenalty).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-neutral-600 dark:text-neutral-300">Income Tax (Monthly):</span>
                    <span className="text-rose-500 tabular-nums">
                      -PKR {Number(selectedPayslip.monthlyTax).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-neutral-200 dark:border-neutral-700 font-bold text-rose-600 dark:text-rose-400">
                    <span className="font-sans">Total Deductions:</span>
                    <span className="tabular-nums">
                      -PKR {Number(selectedPayslip.totalDeductions + selectedPayslip.monthlyTax).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Pay Callout */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                  Net Disbursable Salary (Take-Home)
                </span>
                <span className="text-[11px] text-neutral-500">
                  Calculated per official statutory income tax slabs & verified working days
                </span>
              </div>
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                PKR {Number(selectedPayslip.netSalary).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
