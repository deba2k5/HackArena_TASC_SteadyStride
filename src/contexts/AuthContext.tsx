import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { firebaseAuth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User,
} from "firebase/auth";
import { api } from "@/lib/api";
import { isAdminEmail } from "@/lib/config";
import type { EmployeeProfile, Role } from "@/lib/types";
import { toast } from "sonner";

interface AuthCtx {
  user: User | null;
  profile: EmployeeProfile | null;
  role: Role;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetTimer: () => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 5 * 60 * 1000; // 5 minutes before timeout

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | undefined>(undefined);
  const warningRef = useRef<number | undefined>(undefined);
  const expiryTimeRef = useRef<number>(0);

  const role: Role = isAdminEmail(user?.email) ? "super_admin" : "employee";

  const refreshProfile = useCallback(async () => {
    if (!user?.email) return setProfile(null);
    let p = await api.getProfile(user.email);
    if (!p) {
      // bootstrap a minimal profile so the user can edit details later
      p = await api.upsertProfile({
        employeeId: user.email.split("@")[0].toUpperCase(),
        fullName: user.displayName || user.email.split("@")[0],
        email: user.email,
        mobile: "",
        department: "—",
        employeeType: "permanent",
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
    setProfile(p);
  }, [user]);

  const updateTimeouts = useCallback(() => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(warningRef.current);

    const now = Date.now();
    const timeUntilTimeout = expiryTimeRef.current - now;
    const timeUntilWarning = timeUntilTimeout - WARNING_MS;

    console.log("[AuthContext] updateTimeouts called", {
      now,
      expiryTime: expiryTimeRef.current,
      timeUntilTimeoutMs: timeUntilTimeout,
      timeUntilTimeoutMinutes: timeUntilTimeout / 60000,
    });

    if (timeUntilWarning > 0) {
      warningRef.current = window.setTimeout(() => {
        toast.warning("Your session will expire in 5 minutes. Click Record to continue.");
      }, timeUntilWarning);
    } else if (timeUntilTimeout > 0) {
      // If warning time is already past, show warning immediately
      toast.warning("Your session will expire in 5 minutes. Click Record to continue.");
    }

    if (timeUntilTimeout > 0) {
      timerRef.current = window.setTimeout(() => {
        console.log("[AuthContext] Logging out due to timeout");
        fbSignOut(firebaseAuth);
        toast.error("Session expired due to inactivity. Please sign in again.");
      }, timeUntilTimeout);
    }
  }, []);

  const resetTimer = useCallback(() => {
    // Add 30 minutes to the current expiry time
    const now = Date.now();
    if (expiryTimeRef.current < now) {
      // If expiry time is in past, set to now + 30 mins
      expiryTimeRef.current = now + TIMEOUT_MS;
    } else {
      // If expiry time is in future, add 30 mins to it
      expiryTimeRef.current += TIMEOUT_MS;
    }
    updateTimeouts();
  }, [updateTimeouts]);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Initialize expiry time when user signs in
        expiryTimeRef.current = Date.now() + TIMEOUT_MS;
        updateTimeouts();
      }
    });
    return unsub;
  }, [updateTimeouts]);

  useEffect(() => {
    if (user) refreshProfile();
    else setProfile(null);
  }, [user, refreshProfile]);

  // Clean up timers when user logs out
  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(warningRef.current);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    await api.log({ actor: email, action: "auth.signin" });
  };

  const signOut = async () => {
    if (user?.email) await api.log({ actor: user.email, action: "auth.signout" });
    await fbSignOut(firebaseAuth);
  };

  return (
    <Ctx.Provider value={{ user, profile, role, loading, signIn, signOut, refreshProfile, resetTimer }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
};
