// =============================================================================
// AgendaTaskModal — Phase 3a (§22a)
// =============================================================================
// One modal handles three flows:
//
//   1. CREATE (standalone)     — opened by the Agenda + Task button.
//                                 POST /api/agenda-tasks with origin="standalone"
//                                 and the user-typed title.
//
//   2. EDIT (real row)         — opened by tapping a real (non-virtual)
//                                 agenda card. PATCH /api/agenda-tasks/:id.
//
//   3. EDIT (virtual instance) — opened by tapping a virtual recurring
//                                 instance. We do NOT mutate the master row;
//                                 instead we POST a brand-new row that carries
//                                 seriesId + originalDate + isOverride=1, which
//                                 the §22a window-merge will use to replace
//                                 that single occurrence (Phase 2 logic).
//
// Standalone-only is the locked Phase 3a +Task scope (§18 + §22a). Linking
// new rows to a responsibility / project_task happens in Phase 5 when those
// edit UIs ship.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import {
  buildDropdownOptions,
  describeCustomRule,
  oneYearOut,
  optionToRule,
  ruleToOption,
  type StandardOption,
} from "@/lib/recurrence-form";
import type { AgendaTask } from "@shared/schema";

// The window endpoint enriches AgendaTask with these virtual-instance fields.
export type AgendaWindowItem = AgendaTask & {
  isVirtual?: boolean;
  masterId?: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-fill the create form with this date (Day view's current day).
  defaultDate: string; // YYYY-MM-DD
  // When set, modal is in edit mode. Otherwise it's create mode.
  editing?: AgendaWindowItem | null;
};

// Convert minutes to a friendly value/unit pair for the duration input.
function parseDuration(min: number | null | undefined): {
  value: string;
  unit: "min" | "hr";
} {
  if (!min || min <= 0) return { value: "30", unit: "min" };
  if (min % 60 === 0) return { value: String(min / 60), unit: "hr" };
  return { value: String(min), unit: "min" };
}

function durationToMinutes(value: string, unit: "min" | "hr"): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "hr" ? Math.round(n * 60) : Math.round(n);
}

