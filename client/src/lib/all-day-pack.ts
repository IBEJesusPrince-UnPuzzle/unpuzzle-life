// =============================================================================
// all-day-pack.ts — Phase 3c
// =============================================================================
// Row-packs all-day events across a fixed window of consecutive days, the way
// Google Calendar does: each event occupies the LOWEST free row across every
// day it overlaps, and earlier-starting / longer events get priority.
//
// The output is a flat list of "placements" — one per event — that the caller
// renders by absolute-positioning a single bar across the contiguous columns
// the event spans. Multi-day events render as ONE bar that crosses cell
// borders; single-day events render as a one-cell bar in the same row.
//
// Edge clipping: the placement also tells the caller whether the bar continues
// off-screen on either side. The view renders that as a flat hard edge (no
// chevron), per the §22a "clean clip" lock.
//
// Per-column overflow: any event whose assigned row is >= maxVisibleRows is
// considered hidden in every column it overlaps. The caller renders a
// "+N more" pill in row maxVisibleRows-1 of any column with hidden items.
// =============================================================================

import type { AgendaTask } from "@shared/schema";

// Every consumer (3 Days / Week / Day) passes window items through here, so
// we accept anything shaped like AgendaTask + the "isVirtual" flag from the
// window endpoint.
type Item = AgendaTask & { isVirtual?: boolean; masterId?: number | null };

export type AllDayPlacement = {
  item: Item;
  // Index into `days` where this event's bar starts/ends in the visible window.
  // startCol may be 0 even if the event's true start is BEFORE days[0]; the
  // bar then renders with clipLeft = true.
  startCol: number;
  endCol: number; // inclusive
  row: number;
  clipLeft: boolean; // event begins before days[0]
  clipRight: boolean; // event ends after days[days.length - 1]
};

export type AllDayPackResult = {
  placements: AllDayPlacement[];
  // For each column index, how many events have row >= maxVisibleRows.
  // 0 means the column has no hidden items.
  hiddenPerCol: number[];
};

/**
 * Pack all-day items into rows across a contiguous date window.
 *
 * @param items   All items in the window — non-all-day items are skipped here.
 * @param days    Visible days, sorted ascending, all formatted YYYY-MM-DD.
 * @param maxVisibleRows  Soft cap; placements with row >= cap count as hidden.
 */
export function packAllDay(
  items: Item[],
  days: string[],
  maxVisibleRows: number,
): AllDayPackResult {
  if (days.length === 0) return { placements: [], hiddenPerCol: [] };

  const winStart = days[0];
  const winEnd = days[days.length - 1];

  // Quick lookup: iso → column index in `days`.
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < days.length; i++) dayIndex.set(days[i], i);

  // Step 1 — keep only all-day events that overlap the window. Compute their
  // logical start/end ISO (using endDate when present, else date).
  const overlapping: {
    item: Item;
    startIso: string;
    endIso: string;
  }[] = [];

  for (const it of items) {
    if (it.isAllDay !== 1) continue;
    const startIso = it.date;
    const endIso = it.endDate && it.endDate >= it.date ? it.endDate : it.date;
    // Skip anything fully outside the window.
    if (endIso < winStart) continue;
    if (startIso > winEnd) continue;
    overlapping.push({ item: it, startIso, endIso });
  }

  // Step 2 — Google-style stable order: earlier start first; longer span
  // first (so multi-day items grab the top row); then by id for stability.
  overlapping.sort((a, b) => {
    if (a.startIso !== b.startIso) return a.startIso < b.startIso ? -1 : 1;
    if (a.endIso !== b.endIso) return a.endIso > b.endIso ? -1 : 1; // longer first
    const aId = a.item.id ?? 0;
    const bId = b.item.id ?? 0;
    return aId - bId;
  });

  // Step 3 — assign each event the lowest row that's free on every column it
  // touches. We grow the rows array on demand; there is no upper bound here
  // (the caller decides what counts as "hidden" via maxVisibleRows).
  // rows[r][col] === true means row r is taken in column col.
  const rows: boolean[][] = [];
  const placements: AllDayPlacement[] = [];

  for (const o of overlapping) {
    // Clamp the visible span to the window.
    const clipLeft = o.startIso < winStart;
    const clipRight = o.endIso > winEnd;
    const startCol = clipLeft ? 0 : dayIndex.get(o.startIso)!;
    const endCol = clipRight ? days.length - 1 : dayIndex.get(o.endIso)!;

    // Find lowest free row.
    let row = 0;
    while (true) {
      if (!rows[row]) rows[row] = new Array(days.length).fill(false);
      let free = true;
      for (let c = startCol; c <= endCol; c++) {
        if (rows[row][c]) {
          free = false;
          break;
        }
      }
      if (free) break;
      row++;
    }

    // Reserve the cells.
    for (let c = startCol; c <= endCol; c++) rows[row][c] = true;

    placements.push({
      item: o.item,
      startCol,
      endCol,
      row,
      clipLeft,
      clipRight,
    });
  }

  // Step 4 — count hidden per column for the +N more line.
  const hiddenPerCol = new Array(days.length).fill(0);
  for (const p of placements) {
    if (p.row >= maxVisibleRows) {
      for (let c = p.startCol; c <= p.endCol; c++) hiddenPerCol[c]++;
    }
  }

  return { placements, hiddenPerCol };
}
