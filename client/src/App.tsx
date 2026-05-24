import { useEffect } from "react";
import { Switch, Route, Router, Redirect, useLocation } from "wouter";
import { useHashLocation } from "@/lib/hash-location";
import { installKeyboardScroll } from "@/lib/keyboard-scroll";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthContext, useAuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { ReportIssueButton } from "@/components/report-issue-button";
import InboxPage from "@/pages/inbox";
import InboxFileItPage from "@/pages/inbox-file-it";
import InboxDoItLaterPage from "@/pages/inbox-do-it-later";
import SomedayPage from "@/pages/someday";
import ReviewPage from "@/pages/review";
import DataPage from "@/pages/data";
import ProjectDetailPage from "@/pages/project-detail";
import ProjectsPage from "@/pages/projects";
import ProjectEditPage from "@/pages/project-edit";
import AuthPage, { RegisterPage } from "@/pages/auth-page";
import AdminPage from "@/pages/admin";
import AgendaPage from "@/pages/agenda";
import AgendaTaskNewPage from "@/pages/agenda-task-new";
import AgendaTaskEditPage from "@/pages/agenda-task-edit";
import AgendaCalendarSourcesPage from "@/pages/agenda-calendar-sources";
import ClarityPage from "@/pages/clarity";
import SupportPage from "@/pages/support";
import SupportRolesPage from "@/pages/support-roles";
import SupportResponsibilitiesPage from "@/pages/support-responsibilities";
import SupportTypeListPage from "@/pages/support-type-list";
import SupportRoleDetailPage from "@/pages/support-role-detail";
import SupportRoleEditPage from "@/pages/support-role-edit";
import ResponsibilityViewPage from "@/pages/responsibility-view";
import ResponsibilityEditPage from "@/pages/responsibility-edit";
import DevEditPageDemoRoute from "@/pages/dev-edit-page-demo";
import NotFound from "@/pages/not-found";

function ProjectDetailRoute({ params }: { params: { id?: string } }) {
  const id = Number(params?.id);
  if (!id || isNaN(id)) return <NotFound />;
  return <ProjectDetailPage id={id} />;
}

// PR #23 — /projects/:id is the v2 edit page entry point. The legacy detail
// view stays mounted at a separate path so existing in-app links still
// resolve while the v2 work continues.
function ProjectIdRedirect({ params }: { params: { id?: string } }) {
  const id = params?.id;
  if (!id) return <NotFound />;
  return <Redirect to={`/projects/${id}/edit`} />;
}

// Old /roles routes redirect to /support (sidebar rename per addendum A1).
function RedirectRoles() {
  return <Redirect to="/support" />;
}
function RedirectRoleId({ params }: { params: { id?: string } }) {
  const id = params?.id;
  return <Redirect to={id ? `/support/roles/${id}` : "/support"} />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/agenda" />
      </Route>
      <Route path="/agenda" component={AgendaPage} />
      {/* PR #31 — page-mode replacements for the legacy dialog. */}
      <Route path="/agenda/tasks/new" component={AgendaTaskNewPage} />
      <Route path="/agenda/tasks/:id/edit" component={AgendaTaskEditPage} />
      <Route path="/agenda/calendar-sources" component={AgendaCalendarSourcesPage} />
      <Route path="/clarity" component={ClarityPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/support/roles" component={SupportRolesPage} />
      {/* /support/responsibilities mirrors /support/roles. Must be registered
          BEFORE the /support/:type catch-all so wouter matches it first. */}
      <Route path="/support/responsibilities" component={SupportResponsibilitiesPage} />
      {/* PR #33: Parameterized Support Makeup type page (people/places/things/providers/conditions). */}
      {/* Must register BEFORE any /support/* catch-alls; the inner page redirects on unknown :type. */}
      <Route path="/support/:type" component={SupportTypeListPage} />
      <Route path="/support/roles/new" component={SupportRoleEditPage} />
      <Route path="/support/roles/:id/edit" component={SupportRoleEditPage} />
      <Route path="/support/roles/:id" component={SupportRoleDetailPage} />
      <Route path="/responsibilities/new" component={ResponsibilityEditPage} />
      <Route path="/responsibilities/:id/edit" component={ResponsibilityEditPage} />
      <Route path="/responsibilities/:id" component={ResponsibilityViewPage} />
      {/* Legacy redirects — retired §18 "Roles" item became "Support" (addendum A1). */}
      <Route path="/roles" component={RedirectRoles} />
      <Route path="/roles/:id" component={RedirectRoleId} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id/edit" component={ProjectEditPage} />
      <Route path="/projects/:id/legacy" component={ProjectDetailRoute} />
      <Route path="/projects/:id" component={ProjectIdRedirect} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/data" component={DataPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/inbox/process/:id/file-it" component={InboxFileItPage} />
      <Route path="/inbox/process/:id/do-it-later" component={InboxDoItLaterPage} />
      <Route path="/someday" component={SomedayPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/dev/edit-page-demo" component={DevEditPageDemoRoute} />
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

function ReportButtonGate() {
  const { user } = useAuth();
  const [location] = useLocation();
  if (user?.role === "super_admin") return null;
  if (location === "/admin" || location === "/login") return null;
  return <ReportIssueButton />;
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
          <ReportButtonGate />
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
  // PR #48 — Install the global focusin scroll-into-view listener once on
  // mount so typeahead suggestions stay visible above the on-screen keyboard.
  useEffect(() => {
    installKeyboardScroll();
  }, []);
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
