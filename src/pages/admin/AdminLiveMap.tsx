import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import LiveMap from "@/components/LiveMap";

export default function AdminLiveMap() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  useEffect(() => {
    const load = async () => setSessions(await api.listSessions());
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const active = sessions.filter((s) => !s.clockOut);
  const points = active
    .map((s) => {
      const last = s.locations[s.locations.length - 1];
      if (!last) return null;
      const travelling = s.travels?.some((t) => !t.endedAt);
      const dest = s.travels?.find((t) => !t.endedAt)?.destination;
      const locationPart = last.locationName ? ` · ${last.locationName}` : "";
      return {
        id: s.id,
        lat: last.lat,
        lng: last.lng,
        label: `${s.fullName}${travelling ? ` ✈ ${dest}` : ""} · ${new Date(last.at).toLocaleTimeString()}${locationPart}`,
        accent: travelling,
      };
    })
    .filter(Boolean) as { id: string; lat: number; lng: number; label: string; accent?: boolean }[];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Live employee map</h1>
        <p className="text-sm text-muted-foreground">{points.length} employee(s) reporting location · refreshes every 15s.</p>
      </header>
      <Card className="p-3 shadow-card">
        <div className="h-[460px] sm:h-[560px]"><LiveMap points={points} /></div>
      </Card>
    </div>
  );
}
