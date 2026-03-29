import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Dashboard from "@/pages/dashboard";
import InboxPage from "@/pages/inbox";
import HorizonsPage from "@/pages/horizons";
import HabitsPage from "@/pages/habits";
import ReviewPage from "@/pages/review";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/horizons" component={HorizonsPage} />
      <Route path="/habits" component={HabitsPage} />
      <Route path="/review" component={ReviewPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center gap-2 p-2 border-b shrink-0">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                </header>
                <main className="flex-1 overflow-hidden">
                  <AppRouter />
                </main>
              </div>
            </div>
          </SidebarProvider>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
