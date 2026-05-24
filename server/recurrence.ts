// ============================================================
// Phase 2 — Recurrence engine (§22, §22a, §23)
// ============================================================
// Hybrid model: a master agenda_tasks row carries the recurrence_rule;
// individual instances are expanded on read by this module. Override rows
// (is_override = 1, original_date set) replace the corresponding virtual
// instance for a given series.
//
// Why a wrapper instead of using rrule directly at the call sites:
//   * Centralizes the YYYY-MM-DD ↔ Date(UTC) conversion so we never leak
//     local timezone bugs into the data layer.
//   * Lets Phase 3+ swap the engine (or add an LRU cache) without touching
//     storage.ts call sites.

import rruleModule from "rrule";
const { RRule } = rruleModule as any;

export type IsoDate = string; // YYYY-MM-DD

export interface MasterRow {
  id: number;
  seriesId: number | null;
  recurrenceRule: string | null;
  recurrenceEndDate: string | null; // YYYY-MM-DD, exclusive upper bound for instance generation
  // PR #24 — renamed from `date` to mirror agenda_tasks.start_date.
  startDate: string; // YYYY-MM-DD — anchor (DTSTART) for the series
}

export interface ExpandedInstance {
  masterId: number;
  seriesId: number | null;
  // PR #24 — renamed from `date` for consistency with the agenda task
  // shape callers materialize from this. Semantically it's the virtual
  // instance's start date (also serves as original_date for any override).
  startDate: IsoDate;
}

// Convert YYYY-MM-DD → midnight UTC Date (so we never roll a day across timezones).
export function isoToUtcDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Convert a UTC Date → YYYY-MM-DD.
export function utcDateToIso(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse a stored RRULE string. We accept either:
//   * a bare rule body  (e.g. "FREQ=WEEKLY;BYDAY=MO,WE")
//   * a full RRULE line (e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO,WE")
// rrule.js wants the bare form when used via `RRule.fromString` with
// "RRULE:" prefix, OR via parsing options. We normalize to the prefixed form.
function buildRule(masterDateIso: IsoDate, rule: string, untilIso: string | null): RRule {
  let body = rule.trim();
  if (body.toUpperCase().startsWith("RRULE:")) body = body.slice(6);
  // Inject DTSTART so RRule anchors the series correctly.
  const dtstart = isoToUtcDate(masterDateIso);
  // Use rrulestr for robustness across forms.
  // We construct via options to keep DTSTART explicit.
  const opts = RRule.parseString(body);
  opts.dtstart = dtstart;
  if (untilIso) {
    // UNTIL is inclusive in iCal; we add 23:59:59 UTC so the end-date day itself
    // is included. Without this, a series ending Jun 1 would not produce a Jun 1
    // instance even though Jun 1 should count as "in range."
    const until = isoToUtcDate(untilIso);
    until.setUTCHours(23, 59, 59, 999);
    opts.until = until;
  }
  return new RRule(opts);
}

// Expand a master row into all virtual instance dates that fall within
// [windowStart, windowEnd] (both inclusive, both YYYY-MM-DD).
//
// Override rows are NOT consulted here — callers merge them in afterward.
export function expandMaster(
  master: MasterRow,
  windowStart: IsoDate,
  windowEnd: IsoDate,
): ExpandedInstance[] {
  if (!master.recurrenceRule) {
    // Non-recurring master = a single instance on master.startDate.
    if (master.startDate >= windowStart && master.startDate <= windowEnd) {
      return [{ masterId: master.id, seriesId: master.seriesId, startDate: master.startDate }];
    }
    return [];
  }
  const rule = buildRule(master.startDate, master.recurrenceRule, master.recurrenceEndDate);
  const start = isoToUtcDate(windowStart);
  const end = isoToUtcDate(windowEnd);
  end.setUTCHours(23, 59, 59, 999);
  const dates = rule.between(start, end, true /* inclusive */);
  return dates.map((d) => ({
    masterId: master.id,
    seriesId: master.seriesId,
    startDate: utcDateToIso(d),
  }));
}

// Validate a recurrence rule string is parseable. Returns null if OK,
// or an error message string otherwise.
export function validateRecurrenceRule(rule: string): string | null {
  try {
    let body = rule.trim();
    if (body.toUpperCase().startsWith("RRULE:")) body = body.slice(6);
    const opts = RRule.parseString(body);
    // rrule will accept an empty options object; require at least FREQ.
    if (opts.freq === undefined || opts.freq === null) {
      return "recurrence_rule must include FREQ";
    }
    return null;
  } catch (err: any) {
    return `invalid recurrence_rule: ${err?.message || String(err)}`;
  }
}
