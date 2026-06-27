import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles, Zap, ShieldCheck } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

export default function Login() {
  const { signIn, user, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const nav = useNavigate();

  if (!loading && user) {
    const isAdmin = role === "finops" || role === "finance";
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }

  const friendlyError = (err: unknown) => {
    const msg = (err as { code?: string; message?: string })?.code || (err as Error)?.message || "Something went wrong";
    if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found"))
      return "Email or password is incorrect. Switch to Create Account if you don't have one.";
    if (msg.includes("email-already-in-use")) return "Email already registered. Switch to Sign In.";
    if (msg.includes("weak-password")) return "Password must be at least 6 characters.";
    return msg;
  };

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Welcome to TIA!");
      const isAdmin = role === "finops" || role === "finance";
      nav(isAdmin ? "/admin" : "/", { replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      if (fullName) {
        await updateProfile(cred.user, { displayName: fullName });
      }
      toast.success("Account created successfully!");
      const isAdmin = role === "finops" || role === "finance";
      nav(isAdmin ? "/admin" : "/", { replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Brand Panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-primary to-primary/70 text-white">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <div className="relative flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-white text-xl">
            TIA
          </div>
          <div>
            <div className="font-bold text-lg">Touchless Invoice Agent</div>
            <div className="text-xs text-white/70">AI-Orchestrated Payroll Invoicing Pipeline</div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Live Firebase Auth
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            Automate Invoice<br />
            <span className="text-white/60">from Timesheet to Dispatch</span>
          </h1>
          <p className="text-white/80 text-base leading-relaxed">
            TIA uses AI extraction, smart employee matching, an ERP payroll simulator, 
            and a business rules engine to deliver touchless invoicing — end-to-end.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: Sparkles, label: "AI Extraction" },
              { icon: Zap, label: "Auto-Validation" },
              { icon: ShieldCheck, label: "Audit Trail" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-xl border border-white/15 bg-white/5 backdrop-blur p-3">
                <Icon className="h-4 w-4 mb-2 text-white/80" />
                <div className="text-xs font-medium">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Touchless Invoice Agent
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-lg">
              TIA
            </div>
            <div className="font-bold tracking-tight">Touchless Invoice Agent</div>
          </div>

          <Card className="p-8 shadow-sm border">
            <div className="space-y-1.5 mb-6">
              <h2 className="text-2xl font-bold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to access the TIA pipeline."
                  : "Register a new account to explore the TIA pipeline."}
              </p>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mb-5">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-5">
                <form onSubmit={onSignIn} className="space-y-4">
                  <FieldEmail value={email} onChange={setEmail} />
                  <FieldPassword value={password} onChange={setPassword} />
                  <Button type="submit" className="w-full h-11 bg-primary hover:opacity-90" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in to TIA"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-5">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" className="h-11" placeholder="Jane Doe"
                      value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <FieldEmail value={email} onChange={setEmail} />
                  <FieldPassword value={password} onChange={setPassword} hint="At least 6 characters." />
                  <Button type="submit" className="w-full h-11 bg-primary hover:opacity-90" disabled={busy}>
                    {busy ? "Creating…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            
            <div className="mt-4 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground text-center">
              Once logged in, you can switch between Client, FinOps, and Finance personas seamlessly from the top navigation bar.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FieldEmail({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" autoComplete="email" placeholder="you@company.com"
        className="h-11"
        value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}

function FieldPassword({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="password">Password</Label>
      <Input id="password" type="password" autoComplete="current-password"
        className="h-11"
        value={value} onChange={(e) => onChange(e.target.value)} required />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
