// EditPageUndoBar — Phase 5 (§10, §11)
//
// Bottom bar that appears only when at least one item is marked for removal.
// "Removed N items from this draft. [Undo]"
//
// Per spec: "A bottom undo bar appears only when at least one item has been
// marked for removal." The Undo button here clears ALL marks-for-removal in
// one shot. Per-row inline [Undo] buttons (separate concern, lives next to
// each marked row) restore individual rows.

import { Button } from "@/components/ui/button";

export interface EditPageUndoBarProps {
  count: number;
  onUndoAll: () => void;
}

export function EditPageUndoBar({ count, onUndoAll }: EditPageUndoBarProps) {
  if (count <= 0) return null;
  const noun = count === 1 ? "item" : "items";
  return (
    <div
      className="sticky bottom-0 z-20 bg-muted/95 backdrop-blur border-t px-3 py-2 flex items-center gap-2"
      data-testid="edit-page-undo-bar"
      role="status"
      aria-live="polite"
    >
      <span
        className="text-xs text-foreground flex-1"
        data-testid="text-removal-count"
      >
        Removed {count} {noun} from this draft.
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onUndoAll}
        data-testid="button-undo-removals"
      >
        Undo
      </Button>
    </div>
  );
}
