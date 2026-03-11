import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-h-screen">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-4 md:px-6">
            <SidebarTrigger />
            <h2 className="text-lg font-semibold text-foreground md:hidden">
              CupomSmart
            </h2>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>

        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
