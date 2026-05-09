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

// §18 LOCKED: Six-item sidebar in this exact order.
// Footer: light/dark, Admin (admins only), Log out.
//
// Icon notes:
//   - "UserStar" is specified in the spec but does NOT exist in lucide-react.
//     Using UserCheck as a placeholder. TODO §18: confirm lucide name and swap.
//   - Inbox is not part of the §18 six. Per §18 Inbox is reachable from inside
//     other pages. Until Phase 4 Clarity surfaces an inside-page Inbox entry,
//     we keep a transitional Inbox link as a separate group below the six.
//     TODO Phase 4: remove the transitional Inbox link once Clarity ships.
// Sidebar item 3 was "Roles" in §18. Locked by addendum
// v8-addendum-support-module.md (May 8, 2026): renamed to "Support" with
// the Earth icon. Support = system of current; Projects = system of future.
const navItems = [
  { title: "Agenda",   url: "/agenda",   icon: ListChecks },
  { title: "Clarity",  url: "/clarity",  icon: Lightbulb },
  { title: "Support",  url: "/support",  icon: Earth },
  { title: "Projects", url: "/projects", icon: Blocks },
  { title: "Review",   url: "/review",   icon: UserCheck }, // TODO §18: UserStar
  { title: "Data",     url: "/data",     icon: DatabaseZap },
];

const transitionalNavItems = [
  { title: "Inbox", url: "/inbox", icon: Inbox },
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
        {/* §18 locked six */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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

        {/* TRANSITIONAL — remove in Phase 4 (see comment above navItems) */}
        <SidebarGroup>
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {transitionalNavItems.map((item) => (
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
