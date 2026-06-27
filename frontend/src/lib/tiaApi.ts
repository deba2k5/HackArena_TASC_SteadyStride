import { API_BASE } from "./config";

export interface CustomerConfig {
  client_code: string;
  client_name: string;
  city: string;
  industry: string;
  contact_email: string;
  status: string;
  input_channels: string[];
  dispatch_rule: string;
  validation_profile: {
    max_ot_hours_limit: number;
    allow_variance: boolean;
    max_salary_variance_pct: number;
    require_signature: boolean;
  };
}

export interface Employee {
  emp_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  client_code: string;
  client_name: string;
  job_title: string;
  department: string;
  nationality: string;
  date_of_joining: string;
  status: string;
  iban: string;
  basic: number;
  housing: number;
  transport: number;
  food: number;
  phone: number;
  total_ctc: number;
}

export interface TimesheetRecord {
  employee_name?: string;
  emp_id?: string;
  working_days?: number;
  ot_hours?: number;
  leave_taken_days?: number;
  leave_comments?: string;
  client_name?: string;
  client_code?: string;
  pay_period?: string;
  gross_payout_requested?: number;
  confidence?: number;
  matched_emp_id?: string;
  matched_name?: string;
  match_status?: "matched" | "ambiguous" | "unmatched";
  match_candidates?: Array<{ emp_id: string; name: string; client_name: string }>;
  warning?: string;
  is_handwritten?: boolean;
}

export interface Timesheet {
  id: string;
  client_code: string;
  client_name: string;
  pay_period: string;
  input_type: "email" | "excel" | "handwriting" | "pdf";
  file_name?: string;
  status: "pending_review" | "processed" | "rejected";
  uploaded_at: string;
  uploaded_by: string;
  extracted_data: {
    records: TimesheetRecord[];
    overall_confidence: number;
    meta: {
      has_signature: boolean;
      has_stamp: boolean;
      is_handwritten: boolean;
      raw_text_extracted?: string;
    };
  };
  exceptions: string[];
  is_touchless: boolean;
}

export interface InvoiceLineItem {
  emp_id: string;
  employee_name: string;
  working_days: number;
  basic: number;
  housing: number;
  transport: number;
  food: number;
  phone: number;
  gross: number;
  ot_hours: number;
  ot_amount: number;
  deductions: number;
  net_pay: number;
  iban: string;
  reimbursements: Array<{ amount: number; reason: string }>;
}

export interface Invoice {
  id: string;
  timesheet_id: string;
  client_code: string;
  client_name: string;
  pay_period: string;
  total_amount: number;
  currency: string;
  line_items: InvoiceLineItem[];
  generated_at: string;
  validation_status: "passed" | "failed" | "pending";
  validation_errors: Array<{ type: string; employee?: string; message: string }>;
  dispatch_status: "draft" | "queued" | "dispatched";
  dispatched_at?: string;
}

export interface ClientQuery {
  id: string;
  client_code: string;
  client_name: string;
  invoice_id: string;
  subject: string;
  message: string;
  status: "open" | "resolved";
  created_at: string;
  created_by: string;
  replies: Array<{ sender: string; message: string; at: string }>;
}

export interface SystemMetrics {
  touchless_rate: number;
  extraction_accuracy: number;
  avg_processing_time_mins: number;
  total_invoiced_amount: number;
  passed_validation_count: number;
  total_invoices_count: number;
}

export interface AuditLog {
  actor: string;
  action: string;
  target: string;
  at: string;
  meta: Record<string, any>;
}

import { firebaseAuth } from "./firebase";

// REST request helper
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const userEmail = firebaseAuth.currentUser?.email || localStorage.getItem("user_email") || "demo@tia.system";
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": userEmail,
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error ${res.status}: ${errorText}`);
  }
  return res.json();
}

export const tiaApi = {
  async getCustomers(): Promise<CustomerConfig[]> {
    return request("/customers");
  },

  async upsertCustomer(cust: CustomerConfig): Promise<CustomerConfig> {
    return request("/customers", {
      method: "POST",
      body: JSON.stringify(cust),
    });
  },

  async getEmployees(clientCode?: string): Promise<Employee[]> {
    const q = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/employees${q}`);
  },

  async getTimesheets(clientCode?: string): Promise<Timesheet[]> {
    const q = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/timesheets${q}`);
  },

  async uploadTimesheet(formData: FormData): Promise<Timesheet> {
    const userEmail = firebaseAuth.currentUser?.email || localStorage.getItem("user_email") || "demo@tia.system";
    const res = await fetch(`${API_BASE}/timesheets`, {
      method: "POST",
      body: formData,
      headers: {
        "X-User-Email": userEmail,
      },
    });
    if (!res.ok) {
      throw new Error(`Upload error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  },

  async approveTimesheet(id: string, records: TimesheetRecord[]): Promise<Timesheet> {
    return request(`/timesheets/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ records }),
    });
  },

  async getInvoices(clientCode?: string): Promise<Invoice[]> {
    const q = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/invoices${q}`);
  },

  async approveInvoice(id: string): Promise<Invoice> {
    return request(`/invoices/${id}/approve`, {
      method: "POST",
    });
  },

  async executeDispatch(): Promise<{ dispatched_count: number; invoices: Invoice[] }> {
    return request("/invoices/dispatch", {
      method: "POST",
    });
  },

  async getQueries(clientCode?: string): Promise<ClientQuery[]> {
    const q = clientCode ? `?client_code=${encodeURIComponent(clientCode)}` : "";
    return request(`/queries${q}`);
  },

  async createQuery(q: Omit<ClientQuery, "id" | "status" | "created_at" | "created_by" | "replies">): Promise<ClientQuery> {
    return request("/queries", {
      method: "POST",
      body: JSON.stringify(q),
    });
  },

  async resolveQuery(id: string, reply: string): Promise<ClientQuery> {
    return request(`/queries/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });
  },

  async chat(query: string, clientCode?: string): Promise<string> {
    const res = await request<{ response: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ query, client_code: clientCode }),
    });
    return res.response;
  },

  async getMetrics(): Promise<SystemMetrics> {
    return request("/metrics");
  },

  async getAudit(): Promise<AuditLog[]> {
    return request("/audit");
  },

  async triggerSeed(): Promise<{ status: string; message: string }> {
    return request("/seed", {
      method: "POST",
    });
  },
};
