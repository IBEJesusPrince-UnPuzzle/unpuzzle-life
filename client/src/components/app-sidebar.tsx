import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useState, useEffect } from "react";
import {
  ListChecks, Lightbulb, Earth, Blocks, UserCheck, DatabaseZap,
  Inbox, Sun, Moon, Shield, LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// PR #42 — sidebar reorganized per user direction (May 12, 2026):
//
//   Primary group:  Agenda, Inbox, Review, Support, Projects
//   "More" group:   Clarity, Data
//   Admin group:    Admin (super_admin only)
//   Footer:         theme toggle + sidebar trigger, then sign out
//
// This supersedes the §18 "six-item sidebar in this exact order" lock.
// Inbox is promoted out of the transitional group and into primary.
// Clarity and Data demoted to a secondary "More" group — they're less
// frequent surfaces and the user wants them tucked under a heading.
//
// Icon notes:
//   - "UserStar" is specified in §18 but does not exist in lucide-react.
//     Using UserCheck as a placeholder. TODO: confirm lucide name and swap.
//   - Support = system of current; Projects = system of future
//     (v8-addendum-support-module.md, May 8, 2026).
const primaryNavItems = [
  { title: "Agenda",   url: "/agenda",   icon: ListChecks },
  { title: "Inbox",    url: "/inbox",    icon: Inbox },
  { title: "Review",   url: "/review",   icon: UserCheck }, // TODO: UserStar
  { title: "Support",  url: "/support",  icon: Earth },
  { title: "Projects", url: "/projects", icon: Blocks },
];

const moreNavItems = [
  { title: "Clarity", url: "/clarity", icon: Lightbulb },
  { title: "Data",    url: "/data",    icon: DatabaseZap },
];

export function AppSidebar() {
  const [location] = useHashLocation();
  const { user, logoutMutation } = useAuth();
  const { setOpenMobile } = useSidebar();

  const closeSidebar = () => setOpenMobile(false);

  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const isItemActive = (url: string) =>
    location === url || location.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <Link
          href="/agenda"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
          onClick={closeSidebar}
        >
          <img
            src="/unpuzzle-logo.png"
            alt="Logo"
            className="w-8 h-8 rounded-lg object-cover shrink-0"
          />
          <div className="group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm text-sidebar-foreground">
              UnPuzzle Life
            </span>
            <span className="block text-[11px] text-sidebar-foreground/60">
              Life OS
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Primary nav — the five daily-driver surfaces. */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url} onClick={closeSidebar}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Secondary nav — less frequent surfaces tucked under "More". */}
        <SidebarGroup>
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {moreNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url} onClick={closeSidebar}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === "super_admin" && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin"}
                    data-testid="nav-admin"
                  >
                    <Link href="/admin" onClick={closeSidebar}>
                      <Shield className="w-4 h-4" />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground"
            data-testid="button-theme-toggle"
          >
            {isDark ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span className="group-data-[collapsible=icon]:hidden">
              {isDark ? "Light mode" : "Dark mode"}
            </span>
          </button>

          <SidebarTrigger
            className="h-8 w-8 shrink-0 rounded-md border border-sidebar-border bg-sidebar"
          />
        </div>
        <button
          onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => { window.location.hash = "#/login"; } })}
          className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground mt-2 group-data-[collapsible=icon]:justify-center"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
