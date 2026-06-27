import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, fmtAED } from "@/lib/api";
import type { TIAMetrics, Invoice } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Zap, Clock, DollarSign, Send, Bot,
  Users, Briefcase, Globe, BarChart3,
} from "lucide-react";

// ─── Static TASC Analytics Data (from TASC_Sample_Database_vF.xlsx) ──────────

const CLIENT_PAYROLL = [
  { name: "CL001\nEmirates Steel", net: 270793, ot: 52, days: 23.1, headcount: 20 },
  { name: "CL002\nEmaar Props",    net: 249448, ot: 30, days: 23.6, headcount: 20 },
  { name: "CL003\nDubai Airports", net: 331496, ot: 46, days: 22.5, headcount: 20 },
  { name: "CL004\nADNOC Dist",     net: 290388, ot: 48, days: 22.9, headcount: 20 },
  { name: "CL005\nMajid Al F",     net: 285698, ot: 42, days: 22.9, headcount: 20 },
  { name: "CL006\nADCB",           net: 301372, ot: 64, days: 22.7, headcount: 20 },
  { name: "CL007\nDP World",       net: 310834, ot: 36, days: 23.4, headcount: 20 },
  { name: "CL008\nEtihad",         net: 342650, ot: 52, days: 23.8, headcount: 20 },
  { name: "CL009\nAldar Props",    net: 264891, ot: 40, days: 23.3, headcount: 20 },
  { name: "CL010\nTransguard",     net: 362267, ot: 44, days: 22.9, headcount: 20 },
];

const DEPT_DISTRIBUTION = [
  { dept: "Finance",     count: 35 },
  { dept: "IT",          count: 34 },
  { dept: "HR",          count: 32 },
  { dept: "Admin",       count: 28 },
  { dept: "Engineering", count: 26 },
  { dept: "Sales",       count: 24 },
  { dept: "Operations",  count: 21 },
];

const SALARY_BANDS = [
  { band: "< 5k AED",    count: 8  },
  { band: "5–10k AED",   count: 61 },
  { band: "10–15k AED",  count: 34 },
  { band: "15–20k AED",  count: 44 },
  { band: "> 20k AED",   count: 53 },
];

const NATIONALITY_TOP8 = [
  { name: "Lebanese",    count: 24 },
  { name: "Bangladeshi", count: 21 },
  { name: "Jordanian",   count: 20 },
  { name: "Pakistani",   count: 20 },
  { name: "Nepali",      count: 16 },
  { name: "UAE National",count: 16 },
  { name: "Egyptian",    count: 15 },
  { name: "Filipino",    count: 15 },
];

const OT_BY_CLIENT = [
  { client: "ADCB",         ot: 64 },
  { client: "Emirates Steel",ot: 52 },
  { client: "Etihad",       ot: 52 },
  { client: "ADNOC",        ot: 48 },
  { client: "Dubai Airports",ot: 46 },
  { client: "Transguard",   ot: 44 },
  { client: "Majid Al F",   ot: 42 },
  { client: "Aldar",        ot: 40 },
  { client: "DP World",     ot: 36 },
  { client: "Emaar",        ot: 30 },
];

const TOP_EARNERS = [
  { name: "Hassan Al Hamdan",  net: 27311.54, client: "Emirates Steel" },
  { name: "Sofia Sharma",      net: 27211.54, client: "Dubai Airports" },
  { name: "Noor Reddy",        net: 27211.54, client: "Etihad Airways" },
  { name: "Hassan Johnson",    net: 27040.38, client: "Dubai Airports" },
  { name: "Lakshmi Al Muhairi",net: 26980.77, client: "Transguard" },
  { name: "Yasmin Patel",      net: 26811.54, client: "DP World" },
  { name: "Ana Al Rashid",     net: 26590.38, client: "Dubai Airports" },
  { name: "Abdullah Singh",    net: 26580.77, client: "Transguard" },
];

const PALETTE = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#06b6d4","#ec4899","#14b8a6","#f97316"];

