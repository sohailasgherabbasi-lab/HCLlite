import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  Settings,
  Building2,
  Calendar,
  Briefcase,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { Department, Designation, PublicHoliday } from '../types/index.ts';

export const OrganizationSetup: React.FC = () => {
  const { user, settings, setSettings } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'rules' | 'departments' | 'designations' | 'holidays'>('rules');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Editable settings
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [officeStart, setOfficeStart] = useState('09:00');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [halfDayHours, setHalfDayHours] = useState(5);
  const [officeLat, setOfficeLat] = useState(24.8607);
  const [officeLng, setOfficeLng] = useState(67.0011);
  const [officeRadiusMeters, setOfficeRadiusMeters] = useState(150);
  const [latePenaltyDeduction, setLatePenaltyDeduction] = useState(true);

  // Entities
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);

  // Modals / forms
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  const [showDesigModal, setShowDesigModal] = useState(false);
  const [newDesigName, setNewDesigName] = useState('');
  const [newDesigDeptId, setNewDesigDeptId] = useState('');

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getOrgSettings();
      setDepartments(data.departments);
      setDesignations(data.designations);
      setHolidays(data.holidays);

      if (data.settings) {
        setCompanyName(data.settings.companyName || '');
        setCurrency(data.settings.currency || 'PKR');
        setOfficeStart(data.settings.officeStart || '09:00');
        setGraceMinutes(data.settings.graceMinutes ?? 15);
        setHalfDayHours(data.settings.halfDayHours ?? 5);
        setOfficeLat(data.settings.officeLat ?? 24.8607);
        setOfficeLng(data.settings.officeLng ?? 67.0011);
        setOfficeRadiusMeters(data.settings.officeRadiusMeters ?? 150);
        setLatePenaltyDeduction(data.settings.latePenaltyDeduction ?? true);
      }
    } catch (err: any) {
      console.error('Failed to load org settings:', err);
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
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateOrgSettings({
        companyName,
        currency,
        officeStart,
        graceMinutes,
        halfDayHours,
        officeLat,
        officeLng,
        officeRadiusMeters,
        latePenaltyDeduction,
      });
      setSettings(res.settings);
      setFeedback({ type: 'success', message: 'Organization settings updated successfully.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName || !newDeptCode) return;
    try {
      await api.createDepartment({ name: newDeptName, code: newDeptCode, description: newDeptDesc });
      setShowDeptModal(false);
      setNewDeptName('');
      setNewDeptCode('');
      setNewDeptDesc('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create department');
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!confirm('Are you sure you want to remove this department?')) return;
    try {
      await api.deleteDepartment(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete department');
    }
  };

  const handleCreateDesig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesigName || !newDesigDeptId) return;
    try {
      await api.createDesignation({ name: newDesigName, departmentId: newDesigDeptId });
      setShowDesigModal(false);
      setNewDesigName('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create designation');
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) return;
    try {
      await api.createHoliday({ name: newHolidayName, date: newHolidayDate, description: newHolidayDesc });
      setShowHolidayModal(false);
      setNewHolidayName('');
      setNewHolidayDate('');
      setNewHolidayDesc('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add public holiday');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Remove this public holiday?')) return;
    try {
      await api.deleteHoliday(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete holiday');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-neutral-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Organization Setup...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Organization Setup & Operational Rules</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isAdmin
              ? 'Configure company parameters, office start rules, geofence, departments, and holidays'
              : 'View company policy rules and organizational structure (Read-Only for HR)'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Office & Rules
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'departments'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Departments ({departments.length})
          </button>
          <button
            onClick={() => setActiveTab('designations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'designations'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Designations ({designations.length})
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'holidays'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Holidays ({holidays.length})
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

      {/* Tab Content: Office Rules */}
      {activeTab === 'rules' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>Office Timings, Grace Period & Penalties</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Currency
                </label>
                <select
                  disabled={!isAdmin}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60"
                >
                  <option value="PKR">PKR (Pakistani Rupee)</option>
                  <option value="USD">USD (US Dollar)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Office Start Time
                </label>
                <input
                  type="time"
                  disabled={!isAdmin}
                  value={officeStart}
                  onChange={(e) => setOfficeStart(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  min={0}
                  max={60}
                  value={graceMinutes}
                  onChange={(e) => setGraceMinutes(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Half-Day Threshold (Hours)
                </label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  min={1}
                  max={8}
                  value={halfDayHours}
                  onChange={(e) => setHalfDayHours(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={latePenaltyDeduction}
                    onChange={(e) => setLatePenaltyDeduction(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>Late penalty rule (3 lates = 0.5 day deduction)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Geofence Settings */}
          <div className="p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-rose-500" />
              <span>Office Geofence (Camera Attendance Verification)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  disabled={!isAdmin}
                  value={officeLat}
                  onChange={(e) => setOfficeLat(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  disabled={!isAdmin}
                  value={officeLng}
                  onChange={(e) => setOfficeLng(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Permitted Radius (Meters)
                </label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={officeRadiusMeters}
                  onChange={(e) => setOfficeRadiusMeters(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white disabled:opacity-60 font-mono"
                />
              </div>
            </div>
            <p className="text-[11px] text-neutral-400">
              When an employee checks in using Camera Attendance, the server uses the Haversine formula to verify they are within {officeRadiusMeters} meters of the coordinates.
            </p>
          </div>

          {isAdmin && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Company Configuration</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* Tab Content: Departments */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {departments.length} registered department{departments.length !== 1 ? 's' : ''}
            </span>
            {isAdmin && (
              <button
                onClick={() => setShowDeptModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Department</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {departments.map((d) => (
              <div
                key={d.id}
                className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-neutral-900 dark:text-white">{d.name}</span>
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {d.code}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                    {d.description || 'General operational department.'}
                  </p>
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      onClick={() => handleDeleteDept(d.id)}
                      className="p-1 text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Delete Department"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Designations */}
      {activeTab === 'designations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {designations.length} job titles
            </span>
            {isAdmin && (
              <button
                onClick={() => setShowDesigModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Designation</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Designation Title</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {designations.map((des) => {
                  const dept = departments.find((d) => d.id === des.departmentId);
                  return (
                    <tr key={des.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                        {des.name}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                        {dept?.name || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3 text-neutral-400 font-mono text-[11px]">
                        {new Date(des.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Holidays */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {holidays.length} configured public holidays
            </span>
            {isAdmin && (
              <button
                onClick={() => setShowHolidayModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Holiday</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="p-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-xs text-neutral-900 dark:text-white block">
                    {h.name}
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">{h.date}</span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteHoliday(h.id)}
                    className="p-1 text-neutral-400 hover:text-rose-600 cursor-pointer"
                    title="Remove Holiday"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Create Department</h3>
            <form onSubmit={handleCreateDept} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Department Name
                </label>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="e.g. Quality Assurance"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Code
                </label>
                <input
                  type="text"
                  required
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  placeholder="e.g. QA"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Designation Modal */}
      {showDesigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Create Designation</h3>
            <form onSubmit={handleCreateDesig} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Designation Title
                </label>
                <input
                  type="text"
                  required
                  value={newDesigName}
                  onChange={(e) => setNewDesigName(e.target.value)}
                  placeholder="e.g. Lead QA Engineer"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Department
                </label>
                <select
                  required
                  value={newDesigDeptId}
                  onChange={(e) => setNewDesigDeptId(e.target.value)}
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
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDesigModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Add Public Holiday</h3>
            <form onSubmit={handleCreateHoliday} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  required
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="e.g. Eid-ul-Fitr"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-white font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 cursor-pointer"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
