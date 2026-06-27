import { useEffect, useState } from "react";
import { tiaApi, Timesheet, ClientQuery, TimesheetRecord } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Check, Edit, Sparkles, MessageSquare, AlertTriangle, User, Calendar, Plus, Trash } from "lucide-react";

export default function AdminPendingReports() {
  const { user } = useAuth();
  const [exceptions, setExceptions] = useState<Timesheet[]>([]);
  const [queries, setQueries] = useState<ClientQuery[]>([]);
  const [activeTab, setActiveTab] = useState("exceptions");

  // HITL Resolve Modal State
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedTs, setSelectedTs] = useState<Timesheet | null>(null);
  const [editableRecords, setEditableRecords] = useState<TimesheetRecord[]>([]);

  // Query Reply Modal State
  const [replyOpen, setReplyOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<ClientQuery | null>(null);
  const [replyText, setReplyText] = useState("");

  const reloadData = async () => {
    try {
      const allTs = await tiaApi.getTimesheets();
      // Exceptions are timesheets that are pending review
      setExceptions(allTs.filter((t) => t.status === "pending_review"));

      const allQueries = await tiaApi.getQueries();
      setQueries(allQueries);
    } catch (err) {
      console.error("Failed to reload FinOps data", err);
    }
  };

  useEffect(() => {
    reloadData();
    const t = setInterval(reloadData, 6000);
    return () => clearInterval(t);
  }, []);

  const openResolveModal = (ts: Timesheet) => {
    setSelectedTs(ts);
    // Clone records to local state
    setEditableRecords(JSON.parse(JSON.stringify(ts.extracted_data.records)));
    setResolveOpen(true);
  };

  const handleRecordChange = (index: number, field: keyof TimesheetRecord, value: any) => {
    setEditableRecords((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleCandidateSelect = (recordIdx: number, empId: string, name: string) => {
    setEditableRecords((prev) => {
      const updated = [...prev];
      updated[recordIdx] = {
        ...updated[recordIdx],
        matched_emp_id: empId,
        matched_name: name,
        match_status: "matched",
        confidence: 1.0,
        warning: undefined,
      };
      return updated;
    });
    toast.success(`Matched to ${name} (${empId})`);
  };

  const handleReleaseToPayroll = async () => {
    if (!selectedTs) return;
    
    // Check if any record is still ambiguous or unmatched
    const hasUnresolved = editableRecords.some((r) => r.match_status !== "matched");
    if (hasUnresolved) {
      return toast.error("Please match all employee names to master records before releasing.");
    }

    try {
      await tiaApi.approveTimesheet(selectedTs.id, editableRecords);
      toast.success("Timesheet released to ERP. Invoice generated touchlessly!");
      setResolveOpen(false);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to release timesheet.");
    }
  };

  const openReplyModal = (q: ClientQuery) => {
    setSelectedQuery(q);
    setReplyText("");
    setReplyOpen(true);
  };

  const handleSendReply = async () => {
    if (!selectedQuery || !replyText.trim()) return;
    try {
      await tiaApi.resolveQuery(selectedQuery.id, replyText.trim());
      toast.success("Query resolved and reply sent!");
      setReplyOpen(false);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reply to query.");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">FinOps Operations Console</h1>
        <p className="text-sm text-muted-foreground">Manage AI extraction exceptions and customer queries.</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="exceptions" className="text-xs">
            Exceptions Queue ({exceptions.length})
          </TabsTrigger>
          <TabsTrigger value="queries" className="text-xs">
            Client Queries ({queries.filter((q) => q.status === "open").length} open)
          </TabsTrigger>
        </TabsList>

        {/* Exceptions Tab */}
        <TabsContent value="exceptions" className="space-y-4">
          {exceptions.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground text-sm">
              🎉 Exception Queue is empty. All ingested timesheets were processed touchlessly!
            </Card>
          ) : (
            <div className="space-y-4">
              {exceptions.map((ts) => (
                <Card key={ts.id} className="p-5 border-l-4 border-l-warning space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {ts.client_name} ({ts.client_code})
                        <Badge variant="outline">{ts.pay_period}</Badge>
                        <Badge className="bg-warning text-warning-foreground capitalize">{ts.input_type}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-1">
                        Upload ID: {ts.id.slice(0, 8)}... · Ingested {new Date(ts.uploaded_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div className="text-center">
                        <div className="text-muted-foreground text-[10px] uppercase">AI Confidence</div>
                        <div className="text-warning text-sm font-bold">
                          {(ts.extracted_data.overall_confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openResolveModal(ts)}
                        className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1.5"
                      >
                        <Edit className="h-3.5 w-3.5" /> Resolve & Release
                      </Button>
                    </div>
                  </div>

                  {/* Exception Alerts */}
                  <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-xs text-warning space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Extraction Warnings Raised:
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 font-medium text-amber-700 dark:text-amber-500">
                      {ts.exceptions.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Queries Tab */}
        <TabsContent value="queries" className="space-y-4">
          {queries.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground text-sm">
              All client queries resolved. Nice work!
            </Card>
          ) : (
            <div className="space-y-4">
              {queries.map((q) => (
                <Card key={q.id} className={`p-5 border-l-4 shadow-sm ${q.status === "open" ? "border-l-primary" : "border-l-success"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 text-xs mb-3">
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        {q.client_name} ({q.client_code})
                        {q.status === "open" ? (
                          <Badge className="bg-primary text-primary-foreground">Open</Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">Resolved</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        Invoice Reference: {q.invoice_id.slice(0, 8).toUpperCase()}... · Submitted {new Date(q.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {q.status === "open" && (
                      <Button
                        size="sm"
                        onClick={() => openReplyModal(q)}
                        className="bg-primary text-primary-foreground gap-1.5 h-8 text-xs"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Respond
                      </Button>
                    )}
                  </div>

                  <div className="text-xs space-y-2">
                    <div className="bg-secondary/30 p-3 rounded-md border">
                      <div className="font-semibold mb-1">Subject: {q.subject}</div>
                      <p className="text-muted-foreground italic">"{q.message}"</p>
                    </div>

                    {q.replies.map((r, idx) => (
                      <div key={idx} className="bg-success/5 border border-success/20 p-3 rounded-md pl-6 relative">
                        <div className="font-semibold text-success mb-1">
                          Reply from {r.sender} · {new Date(r.at).toLocaleDateString()}
                        </div>
                        <p className="text-muted-foreground">"{r.message}"</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* HITL Resolving Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              Human-in-the-Loop timesheet Validation
            </DialogTitle>
          </DialogHeader>

          {selectedTs && (
            <div className="grid md:grid-cols-2 gap-6 text-xs mt-2">
              {/* Left Column: Raw Input View */}
              <div className="space-y-3">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  Raw Input Timesheet Source
                </div>
                
                <div className="border rounded-lg p-4 bg-muted/20 font-mono text-[11px] whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                  {selectedTs.extracted_data.meta.raw_text_extracted || "[Binary file contents parsed via OCR]"}
                </div>

                <div className="rounded-md border p-3 bg-secondary/10 space-y-1">
                  <div className="font-semibold text-muted-foreground text-[10px] uppercase">Metadata Captured</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Signature Present: <span className="font-bold">{selectedTs.extracted_data.meta.has_signature ? "Yes" : "No"}</span></div>
                    <div>Stamp Present: <span className="font-bold">{selectedTs.extracted_data.meta.has_stamp ? "Yes" : "No"}</span></div>
                    <div>Handwritten Form: <span className="font-bold">{selectedTs.extracted_data.meta.is_handwritten ? "Yes" : "No"}</span></div>
                    <div>Original Filename: <span className="font-bold truncate block">{selectedTs.file_name || "Text pasted"}</span></div>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Extraction & MATCHING Resolves */}
              <div className="space-y-4">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  AI Extracted Records & DB Matching
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {editableRecords.map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border space-y-3 bg-card shadow-sm ${
                        rec.match_status !== "matched" ? "border-warning bg-warning/5" : "border-muted"
                      }`}
                    >
                      {/* Employee Info Header */}
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <div className="font-semibold text-[13px]">
                          Record #{idx + 1}: {rec.employee_name || "Unknown"}
                        </div>
                        {rec.match_status === "matched" ? (
                          <Badge className="bg-success text-success-foreground">Matched</Badge>
                        ) : rec.match_status === "ambiguous" ? (
                          <Badge className="bg-warning text-warning-foreground">Ambiguity Warning</Badge>
                        ) : (
                          <Badge className="bg-destructive text-destructive-foreground">Not Found</Badge>
                        )}
                      </div>

                      {/* Ambiguity Choices Cards */}
                      {rec.match_status === "ambiguous" && rec.match_candidates && (
                        <div className="space-y-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                          <div className="font-bold text-[10px] text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Select correct candidate from Master DB:
                          </div>
                          <div className="grid gap-1.5">
                            {rec.match_candidates.map((cand) => (
                              <button
                                type="button"
                                key={cand.emp_id}
                                onClick={() => handleCandidateSelect(idx, cand.emp_id, cand.name)}
                                className="flex items-center justify-between p-2 rounded border bg-card hover:bg-primary/5 hover:border-primary/50 text-[10px] transition-all text-left"
                              >
                                <div>
                                  <span className="font-bold text-foreground">{cand.name}</span>
                                  <span className="text-muted-foreground block text-[9px]">{cand.client_name}</span>
                                </div>
                                <span className="font-mono font-bold text-primary">{cand.emp_id}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Manual Form Editing */}
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Emp ID</label>
                          <Input
                            placeholder="Enter EMP ID..."
                            value={rec.matched_emp_id || rec.emp_id || ""}
                            onChange={(e) => handleRecordChange(idx, "matched_emp_id", e.target.value.toUpperCase())}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Days Worked</label>
                          <Input
                            type="number"
                            placeholder="Working days..."
                            value={rec.working_days || ""}
                            onChange={(e) => handleRecordChange(idx, "working_days", parseInt(e.target.value))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Overtime Hours</label>
                          <Input
                            type="number"
                            step="0.5"
                            placeholder="OT Hours..."
                            value={rec.ot_hours ?? ""}
                            onChange={(e) => handleRecordChange(idx, "ot_hours", parseFloat(e.target.value))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Leave Taken (Days)</label>
                          <Input
                            type="number"
                            placeholder="Leave days..."
                            value={rec.leave_taken_days ?? ""}
                            onChange={(e) => handleRecordChange(idx, "leave_taken_days", parseInt(e.target.value))}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleReleaseToPayroll} className="bg-primary text-primary-foreground">
              Approve & Release to Payroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Query Response Dialog */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Client query</DialogTitle>
          </DialogHeader>
          
          {selectedQuery && (
            <div className="space-y-4 text-xs">
              <div className="bg-secondary/40 p-3 rounded border">
                <div className="font-bold mb-1">Query Subject: {selectedQuery.subject}</div>
                <div className="text-muted-foreground italic">"{selectedQuery.message}"</div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Response Message</label>
                <Textarea
                  placeholder="Type your response to the client..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={5}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyOpen(false)}>Cancel</Button>
            <Button onClick={handleSendReply} className="bg-primary text-primary-foreground">
              Send Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
