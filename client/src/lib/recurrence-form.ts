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
// "customExisting" dropdown item. Best-effort — covers the common shapes
// (BYDAY list, INTERVAL>1) and falls back to "Custom recurrence".
export function describeCustomRule(rule: string): string {
  const tokens = rule.split(";").reduce<Record<string, string>>((acc, t) => {
    const [k, v] = t.split("=");
    if (k && v !== undefined) acc[k.trim().toUpperCase()] = v.trim().toUpperCase();
    return acc;
  }, {});

  const freq = tokens.FREQ;
  const interval = tokens.INTERVAL ? Number(tokens.INTERVAL) : 1;
  const byday = tokens.BYDAY;

  // "Every Mon, Wed, Fri" for FREQ=WEEKLY;BYDAY=MO,WE,FR
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
    const days = byday
      .split(",")
      .map((c) => codeToShort[c.replace(/^[+-]?\d+/, "")] ?? c)
      .join(", ");
    if (interval > 1) return `Custom (every ${interval} weeks on ${days})`;
    return `Custom (every ${days})`;
  }

  if (freq === "DAILY" && interval > 1) return `Custom (every ${interval} days)`;
  if (freq === "MONTHLY" && interval > 1) return `Custom (every ${interval} months)`;
  if (freq === "YEARLY" && interval > 1) return `Custom (every ${interval} years)`;

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
