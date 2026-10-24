# HCM Lite — Saylani Hackathon 2026

**AI-assisted Human Capital Management System for Admin, HR, and Employees**  
*24 October 2026 · Zaitoon Ashraf IT Park*

---

## 🚀 Live Demo & Quick Start

1. **Clean Installation Guarantee**: The system begins completely empty with **zero dummy or pre-loaded data** as required by Section 1 of the challenge brief.
2. **Fresh Onboarding Wizard**: On first visit, the setup wizard prompts for Company Name, Currency, Office Timings (09:00 with 15m grace), Half-Day threshold (5h), Weekend rules (Sat–Sun), Office Geofence Coordinates (for Camera Attendance), and the Super Admin account credentials.
3. **Judges Fast-Track Toolbar (Top Bar)**:
   - **⚡ Seed Demo Data**: 1-click button to load a realistic company with 3 departments, 3 employees, attendance logs, approved leaves, and an active announcement.
   - **🌱 Reset to Fresh**: 1-click button to clear all databases and restart the initial setup wizard.
   - **Quick Role Switcher**: Instant switch between **Admin**, **HR Lead**, and **Employee** roles.

---

## 👥 Built-in Demo Credentials (When Seeded)

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@hcmlite.com` | `Admin123!` | Full company scope, policy setup, finalize payroll, immutable audit log |
| **HR Lead** | `hr@hcmlite.com` | `Hr123!` | People operations, employee registrations, approvals, payroll draft |
| **Employee** | `ali.raza@hcmlite.com` | `Emp123!` | Self-service only, personal attendance, smart leave, own payslips |

---

## ⏱️ 5-Minute Live Judging Script

1. **Step 1 — Fresh Setup (Admin)**: Complete the 2-step setup wizard, establish office hours (09:00 + 15m grace), geofence coordinates (lat 24.8607, lng 67.0011, 150m radius), and create an HR account in `HR & User Accounts`.
2. **Step 2 — Register Employee (HR)**: Sign in as HR, register a new employee (Ali Raza) with basic salary PKR 160,000 (Gross = PKR 240,000). A temporary password is automatically generated.
3. **Step 3 — First Sign-in & Check-in (Employee)**: Sign in as the employee; the system prompts for a mandatory password change on first login. Once changed, punch in via Web or test Camera Attendance.
4. **Step 4 — Smart Leave Application (Employee)**: Type in plain words: *"Need next Monday and Tuesday off for my sister's wedding"*. AI parses dates and casual leave type into a pre-filled form. Confirm to apply.
5. **Step 5 — Approval & Payroll Run (HR & Admin)**:
   - HR logs in, approves the leave request with comments in the HR Approval Inbox.
   - HR generates the Monthly Payroll Draft for the active month (deducts attendance anomalies, late penalties, and computes statutory Pakistan income tax slabs).
   - Admin logs in, reviews the numbers, and locks the month by clicking **Finalize & Lock Payroll**.
6. **Step 6 — Colleague Salary Refusal (Employee)**:
   - Employee signs in, downloads the released payslip.
   - Employee opens **Ask AI** and asks: *"What is my colleague's salary?"*.
   - **Result**: The AI assistant politely refuses: *"I cannot share colleague compensation data due to strict privacy and role-based access restrictions."*
7. **Step 7 — Audit Feed (Admin)**: Admin views the immutable audit log displaying actor, action, entity, and JSON before/after state diffs.

---

## 📋 25 Core Functionalities Checklist

| # | Functionality | Admin | HR | Employee |
| :--- | :--- | :--- | :--- | :--- |
| **01** | First-run setup: company profile and Admin account | Manage | — | — |
| **02** | Login, logout, change password; role-based menus and dashboards | Own | Own | Own |
| **03** | Company settings: office hours, grace time, weekend, location + radius | Manage | View | — |
| **04** | Departments, designations, leave types & quotas, public holidays | Manage | View | — |
| **05** | Create HR logins; deactivate or reset any login | Manage | — | — |
| **06** | Register an employee (creates login) and edit details | View | Manage | Own phone & address |
| **07** | Employee directory with search and filters; Employee 360 profile | All | All | Own |
| **08** | CSV import with dry-run error report; CSV export | — | Manage | — |
| **09** | Check in and check out on the web | — | Own | Own |
| **10** | Attendance calendar and daily attendance board | All | All | Own |
| **11** | Attendance correction: request and approve | View | Approve | Request |
| **12** | Apply for or cancel leave; see balance and history | — | Own | Own |
| **13** | Approve or reject leave with a comment | View | Approve | — |
| **14** | Salary structure per employee (Basic, HRA 40%, Medical 10%, Gross 1.5x) | View | Manage | — |
| **15** | Monthly payroll: create and review the draft | View | Manage | — |
| **16** | Finalize payroll (locks the month) | Manage | — | — |
| **17** | Payslips with printable PDF download | All | All | Own |
| **18** | Dashboards, KPIs, trends and insight lists with filters | Company | HR | Personal |
| **19** | AI assistant chat answering from real data with tools | All data | HR data | Own data |
| **20** | AI dashboard summary (3-5 insight bullets) | Yes | Yes | — |
| **21** | Smart leave: type a sentence, get a pre-filled leave form | — | Own | Own |
| **22** | Policy Q&A on attendance, leave and payroll rules | Yes | Yes | Yes |
| **23** | Announcements: create and view notices | Post | Post | Read |
| **24** | In-app notifications (leave decisions, payslips) | Own | Own | Own |
| **25** | Audit log of create, update, approve and finalize actions | View | — | — |

---

## 🌟 Bonus Features Implemented (+10 Points)

1. **Camera Attendance with Face Detection + GPS Location**:
   - Web camera front preview with face centering frame.
   - Browser Geolocation coordinates with Haversine distance verification against the office perimeter (`distance <= radius`). Rejects if GPS accuracy > 100m or outside radius.
2. **Attrition Risk Score**: Computed per employee based on tenure, late frequency, and leave patterns.
3. **Absence Anomaly Flags**: Automated detection of Friday/Monday absence clusters.
4. **Late Penalty Rule**: 3 lates in a month results in a 0.5-day salary deduction in payroll.
5. **AI Understands Roman Urdu**:
   - *"Mera leave balance kitna hai?"*
   - *"Aj kon chutti par hai?"*
6. **Dark Mode / Light Mode**: Persistent theme toggle respecting contrast accessibility.

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js & Express (`server.ts`), JSON-backed persistent transactional store (`server/db.ts`), JWT authentication, `bcryptjs` password hashing.
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons, Motion.
- **AI Engine**: Gemini API (`@google/genai`) with server-side tool calling (`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`).
