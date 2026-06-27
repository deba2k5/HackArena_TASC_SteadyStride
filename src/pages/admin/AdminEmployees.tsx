import { useEffect, useMemo, useState } from "react";
import { api, fmtDuration } from "@/lib/api";
import type { EmployeeProfile, WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Plus, BarChart3, Eye, FileText } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function AdminEmployees() {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = async () => {
    setProfiles(await api.listProfiles());
    setSessions(await api.listSessions());
  };
  useEffect(() => {
    reload();
    const interval = setInterval(() => {
      reload();
      setTick(t => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeEmails = new Set(sessions.filter((s) => !s.clockOut).map((s) => s.email));
  const departments = Array.from(new Set(profiles.map((p) => p.department).filter(Boolean)));

  const filtered = useMemo(() => profiles.filter((p) => {
    if (q && !`${p.fullName} ${p.email} ${p.employeeId}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (dept !== "all" && p.department !== dept) return false;
    if (type !== "all" && p.employeeType !== type) return false;
    if (status === "active" && !activeEmails.has(p.email)) return false;
    if (status === "inactive" && activeEmails.has(p.email)) return false;
    if (status === "deactivated" && p.active) return false;
    return true;
  }), [profiles, q, dept, type, status, activeEmails]);

  const toggleActive = async (p: EmployeeProfile) => {
    await api.upsertProfile({ ...p, active: !p.active });
    await api.log({ actor: "admin", action: p.active ? "employee.deactivate" : "employee.activate", target: p.email });
    reload();
  };

  const exportCsv = () => {
    const rows = [
      ["Employee ID", "Full name", "Email", "Department", "Type", "Active", "Last session"],
      ...filtered.map((p) => {
        const last = sessions.find((s) => s.email === p.email);
        return [p.employeeId, p.fullName, p.email, p.department, p.employeeType, p.active ? "yes" : "no", last?.date || ""];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "employees.csv" }).click();
  };

  const exportPdf = () => {
    const html = `
      <html><head><title>Employees</title>
      <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:12px}</style>
      </head><body><h1>Employee Report</h1>
      <table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Department</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>${filtered.map((p) => `<tr><td>${p.employeeId}</td><td>${p.fullName}</td><td>${p.email}</td><td>${p.department}</td><td>${p.employeeType}</td><td>${p.active ? "Active" : "Deactivated"}</td></tr>`).join("")}</tbody>
      </table><script>print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const getEmployeeStats = (email: string) => {
    const employeeSessions = sessions.filter(s => s.email === email);
    const now = Date.now();
    
    // Calculate stats
    let totalWorkMs = 0;
    let totalBreakMs = 0;
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const daySessions = employeeSessions.filter(s => s.date === dateKey);
      
      let dayWorkMs = 0;
      let dayBreakMs = 0;
      
      daySessions.forEach(s => {
        if (!s.clockOut) {
          dayWorkMs += now - new Date(s.clockIn).getTime();
          dayBreakMs += s.breaks.reduce((sum, b) => {
            const end = b.end ? new Date(b.end).getTime() : now;
            return sum + (end - new Date(b.start).getTime());
          }, 0);
        } else {
          dayWorkMs += s.totalWorkMs || 0;
          dayBreakMs += s.totalBreakMs || 0;
        }
      });
      
      totalWorkMs += dayWorkMs;
      totalBreakMs += dayBreakMs;
      
      last7Days.push({
        date: dateKey.slice(5),
        workHours: +(dayWorkMs / 3600000).toFixed(2),
        breakHours: +(dayBreakMs / 3600000).toFixed(2),
      });
    }
    
    return { employeeSessions, totalWorkMs, totalBreakMs, last7Days };
  };

  const exportEmployeePdf = (employee: EmployeeProfile) => {
    const stats = getEmployeeStats(employee.email);
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("Employee Report", 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Employee: ${employee.fullName}`, 14, 32);
    doc.text(`Email: ${employee.email}`, 14, 40);
    doc.text(`Department: ${employee.department}`, 14, 48);
    doc.text(`Type: ${employee.employeeType}`, 14, 56);
    doc.text(`Total Work Time: ${fmtDuration(stats.totalWorkMs)}`, 14, 64);
    doc.text(`Total Break Time: ${fmtDuration(stats.totalBreakMs)}`, 14, 72);
    
    // Work Sessions Table
    const tableData = stats.employeeSessions.slice().reverse().map(s => [
      s.date,
      s.clockIn ? new Date(s.clockIn).toLocaleTimeString() : "-",
      s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "-",
      s.workType || "N/A",
      s.status,
      s.totalWorkMs ? fmtDuration(s.totalWorkMs) : "-",
    ]);
    
    autoTable(doc, {
      startY: 80,
      head: [["Date", "Clock In", "Clock Out", "Work Type", "Status", "Duration"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
    });
    
    doc.save(`${employee.fullName.replace(/\s+/g, "_")}_report.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="page-header">
          <h1>Employees</h1>
          <p>{filtered.length} of {profiles.length} total employees</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} className="gap-2 flex-1 sm:flex-none"><FileSpreadsheet className="h-4 w-4" /><span className="hidden xs:inline">Export </span>CSV</Button>
          <Button variant="outline" onClick={exportPdf} className="gap-2 flex-1 sm:flex-none"><Download className="h-4 w-4" /><span className="hidden xs:inline">Export </span>PDF</Button>
          <AddEmployeeDialog onAdded={reload} />
        </div>
      </header>

      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input placeholder="Search name / email / ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="permanent">Permanent</SelectItem>
            <SelectItem value="contractual">Contractual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Working now</SelectItem>
            <SelectItem value="inactive">Off-clock</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const stats = getEmployeeStats(p.email);
                return (
                  <TableRow key={p.email}>
                    <TableCell className="font-mono text-xs">{p.employeeId}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p.fullName}</div>
                      <div className="md:hidden text-[11px] text-muted-foreground truncate max-w-[160px]">{p.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{p.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">{p.department}</TableCell>
                    <TableCell className="hidden lg:table-cell capitalize">{p.employeeType}</TableCell>
                    <TableCell>
                      {!p.active ? <Badge variant="secondary">Off</Badge>
                        : activeEmails.has(p.email) ? <Badge className="bg-success text-success-foreground">Working</Badge>
                        : <Badge variant="outline">Idle</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => {
                            setSelectedEmployee(p);
                            setReportDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => exportEmployeePdf(p)}
                        >
                          <Download className="h-4 w-4 mr-1" /> PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                          {p.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees match the filters</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Employee Report Dialog */}
      {selectedEmployee && (
        <EmployeeReportDialog
          employee={selectedEmployee}
          sessions={sessions}
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
        />
      )}
    </div>
  );
}

function EmployeeReportDialog({ 
  employee, 
  sessions, 
  open, 
  onOpenChange 
}: { 
  employee: EmployeeProfile; 
  sessions: WorkSession[]; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const calculateSessionDurations = (s: WorkSession) => {
    const clockIn = new Date(s.clockIn);
    const clockOut = s.clockOut ? new Date(s.clockOut) : null;
    const totalDayDurationMs = clockOut ? clockOut.getTime() - clockIn.getTime() : 0;
    const actualWorkMs = (s.totalWorkMs || 0) - (s.totalBreakMs || 0);
    return { totalDayDurationMs, actualWorkMs };
  };

  const stats = useMemo(() => {
    const employeeSessions = sessions.filter(s => s.email === employee.email);
    const now = Date.now();
    
    // Calculate stats
    let totalWorkMs = 0;
    let totalBreakMs = 0;
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const daySessions = employeeSessions.filter(s => s.date === dateKey);
      
      let dayWorkMs = 0;
      let dayBreakMs = 0;
      
      daySessions.forEach(s => {
        if (!s.clockOut) {
          dayWorkMs += now - new Date(s.clockIn).getTime();
          dayBreakMs += s.breaks.reduce((sum, b) => {
            const end = b.end ? new Date(b.end).getTime() : now;
            return sum + (end - new Date(b.start).getTime());
          }, 0);
        } else {
          dayWorkMs += s.totalWorkMs || 0;
          dayBreakMs += s.totalBreakMs || 0;
        }
      });
      
      totalWorkMs += dayWorkMs;
      totalBreakMs += dayBreakMs;
      
      last7Days.push({
        date: dateKey.slice(5),
        workHours: +((dayWorkMs - dayBreakMs) / 3600000).toFixed(2),
        breakHours: +(dayBreakMs / 3600000).toFixed(2),
      });
    }
    
    return { employeeSessions, totalWorkMs: totalWorkMs - totalBreakMs, totalBreakMs, last7Days };
  }, [sessions, employee]);

  const exportPdf = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Employee Report - " + employee.fullName, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Employee: ${employee.fullName}`, 14, 32);
    doc.text(`Email: ${employee.email}`, 14, 40);
    doc.text(`Department: ${employee.department}`, 14, 48);
    doc.text(`Type: ${employee.employeeType}`, 14, 56);
    doc.text(`Total Work Time: ${fmtDuration(stats.totalWorkMs)}`, 14, 64);
    doc.text(`Total Break Time: ${fmtDuration(stats.totalBreakMs)}`, 14, 72);
    
    // Work Sessions Table
    let totalActualWorkMs = 0;
    const tableData = stats.employeeSessions.slice().reverse().map(s => {
      const { totalDayDurationMs, actualWorkMs } = calculateSessionDurations(s);
      totalActualWorkMs += actualWorkMs;
      return [
        s.date,
        s.clockIn ? new Date(s.clockIn).toLocaleTimeString() : "—",
        s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "—",
        fmtDuration(totalDayDurationMs),
        fmtDuration(actualWorkMs),
        fmtDuration(s.totalBreakMs),
        s.workType || "N/A",
        s.status,
      ];
    });
    
    autoTable(doc, {
      startY: 80,
      head: [["Date", "Clock In", "Clock Out", "Total Day Duration", "Actual Work", "Breaks", "Work Type", "Status"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
    });

    // Add total work time
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(14);
    doc.text(`Total Actual Work Time: ${fmtDuration(totalActualWorkMs)}`, 14, finalY);
    
    doc.save(`${employee.fullName.replace(/\s+/g, "_")}_report.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{employee.fullName} - Full Report</span>
            <Button onClick={exportPdf} className="gap-2">
              <Download className="h-4 w-4" /> Export PDF
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Employee Info */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Full Name</div>
                <div className="font-medium">{employee.fullName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium">{employee.email}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Department</div>
                <div className="font-medium">{employee.department}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Type</div>
                <div className="font-medium capitalize">{employee.employeeType}</div>
              </div>
            </div>
          </Card>

          {/* Summary Stats */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Total Work Time</div>
                <div className="text-2xl font-bold">{fmtDuration(stats.totalWorkMs)}</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Total Break Time</div>
                <div className="text-2xl font-bold">{fmtDuration(stats.totalBreakMs)}</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Total Sessions</div>
                <div className="text-2xl font-bold">{stats.employeeSessions.length}</div>
              </div>
            </div>
          </Card>

          {/* Last 7 Days Charts */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Last 7 Days</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.last7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Line type="monotone" dataKey="workHours" stroke="hsl(var(--primary))" strokeWidth={2} name="Work Hours" />
                    <Line type="monotone" dataKey="breakHours" stroke="hsl(var(--warning))" strokeWidth={2} name="Break Hours" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.last7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="workHours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Work Hours" />
                    <Bar dataKey="breakHours" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Break Hours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          {/* Session History */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Session History</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Total Day Duration</TableHead>
                    <TableHead>Actual Work</TableHead>
                    <TableHead>Breaks</TableHead>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.employeeSessions.slice().reverse().map((s) => {
                    const { totalDayDurationMs, actualWorkMs } = calculateSessionDurations(s);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.date}</TableCell>
                        <TableCell>{s.clockIn ? new Date(s.clockIn).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{fmtDuration(totalDayDurationMs)}</TableCell>
                        <TableCell>{fmtDuration(actualWorkMs)}</TableCell>
                        <TableCell>{fmtDuration(s.totalBreakMs)}</TableCell>
                        <TableCell>{s.workType || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "approved" ? "outline" : s.status === "rejected" ? "destructive" : "secondary"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!stats.employeeSessions.length && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No sessions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddEmployeeDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeProfile>({
    employeeId: "", fullName: "", email: "", mobile: "", department: "", employeeType: "permanent", active: true, createdAt: new Date().toISOString(),
  });
  const save = async () => {
    if (!form.email || !form.fullName) return toast.error("Email & name required");
    await api.upsertProfile(form);
    await api.log({ actor: "admin", action: "employee.add", target: form.email });
    toast.success("Employee added. They can now sign in once you create their Firebase account.");
    setOpen(false);
    onAdded();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Employee ID"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
          <Field label="Full name"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Mobile"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.employeeType} onValueChange={(v) => setForm({ ...form, employeeType: v as EmployeeProfile["employeeType"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="contractual">Contractual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button onClick={save} className="w-full mt-2">Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
