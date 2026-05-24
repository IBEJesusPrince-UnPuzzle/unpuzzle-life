// =============================================================================
// CalendarSettingsCard — PR #18c (revised in #18d, relabeled in #18e, expanded in #19)
// =============================================================================
// Single "Schedule" card on the Responsibility edit screen. Owns every field
// that determines when a responsibility shows up on the calendar:
//
//   PR #18c–#18e (cascade fields, live on the responsibilities row)
//     1. Frequency (RRULE)
//     2. Color
//
//   PR #19 (schedule fields, live on the master agenda_tasks row)
//     3. Date           (start date for all instances; defaults to today)
//     4. All-day        (checkbox; clears Time + Duration when on)
//     5. Time           (HH:MM; required when not all-day; blank by default)
//     6. Duration       (positive number + min/hr unit toggle)
//     7. End date       (only when all-day; blank = single-day)
//
// Field order matches agenda-task-modal.tsx so the muscle memory for picking
// a date / time / duration is identical between the +Task modal and the
// Responsibility edit page (locked Phase 5 decision).
//
// Save semantics:
//   - PR #18d Google parity: changes here cascade to all instances. There's
//     no "this / following / all" prompt at the responsibility level — that
//     dialog only appears in the agenda task modal's edit-virtual flow.
//   - The card autosaves on every committed change. The parent page wires
//     the mutation; this card just emits the latest snapshot via onSave.
//   - On a brand-new responsibility (no `initial.scheduleSeeded`), onSave
//     does NOT fire until the user picks a Time (or toggles All-day). This
//     enforces the locked "name + time" gate so the parent can post the
//     atomic create payload (storage.createResponsibility).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { RecurrenceEditor } from "@/components/recurrence-editor";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import { parseDuration, durationToMinutes } from "@/lib/duration";
import { CalendarDays, Clock } from "lucide-react";

// CalendarSettings — the full snapshot the card emits. The parent maps this
// to the API shape: color/recurrenceRule onto the responsibility row,
// startDate/time/durationMinutes/isAllDay/endDate onto the master agenda_tasks
// row (storage.ts splits the payload accordingly).
export type CalendarSettings = {
  color: string;
  recurrenceRule: string;
  // PR #24 — renamed from `date` to mirror agenda_tasks.start_date.
  startDate: string;                // YYYY-MM-DD
  isAllDay: boolean;
  time: string | null;              // HH:MM, null when isAllDay
  durationMinutes: number | null;   // null when isAllDay
  endDate: string | null;           // YYYY-MM-DD, null when not allDay or single-day
};

export type CalendarSettingsCardProps = {
  // Server snapshot. A brand-new responsibility passes color=null,
  // recurrenceRule=null, schedule=null — the card seeds defaults for
  // display but only emits onSave when the user has actually picked a
  // value (specifically, at minimum a Time, unless All-day is on).
  initial: {
    color: string | null;
    recurrenceRule: string | null;
    schedule: {
      // PR #24 — renamed from `date` to mirror agenda_tasks.start_date.
      startDate: string;
      time: string | null;
      durationMinutes: number | null;
      isAllDay: boolean;
      endDate: string | null;
    } | null;
  };
  // Persist callback. Saves cascade to all instances by definition (Google
  // calendar-level semantics).
  onSave: (next: CalendarSettings) => void;
};