export function AgendaTaskModal({
  open,
  onOpenChange,
  defaultDate,
  editing,
}: Props) {
  const { toast } = useToast();

  // Mode resolution. Virtual rows have isVirtual=true and a non-null masterId.
  const mode: "create" | "edit-real" | "edit-virtual" = useMemo(() => {
    if (!editing) return "create";
    if (editing.isVirtual) return "edit-virtual";
    return "edit-real";
  }, [editing]);

  // Form state.
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  // Phase 3c — multi-day all-day events. Empty string means "single-day"
  // (sent to the server as null). Only meaningful when isAllDay is true.
  const [endDate, setEndDate] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [time, setTime] = useState("09:00");
  const [durValue, setDurValue] = useState("30");
  const [durUnit, setDurUnit] = useState<"min" | "hr">("min");
  const [color, setColor] = useState(DEFAULT_AGENDA_COLOR_HEX);
  const [notes, setNotes] = useState("");

  // PR #14 — recurrence (§8 prologue b + §22a)
  // recurrenceOption drives the dropdown; customRuleSnapshot holds the
  // verbatim rule string when we open an existing row whose RRULE doesn't
  // match any of the 6 standard options (the dropdown then renders a
  // synthetic "customExisting" item that's read-only until PR #14b ships
  // the Custom dialog). recurrenceEndDate is REQUIRED whenever option != none.
  const [recurrenceOption, setRecurrenceOption] = useState<StandardOption>("none");
  const [customRuleSnapshot, setCustomRuleSnapshot] = useState<string | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  // §22a 1-year cap prompt state. pendingEndDate holds the user's typed
  // value while the AlertDialog is open.
  const [showCapPrompt, setShowCapPrompt] = useState(false);
  const [pendingEndDate, setPendingEndDate] = useState("");

  // Reset/seed whenever the modal opens or the editing target changes.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title ?? "");
      setDate(editing.date);
      // Seed end-date from the row only when it differs from start (otherwise
      // leave blank so the UI shows "single-day" by default).
      const seedEnd = editing.endDate && editing.endDate !== editing.date ? editing.endDate : "";
      setEndDate(seedEnd);
      setIsAllDay(editing.isAllDay === 1);
      setTime(editing.time ?? "09:00");
      const dur = parseDuration(editing.durationMinutes);
      setDurValue(dur.value);
      setDurUnit(dur.unit);
      setColor(editing.color ?? DEFAULT_AGENDA_COLOR_HEX);
      setNotes(editing.notes ?? "");
      // PR #14 — recurrence seeding.
      const matched = ruleToOption(editing.recurrenceRule ?? null, editing.date);
      if (matched === null) {
        // Existing rule doesn't match any standard → hold it in a snapshot
        // and surface a read-only "Custom (…)" dropdown item.
        setRecurrenceOption("customExisting");
        setCustomRuleSnapshot(editing.recurrenceRule ?? null);
      } else {
        setRecurrenceOption(matched);
        setCustomRuleSnapshot(null);
      }
      setRecurrenceEndDate(editing.recurrenceEndDate ?? "");
    } else {
      setTitle("");
      setDate(defaultDate);
      setEndDate("");
      setIsAllDay(false);
      setTime("09:00");
      setDurValue("30");
      setDurUnit("min");
      setColor(DEFAULT_AGENDA_COLOR_HEX);
      setNotes("");
      setRecurrenceOption("none");
      setCustomRuleSnapshot(null);
      setRecurrenceEndDate("");
    }
  }, [open, editing, defaultDate]);

  // Compute the active RRULE for the current form state.
  //   - none → null
  //   - customExisting → the snapshot we held from the row (untouched)
  //   - any standard option → derived from the start date
  // PR #14 disables the "custom" entry (it shows a toast + reverts), so we
  // never see it in this function.
  function activeRule(): string | null {
    if (recurrenceOption === "none") return null;
    if (recurrenceOption === "customExisting") return customRuleSnapshot;
    return optionToRule(recurrenceOption, date);
  }

  function buildPayload() {
    const durationMinutes = isAllDay ? null : durationToMinutes(durValue, durUnit);
    // Phase 3c — endDate is only sent when isAllDay AND the user picked
    // an end > start. Otherwise it's null. The server enforces these rules
    // again as a defense in depth.
    const payloadEndDate =
      isAllDay && endDate && endDate > date ? endDate : null;
    const rule = activeRule();
    return {
      title: title.trim() || null,
      date,
      endDate: payloadEndDate,
      isAllDay: isAllDay ? 1 : 0,
      time: isAllDay ? null : time,
      durationMinutes,
      color,
      notes: notes.trim() || null,
      // PR #14 — recurrence fields. Send explicit null when option=none
      // so a previously-recurring master can be flipped back to standalone.
      recurrenceRule: rule,
      recurrenceEndDate: rule ? recurrenceEndDate : null,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "edit-real" && editing) {
        const r = await apiRequest("PATCH", `/api/agenda-tasks/${editing.id}`, buildPayload());
        return r.json();
      }
      if (mode === "edit-virtual" && editing) {
        // Override creation: a NEW row, seriesId points back to the master,
        // originalDate stamps which instance is being replaced. The §22a
        // window query will hide the virtual occurrence whose date matches
        // an existing override row.
        // PR #14 — overrides themselves never carry recurrence (Google parity:
        // "Only this event" can't change the rule). Strip those fields.
        const { recurrenceRule: _r, recurrenceEndDate: _re, ...overrideBase } = buildPayload();
        const payload = {
          ...overrideBase,
          origin: "standalone" as const,
          seriesId: editing.masterId ?? editing.id,
          originalDate: editing.date,
          isOverride: 1,
        };
        const r = await apiRequest("POST", "/api/agenda-tasks", payload);
        return r.json();
      }
      // Create
      const payload = {
        ...buildPayload(),
        origin: "standalone" as const,
      };
      const r = await apiRequest("POST", "/api/agenda-tasks", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({
        title: "Could not save",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editing || mode !== "edit-real") return;
      await apiRequest("DELETE", `/api/agenda-tasks/${editing.id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
  });

  const titleText =
    mode === "create"
      ? "Add task"
      : mode === "edit-virtual"
        ? "Edit this occurrence"
        : "Edit task";

  // Phase 3c — disable Save if the user typed an end date that's earlier than
  // the start date. (Empty endDate means single-day and is always valid.)
  const endDateValid = !isAllDay || !endDate || endDate >= date;

  // PR #14 — recurrence-end validation (only enforced when option != none
  // and we're NOT in edit-virtual mode, where recurrence fields are hidden).
  const recurrenceActive =
    mode !== "edit-virtual" && recurrenceOption !== "none";
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const recEndValid =
    !recurrenceActive ||
    (dateRe.test(recurrenceEndDate) &&
      recurrenceEndDate >= date &&
      recurrenceEndDate <= oneYearOut(date));

  const canSave =
    title.trim().length > 0 &&
    dateRe.test(date) &&
    endDateValid &&
    recEndValid;

  // PR #14 — dropdown items, dynamically labeled per the current start date.
  // When editing a row whose existing rule doesn't match a standard, prepend
  // a synthetic "customExisting" item so users see what's currently saved.
  const dropdownItems = useMemo(() => {
    const base = buildDropdownOptions(date);
    if (recurrenceOption === "customExisting" && customRuleSnapshot) {
      return [
        { value: "customExisting" as StandardOption, label: describeCustomRule(customRuleSnapshot) },
        ...base,
      ];
    }
    return base;
  }, [date, recurrenceOption, customRuleSnapshot]);

  // Handle dropdown selection. "custom" is a stub in PR #14 — show a toast
  // and revert. Everything else commits and seeds a default end-date if the
  // user hasn't picked one yet.
  function onRecurrenceChange(next: StandardOption) {
    if (next === "custom") {
      toast({
        title: "Custom recurrence — coming soon",
        description:
          "Custom intervals (every N days/weeks/months) ship in the next update.",
      });
      return;
    }
    // Switching AWAY from a customExisting drops the snapshot.
    if (recurrenceOption === "customExisting" && next !== "customExisting") {
      setCustomRuleSnapshot(null);
    }
    setRecurrenceOption(next);
    if (next === "none") {
      setRecurrenceEndDate("");
    } else if (!recurrenceEndDate) {
      setRecurrenceEndDate(oneYearOut(date));
    }
  }

  // Handle Ends-on date input. If the user types a date past start + 1 year,
  // open the §22a prompt instead of committing.
  function onRecurrenceEndDateChange(next: string) {
    if (!next) {
      setRecurrenceEndDate(next);
      return;
    }
    if (dateRe.test(next) && next > oneYearOut(date)) {
      setPendingEndDate(next);
      setShowCapPrompt(true);
      return;
    }
    setRecurrenceEndDate(next);
  }

  // §22a prompt actions.
  function capAtOneYear() {
    setRecurrenceEndDate(oneYearOut(date));
    setPendingEndDate("");
    setShowCapPrompt(false);
  }
  function convertToResponsibilityStub() {
    toast({
      title: "Coming in Phase 5",
      description:
        "Convert-to-responsibility lands when the Responsibility edit page ships.",
    });
    setRecurrenceEndDate(oneYearOut(date));
    setPendingEndDate("");
    setShowCapPrompt(false);
  }
  function cancelCapPrompt() {
    setPendingEndDate("");
    setShowCapPrompt(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-agenda-task">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="What is this task?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              data-testid="input-task-title"
            />
          </div>

          {/* Date (becomes "Start date" when all-day with multi-day support) */}
          <div className="space-y-1.5">
            <Label htmlFor="task-date">{isAllDay ? "Start date" : "Date"}</Label>
            <Input
              id="task-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-task-date"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-all-day"
              checked={isAllDay}
              onCheckedChange={(v) => setIsAllDay(v === true)}
              data-testid="checkbox-task-all-day"
            />
            <Label htmlFor="task-all-day" className="cursor-pointer">
              All-day
            </Label>
          </div>

          {/* End date — only when all-day. Empty means single-day. (Phase 3c) */}
          {isAllDay && (
            <div className="space-y-1.5">
              <Label htmlFor="task-end-date">
                End date <span className="text-muted-foreground text-xs">— leave blank for single day</span>
              </Label>
              <Input
                id="task-end-date"
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-task-end-date"
              />
              {!endDateValid && (
                <p className="text-xs text-destructive" data-testid="text-end-date-error">
                  End date must be on or after the start date.
                </p>
              )}
            </div>
          )}

          {/* Time + duration (hidden when all-day) */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-time">Start time</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  data-testid="input-task-time"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={durValue}
                    onChange={(e) => setDurValue(e.target.value)}
                    className="flex-1"
                    data-testid="input-task-duration-value"
                  />
                  <select
                    value={durUnit}
                    onChange={(e) => setDurUnit(e.target.value as "min" | "hr")}
                    className="rounded-md border border-input bg-background px-2 text-sm"
                    data-testid="select-task-duration-unit"
                  >
                    <option value="min">min</option>
                    <option value="hr">hr</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Recurrence (PR #14) — hidden in edit-virtual mode (Google parity:
              "Only this event" can't change the recurrence rule; that lives on
              the master series). */}
          {mode !== "edit-virtual" && (
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence">Recurrence</Label>
              <select
                id="task-recurrence"
                value={recurrenceOption}
                onChange={(e) => onRecurrenceChange(e.target.value as StandardOption)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-task-recurrence"
              >
                {dropdownItems.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recurrence end date — only when option != none. Capped at
              start + 1 year by the §22a prompt. */}
          {mode !== "edit-virtual" && recurrenceActive && (
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence-end">Ends on</Label>
              <Input
                id="task-recurrence-end"
                type="date"
                value={recurrenceEndDate}
                min={date}
                onChange={(e) => onRecurrenceEndDateChange(e.target.value)}
                data-testid="input-task-recurrence-end"
              />
              {recurrenceEndDate && !recEndValid && (
                <p className="text-xs text-destructive" data-testid="text-recurrence-end-error">
                  Ends-on must be on or after the start date and within 1 year.
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="textarea-task-notes"
            />
          </div>

          {mode === "edit-virtual" && (
            <p className="text-xs text-muted-foreground">
              Saving will only change this single occurrence. The recurring
              series stays intact.
            </p>
          )}
        </div>

        {/* §22a end-date prompt (PR #14). Triggered when the user picks an
            end date past start + 1 year. */}
        <AlertDialog open={showCapPrompt} onOpenChange={(o) => !o && cancelCapPrompt()}>
          {/* z-[60] forces this prompt above the parent Dialog's z-50 stack
              — without it, the alert content sits in the same layer as the
              Dialog and visually merges with it. */}
          <AlertDialogContent
            data-testid="alert-recurrence-cap"
            className="z-[60]"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>This recurrence goes past a year</AlertDialogTitle>
              <AlertDialogDescription>
                What do you want to do?
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Override the default footer (flex-col-reverse + sm:flex-row)
                because we want a vertical stack on every breakpoint with
                clear top-to-bottom reading order. */}
            <div className="flex flex-col gap-2 mt-4">
              <AlertDialogAction
                onClick={capAtOneYear}
                data-testid="button-recurrence-cap"
              >
                Cap at 1 year
              </AlertDialogAction>
              <AlertDialogAction
                onClick={convertToResponsibilityStub}
                data-testid="button-recurrence-convert"
              >
                Convert to responsibility
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={cancelCapPrompt}
                data-testid="button-recurrence-cap-cancel"
                className="mt-0"
              >
                Cancel
              </AlertDialogCancel>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
          {mode === "edit-real" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-task-delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-task-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              data-testid="button-task-save"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
