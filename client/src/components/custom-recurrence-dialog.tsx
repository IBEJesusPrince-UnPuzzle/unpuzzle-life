// =============================================================================
// CustomRecurrenceDialog — PR #14b
// =============================================================================
// The Custom recurrence editor. Opens from the Recurrence dropdown when the
// user picks "Custom..." (or when editing a row whose existing rule doesn't
// match any of the 6 standards).
//
// Shape mirrors Google Calendar iOS:
//
//   Repeat every  [N] [day | week | month | year]
//   ── if week ─────────────────────────────────────
//   Repeat on   ( S ) ( M ) ( T ) ( W ) ( T ) ( F ) ( S )
//   ── if month ────────────────────────────────────
//   Monthly on day N    /    Monthly on the {ord} {weekday}
//   ── ends ────────────────────────────────────────
//   Ends   ( ) Never
//          ( ) On  [date picker]
//          ( ) After [N] occurrences
//
// On Done: callback fires with the resulting RRULE + an optional
// recurrenceEndDate (only set when ends=on). The §22a 1-year cap is checked
// HERE before saving — if the picked end date exceeds start + 1y, we open
// the cap prompt instead of closing.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type CustomFreq,
  type CustomRecurrenceState,
  type EndsMode,
  type MonthlyMode,
  buildCustomRule,
  defaultCustomState,
  describeCustomState,
  oneYearOut,
  parseRuleToCustomState,
} from "@/lib/recurrence-form";