// today's date in YYYY-MM-DD using the user's local clock (no UTC drift)
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CalendarSettingsCard({
  initial,
  onSave,
}: CalendarSettingsCardProps) {
  // Display values: fall back to defaults when the server has no value yet.
  const initialColor = initial.color ?? DEFAULT_AGENDA_COLOR_HEX;
  const initialRule = initial.recurrenceRule ?? "FREQ=WEEKLY";
  const initialDate = initial.schedule?.startDate ?? todayLocal();
  const initialIsAllDay = initial.schedule?.isAllDay ?? false;
  const initialTime = initial.schedule?.time ?? "";
  const initialEndDate = initial.schedule?.endDate ?? "";
  const initialDuration = parseDuration(
    initial.schedule?.durationMinutes ?? 60,
  );

  const [color, setColor] = useState<string>(initialColor);
  const [recurrenceRule, setRecurrenceRule] = useState<string>(initialRule);
  const [date, setDate] = useState<string>(initialDate);
  const [isAllDay, setIsAllDay] = useState<boolean>(initialIsAllDay);
  const [time, setTime] = useState<string>(initialTime);
  const [endDate, setEndDate] = useState<string>(initialEndDate);
  const [durValue, setDurValue] = useState<string>(initialDuration.value);
  const [durUnit, setDurUnit] = useState<"min" | "hr">(initialDuration.unit);

  // Re-sync when server snapshot changes (e.g. after another tab edits the
  // row, or after a save invalidates the query).
  useEffect(() => {
    setColor(initial.color ?? DEFAULT_AGENDA_COLOR_HEX);
    setRecurrenceRule(initial.recurrenceRule ?? "FREQ=WEEKLY");
    if (initial.schedule) {
      setDate(initial.schedule.startDate);
      setIsAllDay(initial.schedule.isAllDay);
      setTime(initial.schedule.time ?? "");
      setEndDate(initial.schedule.endDate ?? "");
      const d = parseDuration(initial.schedule.durationMinutes ?? 60);
      setDurValue(d.value);
      setDurUnit(d.unit);
    }
  }, [
    initial.color,
    initial.recurrenceRule,
    initial.schedule?.startDate,
    initial.schedule?.time,
    initial.schedule?.durationMinutes,
    initial.schedule?.isAllDay,
    initial.schedule?.endDate,
  ]);

  // Whether the current draft can be committed. On a brand-new responsibility
  // (no scheduleSeeded), at minimum Time must be picked (or All-day toggled).
  // This enforces the locked "name + time" gate from PR #19.
  const isReadyToSave = useMemo(() => {
    if (!date) return false;
    if (isAllDay) return true;
    if (!time) return false;
    if (durationToMinutes(durValue, durUnit) == null) return false;
    return true;
  }, [date, isAllDay, time, durValue, durUnit]);

  function commit(overrides: Partial<{
    color: string;
    recurrenceRule: string;
    date: string;
    isAllDay: boolean;
    time: string;
    endDate: string;
    durValue: string;
    durUnit: "min" | "hr";
  }> = {}) {
    const next = {
      color: overrides.color ?? color,
      recurrenceRule: overrides.recurrenceRule ?? recurrenceRule,
      date: overrides.date ?? date,
      isAllDay: overrides.isAllDay ?? isAllDay,
      time: overrides.time ?? time,
      endDate: overrides.endDate ?? endDate,
      durValue: overrides.durValue ?? durValue,
      durUnit: overrides.durUnit ?? durUnit,
    };
    // Gate: don't fire onSave on a brand-new responsibility until Time is set
    // (or All-day toggled). Prevents premature POSTs during the create flow.
    if (!next.date) return;
    if (!next.isAllDay) {
      if (!next.time) return;
      if (durationToMinutes(next.durValue, next.durUnit) == null) return;
    }
    onSave({
      color: next.color,
      recurrenceRule: next.recurrenceRule,
      startDate: next.date,
      isAllDay: next.isAllDay,
      time: next.isAllDay ? null : next.time,
      durationMinutes: next.isAllDay ? null : durationToMinutes(next.durValue, next.durUnit),
      endDate: next.isAllDay ? (next.endDate || null) : null,
    });
  }

  function onColorChange(nextHex: string) {
    if (nextHex.toLowerCase() === color.toLowerCase()) return;
    setColor(nextHex);
    commit({ color: nextHex });
  }

  function onRecurrenceChange(nextRule: string) {
    if (nextRule === recurrenceRule) return;
    setRecurrenceRule(nextRule);
    commit({ recurrenceRule: nextRule });
  }

  function onDateChange(next: string) {
    if (next === date) return;
    setDate(next);
    commit({ date: next });
  }

  function onAllDayChange(checked: boolean) {
    if (checked === isAllDay) return;
    setIsAllDay(checked);
    commit({ isAllDay: checked });
  }

  function onTimeChange(next: string) {
    if (next === time) return;
    setTime(next);
    commit({ time: next });
  }

  function onEndDateChange(next: string) {
    if (next === endDate) return;
    setEndDate(next);
    commit({ endDate: next });
  }

  function onDurValueChange(next: string) {
    if (next === durValue) return;
    setDurValue(next);
    commit({ durValue: next });
  }

  function onDurUnitChange(next: "min" | "hr") {
    if (next === durUnit) return;
    setDurUnit(next);
    commit({ durUnit: next });
  }

  return (
    <div className="space-y-4">
      {/* Starting: Date + All-day checkbox on one row */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs" htmlFor="responsibility-date">
            Starting…
          </Label>
          <Input
            id="responsibility-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="scroll-mt-24"
            data-testid="input-responsibility-date"
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="responsibility-all-day"
            checked={isAllDay}
            onCheckedChange={(v) => onAllDayChange(v === true)}
            data-testid="checkbox-responsibility-all-day"
          />
          <Label htmlFor="responsibility-all-day" className="cursor-pointer text-xs">
            All-day
          </Label>
        </div>
      </div>

      {/* End date — only when all-day. Empty means single-day. */}
      {isAllDay && (
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="responsibility-end-date">
            Until… <span className="text-muted-foreground text-xs">— leave blank for single day</span>
          </Label>
          <Input
            id="responsibility-end-date"
            type="date"
            value={endDate}
            min={date}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="scroll-mt-24"
            data-testid="input-responsibility-end-date"
          />
        </div>
      )}

      {/* At: Time + For: Duration on one row (hidden when all-day) */}
      {!isAllDay && (
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs flex items-center gap-1" htmlFor="responsibility-time">
              <Clock className="w-3 h-3" />
              At…
            </Label>
            <Input
              id="responsibility-time"
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="scroll-mt-24"
              data-testid="input-responsibility-time"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">For…</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={durValue}
                onChange={(e) => onDurValueChange(e.target.value)}
                className="flex-1 scroll-mt-24"
                data-testid="input-responsibility-duration-value"
              />
              <select
                value={durUnit}
                onChange={(e) => onDurUnitChange(e.target.value as "min" | "hr")}
                className="rounded-md border border-input bg-background px-2 text-sm h-9 scroll-mt-24"
                data-testid="select-responsibility-duration-unit"
              >
                <option value="min">min</option>
                <option value="hr">hr</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Frequency with calendar icon */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5" htmlFor="responsibility-recurrence">
          <CalendarDays className="w-3.5 h-3.5" />
          Frequency
        </Label>
        <RecurrenceEditor
          fieldId="responsibility-recurrence"
          value={recurrenceRule}
          onChange={onRecurrenceChange}
        />
      </div>

      {/* Color last. */}
      <div className="space-y-1.5">
        <Label className="text-xs">Color</Label>
        <ColorPicker value={color} onChange={onColorChange} />
      </div>
    </div>
  );
}
