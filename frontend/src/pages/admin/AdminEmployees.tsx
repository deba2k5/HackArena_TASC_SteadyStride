import { useEffect, useState } from "react";
import { tiaApi, Employee, CustomerConfig } from "@/lib/tiaApi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Building2 } from "lucide-react";

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<CustomerConfig[]>([]);
  const [filterClient, setFilterClient] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [emps, custs] = await Promise.all([tiaApi.getEmployees(), tiaApi.getCustomers()]);
        setEmployees(emps);
        setCustomers(custs);
      } catch (err) {
        console.error("Failed to load employees", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = employees.filter(e => {
    const matchesClient = filterClient === "all" || e.client_code === filterClient;
    const q = search.toLowerCase();
    const matchesSearch = !q || e.full_name.toLowerCase().includes(q) || e.emp_id.toLowerCase().includes(q) || e.job_title.toLowerCase().includes(q);
    return matchesClient && matchesSearch;
  });

  // Group by client
  const grouped = customers.reduce<Record<string, Employee[]>>((acc, c) => {
    acc[c.client_code] = filtered.filter(e => e.client_code === c.client_code);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Client & Staff Master Database</h1>
        <p className="text-sm text-muted-foreground">
          {employees.length} contract staff across {customers.length} onboarded clients.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, Emp ID, or job title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-56 h-9 text-xs">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Clients ({employees.length})</SelectItem>
            {customers.map(c => (
              <SelectItem key={c.client_code} value={c.client_code} className="text-xs">
                {c.client_name} ({c.client_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-3 py-2 rounded-md border">
          <Users className="h-3.5 w-3.5" />
          {filtered.length} employees shown
        </div>
      </div>

      {loading ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">Loading master database...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          No employees found. Try seeding the database using the "Seed DB" button.
        </Card>
      ) : (
        <div className="space-y-6">
          {customers.map(c => {
            const clientEmps = grouped[c.client_code] || [];
            if (clientEmps.length === 0 && filterClient !== "all" && filterClient !== c.client_code) return null;
            if (clientEmps.length === 0 && filterClient === "all" && !search) {
              const allClientEmps = employees.filter(e => e.client_code === c.client_code);
              if (allClientEmps.length === 0) return null;
            }
            if (clientEmps.length === 0) return null;

            return (
              <Card key={c.client_code} className="overflow-hidden border-primary/10">
                <div className="bg-muted/30 border-b px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <div className="font-semibold text-sm">{c.client_name}</div>
                    <Badge variant="outline" className="text-[10px]">{c.client_code}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{c.industry}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{c.city}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{clientEmps.length} staff shown</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b text-muted-foreground font-semibold bg-muted/10">
                        <th className="px-4 py-2.5">Emp ID</th>
                        <th className="px-4 py-2.5">Full Name</th>
                        <th className="px-4 py-2.5">Job Title</th>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5">Nationality</th>
                        <th className="px-4 py-2.5 text-right">Basic (AED)</th>
                        <th className="px-4 py-2.5 text-right">Total CTC (AED)</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {clientEmps.slice(0, 20).map(emp => (
                        <tr key={emp.emp_id} className="hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono font-medium text-primary">{emp.emp_id}</td>
                          <td className="px-4 py-2 font-medium">{emp.full_name}</td>
                          <td className="px-4 py-2 text-muted-foreground">{emp.job_title}</td>
                          <td className="px-4 py-2 text-muted-foreground">{emp.department}</td>
                          <td className="px-4 py-2">{emp.nationality}</td>
                          <td className="px-4 py-2 text-right font-medium">{emp.basic.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-bold text-primary">{emp.total_ctc.toLocaleString()}</td>
                          <td className="px-4 py-2">
                            <Badge className={emp.status === "Active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                              {emp.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {clientEmps.length > 20 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-2 text-center text-xs text-muted-foreground italic">
                            ... and {clientEmps.length - 20} more employees. Use the search to find specific staff.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
