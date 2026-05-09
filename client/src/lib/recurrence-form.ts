// =============================================================================
// recurrence-form — pure helpers for the agenda task modal recurrence dropdown
// =============================================================================
// PR #14 (Path 2) — Google standard-list parity.
//
// Google Calendar's "Repeat" dropdown shows 6 dynamic options keyed off the
// event's start date plus a "Custom..." entry. This module produces the same
// labels and the matching RFC 5545 RRULE strings so we stay byte-compatible
// with anything that consumes RRULE downstream (the recurrence engine in
// server/recurrence.ts uses rrule.js, which speaks the standard).
//
//   "Does not repeat"                    → null
//   "Daily"                              → FREQ=DAILY
//   "Weekly on Friday"                   → FREQ=WEEKLY;BYDAY=FR
//   "Monthly on the second Friday"       → FREQ=MONTHLY;BYDAY=2FR
//   "Annually on May 8"                  → FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=8
//   "Every weekday (Monday to Friday)"   → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
//   "Custom..."                          → handled by the modal (toast in #14, dialog in #14b)
//
// Existing rows whose rule does NOT match any of the 6 standards (e.g.
// API-seeded FREQ=WEEKLY;BYDAY=MO,WE,FR) get a synthetic "customExisting"
// option so we can render them read-only without dropping the data.
// =============================================================================

export type StandardOption =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "weekday"
  | "custom"
  | "customExisting";

export interface DropdownItem {
  value: StandardOption;
  label: string;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const ORDINAL_WORDS: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
};

// "YYYY-MM-DD" → Date in UTC (midnight). Avoids local-timezone surprises
// when the user is in a non-UTC zone — we only ever care about the date
// part for recurrence math.
function parseISODate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function dayOfWeekIndex(date: Date): number {
  return date.getUTCDay(); // 0 = Sunday
}

function dayOfMonth(date: Date): number {
  return date.getUTCDate();
}

function monthIndex(date: Date): number {
  return date.getUTCMonth(); // 0 = January
}

// Compute the ordinal-week-of-month for a date (1..4, or -1 for "last").
// Days 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–28 → 4, 29–31 → -1 (last).
function ordinalInMonth(date: Date): number {
  const d = dayOfMonth(date);
  if (d <= 7) return 1;
  if (d <= 14) return 2;
  if (d <= 21) return 3;
  if (d <= 28) return 4;
  return -1; // 29..31 — treat as "last" for label + RRULE
}

// "second" / "third" / "last"
function ordinalWord(n: number): string {
  if (n === -1) return "last";
  return ORDINAL_WORDS[n] ?? String(n);
}

// =============================================================================
// Public API
// =============================================================================

// Build the 7-item dropdown for a given start date (ISO YYYY-MM-DD).
// Caller may prepend a "customExisting" item when editing a row whose
// existing rule does not match any of these six standards.
export function buildDropdownOptions(isoDate: string): DropdownItem[] {
  const d = parseISODate(isoDate);
  const dow = dayOfWeekIndex(d);
  const dayName = WEEKDAY_NAMES[dow];
  const ord = ordinalInMonth(d);
  const ordWord = ordinalWord(ord);
  const month = MONTH_NAMES[monthIndex(d)];
  const dom = dayOfMonth(d);

  return [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: `Weekly on ${dayName}` },
    { value: "monthly", label: `Monthly on the ${ordWord} ${dayName}` },
    { value: "yearly", label: `Annually on ${month} ${dom}` },
    { value: "weekday", label: "Every weekday (Monday to Friday)" },
    { value: "custom", label: "Custom..." },
  ];
}

