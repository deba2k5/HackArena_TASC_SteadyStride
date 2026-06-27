import { useState } from "react";
import AppSidebar from "./AppSidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import logoAsset from "@/assets/sinhas-logo.asset.json";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex w-full bg-background">
      <div className="hidden lg:flex">
        <AppSidebar />
      </div>
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile branded header */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 h-14 border-b bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoAsset.url} alt="Sinha's Group" className="h-8 w-8 rounded-md object-contain bg-white ring-1 ring-border p-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">Sinha's Group</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Workforce Operations</div>
            </div>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <div onClick={() => setOpen(false)}>
                <AppSidebar />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
