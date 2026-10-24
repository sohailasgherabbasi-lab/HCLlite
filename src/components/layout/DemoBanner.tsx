import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Sparkles, RotateCcw, Database, ExternalLink, Check, Users } from 'lucide-react';
import { api } from '../../api/client.ts';

interface DemoBannerProps {
  onRefreshData?: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onRefreshData }) => {
  const { user, login, logout, refreshSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSeedDemo = async () => {
    if (!confirm('Load realistic demo data (company profile, 3 departments, 3 employees, attendance, leaves)?')) return;
    setLoading(true);
    try {
      const res = await api.seedDemo();
      setMsg('Demo data loaded successfully! Logged in as Admin.');
      // Auto login as admin
      const loginRes = await api.login({ email: 'admin@hcmlite.com', password: 'Admin123!' });
      login(loginRes.token, loginRes.user);
      onRefreshData?.();
    } catch (err: any) {
      alert(err.message || 'Failed to seed demo data');
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleResetFresh = async () => {
    if (!confirm('Reset entire system to empty fresh-install state? (All records will be cleared)')) return;
    setLoading(true);
    try {
      await api.resetDemo();
      logout();
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to reset');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSwitch = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await api.login({ email, password: pass });
      login(res.token, res.user);
      onRefreshData?.();
    } catch (err: any) {
      alert(err.message || 'Quick login failed. Make sure demo data is seeded or account exists.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900 text-neutral-200 text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white tracking-wide flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>Saylani Hackathon HCM Lite</span>
        </span>
        <span className="text-neutral-500 hidden sm:inline">|</span>
        <span className="text-neutral-400 hidden sm:inline">
          Starts clean with 0 dummy records per rules
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {msg && <span className="text-emerald-400 font-medium">{msg}</span>}

        {/* Quick Demo Switchers for Judges */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-800 p-0.5 rounded-md border border-neutral-700/60">
          <span className="px-2 text-[10px] text-neutral-400 font-medium">Quick Role:</span>
          <button
            onClick={() => handleQuickSwitch('admin@hcmlite.com', 'Admin123!')}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
              user?.role === 'admin' ? 'bg-rose-600 text-white font-semibold' : 'hover:bg-neutral-700 text-neutral-300'
            }`}
            title="Switch to Admin (admin@hcmlite.com)"
          >
            Admin
          </button>
          <button
            onClick={() => handleQuickSwitch('hr@hcmlite.com', 'Hr123!')}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
              user?.role === 'hr' ? 'bg-emerald-600 text-white font-semibold' : 'hover:bg-neutral-700 text-neutral-300'
            }`}
            title="Switch to HR Lead (hr@hcmlite.com)"
          >
            HR Lead
          </button>
          <button
            onClick={() => handleQuickSwitch('ali.raza@hcmlite.com', 'Emp123!')}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
              user?.role === 'employee' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-neutral-700 text-neutral-300'
            }`}
            title="Switch to Employee (ali.raza@hcmlite.com)"
          >
            Employee
          </button>
        </div>

        <button
          onClick={handleSeedDemo}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors cursor-pointer"
          title="Seed realistic company profile, employees, attendance, leaves for testing"
        >
          <Sparkles className="w-3 h-3" />
          <span>Seed Demo Data</span>
        </button>

        <button
          onClick={handleResetFresh}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 transition-colors cursor-pointer"
          title="Reset back to empty fresh install state (starts onboarding wizard)"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset to Fresh</span>
        </button>
      </div>
    </div>
  );
};
