// =============================================================================
// RecurrenceScopeDialog — PR #15
// =============================================================================
// When the user saves edits to OR deletes a recurring task occurrence, this
// dialog asks which scope the change should apply to. Three options, mirroring
// Google Calendar iOS:
//
//   ( ) This event
//   ( ) This and following events
//   ( ) All events
//
// The dialog is a reusable sheet — the same component is used for the Save
// flow and the Delete flow; the parent picks the title/confirm-label and
// handles the chosen scope in its own callback.
//
// "This and following" implementation (Google parity, decided in PR #15 spec):
//   - Truncate the original master: PATCH recurrenceEndDate = (editDate - 1)
//   - Create a new master from editDate forward with the edited fields
// =============================================================================

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type RecurrenceScope = "this" | "following" | "all";

export interface RecurrenceScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // "save" or "delete" — drives title and confirm-button label only.
  intent: "save" | "delete";
  // Fired when the user picks a scope and clicks the confirm button.
  // Parent is responsible for executing the actual mutation.
  onConfirm: (scope: RecurrenceScope) => void;
}

export function RecurrenceScopeDialog({
  open,
  onOpenChange,
  intent,
  onConfirm,
}: RecurrenceScopeDialogProps) {
  // Default to "this" — matches Google Calendar iOS default and is the
  // least destructive option.
  const [scope, setScope] = useState<RecurrenceScope>("this");

  // Reset selection every time the dialog opens, so a stale prior choice
  // never carries over from a previous mutation.
  useEffect(() => {
    if (open) setScope("this");
  }, [open]);

  const title = intent === "delete" ? "Delete recurring event" : "Edit recurring event";
  const confirmLabel = intent === "delete" ? "Delete" : "Save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-recurrence-scope">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as RecurrenceScope)}
            className="gap-3"
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="this" id="scope-this" data-testid="radio-scope-this" />
              <Label htmlFor="scope-this" className="cursor-pointer font-normal">
                This event
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="following" id="scope-following" data-testid="radio-scope-following" />
              <Label htmlFor="scope-following" className="cursor-pointer font-normal">
                This and following events
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="all" id="scope-all" data-testid="radio-scope-all" />
              <Label htmlFor="scope-all" className="cursor-pointer font-normal">
                All events
              </Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-scope-cancel"
          >
            Cancel
          </Button>
          <Button
            variant={intent === "delete" ? "destructive" : "default"}
            onClick={() => {
              onConfirm(scope);
              onOpenChange(false);
            }}
            data-testid="button-scope-confirm"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
