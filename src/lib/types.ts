// ─── Legacy types (kept for auth compatibility) ──────────────────────────────

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
  | "travel"
  | "other";

export interface TravelLog {
  id: string;
  destination: string;
  startedAt: string;
  endedAt?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  distanceMeters?: number;
}

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
  date: string;
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
  travels?: TravelLog[];
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target?: string;
  at: string;
  meta?: Record<string, unknown>;
}

// ─── TIA (Touchless Invoice Agent) types ─────────────────────────────────────

export interface TIAMetrics {
  touchless_rate: number;
  extraction_accuracy: number;
  avg_processing_time_mins: number;
  total_invoiced_amount: number;
  passed_validation_count: number;
  total_invoices_count: number;
}

export interface Employee {
  emp_id: string;
  full_name: string;
  email: string;
  client_code: string;
  client_name: string;
  job_title: string;
  department: string;
  nationality: string;
  basic: number;
  total_ctc: number;
  status: string;
}

export interface Customer {
  client_code: string;
  client_name: string;
  city: string;
  industry: string;
  contact_email: string;
  status: string;
  dispatch_rule: string;
  validation_profile: Record<string, unknown>;
}

export interface ExtractedRecord {
  emp_id?: string;
  full_name: string;
  days_worked: number;
  overtime_hours?: number;
  reimbursements?: number;
  confidence?: number;
  match_status?: string;
  match_candidates?: { emp_id: string; full_name: string; score: number }[];
  [key: string]: unknown;
}

export interface Timesheet {
  id: string;
  client_code: string;
  client_name: string;
  pay_period: string;
  input_type: string;
  file_name?: string;
  status: string;
  uploaded_at: string;
  uploaded_by: string;
  extracted_data: {
    records: ExtractedRecord[];
    overall_confidence: number;
    meta: Record<string, unknown>;
  };
  exceptions: string[];
  is_touchless: boolean;
}

export interface LineItem {
  emp_id: string;
  full_name: string;
  basic: number;
  days_worked: number;
  overtime_hours?: number;
  reimbursements?: number;
  gross_pay: number;
  [key: string]: unknown;
}

export interface Invoice {
  id: string;
  timesheet_id: string;
  client_code: string;
  client_name: string;
  pay_period: string;
  total_amount: number;
  currency: string;
  line_items: LineItem[];
  generated_at: string;
  validation_status: string;
  validation_errors: { field: string; message: string; severity: string }[];
  dispatch_status: string;
  dispatched_at?: string;
}

export interface Query {
  id: string;
  client_code: string;
  client_name: string;
  invoice_id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  replies: { author: string; message: string; at: string }[];
}

export interface TIAAuditLog {
  id: string;
  action: string;
  actor: string;
  target_id?: string;
  client_code?: string;
  details?: Record<string, unknown>;
  at: string;
}
