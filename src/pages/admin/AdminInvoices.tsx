import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fmtAED } from "@/lib/api";
import type { Invoice, Customer, LineItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  AlertTriangle,
  Download,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validationBadge(status: string) {
  const m: Record<string, string> = {
    passed: "bg-green-500/15 text-green-700 border-green-200",
    failed: "bg-red-500/15 text-red-700 border-red-200",
    pending: "bg-yellow-500/15 text-yellow-700 border-yellow-200",
  };
  return m[status] ?? "bg-muted text-muted-foreground border-border";
}

function dispatchBadge(status: string) {
  const m: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-700 border-slate-200",
    dispatched: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  };
  return m[status] ?? "bg-muted text-muted-foreground border-border";
}

function fmt(n: number | undefined) {
  if (n === undefined || n === null) return "AED 0.00";
  return fmtAED(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminInvoices() {
  const qc = useQueryClient();

  // Heal any stuck pending_review timesheets so their invoices appear immediately
  useEffect(() => {
    api.processPendingTimesheets()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["timesheets"] });
      })
      .catch(() => {/* silent */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => api.listCustomers(),
  });

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => api.listInvoices(),
    refetchInterval: 30_000,
  });

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // ── Detail dialog ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Invoice | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveInvoice(id),
    onSuccess: () => {
      toast.success("Invoice approved successfully.");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispatchMutation = useMutation({
    mutationFn: () => api.dispatchInvoices(),
    onSuccess: (res) => {
      toast.success(`${res.dispatched} invoice(s) dispatched.`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = invoices
    .filter((inv) => {
      if (filterClient !== "all" && inv.client_code !== filterClient) return false;
      if (filterStatus !== "all" && inv.validation_status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inv.client_name.toLowerCase().includes(q) ||
          inv.id.toLowerCase().includes(q) ||
          inv.pay_period.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );

  const totalInvoiced = filtered.reduce((s, i) => s + (i.total_amount || 0), 0);
  const passed = filtered.filter((i) => i.validation_status === "passed").length;
  const failed = filtered.filter((i) => i.validation_status === "failed").length;
  const readyToDispatch = invoices.filter(
    (i) => i.validation_status === "passed" && i.dispatch_status === "draft"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Review, approve, and dispatch AI-generated invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            disabled={readyToDispatch === 0 || dispatchMutation.isPending}
            onClick={() => dispatchMutation.mutate()}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {dispatchMutation.isPending
              ? "Dispatching…"
              : `Dispatch All (${readyToDispatch})`}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Invoices",
            value: String(filtered.length),
            color: "bg-indigo-500/10 text-indigo-700",
          },
          {
            label: "Total Value",
            value: fmt(totalInvoiced),
            color: "bg-blue-500/10 text-blue-700",
          },
          {
            label: "Passed Validation",
            value: String(passed),
            color: "bg-green-500/10 text-green-700",
          },
          {
            label: "Failed Validation",
            value: String(failed),
            color: "bg-red-500/10 text-red-700",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {s.label}
              </p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, period, ID…"
          className="w-56"
        />
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.client_code} value={c.client_code}>
                {c.client_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        {(filterClient !== "all" || filterStatus !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterClient("all");
              setFilterStatus("all");
              setSearch("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Invoice table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            Invoice List ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Dispatch</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : filtered.length === 0
                  ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center py-10 text-muted-foreground text-sm"
                        >
                          No invoices found matching the current filters.
                        </TableCell>
                      </TableRow>
                    )
                  : filtered.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{inv.client_name}</TableCell>
                        <TableCell>{inv.pay_period}</TableCell>
                        <TableCell>{inv.line_items?.length ?? 0}</TableCell>
                        <TableCell className="font-semibold">
                          {fmt(inv.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${validationBadge(inv.validation_status)}`}
                          >
                            {inv.validation_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${dispatchBadge(inv.dispatch_status)}`}
                          >
                            {inv.dispatch_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(inv.validation_errors?.length ?? 0) > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-xs bg-red-500/15 text-red-700 border-red-200"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {inv.validation_errors.length}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(inv.generated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.validation_status === "failed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700"
                                title="Approve override"
                                onClick={() => approveMutation.mutate(inv.id)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View details"
                              onClick={() => setSelected(inv)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-500" />
              Invoice — {selected?.client_name} ({selected?.pay_period})
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 text-sm">
              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-bold text-lg text-indigo-700 mt-0.5">
                    {fmt(selected.total_amount)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Currency</p>
                  <p className="font-semibold mt-0.5">{selected.currency}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Validation</p>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-xs ${validationBadge(selected.validation_status)}`}
                  >
                    {selected.validation_status}
                  </Badge>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Dispatch</p>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-xs ${dispatchBadge(selected.dispatch_status)}`}
                  >
                    {selected.dispatch_status}
                  </Badge>
                </div>
              </div>

              {/* Validation errors */}
              {(selected.validation_errors?.filter((e) => e.field !== "signature").length ?? 0) > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-200 p-4">
                  <p className="font-semibold text-red-700 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Validation Errors ({selected.validation_errors.filter((e) => e.field !== "signature").length})
                  </p>
                  <ul className="space-y-1.5">
                    {selected.validation_errors.filter((e) => e.field !== "signature").map((err, i) => (
                      <li key={i} className="text-red-700 text-xs flex gap-1.5">
                        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          <strong>{err.field || err.type || "Error"}:</strong>{" "}
                          {err.message}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {selected.validation_status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 border-green-400 text-green-700 hover:bg-green-50"
                      onClick={() => approveMutation.mutate(selected.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Override & Approve
                    </Button>
                  )}
                </div>
              )}

              {/* Line items table */}
              {(selected.line_items?.length ?? 0) > 0 && (
                <div>
                  <p className="font-semibold mb-2">
                    Line Items ({selected.line_items.length} employees)
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Days</TableHead>
                          <TableHead className="text-right">OT Hrs</TableHead>
                          <TableHead className="text-right">Basic</TableHead>
                          <TableHead className="text-right">Housing</TableHead>
                          <TableHead className="text-right">Transport</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">OT Amt</TableHead>
                          <TableHead className="text-right">Deductions</TableHead>
                          <TableHead className="text-right">Net Pay</TableHead>
                          <TableHead className="text-center">Slip</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.line_items.map((item: LineItem, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/20">
                            <TableCell className="font-mono text-xs">
                              {item.emp_id ?? "—"}
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.full_name ?? item.employee_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.days_worked ?? item.working_days ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.overtime_hours ?? item.ot_hours ?? 0}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.basic != null
                                ? `AED ${Number(item.basic).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.housing != null
                                ? `AED ${Number(item.housing).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.transport != null
                                ? `AED ${Number(item.transport).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {item.gross != null
                                ? `AED ${Number(item.gross).toLocaleString()}`
                                : item.gross_pay != null
                                ? `AED ${Number(item.gross_pay).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-blue-700">
                              {(item as Record<string, unknown>).ot_amount != null
                                ? `AED ${Number((item as Record<string, unknown>).ot_amount).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              {(item as Record<string, unknown>).deductions != null
                                ? `AED ${Number((item as Record<string, unknown>).deductions).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-700">
                              {(item as Record<string, unknown>).net_pay != null
                                ? `AED ${Number((item as Record<string, unknown>).net_pay).toLocaleString()}`
                                : item.gross_pay != null
                                ? `AED ${Number(item.gross_pay).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.emp_id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600"
                                  title={`Download salary slip for ${item.emp_id}`}
                                  onClick={async () => {
                                    try {
                                      await api.downloadSalarySlip(selected.id, String(item.emp_id));
                                      toast.success(`Salary slip for ${item.emp_id} downloaded!`);
                                    } catch {
                                      toast.error("Failed to download salary slip.");
                                    }
                                  }}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Total row */}
                  <div className="flex justify-end mt-3">
                    <div className="rounded-lg bg-indigo-500/10 border border-indigo-200 px-5 py-3 text-right">
                      <p className="text-xs text-muted-foreground">Grand Total</p>
                      <p className="text-xl font-bold text-indigo-700">
                        {fmt(selected.total_amount)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {selected.validation_status === "failed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-green-400 text-green-700 hover:bg-green-50"
                    onClick={() => approveMutation.mutate(selected.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Override & Approve
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-indigo-400 text-indigo-700 hover:bg-indigo-50 gap-1.5"
                  onClick={async () => {
                    const items = selected.line_items ?? [];
                    let ok = 0;
                    for (const li of items) {
                      const empId = (li as Record<string, unknown>).emp_id;
                      if (!empId) continue;
                      try {
                        await api.downloadSalarySlip(selected.id, String(empId));
                        ok++;
                      } catch { /* skip */ }
                    }
                    toast.success(`Downloaded ${ok} salary slip(s)`);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Download All Salary Slips
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
