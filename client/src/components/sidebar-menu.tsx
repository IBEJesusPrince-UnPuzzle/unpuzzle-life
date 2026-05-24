import { useState } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, ListChecks, ClipboardList, Inbox, FolderKanban, Users, Settings, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Agenda", path: "/agenda", icon: ListChecks },
  { label: "Review", path: "/review", icon: ClipboardList },
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Support", path: "/support", icon: Users },
  { label: "Calendar Sources", path: "/agenda/calendar-sources", icon: Calendar },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface SidebarMenuProps {
  className?: string;
}

export function SidebarMenuButton({ className }: SidebarMenuProps) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={className}
        data-testid="button-sidebar-menu"
      >
        <Menu className="w-5 h-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Button
                  key={item.path}
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn("w-full justify-start gap-3", isActive && "bg-primary/10 text-primary")}
                  onClick={() => {
                    window.location.href = item.path;
                    setOpen(false);
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
