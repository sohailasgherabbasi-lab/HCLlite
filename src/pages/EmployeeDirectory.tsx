import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Filter,
  Eye,
  Edit2,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Building2,
  Briefcase,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  MapPin,
  TrendingDown,
  ScanFace,
  Key,
  Trash2,
  Lock,
  Copy,
  Check,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { Employee, Department, Designation } from '../types/index.ts';
import { FaceEnrollmentModal } from '../components/employee/FaceEnrollmentModal.tsx';

export const EmployeeDirectory: React.FC = () => {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const canManage = user?.role === 'admin' || user?.role === 'hr';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);

  // Biometric Face ID Enrollment Modal
  const [enrollingEmp, setEnrollingEmp] = useState<Employee | null>(null);

  // Reset Password Modal
  const [resetPassEmp, setResetPassEmp] = useState<Employee | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPass, setResettingPass] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ success: boolean; message: string; tempPass?: string } | null>(null);
  const [showPassPlain, setShowPassPlain] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  // Delete Employee Confirmation Modal
  const [deletingEmp, setDeletingEmp] = useState<Employee | null>(null);
  const [deletingEmployeeLoading, setDeletingEmployeeLoading] = useState(false);

  // Employee 360 Drawer
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [emp360, setEmp360] = useState<any>(null);
  const [loading360, setLoading360] = useState(false);

  // Register Employee Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newEmp, setNewEmp] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    gender: 'male' as const,
    departmentId: '',
    designationId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    basicSalary: 100000,
    status: 'active' as const,
    tempPassword: '',
  });
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPass: string } | null>(null);

  // Self-service edit contact modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');

  // CSV Import Modal
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, orgData] = await Promise.all([
        api.getEmployees({
          search: search || undefined,
          department: selectedDept || undefined,
          status: selectedStatus || undefined,
          page,
          limit: 25,
        }),
        api.getOrgSettings(),
      ]);

      setEmployees(empRes.items);
      setTotalEmployees(empRes.total);
      setDepartments(orgData.departments);
      setDesignations(orgData.designations);
    } catch (err) {
      console.error('Failed to load employee list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedDept, selectedStatus, page]);

  // Load 360 profile
  const open360 = async (id: string) => {
    setSelectedEmpId(id);
    setLoading360(true);
    try {
      const data = await api.getEmployee360(id);
      setEmp360(data);
      setContactPhone(data.phone || '');
      setContactAddress(data.address || '');
    } catch (err: any) {
      alert(err.message || 'Failed to load Employee 360 profile');
      setSelectedEmpId(null);
    } finally {
      setLoading360(false);
    }
  };

  const handleRegisterEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createEmployee(newEmp);
      setCreatedCredentials({ email: newEmp.email, tempPass: res.tempPassword });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to register employee');
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    try {
      await api.updateEmployee(selectedEmpId, { phone: contactPhone, address: contactAddress });
      setShowContactModal(false);
      await open360(selectedEmpId);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update contact info');
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 9; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'Emp#' + pass;
  };

  const openResetPasswordModal = (emp: Employee) => {
    setResetPassEmp(emp);
    setResetPasswordValue(generateRandomPassword());
    setResetFeedback(null);
    setShowPassPlain(true);
    setCopiedPass(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassEmp || !resetPasswordValue.trim()) return;
    setResettingPass(true);
    try {
      await api.resetEmployeePassword(resetPassEmp.id, resetPasswordValue.trim());
      setResetFeedback({
        success: true,
        message: `Password successfully updated for ${resetPassEmp.firstName} ${resetPassEmp.lastName}!`,
        tempPass: resetPasswordValue.trim(),
      });
    } catch (err: any) {
      setResetFeedback({
        success: false,
        message: err.message || 'Failed to reset employee password.',
      });
    } finally {
      setResettingPass(false);
    }
  };

  const openDeleteModal = (emp: Employee) => {
    setDeletingEmp(emp);
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmp) return;
    setDeletingEmployeeLoading(true);
    try {
      await api.deleteEmployee(deletingEmp.id);
      if (selectedEmpId === deletingEmp.id) {
        setSelectedEmpId(null);
        setEmp360(null);
      }
      setDeletingEmp(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete employee.');
    } finally {
      setDeletingEmployeeLoading(false);
    }
  };

  const handleCsvDryRun = async () => {
    if (!csvText.trim()) return;
    try {
      const res = await api.csvDryRun(csvText);
      setDryRunResult(res);
    } catch (err: any) {
      alert(err.message || 'CSV validation failed');
    }
  };

  const handleCommitCsv = async () => {
    if (!dryRunResult?.validRows?.length) return;
    setImporting(true);
    try {
      const res = await api.csvImport(dryRunResult.validRows);
      alert(res.message);
      setShowCsvModal(false);
      setCsvText('');
      setDryRunResult(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  const sampleCsvContent = `EmployeeCode,FirstName,LastName,Email,Phone,Department,Designation,JoiningDate,BasicSalary
EMP-010,Hamza,Sheikh,hamza.sheikh@hcmlite.com,+92 300 1112233,Engineering,Senior Software Engineer,2025-02-01,150000
EMP-011,Mariam,Nawaz,mariam.nawaz@hcmlite.com,+92 301 4445566,Human Resources,HR Operations Manager,2025-04-10,130000
EMP-012,Zain,Abideen,zain.abideen@hcmlite.com,+92 322 7778899,Sales & Marketing,Account Executive,2025-05-15,110000`;

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Employee Directory</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isEmployee
              ? 'View and manage your employee profile (Phone & Address self-service)'
              : 'Complete personnel directory, Employee 360 records, CSV import/export'}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5">
            <a
              href="/api/employees/export"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </a>

            <button
              onClick={() => {
                setCsvText(sampleCsvContent);
                setShowCsvModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>

            <button
              onClick={() => {
                setNewEmp({
                  firstName: '',
                  lastName: '',
                  email: '',
                  phone: '',
                  address: '',
                  gender: 'male',
                  departmentId: departments[0]?.id || '',
                  designationId: designations[0]?.id || '',
                  joiningDate: new Date().toISOString().split('T')[0],
                  basicSalary: 100000,
                  status: 'active',
                  tempPassword: 'Saylani' + Math.floor(1000 + Math.random() * 9000) + '!',
                });
                setCreatedCredentials(null);
                setShowRegisterModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Register Employee</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter / Search Bar */}
      {!isEmployee && (
        <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, employee code, or email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-neutral-800 dark:text-neutral-200"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-neutral-800 dark:text-neutral-200"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="on_leave">On Leave</option>
            <option value="exited">Exited</option>
          </select>

          <span className="text-xs text-neutral-400 ml-auto font-mono">
            {totalEmployees} Record{totalEmployees !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Face ID</th>
              {!isEmployee && <th className="px-4 py-3 font-medium">Gross Salary</th>}
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-neutral-400">
                  No employee records found.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {emp.facePhotoUrl ? (
                        <img
                          src={emp.facePhotoUrl}
                          alt={emp.firstName}
                          className="w-7 h-7 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {emp.firstName?.[0]}
                          {emp.lastName?.[0]}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-[11px] text-neutral-400">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-neutral-600 dark:text-neutral-300">
                    {emp.employeeCode}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                    {emp.departmentName || 'General'}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                    {emp.designationName || 'Staff'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                        emp.status === 'active'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900'
                          : emp.status === 'probation'
                          ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900'
                          : emp.status === 'on_leave'
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                      }`}
                    >
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {emp.faceEnrolled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                        <ScanFace className="w-3 h-3 text-emerald-500" />
                        <span>Enrolled</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-md">
                        <span>Not Enrolled</span>
                      </span>
                    )}
                  </td>
                  {!isEmployee && (
                    <td className="px-4 py-3 font-mono tabular-nums text-neutral-900 dark:text-white font-medium">
                      PKR {Number(emp.grossSalary || 0).toLocaleString()}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEnrollingEmp(emp)}
                        className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                        title="Enroll or Update Biometric Face Record"
                      >
                        <ScanFace className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Face ID</span>
                      </button>
                      <button
                        onClick={() => open360(emp.id)}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        360 Profile
                      </button>
                      {canManage && (
                        <>
                          <button
                            onClick={() => openResetPasswordModal(emp)}
                            className="p-1.5 bg-neutral-100 hover:bg-amber-50 dark:bg-neutral-800 dark:hover:bg-amber-950/40 text-neutral-600 hover:text-amber-600 dark:text-neutral-300 dark:hover:text-amber-400 rounded-lg transition-colors cursor-pointer"
                            title="Reset Employee Password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(emp)}
                            className="p-1.5 bg-neutral-100 hover:bg-rose-50 dark:bg-neutral-800 dark:hover:bg-rose-950/40 text-neutral-600 hover:text-rose-600 dark:text-neutral-300 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                            title="Delete Employee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Employee 360 Profile Slide-over Drawer */}
      {selectedEmpId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 h-full flex flex-col shadow-2xl overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between sticky top-0 bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {emp360?.firstName?.[0]}
                  {emp360?.lastName?.[0]}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    {emp360?.firstName} {emp360?.lastName}
                  </h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    {emp360?.employeeCode} · {emp360?.departmentName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {canManage && emp360 && (
                  <>
                    <button
                      onClick={() => openResetPasswordModal(emp360)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer transition-colors"
                      title="Reset Employee Password"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Reset Password</span>
                    </button>
                    <button
                      onClick={() => openDeleteModal(emp360)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-800 rounded-lg cursor-pointer transition-colors"
                      title="Delete Employee Record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowContactModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 rounded-lg cursor-pointer"
                  title="Update Phone & Address"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Contact</span>
                </button>
                <button
                  onClick={() => setSelectedEmpId(null)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {loading360 ? (
              <div className="p-8 text-center text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                <span>Loading 360 Profile...</span>
              </div>
            ) : emp360 ? (
              <div className="p-5 space-y-6">
                {/* Bonus indicators: Attrition Risk & Absence Anomaly */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Attrition Risk Score</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
                        {emp360.attritionRisk?.score || 15}/100
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          emp360.attritionRisk?.level === 'High'
                            ? 'bg-rose-100 text-rose-700'
                            : emp360.attritionRisk?.level === 'Medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {emp360.attritionRisk?.level} Risk
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Absence Anomaly</span>
                    <span
                      className={`text-xs font-semibold mt-1 block ${
                        emp360.anomaly?.hasAnomaly ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    >
                      {emp360.anomaly?.hasAnomaly ? 'Pattern Flagged' : 'Normal Regularity'}
                    </span>
                  </div>
                </div>

                {/* Personal & Contact Details */}
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-2 text-xs">
                  <span className="font-bold text-neutral-700 dark:text-neutral-300 block mb-2 uppercase text-[11px] tracking-wider">
                    Contact & Identification
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-300">
                    <div>
                      <span className="text-neutral-400 block text-[11px]">Email</span>
                      <span>{emp360.email}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[11px]">Phone</span>
                      <span>{emp360.phone || 'Not provided'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-400 block text-[11px]">Address</span>
                      <span>{emp360.address || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[11px]">Joining Date</span>
                      <span className="font-mono">{emp360.joiningDate}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[11px]">Gender</span>
                      <span className="capitalize">{emp360.gender}</span>
                    </div>
                  </div>
                </div>

                {/* Biometric Face Recognition Profile */}
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-700 dark:text-neutral-300 block uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                      <ScanFace className="w-4 h-4 text-indigo-500" />
                      <span>Biometric Face ID Profile</span>
                    </span>
                    {emp360.faceEnrolled ? (
                      <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Enrolled
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        Not Enrolled
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3.5">
                    {emp360.facePhotoUrl ? (
                      <img
                        src={emp360.facePhotoUrl}
                        alt={emp360.firstName}
                        className="w-16 h-16 rounded-xl object-cover border-2 border-indigo-500/50 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-neutral-200 dark:bg-neutral-700/70 text-neutral-400 flex flex-col items-center justify-center shrink-0">
                        <ScanFace className="w-6 h-6" />
                        <span className="text-[9px] mt-0.5 font-mono">No Face ID</span>
                      </div>
                    )}
                    <div className="space-y-1.5 flex-1">
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        {emp360.faceEnrolled
                          ? `Facial baseline profile is active. Enrolled ${emp360.faceEnrolledAt ? new Date(emp360.faceEnrolledAt).toLocaleDateString() : 'Active'}. Ready for camera attendance kiosk.`
                          : 'No biometric record registered. Employee cannot use the facial recognition kiosk until enrolled.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEnrollingEmp(emp360)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <ScanFace className="w-3.5 h-3.5" />
                        <span>{emp360.faceEnrolled ? 'Re-Enroll Face ID' : 'Enroll Face ID Now'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Salary Structure (Hidden if employee viewing someone else) */}
                {(canManage || user?.employeeId === emp360.id) && (
                  <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                    <span className="font-bold text-neutral-700 dark:text-neutral-300 block uppercase text-[11px] tracking-wider">
                      Compensation & Salary Structure (Gross = 1.5 × Basic)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="p-2.5 bg-white dark:bg-neutral-800 rounded-lg">
                        <span className="text-[10px] text-neutral-400 block">Basic Salary</span>
                        <span className="text-xs font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                          PKR {Number(emp360.basicSalary).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-neutral-800 rounded-lg">
                        <span className="text-[10px] text-neutral-400 block">HRA (40%)</span>
                        <span className="text-xs font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                          PKR {Number(emp360.hra).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-neutral-800 rounded-lg">
                        <span className="text-[10px] text-neutral-400 block">Medical (10%)</span>
                        <span className="text-xs font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                          PKR {Number(emp360.medical).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg">
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-semibold">Gross Salary</span>
                        <span className="text-xs font-bold font-mono text-indigo-700 dark:text-indigo-300 tabular-nums">
                          PKR {Number(emp360.grossSalary).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Attendance Records */}
                <div className="space-y-2">
                  <span className="font-bold text-neutral-700 dark:text-neutral-300 block uppercase text-[11px] tracking-wider">
                    Recent Attendance (Last 10 Logs)
                  </span>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
                    {emp360.recentAttendance?.slice(0, 10).map((a: any) => (
                      <div key={a.id} className="p-2.5 flex items-center justify-between">
                        <span className="font-mono text-neutral-500">{a.date}</span>
                        <span className="capitalize font-semibold text-neutral-900 dark:text-white">
                          {a.status}
                        </span>
                        <span className="font-mono text-neutral-400">
                          {a.workedHours} hrs ({a.source})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Register Employee Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Register New Employee
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdCredentials ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Employee Login Successfully Created!</span>
                </div>
                <div className="font-mono text-xs bg-white dark:bg-neutral-800 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-1">
                  <div><strong>Email:</strong> {createdCredentials.email}</div>
                  <div><strong>Temporary Password:</strong> {createdCredentials.tempPass}</div>
                </div>
                <p className="text-[11px] text-neutral-500">
                  The employee will be required to change their temporary password upon first sign-in.
                </p>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newEmp.firstName}
                      onChange={(e) => setNewEmp({ ...newEmp, firstName: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newEmp.lastName}
                      onChange={(e) => setNewEmp({ ...newEmp, lastName: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                    Work Email (Used for Login)
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    placeholder="e.g. employee@company.com"
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={newEmp.phone}
                      onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })}
                      placeholder="+92 300 0000000"
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Gender
                    </label>
                    <select
                      value={newEmp.gender}
                      onChange={(e: any) => setNewEmp({ ...newEmp, gender: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Department
                    </label>
                    <select
                      required
                      value={newEmp.departmentId}
                      onChange={(e) => setNewEmp({ ...newEmp, departmentId: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Designation
                    </label>
                    <select
                      required
                      value={newEmp.designationId}
                      onChange={(e) => setNewEmp({ ...newEmp, designationId: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="">Select Designation</option>
                      {designations.map((des) => (
                        <option key={des.id} value={des.id}>
                          {des.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Joining Date
                    </label>
                    <input
                      type="date"
                      required
                      value={newEmp.joiningDate}
                      onChange={(e) => setNewEmp({ ...newEmp, joiningDate: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                      Basic Salary (PKR)
                    </label>
                    <input
                      type="number"
                      required
                      min={1000}
                      value={newEmp.basicSalary}
                      onChange={(e) => setNewEmp({ ...newEmp, basicSalary: Number(e.target.value) })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs flex justify-between items-center font-mono">
                  <span>Gross Salary (1.5 × Basic):</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    PKR {(newEmp.basicSalary * 1.5).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                  >
                    Create & Generate Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CSV Import Modal with Dry Run */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-500" />
                <span>Bulk CSV Import with Dry-Run Report</span>
              </h3>
              <button
                onClick={() => setShowCsvModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                Paste CSV Data (comma separated):
              </label>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-[11px] font-mono text-neutral-900 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleCsvDryRun}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 cursor-pointer"
            >
              Run Dry-Run Verification
            </button>

            {dryRunResult && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-700 dark:text-neutral-300">Validation Report:</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-500">{dryRunResult.validRowCount} Valid</span>
                    <span className="text-rose-500">{dryRunResult.errorCount} Errors</span>
                  </div>
                </div>

                {dryRunResult.errors?.length > 0 && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl max-h-36 overflow-y-auto text-xs text-rose-600 dark:text-rose-400 space-y-1">
                    {dryRunResult.errors.map((err: any, idx: number) => (
                      <div key={idx}>
                        Row {err.row} ({err.field}): {err.reason}
                      </div>
                    ))}
                  </div>
                )}

                {dryRunResult.validRowCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCommitCsv}
                    disabled={importing}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl cursor-pointer"
                  >
                    {importing ? 'Importing...' : `Commit Import (${dryRunResult.validRowCount} Employees)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact info edit modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
              Update Contact Information
            </h3>
            <form onSubmit={handleUpdateContact} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Biometric Face ID Enrollment Modal */}
      {enrollingEmp && (
        <FaceEnrollmentModal
          isOpen={!!enrollingEmp}
          onClose={() => setEnrollingEmp(null)}
          employee={enrollingEmp}
          onSuccess={(updated) => {
            loadData();
            if (emp360 && emp360.id === updated.id) {
              setEmp360({ ...emp360, ...updated });
            }
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetPassEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Reset Employee Password
                  </h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {resetPassEmp.firstName} {resetPassEmp.lastName} ({resetPassEmp.employeeCode})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setResetPassEmp(null);
                  setResetFeedback(null);
                }}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetFeedback?.success ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Password Reset Successful!</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    The account for <strong>{resetPassEmp.email}</strong> now uses the new credentials below:
                  </p>
                  <div className="flex items-center justify-between bg-white dark:bg-neutral-800 border border-emerald-300 dark:border-emerald-800 rounded-lg p-2.5 font-mono text-xs text-neutral-900 dark:text-white">
                    <span className="font-bold tracking-wider">{resetFeedback.tempPass}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (resetFeedback.tempPass) {
                          navigator.clipboard.writeText(resetFeedback.tempPass);
                          setCopiedPass(true);
                          setTimeout(() => setCopiedPass(false), 2000);
                        }
                      }}
                      className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200 rounded text-[11px] font-sans flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPass ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 pt-1">
                    Please provide this new password to {resetPassEmp.firstName}. They will be prompted to change it upon first logging in.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setResetPassEmp(null);
                    setResetFeedback(null);
                  }}
                  className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {resetFeedback && !resetFeedback.success && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{resetFeedback.message}</span>
                  </div>
                )}

                {/* Employee Info Box */}
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Employee:</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {resetPassEmp.firstName} {resetPassEmp.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Login Email:</span>
                    <span className="font-mono text-neutral-900 dark:text-white">{resetPassEmp.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Department:</span>
                    <span className="text-neutral-700 dark:text-neutral-300">{resetPassEmp.departmentName || 'General'}</span>
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      New Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordValue(generateRandomPassword())}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Generate Random</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassPlain ? 'text' : 'password'}
                      required
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      placeholder="Enter new password (min 4 characters)..."
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl pl-3 pr-10 py-2.5 text-xs text-neutral-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassPlain((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                      title={showPassPlain ? 'Hide password' : 'Show password'}
                    >
                      {showPassPlain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    The employee will be required to change this password upon their subsequent login.
                  </p>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPassEmp(null);
                      setResetFeedback(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resettingPass || !resetPasswordValue.trim()}
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {resettingPass ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Save & Reset Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Employee Confirmation Modal */}
      {deletingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Delete Employee Record
                  </h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {deletingEmp.firstName} {deletingEmp.lastName} ({deletingEmp.employeeCode})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeletingEmp(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Message */}
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-2.5 text-xs text-rose-900 dark:text-rose-200">
              <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Permanent & Irreversible Deletion</span>
              </div>
              <p className="leading-relaxed">
                Are you sure you want to delete <strong>{deletingEmp.firstName} {deletingEmp.lastName}</strong>?
              </p>
              <div className="text-[11px] text-rose-800 dark:text-rose-300 space-y-1 bg-white/70 dark:bg-neutral-900/70 p-2.5 rounded-lg border border-rose-200/60 dark:border-rose-900/40">
                <p className="font-semibold">This action will cascade and delete:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>User account login & authentication credentials</li>
                  <li>Biometric Face ID profile template</li>
                  <li>All attendance logs and punch history</li>
                  <li>Leave records, approvals, and balances</li>
                  <li>Payroll compensation & payslip history</li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setDeletingEmp(null)}
                disabled={deletingEmployeeLoading}
                className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
                disabled={deletingEmployeeLoading}
                className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {deletingEmployeeLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Employee...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
