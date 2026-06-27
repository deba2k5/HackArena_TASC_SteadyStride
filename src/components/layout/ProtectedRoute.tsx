import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && role === "employee") return <Navigate to="/" replace />;
  if (!requireAdmin && role !== "employee") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
