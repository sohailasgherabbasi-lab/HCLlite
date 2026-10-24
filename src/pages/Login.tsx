import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../api/client.ts';
import { Lock, Mail, ArrowRight, ShieldCheck, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, settings } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.login({ email, password });
      login(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col justify-center items-center p-4 sm:p-6 text-neutral-100 font-sans">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 mx-auto flex items-center justify-center font-bold text-white text-xl shadow-lg">
            H
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Sign In to HCM Lite
          </h1>
          <p className="text-xs text-neutral-400">
            {settings?.companyName || 'Human Capital Management System'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Work Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            <span>Sign In</span>
          </button>
        </form>

        {/* Quick Credentials Helpers for Hackathon Judges */}
        <div className="p-3.5 bg-neutral-900/60 rounded-xl border border-neutral-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span className="font-semibold text-neutral-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Demo Quick Fill:</span>
            </span>
            <span>(Click to populate)</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <button
              type="button"
              onClick={() => fillCredentials('admin@hcmlite.com', 'Admin123!')}
              className="py-1 px-1.5 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-rose-400 font-medium rounded border border-neutral-700/60 transition-colors cursor-pointer"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('hr@hcmlite.com', 'Hr123!')}
              className="py-1 px-1.5 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-medium rounded border border-neutral-700/60 transition-colors cursor-pointer"
            >
              HR Lead
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('ali.raza@hcmlite.com', 'Emp123!')}
              className="py-1 px-1.5 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-indigo-400 font-medium rounded border border-neutral-700/60 transition-colors cursor-pointer"
            >
              Employee
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
