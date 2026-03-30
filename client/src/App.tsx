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
import ReviewPage from "@/pages/review";
import PlannerPage from "@/pages/planner";
import RoutinePage from "@/pages/routine";
import IdentityVotePage from "@/pages/identity-vote";
import ImportPage from "@/pages/import";
import ProjectDetailPage from "@/pages/project-detail";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Menu } from "lucide-react";

function ProjectDetailRoute() {
  const [, params] = useRoute("/projects/:id");
  if (!params?.id) return <NotFound />;
  return <ProjectDetailPage id={Number(params.id)} />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/horizons" component={HorizonsPage} />
      <Route path="/routine" component={RoutinePage} />
      <Route path="/planner" component={PlannerPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/identity-vote" component={IdentityVotePage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/projects/:id" component={ProjectDetailRoute} />
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
          <SidebarProvider defaultOpen={false} style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
              <div className="flex flex-col flex-1 min-w-0">
                <main className="flex-1 overflow-hidden">
                  <AppRouter />
                </main>

                {/* Sidebar trigger — fixed at bottom center on all screens */}
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
                  <SidebarTrigger
                    className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                    data-testid="sidebar-trigger"
                  >
                    <Menu className="w-5 h-5" />
                  </SidebarTrigger>
                </div>
              </div>
            </div>
          </SidebarProvider>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
