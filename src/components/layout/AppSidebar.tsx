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
import logoAsset from "@/assets/sinhas-logo.asset.json";

const linkBase =
  "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all";
const linkActive =
  "bg-gradient-primary text-primary-foreground shadow-elevated hover:text-primary-foreground hover:bg-gradient-primary";

export default function AppSidebar() {
  const { role, profile, signOut, user } = useAuth();
  const nav = useNavigate();
  const isAdmin = role !== "employee";

  const items = isAdmin
    ? [
        { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/admin/employees", label: "Employees", icon: Users },
        { to: "/admin/approvals", label: "Pending Reports", icon: CheckSquare },
        { to: "/admin/map", label: "Live Map", icon: Map },
        { to: "/admin/analytics", label: "Analytics", icon: PieChart },
        { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
      ]
    : [
        { to: "/", label: "Dashboard", icon: Clock, end: true },
        { to: "/reports", label: "My Reports", icon: FileBarChart },
        { to: "/profile", label: "Profile", icon: User },
      ];

  const initials = (profile?.fullName || user?.email || "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="h-20 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <img
          src={logoAsset.url}
          alt="Sinha's Group"
          className="h-11 w-11 rounded-lg object-contain bg-white ring-1 ring-sidebar-border p-0.5"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">Sinha's Group</div>
          <div className="text-[11px] text-muted-foreground">
            {isAdmin ? "Admin Console" : "Workforce Portal"}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
        {isAdmin ? "Manage" : "Workspace"}
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}
          >
            <it.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/60">
          <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
            {initials || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{profile?.fullName || user?.email}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>
        <Button
          onClick={async () => {
            await signOut();
            nav("/login");
          }}
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
