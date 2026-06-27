import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { api, fmtAED } from "@/lib/api";
import type { Invoice, Timesheet, Employee, Query } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Upload, FileText, MessageSquare, Clock, DollarSign,
  CheckCircle2, AlertTriangle, Eye, RefreshCw, Send,
  Calendar, User, Building2, Briefcase, Brain, Download,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────
const INV_STATUS: Record<string, string> = {
  passed:     "bg-green-500/15 text-green-700 border-green-200",
  failed:     "bg-red-500/15 text-red-700 border-red-200",
  pending:    "bg-yellow-500/15 text-yellow-700 border-yellow-200",
  dispatched: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  draft:      "bg-slate-500/15 text-slate-600 border-slate-200",
};
const TS_STATUS: Record<string, string> = {
  processed:      "bg-green-500/15 text-green-700 border-green-200",
  pending_review: "bg-orange-500/15 text-orange-700 border-orange-200",
  failed:         "bg-red-500/15 text-red-700 border-red-200",
};
const QUERY_STATUS: Record<string, string> = {
  open:     "bg-blue-500/15 text-blue-700 border-blue-200",
  resolved: "bg-green-500/15 text-green-700 border-green-200",
};

const INPUT_TYPES = [
  { value: "email",       label: "Email / Text" },
  { value: "excel",       label: "Excel Spreadsheet" },
  { value: "pdf",         label: "PDF Document" },
  { value: "handwriting", label: "Handwritten / Scan (AI reads image)" },
  { value: "text",        label: "Plain Text" },
];

const PROJECTS = [
  { code: "P1", label: "P1 — Alpha Infrastructure (max AED 24,000 / 6 days)" },
  { code: "P2", label: "P2 — Beta Integration (max AED 20,000 / 5 days)" },
  { code: "P3", label: "P3 — Gamma Support (max AED 16,000 / 4 days)" },
];