// ─── Chat message type ────────────────────────────────────────────────────────
interface ChatMsg { role: "user" | "assistant"; content: string; }

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: metrics } = useQuery<TIAMetrics>({
    queryKey: ["metrics"],
    queryFn: () => api.getMetrics(),
    refetchInterval: 60_000,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => api.listInvoices(),
  });

  const [messages, setMessages] = useState<ChatMsg[]>([{
    role: "assistant",
    content: "Hi! I'm the TIA assistant. Ask me about timesheets, invoices, exceptions, or client payroll data.",
  }]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || chatLoading) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const res = await api.chat(q);
      setMessages((p) => [...p, { role: "assistant", content: res.response ?? "No response." }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "⚠️ Could not reach the AI service." }]);
    } finally {
      setChatLoading(false); }
  };

  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">TIA Command Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Touchless Invoice Agent — TASC Outsourcing · June 2026 Payroll</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Payroll (Jun 2026)" value="AED 3,009,837"  sub="200 employees · 10 clients" icon={DollarSign} color="bg-indigo-500" />
        <MetricCard title="Total OT Hours"           value="454 hrs"         sub="Across all clients"         icon={Clock}       color="bg-orange-500" />
        <MetricCard title="Avg Working Days"         value="23.1 days"       sub="June 2026 payroll run"      icon={TrendingUp}  color="bg-emerald-500" />
        <MetricCard title="Active Employees"         value="200"             sub="10 clients · 7 departments" icon={Users}       color="bg-blue-500" />
      </div>

      {/* Live invoice pipeline metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Touchless Rate"      value={`${metrics.touchless_rate.toFixed(1)}%`}          sub="Fully automated"       icon={Zap}       color="bg-violet-500" />
          <MetricCard title="Extraction Accuracy" value={`${metrics.extraction_accuracy.toFixed(1)}%`}     sub="AI confidence"         icon={TrendingUp} color="bg-teal-500" />
          <MetricCard title="Avg Processing"      value={`${metrics.avg_processing_time_mins.toFixed(1)} min`} sub="Per timesheet"      icon={Clock}     color="bg-amber-500" />
          <MetricCard title="Invoices Processed"  value={`${metrics.passed_validation_count} / ${metrics.total_invoices_count}`} sub="Passed validation" icon={BarChart3} color="bg-rose-500" />
        </div>
      )}

      {/* Analytics Tabs */}
      <Tabs defaultValue="payroll">
        <TabsList className="mb-4">
          <TabsTrigger value="payroll"><DollarSign className="h-3.5 w-3.5 mr-1.5" />Payroll by Client</TabsTrigger>
          <TabsTrigger value="ot"><Clock className="h-3.5 w-3.5 mr-1.5" />OT Hours</TabsTrigger>
          <TabsTrigger value="workforce"><Users className="h-3.5 w-3.5 mr-1.5" />Workforce</TabsTrigger>
          <TabsTrigger value="earners"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Top Earners</TabsTrigger>
        </TabsList>

        {/* Payroll by Client */}
        <TabsContent value="payroll">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Net Payroll per Client (AED)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={CLIENT_PAYROLL} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`AED ${v.toLocaleString()}`, "Net Pay"]} />
                    <Bar dataKey="net" radius={[3,3,0,0]}>
                      {CLIENT_PAYROLL.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Client Summary Table</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b">
                      <th className="text-left py-1.5 pr-2 font-semibold">Client</th>
                      <th className="text-right py-1.5 px-2 font-semibold">Net Pay</th>
                      <th className="text-right py-1.5 px-2 font-semibold">OT Hrs</th>
                      <th className="text-right py-1.5 pl-2 font-semibold">Avg Days</th>
                    </tr></thead>
                    <tbody>
                      {CLIENT_PAYROLL.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-muted/30">
                          <td className="py-1.5 pr-2 text-muted-foreground">{r.name.replace("\n", " — ")}</td>
                          <td className="text-right py-1.5 px-2 font-semibold text-indigo-700">AED {r.net.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-2">{r.ot}</td>
                          <td className="text-right py-1.5 pl-2">{r.days}</td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t-2">
                        <td className="py-2 pr-2">TOTAL</td>
                        <td className="text-right py-2 px-2 text-indigo-700">AED 3,009,837</td>
                        <td className="text-right py-2 px-2">454</td>
                        <td className="text-right py-2 pl-2">23.1</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* OT Hours */}
        <TabsContent value="ot">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Overtime Hours by Client</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={OT_BY_CLIENT} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="client" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="ot" radius={[0,3,3,0]}>
                      {OT_BY_CLIENT.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Salary Band Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={SALARY_BANDS} dataKey="count" nameKey="band" cx="50%" cy="50%"
                      outerRadius={100} label={({ band, count }) => `${band}: ${count}`} labelLine={false}>
                      {SALARY_BANDS.map((_, i) => <Cell key={i} fill={PALETTE[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Workforce */}
        <TabsContent value="workforce">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-indigo-500" />Department Headcount</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={DEPT_DISTRIBUTION} margin={{ bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3,3,0,0]}>
                      {DEPT_DISTRIBUTION.map((_, i) => <Cell key={i} fill={PALETTE[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Globe className="h-4 w-4 text-indigo-500" />Nationality Mix (Top 8)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={NATIONALITY_TOP8} dataKey="count" nameKey="name" cx="50%" cy="50%"
                      outerRadius={95} label={({ name, count }) => `${name}: ${count}`} labelLine={false}>
                      {NATIONALITY_TOP8.map((_, i) => <Cell key={i} fill={PALETTE[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Top Earners */}
        <TabsContent value="earners">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top 8 Earners — June 2026</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {TOP_EARNERS.map((e, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted-foreground font-bold text-right">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium truncate">{e.name}</span>
                        <span className="text-sm font-bold text-indigo-700 ml-2 shrink-0">AED {e.net.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(e.net / 28000) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">{e.client}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Invoices + AI Chat */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Invoices</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">No invoices yet.</p>
              ) : recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{inv.client_name}</p>
                    <p className="text-xs text-muted-foreground">{inv.pay_period} · {fmtAED(inv.total_amount)}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${inv.validation_status === "passed" ? "bg-green-500/15 text-green-700 border-green-200" : inv.validation_status === "failed" ? "bg-red-500/15 text-red-700 border-red-200" : "bg-yellow-500/15 text-yellow-700 border-yellow-200"}`}>
                    {inv.validation_status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-indigo-500" /> AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-52 w-full rounded-lg border bg-muted/30 p-3">
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="h-6 w-6 rounded-full bg-indigo-500 grid place-items-center shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-card border text-foreground"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2">
                    <div className="h-6 w-6 rounded-full bg-indigo-500 grid place-items-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-card border rounded-xl px-3 py-2">
                      <div className="flex gap-1 items-center h-4">
                        {[0,1,2].map((i) => (
                          <div key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask about payroll, invoices, employees…"
                disabled={chatLoading} className="flex-1" />
              <Button onClick={sendMessage} disabled={chatLoading || !input.trim()} size="icon" className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
