import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Clock,
  FileBarChart,
  User,
  LayoutDashboard,
  Users,
  CheckSquare,
  Map,
  ScrollText,
  LogOut,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const linkBase =
  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors";
const linkActive = "bg-primary/10 text-primary";

export default function AppSidebar() {
  const { role, profile, signOut, user, demoRole, demoClientCode } = useAuth();
  const nav = useNavigate();
  const isAdmin = role === "finops" || role === "finance";

  const items = isAdmin
    ? [
        { to: "/admin", label: "Invoicing Analytics", icon: LayoutDashboard, end: true },
        { to: "/admin/employees", label: "Client & Staff Master", icon: Users },
        { to: "/admin/approvals", label: "FinOps Exception Queue", icon: CheckSquare },
        { to: "/admin/map", label: "Dispatch & Tracking", icon: Map },
        { to: "/admin/audit", label: "Pipeline Audit Trail", icon: ScrollText },
      ]
    : [
        { to: "/", label: "Client Dashboard", icon: Clock, end: true },
        { to: "/reports", label: "Invoices & Queries", icon: FileBarChart },
        { to: "/profile", label: "Client Profile", icon: User },
      ];

  return (
    <aside className="w-60 shrink-0 border-r bg-sidebar flex flex-col">
      <div className="h-16 flex items-center px-5 border-b">
        <div className="h-9 w-9 rounded-md mr-3 bg-primary/10 grid place-items-center font-bold text-primary text-lg">
          TIA
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Touchless Agent</div>
          <div className="text-[11px] text-muted-foreground">
            {role === "client" ? `Client Portal (${demoClientCode})` : `${role === "finops" ? "FinOps" : "Finance"} Console`}
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}
          >
            <it.icon className="h-4 w-4" /> {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3 text-xs">
        <div className="font-medium truncate">{profile?.fullName || (role === "client" ? "Billing Manager" : "TASC Agent")}</div>
        <div className="text-muted-foreground truncate">{user?.email || (role === "client" ? "billing@test.com" : "admin@tasc.ch")}</div>
        <Button
          onClick={async () => {
            await signOut();
            nav("/login");
          }}
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
