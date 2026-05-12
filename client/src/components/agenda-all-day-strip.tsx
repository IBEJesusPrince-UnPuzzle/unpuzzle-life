// =============================================================================
// AgendaAllDayStrip — Phase 3c (shared for 3 Days / Week)
// =============================================================================
// Renders the all-day strip for a multi-column view (3 Days or Week). Multi-
// day events render as a SINGLE bar that spans the contiguous columns the
// event touches — Google Calendar style. Bars that begin before the visible
// window or extend after it render with a flat clean clip (no chevron) per
// the §22a lock.
//
// Layout: a CSS grid identical to the column header / time-grid grid above
// it, plus an absolutely-positioned bar layer that uses gridColumn span. The
// row count is driven by the packed result; we cap visible rows at
// MAX_VISIBLE_ROWS and any column with hidden items shows a "+N more" pill
// on the last visible row, scoped to JUST that column.
// =============================================================================

import { useMemo } from "react";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import { packAllDay } from "@/lib/all-day-pack";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

const MAX_VISIBLE_ROWS = 3;
const ROW_HEIGHT_PX = 18; // bar 16px + 2px gutter
const ROW_GAP_PX = 2;
const STRIP_VERTICAL_PADDING_PX = 4;

type Props = {
  // Items from /api/agenda for the window. Non-all-day rows are filtered.
  items: AgendaWindowItem[];
  // Visible days (already sorted ascending). 3 entries for 3 Days, 7 for Week.
  days: string[];
  // Pixel widths of the leading time gutter and the right gutter (Week has
  // none on the right; this prop lets 3 Days / Week share the component).
  leftGutterPx: number;
  // Optional density preset. Week uses smaller text; 3 Days uses larger.
  density?: "compact" | "regular";
  // testid prefix to disambiguate Week vs 3 Days
  testIdPrefix: string;
  onSelect: (item: AgendaWindowItem) => void;
  // Tap on +N more — caller decides what to do (open the day overlay).
  onMoreTap: (iso: string) => void;
};

export function AgendaAllDayStrip({
  items,
  days,
  leftGutterPx,
  density = "regular",
  testIdPrefix,
  onSelect,
  onMoreTap,
}: Props) {
  const { placements, hiddenPerCol } = useMemo(
    () => packAllDay(items, days, MAX_VISIBLE_ROWS),
    [items, days],
  );

  // No rows at all → render nothing (matches Day's AgendaAllDayBand).
  const visibleRows = useMemo(() => {
    if (placements.length === 0) return 0;
    const maxRowUsed = placements.reduce((m, p) => Math.max(m, p.row), 0);
    // We always show at least one row if we have any items, but never more
    // than MAX_VISIBLE_ROWS.
    return Math.min(maxRowUsed + 1, MAX_VISIBLE_ROWS);
  }, [placements]);

  if (visibleRows === 0) return null;

  const totalHeight =
    visibleRows * ROW_HEIGHT_PX + STRIP_VERTICAL_PADDING_PX * 2 - ROW_GAP_PX;

  const textSize = density === "compact" ? "text-[9px]" : "text-[10px]";
  const labelSize = density === "compact" ? "text-[9px]" : "text-[10px]";

  return (
    <div
      className="relative border-t bg-muted/30"
      style={{ height: `${totalHeight}px` }}
      data-testid={`${testIdPrefix}-allday-strip`}
    >
      {/* Grid backdrop: gutter + N day columns. Used so the column borders
          line up perfectly with the column header above and the time grid
          below. The bars render in a separate absolute layer on top. */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `${leftGutterPx}px repeat(${days.length}, minmax(0, 1fr))`,
        }}
        aria-hidden="true"
      >
        <div />
        {days.map((d) => (
          <div key={`bg-${d}`} className="border-l" />
        ))}
      </div>

      {/* "all-day" label in the gutter */}
      <div
        className={`absolute left-0 top-0 ${labelSize} text-muted-foreground text-right pr-1 pt-1`}
        style={{ width: `${leftGutterPx}px` }}
      >
        all-day
      </div>

      {/* Bar layer — placements with row < MAX_VISIBLE_ROWS render here. */}
      <div
        className="absolute"
        style={{
          left: `${leftGutterPx}px`,
          right: 0,
          top: `${STRIP_VERTICAL_PADDING_PX}px`,
          bottom: `${STRIP_VERTICAL_PADDING_PX}px`,
        }}
      >
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${visibleRows}, ${ROW_HEIGHT_PX - ROW_GAP_PX}px)`,
            rowGap: `${ROW_GAP_PX}px`,
          }}
        >
          {placements.map((p) => {
            if (p.row >= MAX_VISIBLE_ROWS) return null;
            const c = findColor(p.item.color);
            // gridColumn spans inclusively from startCol+1 to endCol+2.
            const colStart = p.startCol + 1;
            const colEndExclusive = p.endCol + 2;

            // Clean clip: when the bar continues past either edge we square
            // off that side and remove its rounded corner so it reads as a
            // continuation, per §22a.
            const radius = "rounded-[3px]";
            const leftRadius = p.clipLeft ? "rounded-l-none" : "";
            const rightRadius = p.clipRight ? "rounded-r-none" : "";

            return (
              <button
                type="button"
                key={`ad-${p.item.id}-${p.item.startDate}-${p.row}-${p.startCol}`}
                onClick={() => onSelect(p.item)}
                className={`text-left ${radius} ${leftRadius} ${rightRadius} px-1 truncate hover:opacity-95 ${textSize} font-medium`}
                style={{
                  gridColumn: `${colStart} / ${colEndExclusive}`,
                  gridRow: p.row + 1,
                  backgroundColor: c.hex,
                  color: pickContrastingText(c.hex),
                  // Bars that clip on either side get a flat hard edge and
                  // sit flush with the column border (no inner gap).
                  marginLeft: p.clipLeft ? 0 : 1,
                  marginRight: p.clipRight ? 0 : 1,
                }}
                data-testid={`${testIdPrefix}-allday-bar-${p.item.id}-${p.item.startDate}`}
              >
                {p.item.title || "(untitled)"}
              </button>
            );
          })}

          {/* +N more pills — one per column that has hidden items. Render
              on the LAST visible row (row index MAX_VISIBLE_ROWS - 1), with
              an opaque background so they visually replace any bar segment
              that happens to also occupy that row in that column. We also
              count any such hidden bar in the +N more total. */}
          {hiddenPerCol.map((n, col) => {
            if (n === 0) return null;
            // Bars at the bottom-most visible row that pass through this
            // column also get hidden (the pill covers them); add to count.
            const lastRowBarsThroughCol = placements.filter(
              (p) =>
                p.row === MAX_VISIBLE_ROWS - 1 &&
                p.startCol <= col &&
                p.endCol >= col,
            ).length;
            const total = n + lastRowBarsThroughCol;
            return (
              <button
                type="button"
                key={`more-${col}`}
                onClick={() => onMoreTap(days[col])}
                className={`${textSize} text-muted-foreground hover:text-foreground text-left pl-1 truncate bg-background z-10`}
                style={{
                  gridColumn: `${col + 1} / ${col + 2}`,
                  gridRow: MAX_VISIBLE_ROWS,
                }}
                data-testid={`${testIdPrefix}-allday-more-${days[col]}`}
              >
                +{total} more
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
