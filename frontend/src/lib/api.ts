import { API_BASE, USE_MOCK_API } from "./config";
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
 * Thin client that hits a MongoDB-backed REST API. If VITE_MONGODB_API_URL
 * isn't set, we fall back to a localStorage mock so the UI is still usable.
 * See BACKEND.md for the exact endpoint contract.
 */

const LS = {
  profiles: "ets.profiles",
  sessions: "ets.sessions",
  audit: "ets.audit",
};

const read = <T>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) || "[]");
  } catch {
    return [];
  }
};
const write = <T>(k: string, v: T[]) => localStorage.setItem(k, JSON.stringify(v));
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

// ---------- PROFILES ----------
export const api = {
  async getProfile(email: string): Promise<EmployeeProfile | null> {
    if (USE_MOCK_API) {
      return read<EmployeeProfile>(LS.profiles).find((p) => p.email === email) || null;
    }
    try {
      return await request(`/profiles/${encodeURIComponent(email)}`);
    } catch {
      return null;
    }
  },

  async upsertProfile(p: EmployeeProfile): Promise<EmployeeProfile> {
    if (USE_MOCK_API) {
      const list = read<EmployeeProfile>(LS.profiles);
      const i = list.findIndex((x) => x.email === p.email);
      if (i >= 0) list[i] = p;
      else list.push(p);
      write(LS.profiles, list);
      return p;
    }
    return request(`/profiles`, { method: "POST", body: JSON.stringify(p) });
  },

  async listProfiles(): Promise<EmployeeProfile[]> {
    if (USE_MOCK_API) return read<EmployeeProfile>(LS.profiles);
    return request(`/profiles`);
  },

  // ---------- SESSIONS ----------
  async listSessions(filter?: { email?: string; status?: Status }): Promise<WorkSession[]> {
    if (USE_MOCK_API) {
      let list = read<WorkSession>(LS.sessions);
      if (filter?.email) list = list.filter((s) => s.email === filter.email);
      if (filter?.status) list = list.filter((s) => s.status === filter.status);
      return list.sort((a, b) => (b.clockIn || "").localeCompare(a.clockIn || ""));
    }
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
    if (USE_MOCK_API) {
      const list = read<WorkSession>(LS.sessions);
      list.push(session);
      write(LS.sessions, list);
      return session;
    }
    return request(`/sessions`, { method: "POST", body: JSON.stringify(session) });
  },

  async updateSession(id: string, patch: Partial<WorkSession>): Promise<WorkSession> {
    if (USE_MOCK_API) {
      const list = read<WorkSession>(LS.sessions);
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) throw new Error("Session not found");
      list[i] = { ...list[i], ...patch };
      // recompute totals
      const s = list[i];
      if (s.clockOut) {
        s.totalWorkMs =
          new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime();
      }
      s.totalBreakMs = s.breaks.reduce(
        (sum, b) => sum + (b.end ? new Date(b.end).getTime() - new Date(b.start).getTime() : 0),
        0
      );
      write(LS.sessions, list);
      return s;
    }
    return request(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async addBreak(id: string, type: BreakEntry["type"]): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id)!;
    const b: BreakEntry = { id: uid(), type, start: new Date().toISOString() };
    return this.updateSession(id, { breaks: [...s.breaks, b] });
  },

  async endBreak(id: string, breakId: string): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id)!;
    const breaks = s.breaks.map((b) =>
      b.id === breakId && !b.end ? { ...b, end: new Date().toISOString() } : b
    );
    return this.updateSession(id, { breaks });
  },

  async pushLocation(id: string, ping: LocationPing): Promise<WorkSession> {
    const s = (await this.listSessions()).find((x) => x.id === id)!;
    return this.updateSession(id, { locations: [...s.locations, ping] });
  },

  async setWorkType(id: string, workType: WorkType): Promise<WorkSession> {
    return this.updateSession(id, { workType });
  },

  async clockOut(id: string): Promise<WorkSession> {
    return this.updateSession(id, { clockOut: new Date().toISOString() });
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

  // ---------- AUDIT ----------
  async log(entry: Omit<AuditLog, "id" | "at">): Promise<AuditLog> {
    const log: AuditLog = { ...entry, id: uid(), at: new Date().toISOString() };
    if (USE_MOCK_API) {
      const list = read<AuditLog>(LS.audit);
      list.unshift(log);
      write(LS.audit, list.slice(0, 500));
      return log;
    }
    return request(`/audit`, { method: "POST", body: JSON.stringify(log) });
  },

  async listAudit(): Promise<AuditLog[]> {
    if (USE_MOCK_API) return read<AuditLog>(LS.audit);
    return request(`/audit`);
  },
};

// ---------- Helpers ----------
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
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    const data = await res.json();
    if (data.display_name) {
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
