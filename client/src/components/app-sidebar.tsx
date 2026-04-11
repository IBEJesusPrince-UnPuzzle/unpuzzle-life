import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Layers, Puzzle, RotateCcw, Database, Sun, Moon, Shield, LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clarity", url: "/horizons", icon: Layers },
  { title: "UnPuzzle", url: "/unpuzzle", icon: Puzzle },
  { title: "Weekly Review", url: "/review", icon: RotateCcw },
  { title: "Data", url: "/data", icon: Database },
];

export function AppSidebar() {
  const [location] = useHashLocation();
  const { user, logoutMutation } = useAuth();

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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
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
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/"
                    ? location === "/"
                    : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

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
                  <Link href="/admin">
                    <Shield className="w-4 h-4" />
                    <span>Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

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
