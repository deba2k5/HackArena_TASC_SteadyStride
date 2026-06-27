import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Zap, ShieldCheck, BarChart3, User } from "lucide-react";

const DEMO_PERSONAS = [
  {
    role: "finops" as const,
    label: "FinOps / Operations",
    description: "Exception Queue, HITL resolution, client query management",
    icon: ShieldCheck,
    color: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
    accent: "bg-amber-500",
  },
  {
    role: "finance" as const,
    label: "Finance / Analytics",
    description: "Invoice dashboards, dispatch controls, client rule configuration",
    icon: BarChart3,
    color: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
    accent: "bg-blue-500",
  },
  {
    role: "client" as const,
    label: "Client Portal",
    description: "Timesheet submission, invoice review, query submission",
    icon: User,
    color: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    accent: "bg-green-500",
  },
];

export default function Login() {
  const { user, role, loading, setDemoRole } = useAuth();
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  if (!loading && user) {
    const isAdmin = role === "finops" || role === "finance";
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }

  const handleDemoLogin = async (personaRole: "client" | "finops" | "finance") => {
    setBusy(true);
    try {
      setDemoRole(personaRole);
      // Set a demo user in localStorage so the auth context picks it up
      localStorage.setItem("demo_user_email", `demo-${personaRole}@tia.system`);
      localStorage.setItem("demo_user_name", personaRole === "client" ? "Client Billing Manager" : personaRole === "finops" ? "FinOps Specialist" : "Finance Analyst");
      // Force reload to re-initialize auth context with the new demo role
      window.location.href = personaRole === "client" ? "/" : "/admin";
    } catch (err) {
      toast.error("Demo login failed. Please refresh and try again.");
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
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Agentic Pipeline Active
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
          © 2026 Touchless Invoice Agent · Hackathon Demo
        </div>
      </div>

      {/* Login Panel */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-lg">
              TIA
            </div>
            <div className="font-bold">Touchless Invoice Agent</div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Select Demo Persona</h2>
            <p className="text-sm text-muted-foreground">
              Choose a role to explore the Touchless Invoicing pipeline. No credentials required.
            </p>
          </div>

          <div className="space-y-3">
            {DEMO_PERSONAS.map(({ role: personaRole, label, description, icon: Icon, color, accent }) => (
              <Card
                key={personaRole}
                className={`p-5 border cursor-pointer hover:shadow-md transition-all duration-200 hover:scale-[1.01] ${color}`}
                onClick={() => !busy && handleDemoLogin(personaRole)}
              >
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-lg ${accent} text-white flex items-center justify-center shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs opacity-75 mt-0.5">{description}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {busy ? "Loading..." : "Enter →"}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> How it works
            </div>
            <ul className="space-y-1 list-disc pl-4">
              <li>Clients submit timesheets (email text, Excel, handwriting, PDF)</li>
              <li>TIA AI extracts records, matches employees to the master database</li>
              <li>FinOps resolves ambiguities via the Human-in-the-Loop exception queue</li>
              <li>ERP simulator generates detailed payroll invoices with full audit trails</li>
              <li>Finance validates with rules engine, sorts by dispatch rules, and dispatches</li>
            </ul>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            TIA Hackathon Demo · Data seeded from TASC_Sample_Database_vF.xlsx
          </p>
        </div>
      </div>
    </div>
  );
}
