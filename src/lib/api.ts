import { API_BASE } from "./config";
import type {
  AuditLog,
  BreakEntry,
  Customer,
  Employee,
  EmployeeProfile,
  Invoice,
  LocationPing,
  Query,
  TIAAuditLog,
  TIAMetrics,
  Timesheet,
  Status,
  WorkSession,
  WorkType,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── API object ──────────────────────────────────────────────────────────────

export const api = {
  // ── Legacy profile / session (kept for auth compatibility) ─────────────────

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
    return request(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
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

  async startTravel(
    id: string,
    destination: string,
    startLat?: number,
    startLng?: number
  ): Promise<WorkSession> {
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
  ): Promise<WorkSession> {
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
    await this.log({ actor: adminEmail, action: "session.force_clock_out", target: id, meta: { email: s.email, note } });
    return s;
  },

  async submitReport(id: string, description: string, attachments: WorkSession["attachments"]): Promise<WorkSession> {
    const s = await this.updateSession(id, { description, attachments, status: "pending" });
    await this.log({ actor: s.email, action: "report.submitted", target: id });
    return s;
  },

  async reviewSession(id: string, status: "approved" | "rejected", comment: string, reviewer: string): Promise<WorkSession> {
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
    try {
      return await request(`/audit`, { method: "POST", body: JSON.stringify(log) });
    } catch {
      return log;
    }
  },

  async listAudit(): Promise<AuditLog[]> {
    return request(`/audit`);
  },

  // ── TIA endpoints ──────────────────────────────────────────────────────────

  /** GET /api/metrics */
  async getMetrics(): Promise<TIAMetrics> {
    return request(`/metrics`);
  },

  /** POST /api/timesheets/process-pending — heal stuck records */
  async processPendingTimesheets(): Promise<{ promoted: number; ids: string[] }> {
    return request(`/timesheets/process-pending`, { method: "POST" });
  },

  /** GET /api/timesheets?client_code=... */
  async listTimesheets(clientCode?: string): Promise<Timesheet[]> {
    const qs = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/timesheets${qs}`);
  },

  /** POST /api/timesheets — multipart or JSON */
  async uploadTimesheet(formData: FormData): Promise<Timesheet> {
    return requestMultipart(`/timesheets`, formData);
  },

  /** POST /api/timesheets/{id}/approve */
  async approveTimesheet(id: string, records: unknown[]): Promise<Timesheet> {
    return request(`/timesheets/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ records }),
    });
  },

  /** GET /api/invoices?client_code=... */
  async listInvoices(clientCode?: string): Promise<Invoice[]> {
    const qs = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/invoices${qs}`);
  },

  /** POST /api/invoices/{id}/approve */
  async approveInvoice(id: string): Promise<Invoice> {
    return request(`/invoices/${encodeURIComponent(id)}/approve`, { method: "POST" });
  },

  /** POST /api/invoices/dispatch */
  async dispatchInvoices(): Promise<{ dispatched: number; ids: string[] }> {
    return request(`/invoices/dispatch`, { method: "POST" });
  },

  /** GET /api/customers */
  async listCustomers(): Promise<Customer[]> {
    return request(`/customers`);
  },

  /** GET /api/employees?client_code=...&email=... */
  async listEmployees(clientCode?: string, email?: string): Promise<Employee[]> {
    const params = new URLSearchParams();
    if (clientCode) params.set("client_code", clientCode);
    if (email) params.set("email", email);
    const qs = params.toString();
    return request(`/employees${qs ? `?${qs}` : ""}`);
  },

  /** GET /api/queries?client_code=... */
  async listQueries(clientCode?: string): Promise<Query[]> {
    const qs = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/queries${qs}`);
  },

  /** POST /api/queries */
  async createQuery(data: {
    client_code: string;
    invoice_id: string;
    subject: string;
    message: string;
  }): Promise<Query> {
    return request(`/queries`, { method: "POST", body: JSON.stringify(data) });
  },

  /** POST /api/queries/{id}/resolve */
  async resolveQuery(id: string, reply: string): Promise<Query> {
    return request(`/queries/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });
  },

  /** POST /api/chat */
  async chat(query: string, clientCode?: string): Promise<{ response: string }> {
    return request(`/chat`, {
      method: "POST",
      body: JSON.stringify({ query, client_code: clientCode }),
    });
  },

  /** GET /api/audit (TIA audit logs) */
  async listAuditLogs(): Promise<TIAAuditLog[]> {
    return request(`/audit`);
  },

  /** GET /api/invoices/{id}/salary-slip/{empId} — download salary slip PDF */
  async downloadSalarySlip(invoiceId: string, empId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/salary-slip/${encodeURIComponent(empId)}`);
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("Content-Disposition")?.match(/filename="?(.+?)"?$/)?.[1]
      ?? `salary_slip_${empId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

export const fmtDuration = (ms?: number) => {
  if (!ms || ms < 0) return "0h 0m";
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const fmtAED = (amount: number) =>
  `AED ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const haversine = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
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
