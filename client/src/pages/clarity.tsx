import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import { SidebarMenuButton } from "@/components/sidebar-menu";

export default function ClarityPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <SidebarMenuButton />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clarity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clarity ritual surface — coming in Phase 4.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Lightbulb className="w-10 h-10 mx-auto text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            The Clarity wizard is being rebuilt against the v8 spec
            (§6, §7). It will land in Phase 4 with the support-state
            check, today brief, and quick capture flow.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
