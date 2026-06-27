import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tiaApi, Timesheet, Invoice, CustomerConfig } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Sparkles, Send, CheckCircle, AlertTriangle, HelpCircle, Eye, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { toast } from "sonner";

export default function EmployeeDashboard() {
  const { demoClientCode } = useAuth();
  const [client, setClient] = useState<CustomerConfig | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  // Submission Form State
  const [inputType, setInputType] = useState<"email" | "excel" | "handwriting" | "pdf">("email");
  const [textRaw, setTextRaw] = useState("");
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [payPeriod, setPayPeriod] = useState("June 2026");
  const [submitting, setSubmitting] = useState(false);

  // Invoices & Query Dialog State
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryInvoiceId, setQueryInvoiceId] = useState("");
  const [querySubject, setQuerySubject] = useState("");
  const [queryMsg, setQueryMsg] = useState("");
  const [sendingQuery, setSendingQuery] = useState(false);

  const loadData = async () => {
    try {
      const customers = await tiaApi.getCustomers();
      const currentClient = customers.find((c) => c.client_code === demoClientCode) || null;
      setClient(currentClient);

      const tsList = await tiaApi.getTimesheets(demoClientCode);
      setTimesheets(tsList);

      const invList = await tiaApi.getInvoices(demoClientCode);
      setInvoices(invList);
    } catch (err) {
      console.error("Failed to load client portal data", err);
    }
  };

  useEffect(() => {
    loadData();
    // Poll updates every 6 seconds
    const t = setInterval(loadData, 6000);
    return () => clearInterval(t);
  }, [demoClientCode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileToUpload(e.target.files[0]);
    }
  };

  const handleTimesheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputType === "email" && !textRaw.trim()) {
      return toast.error("Please paste the email content.");
    }
    if (inputType !== "email" && !fileToUpload) {
      return toast.error("Please select a file to upload.");
    }

    setSubmitting(true);
    toast.info("Ingesting timesheet into TIA AI Pipeline...");

    try {
      const formData = new FormData();
      formData.append("client_code", demoClientCode);
      formData.append("pay_period", payPeriod);
      formData.append("input_type", inputType);
      
      if (inputType === "email") {
        formData.append("text_content", textRaw);
      } else if (fileToUpload) {
        formData.append("file", fileToUpload);
        // Add text fallback for images or scanned inputs if needed
        formData.append("text_content", `[Uploaded file: ${fileToUpload.name}]`);
      }

      const res = await tiaApi.uploadTimesheet(formData);
      
      if (res.is_touchless) {
        toast.success("Timesheet processed touchlessly! Invoice generated.");
      } else {
        toast.warning("Timesheet processed with exceptions. Routed to FinOps HITL Queue.");
      }

      // Reset form
      setTextRaw("");
      setFileToUpload(null);
      // Reset input element
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process timesheet.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveInvoice = async (invId: string) => {
    try {
      await tiaApi.approveInvoice(invId);
      toast.success("Invoice approved! Status updated.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve invoice.");
    }
  };

  const handleRaiseQuerySubmit = async () => {
    if (!querySubject.trim() || !queryMsg.trim()) {
      return toast.error("Please fill in all query fields.");
    }
    setSendingQuery(true);
    try {
      await tiaApi.createQuery({
        client_code: demoClientCode,
        client_name: client?.client_name || demoClientCode,
        invoice_id: queryInvoiceId,
        subject: querySubject.trim(),
        message: queryMsg.trim(),
      });
      toast.success("Query submitted to FinOps team!");
      setQueryOpen(false);
      setQuerySubject("");
      setQueryMsg("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit query.");
    } finally {
      setSendingQuery(false);
    }
  };

  const openQueryDialog = (invId: string) => {
    setQueryInvoiceId(invId);
    setQueryOpen(true);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Welcome, {client?.client_name || "Client Portal"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Onboarded Client Portal ({demoClientCode}) · Industry: {client?.industry || "Services"}
        </p>
      </header>

      {/* Grid: Timesheet Submitter and Invoices */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left 2 Cols: Submitter */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 border-primary/10 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">Submit Timesheet</h3>
            </div>
            
            <form onSubmit={handleTimesheetSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Input Format / Channel</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setInputType("email"); setFileToUpload(null); }}
                    className={`py-2 rounded-md border text-center font-medium transition-all ${inputType === "email" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                  >
                    Email body (Text)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputType("excel")}
                    className={`py-2 rounded-md border text-center font-medium transition-all ${inputType === "excel" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputType("handwriting")}
                    className={`py-2 rounded-md border text-center font-medium transition-all ${inputType === "handwriting" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                  >
                    Handwritten Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputType("pdf")}
                    className={`py-2 rounded-md border text-center font-medium transition-all ${inputType === "pdf" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                  >
                    PDF Invoice / Scan
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Billing Period</label>
                <Select value={payPeriod} onValueChange={setPayPeriod}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="June 2026" className="text-xs">June 2026 (Active Period)</SelectItem>
                    <SelectItem value="May 2026" className="text-xs">May 2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {inputType === "email" ? (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Paste Email Content</label>
                  <Textarea
                    placeholder="E.g. Please process payout for Carlos Smith working at Emirates Steel..."
                    value={textRaw}
                    onChange={(e) => setTextRaw(e.target.value)}
                    rows={7}
                    className="text-xs"
                  />
                </div>
              ) : (
                <div className="border border-dashed border-primary/20 rounded-lg p-6 text-center space-y-2 bg-secondary/20">
                  <Upload className="h-8 w-8 text-primary mx-auto animate-bounce" />
                  <div className="text-xs font-semibold">
                    {fileToUpload ? fileToUpload.name : "Select timesheet file"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Upload formatted spreadsheet or handwritten scan form.
                  </div>
                  <Input
                    id="file-input"
                    type="file"
                    accept={inputType === "excel" ? ".xlsx" : "image/*,.pdf"}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    Browse Files
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-primary shadow-elevated gap-1.5 h-9"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Processing through TIA Pipeline..." : "Submit to TIA"}
              </Button>
            </form>
          </Card>
        </div>

        {/* Right 3 Cols: Timesheets Ingest Status */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="p-5 border-primary/10 shadow-md">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-1.5">
              <FileText className="h-5 w-5 text-primary" /> Ingested Timesheets Status
            </h3>
            
            <div className="overflow-x-auto">
              {timesheets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No timesheets submitted yet for this client.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-muted-foreground font-semibold">
                      <th className="pb-2">Period</th>
                      <th className="pb-2">Format</th>
                      <th className="pb-2 text-center">AI Confidence</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {timesheets.map((ts) => (
                      <tr key={ts.id} className="hover:bg-muted/30">
                        <td className="py-2.5 font-medium">{ts.pay_period}</td>
                        <td className="py-2.5 capitalize">{ts.input_type}</td>
                        <td className="py-2.5 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`font-semibold ${ts.extracted_data.overall_confidence > 0.85 ? "text-success" : "text-warning"}`}>
                              {(ts.extracted_data.overall_confidence * 100).toFixed(0)}%
                            </span>
                            <div className="w-12 bg-secondary h-1 rounded-full overflow-hidden mt-0.5">
                              <div
                                className={`h-full ${ts.extracted_data.overall_confidence > 0.85 ? "bg-success" : "bg-warning"}`}
                                style={{ width: `${ts.extracted_data.overall_confidence * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5">
                          {ts.status === "processed" ? (
                            <Badge className="bg-success text-success-foreground hover:bg-success/90">Processed</Badge>
                          ) : (
                            <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">Pending FinOps</Badge>
                          )}
                        </td>
                        <td className="py-2.5">
                          {ts.is_touchless ? (
                            <Badge variant="outline" className="text-success border-success/30 bg-success/5 gap-0.5">
                              <Sparkles className="h-3 w-3 text-success animate-pulse" /> Touchless
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-warning border-warning/30 bg-warning/5 gap-0.5">
                              <HelpCircle className="h-3 w-3 text-warning" /> HITL Review
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Section: Invoices */}
      <Card className="p-5 border-primary/10 shadow-md">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-1.5">
          <FileText className="h-5 w-5 text-primary" /> Generated Invoices
        </h3>

        {invoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No invoices generated yet. Wait for timesheets to be processed.
          </div>
        ) : (
          <div className="space-y-4">
            {invoices.map((inv) => (
              <div key={inv.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="p-4 flex flex-wrap items-center justify-between gap-4 bg-muted/20">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      Invoice ID: {inv.id.slice(0, 8).toUpperCase()}...
                      <Badge variant="outline">{inv.pay_period}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Generated: {new Date(inv.generated_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <div>
                      Total Amount:{" "}
                      <span className="text-sm font-bold text-primary">
                        {inv.total_amount.toLocaleString()} {inv.currency}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {inv.validation_status === "passed" ? (
                        <Badge className="bg-success text-success-foreground">Passed Audits</Badge>
                      ) : (
                        <Badge className="bg-destructive text-destructive-foreground">Failed Rules</Badge>
                      )}
                      
                      {inv.dispatch_status === "dispatched" ? (
                        <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">Dispatched</Badge>
                      ) : (
                        <Badge variant="secondary">Queued</Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
                        className="text-xs gap-1 py-1 h-8"
                      >
                        {expandedInvoice === inv.id ? (
                          <>Hide Items <ChevronUp className="h-3.5 w-3.5" /></>
                        ) : (
                          <>View Items <ChevronDown className="h-3.5 w-3.5" /></>
                        )}
                      </Button>

                      {inv.dispatch_status === "dispatched" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApproveInvoice(inv.id)}
                            className="bg-success text-success-foreground hover:bg-success/90 h-8"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openQueryDialog(inv.id)}
                            className="h-8"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Query
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Collapsible line items list */}
                {expandedInvoice === inv.id && (
                  <div className="p-4 border-t divide-y text-xs">
                    <div className="overflow-x-auto pb-4">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b text-muted-foreground font-semibold">
                            <th className="pb-2">Emp ID</th>
                            <th className="pb-2">Name</th>
                            <th className="pb-2 text-center">Days Worked</th>
                            <th className="pb-2 text-right">Basic</th>
                            <th className="pb-2 text-right">Housing</th>
                            <th className="pb-2 text-right">OT Hours</th>
                            <th className="pb-2 text-right">OT Amount</th>
                            <th className="pb-2 text-right">Deductions</th>
                            <th className="pb-2 text-right">Net Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {inv.line_items.map((line, idx) => (
                            <tr key={idx} className="hover:bg-muted/20">
                              <td className="py-2 font-medium">{line.emp_id || "UNRESOLVED"}</td>
                              <td className="py-2">{line.employee_name}</td>
                              <td className="py-2 text-center">{line.working_days}</td>
                              <td className="py-2 text-right">{line.basic.toFixed(2)}</td>
                              <td className="py-2 text-right">{line.housing.toFixed(2)}</td>
                              <td className="py-2 text-right">{line.ot_hours}</td>
                              <td className="py-2 text-right">{line.ot_amount.toFixed(2)}</td>
                              <td className="py-2 text-right text-destructive">-{line.deductions.toFixed(2)}</td>
                              <td className="py-2 text-right font-bold text-primary">{line.net_pay.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {inv.validation_errors.length > 0 && (
                      <div className="pt-3 text-xs">
                        <div className="font-semibold text-destructive mb-1">Validation Audit Errors:</div>
                        <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                          {inv.validation_errors.map((e, idx) => (
                            <li key={idx}>
                              {e.employee ? `[${e.employee}] ` : ""}{e.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Query Raise Dialog */}
      <Dialog open={queryOpen} onOpenChange={setQueryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise Billing query</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs">
            <p className="text-muted-foreground">
              Submit a support ticket regarding Invoice ID **{queryInvoiceId.slice(0, 8).toUpperCase()}**. The FinOps team will review and respond directly to this ticket.
            </p>
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Subject</label>
              <Input
                placeholder="E.g. Hours discrepancy for Ravi Menon"
                value={querySubject}
                onChange={(e) => setQuerySubject(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Detailed Query Message</label>
              <Textarea
                placeholder="Explain the discrepancies or query details here..."
                value={queryMsg}
                onChange={(e) => setQueryMsg(e.target.value)}
                rows={5}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueryOpen(false)} className="text-xs">Cancel</Button>
            <Button
              onClick={handleRaiseQuerySubmit}
              disabled={sendingQuery}
              className="bg-primary text-primary-foreground text-xs"
            >
              Submit Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
