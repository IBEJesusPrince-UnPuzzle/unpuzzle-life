// =============================================================================
// AgendaMonthView — Phase 3b (§20c)
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
// Implementation: each cell measures its available height with ResizeObserver
// and renders as many chip rows as fit. Anything beyond becomes "+N more".
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  fromIsoDate,
  monthRange,
  toIsoDate,
} from "@/lib/agenda-utils";
import { buildMonthGrid, monthGridStartIso, monthGridEndIso } from "@/lib/month-grid";
import { findColor } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Chip rendering constants. We render up to MAX_CHIPS rows per cell on mobile
// then collapse the rest into "+N more". Cell heights are uniform per row.
const CHIP_ROW_HEIGHT_PX = 18; // chip + 2px gap
const CELL_HEADER_HEIGHT_PX = 18; // day-number row
const CELL_PADDING_PX = 4;

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

  // Group items by date for fast cell lookup. Within a day: all-day first,
  // then timed sorted by time. Title first per §20c.
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaWindowItem[]>();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    Array.from(m.values()).forEach((list) => {
      list.sort((a: AgendaWindowItem, b: AgendaWindowItem) => {
        if (a.isAllDay !== b.isAllDay) return (b.isAllDay ?? 0) - (a.isAllDay ?? 0);
        return (a.time ?? "").localeCompare(b.time ?? "");
      });
    });
    return m;
  }, [items]);

  return (
    <div className="flex flex-col">
      {/* Weekday header */}
      <div
        className="grid border-b sticky top-0 bg-background z-10"
        style={{ gridTemplateColumns: `repeat(7, 1fr)` }}
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

      {/* Cell grid — fixed row height so chips are predictable */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(7, 1fr)`,
          gridAutoRows: `minmax(96px, 1fr)`,
        }}
        data-testid="month-cell-grid"
      >
        {cells.map((cell) => (
          <MonthCell
            key={cell.iso}
            iso={cell.iso}
            day={cell.day}
            inMonth={cell.inMonth}
            isToday={cell.iso === todayIso}
            items={byDay.get(cell.iso) ?? []}
            onTap={onDayTap}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  iso,
  day,
  inMonth,
  isToday,
  items,
  onTap,
}: {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  items: AgendaWindowItem[];
  onTap: (iso: string) => void;
}) {
  // Compute how many chips fit using the fixed row height (visible chips
  // plus the "+N more" line if there is overflow). Mobile cells are short,
  // so we cap at 3 chip rows by default — same as Google Calendar mobile.
  const MAX_CHIPS = 3;
  const visible = items.slice(0, MAX_CHIPS);
  const overflow = items.length - visible.length;

  return (
    <button
      type="button"
      onClick={() => onTap(iso)}
      className={
        "relative text-left border-l border-t first:border-l-0 px-1 pt-1 pb-1 hover:bg-muted/40 transition-colors min-h-[96px] " +
        (inMonth ? "" : "bg-muted/20")
      }
      data-testid={`month-cell-${iso}`}
    >
      <div className="flex items-center mb-0.5">
        <div
          className={
            "tabular-nums text-[11px] " +
            (isToday
              ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-chart-1 text-white font-semibold"
              : inMonth
                ? "text-foreground"
                : "text-muted-foreground")
          }
        >
          {day}
        </div>
      </div>

      <div className="space-y-[2px]">
        {visible.map((it) => {
          const c = findColor(it.color);
          return (
            <div
              key={`m-${it.id}-${it.date}-${it.time ?? "ad"}`}
              className="rounded-sm px-1 truncate text-[9px] leading-[14px] border border-white/40"
              style={{ backgroundColor: c.softHex, color: c.hex, height: 14 }}
              data-testid={`month-chip-${it.id}-${it.date}`}
            >
              {it.title || "(untitled)"}
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="text-[9px] text-muted-foreground pl-1">
            +{overflow} more
          </div>
        )}
      </div>
    </button>
  );
}
