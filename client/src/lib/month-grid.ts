// Phase 3b — month-grid helper.
// Builds the 6×7 day matrix shown in the Month view per §20c locked ASCII.
// Weeks start on Sunday (locked May 7, 2026 — user prefers Sunday-start until
// a per-user preference ships).

import { addDays, fromIsoDate, monthRange, toIsoDate } from "./agenda-utils";

export interface MonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/**
 * Returns a flat array of 42 cells (6 rows × 7 cols) covering the month
 * containing `iso`. Cells before the 1st and after the last belong to the
 * previous / next month and are flagged with `inMonth: false` so the view
 * can render them dimmed.
 */
export function buildMonthGrid(iso: string): MonthCell[] {
  const { from, to } = monthRange(iso);
  const firstOfMonth = fromIsoDate(from);
  const lastOfMonth = fromIsoDate(to);
  const monthIdx = firstOfMonth.getMonth();

  // Walk back to the most recent Sunday (could be 0 days if the 1st is Sunday)
  const leadDays = firstOfMonth.getDay(); // 0..6
  const gridStartIso = addDays(from, -leadDays);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cellIso = addDays(gridStartIso, i);
    const cellDate = fromIsoDate(cellIso);
    cells.push({
      iso: cellIso,
      day: cellDate.getDate(),
      inMonth: cellDate.getMonth() === monthIdx,
    });
  }
  // Trim trailing empty week if the month fits in 5 rows (35 cells)
  // Only trim if entire 6th row is in the next month
  const lastRowStart = 35;
  const lastRowAllNext = cells
    .slice(lastRowStart)
    .every((c) => fromIsoDate(c.iso) > lastOfMonth);
  return lastRowAllNext ? cells.slice(0, 35) : cells;
}

/** Number of weeks (rows) in the grid produced by buildMonthGrid. */
export function monthGridWeekCount(iso: string): number {
  return buildMonthGrid(iso).length / 7;
}

/** ISO of the first day in the grid (the Sunday at or before the 1st). */
export function monthGridStartIso(iso: string): string {
  const { from } = monthRange(iso);
  const firstOfMonth = fromIsoDate(from);
  return addDays(from, -firstOfMonth.getDay());
}

/** ISO of the last day in the grid (Saturday at or after the last). */
export function monthGridEndIso(iso: string): string {
  const start = monthGridStartIso(iso);
  const weeks = monthGridWeekCount(iso);
  return addDays(start, weeks * 7 - 1);
}

/** True if `iso` is "today" in the user's local timezone. */
export function isToday(iso: string): boolean {
  return iso === toIsoDate(new Date());
}
