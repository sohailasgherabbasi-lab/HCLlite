const TOKEN_KEY = 'hcm_lite_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      // not json
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // Auth
  getStatus: () => apiRequest<{ isInitialized: boolean; companyName: string; adminCount: number; employeeCount: number }>('/auth/status'),
  firstRun: (data: any) => apiRequest<{ token: string; user: any; settings: any }>('/auth/first-run', { method: 'POST', body: JSON.stringify(data) }),
  login: (credentials: { email: string; password: string }) => apiRequest<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  changePassword: (data: { oldPassword?: string; newPassword: string }) => apiRequest<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => apiRequest<{ user: any; employeeProfile?: any; settings: any }>('/auth/me'),
  seedDemo: () => apiRequest<{ message: string; demoCredentials: any }>('/auth/seed-demo', { method: 'POST' }),
  resetDemo: () => apiRequest<{ message: string }>('/auth/reset-demo', { method: 'POST' }),

  // Org Setup
  getOrgSettings: () => apiRequest<{ settings: any; departments: any[]; designations: any[]; holidays: any[] }>('/org/settings'),
  updateOrgSettings: (updates: any) => apiRequest<{ settings: any }>('/org/settings', { method: 'PUT', body: JSON.stringify(updates) }),
  createDepartment: (dept: { name: string; code: string; description?: string }) => apiRequest<any>('/org/departments', { method: 'POST', body: JSON.stringify(dept) }),
  deleteDepartment: (id: string) => apiRequest<{ message: string }>(`/org/departments/${id}`, { method: 'DELETE' }),
  createDesignation: (desig: { name: string; departmentId: string }) => apiRequest<any>('/org/designations', { method: 'POST', body: JSON.stringify(desig) }),
  createHoliday: (holiday: { name: string; date: string; description?: string }) => apiRequest<any>('/org/holidays', { method: 'POST', body: JSON.stringify(holiday) }),
  deleteHoliday: (id: string) => apiRequest<{ message: string }>(`/org/holidays/${id}`, { method: 'DELETE' }),

  // Users
  getUsers: () => apiRequest<any[]>('/users'),
  createHR: (hr: { name: string; email: string; password: string }) => apiRequest<any>('/users/hr', { method: 'POST', body: JSON.stringify(hr) }),
  updateUserStatus: (id: string, updates: { isActive?: boolean; resetPassword?: string }) => apiRequest<any>(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify(updates) }),

  // Employees
  getEmployees: (params?: { department?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiRequest<{ items: any[]; total: number; page: number; totalPages: number }>(`/employees?${q.toString()}`);
  },
  getEmployee360: (id: string) => apiRequest<any>(`/employees/${id}`),
  createEmployee: (emp: any) => apiRequest<{ employee: any; tempPassword: string }>('/employees', { method: 'POST', body: JSON.stringify(emp) }),
  updateEmployee: (id: string, updates: any) => apiRequest<{ message: string; employee: any }>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  csvDryRun: (csvText: string) => apiRequest<any>('/employees/csv-dryrun', { method: 'POST', body: JSON.stringify({ csvText }) }),
  csvImport: (rows: any[]) => apiRequest<any>('/employees/csv-import', { method: 'POST', body: JSON.stringify({ rows }) }),

  // Attendance
  getTodayAttendance: (date?: string) => apiRequest<{ date: string; summary: any; roster: any[] }>(`/attendance/today${date ? `?date=${date}` : ''}`),
  getMonthlyCalendar: (params?: { employeeId?: string; month?: number; year?: number }) => {
    const q = new URLSearchParams();
    if (params?.employeeId) q.set('employeeId', params.employeeId);
    if (params?.month) q.set('month', String(params.month));
    if (params?.year) q.set('year', String(params.year));
    return apiRequest<any>(`/attendance/calendar?${q.toString()}`);
  },
  checkIn: (data: { isCamera?: boolean; lat?: number; lng?: number; accuracy?: number; faceDetected?: boolean; employeeId?: string }) =>
    apiRequest<{ message: string; record: any }>('/attendance/check-in', { method: 'POST', body: JSON.stringify(data) }),
  checkOut: (employeeId?: string) => apiRequest<{ message: string; record: any }>('/attendance/check-out', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  getCorrections: () => apiRequest<any[]>('/attendance/corrections'),
  requestCorrection: (data: { date: string; requestedCheckIn: string; requestedCheckOut: string; reason: string }) =>
    apiRequest<any>('/attendance/corrections', { method: 'POST', body: JSON.stringify(data) }),
  reviewCorrection: (id: string, data: { action: 'approve' | 'reject'; reviewComment?: string }) =>
    apiRequest<any>(`/attendance/corrections/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),

  // Leave
  getLeaveBalances: (employeeId?: string) => apiRequest<any>(`/leave/balances${employeeId ? `?employeeId=${employeeId}` : ''}`),
  getLeaveRequests: () => apiRequest<any[]>('/leave/requests'),
  applyLeave: (data: { leaveType: string; startDate: string; endDate: string; reason: string }) =>
    apiRequest<any>('/leave/apply', { method: 'POST', body: JSON.stringify(data) }),
  cancelLeave: (id: string) => apiRequest<any>(`/leave/${id}/cancel`, { method: 'POST' }),
  reviewLeave: (id: string, data: { action: 'approve' | 'reject'; reviewComment?: string }) =>
    apiRequest<any>(`/leave/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),

  // Payroll
  getPayrollRuns: () => apiRequest<any[]>('/payroll/runs'),
  getPayrollRunDetails: (id: string) => apiRequest<any>(`/payroll/runs/${id}`),
  createPayrollDraft: (data: { month: number; year: number }) => apiRequest<any>('/payroll/draft', { method: 'POST', body: JSON.stringify(data) }),
  finalizePayroll: (id: string) => apiRequest<any>(`/payroll/runs/${id}/finalize`, { method: 'POST' }),
  getPayslip: (id: string) => apiRequest<any>(`/payroll/payslips/${id}`),

  // Analytics
  getAdminAnalytics: (params?: { department?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    return apiRequest<any>(`/analytics/admin?${q.toString()}`);
  },
  getHRAnalytics: (params?: { department?: string }) => {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    return apiRequest<any>(`/analytics/hr?${q.toString()}`);
  },
  getEmployeeAnalytics: () => apiRequest<any>('/analytics/employee'),

  // AI Assistant
  aiChat: (message: string) => apiRequest<{ reply: string; toolCalls: string[]; isFallback: boolean; isAIGenerated: boolean }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  aiSummarize: (kpiData: Record<string, any>) => apiRequest<{ bullets: string[]; isAIGenerated: boolean }>('/ai/summarize', { method: 'POST', body: JSON.stringify({ kpiData }) }),
  aiSmartLeave: (prompt: string) => apiRequest<{ leaveType: any; startDate: string; endDate: string; reason: string; isAIGenerated: boolean }>('/ai/smart-leave', { method: 'POST', body: JSON.stringify({ prompt }) }),
  getAILogs: () => apiRequest<any[]>('/ai/logs'),

  // Comms & Audit
  getAnnouncements: () => apiRequest<any[]>('/announcements'),
  createAnnouncement: (data: { title: string; content: string; priority?: string; category?: string }) => apiRequest<any>('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  deleteAnnouncement: (id: string) => apiRequest<any>(`/announcements/${id}`, { method: 'DELETE' }),
  getNotifications: () => apiRequest<any[]>('/notifications'),
  markNotificationRead: (id: string) => apiRequest<any>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiRequest<any>('/notifications/mark-all-read', { method: 'POST' }),
  getAuditLog: (params?: { action?: string; entity?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.action) q.set('action', params.action);
    if (params?.entity) q.set('entity', params.entity);
    if (params?.search) q.set('search', params.search);
    return apiRequest<any[]>(`/audit-log?${q.toString()}`);
  },
};
