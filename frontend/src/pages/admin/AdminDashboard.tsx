import { useEffect, useState } from "react";
import { tiaApi, SystemMetrics, Invoice, CustomerConfig } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, CheckCircle, AlertTriangle, Zap, Clock, DollarSign, TrendingUp, Settings, RefreshCw, Send } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminDashboard() {
  const { demoRole } = useAuth();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerConfig[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<CustomerConfig | null>(null);

  const loadData = async () => {
    try {
      const [m, inv, custs] = await Promise.all([
        tiaApi.getMetrics(),
        tiaApi.getInvoices(),
        tiaApi.getCustomers(),
      ]);
      setMetrics(m);
      setInvoices(inv);
      setCustomers(custs);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 8000);
    return () => clearInterval(t);
  }, []);

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      const result = await tiaApi.executeDispatch();
      if (result.dispatched_count === 0) {
        toast.info("No validated invoices pending dispatch.");
      } else {
        toast.success(`Dispatched ${result.dispatched_count} invoice(s) to clients!`);
      }
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Dispatch failed.");
    } finally {
      setDispatching(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!editingClient) return;
    try {
      await tiaApi.upsertCustomer(editingClient);
      toast.success(`Configuration saved for ${editingClient.client_name}`);
      setConfigOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Save failed.");
    }
  };

  // Chart data
  const spendByClient = customers.map((c) => ({
    name: c.client_code,
    amount: invoices.filter(i => i.client_code === c.client_code).reduce((s, i) => s + i.total_amount, 0),
  })).filter(d => d.amount > 0);

  const statusBreakdown = [
    { name: "Touchless", value: invoices.filter(i => i.dispatch_status === "dispatched").length },
    { name: "Validation Failed", value: invoices.filter(i => i.validation_status === "failed").length },
    { name: "In Queue", value: invoices.filter(i => i.dispatch_status === "draft" && i.validation_status === "passed").length },
  ].filter(d => d.value > 0);

  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];

  const pendingDispatch = invoices.filter(i => i.validation_status === "passed" && i.dispatch_status === "draft");
  const failedValidation = invoices.filter(i => i.validation_status === "failed");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {demoRole === "finance" ? "Finance Analytics Dashboard" : "Invoicing Overview"}
          </h1>
          <p className="text-sm text-muted-foreground">Real-time touchless invoicing pipeline metrics.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1 text-xs h-8">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleDispatch}
            disabled={dispatching || pendingDispatch.length === 0}
            className="gap-1.5 text-xs h-8 bg-primary"
          >
            <Send className="h-3.5 w-3.5" />
            {dispatching ? "Dispatching..." : `Dispatch ${pendingDispatch.length} Invoice(s)`}
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Sparkles}
          label="Touchless Rate"
          value={metrics ? `${metrics.touchless_rate}%` : "—"}
          sublabel="Zero human touch target: 80%+"
          accent={metrics ? metrics.touchless_rate >= 80 : false}
        />
        <KpiCard
          icon={TrendingUp}
          label="Extraction Accuracy"
          value={metrics ? `${metrics.extraction_accuracy}%` : "—"}
          sublabel="AI confidence avg target: 99%+"
          accent={metrics ? metrics.extraction_accuracy >= 95 : false}
        />
        <KpiCard
          icon={Clock}
          label="Avg. Processing Time"
          value={metrics ? `${metrics.avg_processing_time_mins} min` : "—"}
          sublabel="Target: minutes, not days"
          accent={metrics ? metrics.avg_processing_time_mins < 5 : false}
        />
        <KpiCard
          icon={DollarSign}
          label="Total Invoiced"
          value={metrics ? `${(metrics.total_invoiced_amount / 1000).toFixed(0)}K AED` : "—"}
          sublabel={`${metrics?.total_invoices_count || 0} invoices generated`}
          accent
        />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-medium mb-4 text-sm">Invoiced Amount by Client (AED)</h3>
          <div className="h-[240px]">
            {spendByClient.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={spendByClient}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString()} AED`, "Amount"]} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No invoice data yet. Submit timesheets to generate invoices.
              </div>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-4 text-sm">Invoice Status Breakdown</h3>
          <div className="h-[240px]">
            {statusBreakdown.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                    {statusBreakdown.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Pending Dispatch + Failed Validation Tables */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-success" /> Ready to Dispatch ({pendingDispatch.length})
            </h3>
          </div>
          {pendingDispatch.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">All validated invoices have been dispatched.</p>
          ) : (
            <div className="space-y-2">
              {pendingDispatch.slice(0, 5).map(inv => (
                <div key={inv.id} className="flex items-center justify-between border rounded-md p-3 text-xs hover:bg-muted/30">
                  <div>
                    <div className="font-medium">{inv.client_name} · {inv.pay_period}</div>
                    <div className="text-muted-foreground">{inv.line_items.length} employees · {inv.total_amount.toLocaleString()} {inv.currency}</div>
                  </div>
                  <Badge className="bg-success/10 text-success border-success/30">Validated ✓</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Validation Failures ({failedValidation.length})
            </h3>
          </div>
          {failedValidation.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">🎉 No validation errors. All invoices passed rules checks.</p>
          ) : (
            <div className="space-y-2">
              {failedValidation.slice(0, 5).map(inv => (
                <div key={inv.id} className="flex items-center justify-between border border-destructive/20 bg-destructive/5 rounded-md p-3 text-xs">
                  <div>
                    <div className="font-medium">{inv.client_name} · {inv.pay_period}</div>
                    <div className="text-destructive">{inv.validation_errors.length} error(s): {inv.validation_errors[0]?.message?.slice(0, 50)}...</div>
                  </div>
                  <Badge variant="destructive">Failed</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Client Configurations */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-sm flex items-center gap-1.5">
            <Settings className="h-4 w-4 text-primary" /> Client Configuration & Billing Rules
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b text-muted-foreground font-semibold">
                <th className="pb-2">Client</th>
                <th className="pb-2">Industry</th>
                <th className="pb-2">Input Channels</th>
                <th className="pb-2">Dispatch Rule</th>
                <th className="pb-2">Max OT Hrs</th>
                <th className="pb-2">Signature Req.</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map(c => (
                <tr key={c.client_code} className="hover:bg-muted/30">
                  <td className="py-2.5">
                    <div className="font-medium">{c.client_name}</div>
                    <div className="text-muted-foreground">{c.client_code}</div>
                  </td>
                  <td className="py-2.5">{c.industry}</td>
                  <td className="py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.input_channels.map(ch => (
                        <Badge key={ch} variant="outline" className="text-[10px] capitalize">{ch}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 capitalize">{c.dispatch_rule?.replace("_", " ")}</td>
                  <td className="py-2.5">{c.validation_profile?.max_ot_hours_limit}</td>
                  <td className="py-2.5">
                    {c.validation_profile?.require_signature ? (
                      <Badge className="bg-primary/10 text-primary text-[10px]">Required</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Optional</Badge>
                    )}
                  </td>
                  <td className="py-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => { setEditingClient({ ...c }); setConfigOpen(true); }}
                    >
                      <Settings className="h-3 w-3" /> Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Client Config Edit Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure: {editingClient?.client_name}</DialogTitle>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Dispatch Sort Rule</label>
                  <Select
                    value={editingClient.dispatch_rule}
                    onValueChange={v => setEditingClient({ ...editingClient, dispatch_rule: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spend_ascending" className="text-xs">Ascending by Spend</SelectItem>
                      <SelectItem value="spend_descending" className="text-xs">Descending by Spend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Max OT Hours / Month</label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={editingClient.validation_profile.max_ot_hours_limit}
                    onChange={e => setEditingClient({
                      ...editingClient,
                      validation_profile: { ...editingClient.validation_profile, max_ot_hours_limit: Number(e.target.value) }
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Require Signature?</label>
                  <Select
                    value={editingClient.validation_profile.require_signature ? "yes" : "no"}
                    onValueChange={v => setEditingClient({
                      ...editingClient,
                      validation_profile: { ...editingClient.validation_profile, require_signature: v === "yes" }
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes" className="text-xs">Yes – Required</SelectItem>
                      <SelectItem value="no" className="text-xs">No – Optional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Status</label>
                  <Select
                    value={editingClient.status}
                    onValueChange={v => setEditingClient({ ...editingClient, status: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active" className="text-xs">Active</SelectItem>
                      <SelectItem value="Inactive" className="text-xs">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Contact Email</label>
                <Input
                  className="h-8 text-xs"
                  value={editingClient.contact_email}
                  onChange={e => setEditingClient({ ...editingClient, contact_email: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfig} className="bg-primary text-primary-foreground">Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sublabel, accent }: {
  icon: React.ElementType; label: string; value: string; sublabel: string; accent?: boolean;
}) {
  return (
    <Card className="p-4 border-primary/10">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${accent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
          <div className="text-xl font-bold tracking-tight">{value}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
        </div>
      </div>
    </Card>
  );
}
