import AppSidebar from "./AppSidebar";
import DashboardSwitcher from "./DashboardSwitcher";
import AiAssistantChat from "../AiAssistantChat";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <DashboardSwitcher />
        <main className="flex-1 overflow-auto relative">
          <div className="max-w-7xl mx-auto p-6">{children}</div>
          <AiAssistantChat />
        </main>
      </div>
    </div>
  );
}
