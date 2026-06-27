import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { firebaseAuth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User,
} from "firebase/auth";
import type { EmployeeProfile, Role } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuthCtx {
  user: User | null;
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

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  // Derive role from demoRole (this allows testing all 3 personas with a single Firebase account)
  const role = demoRole;

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      setProfile({
        employeeId: user.email?.split("@")[0].toUpperCase() || "DEMO123",
        fullName: user.displayName || user.email || "Demo User",
        email: user.email || "demo@tia.system",
        mobile: "",
        department: "TIA Demo",
        employeeType: "permanent",
        active: true,
        createdAt: new Date().toISOString(),
      });
    } else {
      setProfile(null);
    }
  }, [user]);

  useEffect(() => {
    if (user) refreshProfile();
    else setProfile(null);
  }, [user, refreshProfile]);

  const resetTimer = useCallback(() => {
    // Session timeout logic can be re-enabled here if required
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  };

  const signOut = async () => {
    await fbSignOut(firebaseAuth);
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
}
