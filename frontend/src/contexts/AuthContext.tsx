import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { EmployeeProfile, Role } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DemoUser {
  email: string;
  displayName: string;
}

interface AuthCtx {
  user: DemoUser | null;
  profile: EmployeeProfile | null;
  role: Role | "client" | "finops" | "finance";
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetTimer: () => void;
  demoRole: "client" | "finops" | "finance";
  setDemoRole: (role: "client" | "finops" | "finance") => void;
  demoClientCode: string;
  setDemoClientCode: (code: string) => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

// ── Helper ────────────────────────────────────────────────────────────────────
function getDemoUser(): DemoUser | null {
  const email = localStorage.getItem("demo_user_email");
  const name = localStorage.getItem("demo_user_name");
  if (!email) return null;
  return { email, displayName: name || email };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [demoRole, setDemoRoleState] = useState<"client" | "finops" | "finance">(
    () => (localStorage.getItem("demo_role") as "client" | "finops" | "finance") || "finops"
  );
  const [demoClientCode, setDemoClientCodeState] = useState<string>(
    () => localStorage.getItem("demo_client") || "CL001"
  );

  const setDemoRole = (r: "client" | "finops" | "finance") => {
    localStorage.setItem("demo_role", r);
    setDemoRoleState(r);
  };

  const setDemoClientCode = (c: string) => {
    localStorage.setItem("demo_client", c);
    setDemoClientCodeState(c);
  };

  // Derive role from demoRole
  const role = demoRole;

  // On mount: check if there's a demo user in localStorage
  useEffect(() => {
    const demo = getDemoUser();
    if (demo) {
      setUser(demo);
      setProfile({
        employeeId: demo.email.split("@")[0].toUpperCase(),
        fullName: demo.displayName,
        email: demo.email,
        mobile: "",
        department: demoRole === "finops" ? "Operations" : demoRole === "finance" ? "Finance" : "Client Services",
        employeeType: "permanent",
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
    setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const demo = getDemoUser();
    if (demo) {
      setProfile({
        employeeId: demo.email.split("@")[0].toUpperCase(),
        fullName: demo.displayName,
        email: demo.email,
        mobile: "",
        department: "TIA Demo",
        employeeType: "permanent",
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
  }, []);

  const resetTimer = useCallback(() => {
    // No-op in demo mode
  }, []);

  const signIn = async (_email: string, _password: string) => {
    // Demo mode: not needed
  };

  const signOut = async () => {
    localStorage.removeItem("demo_user_email");
    localStorage.removeItem("demo_user_name");
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider
      value={{
        user,
        profile,
        role,
        loading,
        signIn,
        signOut,
        refreshProfile,
        resetTimer,
        demoRole,
        setDemoRole,
        demoClientCode,
        setDemoClientCode,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
};
