import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import InboxPage from "@/pages/inbox";
import HorizonsPage from "@/pages/horizons";
import ReviewPage from "@/pages/review";
import PlannerPage from "@/pages/planner";
import RoutinePage from "@/pages/routine";
import IdentityVotePage from "@/pages/identity-vote";
import ImportPage from "@/pages/import";
import UnPuzzlePage from "@/pages/unpuzzle";
import ProjectDetailPage from "@/pages/project-detail";
import ProjectsPage from "@/pages/projects";
import NotFound from "@/pages/not-found";
import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Menu, X, LayoutDashboard, Inbox, Timer, CalendarDays,
  RotateCcw, Layers, Upload, Sun, Moon, Puzzle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
      <Route path="/import" component={ImportPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id" component={ProjectDetailRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clarity", url: "/horizons", icon: Layers },
  { title: "UnPuzzle", url: "/unpuzzle", icon: Puzzle },
  { title: "Weekly Review", url: "/review", icon: RotateCcw },
  { title: "Import", url: "/import", icon: Upload },
];

function SlideMenu({ open, onClose, isDark, toggleTheme }: {
  open: boolean; onClose: () => void; isDark: boolean; toggleTheme: () => void;
}) {
  const [location] = useLocation();
  const { data: stats } = useQuery<{ inboxCount: number }>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
  });

  // Close menu on navigation (only when location actually changes)
  const prevLocation = useRef(location);
  useEffect(() => {
    if (prevLocation.current !== location && open) {
      onClose();
    }
    prevLocation.current = location;
  }, [location, open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="absolute inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`absolute inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-xl transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <img src="/unpuzzle-logo.png" alt="" className="w-5 h-5 object-contain" />
              </div>
              <span className="font-semibold text-base tracking-tight">UnPuzzle Life</span>
            </Link>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-4 py-2">
              Navigate
            </p>
            {navItems.map((item) => {
              const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
              return (
                <Link key={item.title} href={item.url}>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                    }`}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{item.title}</span>
                    {item.title === "Inbox" && stats?.inboxCount ? (
                      <Badge variant="secondary" className="text-xs h-5 min-w-5 justify-center px-1.5">
                        {stats.inboxCount}
                      </Badge>
                    ) : null}
                  </button>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
              data-testid="button-theme-toggle"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AppShell() {
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return (
    // Desktop: center a phone-width frame. Mobile: full screen.
    <div className="min-h-screen w-full bg-neutral-200 dark:bg-neutral-900 md:flex md:items-start md:justify-center md:py-4">
      <div className="flex flex-col h-screen w-full md:w-[390px] md:h-[844px] md:rounded-3xl md:shadow-2xl md:overflow-hidden md:border md:border-neutral-300 dark:md:border-neutral-700 relative">
      <main className="flex-1 overflow-hidden bg-background">
        <AppRouter />
      </main>

      {/* Floating menu button */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setMenuOpen(true)}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
          data-testid="menu-trigger"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Slide-out menu */}
      <SlideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isDark={isDark}
        toggleTheme={() => setIsDark(!isDark)}
      />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <AppShell />
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
