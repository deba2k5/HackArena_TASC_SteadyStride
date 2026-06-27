export type Role = "employee" | "super_admin" | "department_manager" | "hr_officer";

export type EmployeeType = "permanent" | "contractual";

export interface EmployeeProfile {
  employeeId: string;
  fullName: string;
  email: string;
  mobile: string;
  department: string;
  employeeType: EmployeeType;
  active: boolean;
  createdAt: string;
}

export type WorkType =
  | "on_site"
  | "remote"
  | "work_from_home"
  | "office_administration"
  | "client_meeting"
  | "training"
  | "maintenance"
  | "other";

export type BreakType = "lunch" | "short" | "prayer" | "other";

export interface BreakEntry {
  id: string;
  type: BreakType;
  start: string;
  end?: string;
}

export interface LocationPing {
  lat: number;
  lng: number;
  accuracy: number;
  at: string;
  outsideGeofence?: boolean;
  locationName?: string;
}

export type Status = "pending" | "approved" | "rejected";

export interface WorkSession {
  id: string;
  employeeId: string;
  email: string;
  fullName: string;
  date: string; // YYYY-MM-DD
  clockIn: string;
  clockOut?: string;
  workType?: WorkType;
  description?: string;
  breaks: BreakEntry[];
  locations: LocationPing[];
  attachments: { name: string; url: string; type: string }[];
  totalWorkMs?: number;
  totalBreakMs?: number;
  status: Status;
  adminComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target?: string;
  at: string;
  meta?: Record<string, unknown>;
}
