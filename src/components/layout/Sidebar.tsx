import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Settings,
  Users,
  UserCheck,
  CalendarCheck,
  CalendarRange,
  DollarSign,
  ScrollText,
  Megaphone,
  UserPlus,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  pendingLeavesCount?: number;
  pendingCorrectionsCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingLeavesCount = 0,
  pendingCorrectionsCount = 0,
}) => {
  const { user } = useAuth();
  const role = user?.role || 'employee';

  const adminNav: NavItem[] = [
    { id: 'dashboard', label: 'Company Overview', icon: LayoutDashboard },
    { id: 'org', label: 'Organization Setup', icon: Settings },
    { id: 'users', label: 'HR & User Accounts', icon: UserPlus },
    { id: 'employees', label: 'Employees Directory', icon: Users },
    { id: 'attendance', label: 'Attendance Board', icon: CalendarCheck, badge: pendingCorrectionsCount },
    { id: 'leaves', label: 'Leave Management', icon: CalendarRange, badge: pendingLeavesCount },
    { id: 'payroll', label: 'Payroll Lite', icon: DollarSign },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
  ];

  const hrNav: NavItem[] = [
    { id: 'dashboard', label: 'HR Operations', icon: LayoutDashboard },
    { id: 'employees', label: 'Employees Directory', icon: Users },
    { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck, badge: pendingCorrectionsCount },
    { id: 'leaves', label: 'Leave Approvals', icon: CalendarRange, badge: pendingLeavesCount },
    { id: 'payroll', label: 'Monthly Payroll Draft', icon: DollarSign },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
  ];

  const employeeNav: NavItem[] = [
    { id: 'dashboard', label: 'My Self-Service', icon: LayoutDashboard },
    { id: 'attendance', label: 'Mark Attendance', icon: CalendarCheck },
    { id: 'leaves', label: 'Apply Leave & Balance', icon: CalendarRange },
    { id: 'payroll', label: 'My Payslips', icon: DollarSign },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
  ];

  const items = role === 'admin' ? adminNav : role === 'hr' ? hrNav : employeeNav;

  return (
    <aside className="w-64 shrink-0 bg-neutral-50 dark:bg-neutral-900/60 border-r border-neutral-200 dark:border-neutral-800 flex flex-col justify-between p-4 transition-colors">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500">
          {role === 'admin' ? 'Administration' : role === 'hr' ? 'People Operations' : 'Employee Self-Service'}
        </div>

        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Role Scope Notice */}
      <div className="p-3 bg-white dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs">
        <div className="font-semibold text-neutral-800 dark:text-neutral-200 text-[11px] flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
          <span>Active Scope: {role.toUpperCase()}</span>
        </div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
          {role === 'admin'
            ? 'Full company scope. Payroll locking & company policies enabled.'
            : role === 'hr'
            ? 'People operations scope. Employee registration, approvals & payroll draft.'
            : 'Self-service scope. Own records and requests strictly protected.'}
        </p>
      </div>
    </aside>
  );
};
