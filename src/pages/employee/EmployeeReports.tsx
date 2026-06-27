import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, fmtDuration } from "@/lib/api";
import type { WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download } from "lucide-react";

export default function EmployeeReports() {
  const { user } = useAuth();
  const [list, setList] = useState<WorkSession[]>([]);
  useEffect(() => {
    if (!user?.email) return;
    api.listSessions({ email: user.email }).then(setList);
  }, [user]);

  // Calculate session durations
  const calculateSessionDurations = (s: WorkSession) => {
    const clockIn = new Date(s.clockIn);
    const clockOut = s.clockOut ? new Date(s.clockOut) : null;
    const totalDayDurationMs = clockOut ? clockOut.getTime() - clockIn.getTime() : 0;
    const actualWorkMs = (s.totalWorkMs || 0) - (s.totalBreakMs || 0);
    return { totalDayDurationMs, actualWorkMs };
  };

  const statusColor: Record<string, string> = {
    pending: "bg-warning text-warning-foreground",
    approved: "bg-success text-success-foreground",
    rejected: "bg-destructive text-destructive-foreground",
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Employee Reports - " + (user?.email || ""), 14, 22);
    doc.setFontSize(12);
    doc.text(new Date().toLocaleDateString(), 14, 32);

    let totalWorkMs = 0;
    const tableData = list.map((s) => {
      const { totalDayDurationMs, actualWorkMs } = calculateSessionDurations(s);
      totalWorkMs += actualWorkMs;
      return [
        s.date,
        new Date(s.clockIn).toLocaleTimeString(),
        s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "—",
        fmtDuration(totalDayDurationMs),
        fmtDuration(actualWorkMs),
        fmtDuration(s.totalBreakMs),
        s.workType?.split("_").join(" ") || "—",
        s.status,
        s.adminComment || "—",
      ];
    });

    autoTable(doc, {
      head: [["Date", "Clock In", "Clock Out", "Total Day Duration", "Actual Work", "Breaks", "Work Type", "Status", "Admin Comment"]],
      body: tableData,
      startY: 40,
    });

    // Add total work time at the end
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(14);
    doc.text(`Total Actual Work Time: ${fmtDuration(totalWorkMs)}`, 14, finalY);

    doc.save(`reports_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My reports</h1>
        <Button onClick={exportToPDF} className="gap-2">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Clock in</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Clock out</TableHead>
                <TableHead>Total Day Duration</TableHead>
                <TableHead>Work</TableHead>
                <TableHead className="hidden md:table-cell">Breaks</TableHead>
                <TableHead className="hidden lg:table-cell">Work type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Admin comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((s) => {
                const { totalDayDurationMs, actualWorkMs } = calculateSessionDurations(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{s.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(s.clockIn).toLocaleTimeString()}</TableCell>
                    <TableCell className="whitespace-nowrap hidden sm:table-cell">{s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDuration(totalDayDurationMs)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDuration(actualWorkMs)}</TableCell>
                    <TableCell className="whitespace-nowrap hidden md:table-cell">{fmtDuration(s.totalBreakMs)}</TableCell>
                    <TableCell className="capitalize hidden lg:table-cell">{s.workType?.split("_").join(" ") || "—"}</TableCell>
                    <TableCell><Badge className={statusColor[s.status]}>{s.status}</Badge></TableCell>
                    <TableCell className="text-xs hidden lg:table-cell">{s.adminComment || "—"}</TableCell>
                  </TableRow>
                );
              })}
              {!list.length && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No sessions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
