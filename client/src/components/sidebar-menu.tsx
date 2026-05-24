import { SidebarTrigger } from "@/components/ui/sidebar";

interface SidebarMenuButtonProps {
  className?: string;
}

export function SidebarMenuButton({ className }: SidebarMenuButtonProps) {
  return <SidebarTrigger className={className} />;
}
