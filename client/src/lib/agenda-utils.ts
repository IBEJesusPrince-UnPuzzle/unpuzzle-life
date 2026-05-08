// Date / time helpers shared across Agenda views.
// Single source of truth so the views can't disagree on "what is today".

/** Local-date YYYY-MM-DD for a Date object (no timezone math). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD into a local Date (midnight). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Add `days` to an iso date and return iso. */
export function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Convert HH:MM (24h) to minutes-since-midnight. Returns null on bad input. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

/** Format minutes-since-midnight as 12h-friendly label, e.g. "7:15 AM". */
export function formatTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Format a duration in minutes as a short label, e.g. "45m" / "2h" / "1h 30m". */
export function formatDurationLabel(mins: number | null | undefined): string {
  if (!mins || mins <= 0) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Friendly date label for the agenda header (e.g. "Wed, May 6"). */
export function formatDateContextLabel(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// --- Multi-day range helpers (Phase 3b) -----------------------------------
//
// Each helper returns { from, to } iso dates inclusive on both ends.
// `from` is the leftmost/earliest day shown by the view, `to` is the rightmost/latest.
// These are the exact strings used in `/api/agenda?from=&to=` queries.

export interface DateRange {
  from: string;
  to: string;
}

/** Day view range — single day. */
export function dayRange(iso: string): DateRange {
  return { from: iso, to: iso };
}

/** 3-day view range — anchor day plus the two days after it. */
export function threeDayRange(iso: string): DateRange {
  return { from: iso, to: addDays(iso, 2) };
}

/**
 * Week range. Weeks start on Sunday in UnPuzzle (Google Calendar US default).
 * Returns Sunday..Saturday inclusive that contains the given iso date.
 */
export function weekRange(iso: string): DateRange {
  const d = fromIsoDate(iso);
  const dow = d.getDay(); // 0 = Sunday
  const start = addDays(iso, -dow);
  return { from: start, to: addDays(start, 6) };
}

/** Month range — first..last day of the month containing the given iso. */
export function monthRange(iso: string): DateRange {
  const d = fromIsoDate(iso);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toIsoDate(first), to: toIsoDate(last) };
}

/** Header label for a multi-day range, e.g. "May 6 – 8" or "May 28 – Jun 3". */
export function formatRangeLabel(from: string, to: string): string {
  const a = fromIsoDate(from);
  const b = fromIsoDate(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = sameMonth
    ? String(b.getDate())
    : b.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${left} \u2013 ${right}`;
}

/** Header label for a month, e.g. "May 2026". */
export function formatMonthLabel(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
