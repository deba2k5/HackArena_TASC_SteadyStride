import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, MapPin, Clock4, Lock } from "lucide-react";
import logoAsset from "@/assets/sinhas-logo.asset.json";
import { firebaseAuth } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { api } from "@/lib/api";
import { isAdminEmail } from "@/lib/config";

export default function Login() {
  const { signIn, user, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const nav = useNavigate();

  if (!loading && user) {
    return <Navigate to={role === "employee" ? "/" : "/admin"} replace />;
  }

  const friendlyError = (err: unknown) => {
    const msg = (err as { code?: string; message?: string })?.code || (err as Error)?.message || "Something went wrong";
    if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found"))
      return "Email or password is incorrect. If you don't have an account yet, switch to Create Account.";
    if (msg.includes("email-already-in-use")) return "That email is already registered — switch to Sign In.";
    if (msg.includes("weak-password")) return "Password must be at least 6 characters.";
    if (msg.includes("invalid-email")) return "Please enter a valid email address.";
    if (msg.includes("network")) return "Network problem. Check your connection and try again.";
    return msg;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        toast.success("Welcome back");
      } else {
        if (password.length < 6) throw new Error("weak-password");
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        if (fullName) await updateProfile(cred.user, { displayName: fullName });
        await api.upsertProfile({
          employeeId: email.trim().split("@")[0].toUpperCase(),
          fullName: fullName || email.trim().split("@")[0],
          email: email.trim(),
          mobile: "",
          department: "—",
          employeeType: "permanent",
          active: true,
          createdAt: new Date().toISOString(),
        });
        toast.success("Account created");
      }
      nav(isAdminEmail(email.trim()) ? "/admin" : "/", { replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Left Hero Panel */}
      <div className="relative hidden lg:flex w-1/2 flex-col justify-between overflow-hidden bg-[hsl(240_4%_4%)] p-12 xl:p-16">
        <div className="absolute inset-0 opacity-90 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-primary blur-[140px] opacity-50" />
          <div className="absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-[hsl(var(--primary-glow))] blur-[150px] opacity-25" />
          <div className="absolute inset-0 dot-grid" />
        </div>

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <img src={logoAsset.url} alt="Sinha's Group" className="h-11 w-11 rounded-xl bg-white p-1 object-contain shadow-elevated" />
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-white leading-tight">Sinha's Group</h2>
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.18em]">Workforce Operations</p>
          </div>
        </div>

        {/* Middle */}
        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary-glow))] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary-glow))]" />
            </span>
            <span className="text-[11px] font-medium text-white/80">Live workforce intelligence active</span>
          </div>
          <h1 className="font-display mb-6 text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight text-white">
            Employee Work Hours <span className="text-[hsl(var(--primary-glow))]">&</span> Activity Tracking
          </h1>
          <p className="text-base xl:text-lg leading-relaxed text-white/60 max-w-md">
            Clock in, manage breaks, and capture location data in real time. Admins get live oversight and a complete audit trail in one workspace.
          </p>
        </div>

        {/* Feature cards */}
        <div className="relative z-10 grid grid-cols-3 gap-3">
          {[
            { i: Clock4, l: "Live hours", s: "Real-time sync" },
            { i: MapPin, l: "Geofence", s: "Boundary alerts" },
            { i: ShieldCheck, l: "Audit trail", s: "Immutable logs" },
          ].map(({ i: Icon, l, s }) => (
            <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:-translate-y-0.5">
              <Icon className="mb-3 h-4 w-4 text-[hsl(var(--primary-glow))]" />
              <p className="text-xs font-semibold text-white">{l}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10 lg:p-16 bg-gradient-surface">
        <div className="w-full max-w-[440px]">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={logoAsset.url} alt="Sinha's Group" className="h-11 w-11 rounded-xl bg-white p-1 object-contain ring-1 ring-border" />
            <div>
              <div className="font-display font-bold tracking-tight">Sinha's Group</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Workforce Operations</div>
            </div>
          </div>

          <div className="mb-9">
            <h2 className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-foreground">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-2 text-foreground/60">
              {mode === "signin"
                ? "Access your workforce dashboard and active shifts."
                : "Register a new employee or admin in seconds."}
            </p>
          </div>

          {/* Segmented switcher */}
          <div className="mb-7 flex rounded-xl bg-white p-1.5 shadow-card ring-1 ring-black/[0.04]">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "w-1/2 rounded-lg py-2.5 text-sm font-semibold transition-all " +
                  (mode === m
                    ? "bg-foreground text-background shadow-md"
                    : "text-foreground/55 hover:text-foreground")
                }
              >
                {m === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-foreground">Full name</Label>
                <Input
                  id="name"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-12 rounded-xl border-black/10 bg-white px-4 text-sm transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 placeholder:text-black/30"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">Work Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@sinhas.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl border-black/10 bg-white px-4 text-sm transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 placeholder:text-black/30"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">Password</Label>
                {mode === "signin" && (
                  <span className="text-xs font-semibold text-primary">Min. 6 characters</span>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl border-black/10 bg-white px-4 text-sm transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 placeholder:text-black/30"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-elevated transition-all hover:bg-primary/90 active:scale-[0.99]"
            >
              {busy ? (mode === "signin" ? "Signing in…" : "Creating…") : (mode === "signin" ? "Enter Dashboard" : "Create account")}
            </Button>
          </form>

          <div className="mt-10 border-t border-black/5 pt-6 space-y-3">
            <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
              <Lock className="h-3 w-3" /> Enterprise-grade protection
            </p>
            <p className="text-center text-[11px] text-foreground/40">
              © Sinha's Group {new Date().getFullYear()} · Secured by Firebase · MongoDB real-time sync
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
