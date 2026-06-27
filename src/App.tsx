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

import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import EmployeeReports from "./pages/employee/EmployeeReports";
import EmployeeProfilePage from "./pages/employee/EmployeeProfile";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEmployees from "./pages/admin/AdminEmployees";
import AdminPendingReports from "./pages/admin/AdminPendingReports";
import AdminLiveMap from "./pages/admin/AdminLiveMap";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminAuditLog from "./pages/admin/AdminAuditLog";

const queryClient = new QueryClient();

const employee = (el: React.ReactNode) => (
  <ProtectedRoute><AppLayout>{el}</AppLayout></ProtectedRoute>
);
const admin = (el: React.ReactNode) => (
  <ProtectedRoute requireAdmin><AppLayout>{el}</AppLayout></ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Employee */}
            <Route path="/" element={employee(<EmployeeDashboard />)} />
            <Route path="/reports" element={employee(<EmployeeReports />)} />
            <Route path="/profile" element={employee(<EmployeeProfilePage />)} />

            {/* Admin */}
            <Route path="/admin" element={admin(<AdminDashboard />)} />
            <Route path="/admin/employees" element={admin(<AdminEmployees />)} />
            <Route path="/admin/approvals" element={admin(<AdminPendingReports />)} />
            <Route path="/admin/map" element={admin(<AdminLiveMap />)} />
            <Route path="/admin/analytics" element={admin(<AdminAnalytics />)} />
            <Route path="/admin/audit" element={admin(<AdminAuditLog />)} />

            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
