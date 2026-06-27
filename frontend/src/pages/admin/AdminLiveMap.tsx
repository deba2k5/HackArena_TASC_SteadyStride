import { useEffect, useState } from "react";
import { tiaApi, Invoice, CustomerConfig } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Package, CheckCircle, Clock, ArrowUp, ArrowDown } from "lucide-react";

export default function AdminLiveMap() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerConfig[]>([]);
  const [dispatching, setDispatching] = useState(false);

  const loadData = async () => {
    try {
      const [inv, custs] = await Promise.all([tiaApi.getInvoices(), tiaApi.getCustomers()]);
      setInvoices(inv);
      setCustomers(custs);
    } catch (err) {
      console.error("Failed to load dispatch data", err);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 6000);
    return () => clearInterval(t);
  }, []);

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      const result = await tiaApi.executeDispatch();
      if (result.dispatched_count === 0) {
        toast.info("No validated invoices pending dispatch.");
      } else {
        toast.success(`Dispatched ${result.dispatched_count} invoice(s) successfully!`);
      }
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Dispatch failed.");
    } finally {
      setDispatching(false);
    }
  };

  const pendingDispatch = invoices.filter(i => i.validation_status === "passed" && i.dispatch_status === "draft");
  const dispatched = invoices.filter(i => i.dispatch_status === "dispatched");

  // Sort pending based on client dispatch rule for preview
  const sortedPending = pendingDispatch.map(inv => {
    const cust = customers.find(c => c.client_code === inv.client_code);
    const rule = cust?.dispatch_rule || "spend_ascending";
    const sortedItems = [...inv.line_items].sort((a, b) =>
      rule === "spend_ascending" ? a.net_pay - b.net_pay : b.net_pay - a.net_pay
    );
    return { ...inv, line_items: sortedItems, dispatch_rule: rule };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch & Invoice Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Review sorted invoice line items and execute bulk dispatch to clients.
          </p>
        </div>
        <Button
          onClick={handleDispatch}
          disabled={dispatching || pendingDispatch.length === 0}
          className="gap-2 bg-primary"
        >
          <Send className="h-4 w-4" />
          {dispatching ? "Dispatching..." : `Execute Dispatch (${pendingDispatch.length} invoices)`}
        </Button>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 text-warning grid place-items-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Pending Dispatch</div>
            <div className="text-2xl font-bold">{pendingDispatch.length}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-success/10 text-success grid place-items-center shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Total Dispatched</div>
            <div className="text-2xl font-bold">{dispatched.length}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Total Value Dispatched</div>
            <div className="text-2xl font-bold">
              {(dispatched.reduce((s, i) => s + i.total_amount, 0) / 1000).toFixed(0)}K AED
            </div>
          </div>
        </Card>
      </div>

      {/* Pending Invoices Preview with Sorted Line Items */}
      <div className="space-y-5">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Invoices Queued for Dispatch (Pre-sorted by Client Rules)
        </h3>
        {sortedPending.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No validated invoices in dispatch queue. Invoices appear here after passing the validation rules engine.
          </Card>
        ) : (
          sortedPending.map(inv => {
            const rule = (inv as any).dispatch_rule as string;
            return (
              <Card key={inv.id} className="overflow-hidden border-primary/10 shadow-sm">
                <div className="bg-muted/30 border-b px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {inv.client_name}
                      <Badge variant="outline">{inv.pay_period}</Badge>
                      <Badge className="bg-success/10 text-success border-success/30 text-[10px]">Validated ✓</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      Sort rule:
                      {rule === "spend_ascending" ? (
                        <span className="flex items-center gap-0.5 text-primary font-medium">
                          <ArrowUp className="h-3 w-3" /> Ascending by Net Pay
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-primary font-medium">
                          <ArrowDown className="h-3 w-3" /> Descending by Net Pay
                        </span>
                      )}
                      · {inv.line_items.length} employees · Total: <strong>{inv.total_amount.toLocaleString()} {inv.currency}</strong>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b text-muted-foreground font-semibold bg-muted/10">
                        <th className="px-4 py-2">Rank</th>
                        <th className="px-4 py-2">Emp ID</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2 text-right">Days</th>
                        <th className="px-4 py-2 text-right">Gross</th>
                        <th className="px-4 py-2 text-right">OT Amt</th>
                        <th className="px-4 py-2 text-right">Deductions</th>
                        <th className="px-4 py-2 text-right">Net Pay (AED)</th>
                        <th className="px-4 py-2">IBAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {inv.line_items.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground font-bold">#{idx + 1}</td>
                          <td className="px-4 py-2 font-mono text-primary">{line.emp_id}</td>
                          <td className="px-4 py-2 font-medium">{line.employee_name}</td>
                          <td className="px-4 py-2 text-right">{line.working_days}</td>
                          <td className="px-4 py-2 text-right">{line.gross.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{line.ot_amount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-destructive">-{line.deductions.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-bold text-primary">{line.net_pay.toFixed(2)}</td>
                          <td className="px-4 py-2 font-mono text-muted-foreground text-[10px]">{line.iban?.slice(0, 16)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Dispatched History */}
      {dispatched.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Dispatch History</h3>
          <div className="space-y-2">
            {dispatched.map(inv => (
              <div key={inv.id} className="flex items-center justify-between border rounded-lg px-4 py-3 text-xs bg-success/5 border-success/20">
                <div>
                  <span className="font-semibold">{inv.client_name}</span>
                  <span className="text-muted-foreground ml-2">· {inv.pay_period} · {inv.line_items.length} employees</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-primary">{inv.total_amount.toLocaleString()} {inv.currency}</span>
                  <Badge className="bg-success text-success-foreground gap-1 text-[10px]">
                    <CheckCircle className="h-3 w-3" /> Dispatched {inv.dispatched_at ? new Date(inv.dispatched_at).toLocaleDateString() : ""}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
