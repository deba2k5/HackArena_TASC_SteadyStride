import { useEffect, useMemo, useRef, useState } from "react";
import { api, fmtDuration } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { EmployeeProfile, WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, AlertTriangle, CheckSquare, Plane, Coffee, PowerOff, BellRing, PowerCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { toast } from "sonner";

const FORGOT_LOGOUT_HOURS = 10;

type LiveStatus = "working" | "travelling" | "break" | "offline";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [forcingId, setForcingId] = useState<string | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const reload = async () => {
    setProfiles(await api.listProfiles());
    setSessions(await api.listSessions());
  };

  const handleForceClockOut = async (s: WorkSession) => {
    if (!user?.email) return;
    if (!confirm(`Clock out ${s.fullName} for the day?`)) return;
    setForcingId(s.id);
    try {
      await api.forceClockOut(s.id, user.email, "Auto-closed by admin (forgot to log off)");
      toast.success(`${s.fullName} clocked out`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to clock out");
    } finally {
      setForcingId(null);
    }
  };

  useEffect(() => {
    reload();
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSessions = sessions.filter((s) => !s.clockOut);
  const pending = sessions.filter((s) => s.status === "pending" && s.clockOut);
  const geofenceAlerts = sessions.flatMap((s) =>
    s.locations.filter((l) => l.outsideGeofence).map(() => s.email)
  );

  const statusFor = (s: WorkSession): LiveStatus => {
    if (s.travels?.some((t) => !t.endedAt)) return "travelling";
    if (s.breaks.some((b) => !b.end)) return "break";
    return "working";
  };

  const liveByEmployee = useMemo(() => {
    const map = new Map<string, { profile: EmployeeProfile; status: LiveStatus; session?: WorkSession }>();
    profiles.forEach((p) => map.set(p.email, { profile: p, status: "offline" }));
    activeSessions.forEach((s) => {
      const p = profiles.find((x) => x.email === s.email);
      if (p) map.set(s.email, { profile: p, status: statusFor(s), session: s });
    });
    return Array.from(map.values());
  }, [profiles, activeSessions]);

  const counts = useMemo(() => {
    const c = { working: 0, travelling: 0, break: 0, offline: 0 };
    liveByEmployee.forEach((e) => { c[e.status]++; });
    return c;
  }, [liveByEmployee]);

  // Forgot-logout: sessions still open beyond threshold
  const forgotLogout = useMemo(
    () => activeSessions.filter(
      (s) => Date.now() - new Date(s.clockIn).getTime() > FORGOT_LOGOUT_HOURS * 3600 * 1000
    ),
    [activeSessions]
  );

  useEffect(() => {
    forgotLogout.forEach(async (s) => {
      if (notifiedRef.current.has(s.id)) return;
      notifiedRef.current.add(s.id);
      toast.warning(`${s.fullName} forgot to clock out`, {
        description: `Clocked in ${fmtDuration(Date.now() - new Date(s.clockIn).getTime())} ago`,
        duration: 8000,
      });
      await api.log({
        actor: "system",
        action: "alert.forgot_logout",
        target: s.id,
        meta: { email: s.email, since: s.clockIn },
      });
    });
  }, [forgotLogout]);

  const workTypeData = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => s.workType && map.set(s.workType, (map.get(s.workType) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name: name.split("_").join(" "), value }));
  }, [sessions]);

  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(prev => prev + 1), 10000);
    return () => clearInterval(t);
  }, []);

  // Function to calculate current work and break time for a session
  const calculateSessionStats = (s: WorkSession) => {
    const now = Date.now();
    let workMs = s.totalWorkMs || 0;
    let breakMs = s.totalBreakMs || 0;

    if (!s.clockOut) {
      // Calculate current work time (time since clock-in minus break time)
      workMs = now - new Date(s.clockIn).getTime();
      breakMs = s.breaks.reduce((sum, b) => {
        const bEnd = b.end ? new Date(b.end).getTime() : now;
        return sum + (bEnd - new Date(b.start).getTime());
      }, 0);
    }

    return { workMs: Math.max(0, workMs - breakMs), breakMs };
  };

  const hoursByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const stats = calculateSessionStats(s);
      const h = stats.workMs / 3600000;
      map.set(s.fullName, (map.get(s.fullName) || 0) + h);
    });
    return Array.from(map.entries()).slice(0, 8).map(([name, hours]) => ({ name, hours: +hours.toFixed(1) }));
  }, [sessions]);

  const colors = ["hsl(354 78% 49%)", "hsl(210 90% 50%)", "hsl(152 60% 38%)", "hsl(36 96% 50%)", "hsl(260 60% 55%)", "hsl(20 80% 55%)"];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Admin overview</h1>
        <p>Real-time workforce activity across Sinha's Group.</p>
      </div>

      {forgotLogout.length > 0 && (
        <Card className="p-5 border-warning/40 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent shadow-card">
          <div className="flex items-start gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-warning/15 text-warning grid place-items-center shrink-0">
              <BellRing className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {forgotLogout.length} employee{forgotLogout.length > 1 ? "s" : ""} forgot to clock out
              </div>
              <div className="text-xs text-muted-foreground">
                Sessions open longer than {FORGOT_LOGOUT_HOURS} hours. You can close them on their behalf.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {forgotLogout.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.fullName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.email} · open for {fmtDuration(Date.now() - new Date(s.clockIn).getTime())}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={forcingId === s.id}
                  onClick={() => handleForceClockOut(s)}
                  className="shrink-0"
                >
                  <PowerCircle className="h-4 w-4 mr-1.5" />
                  {forcingId === s.id ? "Closing…" : "Force clock-out"}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat icon={Users} label="Total employees" value={String(profiles.length)} />
        <Stat icon={Clock} label="Working now" value={String(counts.working)} tone="success" />
        <Stat icon={Plane} label="Travelling" value={String(counts.travelling)} tone="info" />
        <Stat icon={Coffee} label="On break" value={String(counts.break)} tone="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat icon={PowerOff} label="Offline" value={String(counts.offline)} />
        <Stat icon={CheckSquare} label="Pending reports" value={String(pending.length)} />
        <Stat icon={AlertTriangle} label="Geofence alerts" value={String(geofenceAlerts.length)} tone="destructive" />
        <Stat icon={BellRing} label="Forgot logout" value={String(forgotLogout.length)} tone="warning" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2 shadow-card">
          <h3 className="font-medium mb-4">Hours per employee (all time)</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={hoursByEmployee}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 shadow-card">
          <h3 className="font-medium mb-4">Work type distribution</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={workTypeData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80}>
                  {workTypeData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-medium">Live workforce status</h3>
          <Link to="/admin/map" className="text-sm text-primary hover:underline">View live map →</Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {liveByEmployee.length === 0 && (
            <p className="text-sm text-muted-foreground">No employees yet.</p>
          )}
          {liveByEmployee.map((e) => {
            const active = e.session?.travels?.find((t) => !t.endedAt);
            return (
              <div key={e.profile.email} className="flex items-center justify-between border rounded-lg p-3 bg-card">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{e.profile.fullName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{e.profile.email}</div>
                  {active && (
                    <div className="text-[11px] text-info mt-0.5 truncate">→ {active.destination}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <StatusPill status={e.status} />
                  {e.session && (
                    <span className="text-muted-foreground hidden sm:inline">
                      {fmtDuration(Date.now() - new Date(e.session.clockIn).getTime())}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { c: string; l: string }> = {
    working: { c: "bg-success text-success-foreground", l: "Working" },
    travelling: { c: "bg-info text-info-foreground", l: "Travelling" },
    break: { c: "bg-warning text-warning-foreground", l: "On break" },
    offline: { c: "bg-muted text-muted-foreground", l: "Offline" },
  };
  const { c, l } = map[status];
  return <Badge className={c}>{l}</Badge>;
}

function Stat({
  icon: Icon, label, value, tone,
}: {
  icon: React.ElementType; label: string; value: string;
  tone?: "success" | "info" | "warning" | "destructive";
}) {
  const toneMap: Record<string, string> = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };
  const cls = tone ? toneMap[tone] : "bg-primary/10 text-primary";
  return (
    <Card className="p-4 shadow-card hover-lift border-border/70">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md grid place-items-center ${cls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </div>
    </Card>
  );
}
