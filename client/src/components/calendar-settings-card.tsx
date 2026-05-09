// =============================================================================
// CalendarSettingsCard — PR #18c (revised in PR #18d, relabeled in PR #18e)
// =============================================================================
// Single "Schedule" card on the Responsibility edit screen. Owns the two
// fields a responsibility contributes to its calendar instances:
//
//   1. Frequency (RRULE)  — required; defaults to "Every week"
//   2. Color (hex)        — defaults to Peacock
//
// PR #18e note — the section is titled "Schedule" and the dropdown is labeled
// "Frequency" so the language flows from the Responsibility helper line
// ("recurring duty") into "how often you complete this duty". The internal
// component, prop, and type names keep "CalendarSettings" since they describe
// the underlying concept (calendar-level fields per Google's pattern), not
// the visible label.
//
// Order mirrors Google Calendar mobile: the repeat row sits ABOVE the calendar
// color row, so we keep the same vertical sequence.
//
// PR #18d revision — Google pattern alignment:
//   On Google, changing a calendar/category-level color or recurrence applies
//   to EVERY event in that calendar with no scope prompt. The scope prompt
//   (This / This and following / All) only fires when you edit an individual
//   instance from Day view, where "this one occurrence vs. all of them" is a
//   real distinction.
//
//   Per that pattern, this card now saves directly with no dialog. Edits at
//   the responsibility level always cascade to all instances. The scope
//   dialog has moved to the agenda task modal's edit flow (PR #18d).
// =============================================================================

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/color-picker";
import { RecurrenceEditor } from "@/components/recurrence-editor";
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
  // Persist callback. Saves cascade to all instances by definition (Google
  // calendar-level semantics).
  onSave: (next: CalendarSettings) => void;
};

export function CalendarSettingsCard({
  initial,
  onSave,
}: CalendarSettingsCardProps) {
  // Display values: fall back to defaults when the server has no value yet.
  const initialColor = initial.color ?? DEFAULT_AGENDA_COLOR_HEX;
  const initialRule = initial.recurrenceRule ?? "FREQ=WEEKLY";

  const [color, setColor] = useState<string>(initialColor);
  const [recurrenceRule, setRecurrenceRule] = useState<string>(initialRule);

  // Re-sync when server snapshot changes (e.g. after another tab edits the
  // row, or after a save invalidates the query).
  useEffect(() => {
    setColor(initial.color ?? DEFAULT_AGENDA_COLOR_HEX);
    setRecurrenceRule(initial.recurrenceRule ?? "FREQ=WEEKLY");
  }, [initial.color, initial.recurrenceRule]);

  function onColorChange(nextHex: string) {
    if (nextHex.toLowerCase() === color.toLowerCase()) return;
    setColor(nextHex);
    onSave({ color: nextHex, recurrenceRule });
  }

  function onRecurrenceChange(nextRule: string) {
    if (nextRule === recurrenceRule) return;
    setRecurrenceRule(nextRule);
    onSave({ color, recurrenceRule: nextRule });
  }

  return (
    <Card data-testid="card-schedule">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-0.5">
          <Label className="text-xs">Schedule</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            -how often you complete this duty, and how it shows on your
            calendar
          </p>
        </div>

        {/* Frequency first (Google order: repeat row above calendar color). */}
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="responsibility-recurrence">
            Frequency
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
    </Card>
  );
}