const WEEKDAY_LABELS: { code: string; letter: string; aria: string }[] = [
  { code: "SU", letter: "S", aria: "Sunday" },
  { code: "MO", letter: "M", aria: "Monday" },
  { code: "TU", letter: "T", aria: "Tuesday" },
  { code: "WE", letter: "W", aria: "Wednesday" },
  { code: "TH", letter: "T", aria: "Thursday" },
  { code: "FR", letter: "F", aria: "Friday" },
  { code: "SA", letter: "S", aria: "Saturday" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ORDINAL_WORDS = ["first", "second", "third", "fourth", "last"];

function ordinalFor(date: string): string {
  const day = Number(date.split("-")[2]);
  if (day <= 7) return ORDINAL_WORDS[0];
  if (day <= 14) return ORDINAL_WORDS[1];
  if (day <= 21) return ORDINAL_WORDS[2];
  if (day <= 28) return ORDINAL_WORDS[3];
  return ORDINAL_WORDS[4]; // 29..31 → "last"
}

function weekdayName(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_LABELS[dt.getUTCDay()].aria;
}

function dayOfMonth(date: string): number {
  return Number(date.split("-")[2]);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Start date of the parent task (drives weekday seeding + 1-year cap).
  startDate: string; // YYYY-MM-DD
  // Existing rule to seed the dialog from (when editing). Pass null for fresh.
  initialRule: string | null;
  // Existing recurrenceEndDate. If non-empty AND no COUNT in the rule, we
  // seed ends="on" with this date.
  initialEndDate: string;
  // Save callback. The modal commits the rule + optional end date. The
  // dialog passes endDate="" when ends=never or ends=after (no UNTIL stored
  // in the column — COUNT lives inside the rule for ends=after).
  onSave: (rule: string, endDate: string) => void;
  // PR #20 — Convert-to-responsibility (§22a). Called from this dialog's
  // cap prompt when the user picks "Convert to responsibility". The parent
  // owns the conversion mutation (so it can read the parent form's title /
  // date / role state); we just hand it the rule the user just authored.
  // The parent is responsible for closing this dialog when the conversion
  // resolves — we don't auto-close on click so a network error still leaves
  // the dialog visible for retry.
  onConvertToResponsibility?: (rule: string) => void;
};

export function CustomRecurrenceDialog({
  open,
  onOpenChange,
  startDate,
  initialRule,
  initialEndDate,
  onSave,
  onConvertToResponsibility,
}: Props) {
  const { toast } = useToast();
  // §22a cap prompt local to the dialog — keeps the cap concern self-contained.
  const [showCapPrompt, setShowCapPrompt] = useState(false);
  const [state, setState] = useState<CustomRecurrenceState>(() =>
    defaultCustomState(startDate)
  );
  // Track whether endsOnDate has been touched by the user. Without this,
  // moving the parent's start date would silently overwrite an explicit
  // user pick when we re-seed the cap.
  const [endsOnTouched, setEndsOnTouched] = useState(false);

  // Re-seed every time the dialog opens. We want a clean snapshot of the
  // parent state at open time — subsequent typing in the parent modal
  // shouldn't bleed in until the user reopens the dialog.
  useEffect(() => {
    if (!open) return;
    if (initialRule) {
      const parsed = parseRuleToCustomState(initialRule, startDate);
      // If the rule had no COUNT but the row has a stored recurrenceEndDate,
      // surface it as ends="on".
      if (parsed.ends === "never" && initialEndDate) {
        parsed.ends = "on";
        parsed.endsOnDate = initialEndDate;
      }
      setState(parsed);
      setEndsOnTouched(Boolean(initialEndDate));
    } else {
      setState(defaultCustomState(startDate));
      setEndsOnTouched(false);
    }
  }, [open, initialRule, initialEndDate, startDate]);

  // When the parent's start date changes WHILE the dialog is open and the
  // user hasn't touched the Ends-on date, slide the cap forward. (Edge case
  // — the parent date input is behind the dialog so this is rare.)
  useEffect(() => {
    if (!endsOnTouched && state.ends === "on") {
      setState((s) => ({ ...s, endsOnDate: oneYearOut(startDate) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  function update<K extends keyof CustomRecurrenceState>(
    key: K,
    value: CustomRecurrenceState[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function toggleByDay(code: string) {
    setState((s) => {
      const next = s.byday.includes(code)
        ? s.byday.filter((c) => c !== code)
        : [...s.byday, code];
      return { ...s, byday: next };
    });
  }

  // Friendly unit label that pluralizes per interval.
  const unitLabel = useMemo(() => {
    const n = state.interval;
    const plural = n === 1 ? "" : "s";
    switch (state.freq) {
      case "daily":
        return `day${plural}`;
      case "weekly":
        return `week${plural}`;
      case "monthly":
        return `month${plural}`;
      case "yearly":
        return `year${plural}`;
    }
  }, [state.freq, state.interval]);

  // Rule preview (also disables Save when invalid — e.g. weekly + no BYDAY).
  const rulePreview = useMemo(
    () => buildCustomRule(state, startDate),
    [state, startDate]
  );

  const ruleLabel = useMemo(() => describeCustomState(state), [state]);

  // Save validation — the rule must build, and ends=after must have count >= 1,
  // ends=on must have a parseable date >= start.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const canSave = useMemo(() => {
    if (!rulePreview) return false;
    if (state.ends === "after" && state.endsAfterCount < 1) return false;
    if (state.ends === "on") {
      if (!dateRe.test(state.endsOnDate)) return false;
      if (state.endsOnDate < startDate) return false;
    }
    return true;
  }, [rulePreview, state, startDate]);

  function commitSave(stateOverride?: CustomRecurrenceState) {
    const finalState = stateOverride ?? state;
    const finalRule = buildCustomRule(finalState, startDate);
    if (!finalRule) return;
    onSave(finalRule, finalState.ends === "on" ? finalState.endsOnDate : "");
    onOpenChange(false);
  }

  function handleDone() {
    if (!rulePreview || !canSave) return;
    const cap = oneYearOut(startDate);
    // §22a — cap check fires only for ends=on. ends=never auto-clamps via
    // the parent modal's recurrenceEndDate seed; ends=after has no end date.
    if (state.ends === "on" && state.endsOnDate > cap) {
      setShowCapPrompt(true);
      return;
    }
    commitSave();
  }

  // §22a actions — same shape as the parent modal's cap prompt.
  function capAtOneYearAndSave() {
    const capped: CustomRecurrenceState = {
      ...state,
      endsOnDate: oneYearOut(startDate),
    };
    setState(capped);
    setShowCapPrompt(false);
    commitSave(capped);
  }
  // PR #20 — hand the parent the rule the user just authored (with the
  // user's own end date, NOT the 1y cap). The parent runs the conversion
  // and — on success — navigates away, which unmounts both this dialog and
  // its parent modal. If the parent didn't wire onConvertToResponsibility
  // (defensive fallback), we cap-and-save like the legacy stub did.
  function handleConvertToResponsibility() {
    if (!rulePreview) return;
    if (onConvertToResponsibility) {
      onConvertToResponsibility(rulePreview);
    } else {
      capAtOneYearAndSave();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md z-[60]"
        data-testid="dialog-custom-recurrence"
      >
        <DialogHeader>
          <DialogTitle>Custom recurrence</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Repeat every N {unit} */}
          <div className="space-y-1.5">
            <Label>Repeat every</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={state.interval}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update("interval", Number.isFinite(n) && n >= 1 ? n : 1);
                }}
                className="w-20"
                data-testid="input-custom-interval"
              />
              <select
                value={state.freq}
                onChange={(e) => update("freq", e.target.value as CustomFreq)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-custom-freq"
              >
                <option value="daily">{state.interval === 1 ? "day" : "days"}</option>
                <option value="weekly">{state.interval === 1 ? "week" : "weeks"}</option>
                <option value="monthly">{state.interval === 1 ? "month" : "months"}</option>
                <option value="yearly">{state.interval === 1 ? "year" : "years"}</option>
              </select>
            </div>
            {/* Sanity hint so the user can read back what they're building. */}
            <p className="text-xs text-muted-foreground" data-testid="text-custom-summary">
              {ruleLabel}
            </p>
          </div>

          {/* Repeat on (weekly only) */}
          {state.freq === "weekly" && (
            <div className="space-y-1.5">
              <Label>Repeat on</Label>
              <div className="flex gap-1.5" data-testid="weekday-picker">
                {WEEKDAY_LABELS.map((d) => {
                  const selected = state.byday.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => toggleByDay(d.code)}
                      aria-label={d.aria}
                      aria-pressed={selected}
                      data-testid={`button-weekday-${d.code.toLowerCase()}`}
                      className={
                        "w-9 h-9 rounded-full text-sm font-medium border transition-colors " +
                        (selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-accent")
                      }
                    >
                      {d.letter}
                    </button>
                  );
                })}
              </div>
              {state.byday.length === 0 && (
                <p className="text-xs text-destructive" data-testid="text-byday-error">
                  Pick at least one weekday.
                </p>
              )}
            </div>
          )}

          {/* Monthly mode toggle */}
          {state.freq === "monthly" && (
            <div className="space-y-1.5">
              <Label>Monthly on</Label>
              <RadioGroup
                value={state.monthlyMode}
                onValueChange={(v) => update("monthlyMode", v as MonthlyMode)}
                className="space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="day"
                    id="monthly-mode-day"
                    data-testid="radio-monthly-day"
                  />
                  <Label htmlFor="monthly-mode-day" className="cursor-pointer font-normal">
                    Monthly on day {dayOfMonth(startDate)}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="ordinal"
                    id="monthly-mode-ordinal"
                    data-testid="radio-monthly-ordinal"
                  />
                  <Label htmlFor="monthly-mode-ordinal" className="cursor-pointer font-normal">
                    Monthly on the {ordinalFor(startDate)} {weekdayName(startDate)}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Yearly readback — no controls, just clarity. */}
          {state.freq === "yearly" && (
            <p className="text-xs text-muted-foreground">
              Repeats annually on {MONTH_NAMES[Number(startDate.split("-")[1]) - 1]}{" "}
              {dayOfMonth(startDate)}.
            </p>
          )}

          {/* Ends */}
          <div className="space-y-1.5">
            <Label>Ends</Label>
            <RadioGroup
              value={state.ends}
              onValueChange={(v) => update("ends", v as EndsMode)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="never"
                  id="ends-never"
                  data-testid="radio-ends-never"
                />
                <Label htmlFor="ends-never" className="cursor-pointer font-normal">
                  Never
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="on"
                  id="ends-on"
                  data-testid="radio-ends-on"
                />
                <Label htmlFor="ends-on" className="cursor-pointer font-normal shrink-0">
                  On
                </Label>
                <Input
                  type="date"
                  value={state.endsOnDate}
                  min={startDate}
                  disabled={state.ends !== "on"}
                  onChange={(e) => {
                    setEndsOnTouched(true);
                    update("endsOnDate", e.target.value);
                  }}
                  onFocus={() => update("ends", "on")}
                  className="flex-1"
                  data-testid="input-ends-on-date"
                />
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="after"
                  id="ends-after"
                  data-testid="radio-ends-after"
                />
                <Label htmlFor="ends-after" className="cursor-pointer font-normal shrink-0">
                  After
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={state.endsAfterCount}
                  disabled={state.ends !== "after"}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    update("endsAfterCount", Number.isFinite(n) && n >= 1 ? n : 1);
                  }}
                  onFocus={() => update("ends", "after")}
                  className="w-20"
                  data-testid="input-ends-after-count"
                />
                <span className="text-sm text-muted-foreground">occurrences</span>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-custom-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDone}
            disabled={!canSave}
            data-testid="button-custom-done"
          >
            Done
          </Button>
        </DialogFooter>

        {/* §22a end-date prompt — fires when On-date is past start + 1 year. */}
        <AlertDialog open={showCapPrompt} onOpenChange={(o) => !o && setShowCapPrompt(false)}>
          {/* z-[70] sits above this dialog's z-[60]. */}
          <AlertDialogContent
            data-testid="alert-custom-recurrence-cap"
            className="z-[70]"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>This recurrence goes past a year</AlertDialogTitle>
              <AlertDialogDescription>
                What do you want to do?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2 mt-4">
              <AlertDialogAction
                onClick={capAtOneYearAndSave}
                data-testid="button-custom-recurrence-cap"
              >
                Cap at 1 year
              </AlertDialogAction>
              <AlertDialogAction
                onClick={handleConvertToResponsibility}
                data-testid="button-custom-recurrence-convert"
              >
                Convert to responsibility
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={() => setShowCapPrompt(false)}
                data-testid="button-custom-recurrence-cap-cancel"
                className="mt-0"
              >
                Cancel
              </AlertDialogCancel>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
