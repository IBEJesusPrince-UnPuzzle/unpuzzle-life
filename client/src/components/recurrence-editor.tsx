// =============================================================================
// RecurrenceEditor — PR #18c
// =============================================================================
// Date-agnostic recurrence dropdown for responsibilities. Mirrors Google
// Calendar's mobile picker copy:
//
//   Every day / Every week / Every month / Every year / Custom...
//
// Recurrence is REQUIRED on a responsibility, so there is no "Does not repeat"
// option. The default for a brand-new responsibility is "Every week" (matches
// the legacy `cadence` default in the schema).
//
// Custom dialog parity:
//   - Selecting "Custom..." opens the existing CustomRecurrenceDialog.
//   - The dialog itself needs an isoDate anchor for BYDAY / BYMONTHDAY math;
//     we pass today's date as a silent default. The user never sees this date;
//     it just seeds the dialog's defaults the way Google does on a fresh event.
//   - Existing rules that aren't a bare FREQ (e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR
//     from the seed data) render as a synthetic "customExisting" item so the
//     pre-existing detail isn't lost when opening the editor.
// =============================================================================

import { useMemo, useState } from "react";
import { CustomRecurrenceDialog } from "@/components/custom-recurrence-dialog";
import {
  buildResponsibilityDropdownOptions,
  describeCustomRule,
  responsibilityOptionToRule,
  responsibilityRuleToOption,
  todayIso,
  type StandardOptionRequired,
} from "@/lib/recurrence-form";

export type RecurrenceEditorProps = {
  // Current RRULE string (RFC 5545 fragment, no leading "RRULE:"). Null/empty
  // means the row currently has no rule; the editor will show the default
  // "Every week" selection but will not emit onChange until the user picks.
  value: string | null | undefined;
  // Fires with a new RRULE string. Standard options emit a bare FREQ form;
  // Custom emits whatever the dialog produces.
  onChange: (rule: string) => void;
  // Optional id used for the label/testid suffix. Defaults to "recurrence".
  fieldId?: string;
};

export function RecurrenceEditor({
  value,
  onChange,
  fieldId = "recurrence",
}: RecurrenceEditorProps) {
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  // Standard options + an optional "customExisting" prepended when the
  // current rule doesn't match a bare FREQ form.
  const matched = responsibilityRuleToOption(value);
  const isCustomExisting = !!value && matched === null;

  const dropdownItems = useMemo(() => {
    const base = buildResponsibilityDropdownOptions();
    if (isCustomExisting && value) {
      return [
        { value: "customExisting" as StandardOptionRequired, label: describeCustomRule(value) },
        ...base,
      ];
    }
    return base;
  }, [isCustomExisting, value]);

  // What the <select> should display right now. If the rule is a bare FREQ,
  // show that. If it's a complex rule, show the synthetic customExisting row.
  // If there's no rule at all, default the visible selection to "weekly".
  const currentValue: StandardOptionRequired = isCustomExisting
    ? "customExisting"
    : (matched ?? "weekly");

  function onSelectChange(next: StandardOptionRequired) {
    if (next === "custom") {
      // Open the dialog. Don't commit the change until onSave fires; if the
      // user cancels, the dropdown should snap back to its previous value.
      setCustomDialogOpen(true);
      return;
    }
    if (next === "customExisting") {
      // The synthetic readback row; reopen the Custom dialog seeded with the
      // existing rule so the user can adjust it.
      setCustomDialogOpen(true);
      return;
    }
    const rule = responsibilityOptionToRule(next);
    if (rule) onChange(rule);
  }

  function onCustomDialogSave(rule: string, _endDate: string) {
    // Responsibilities don't carry recurrenceEndDate (no per-row end date —
    // recurrence is unbounded at the responsibility level). We discard the
    // endDate and persist only the rule itself.
    if (rule) onChange(rule);
    setCustomDialogOpen(false);
  }

  // Custom dialog needs an isoDate anchor. For responsibilities we pass today
  // as a silent default — the user never sees this date.
  const anchor = todayIso();

  return (
    <>
      <select
        id={fieldId}
        value={currentValue}
        onChange={(e) => onSelectChange(e.target.value as StandardOptionRequired)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        data-testid={`select-${fieldId}`}
      >
        {dropdownItems.map((it) => (
          <option key={it.value} value={it.value}>
            {it.label}
          </option>
        ))}
      </select>

      <CustomRecurrenceDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        startDate={anchor}
        initialRule={isCustomExisting ? value ?? null : null}
        initialEndDate=""
        onSave={onCustomDialogSave}
      />
    </>
  );
}
