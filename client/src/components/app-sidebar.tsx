import {
  LayoutDashboard, Inbox, Layers, Target, RotateCcw,
  Sun, Moon, Puzzle, CalendarDays, Timer, Upload
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Routine", url: "/routine", icon: Timer },
  { title: "Agenda", url: "/planner", icon: CalendarDays },
  { title: "Weekly Review", url: "/review", icon: RotateCcw },
  { title: "Clarity", url: "/horizons", icon: Layers },
  { title: "Import", url: "/import", icon: Upload },
];

export function AppSidebar({ isDark, toggleTheme }: { isDark: boolean; toggleTheme: () => void }) {
  const [location] = useLocation();

  const { data: stats } = useQuery<{
    inboxCount: number;
    pendingActions: number;
    habitsCompletedToday: number;
    totalActiveHabits: number;
  }>({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2.5 group" data-testid="link-home">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Puzzle className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">UnPuzzle Life</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 px-3">
            Navigate
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase()}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.title === "Inbox" && stats?.inboxCount ? (
                          <Badge variant="secondary" className="ml-auto text-xs h-5 min-w-5 justify-center px-1.5">
                            {stats.inboxCount}
                          </Badge>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
          data-testid="button-theme-toggle"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{isDark ? "Light mode" : "Dark mode"}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
