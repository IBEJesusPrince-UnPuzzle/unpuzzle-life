// =============================================================================
// AgendaMonthView — Phase 3b (§20c) + Phase 3c
// =============================================================================
// 6×7 (or 5×7) cell grid for the month containing `date`.
//
// Locked behavior:
//   - Event-name first
//   - Single-line chips only
//   - Color-coded chips, NO status icons in cells
//   - "+N more" for vertical overflow only (we don't truncate by character
//     count — overflow is purely about how many chip rows fit in cell height)
//   - Tap a cell (or "+N more") → opens day overlay (§20d)
//
// Phase 3c additions:
//   - Multi-day all-day events render as bars across cells in a week-row;
//     a span that crosses Sunday breaks at the row edge with a clean clip
//     (no chevron) — matches Google Calendar mobile.
//   - Today marker: OUTLINED ring around the day number (replaces the solid
//     blue filled circle) for full Google-parity uniformity across views.
//
// Implementation:
//   - We pack all-day items per WEEK-ROW (7 days at a time) so spans that
//     cross a Sunday boundary become two separate bars, one in each row.
//   - Each cell reserves the rows used by spans, then fills remaining row
//     budget with that day's timed chips (sorted by start time).
//   - Total visible rows per cell capped at MAX_CHIPS; overflow becomes
//     "+N more" on the last row.
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toIsoDate } from "@/lib/agenda-utils";
import {
  buildMonthGrid,
  monthGridStartIso,
  monthGridEndIso,
} from "@/lib/month-grid";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import { packAllDay, type AllDayPlacement } from "@/lib/all-day-pack";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Per-cell vertical budget. Mobile cells are short, so we cap at 3 chip
// rows by default — same as Google Calendar mobile.
const MAX_CHIPS = 3;
const CELL_MIN_HEIGHT_PX = 96;

type Props = {
  date: string; // any date in the month to show
  onDayTap: (iso: string) => void;
};

