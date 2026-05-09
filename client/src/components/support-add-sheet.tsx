import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Users, CheckSquare, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Bottom sheet opened from the /support header [+] button.
 *
 * Locked by addendum A5 (May 8, 2026). Two items today:
 *   - New role           → /support/roles/new  (placeholder until PR #17b)
 *   - New responsibility → toast placeholder until PR #18
 *
 * Future items (New person, New place, …) will live here as well.
 */
export function SupportAddSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const handleNewRole = () => {
    onOpenChange(false);
    // PR #17b builds /support/roles/new. For now route to a placeholder
    // page that explains. Toast for now to be honest about state.
    toast({
      title: "Role creation lands in PR #17b",
      description: "We'll wire this up next.",
    });
  };

  const handleNewResponsibility = () => {
    onOpenChange(false);
    toast({
      title: "Responsibility creation lands in PR #18",
      description: "Coming next.",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-8"
        data-testid="sheet-support-add"
      >
        <SheetHeader className="text-left mb-2">
          <SheetTitle className="text-base">Add to your support system</SheetTitle>
        </SheetHeader>

        <div className="space-y-1">
          <button
            onClick={handleNewRole}
            className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-muted text-left"
            data-testid="button-add-new-role"
          >
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Users className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">New role</p>
              <p className="text-xs text-muted-foreground">
                Add a new hat you wear
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
          </button>

          <button
            onClick={handleNewResponsibility}
            className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-muted text-left"
            data-testid="button-add-new-responsibility"
          >
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <CheckSquare className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">New responsibility</p>
              <p className="text-xs text-muted-foreground">
                A duty under one of your roles
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
