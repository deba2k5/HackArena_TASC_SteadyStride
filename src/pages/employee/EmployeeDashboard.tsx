import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, fmtDuration, haversine, reverseGeocode } from "@/lib/api";
import type { BreakEntry, WorkSession, WorkType, TravelLog } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import FileUploader, { UploadedFile } from "@/components/FileUploader";
import LiveMap from "@/components/LiveMap";
import { Clock, Coffee, MapPin, Play, Square, FileBarChart, Send, Plane, Navigation } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "on_site", label: "On-site" },
  { value: "remote", label: "Remote work" },
  { value: "work_from_home", label: "Work from home" },
  { value: "office_administration", label: "Office administration" },
  { value: "client_meeting", label: "Client meeting" },
  { value: "training", label: "Training" },
  { value: "maintenance", label: "Maintenance" },
  { value: "travel", label: "Travel (counts as work)" },
  { value: "other", label: "Other" },
];

const BREAK_TYPES: { value: BreakEntry["type"]; label: string }[] = [
  { value: "lunch", label: "Lunch break" },
  { value: "short", label: "Short break" },
  { value: "prayer", label: "Prayer break" },
  { value: "other", label: "Other" },
];

const GEOFENCE_RADIUS = 100; // meters

export default function EmployeeDashboard() {
  const { profile, user, resetTimer } = useAuth();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [tick, setTick] = useState(0);
  const [history, setHistory] = useState<WorkSession[]>([]);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [description, setDescription] = useState("");
  const [breakType, setBreakType] = useState<BreakEntry["type"]>("short");
  const [travelOpen, setTravelOpen] = useState(false);
  const [travelDestination, setTravelDestination] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const baseLocation = useRef<{ lat: number; lng: number } | null>(null);

  const runAction = async (action: string, fn: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(action);
    try {
      await fn();
    } catch (err) {
      toast.error((err as Error).message || "Action failed. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const all = await api.listSessions({ email: user.email! });
        const active = all.find((s) => !s.clockOut) || null;
        setSession(active);
        setHistory(all);
        if (active) {
          setAttachments(active.attachments);
          setDescription(active.description || "");
        }
      } catch (err) {
        toast.error((err as Error).message || "Could not load your sessions");
      }
    })();
  }, [user]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const onBreak = useMemo(() => session?.breaks.some((b) => !b.end), [session]);
  const activeTravel: TravelLog | undefined = useMemo(
    () => session?.travels?.find((t) => !t.endedAt),
    [session]
  );

  // Location polling — every 60s while travelling, otherwise every 30min.
  useEffect(() => {
    if (!session || session.clockOut) return;
    const pushPing = () => {
      if (onBreak) return;
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const locationName = await reverseGeocode(lat, lng);
          const ping = {
            lat,
            lng,
            accuracy: pos.coords.accuracy,
            at: new Date().toISOString(),
            locationName,
          };
          if (ping.accuracy > 200) return;
          if (!baseLocation.current) baseLocation.current = { lat: ping.lat, lng: ping.lng };
          const dist = haversine(baseLocation.current, ping);
          const outside = dist > GEOFENCE_RADIUS && !activeTravel;
          try {
            const updated = await api.pushLocation(session.id, { ...ping, outsideGeofence: outside });
            setSession(updated);
            if (outside) {
              await api.log({
                actor: user!.email!,
                action: "geofence.exit",
                target: session.id,
                meta: { distance: Math.round(dist), location: locationName },
              });
              toast.warning(`Outside 100m geofence (${Math.round(dist)}m) at ${locationName || "unknown location"}. Admin notified.`);
            }
          } catch (err) {
            toast.error((err as Error).message || "Could not update location");
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    };
    pushPing();
    const interval = activeTravel ? 60 * 1000 : 30 * 60 * 1000;
    const id = setInterval(pushPing, interval);
    return () => clearInterval(id);
  }, [session, onBreak, user, activeTravel]);

  const refreshHistory = async () => {
    if (!user?.email) return;
    setHistory(await api.listSessions({ email: user.email }));
  };

  const clockIn = async () => {
    await runAction("clockIn", async () => {
      if (!profile) throw new Error("Your profile is still loading. Try again in a moment.");
      const active = await api.getActiveSession(profile.email);
      if (active) {
        setSession(active);
        toast.info("You are already clocked in.");
        return;
      }
      const s = await api.clockIn(profile);
      setSession(s);
      setAttachments([]);
      setDescription("");
      baseLocation.current = null;
      await api.log({ actor: profile.email, action: "session.clock_in", target: s.id });
      toast.success("Clocked in");
      await refreshHistory();
    });
  };

  const clockOut = async () => {
    await runAction("clockOut", async () => {
      if (!session) return;
      if (activeTravel) throw new Error("End your travel before clocking out");
      const s = await api.clockOut(session.id);
      setSession(s);
      await api.log({ actor: user!.email!, action: "session.clock_out", target: s.id });
      toast.success("Clocked out");
      await refreshHistory();
    });
  };

  const startBreak = async () => {
    await runAction("startBreak", async () => {
      if (!session) return;
      const s = await api.addBreak(session.id, breakType);
      setSession(s);
      toast(`${breakType} break started`);
    });
  };

  const endBreak = async () => {
    await runAction("endBreak", async () => {
      if (!session) return;
      const open = session.breaks.find((b) => !b.end);
      if (!open) return;
      const s = await api.endBreak(session.id, open.id);
      setSession(s);
      toast("Break ended");
    });
  };

  const setWorkType = async (wt: WorkType) => {
    await runAction("workType", async () => {
      if (!session) return;
      if (wt === "travel") {
        setTravelOpen(true);
        return;
      }
      const s = await api.setWorkType(session.id, wt);
      setSession(s);
      toast(`Work type: ${wt.split("_").join(" ")}`);
    });
  };

  const beginTravel = async () => {
    if (!session) return;
    if (!travelDestination.trim()) return toast.error("Enter destination");
    const dest = travelDestination.trim();
    const proceed = async (lat?: number, lng?: number) => {
      const s = await api.startTravel(session.id, dest, lat, lng);
      setSession(s);
      await api.log({
        actor: user!.email!,
        action: "travel.start",
        target: session.id,
        meta: { destination: dest },
      });
      toast.success(`Travel started → ${dest}`);
      setTravelOpen(false);
      setTravelDestination("");
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => proceed(p.coords.latitude, p.coords.longitude),
        () => proceed(),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else proceed();
  };

  const endTravel = async () => {
    if (!session || !activeTravel) return;
    const finish = async (lat?: number, lng?: number) => {
      let dist: number | undefined;
      if (lat && lng && activeTravel.startLat && activeTravel.startLng) {
        dist = haversine(
          { lat: activeTravel.startLat, lng: activeTravel.startLng },
          { lat, lng }
        );
      }
      const s = await api.endTravel(session.id, activeTravel.id, lat, lng, dist);
      setSession(s);
      await api.log({
        actor: user!.email!,
        action: "travel.end",
        target: session.id,
        meta: { destination: activeTravel.destination, distance: dist ? Math.round(dist) : null },
      });
      toast.success(`Travel ended${dist ? ` · ${(dist / 1000).toFixed(2)} km` : ""}`);
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => finish(p.coords.latitude, p.coords.longitude),
        () => finish(),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else finish();
  };

  const submitReport = async () => {
    await runAction("submitReport", async () => {
      if (!session) return;
      if (!description.trim()) throw new Error("Add a short description");
      const s = await api.submitReport(session.id, description, attachments);
      setSession(s);
      toast.success("Report submitted for admin review");
      await refreshHistory();
    });
  };

  const elapsedWork = (() => {
    if (!session) return 0;
    const end = session.clockOut ? new Date(session.clockOut).getTime() : Date.now();
    return end - new Date(session.clockIn).getTime();
  })();
  const elapsedBreak = (() => {
    if (!session) return 0;
    return session.breaks.reduce((sum, b) => {
      const end = b.end ? new Date(b.end).getTime() : Date.now();
      return sum + (end - new Date(b.start).getTime());
    }, 0);
  })();

  const chartData = useMemo(() => {
    const days: { date: string; hours: number; breakH: number }[] = [];
    const todayKey = new Date().toISOString().slice(0, 10);
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = history.filter((h) => h.date === key);
      
      let work = day.reduce((s, x) => s + (x.totalWorkMs || 0), 0);
      let br = day.reduce((s, x) => s + (x.totalBreakMs || 0), 0);
      
      // Include current session's progress if it's today and not clocked out
      if (key === todayKey && session && !session.clockOut) {
        const currentWork = Date.now() - new Date(session.clockIn).getTime();
        const currentBreak = session.breaks.reduce((sum, b) => {
          const end = b.end ? new Date(b.end).getTime() : Date.now();
          return sum + (end - new Date(b.start).getTime());
        }, 0);
        work += currentWork;
        br += currentBreak;
      }
      
      days.push({ 
        date: key.slice(5), 
        hours: +(work / 3600000).toFixed(2), 
        breakH: +(br / 3600000).toFixed(2) 
      });
    }
    return days;
  }, [history, session, tick]);

  const points = (session?.locations || []).map((l, i) => ({
    id: String(i), 
    lat: l.lat, 
    lng: l.lng, 
    label: l.locationName 
      ? `${l.locationName} - ${new Date(l.at).toLocaleTimeString()}` 
      : new Date(l.at).toLocaleTimeString(),
    accent: l.outsideGeofence,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Hello, {profile?.fullName?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-muted-foreground mb-2">
            {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <Button
            onClick={() => {
              resetTimer();
              toast.success("Session extended for 30 minutes");
            }}
            variant="outline"
            size="sm"
          >
            Record
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTravel ? (
            <Badge className="bg-info text-info-foreground gap-1"><Plane className="h-3 w-3" /> Travelling</Badge>
          ) : session && !session.clockOut ? (
            <Badge className="bg-success text-success-foreground">Working</Badge>
          ) : (
            <Badge variant="secondary">Off-clock</Badge>
          )}
          {onBreak && <Badge className="bg-warning text-warning-foreground">On break</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat icon={Clock} label="Today work time" value={fmtDuration(elapsedWork - elapsedBreak)} />
        <Stat icon={Coffee} label="Break time" value={fmtDuration(elapsedBreak)} />
        <Stat icon={MapPin} label="Location pings" value={String(session?.locations.length ?? 0)} />
        <Stat icon={FileBarChart} label="Sessions" value={String(history.length)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 sm:p-6 lg:col-span-2 space-y-5 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            {!session || session.clockOut ? (
              <Button onClick={clockIn} size="lg" disabled={!!busyAction} className="gap-2 bg-gradient-primary shadow-elevated">
                <Play className="h-4 w-4" /> Clock in
              </Button>
            ) : (
              <Button onClick={clockOut} size="lg" variant="destructive" disabled={!!busyAction} className="gap-2">
                <Square className="h-4 w-4" /> Clock out
              </Button>
            )}
            {session && !session.clockOut && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={breakType} onValueChange={(v) => setBreakType(v as BreakEntry["type"])}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BREAK_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {onBreak ? (
                    <Button variant="outline" onClick={endBreak} disabled={!!busyAction}>End break</Button>
                  ) : (
                    <Button variant="outline" onClick={startBreak} disabled={!!busyAction} className="gap-2">
                      <Coffee className="h-4 w-4" /> Start break
                    </Button>
                  )}
                </div>
                {activeTravel ? (
                  <Button onClick={endTravel} disabled={!!busyAction} className="gap-2 bg-info text-info-foreground hover:opacity-90">
                    <Navigation className="h-4 w-4" /> End travel
                  </Button>
                ) : (
                  <Button onClick={() => setTravelOpen(true)} variant="outline" disabled={!!busyAction} className="gap-2">
                    <Plane className="h-4 w-4" /> Start travel
                  </Button>
                )}
              </>
            )}
          </div>

          {session && !session.clockOut && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Work type</span>
              <Select value={session.workType || ""} onValueChange={(v) => setWorkType(v as WorkType)}>
                <SelectTrigger className="w-full sm:w-[240px]"><SelectValue placeholder="Select work type…" /></SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {activeTravel && (
            <div className="rounded-lg border border-info/40 bg-info/5 p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-info">
                <Plane className="h-4 w-4" /> Travelling to {activeTravel.destination}
              </div>
              <div className="text-xs text-muted-foreground">
                Started {new Date(activeTravel.startedAt).toLocaleTimeString()} · Live location is shared every 60s with admin.
              </div>
            </div>
          )}

          {session && (
            <div className="rounded-lg border p-4 bg-secondary/40 text-sm space-y-1">
              <div><span className="text-muted-foreground">Clock-in:</span> {new Date(session.clockIn).toLocaleString()}</div>
              {session.clockOut && (
                <div><span className="text-muted-foreground">Clock-out:</span> {new Date(session.clockOut).toLocaleString()}</div>
              )}
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={session.status} /></div>
              {session.adminComment && (
                <div><span className="text-muted-foreground">Admin comment:</span> {session.adminComment}</div>
              )}
              {session.breaks.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">Breaks ({session.breaks.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {session.breaks.map((b) => (
                      <li key={b.id} className="flex gap-2">
                        <Badge variant="outline">{b.type}</Badge>
                        <span>{new Date(b.start).toLocaleTimeString()}</span>
                        <span>→</span>
                        <span>{b.end ? new Date(b.end).toLocaleTimeString() : "…"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {session.travels && session.travels.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">Travels ({session.travels.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {session.travels.map((t) => (
                      <li key={t.id} className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline" className="gap-1"><Plane className="h-3 w-3" />{t.destination}</Badge>
                        <span>{new Date(t.startedAt).toLocaleTimeString()}</span>
                        <span>→</span>
                        <span>{t.endedAt ? new Date(t.endedAt).toLocaleTimeString() : "ongoing"}</span>
                        {t.distanceMeters != null && (
                          <span className="text-muted-foreground">{(t.distanceMeters / 1000).toFixed(2)} km</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {session && (
            <div className="space-y-3">
              <h3 className="font-medium">Daily report</h3>
              <Textarea
                placeholder="Describe what you accomplished today…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              <FileUploader value={attachments} onChange={setAttachments} />
              <Button onClick={submitReport} disabled={!!busyAction} className="gap-2 bg-gradient-primary shadow-elevated">
                <Send className="h-4 w-4" /> Submit for admin review
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Live location</h3>
            <span className="text-xs text-muted-foreground">
              {activeTravel ? "Travel mode · 60s" : "100m geofence"}
            </span>
          </div>
          {session && points.length ? (
            <LiveMap
              points={points}
              center={baseLocation.current ? [baseLocation.current.lat, baseLocation.current.lng] : undefined}
              geofenceRadius={activeTravel ? undefined : GEOFENCE_RADIUS}
              height={320}
            />
          ) : (
            <div className="h-[320px] grid place-items-center text-sm text-muted-foreground rounded-md bg-secondary/40">
              {session ? "Acquiring GPS…" : "Clock in to start location tracking"}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5 shadow-card">
          <h3 className="font-medium mb-4">Hours worked — last 7 days</h3>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 shadow-card">
          <h3 className="font-medium mb-4">Break hours — last 7 days</h3>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Bar dataKey="breakH" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Dialog open={travelOpen} onOpenChange={setTravelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plane className="h-4 w-4" /> Start travel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Travel time counts as work hours. Your live location is shared with admin every 60 seconds until you end travel.
            </p>
            <Input
              autoFocus
              placeholder="Destination (e.g. Client site — Zürich HB)"
              value={travelDestination}
              onChange={(e) => setTravelDestination(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTravelOpen(false)}>Cancel</Button>
            <Button onClick={beginTravel} disabled={!!busyAction} className="bg-gradient-primary">Start travel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary grid place-items-center">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className="text-base sm:text-lg font-semibold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: WorkSession["status"] }) {
  const map: Record<string, string> = {
    pending: "bg-warning text-warning-foreground",
    approved: "bg-success text-success-foreground",
    rejected: "bg-destructive text-destructive-foreground",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}
