import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import {
  Building2,
  Clock,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export const FirstRunSetup: React.FC = () => {
  const { login } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [companyName, setCompanyName] = useState('Zaitoon Ashraf IT Park');
  const [currency, setCurrency] = useState('PKR');
  const [officeStart, setOfficeStart] = useState('09:00');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [halfDayHours, setHalfDayHours] = useState(5);
  const [officeLat, setOfficeLat] = useState(24.8607);
  const [officeLng, setOfficeLng] = useState(67.0011);
  const [officeRadiusMeters, setOfficeRadiusMeters] = useState(150);

  const [adminName, setAdminName] = useState('Sohail Abbasi');
  const [adminEmail, setAdminEmail] = useState('admin@hcmlite.com');
  const [adminPassword, setAdminPassword] = useState('Admin123!');

  const handleQuickPrefill = () => {
    setCompanyName('Zaitoon Ashraf IT Park (Saylani)');
    setCurrency('PKR');
    setOfficeStart('09:00');
    setGraceMinutes(15);
    setHalfDayHours(5);
    setOfficeLat(24.8607);
    setOfficeLng(67.0011);
    setOfficeRadiusMeters(150);
    setAdminName('Sohail Abbasi');
    setAdminEmail('admin@hcmlite.com');
    setAdminPassword('Admin123!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !adminName || !adminEmail || !adminPassword) {
      setError('Please fill in all company and admin fields.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.firstRun({
        companyName,
        currency,
        officeStart,
        graceMinutes,
        halfDayHours,
        weekendDays: [0, 6], // Sunday & Saturday
        officeLat,
        officeLng,
        officeRadiusMeters,
        adminName,
        adminEmail,
        adminPassword,
      });

      login(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col justify-center items-center p-4 sm:p-6 text-neutral-100 font-sans">
      <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-md">
              H
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                HCM Lite Setup Wizard
              </h1>
              <p className="text-xs text-neutral-400">
                Fresh System Installation · Step {step} of 2
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickPrefill}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-indigo-400 rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="Auto-fill recommended settings"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pre-fill Defaults</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 1 ? (
            /* Step 1: Company Profile & Policies */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Company / Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Zaitoon Tech Park"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Currency Code
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="PKR">PKR (Pakistani Rupee)</option>
                    <option value="USD">USD (US Dollar)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Office Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={officeStart}
                    onChange={(e) => setOfficeStart(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Grace Period (Minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Half-Day Threshold (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={halfDayHours}
                    onChange={(e) => setHalfDayHours(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800 space-y-3">
                <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Office Geofence Coordinates (For Camera Attendance)</span>
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={officeLat}
                      onChange={(e) => setOfficeLat(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={officeLng}
                      onChange={(e) => setOfficeLng(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Radius (Meters)</label>
                    <input
                      type="number"
                      value={officeRadiusMeters}
                      onChange={(e) => setOfficeRadiusMeters(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <span>Continue to Super Admin Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Step 2: Super Admin Account */
            <div className="space-y-4">
              <div className="p-3 bg-indigo-950/40 border border-indigo-900/60 rounded-xl text-xs text-indigo-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <span>
                  The Super Admin has company-wide access to configure organization policies, create HR managers, view audit feeds, and lock monthly payroll.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Admin Full Name
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Sohail Abbasi"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Admin Email Address
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Admin Password
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Initialize & Launch System</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