// Convert a (option, startDate) pair to its RRULE string — or null when "none".
// "custom" / "customExisting" are NOT handled here; the modal owns those.
export function optionToRule(option: StandardOption, isoDate: string): string | null {
  if (option === "none") return null;
  if (option === "custom" || option === "customExisting") return null;

  const d = parseISODate(isoDate);
  const dow = dayOfWeekIndex(d);
  const dowCode = WEEKDAY_CODES[dow];
  const ord = ordinalInMonth(d);
  const month = monthIndex(d) + 1; // 1-indexed for BYMONTH
  const dom = dayOfMonth(d);

  switch (option) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${dowCode}`;
    case "monthly":
      // BYDAY=2FR / -1FR — RFC 5545 ordinal weekday
      return `FREQ=MONTHLY;BYDAY=${ord}${dowCode}`;
    case "yearly":
      return `FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${dom}`;
    case "weekday":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  }
}

// Reverse lookup: given an existing RRULE + startDate, return the matching
// standard option. Returns null when the rule does not match any standard
// for this start date — the caller then renders a "customExisting" option
// holding the original rule snapshot.
export function ruleToOption(
  rule: string | null | undefined,
  isoDate: string
): StandardOption | null {
  if (!rule) return "none";
  // Compare against each generated rule. We normalize by lowercasing the
  // separators-free key=value tokens so case differences don't trip us up.
  const normalize = (s: string) =>
    s
      .split(";")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(";");
  const target = normalize(rule);

  const candidates: StandardOption[] = ["daily", "weekly", "monthly", "yearly", "weekday"];
  for (const opt of candidates) {
    const built = optionToRule(opt, isoDate);
    if (built && normalize(built) === target) return opt;
  }
  return null;
}

// Human-readable description of a non-standard rule for the synthetic
// "customExisting" dropdown item. Covers the shapes the Custom dialog can
// produce; falls back to "Custom recurrence" for anything exotic.
export function describeCustomRule(rule: string): string {
  const tokens = rule.split(";").reduce<Record<string, string>>((acc, t) => {
    const [k, v] = t.split("=");
    if (k && v !== undefined) acc[k.trim().toUpperCase()] = v.trim().toUpperCase();
    return acc;
  }, {});

  const freq = tokens.FREQ;
  const interval = tokens.INTERVAL ? Number(tokens.INTERVAL) : 1;
  const byday = tokens.BYDAY;

  // "Every Mon, Wed, Fri" for FREQ=WEEKLY;BYDAY=MO,WE,FR. Reorder into
  // canonical SU..SA so the readback is stable.
  if (freq === "WEEKLY" && byday) {
    const codeToShort: Record<string, string> = {
      SU: "Sun",
      MO: "Mon",
      TU: "Tue",
      WE: "Wed",
      TH: "Thu",
      FR: "Fri",
      SA: "Sat",
    };
    const present = new Set(
      byday.split(",").map((c) => c.replace(/^[+-]?\d+/, ""))
    );
    const ordered = WEEKDAY_CODES.filter((c) => present.has(c));
    const days = ordered.map((c) => codeToShort[c] ?? c).join(", ");
    if (interval > 1) return `Custom (every ${interval} weeks on ${days})`;
    return `Custom (every ${days})`;
  }

  if (freq === "DAILY") {
    return interval > 1 ? `Custom (every ${interval} days)` : "Custom (daily)";
  }
  if (freq === "MONTHLY") {
    return interval > 1 ? `Custom (every ${interval} months)` : "Custom (monthly)";
  }
  if (freq === "YEARLY") {
    return interval > 1 ? `Custom (every ${interval} years)` : "Custom (yearly)";
  }

  return "Custom recurrence";
}

// Compute the 1-year cap for a given start date (ISO YYYY-MM-DD).
// Returns ISO YYYY-MM-DD. Feb 29 → next year's Feb 28 (JS Date semantics).
export function oneYearOut(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // new Date(year, monthIdx, day) handles Feb 29 → Mar 1 rollover; we want
  // Feb 28 instead. Use UTC and clamp manually.
  const target = new Date(Date.UTC(y + 1, (m ?? 1) - 1, d ?? 1));
  // If the day rolled forward (Feb 29 + 1 year would land in March), pull
  // back to the last day of the prior month.
  if (target.getUTCMonth() !== (m ?? 1) - 1) {
    target.setUTCDate(0); // last day of previous month
  }
  const yy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// =============================================================================
// Custom recurrence dialog (PR #14b) — build + parse
// =============================================================================
//
// The Custom dialog lets the user pick:
//   - FREQ: daily | weekly | monthly | yearly
//   - INTERVAL: 1..N
//   - BYDAY (weekly only): subset of SU/MO/TU/WE/TH/FR/SA
//   - Monthly mode: by-day-of-month (BYMONTHDAY) OR by-ordinal-weekday (BYDAY=2FR)
//   - Ends: never | on [date] | after [N] occurrences
//
// We DO NOT use UNTIL inside the RRULE itself — the schema already has a
// dedicated `recurrenceEndDate` column for that, and the §22a window-merge
// reads it directly. "After N occurrences" maps to RRULE COUNT=N.
//
// The 1-year cap (§22a) applies when ends=on AND the picked date is past
// start + 1y; the modal opens the cap prompt before saving.
// =============================================================================

export type CustomFreq = "daily" | "weekly" | "monthly" | "yearly";
export type EndsMode = "never" | "on" | "after";
export type MonthlyMode = "day" | "ordinal";

export interface CustomRecurrenceState {
  freq: CustomFreq;
  interval: number; // >= 1
  byday: string[]; // weekly only — subset of WEEKDAY_CODES
  monthlyMode: MonthlyMode; // monthly only
  ends: EndsMode;
  endsOnDate: string; // YYYY-MM-DD when ends=on
  endsAfterCount: number; // >= 1 when ends=after
}

// Default Custom state seeded from the start date. Mirrors what Google does
// when you first open Custom on a fresh event:
//   - daily, every 1 day
//   - weekly preselects the start date's weekday
//   - ends=never
export function defaultCustomState(isoDate: string): CustomRecurrenceState {
  const d = parseISODate(isoDate);
  const dow = dayOfWeekIndex(d);
  return {
    freq: "weekly",
    interval: 1,
    byday: [WEEKDAY_CODES[dow]],
    monthlyMode: "day",
    ends: "never",
    endsOnDate: oneYearOut(isoDate),
    endsAfterCount: 13,
  };
}

// Build the RRULE string from a Custom state + start date. Returns null if
// the state is invalid (e.g. weekly with no BYDAY selected).
export function buildCustomRule(
  state: CustomRecurrenceState,
  isoDate: string
): string | null {
  if (state.interval < 1) return null;
  const parts: string[] = [];
  const d = parseISODate(isoDate);

  switch (state.freq) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly": {
      if (state.byday.length === 0) return null;
      parts.push("FREQ=WEEKLY");
      // Preserve canonical weekday order (SU..SA) so equal sets compare equal.
      const ordered = WEEKDAY_CODES.filter((c) => state.byday.includes(c));
      parts.push(`BYDAY=${ordered.join(",")}`);
      break;
    }
    case "monthly":
      parts.push("FREQ=MONTHLY");
      if (state.monthlyMode === "day") {
        parts.push(`BYMONTHDAY=${dayOfMonth(d)}`);
      } else {
        const dowCode = WEEKDAY_CODES[dayOfWeekIndex(d)];
        const ord = ordinalInMonth(d);
        parts.push(`BYDAY=${ord}${dowCode}`);
      }
      break;
    case "yearly":
      parts.push("FREQ=YEARLY");
      parts.push(`BYMONTH=${monthIndex(d) + 1}`);
      parts.push(`BYMONTHDAY=${dayOfMonth(d)}`);
      break;
  }

  if (state.interval > 1) parts.push(`INTERVAL=${state.interval}`);
  if (state.ends === "after" && state.endsAfterCount > 0) {
    parts.push(`COUNT=${state.endsAfterCount}`);
  }
  return parts.join(";");
}

// Parse an existing RRULE into a Custom state (best-effort). Caller passes
// the start date for context. Unknown tokens are ignored. If a recurrenceEndDate
// is also stored separately, the modal injects ends="on" + that date AFTER
// calling this; this function only knows about COUNT inside the rule itself.
export function parseRuleToCustomState(
  rule: string,
  isoDate: string
): CustomRecurrenceState {
  const base = defaultCustomState(isoDate);
  const tokens = rule.split(";").reduce<Record<string, string>>((acc, t) => {
    const [k, v] = t.split("=");
    if (k && v !== undefined) acc[k.trim().toUpperCase()] = v.trim().toUpperCase();
    return acc;
  }, {});

  const freq = tokens.FREQ;
  if (freq === "DAILY") base.freq = "daily";
  else if (freq === "WEEKLY") base.freq = "weekly";
  else if (freq === "MONTHLY") base.freq = "monthly";
  else if (freq === "YEARLY") base.freq = "yearly";

  if (tokens.INTERVAL) {
    const n = Number(tokens.INTERVAL);
    if (Number.isFinite(n) && n >= 1) base.interval = n;
  }

  if (base.freq === "weekly" && tokens.BYDAY) {
    const codes = tokens.BYDAY.split(",")
      .map((c) => c.replace(/^[+-]?\d+/, "")) // strip ordinal prefix if any
      .filter((c) => (WEEKDAY_CODES as readonly string[]).includes(c));
    if (codes.length > 0) base.byday = codes;
  }

  if (base.freq === "monthly") {
    if (tokens.BYDAY) base.monthlyMode = "ordinal";
    else if (tokens.BYMONTHDAY) base.monthlyMode = "day";
  }

  if (tokens.COUNT) {
    const n = Number(tokens.COUNT);
    if (Number.isFinite(n) && n >= 1) {
      base.ends = "after";
      base.endsAfterCount = n;
    }
  }

  return base;
}

// Strip COUNT from a rule. Used when the modal commits Custom state with
// ends=on or ends=never — we want recurrenceEndDate (or no end at all) to
// be the source of truth, not COUNT.
export function stripCount(rule: string): string {
  return rule
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t && !t.toUpperCase().startsWith("COUNT="))
    .join(";");
}

// Human-readable summary of a Custom state for the dropdown label after
// the user saves the dialog. Mirrors describeCustomRule shape.
export function describeCustomState(state: CustomRecurrenceState): string {
  const codeToShort: Record<string, string> = {
    SU: "Sun",
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
  };
  const n = state.interval;
  switch (state.freq) {
    case "daily":
      return n === 1 ? "Custom (daily)" : `Custom (every ${n} days)`;
    case "weekly": {
      // Canonical SU..SA order so the readback is stable regardless of
      // toggle order in the picker.
      const ordered = WEEKDAY_CODES.filter((c) => state.byday.includes(c));
      const days = ordered.map((c) => codeToShort[c] ?? c).join(", ");
      if (n === 1) return `Custom (every ${days})`;
      return `Custom (every ${n} weeks on ${days})`;
    }
    case "monthly":
      return n === 1 ? "Custom (monthly)" : `Custom (every ${n} months)`;
    case "yearly":
      return n === 1 ? "Custom (yearly)" : `Custom (every ${n} years)`;
  }
}