export function AgendaMonthView({ date, onDayTap }: Props) {
  // Fetch the entire grid window (Sun before the 1st .. Sat after the last)
  // in a single query — server already supports arbitrary ranges.
  const from = monthGridStartIso(date);
  const to = monthGridEndIso(date);

  const { data: items = [] } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", { from, to }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${from}&to=${to}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const cells = buildMonthGrid(date);
  const weekCount = cells.length / 7;
  const todayIso = toIsoDate(new Date());

  // Group timed items by ISO so we can render in-cell chips. ALL all-day
  // events (single-day or multi-day) render as bars in the span layer below,
  // so we only put non-all-day items in timedByDay here.
  const timedByDay = useMemo(() => {
    const m = new Map<string, AgendaWindowItem[]>();
    for (const it of items) {
      if (it.isAllDay === 1) continue; // handled by span layer
      if (!m.has(it.startDate)) m.set(it.startDate, []);
      m.get(it.startDate)!.push(it);
    }
    Array.from(m.values()).forEach((list) => {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    });
    return m;
  }, [items]);

  // Pack multi-day all-day events per week-row. Each week is 7 contiguous
  // days starting on Sunday; spans that cross a Sunday boundary will be
  // emitted in BOTH weeks with appropriate clipLeft/clipRight flags.
  const weeks = useMemo(() => {
    const out: { days: string[]; placements: AllDayPlacement[] }[] = [];
    for (let w = 0; w < weekCount; w++) {
      const weekDays = cells.slice(w * 7, w * 7 + 7).map((c) => c.iso);
      const { placements } = packAllDay(items, weekDays, MAX_CHIPS);
      out.push({ days: weekDays, placements });
    }
    return out;
  }, [items, cells, weekCount]);

  return (
    <div className="flex flex-col">
      {/* Weekday header */}
      <div
        className="grid border-b sticky top-0 bg-background z-10"
        style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}
        data-testid="month-weekday-header"
      >
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-1 py-2 text-center text-[10px] text-muted-foreground border-l first:border-l-0"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Month grid — render row-by-row so we can layer all-day span bars
          above the cells inside each week-row. */}
      <div className="flex flex-col" data-testid="month-cell-grid">
        {weeks.map((week, wi) => (
          <MonthWeekRow
            key={`week-${wi}`}
            week={week}
            cells={cells.slice(wi * 7, wi * 7 + 7)}
            timedByDay={timedByDay}
            todayIso={todayIso}
            onDayTap={onDayTap}
          />
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MonthWeekRow — one row of 7 day cells PLUS a span layer for multi-day
// all-day events. Renders cells in a CSS grid; the span layer absolutely
// overlays it and uses gridColumn to span contiguous days.
// -----------------------------------------------------------------------------
function MonthWeekRow({
  week,
  cells,
  timedByDay,
  todayIso,
  onDayTap,
}: {
  week: { days: string[]; placements: AllDayPlacement[] };
  cells: { iso: string; day: number; inMonth: boolean }[];
  timedByDay: Map<string, AgendaWindowItem[]>;
  todayIso: string;
  onDayTap: (iso: string) => void;
}) {
  // For each column, count how many span rows are taken — those rows are
  // "consumed" before the cell's timed chips.
  const spanRowsPerCol = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const p of week.placements) {
      if (p.row >= MAX_CHIPS) continue;
      for (let c = p.startCol; c <= p.endCol; c++) {
        counts[c] = Math.max(counts[c], p.row + 1);
      }
    }
    return counts;
  }, [week.placements]);

  // Per-column visible/overflow accounting that takes spans + timed
  // together — total cap is MAX_CHIPS rows.
  const perCol = useMemo(() => {
    return cells.map((cell, col) => {
      const spanRows = spanRowsPerCol[col];
      const timed = timedByDay.get(cell.iso) ?? [];
      const remaining = Math.max(0, MAX_CHIPS - spanRows);

      // Hidden span items in this column (those with row >= MAX_CHIPS that
      // overlap this column).
      const hiddenSpans = week.placements.filter(
        (p) => p.row >= MAX_CHIPS && p.startCol <= col && p.endCol >= col,
      ).length;

      // Reserve the last row for "+N more" if there's any overflow at all.
      const totalItems = spanRows + timed.length + hiddenSpans;
      const hasOverflow = totalItems > MAX_CHIPS;

      // If there IS overflow, we can only show (remaining - 1) timed chips
      // because the bottom row goes to "+N more". If there's no overflow we
      // show everything that fits.
      const visibleTimedCount = hasOverflow
        ? Math.max(0, remaining - 1)
        : timed.length;

      const visibleTimed = timed.slice(0, visibleTimedCount);
      const overflowCount = hasOverflow
        ? hiddenSpans + (timed.length - visibleTimedCount)
        : 0;

      return {
        cell,
        spanRows,
        visibleTimed,
        overflowCount,
        hasOverflow,
      };
    });
  }, [cells, spanRowsPerCol, timedByDay, week.placements]);

  return (
    <div
      className="relative grid"
      style={{
        gridTemplateColumns: `repeat(7, minmax(0, 1fr))`,
        gridAutoRows: `minmax(${CELL_MIN_HEIGHT_PX}px, 1fr)`,
      }}
    >
      {/* Cells (background, day number, in-cell chips). Each cell reserves
          the top portion for span bars by leaving spanRows worth of empty
          chip-row slots at the top of its content stack. */}
      {perCol.map((info, col) => (
        <MonthCell
          key={info.cell.iso}
          iso={info.cell.iso}
          day={info.cell.day}
          inMonth={info.cell.inMonth}
          isToday={info.cell.iso === todayIso}
          spanRows={info.spanRows}
          visibleTimed={info.visibleTimed}
          overflowCount={info.overflowCount}
          onTap={onDayTap}
        />
      ))}

      {/* Span bar layer — absolutely positioned over the cell row. Bars
          line up with the cell's chip rows (which start CELL_HEADER_PX
          below the cell top, where the day number sits). */}
      <SpanLayer
        placements={week.placements}
        weekDays={week.days}
        onDayTap={onDayTap}
      />
    </div>
  );
}

// Constants tuned to match the in-cell chip stack so spans align with chips.
const CELL_HEADER_PX = 22; // day-number row + small gap
const CELL_PADDING_X_PX = 4;
const CHIP_ROW_HEIGHT_PX = 16; // bar + gap

