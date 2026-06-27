import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";

import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Employee / Client portal
import EmployeeTimesheetPortal from "./pages/employee/EmployeeTimesheetPortal";
import EmployeeReports from "./pages/employee/EmployeeReports";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPendingReports from "./pages/admin/AdminPendingReports";
import AdminInvoices from "./pages/admin/AdminInvoices";
import AdminEmployees from "./pages/admin/AdminEmployees";
import AdminAuditLog from "./pages/admin/AdminAuditLog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const employee = (el: React.ReactNode) => (
  <ProtectedRoute>
    <AppLayout>{el}</AppLayout>
  </ProtectedRoute>
);

const admin = (el: React.ReactNode) => (
  <ProtectedRoute requireAdmin>
    <AppLayout>{el}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner richColors position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Employee / Client portal */}
            <Route path="/" element={employee(<EmployeeTimesheetPortal />)} />
            <Route path="/queries" element={employee(<EmployeeReports />)} />
            <Route path="/assistant" element={employee(<EmployeeDashboard />)} />

            {/* Admin routes */}
            <Route path="/admin" element={admin(<AdminDashboard />)} />
            <Route path="/admin/exceptions" element={admin(<AdminPendingReports />)} />
            <Route path="/admin/invoices" element={admin(<AdminInvoices />)} />
            <Route path="/admin/employees" element={admin(<AdminEmployees />)} />
            <Route path="/admin/audit" element={admin(<AdminAuditLog />)} />

            {/* Legacy redirects */}
            <Route path="/admin/timesheets" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/analytics" element={<Navigate to="/admin" replace />} />

            {/* Legacy redirects */}
            <Route path="/admin/approvals" element={<Navigate to="/admin/exceptions" replace />} />
            <Route path="/admin/map" element={<Navigate to="/admin" replace />} />
            <Route path="/reports" element={<Navigate to="/queries" replace />} />
            <Route path="/profile" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
