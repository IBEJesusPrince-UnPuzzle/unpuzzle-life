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
import DataPage from "@/pages/data";
import UnPuzzlePage from "@/pages/unpuzzle";
import ProjectDetailPage from "@/pages/project-detail";
import ProjectsPage from "@/pages/projects";
import NotFound from "@/pages/not-found";

function ProjectDetailRoute({ params }: { params: { id?: string } }) {
  const id = Number(params?.id);
  if (!id || isNaN(id)) return <NotFound />;
  return <ProjectDetailPage id={id} />;
}

function DashboardWithRedirect() {
  return <Dashboard />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardWithRedirect} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/horizons" component={HorizonsPage} />
      <Route path="/unpuzzle" component={UnPuzzlePage} />
      <Route path="/routine" component={RoutinePage} />
      <Route path="/routine/:id">{(params) => <RoutinePage filterIdentityId={Number(params.id)} />}</Route>
      <Route path="/planner" component={PlannerPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/identity-vote" component={IdentityVotePage} />
      <Route path="/data" component={DataPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id" component={ProjectDetailRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MobileMenuButton() {
  return (
    <div className="fixed bottom-4 left-4 z-50 md:hidden">
      <SidebarTrigger
        data-testid="button-sidebar-toggle-mobile"
        className="h-11 w-11 rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg"
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <SidebarProvider defaultOpen={true}>
            <div className="flex h-full w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <main className="flex-1 overflow-auto pb-20 md:pb-0">
                  <AppRouter />
                </main>
              </div>
              <MobileMenuButton />
            </div>
          </SidebarProvider>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