function SpanLayer({
  placements,
  weekDays,
  onDayTap,
}: {
  placements: AllDayPlacement[];
  weekDays: string[];
  onDayTap: (iso: string) => void;
}) {
  // The bar layer sits ON TOP of the cell buttons. We make the layer itself
  // pointer-events: none and re-enable pointer events only on each bar so
  // clicks pass through to the cell when the bar isn't there.
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}
      >
        {placements.map((p) => {
          if (p.row >= MAX_CHIPS) return null;
          const c = findColor(p.item.color);
          const colStart = p.startCol + 1;
          const colEnd = p.endCol + 2;
          const top = CELL_HEADER_PX + p.row * CHIP_ROW_HEIGHT_PX;
          // Tapping a bar opens the day overlay for the column tapped
          // would be ideal, but a single click can only target one day —
          // we use the bar's first visible day in this row, matching what
          // "+N more" does in the strip. This is consistent with how Day
          // / 3 Days surface multi-day events when the user wants details.
          const tapIso = weekDays[p.startCol];
          return (
            <div
              key={`mb-${p.item.id}-${p.item.startDate}-${p.row}-${p.startCol}`}
              className="pointer-events-auto"
              style={{
                gridColumn: `${colStart} / ${colEnd}`,
                gridRow: 1,
                marginTop: `${top}px`,
                marginLeft: p.clipLeft ? 0 : `${CELL_PADDING_X_PX}px`,
                marginRight: p.clipRight ? 0 : `${CELL_PADDING_X_PX}px`,
                height: `${CHIP_ROW_HEIGHT_PX - 2}px`,
                alignSelf: "start",
              }}
            >
              <button
                type="button"
                onClick={() => onDayTap(tapIso)}
                className={
                  "w-full h-full text-left text-[9px] leading-[14px] px-1 truncate font-medium border border-white/40 " +
                  (p.clipLeft ? "rounded-l-none " : "rounded-l-[3px] ") +
                  (p.clipRight ? "rounded-r-none" : "rounded-r-[3px]")
                }
                style={{ backgroundColor: c.hex, color: pickContrastingText(c.hex) }}
                data-testid={`month-bar-${p.item.id}-${p.item.startDate}-${p.row}-${p.startCol}`}
              >
                {p.item.title || "(untitled)"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthCell({
  iso,
  day,
  inMonth,
  isToday,
  spanRows,
  visibleTimed,
  overflowCount,
  onTap,
}: {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  spanRows: number;
  visibleTimed: AgendaWindowItem[];
  overflowCount: number;
  onTap: (iso: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTap(iso)}
      className={
        "relative flex flex-col items-stretch justify-start text-left border-l border-t first:border-l-0 px-1 pt-1 pb-1 hover:bg-muted/40 transition-colors " +
        `min-h-[${CELL_MIN_HEIGHT_PX}px] ` +
        (inMonth ? "" : "bg-muted/20")
      }
      data-testid={`month-cell-${iso}`}
    >
      <div className="flex items-center mb-0.5">
        <div
          className={
            "tabular-nums text-[11px] inline-flex items-center justify-center w-5 h-5 rounded-full " +
            (isToday
              ? "ring-1 ring-chart-1 text-chart-1 font-semibold"
              : inMonth
                ? "text-foreground"
                : "text-muted-foreground")
          }
        >
          {day}
        </div>
      </div>

      {/* Reserve N empty slots for the span bars that the SpanLayer will
          draw on top. This keeps the cell's intrinsic height in sync with
          how many bars pass through it. Each slot is exactly one chip
          row tall. */}
      <div className="space-y-[2px]">
        {Array.from({ length: spanRows }).map((_, i) => (
          <div key={`spacer-${i}`} style={{ height: 14 }} aria-hidden="true" />
        ))}
        {visibleTimed.map((it) => {
          const c = findColor(it.color);
          return (
            <div
              key={`m-${it.id}-${it.startDate}-${it.time ?? "ad"}`}
              className="rounded-sm px-1 truncate text-[9px] leading-[14px] border border-white/40"
              style={{ backgroundColor: c.hex, color: pickContrastingText(c.hex), height: 14 }}
              data-testid={`month-chip-${it.id}-${it.startDate}`}
            >
              {it.title || "(untitled)"}
            </div>
          );
        })}
        {overflowCount > 0 && (
          <div className="text-[9px] text-muted-foreground pl-1">
            +{overflowCount} more
          </div>
        )}
      </div>
    </button>
  );
}
