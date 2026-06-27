import { API_BASE } from "./config";
import type {
  AuditLog,
  BreakEntry,
  EmployeeProfile,
  LocationPing,
  Status,
  WorkSession,
  WorkType,
} from "./types";

/**
 * MongoDB-backed data layer. Firebase is used only for authentication.
 * Local development defaults to http://localhost:5000/api.
 */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  async getProfile(email: string): Promise<EmployeeProfile | null> {
    try {
      return await request(`/profiles/${encodeURIComponent(email)}`);
    } catch {
      return null;
    }
  },

  async upsertProfile(p: EmployeeProfile): Promise<EmployeeProfile> {
    return request(`/profiles`, { method: "POST", body: JSON.stringify(p) });
  },

  async listProfiles(): Promise<EmployeeProfile[]> {
    return request(`/profiles`);
  },

  async listSessions(filter?: { email?: string; status?: Status }): Promise<WorkSession[]> {
    const qs = new URLSearchParams(filter as Record<string, string>).toString();
    return request(`/sessions${qs ? `?${qs}` : ""}`);
  },

  async getActiveSession(email: string): Promise<WorkSession | null> {
    const list = await this.listSessions({ email });
    return list.find((s) => !s.clockOut) || null;
  },

  async clockIn(profile: EmployeeProfile): Promise<WorkSession> {
    const session: WorkSession = {
      id: uid(),
      employeeId: profile.employeeId,
      email: profile.email,
      fullName: profile.fullName,
      date: today(),
      clockIn: new Date().toISOString(),
      breaks: [],
      locations: [],
      attachments: [],
      status: "pending",
    };
    return request(`/sessions`, { method: "POST", body: JSON.stringify(session) });
  },

  async updateSession(id: string, patch: Partial<WorkSession>): Promise<WorkSession> {
    return request(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async addBreak(id: string, type: BreakEntry["type"]): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id);
    if (!s) throw new Error("Session not found");
    const b: BreakEntry = { id: uid(), type, start: new Date().toISOString() };
    return this.updateSession(id, { breaks: [...s.breaks, b] });
  },

  async endBreak(id: string, breakId: string): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id);
    if (!s) throw new Error("Session not found");
    const breaks = s.breaks.map((b) =>
      b.id === breakId && !b.end ? { ...b, end: new Date().toISOString() } : b
    );
    return this.updateSession(id, { breaks });
  },

  async pushLocation(id: string, ping: LocationPing): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id);
    if (!s) throw new Error("Session not found");
    return this.updateSession(id, { locations: [...s.locations, ping] });
  },

  async setWorkType(id: string, workType: WorkType): Promise<WorkSession> {
    return this.updateSession(id, { workType });
  },

  async startTravel(id: string, destination: string, startLat?: number, startLng?: number) {
    const s = (await this.listSessions()).find((x) => x.id === id);
    if (!s) throw new Error("Session not found");
    const travels = s.travels || [];
    const t = { id: uid(), destination, startedAt: new Date().toISOString(), startLat, startLng };
    return this.updateSession(id, { travels: [...travels, t], workType: "travel" });
  },

  async endTravel(
    id: string,
    travelId: string,
    endLat?: number,
    endLng?: number,
    distanceMeters?: number
  ) {
    const s = (await this.listSessions()).find((x) => x.id === id);
    if (!s) throw new Error("Session not found");
    const travels = (s.travels || []).map((t) =>
      t.id === travelId && !t.endedAt
        ? { ...t, endedAt: new Date().toISOString(), endLat, endLng, distanceMeters }
        : t
    );
    return this.updateSession(id, { travels });
  },

  async clockOut(id: string): Promise<WorkSession> {
    return this.updateSession(id, { clockOut: new Date().toISOString() });
  },

  async forceClockOut(id: string, adminEmail: string, note?: string): Promise<WorkSession> {
    const s = await this.updateSession(id, {
      clockOut: new Date().toISOString(),
      adminComment: note || `Force clocked-out by ${adminEmail}`,
    });
    await this.log({
      actor: adminEmail,
      action: "session.force_clock_out",
      target: id,
      meta: { email: s.email, note },
    });
    return s;
  },

  async submitReport(id: string, description: string, attachments: WorkSession["attachments"]) {
    const s = await this.updateSession(id, { description, attachments, status: "pending" });
    await this.log({ actor: s.email, action: "report.submitted", target: id });
    return s;
  },

  async reviewSession(id: string, status: "approved" | "rejected", comment: string, reviewer: string) {
    const s = await this.updateSession(id, {
      status,
      adminComment: comment,
      reviewedBy: reviewer,
      reviewedAt: new Date().toISOString(),
    });
    await this.log({ actor: reviewer, action: `report.${status}`, target: id, meta: { comment } });
    return s;
  },

  async log(entry: Omit<AuditLog, "id" | "at">): Promise<AuditLog> {
    const log: AuditLog = { ...entry, id: uid(), at: new Date().toISOString() };
    return request(`/audit`, { method: "POST", body: JSON.stringify(log) });
  },

  async listAudit(): Promise<AuditLog[]> {
    return request(`/audit`);
  },
};

export const fmtDuration = (ms?: number) => {
  if (!ms || ms < 0) return "0h 0m";
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    const data = await res.json();
    if (data.display_name) {
      // Try to get city, state, country for simplicity
      const addr = data.address;
      if (addr) {
        const parts = [addr.city, addr.state, addr.country].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : data.display_name;
      }
      return data.display_name;
    }
    return null;
  } catch {
    return null;
  }
};
