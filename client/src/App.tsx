import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthContext, useAuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { ImpersonationBanner } from "@/components/impersonation-banner";
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
import AuthPage, { RegisterPage } from "@/pages/auth-page";
import AdminPage from "@/pages/admin";
import SomedayPage from "@/pages/someday";
import WizardPage from "@/pages/wizard";
import DraftReviewPage from "@/pages/draft-review";
import ProjectBuilderPage from "@/pages/project-builder";
import NotFound from "@/pages/not-found";

function ProjectDetailRoute({ params }: { params: { id?: string } }) {
  const id = Number(params?.id);
  if (!id || isNaN(id)) return <NotFound />;
  return <ProjectDetailPage id={id} />;
}

function ProjectBuilderRoute({ params }: { params: { id?: string } }) {
  const id = Number(params?.id);
  if (!id || isNaN(id)) return <NotFound />;
  return <ProjectBuilderPage id={String(id)} />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/horizons" component={HorizonsPage} />
      <Route path="/unpuzzle" component={UnPuzzlePage} />
      <Route path="/routine">{() => <RoutinePage />}</Route>
      <Route path="/routine/:id">{(params) => <RoutinePage filterIdentityId={Number(params.id)} />}</Route>
      <Route path="/planner" component={PlannerPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/identity-vote" component={IdentityVotePage} />
      <Route path="/data" component={DataPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id/build" component={ProjectBuilderRoute} />
      <Route path="/projects/:id" component={ProjectDetailRoute} />
      <Route path="/drafts" component={DraftReviewPage} />
      <Route path="/someday" component={SomedayPage} />
      <Route path="/wizard" component={WizardPage} />
      <Route path="/admin" component={AdminPage} />
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

function AuthGuard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  if (!user) {
    // Check hash for register route (query params in hash break wouter matching)
    const hash = window.location.hash || "";
    const hashPath = hash.replace(/^#/, "").split("?")[0];
    if (hashPath === "/register") {
      return <RegisterPage />;
    }
    return (
      <Switch>
        <Route path="/login" component={AuthPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <>
      <ImpersonationBanner />
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
    </>
  );
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <AuthProvider>
            <AuthGuard />
          </AuthProvider>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
