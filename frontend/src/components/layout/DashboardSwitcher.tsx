import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { tiaApi, CustomerConfig } from "@/lib/tiaApi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, UserCheck, RefreshCw, Layers } from "lucide-react";
import { toast } from "sonner";

export default function DashboardSwitcher() {
  const { demoRole, setDemoRole, demoClientCode, setDemoClientCode } = useAuth();
  const [customers, setCustomers] = useState<CustomerConfig[]>([]);
  const [loadingSeed, setLoadingSeed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const list = await tiaApi.getCustomers();
        setCustomers(list);
      } catch (err) {
        console.error("Failed to load customers in switcher", err);
      }
    };
    load();
  }, []);

  const handleRoleChange = (role: "client" | "finops" | "finance") => {
    setDemoRole(role);
    if (role === "client") {
      navigate("/");
    } else {
      navigate("/admin");
    }
    toast.success(`Switched persona to: ${role.toUpperCase()}`);
  };

  const handleSeed = async () => {
    setLoadingSeed(true);
    try {
      const res = await tiaApi.triggerSeed();
      toast.success(res.message || "Database seeded successfully!");
      // Reload current page to pull seeded data
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Database seeding failed.");
    } finally {
      setLoadingSeed(false);
    }
  };

  return (
    <div className="bg-card border-b px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 backdrop-blur-md bg-opacity-95 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Layers className="h-3 w-3 text-primary animate-pulse" /> Active Persona:
        </span>
        <div className="flex bg-secondary p-0.5 rounded-md border text-xs">
          <button
            onClick={() => handleRoleChange("finops")}
            className={`px-3 py-1 rounded-sm font-medium transition-all ${
              demoRole === "finops"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            FinOps (Operations)
          </button>
          <button
            onClick={() => handleRoleChange("finance")}
            className={`px-3 py-1 rounded-sm font-medium transition-all ${
              demoRole === "finance"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Finance (Analytics)
          </button>
          <button
            onClick={() => handleRoleChange("client")}
            className={`px-3 py-1 rounded-sm font-medium transition-all ${
              demoRole === "client"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Client Portal
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {demoRole === "client" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Select Client:</span>
            <Select value={demoClientCode} onValueChange={(val) => {
              setDemoClientCode(val);
              toast.success(`Active Client code set to ${val}`);
            }}>
              <SelectTrigger className="w-56 h-8 text-xs font-medium">
                <SelectValue placeholder="Select Client" />
              </SelectTrigger>
              <SelectContent>
                {customers.length > 0 ? (
                  customers.map((c) => (
                    <SelectItem key={c.client_code} value={c.client_code} className="text-xs">
                      {c.client_name} ({c.client_code})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="CL001" className="text-xs">
                    Emirates Steel Industries LLC (CL001)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={handleSeed}
          disabled={loadingSeed}
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 border-primary/20 hover:border-primary/50 text-primary hover:bg-primary/5 bg-primary/5"
        >
          <RefreshCw className={`h-3 w-3 ${loadingSeed ? "animate-spin" : ""}`} />
          Seed DB
        </Button>
      </div>
    </div>
  );
}
