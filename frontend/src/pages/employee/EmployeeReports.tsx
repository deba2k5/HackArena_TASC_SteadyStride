import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tiaApi, Invoice, ClientQuery } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, MessageSquare, Download, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

export default function EmployeeReports() {
  const { demoClientCode } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [queries, setQueries] = useState<ClientQuery[]>([]);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  // Query Dialog State
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryInvoiceId, setQueryInvoiceId] = useState("");
  const [querySubject, setQuerySubject] = useState("");
  const [queryMsg, setQueryMsg] = useState("");
  const [sendingQuery, setSendingQuery] = useState(false);

  const loadData = async () => {
    try {
      const [inv, qs] = await Promise.all([
        tiaApi.getInvoices(demoClientCode),
        tiaApi.getQueries(demoClientCode),
      ]);
      setInvoices(inv);
      setQueries(qs);
    } catch (err) {
      console.error("Failed to load reports data", err);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 8000);
    return () => clearInterval(t);
  }, [demoClientCode]);

  const exportInvoiceCSV = (inv: Invoice) => {
    const header = ["Emp ID", "Name", "Days", "Basic", "Housing", "Transport", "Food", "Phone", "Gross", "OT Hours", "OT Amount", "Deductions", "Net Pay", "IBAN"];
    const rows = inv.line_items.map(l => [
      l.emp_id, l.employee_name, l.working_days, l.basic, l.housing,
      l.transport, l.food, l.phone, l.gross, l.ot_hours, l.ot_amount,
      l.deductions, l.net_pay, l.iban,
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice_${inv.client_code}_${inv.pay_period.replace(" ", "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Invoice exported as CSV!");
  };

  const handleRaiseQuery = async () => {
    if (!querySubject.trim() || !queryMsg.trim()) return toast.error("Fill in all fields.");
    setSendingQuery(true);
    try {
      const inv = invoices.find(i => i.id === queryInvoiceId);
      await tiaApi.createQuery({
        client_code: demoClientCode,
        client_name: inv?.client_name || demoClientCode,
        invoice_id: queryInvoiceId,
        subject: querySubject.trim(),
        message: queryMsg.trim(),
      });
      toast.success("Query submitted to FinOps team!");
      setQueryOpen(false);
      setQuerySubject(""); setQueryMsg("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to raise query.");
    } finally {
      setSendingQuery(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Invoices & Queries</h1>
        <p className="text-sm text-muted-foreground">View all processed invoices and billing support tickets.</p>
      </header>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices" className="text-xs">
            Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="queries" className="text-xs">
            Support Queries ({queries.length})
          </TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4 mt-4">
          {invoices.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground text-sm">
              No invoices yet. Submit timesheets from the Client Dashboard to generate invoices.
            </Card>
          ) : (
            invoices.map(inv => (
              <Card key={inv.id} className="overflow-hidden border-primary/10 shadow-sm">
                <div className="p-4 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      Invoice: {inv.id.slice(0, 8).toUpperCase()}
                      <Badge variant="outline">{inv.pay_period}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Generated: {new Date(inv.generated_at).toLocaleString()} · {inv.line_items.length} employees
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="font-bold text-primary text-base">
                      {inv.total_amount.toLocaleString()} {inv.currency}
                    </div>
                    {inv.validation_status === "passed" ? (
                      <Badge className="bg-success/10 text-success border-success/30">
                        <CheckCircle className="h-3 w-3 mr-1" /> Rules Passed
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Validation Failed
                      </Badge>
                    )}
                    {inv.dispatch_status === "dispatched" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">Dispatched</Badge>
                    ) : (
                      <Badge variant="secondary">Pending Dispatch</Badge>
                    )}
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
                        onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}>
                        <FileText className="h-3 w-3" />
                        {expandedInvoice === inv.id ? <><ChevronUp className="h-3 w-3" /> Hide</> : <><ChevronDown className="h-3 w-3" /> Details</>}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
                        onClick={() => exportInvoiceCSV(inv)}>
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                      {inv.dispatch_status === "dispatched" && (
                        <Button size="sm" variant="destructive" className="h-7 text-[10px] gap-1"
                          onClick={() => { setQueryInvoiceId(inv.id); setQueryOpen(true); }}>
                          <MessageSquare className="h-3 w-3" /> Query
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {expandedInvoice === inv.id && (
                  <div className="p-4 border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b text-muted-foreground font-semibold">
                            <th className="pb-2">Emp ID</th>
                            <th className="pb-2">Name</th>
                            <th className="pb-2 text-center">Days</th>
                            <th className="pb-2 text-right">Basic</th>
                            <th className="pb-2 text-right">Housing</th>
                            <th className="pb-2 text-right">Transport</th>
                            <th className="pb-2 text-right">OT Hrs</th>
                            <th className="pb-2 text-right">OT Amt</th>
                            <th className="pb-2 text-right text-destructive">Deduct.</th>
                            <th className="pb-2 text-right text-primary">Net Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {inv.line_items.map((line, idx) => (
                            <tr key={idx} className="hover:bg-muted/20">
                              <td className="py-2 font-mono text-primary">{line.emp_id}</td>
                              <td className="py-2 font-medium">{line.employee_name}</td>
                              <td className="py-2 text-center">{line.working_days}</td>
                              <td className="py-2 text-right">{line.basic.toFixed(2)}</td>
                              <td className="py-2 text-right">{line.housing.toFixed(2)}</td>
                              <td className="py-2 text-right">{line.transport.toFixed(2)}</td>
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
                      <div className="mt-3 text-xs p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                        <div className="font-semibold text-destructive mb-1">Validation Errors:</div>
                        <ul className="list-disc pl-4 space-y-0.5 text-destructive/80">
                          {inv.validation_errors.map((e, i) => (
                            <li key={i}>{e.employee ? `[${e.employee}] ` : ""}{e.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        {/* Queries Tab */}
        <TabsContent value="queries" className="space-y-4 mt-4">
          {queries.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground text-sm">
              No support queries raised. You can query any dispatched invoice from the Invoices tab.
            </Card>
          ) : (
            queries.map(q => (
              <Card key={q.id} className={`p-5 border-l-4 shadow-sm ${q.status === "open" ? "border-l-warning" : "border-l-success"}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold text-sm">{q.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Invoice ref: {q.invoice_id.slice(0, 8).toUpperCase()} · {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {q.status === "open" ? (
                    <Badge className="bg-warning/10 text-warning border-warning/30">Open</Badge>
                  ) : (
                    <Badge className="bg-success/10 text-success border-success/30">Resolved</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md italic">"{q.message}"</div>
                {q.replies.map((r, i) => (
                  <div key={i} className="mt-3 text-xs bg-success/5 border border-success/20 p-3 rounded-md pl-4">
                    <div className="font-semibold text-success mb-0.5">FinOps Response · {new Date(r.at).toLocaleDateString()}</div>
                    <p className="text-muted-foreground">{r.message}</p>
                  </div>
                ))}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Raise Query Dialog */}
      <Dialog open={queryOpen} onOpenChange={setQueryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise Invoice Query</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Subject</label>
              <Input placeholder="E.g. OT hours mismatch for staff member" value={querySubject}
                onChange={e => setQuerySubject(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Detailed Message</label>
              <Textarea placeholder="Describe the discrepancy or issue in detail..."
                value={queryMsg} onChange={e => setQueryMsg(e.target.value)} rows={5} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueryOpen(false)}>Cancel</Button>
            <Button onClick={handleRaiseQuery} disabled={sendingQuery} className="bg-primary text-primary-foreground">
              Submit Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
