import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuditLog } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  useEffect(() => {
    const load = async () => setLogs(await api.listAudit());
    load();
    const interval = setInterval(load, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);
  
  const formatDetails = (meta: any) => {
    if (!meta) return "—";
    if (typeof meta === "object") {
      const parts = [];
      if (meta.location) parts.push(`Location: ${meta.location}`);
      if (meta.distance !== undefined) parts.push(`Distance: ${meta.distance}m`);
      if (meta.comment) parts.push(`Comment: ${meta.comment}`);
      if (parts.length > 0) return parts.join(" • ");
      return JSON.stringify(meta);
    }
    return String(meta);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Audit log</h1>
        <p>Immutable activity trail across the workforce platform.</p>
      </div>
      <Card className="overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="whitespace-nowrap font-semibold">When</TableHead>
                <TableHead className="font-semibold">Actor</TableHead>
                <TableHead className="font-semibold">Action</TableHead>
                <TableHead className="hidden md:table-cell font-semibold">Target</TableHead>
                <TableHead className="hidden lg:table-cell font-semibold">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs whitespace-nowrap tabular-nums">{new Date(l.at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs break-all">{l.actor}</TableCell>
                  <TableCell><Badge variant="outline" className="whitespace-nowrap rounded-md font-medium">{l.action}</Badge></TableCell>
                  <TableCell className="text-xs hidden md:table-cell break-all text-muted-foreground">{l.target || "—"}</TableCell>
                  <TableCell className="text-xs hidden lg:table-cell break-all max-w-[320px] text-muted-foreground">{formatDetails(l.meta)}</TableCell>
                </TableRow>
              ))}
              {!logs.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No activity yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
