import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Customer, Timesheet, ExtractedRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, RefreshCw, Eye, FileSpreadsheet } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  const m: Record<string, string> = {
    processed: "bg-green-500/15 text-green-600 border-green-200",
    pending_review: "bg-orange-500/15 text-orange-600 border-orange-200",
    ingested: "bg-blue-500/15 text-blue-600 border-blue-200",
    extracted: "bg-violet-500/15 text-violet-600 border-violet-200",
    failed: "bg-red-500/15 text-red-600 border-red-200",
  };
  return m[status] ?? "bg-muted text-muted-foreground";
}

const INPUT_TYPES = ["email", "excel", "handwriting", "pdf", "text"] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminTimesheets() {
  const qc = useQueryClient();

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => api.listCustomers(),
  });

  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ["timesheets"],
    queryFn: () => api.listTimesheets(),
    refetchInterval: 30_000,
  });

  // ── Upload form state ─────────────────────────────────────────────────────
  const [clientCode, setClientCode] = useState("");
  const [payPeriod, setPayPeriod] = useState("");
  const [inputType, setInputType] = useState<string>("excel");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // ── Detail dialog ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Timesheet | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (fd: FormData) => api.uploadTimesheet(fd),
    onSuccess: () => {
      toast.success("Timesheet uploaded and processing started.");
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      setClientCode("");
      setPayPeriod("");
      setTextContent("");
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientCode || !payPeriod) {
      toast.warning("Client and pay period are required.");
      return;
    }
    const fd = new FormData();
    fd.append("client_code", clientCode);
    fd.append("pay_period", payPeriod);
    fd.append("input_type", inputType);
    if (textContent) fd.append("text_content", textContent);
    if (file) fd.append("file", file);
    uploadMutation.mutate(fd);
  };

  const sorted = [...timesheets].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Timesheet Ingestion</h1>
          <p className="text-sm text-muted-foreground">Upload and track timesheet processing</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["timesheets"] })}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Upload form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-500" /> Upload New Timesheet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <Select value={clientCode} onValueChange={setClientCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.client_code} value={c.client_code}>
                      {c.client_name} ({c.client_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pay period */}
            <div className="space-y-1.5">
              <Label>Pay Period * (e.g. 2025-01)</Label>
              <Input
                value={payPeriod}
                onChange={(e) => setPayPeriod(e.target.value)}
                placeholder="YYYY-MM"
              />
            </div>

            {/* Input type */}
            <div className="space-y-1.5">
              <Label>Input Type</Label>
              <Select value={inputType} onValueChange={setInputType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File upload */}
            <div className="space-y-1.5">
              <Label>File (optional)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Text content */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Text / Email Content (optional)</Label>
              <Textarea
                rows={4}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste raw timesheet text or email body here…"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={uploadMutation.isPending} className="min-w-32">
                {uploadMutation.isPending ? "Uploading…" : "Upload & Process"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Timesheet list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            Recent Timesheets
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Input Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Touchless</TableHead>
                  <TableHead>Exceptions</TableHead>
                  <TableHead>Uploaded At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : sorted.map((ts) => (
                      <TableRow key={ts.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{ts.client_name}</TableCell>
                        <TableCell>{ts.pay_period}</TableCell>
                        <TableCell className="capitalize">{ts.input_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${statusColor(ts.status)}`}>
                            {ts.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              (ts.is_touchless || (ts.status === "processed" && (ts.overall_confidence ?? ts.extracted_data?.overall_confidence ?? 0) >= 0.90))
                                ? "text-xs bg-green-500/15 text-green-600 border-green-200"
                                : "text-xs bg-muted text-muted-foreground"
                            }
                          >
                            {(ts.is_touchless || (ts.status === "processed" && (ts.overall_confidence ?? ts.extracted_data?.overall_confidence ?? 0) >= 0.90)) ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {ts.exceptions.length === 0 ? (
                              <span className="text-muted-foreground">None</span>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-orange-500/15 text-orange-600 border-orange-200"
                              >
                                {ts.exceptions.length}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(ts.uploaded_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelected(ts)}
                          >
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

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Timesheet — {selected?.client_name} ({selected?.pay_period})
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge variant="outline" className={`${statusColor(selected.status)}`}>
                    {selected.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Touchless:</span>{" "}
                  <strong>{(selected.is_touchless || (selected.status === "processed" && (selected.overall_confidence ?? selected.extracted_data?.overall_confidence ?? 0) >= 0.90)) ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Confidence:</span>{" "}
                  <strong>
                    {((selected.extracted_data?.overall_confidence ?? 0) * 100).toFixed(1)}%
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Records:</span>{" "}
                  <strong>{selected.extracted_data?.records?.length ?? 0}</strong>
                </div>
              </div>

              {selected.exceptions.length > 0 && (
                <div className="rounded-lg bg-orange-500/10 border border-orange-200 p-3">
                  <p className="font-semibold text-orange-700 mb-2">Exceptions</p>
                  <ul className="space-y-1 list-disc list-inside text-orange-700">
                    {selected.exceptions.map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.extracted_data?.records?.length ?? 0) > 0 && (
                <div>
                  <p className="font-semibold mb-2">Extracted Records</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Days Worked</TableHead>
                          <TableHead>Overtime Hrs</TableHead>
                          <TableHead>Reimbursements</TableHead>
                          <TableHead>Confidence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.extracted_data.records.map((r: ExtractedRecord, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{r.emp_id ?? "—"}</TableCell>
                            <TableCell>{r.full_name}</TableCell>
                            <TableCell>{r.days_worked}</TableCell>
                            <TableCell>{r.overtime_hours ?? 0}</TableCell>
                            <TableCell>
                              {r.reimbursements != null
                                ? `AED ${Number(r.reimbursements).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {r.confidence != null
                                ? `${(r.confidence * 100).toFixed(0)}%`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
