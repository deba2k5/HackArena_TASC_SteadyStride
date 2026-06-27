import { useEffect, useMemo, useState } from "react";
import { api, fmtDuration } from "@/lib/api";
import type { WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download } from "lucide-react";

export default function AdminAnalytics() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [range, setRange] = useState("7");
  const [, setTick] = useState(0);

  // Refresh sessions and tick every 10 seconds for real-time data
  useEffect(() => {
    const loadSessions = async () => {
      const data = await api.listSessions();
      setSessions(data);
    };
    loadSessions();
    const interval = setInterval(() => {
      setTick(t => t + 1);
      loadSessions();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - Number(range));
    return d.toISOString().slice(0, 10);
  }, [range]);

  // Function to calculate current work and break time for a session
  const calculateSessionStats = (s: WorkSession) => {
    const now = Date.now();
    let workMs = s.totalWorkMs || 0;
    let breakMs = s.totalBreakMs || 0;

    if (!s.clockOut) {
      // Calculate current work time (time since clock-in minus break time)
      workMs = now - new Date(s.clockIn).getTime();
      breakMs = s.breaks.reduce((sum, b) => {
        const bEnd = b.end ? new Date(b.end).getTime() : now;
        return sum + (bEnd - new Date(b.start).getTime());
      }, 0);
    }

    return { workMs: Math.max(0, workMs - breakMs), breakMs };
  };

  const filtered = sessions.filter((s) => s.date >= cutoff);

  const byDay = useMemo(() => {
    const map = new Map<string, { work: number; brk: number }>();
    filtered.forEach((s) => {
      const stats = calculateSessionStats(s);
      const cur = map.get(s.date) || { work: 0, brk: 0 };
      cur.work += stats.workMs / 3600000;
      cur.brk += stats.breakMs / 3600000;
      map.set(s.date, cur);
    });
    return Array.from(map.entries()).sort().map(([date, v]) => ({ date: date.slice(5), work: +v.work.toFixed(1), brk: +v.brk.toFixed(1) }));
  }, [filtered]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => {
      const stats = calculateSessionStats(s);
      map.set(s.fullName, (map.get(s.fullName) || 0) + stats.workMs / 3600000);
    });
    return Array.from(map.entries()).map(([name, hours]) => ({ name, hours: +hours.toFixed(1) }));
  }, [filtered]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => s.workType && map.set(s.workType, (map.get(s.workType) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name: name.split("_").join(" "), value }));
  }, [filtered]);

  const colors = ["hsl(354 78% 49%)", "hsl(210 90% 50%)", "hsl(152 60% 38%)", "hsl(36 96% 50%)", "hsl(260 60% 55%)"];
  const totalWork = filtered.reduce((s, x) => s + calculateSessionStats(x).workMs, 0);
  const totalBreak = filtered.reduce((s, x) => s + calculateSessionStats(x).breakMs, 0);
  const productivity = totalWork + totalBreak > 0 ? Math.round((totalWork / (totalWork + totalBreak)) * 100) : 0;

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Analytics Dashboard", 14, 22);
    doc.setFontSize(12);
    doc.text(`Range: Last ${range} days`, 14, 32);
    doc.text(`Total Work Time: ${fmtDuration(totalWork)}`, 14, 40);
    doc.text(`Total Break Time: ${fmtDuration(totalBreak)}`, 14, 48);
    doc.text(`Productivity: ${productivity}%`, 14, 56);

    // By day table
    doc.setFontSize(14);
    doc.text("Hours per Day", 14, 66);
    autoTable(doc, {
      head: [["Date", "Work (hrs)", "Break (hrs)"]],
      body: byDay.map(d => [d.date, d.work, d.brk]),
      startY: 72,
    });

    // By employee table
    const byEmpTableStart = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text("Hours by Employee", 14, byEmpTableStart);
    autoTable(doc, {
      head: [["Employee", "Hours"]],
      body: byEmployee.map(e => [e.name, e.hours]),
      startY: byEmpTableStart + 6,
    });

    doc.save(`analytics_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Productivity, work-type mix, and per-employee hours.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToPDF} className="gap-2">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 hover-lift"><div className="text-xs text-muted-foreground">Total work time</div><div className="text-xl sm:text-2xl font-semibold">{fmtDuration(totalWork)}</div></Card>
        <Card className="p-4 hover-lift"><div className="text-xs text-muted-foreground">Total break time</div><div className="text-xl sm:text-2xl font-semibold">{fmtDuration(totalBreak)}</div></Card>
        <Card className="p-4 hover-lift"><div className="text-xs text-muted-foreground">Productivity</div><div className="text-xl sm:text-2xl font-semibold">{productivity}%</div></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-medium mb-4">Hours per day</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Line type="monotone" dataKey="work" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="brk" stroke="hsl(var(--warning))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-4">Hours by employee</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={byEmployee}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-medium mb-4">Work type distribution</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={90} label>
                  {byType.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
