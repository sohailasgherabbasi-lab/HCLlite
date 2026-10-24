import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { FirstRunSetup } from './pages/FirstRunSetup.tsx';
import { Login } from './pages/Login.tsx';
import { DemoBanner } from './components/layout/DemoBanner.tsx';
import { Navbar } from './components/layout/Navbar.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { AdminDashboard } from './pages/AdminDashboard.tsx';
import { HRDashboard } from './pages/HRDashboard.tsx';
import { EmployeeDashboard } from './pages/EmployeeDashboard.tsx';
import { OrganizationSetup } from './pages/OrganizationSetup.tsx';
import { UserAccounts } from './pages/UserAccounts.tsx';
import { EmployeeDirectory } from './pages/EmployeeDirectory.tsx';
import { AttendancePage } from './pages/AttendancePage.tsx';
import { LeavePage } from './pages/LeavePage.tsx';
import { PayrollPage } from './pages/PayrollPage.tsx';
import { AuditLogPage } from './pages/AuditLogPage.tsx';
import { AnnouncementsPage } from './pages/AnnouncementsPage.tsx';
import { AIAssistantDrawer } from './components/ai/AIAssistantDrawer.tsx';
import { SmartLeaveModal } from './components/ai/SmartLeaveModal.tsx';
import { CameraAttendanceModal } from './components/attendance/CameraAttendanceModal.tsx';
import { ChangePasswordModal } from './components/common/ChangePasswordModal.tsx';
import { RefreshCw } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, isInitialized, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [showAI, setShowAI] = useState<boolean>(false);
  const [showSmartLeave, setShowSmartLeave] = useState<boolean>(false);
  const [showCameraAttendance, setShowCameraAttendance] = useState<boolean>(false);
  const [showPasswordChange, setShowPasswordChange] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-neutral-300">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-indigo-500" />
        <span className="text-sm font-medium">Starting HCM Lite...</span>
      </div>
    );
  }

  // 1. Fresh installation state
  if (!isInitialized) {
    return <FirstRunSetup />;
  }

  // 2. Authentication required
  if (!user) {
    return <Login />;
  }

  const role = user.role;

  // Active module title mapping
  const titles: Record<string, string> = {
    dashboard: role === 'admin' ? 'Company Overview' : role === 'hr' ? 'HR Operations' : 'Employee Self-Service',
    org: 'Organization Setup & Rules',
    users: 'HR & User Accounts',
    employees: 'Employee Directory & 360',
    attendance: 'Attendance Board & Camera Check-in',
    leaves: 'Leave Management & Approvals',
    payroll: 'Payroll Lite & Tax Engine',
    audit: 'Immutable Audit Log',
    announcements: 'Announcements Feed',
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors">
      {/* Top Demo Bar for Hackathon Evaluation */}
      <DemoBanner onRefreshData={() => setRefreshKey((k) => k + 1)} />

      {/* Top Navbar */}
      <Navbar
        onOpenAI={() => setShowAI(true)}
        onChangePassword={() => setShowPasswordChange(true)}
        activeModuleTitle={titles[currentTab] || 'Workspace'}
      />

      {/* Layout Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto" key={refreshKey}>
            {currentTab === 'dashboard' && (
              <>
                {role === 'admin' && <AdminDashboard />}
                {role === 'hr' && <HRDashboard />}
                {role === 'employee' && (
                  <EmployeeDashboard
                    onOpenSmartLeave={() => setShowSmartLeave(true)}
                    onOpenCameraAttendance={() => setShowCameraAttendance(true)}
                    onNavigateToLeaves={() => setCurrentTab('leaves')}
                    onNavigateToPayslips={() => setCurrentTab('payroll')}
                  />
                )}
              </>
            )}

            {currentTab === 'org' && <OrganizationSetup />}
            {currentTab === 'users' && <UserAccounts />}
            {currentTab === 'employees' && <EmployeeDirectory />}
            {currentTab === 'attendance' && (
              <AttendancePage onOpenCameraAttendance={() => setShowCameraAttendance(true)} />
            )}
            {currentTab === 'leaves' && (
              <LeavePage onOpenSmartLeave={() => setShowSmartLeave(true)} />
            )}
            {currentTab === 'payroll' && <PayrollPage />}
            {currentTab === 'audit' && <AuditLogPage />}
            {currentTab === 'announcements' && <AnnouncementsPage />}
          </div>
        </main>
      </div>

      {/* Slide-over & Modals */}
      <AIAssistantDrawer isOpen={showAI} onClose={() => setShowAI(false)} />

      <SmartLeaveModal
        isOpen={showSmartLeave}
        onClose={() => setShowSmartLeave(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <CameraAttendanceModal
        isOpen={showCameraAttendance}
        onClose={() => setShowCameraAttendance(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      {/* Password Change Modal (forced if mustChangePassword is true) */}
      <ChangePasswordModal
        isOpen={showPasswordChange || !!user.mustChangePassword}
        onClose={() => setShowPasswordChange(false)}
        isMandatory={!!user.mustChangePassword}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
