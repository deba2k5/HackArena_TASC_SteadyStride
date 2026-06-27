import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Timesheet } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, XCircle, Eye, RefreshCw,
  User, Building2, Brain, Cpu, FileText, Clock,
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────────
const CONF_COLOR = (c: number) =>
  c >= 0.85 ? "text-green-700" : c >= 0.60 ? "text-orange-600" : "text-red-600";

const MATCH_BADGE: Record<string, string> = {
  matched:   "bg-green-500/15 text-green-700 border-green-200",
  ambiguous: "bg-orange-500/15 text-orange-700 border-orange-200",
  unmatched: "bg-red-500/15 text-red-700 border-red-200",
};

interface EditableRecord {
  matched_emp_id: string;
  working_days: number;
  ot_hours: number;
  project_code: string;
  [key: string]: unknown;
}

export default function AdminPendingReports() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ["timesheets-exceptions"],
    queryFn: () => api.listTimesheets(),
    refetchInterval: 15_000,
    select: (data) => data.filter((t) => t.status === "pending_review"),
  });

  const [selected, setSelected] = useState<Timesheet | null>(null);
  const [editRecords, setEditRecords] = useState<EditableRecord[]>([]);
  const [comment, setComment] = useState("");

  const openDialog = (ts: Timesheet) => {
    setSelected(ts);
    setComment("");
    const records = ts.extracted_data?.records ?? [];
    setEditRecords(
      records.map((r) => ({
        ...r,
        matched_emp_id: (r.matched_emp_id as string) ?? (r.emp_id as string) ?? "",
        working_days:   Number((r as Record<string, unknown>).working_days ?? 24),
        ot_hours:       Number((r as Record<string, unknown>).ot_hours ?? 0),
        project_code:   String((r as Record<string, unknown>).project_code ?? ""),
      }))
    );
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, records }: { id: string; records: EditableRecord[] }) =>
      api.approveTimesheet(id, records),
    onSuccess: () => {
      toast.success("Timesheet approved — invoice generation triggered.");
      qc.invalidateQueries({ queryKey: ["timesheets-exceptions"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reject = update status via a direct POST to a reject endpoint
  const rejectMutation = useMutation({
    mutationFn: async ({ id, comment: c }: { id: string; comment: string }) => {
      const res = await fetch(`/api/timesheets/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": user?.email ?? "" },
        body: JSON.stringify({ comment: c }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast.success("Timesheet rejected.");
      qc.invalidateQueries({ queryKey: ["timesheets-exceptions"] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRec = (idx: number, field: string, val: string | number) =>
    setEditRecords((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Exception Queue</h1>
          <p className="text-sm text-muted-foreground">
            Timesheets that need human review — low confidence, ambiguous employees, or rule violations.
          </p>
        </div>
        <Button variant="outline" size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["timesheets-exceptions"] })}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Pipeline legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { icon: Cpu,       label: "OpenCV + Tesseract OCR",    color: "text-blue-600" },
          { icon: Brain,     label: "Groq Llama-4 Scout VLM",    color: "text-violet-600" },
          { icon: FileText,  label: "BERT QA Extraction",        color: "text-indigo-600" },
          { icon: User,      label: "Identity Resolution",       color: "text-emerald-600" },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className={`flex items-center gap-1.5 ${color} bg-muted/50 px-2 py-1 rounded-md`}>
            <Icon className="h-3 w-3" /> {label}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!isLoading && timesheets.length === 0 && (
        <Card className="p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-lg">All clear</p>
          <p className="text-sm text-muted-foreground mt-1">No timesheets pending review.</p>
        </Card>
      )}

      {/* Exception list */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Input Type</TableHead>
                  <TableHead>AI Pipeline</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Exceptions</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : timesheets.map((ts) => {
                      const conf = ts.extracted_data?.overall_confidence ?? 0;
                      const pipeline = (ts.extracted_data?.meta as Record<string, unknown>)?.pipeline as string ?? "";
                      const records = ts.extracted_data?.records ?? [];
                      return (
                        <TableRow key={ts.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{ts.client_name}</TableCell>
                          <TableCell>{ts.pay_period}</TableCell>
                          <TableCell className="capitalize">{ts.input_type}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pipeline.split("+").map((p) => (
                                <span key={p} className="text-[10px] bg-indigo-500/10 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-semibold ${CONF_COLOR(conf)}`}>
                              {(conf * 100).toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell>{records.length}</TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {ts.exceptions.slice(0, 2).map((ex, i) => (
                                <div key={i} className="flex items-center gap-1 text-xs text-orange-700">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[180px]">{ex}</span>
                                </div>
                              ))}
                              {ts.exceptions.length > 2 && (
                                <span className="text-xs text-muted-foreground">+{ts.exceptions.length - 2} more</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(ts.uploaded_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="gap-1.5"
                              onClick={() => openDialog(ts)}>
                              <Eye className="h-3.5 w-3.5" /> Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Review — {selected?.client_name} · {selected?.pay_period}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 text-sm">
              {/* AI pipeline badges */}
              <div className="rounded-lg bg-muted/40 p-3 flex flex-wrap gap-2">
                {[
                  ["Pipeline", (selected.extracted_data?.meta as Record<string,unknown>)?.pipeline as string ?? "—"],
                  ["VLM Used", (selected.extracted_data?.meta as Record<string,unknown>)?.vlm_used ? "✅ Groq Llama-4" : "❌ No"],
                  ["BERT Used", (selected.extracted_data?.meta as Record<string,unknown>)?.bert_used ? "✅ RoBERTa QA" : "❌ No"],
                  ["Confidence", `${((selected.extracted_data?.overall_confidence ?? 0) * 100).toFixed(0)}%`],
                  ["Handwritten", (selected.extracted_data?.meta as Record<string,unknown>)?.is_handwritten ? "Yes" : "No"],
                ].map(([k, v]) => (
                  <div key={k as string} className="text-xs bg-white border rounded-md px-2 py-1">
                    <span className="text-muted-foreground">{k as string}: </span>
                    <span className="font-medium">{v as string}</span>
                  </div>
                ))}
              </div>

              {/* OCR raw text preview */}
              {(selected.extracted_data?.meta as Record<string,unknown>)?.raw_text_extracted && (
                <div>
                  <p className="font-semibold mb-1 flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-blue-500" /> OCR Extracted Text (preview)
                  </p>
                  <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-28 whitespace-pre-wrap">
                    {String((selected.extracted_data?.meta as Record<string,unknown>)?.raw_text_extracted ?? "").slice(0, 500)}
                  </pre>
                </div>
              )}

              {/* Exceptions */}
              {selected.exceptions.length > 0 && (
                <div className="rounded-lg bg-orange-500/10 border border-orange-200 p-3">
                  <p className="font-semibold text-orange-700 mb-2">Why this needs review</p>
                  <ul className="space-y-1">
                    {selected.exceptions.map((ex, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-orange-700 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Editable records */}
              <div>
                <p className="font-semibold mb-2 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-indigo-500" /> Extracted Records — Correct & Approve
                </p>
                <div className="space-y-4">
                  {editRecords.map((rec, idx) => (
                    <div key={idx} className="rounded-lg border p-4 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{String(rec.matched_name ?? rec.employee_name ?? "Unknown")}</span>
                          <Badge variant="outline" className={`text-xs ${MATCH_BADGE[String(rec.match_status ?? "unmatched")]}`}>
                            {String(rec.match_status ?? "unmatched")}
                          </Badge>
                        </div>
                        <span className={`text-xs font-semibold ${CONF_COLOR(Number(rec.confidence ?? 0))}`}>
                          {(Number(rec.confidence ?? 0) * 100).toFixed(0)}% confidence
                        </span>
                      </div>

                      {/* Warning */}
                      {rec.warning && (
                        <p className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded">
                          ⚠️ {String(rec.warning)}
                        </p>
                      )}

                      {/* Ambiguous candidates */}
                      {Array.isArray(rec.match_candidates) && (rec.match_candidates as unknown[]).length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs">Select correct employee:</Label>
                          <Select value={rec.matched_emp_id} onValueChange={(v) => updateRec(idx, "matched_emp_id", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose employee…" /></SelectTrigger>
                            <SelectContent>
                              {(rec.match_candidates as Array<{ emp_id: string; name: string; client_name: string }>).map((c) => (
                                <SelectItem key={c.emp_id} value={c.emp_id} className="text-xs">
                                  {c.emp_id} — {c.name} ({c.client_name})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Editable fields */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Emp ID</Label>
                          <Input className="h-8 text-xs font-mono"
                            value={rec.matched_emp_id}
                            onChange={(e) => updateRec(idx, "matched_emp_id", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Working Days</Label>
                          <Input className="h-8 text-xs" type="number" min={1} max={31}
                            value={rec.working_days}
                            onChange={(e) => updateRec(idx, "working_days", Number(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">OT Hours</Label>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.5}
                            value={rec.ot_hours}
                            onChange={(e) => updateRec(idx, "ot_hours", Number(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Project</Label>
                          <Select value={rec.project_code || "none"} onValueChange={(v) => updateRec(idx, "project_code", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="P1">P1 — Alpha (max AED 24,000 / 6 days)</SelectItem>
                              <SelectItem value="P2">P2 — Beta (max AED 20,000 / 5 days)</SelectItem>
                              <SelectItem value="P3">P3 — Gamma (max AED 16,000 / 4 days)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin comment */}
              <div className="space-y-1.5">
                <Label>Admin Comment (optional)</Label>
                <Textarea rows={2} placeholder="Notes about this approval or correction…"
                  value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t">
                <Button variant="destructive" size="sm" className="gap-1.5"
                  disabled={rejectMutation.isPending}
                  onClick={() => selected && rejectMutation.mutate({ id: selected.id, comment })}>
                  <XCircle className="h-3.5 w-3.5" />
                  {rejectMutation.isPending ? "Rejecting…" : "Reject"}
                </Button>
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                  disabled={approveMutation.isPending}
                  onClick={() => selected && approveMutation.mutate({ id: selected.id, records: editRecords })}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {approveMutation.isPending ? "Approving…" : "Approve & Generate Invoice"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
