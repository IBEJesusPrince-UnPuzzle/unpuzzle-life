// =============================================================================
// CalendarSettingsCard — PR #18c
// =============================================================================
// Single card on the Responsibility edit screen that owns the two fields a
// responsibility contributes to its calendar instances:
//
//   1. Recurrence (RRULE)  — required; defaults to "Every week"
//   2. Color (hex)         — defaults to Peacock
//
// Order mirrors Google Calendar mobile: the repeat row sits ABOVE the calendar
// color row, so we keep the same vertical sequence.
//
// Scope dialog wiring (Google parity, §11/§1278):
//   - First save (creating a brand-new responsibility): no scope prompt; the
//     fields persist directly.
//   - Subsequent edits to either color or recurrence on an existing
//     responsibility open RecurrenceScopeDialog (intent="save") asking
//     This / This and following / All. The chosen scope is sent to the
//     server. PR #18c stubs server behavior as scope="all" (full master
//     update); per-instance + following-only are PR #18d.
//
// State model:
//   - The card is fully controlled. Parent passes `initial` (server snapshot)
//     and the card calls `onSave({ color, recurrenceRule, scope })` after
//     the user confirms in the scope dialog (or directly, when no prior
//     value existed).
//   - Local edit state is independent of the parent's autosave draft —
//     calendar settings are not autosaved on every keystroke; they save
//     after the user picks a value (color tile click, recurrence dropdown
//     change, custom dialog save) and the scope dialog confirms.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/color-picker";
import { RecurrenceEditor } from "@/components/recurrence-editor";
import {
  RecurrenceScopeDialog,
  type RecurrenceScope,
} from "@/components/recurrence-scope-dialog";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";

export type CalendarSettings = {
  color: string;            // hex, e.g. "#039BE5"
  recurrenceRule: string;   // RRULE fragment, e.g. "FREQ=WEEKLY"
};

export type CalendarSettingsCardProps = {
  // Server snapshot. A brand-new responsibility passes color=null,
  // recurrenceRule=null — the card seeds defaults for display but only
  // emits onSave when the user actually picks a value.
  initial: {
    color: string | null;
    recurrenceRule: string | null;
  };
  // True when the responsibility row already exists on the server. When
  // false, scope dialog is suppressed (no instances exist yet to scope to).
  isExisting: boolean;
  // Persist callback. PR #18c stubs scope="all" server-side; the card always
  // forwards the user's pick so PR #18d can light up "this" / "following".
  onSave: (next: CalendarSettings & { scope: RecurrenceScope }) => void;
};

export function CalendarSettingsCard({
  initial,
  isExisting,
  onSave,
}: CalendarSettingsCardProps) {
  // Display values: fall back to defaults when the server has no value yet.
  const initialColor = initial.color ?? DEFAULT_AGENDA_COLOR_HEX;
  const initialRule = initial.recurrenceRule ?? "FREQ=WEEKLY";

  const [color, setColor] = useState<string>(initialColor);
  const [recurrenceRule, setRecurrenceRule] = useState<string>(initialRule);

  // Re-sync when server snapshot changes (e.g. after another tab edits the
  // row, or after the scope dialog completes a save and the parent
  // invalidates the query).
  useEffect(() => {
    setColor(initial.color ?? DEFAULT_AGENDA_COLOR_HEX);
    setRecurrenceRule(initial.recurrenceRule ?? "FREQ=WEEKLY");
  }, [initial.color, initial.recurrenceRule]);

  // Pending change waiting for scope confirmation. We capture the proposed
  // values at the moment the user changes a field so the scope dialog
  // confirms exactly what they picked, even if they tap another control
  // before resolving the dialog.
  const [pending, setPending] = useState<CalendarSettings | null>(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  // Track whether the row has any prior value on the server. The first
  // time a brand-new responsibility's color/recurrence is set, we skip the
  // scope dialog (there are no existing instances to scope against).
  const hasServerValue = useRef(
    initial.color !== null || initial.recurrenceRule !== null,
  );
  useEffect(() => {
    hasServerValue.current =
      initial.color !== null || initial.recurrenceRule !== null;
  }, [initial.color, initial.recurrenceRule]);

  function handleFieldChange(next: CalendarSettings) {
    // Brand-new responsibility OR row not yet persisted: save without prompt.
    if (!isExisting || !hasServerValue.current) {
      onSave({ ...next, scope: "all" });
      // Reflect the saved values immediately so the row reads as "saved".
      hasServerValue.current = true;
      return;
    }
    // Existing responsibility with a prior value: open the scope dialog.
    setPending(next);
    setScopeDialogOpen(true);
  }

  function onColorChange(nextHex: string) {
    if (nextHex.toLowerCase() === color.toLowerCase()) return;
    setColor(nextHex);
    handleFieldChange({ color: nextHex, recurrenceRule });
  }

  function onRecurrenceChange(nextRule: string) {
    if (nextRule === recurrenceRule) return;
    setRecurrenceRule(nextRule);
    handleFieldChange({ color, recurrenceRule: nextRule });
  }

  function onScopeConfirm(scope: RecurrenceScope) {
    if (!pending) return;
    onSave({ ...pending, scope });
    setPending(null);
  }

  function onScopeOpenChange(open: boolean) {
    setScopeDialogOpen(open);
    if (!open && pending) {
      // User dismissed the dialog without confirming — revert local state
      // back to the last server-known values so the UI doesn't lie about
      // what's persisted.
      setColor(initial.color ?? DEFAULT_AGENDA_COLOR_HEX);
      setRecurrenceRule(initial.recurrenceRule ?? "FREQ=WEEKLY");
      setPending(null);
    }
  }

  return (
    <Card data-testid="card-calendar-settings">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-0.5">
          <Label className="text-xs">Calendar settings</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            -how this responsibility shows up on your calendar
          </p>
        </div>

        {/* Recurrence first (Google order: repeat row above calendar color). */}
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="responsibility-recurrence">
            Recurrence
          </Label>
          <RecurrenceEditor
            fieldId="responsibility-recurrence"
            value={recurrenceRule}
            onChange={onRecurrenceChange}
          />
        </div>

        {/* Color second. */}
        <div className="space-y-1.5">
          <Label className="text-xs">Color</Label>
          <ColorPicker value={color} onChange={onColorChange} />
        </div>
      </CardContent>

      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        onOpenChange={onScopeOpenChange}
        intent="save"
        onConfirm={onScopeConfirm}
      />
    </Card>
  );
}
