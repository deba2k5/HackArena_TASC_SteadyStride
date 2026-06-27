import { useEffect, useState } from "react";
import { tiaApi } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Activity } from "lucide-react";

interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  at: string;
  meta: Record<string, any>;
}

const ACTION_STYLES: Record<string, string> = {
  timesheet_ingested: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  timesheet_hitl_resolved: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  invoice_generated: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  invoice_dispatched: "bg-green-500/10 text-green-600 border-green-500/20",
  invoice_manually_approved: "bg-green-500/10 text-green-700 border-green-500/20",
  client_query_raised: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  client_query_resolved: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  client_configuration_updated: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  database_seed: "bg-primary/10 text-primary border-primary/20",
};

const ACTION_LABELS: Record<string, string> = {
  timesheet_ingested: "Timesheet Ingested",
  timesheet_hitl_resolved: "HITL Exception Resolved",
  invoice_generated: "Invoice Generated",
  invoice_dispatched: "Invoice Dispatched",
  invoice_manually_approved: "Invoice Approved",
  client_query_raised: "Client Query Raised",
  client_query_resolved: "Query Resolved",
  client_configuration_updated: "Client Config Updated",
  database_seed: "Database Seeded",
};

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await tiaApi.getAudit();
        setLogs(data);
      } catch (err) {
        console.error("Failed to load audit logs", err);
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const filtered = logs.filter(l => {
    const q = search.toLowerCase();
    return !q || l.actor.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.target?.toLowerCase().includes(q);
  });

  const formatMeta = (meta: any) => {
    if (!meta) return null;
    const parts: string[] = [];
    if (meta.client_code) parts.push(`Client: ${meta.client_code}`);
    if (meta.validation_status) parts.push(`Validation: ${meta.validation_status}`);
    if (meta.total_amount) parts.push(`Amount: ${Number(meta.total_amount).toLocaleString()} AED`);
    if (meta.rule_applied) parts.push(`Sort: ${meta.rule_applied}`);
    if (meta.overall_confidence) parts.push(`Confidence: ${(Number(meta.overall_confidence) * 100).toFixed(0)}%`);
    if (meta.is_touchless !== undefined) parts.push(meta.is_touchless ? "✓ Touchless" : "⚠ HITL Required");
    if (meta.customers_seeded) parts.push(`${meta.customers_seeded} clients, ${meta.employees_seeded} employees`);
    return parts.length > 0 ? parts.join(" · ") : JSON.stringify(meta).slice(0, 80);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Pipeline Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground">
          Full immutable log of every action across the TIA pipeline — ingestion, AI extraction, HITL events, invoice generation, validation, and dispatch.
        </p>
      </header>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search actor, action, or target..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="text-xs text-muted-foreground bg-secondary px-3 py-2 rounded border">
          {filtered.length} events
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-muted/20 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Pipeline Event</th>
                <th className="px-4 py-3">Target ID</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    {logs.length === 0 ? "No audit events yet. Submit a timesheet to begin the pipeline." : "No results match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((log, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(log.at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-medium max-w-[120px] truncate" title={log.actor}>
                      {log.actor === "system" || log.actor === "tasc_smart_bot" || log.actor === "dispatch_system" ? (
                        <span className="text-primary font-semibold">{log.actor}</span>
                      ) : (
                        log.actor
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${ACTION_STYLES[log.action] || "bg-muted text-muted-foreground"}`}
                      >
                        {ACTION_LABELS[log.action] || log.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[100px] truncate" title={log.target}>
                      {log.target ? log.target.slice(0, 8).toUpperCase() + "..." : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[300px] truncate" title={formatMeta(log.meta) || ""}>
                      {formatMeta(log.meta) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
