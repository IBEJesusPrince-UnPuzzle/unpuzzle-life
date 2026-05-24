// =============================================================================
// DisruptionResponseDialog — PR #53 Phase 3
// =============================================================================
//
// Triggered when user taps [Respond] on a Today card with a support warning.
// Per locked spec §9:
//   - First prompt uses "Because… / This may affect…" framing
//   - All four choices shown immediately. No staging.
//   - Without an existing workaround: [Add workaround], [Create project],
//     [Do both], [Later]
//   - If a workaround already exists: first button becomes [Use workaround]
//
// =============================================================================

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, FolderPlus, ArrowRightLeft, Clock, ChevronDown, ChevronUp } from "lucide-react";

export type DisruptionChoice = "workaround" | "project" | "both" | "later";

export interface AffectedItem {
  id: number;
  name: string;
  type: "responsibility" | "agenda_task" | "project_task";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supportName: string;
  unavailableReason?: string | null;
  affectedItems: AffectedItem[];  // All items affected by this unavailable support
  isLoadingItems?: boolean;  // Loading state for affected items
  itemsError?: string | null;  // Error message if loading failed
  hasExistingWorkaround: boolean;
  onChoose: (choice: DisruptionChoice) => void;
  onViewItem?: (item: AffectedItem) => void;  // Navigate to view an item
}

export function DisruptionResponseDialog({
  open,
  onOpenChange,
  supportName,
  unavailableReason,
  affectedItems,
  isLoadingItems,
  itemsError,
  hasExistingWorkaround,
  onChoose,
  onViewItem,
}: Props) {
  const [showAllItems, setShowAllItems] = useState(false);

  // Show first 2 items, then "View all" if there are more
  const displayedItems = showAllItems ? affectedItems : affectedItems.slice(0, 2);
  const hasMoreItems = affectedItems.length > 2;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Support issue
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Because… */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Because…
            </p>
            <p className="text-sm text-foreground">
              {supportName} is unavailable
              {unavailableReason && (
                <span className="text-muted-foreground"> ({unavailableReason})</span>
              )}
            </p>
          </div>

          {/* This may affect… */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              This may affect…
              {!isLoadingItems && (
                <span className="text-muted-foreground font-normal ml-1">
                  ({affectedItems.length} {affectedItems.length === 1 ? "item" : "items"})
                </span>
              )}
            </p>
            {isLoadingItems ? (
              <p className="text-sm text-muted-foreground">Loading affected items…</p>
            ) : itemsError ? (
              <p className="text-sm text-destructive">Error loading items: {itemsError}</p>
            ) : affectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items currently use this support.</p>
            ) : (
              <>
                <ul className="text-sm text-foreground space-y-1">
                  {displayedItems.map((item) => (
                    <li key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">•</span>
                        {item.name}
                        <span className="text-xs text-muted-foreground capitalize">
                          ({item.type.replace("_", " ")})
                        </span>
                      </span>
                      {onViewItem && (
                        <button
                          onClick={() => onViewItem(item)}
                          className="text-xs text-primary hover:underline"
                          data-testid={`button-view-affected-${item.type}-${item.id}`}
                        >
                          View
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {hasMoreItems && (
                  <button
                    onClick={() => setShowAllItems(!showAllItems)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
                    data-testid="button-toggle-view-all"
                  >
                    {showAllItems ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" /> View all {affectedItems.length} items
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">
              What would you like to do?
            </p>

            <div className="grid grid-cols-2 gap-2">
              {/* Add/Use workaround */}
              <Button
                variant="outline"
                className="h-auto py-3 px-2 flex flex-col items-center gap-1.5 text-center"
                onClick={() => onChoose("workaround")}
                data-testid="button-disruption-workaround"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs leading-tight">
                  {hasExistingWorkaround ? "Use workaround" : "Add workaround"}
                </span>
              </Button>

              {/* Create project */}
              <Button
                variant="outline"
                className="h-auto py-3 px-2 flex flex-col items-center gap-1.5 text-center"
                onClick={() => onChoose("project")}
                data-testid="button-disruption-project"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="text-xs leading-tight">Create project</span>
              </Button>

              {/* Do both */}
              <Button
                variant="outline"
                className="h-auto py-3 px-2 flex flex-col items-center gap-1.5 text-center"
                onClick={() => onChoose("both")}
                data-testid="button-disruption-both"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-xs leading-tight">Do both</span>
              </Button>

              {/* Later */}
              <Button
                variant="ghost"
                className="h-auto py-3 px-2 flex flex-col items-center gap-1.5 text-center"
                onClick={() => onChoose("later")}
                data-testid="button-disruption-later"
              >
                <Clock className="w-4 h-4" />
                <span className="text-xs leading-tight">Later</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
