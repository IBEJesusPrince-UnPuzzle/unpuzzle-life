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
import RoutinePage from "@/pages/routine";
import PlannerPage from "@/pages/planner";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { LayoutDashboard, Inbox, Layers, Target, RotateCcw, Moon, Sun, CalendarClock, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/horizons" component={HorizonsPage} />
      <Route path="/habits" component={HabitsPage} />
      <Route path="/routine" component={RoutinePage} />
      <Route path="/planner" component={PlannerPage} />
      <Route path="/review" component={ReviewPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const mobileNavItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox, showBadge: true },
  { href: "/horizons", label: "Horizons", icon: Layers },
  { href: "/habits", label: "Habits", icon: Target },
  { href: "/routine", label: "Routine", icon: CalendarClock },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/review", label: "Review", icon: RotateCcw },
];

function MobileNav({ isDark, toggleTheme }: { isDark: boolean; toggleTheme: () => void }) {
  const [location] = useLocation();
  const { data: stats } = useQuery<{ inboxCount: number }>({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {mobileNavItems.map(({ href, label, icon: Icon, showBadge }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                className={`flex flex-col items-center justify-center gap-0.5 w-full h-full px-1 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {showBadge && stats?.inboxCount ? (
                    <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {stats.inboxCount}
                    </span>
                  ) : null}
                </span>
                <span className="text-[9px] font-medium leading-none">{label}</span>
              </button>
            </Link>
          );
        })}
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-0.5 w-full h-full px-1 text-muted-foreground transition-colors"
          data-testid="mobile-theme-toggle"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="text-[9px] font-medium leading-none">{isDark ? "Light" : "Dark"}</span>
        </button>
      </div>
    </nav>
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
                <header className="hidden md:flex items-center gap-2 p-2 border-b shrink-0">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                </header>

                <main className="flex-1 overflow-hidden pb-14 md:pb-0">
                  <AppRouter />
                </main>
                <MobileNav isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
              </div>
            </div>
          </SidebarProvider>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