export default function EmployeeTimesheetPortal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const email = user?.email ?? "";

  // Resolve employee from login email — direct lookup by email
  const { data: employeeByEmail = [] } = useQuery<Employee[]>({
    queryKey: ["employee-by-email", email],
    queryFn: () => email ? api.listEmployees(undefined, email) : Promise.resolve([]),
    enabled: !!email,
  });

  // Also have all employees for invoices/timesheet filtering
  const { data: allEmployees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.listEmployees(),
  });

  const employee = employeeByEmail[0] ?? null;

  // ── On mount: heal any stuck pending_review timesheets ────────────────────
  useEffect(() => {
    api.processPendingTimesheets()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["timesheets"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
      })
      .catch(() => {/* silent */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientCode = employee?.client_code ?? "";

  const { data: timesheets = [], isLoading: tsLoading } = useQuery<Timesheet[]>({
    queryKey: ["timesheets", clientCode],
    queryFn: () => api.listTimesheets(clientCode),
    enabled: !!clientCode,
    refetchInterval: 30_000,
  });

  const { data: invoices = [], isLoading: invLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices", clientCode],
    queryFn: () => api.listInvoices(clientCode),
    enabled: !!clientCode,
    refetchInterval: 30_000,
  });

  const { data: queries = [] } = useQuery<Query[]>({
    queryKey: ["queries", clientCode],
    queryFn: () => api.listQueries(clientCode),
    enabled: !!clientCode,
  });

  // My timesheets / invoices only
  const myTimesheets = timesheets.filter((t) =>
    t.extracted_data?.records?.some((r) => {
      const recEmpId = (r as Record<string, unknown>).matched_emp_id as string | undefined
                    || (r as Record<string, unknown>).emp_id as string | undefined;
      return recEmpId === employee?.emp_id;
    })
  );
  const myInvoices = invoices.filter((inv) =>
    inv.line_items?.some((li) => {
      const empId = (li as Record<string, unknown>).emp_id as string | undefined;
      const matchedEmpId = (li as Record<string, unknown>).matched_emp_id as string | undefined;
      return empId === employee?.emp_id || matchedEmpId === employee?.emp_id;
    })
  );
  const totalEarned = myInvoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);

  // A timesheet is truly pending only if confidence < 90% AND status is pending_review
  const effectiveStatus = (t: Timesheet) => {
    const conf = t.overall_confidence ?? (t.extracted_data?.overall_confidence as number | undefined) ?? 0;
    if (t.status === "pending_review" && conf >= 0.90) return "processed";
    return t.status;
  };

  // Touchless: true if stored as touchless OR if auto-promoted (≥90% confidence, processed)
  const effectiveTouchless = (t: Timesheet) => {
    if (t.is_touchless) return true;
    const conf = t.overall_confidence ?? (t.extracted_data?.overall_confidence as number | undefined) ?? 0;
    return effectiveStatus(t) === "processed" && conf >= 0.90;
  };

  const pendingCount   = myTimesheets.filter((t) => effectiveStatus(t) === "pending_review").length;
  const processedCount = myTimesheets.filter((t) => effectiveStatus(t) === "processed").length;

  // ── Upload form ───────────────────────────────────────────────────────────
  const [payPeriod, setPayPeriod] = useState("June 2026");
  const [inputType, setInputType] = useState("email");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [projectCode, setProjectCode] = useState("");
  const [workingDays, setWorkingDays] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ ts: Timesheet; inv: Invoice | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Query form ────────────────────────────────────────────────────────────
  const [queryInvId, setQueryInvId] = useState("");
  const [querySubject, setQuerySubject] = useState("");
  const [queryMsg, setQueryMsg] = useState("");

  const uploadMutation = useMutation({
    mutationFn: (fd: FormData) => api.uploadTimesheet(fd),
    onSuccess: async (data) => {
      toast.success("Timesheet submitted — AI processing complete.");
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setTextContent("");
      setFile(null);
      setImagePreview(null);
      // Fetch invoice generated for this timesheet
      try {
        await new Promise((r) => setTimeout(r, 800)); // brief wait for invoice write
        const allInv = await api.listInvoices(clientCode);
        const ts = data as Timesheet;
        const inv = allInv.find((i) => i.timesheet_id === ts.id);
        setLastResult({ ts, inv: inv ?? null });
      } catch {
        setLastResult({ ts: data as Timesheet, inv: null });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const queryMutation = useMutation({
    mutationFn: () =>
      api.createQuery({
        client_code: clientCode,
        invoice_id: queryInvId,
        subject: querySubject,
        message: queryMsg,
      }),
    onSuccess: () => {
      toast.success("Query submitted to admin.");
      qc.invalidateQueries({ queryKey: ["queries"] });
      setQueryInvId(""); setQuerySubject(""); setQueryMsg("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFileChange = (f: File | null) => {
    setFile(f);
    if (f && f.type.startsWith("image/")) {
      setInputType("handwriting");
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setImagePreview(null);
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientCode) { toast.warning("Your account is not linked to any client yet."); return; }
    if (!payPeriod) { toast.warning("Pay period is required."); return; }
    if (inputType === "handwriting" && !file) { toast.warning("Please attach a handwritten image to use VLM extraction."); return; }
    const fd = new FormData();
    fd.append("client_code", clientCode);
    fd.append("pay_period", payPeriod);
    fd.append("input_type", inputType);
    // Build enriched text with structured fields so the AI pipeline has clean input
    let enrichedText = textContent || "";
    if (employee && !enrichedText.includes("Emp ID")) {
      enrichedText = `Emp ID: ${employee.emp_id}\nEmployee Name: ${employee.full_name}\nClient: ${employee.client_name} (${clientCode})\nPay Period: ${payPeriod}` +
        (workingDays ? `\nWorking Days: ${workingDays}` : "") +
        (projectCode ? `\nProject Code: ${projectCode}` : "") +
        (enrichedText ? `\n\n${enrichedText}` : "");
    }
    if (enrichedText) fd.append("text_content", enrichedText);
    if (file) fd.append("file", file);
    uploadMutation.mutate(fd);
  };

  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!querySubject || !queryMsg) { toast.warning("Subject and message are required."); return; }
    queryMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Workspace</h1>
          <p className="text-sm text-muted-foreground">
            {employee
              ? `${employee.full_name} · ${employee.job_title} · ${employee.client_name}`
              : email}
          </p>
        </div>
        <Button variant="outline" size="sm"
          onClick={() => { qc.invalidateQueries({ queryKey: ["timesheets"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Employee profile card */}
      {employee && (
        <Card>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <div><p className="text-xs text-muted-foreground">Emp ID</p><p className="font-semibold">{employee.emp_id}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <div><p className="text-xs text-muted-foreground">Client</p><p className="font-semibold">{employee.client_name}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <div><p className="text-xs text-muted-foreground">Department</p><p className="font-semibold">{employee.department}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <div><p className="text-xs text-muted-foreground">CTC</p><p className="font-semibold">{fmtAED(employee.total_ctc)}</p></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Invoiced",    value: fmtAED(totalEarned),      icon: DollarSign,    color: "bg-indigo-500/10 text-indigo-700" },
          { label: "Timesheets Sent",   value: String(myTimesheets.length), icon: Upload,      color: "bg-blue-500/10 text-blue-700" },
          { label: "Pending Review",    value: String(pendingCount),      icon: Clock,         color: "bg-orange-500/10 text-orange-700" },
          { label: "Processed",         value: String(processedCount),    icon: CheckCircle2,  color: "bg-green-500/10 text-green-700" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="submit">
        <TabsList className="mb-4">
          <TabsTrigger value="submit"><Upload className="h-3.5 w-3.5 mr-1.5" />Submit Timesheet</TabsTrigger>
          <TabsTrigger value="timesheets"><FileText className="h-3.5 w-3.5 mr-1.5" />My Timesheets</TabsTrigger>
          <TabsTrigger value="invoices"><DollarSign className="h-3.5 w-3.5 mr-1.5" />My Invoices</TabsTrigger>
          <TabsTrigger value="queries"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Queries</TabsTrigger>
        </TabsList>

        {/* ── Submit Timesheet ── */}
        <TabsContent value="submit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4 text-indigo-500" /> Submit Monthly Timesheet
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!employee && (
                <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-200 text-sm text-orange-700 flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  Your account ({email}) is not yet linked to an employee record. Contact your admin.
                </div>
              )}
              <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Pay Period *</Label>
                  <Input value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)} placeholder="e.g. June 2026" />
                </div>
                <div className="space-y-1.5">
                  <Label>Submission Format</Label>
                  <Select value={inputType} onValueChange={setInputType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INPUT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Structured fields — pre-fill the AI pipeline */}
                <div className="space-y-1.5">
                  <Label>Working Days <span className="text-muted-foreground text-xs">(leave blank if in text/file)</span></Label>
                  <Input type="number" min={1} max={31} value={workingDays}
                    onChange={(e) => setWorkingDays(e.target.value)} placeholder="e.g. 24" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Project Assignment <span className="text-muted-foreground text-xs">(optional — caps billing per Office Regulation)</span></Label>
                  <Select value={projectCode || "none"} onValueChange={(v) => setProjectCode(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No project / general hours" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project / general hours (AED 500/hr)</SelectItem>
                      {PROJECTS.map((p) => (
                        <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Attach File <span className="text-muted-foreground text-xs">(Excel / PDF / Image / Handwritten scan)</span></Label>
                  {inputType === "handwriting" ? (
                    <div>
                      {/* Drag-and-drop image zone */}
                      <div
                        className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer
                          ${imagePreview ? "border-indigo-400 bg-indigo-500/5" : "border-border hover:border-indigo-300 hover:bg-indigo-500/3"}
                        `}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dropped = e.dataTransfer.files?.[0];
                          if (dropped) handleFileChange(dropped);
                        }}
                      >
                        {imagePreview ? (
                          <div className="relative">
                            <img
                              src={imagePreview}
                              alt="Timesheet preview"
                              className="w-full max-h-64 object-contain rounded-xl p-2"
                            />
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); setFile(null); setImagePreview(null); }}
                              className="absolute top-2 right-2 bg-background/90 border rounded-full h-6 w-6 flex items-center justify-center text-xs text-muted-foreground hover:text-red-500"
                            >✕</button>
                            <div className="px-3 pb-2 text-xs text-indigo-600 font-medium flex items-center gap-1">
                              <Brain className="h-3 w-3" /> Ready — Groq Llama-4 Scout will extract all rows
                            </div>
                          </div>
                        ) : (
                          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                            <Brain className="h-8 w-8 text-indigo-400" />
                            <p className="text-sm font-medium text-indigo-600">Drop handwritten image here</p>
                            <p className="text-xs">or click to browse — JPG, PNG, JPEG supported</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Groq Llama-4 Scout VLM reads Days · Basic · Deductions · Net Pay from the image
                            </p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.tiff,.bmp,.webp"
                        className="hidden"
                        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  ) : (
                    <Input type="file" accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.csv,.docx"
                      onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Additional Notes <span className="text-muted-foreground text-xs">(or full email body)</span></Label>
                  <Textarea rows={3} value={textContent} onChange={(e) => setTextContent(e.target.value)}
                    placeholder={`E.g. Reimbursement: 150 AED - Phone allowance`} />
                </div>

                {/* Pay estimate */}
                {workingDays && inputType !== "handwriting" && (
                  <div className="sm:col-span-2 rounded-lg bg-indigo-500/5 border border-indigo-100 p-3 text-xs">
                    <p className="font-semibold text-indigo-700 mb-1">💡 Pay Estimate (Office Regulation Act)</p>
                    <p className="text-muted-foreground">
                      {workingDays} days × 8 hrs × AED 500/hr = <strong>AED {(Number(workingDays) * 8 * 500).toLocaleString()}</strong>
                      {projectCode ? ` (Project ${projectCode} cap applies)` : ""}
                    </p>
                  </div>
                )}

                {/* AI Extraction Result — shown after handwriting submission */}
                {lastResult && inputType === "handwriting" && (
                  <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-indigo-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
                        <Brain className="h-4 w-4" /> Groq VLM Extraction Result
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          ((lastResult.ts.overall_confidence ?? lastResult.ts.extracted_data?.overall_confidence) ?? 0) >= 0.9
                            ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {((((lastResult.ts.overall_confidence ?? lastResult.ts.extracted_data?.overall_confidence) ?? 0)) * 100).toFixed(0)}% confidence
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          lastResult.ts.status === "processed"
                            ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {lastResult.ts.status === "processed" ? "✓ Processed & Dispatched" : lastResult.ts.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>

                    {/* Show from invoice line items — always has correct values */}
                    {lastResult.inv && (lastResult.inv.line_items?.length ?? 0) > 0 ? (
                      <div className="overflow-x-auto rounded-lg border bg-background">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/40">
                              <th className="px-3 py-2 text-left font-semibold">Employee</th>
                              <th className="px-3 py-2 text-right font-semibold">Days</th>
                              <th className="px-3 py-2 text-right font-semibold">Basic (AED)</th>
                              <th className="px-3 py-2 text-right font-semibold">Deductions (AED)</th>
                              <th className="px-3 py-2 text-right font-semibold">Net Pay (AED)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lastResult.inv.line_items.map((li, i) => {
                              const l = li as Record<string, unknown>;
                              const empName = (l.employee_name ?? l.full_name ?? "—") as string;
                              const empId   = l.emp_id as string | undefined;
                              const days    = l.working_days ?? l.days_worked;
                              const basic   = l.basic != null ? Number(l.basic) : null;
                              const deduct  = l.deductions != null ? Number(l.deductions) : 0;
                              const net     = l.net_pay != null ? Number(l.net_pay) : null;
                              return (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                  <td className="px-3 py-2 font-medium">
                                    {empName}
                                    {empId && <span className="text-muted-foreground ml-1 text-[10px]">({empId})</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">{days != null ? String(days) : "—"}</td>
                                  <td className="px-3 py-2 text-right">{basic != null ? basic.toLocaleString("en-AE", {minimumFractionDigits:2}) : "—"}</td>
                                  <td className="px-3 py-2 text-right text-red-600">{deduct.toLocaleString("en-AE", {minimumFractionDigits:2})}</td>
                                  <td className="px-3 py-2 text-right font-bold text-green-700">
                                    {net != null ? net.toLocaleString("en-AE", {minimumFractionDigits:2}) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-muted/20">
                              <td colSpan={4} className="px-3 py-2 font-semibold text-right text-indigo-700">Total Net Pay</td>
                              <td className="px-3 py-2 text-right font-bold text-indigo-700">
                                {lastResult.inv.total_amount.toLocaleString("en-AE", {minimumFractionDigits:2})}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      /* Fallback: show from extracted records if invoice not yet generated */
                      (lastResult.ts.extracted_data?.records?.length ?? 0) > 0 && (
                        <div className="overflow-x-auto rounded-lg border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/40">
                                <th className="px-3 py-2 text-left font-semibold">Employee</th>
                                <th className="px-3 py-2 text-right font-semibold">Days</th>
                                <th className="px-3 py-2 text-right font-semibold">Basic (AED)</th>
                                <th className="px-3 py-2 text-right font-semibold">Deductions (AED)</th>
                                <th className="px-3 py-2 text-right font-semibold">Net Pay (AED)</th>
                                <th className="px-3 py-2 text-center font-semibold">Match</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lastResult.ts.extracted_data.records.map((r, i) => {
                                const rec = r as Record<string, unknown>;
                                const basicVal  = rec.basic_pay  != null ? Number(rec.basic_pay)  : null;
                                const deductVal = rec.deductions != null ? Number(rec.deductions) : null;
                                const netVal    = rec.net_pay    != null ? Number(rec.net_pay)    : null;
                                // Compute net from 500/hr if not available from VLM
                                const wd        = rec.working_days != null ? Number(rec.working_days) : null;
                                const computed  = wd != null ? wd * 8 * 500 : null;
                                return (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="px-3 py-2 font-medium">
                                      {((rec.matched_name ?? rec.employee_name ?? "—") as string)}
                                      {rec.matched_emp_id && <span className="text-muted-foreground ml-1 text-[10px]">({rec.matched_emp_id as string})</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right">{wd != null ? String(wd) : "—"}</td>
                                    <td className="px-3 py-2 text-right">{basicVal != null ? basicVal.toLocaleString() : (computed != null ? computed.toLocaleString() : "—")}</td>
                                    <td className="px-3 py-2 text-right text-red-600">{deductVal != null ? deductVal.toLocaleString() : "0"}</td>
                                    <td className="px-3 py-2 text-right font-bold text-green-700">{netVal != null ? netVal.toLocaleString() : (computed != null ? computed.toLocaleString() : "—")}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        rec.match_status === "matched" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                      }`}>{(rec.match_status ?? "unknown") as string}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    <button type="button" onClick={() => setLastResult(null)}
                      className="text-xs text-muted-foreground hover:text-foreground underline">
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={uploadMutation.isPending || !employee || (inputType === "handwriting" && !file)} className="min-w-40 gap-1.5">
                    <Brain className="h-3.5 w-3.5" />
                    {uploadMutation.isPending
                      ? (inputType === "handwriting" ? "Reading with Llama-4 Scout…" : "Processing with AI…")
                      : (inputType === "handwriting" ? "Submit & Extract with VLM" : "Submit Timesheet")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── My Timesheets ── */}
        <TabsContent value="timesheets">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-500" /> My Submitted Timesheets
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pay Period</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Touchless</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tsLoading ? Array.from({length:3}).map((_,i) => (
                      <TableRow key={i}>{Array.from({length:6}).map((_,j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}</TableRow>
                    )) : myTimesheets.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No timesheets found for your account.
                      </TableCell></TableRow>
                    ) : myTimesheets.map((ts) => (
                      <TableRow key={ts.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{ts.pay_period}</TableCell>
                        <TableCell className="capitalize">{ts.input_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${TS_STATUS[effectiveStatus(ts)] ?? "bg-muted text-muted-foreground"}`}>
                            {effectiveStatus(ts).replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${effectiveTouchless(ts) ? "bg-green-500/15 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}`}>
                            {effectiveTouchless(ts) ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{((ts.extracted_data?.overall_confidence ?? 0) * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(ts.uploaded_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── My Invoices ── */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-indigo-500" /> My Invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pay Period</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Validation</TableHead>
                      <TableHead>Dispatch</TableHead>
                      <TableHead>Generated</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invLoading ? Array.from({length:3}).map((_,i) => (
                      <TableRow key={i}>{Array.from({length:7}).map((_,j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}</TableRow>
                    )) : myInvoices.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No invoices generated yet. Submit a timesheet first.
                      </TableCell></TableRow>
                    ) : myInvoices.map((inv) => {
                      const myLine = inv.line_items?.find(
                        (li) => (li as Record<string,unknown>).emp_id === employee?.emp_id
                      );
                      const netPay = (myLine as Record<string,unknown> | undefined)?.net_pay as number | undefined;
                      return (
                        <TableRow key={inv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{inv.pay_period}</TableCell>
                          <TableCell>{inv.client_name}</TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {netPay != null ? fmtAED(netPay) : fmtAED(inv.total_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${INV_STATUS[inv.validation_status] ?? ""}`}>
                              {inv.validation_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${INV_STATUS[inv.dispatch_status] ?? ""}`}>
                              {inv.dispatch_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(inv.generated_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setSelectedInv(inv)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {employee?.emp_id && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-800"
                                title="Download Salary Slip (PDF)"
                                onClick={async () => {
                                  try {
                                    await api.downloadSalarySlip(inv.id, employee.emp_id);
                                    toast.success("Salary slip downloaded!");
                                  } catch (e) {
                                    toast.error("Failed to download salary slip");
                                  }
                                }}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Queries ── */}
        <TabsContent value="queries">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-500" /> Raise a Query
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleQuery} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Related Invoice (optional)</Label>
                      <Select value={queryInvId} onValueChange={setQueryInvId}>
                        <SelectTrigger><SelectValue placeholder="Select invoice…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {myInvoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.pay_period} — {fmtAED(inv.total_amount)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subject *</Label>
                      <Input value={querySubject} onChange={(e) => setQuerySubject(e.target.value)}
                        placeholder="e.g. OT hours discrepancy" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message *</Label>
                    <Textarea rows={4} value={queryMsg} onChange={(e) => setQueryMsg(e.target.value)}
                      placeholder="Describe your query in detail…" />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={queryMutation.isPending} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      {queryMutation.isPending ? "Submitting…" : "Submit Query"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Query History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {queries.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4">No queries submitted yet.</p>
                  ) : queries.map((q) => (
                    <div key={q.id} className="p-4 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{q.subject}</p>
                        <Badge variant="outline" className={`text-xs ${QUERY_STATUS[q.status] ?? ""}`}>{q.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{q.message}</p>
                      {q.replies?.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-indigo-200 space-y-1">
                          {q.replies.map((r, i) => (
                            <p key={i} className="text-xs"><span className="font-semibold">{r.author}:</span> {r.message}</p>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invoice detail dialog */}
      <Dialog open={!!selectedInv} onOpenChange={(o) => !o && setSelectedInv(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Detail — {selectedInv?.pay_period}</DialogTitle>
          </DialogHeader>
          {selectedInv && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-xl font-bold text-indigo-700">{fmtAED(selectedInv.total_amount)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`mt-1 text-xs ${INV_STATUS[selectedInv.validation_status] ?? ""}`}>
                    {selectedInv.validation_status}
                  </Badge>
                </div>
              </div>

              {/* Download my salary slip */}
              {employee?.emp_id && (
                <Button
                  className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={async () => {
                    try {
                      await api.downloadSalarySlip(selectedInv.id, employee.emp_id);
                      toast.success("Salary slip PDF downloaded!");
                    } catch {
                      toast.error("Failed to download salary slip.");
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> Download My Salary Slip (PDF)
                </Button>
              )}

              {selectedInv.line_items?.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Emp ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="text-right">Basic</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead className="text-center">Slip</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInv.line_items.map((li, i) => {
                        const l = li as Record<string, unknown>;
                        return (
                          <TableRow key={i} className={l.emp_id === employee?.emp_id ? "bg-indigo-50" : ""}>
                            <TableCell className="font-mono text-xs">{String(l.emp_id ?? "—")}</TableCell>
                            <TableCell>{String(l.employee_name ?? l.full_name ?? "—")}</TableCell>
                            <TableCell className="text-right">{String(l.working_days ?? l.days_worked ?? "—")}</TableCell>
                            <TableCell className="text-right">{l.basic != null ? `AED ${Number(l.basic).toLocaleString()}` : "—"}</TableCell>
                            <TableCell className="text-right text-red-600">{l.deductions != null ? `AED ${Number(l.deductions).toLocaleString()}` : "—"}</TableCell>
                            <TableCell className="text-right font-bold text-green-700">{l.net_pay != null ? `AED ${Number(l.net_pay).toLocaleString()}` : "—"}</TableCell>
                            <TableCell className="text-center">
                              {l.emp_id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600"
                                  title={`Download salary slip for ${l.emp_id}`}
                                  onClick={async () => {
                                    try {
                                      await api.downloadSalarySlip(selectedInv.id, String(l.emp_id));
                                      toast.success(`Salary slip for ${l.emp_id} downloaded!`);
                                    } catch {
                                      toast.error("Failed to download salary slip.");
                                    }
                                  }}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
