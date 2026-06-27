import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, fmtAED } from "@/lib/api";
import type { Employee, Customer } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, Eye, Download, RefreshCw, User, Building2, Briefcase, DollarSign, Link2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

async function linkPortalEmail(empId: string, portalEmail: string): Promise<void> {
  const res = await fetch(`/api/employees/${encodeURIComponent(empId)}/link-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ portal_email: portalEmail }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export default function AdminEmployees() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmpId, setLinkEmpId] = useState("");
  const [linkEmail, setLinkEmail] = useState("");

  const linkMutation = useMutation({
    mutationFn: () => linkPortalEmail(linkEmpId, linkEmail.trim()),
    onSuccess: () => {
      toast.success(`✅ ${linkEmail} is now linked to ${linkEmpId}`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee-by-email"] });
      setLinkOpen(false);
      setLinkEmpId(""); setLinkEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => api.listCustomers(),
  });

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.listEmployees(),
  });

  const departments = [...new Set(employees.map((e) => e.department))].sort();

  const filtered = employees.filter((e) => {
    if (filterClient !== "all" && e.client_code !== filterClient) return false;
    if (filterDept !== "all" && e.department !== filterDept) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.emp_id.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.job_title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Duplicate names detection
  const nameCounts = employees.reduce<Record<string, number>>((acc, e) => {
    acc[e.full_name] = (acc[e.full_name] ?? 0) + 1;
    return acc;
  }, {});
  const isDuplicate = (name: string) => (nameCounts[name] ?? 0) > 1;

  const exportCSV = () => {
    const header = ["Emp ID","Full Name","Email","Client Code","Client Name","Job Title","Department","Nationality","Status","Basic","Housing","Transport","Food","Phone","Total CTC","IBAN"];
    const rows = filtered.map((e) => [e.emp_id, e.full_name, e.email, e.client_code, e.client_name, e.job_title, e.department, (e as Record<string,unknown>).nationality as string ?? "", e.status, e.basic, (e as Record<string,unknown>).housing ?? 0, (e as Record<string,unknown>).transport ?? 0, (e as Record<string,unknown>).food ?? 0, (e as Record<string,unknown>).phone ?? 0, e.total_ctc, (e as Record<string,unknown>).iban ?? ""]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "employees_export.csv";
    a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("TASC Employee Master — " + new Date().toLocaleDateString(), 14, 16);
    autoTable(doc, {
      head: [["Emp ID","Name","Email","Client","Job Title","Dept","Status","Total CTC"]],
      body: filtered.map((e) => [e.emp_id, e.full_name, e.email, `${e.client_code} - ${e.client_name}`, e.job_title, e.department, e.status, `AED ${e.total_ctc.toLocaleString()}`]),
      startY: 22,
      styles: { fontSize: 7 },
    });
    doc.save("employees_export.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Employee Master</h1>
          <p className="text-sm text-muted-foreground">200 employees across 10 clients — TASC database</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["employees"] })}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1.5" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><Download className="h-3.5 w-3.5 mr-1.5" />PDF</Button>
          <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-3.5 w-3.5" /> Link Portal Email
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: String(employees.length), color: "bg-indigo-500/10 text-indigo-700" },
          { label: "Active", value: String(employees.filter((e) => e.status === "Active").length), color: "bg-green-500/10 text-green-700" },
          { label: "Clients", value: String(customers.length), color: "bg-blue-500/10 text-blue-700" },
          { label: "Duplicate Names", value: String(Object.values(nameCounts).filter((v) => v > 1).length), color: "bg-orange-500/10 text-orange-700" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, ID, email, title…" className="pl-9 w-56" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.client_code} value={c.client_code}>
                {c.client_code} — {c.client_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(filterClient !== "all" || filterDept !== "all" || filterStatus !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterClient("all"); setFilterDept("all"); setFilterStatus("all"); setSearch(""); }}>
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} employees</span>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" /> Employee Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emp ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total CTC</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({length:8}).map((_,i) => (
                  <TableRow key={i}>{Array.from({length:9}).map((_,j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}</TableRow>
                )) : filtered.map((emp) => (
                  <TableRow key={emp.emp_id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-semibold">{emp.emp_id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{emp.full_name}</span>
                        {isDuplicate(emp.full_name) && (
                          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-700 border-orange-200 px-1 py-0">
                            dup
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{emp.client_code}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground hidden xl:inline">{emp.client_name}</span>
                    </TableCell>
                    <TableCell className="text-sm">{emp.job_title}</TableCell>
                    <TableCell className="text-sm">{emp.department}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{emp.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${emp.status === "Active" ? "bg-green-500/15 text-green-700 border-green-200" : "bg-red-500/15 text-red-700 border-red-200"}`}>
                        {emp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmtAED(emp.total_ctc)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(emp)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Link Portal Email Dialog */}
      <Dialog open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (!o) { setLinkEmpId(""); setLinkEmail(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-indigo-500" /> Link Portal Email to Employee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground text-xs">
              Map a Firebase login email (e.g. employee@gmail.com) to an employee record so they can access the portal and submit timesheets.
            </p>
            <div className="space-y-1.5">
              <Label>Employee ID *</Label>
              <Select value={linkEmpId} onValueChange={setLinkEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {employees
                    .filter((e) => !(e as Record<string,unknown>).is_demo_account)
                    .sort((a, b) => a.emp_id.localeCompare(b.emp_id))
                    .map((e) => (
                      <SelectItem key={e.emp_id + e.email} value={e.emp_id}>
                        {e.emp_id} — {e.full_name} ({e.client_code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Portal Login Email *</Label>
              <Input
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="e.g. employee@gmail.com"
              />
              <p className="text-[11px] text-muted-foreground">This must match exactly the email used to sign in via Firebase.</p>
            </div>
            {linkEmpId && (
              <div className="rounded-lg bg-indigo-500/5 border border-indigo-100 p-3 text-xs">
                {(() => {
                  const emp = employees.find((e) => e.emp_id === linkEmpId && !(e as Record<string,unknown>).is_demo_account);
                  return emp ? (
                    <><p><span className="text-muted-foreground">Name:</span> <strong>{emp.full_name}</strong></p>
                    <p><span className="text-muted-foreground">Client:</span> {emp.client_name}</p>
                    <p><span className="text-muted-foreground">Dept:</span> {emp.department} · {emp.job_title}</p></>
                  ) : null;
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button
              disabled={!linkEmpId || !linkEmail.trim() || linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
            >
              {linkMutation.isPending ? "Linking…" : "Link Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-500" />
              {selected?.full_name}
              {selected && isDuplicate(selected.full_name) && (
                <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 border-orange-200">
                  Duplicate Name
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Detail icon={User} label="Emp ID" value={selected.emp_id} mono />
                <Detail icon={Building2} label="Client" value={`${selected.client_code} — ${selected.client_name}`} />
                <Detail icon={Briefcase} label="Job Title" value={selected.job_title} />
                <Detail icon={Briefcase} label="Department" value={selected.department} />
                <Detail label="Email" value={selected.email} />
                <Detail label="Status" value={selected.status} />
                <Detail label="Nationality" value={(selected as Record<string,unknown>).nationality as string ?? "—"} />
                <Detail label="Date of Joining" value={(selected as Record<string,unknown>).date_of_joining as string ?? "—"} />
              </div>
              <div className="rounded-lg bg-indigo-500/5 border border-indigo-100 p-4">
                <p className="text-xs font-semibold text-indigo-700 mb-3 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Salary Breakdown (AED)
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ["Basic",     (selected as Record<string,unknown>).basic as number],
                    ["Housing",   (selected as Record<string,unknown>).housing as number],
                    ["Transport", (selected as Record<string,unknown>).transport as number],
                    ["Food",      (selected as Record<string,unknown>).food as number],
                    ["Phone",     (selected as Record<string,unknown>).phone as number],
                    ["Total CTC", selected.total_ctc],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="bg-white rounded-md p-2 text-center shadow-sm">
                      <p className="text-muted-foreground text-[10px]">{String(k)}</p>
                      <p className="font-bold text-indigo-700">{Number(v).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">IBAN</p>
                <p className="font-mono text-xs">{(selected as Record<string,unknown>).iban as string ?? "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ icon: Icon, label, value, mono }: { icon?: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`font-medium text-xs ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
