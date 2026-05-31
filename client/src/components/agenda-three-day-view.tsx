// =============================================================================
// AgendaThreeDayView — Phase 3b (§20a) + Phase 3c
// =============================================================================
// 3-column comparison layout. Anchor day + the two days following.
//
// Locked behavior (calendar-spec-v2 §20a):
//   - Smaller chip-like timed blocks inside the time grid (vs Day's cards)
//   - Side-by-side overlap behavior like Day (lane-pack)
//   - Display order: name first, status second
//   - All-day items: Google-like pill, status icons shown
//
// Phase 3b fixup (sticky shell):
//   The column header + all-day strip are exported separately as
//   AgendaThreeDayStickyShell. The page mounts that shell INSIDE its own
//   sticky header so the chrome stays pinned while the timed grid scrolls.
//   This view component now renders ONLY the time grid body.
//
// Phase 3c additions:
//   - Day-of-week header: two-line stack (abbrev / day number) with an
//     OUTLINED ring around the day number on today (replaces solid color)
//   - Shared AgendaAllDayStrip with multi-day spans + 3-row cap +
//     per-column +N more + clean clip at off-screen edges
//   - Timed chips: vertical text wrap (whitespace-normal, line-clamp-3)
// =============================================================================

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDragReschedule } from "@/hooks/use-drag-reschedule";
import { apiRequest } from "@/lib/queryClient";
import { packLanes } from "@/lib/lane-pack";
import {
  addDays,
  formatTimeLabel,
  threeDayRange,
  toIsoDate,
} from "@/lib/agenda-utils";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import {
  CurrentTimeLine,
  useAgendaZoom,
  usePinchZoom,
  useTodayScroll,
} from "@/components/agenda-time-grid-shared";
import { AgendaChipContent } from "@/components/agenda-chip-content";
import { AgendaAllDayStrip } from "@/components/agenda-all-day-strip";
import { ExternalEventDetailSheet } from "@/components/external-event-detail-sheet";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEFT_GUTTER_PX = 60;

type Props = {
  date: string; // anchor day; columns are date, date+1, date+2
  onSelect: (item: AgendaWindowItem) => void;
  /** Registration slot: parent stores the provided fn and calls it on Today tap. */
  onScrollToToday?: (fn: () => void) => void;
};

type StickyShellProps = Props & {
  // +N more pill in the all-day strip opens the day overlay for that column.
  onMoreTap: (iso: string) => void;
};

// -----------------------------------------------------------------------------
// Sticky shell — column header + all-day strip
// -----------------------------------------------------------------------------
// Shared TanStack Query key with the body, so the page only fetches once.
export function AgendaThreeDayStickyShell({
  date,
  onSelect,
  onMoreTap,
}: StickyShellProps) {
  const { from, to } = threeDayRange(date);

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

  const days = [date, addDays(date, 1), addDays(date, 2)];
  const todayIso = toIsoDate(new Date());

  return (
    <div className="border-t" data-testid="threeday-sticky-shell">
      {/* Column header — two-line stack: weekday abbrev on top, day number
          below. Today's day number sits inside an outlined ring (NOT a
          solid filled circle) for full Google parity across views. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${LEFT_GUTTER_PX}px repeat(3, minmax(0, 1fr))` }}
        data-testid="threeday-column-header"
      >
        <div />
        {days.map((d) => {
          const isToday = d === todayIso;
          const dt = new Date(d + "T00:00:00");
          const dayLabel = DAY_LABELS[dt.getDay()];
          const dayNum = Number(d.split("-")[2]);
          return (
            <div
              key={d}
              className={
                "px-2 py-2 text-center text-[11px] border-l " +
                (isToday ? "text-chart-1" : "text-muted-foreground")
              }
              data-testid={`threeday-col-header-${d}`}
            >
              <div className="leading-tight">{dayLabel}</div>
              <div
                className={
                  "tabular-nums mt-0.5 inline-flex items-center justify-center " +
                  (isToday
                    ? "w-6 h-6 rounded-full ring-1 ring-chart-1 font-semibold"
                    : "")
                }
              >
                {dayNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day strip — shared component, multi-day events render as
          spans across columns. */}
      <AgendaAllDayStrip
        items={items}
        days={days}
        leftGutterPx={LEFT_GUTTER_PX}
        density="regular"
        testIdPrefix="threeday"
        onSelect={onSelect}
        onMoreTap={onMoreTap}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Body — time grid only (mounted under the sticky shell)
// -----------------------------------------------------------------------------
export function AgendaThreeDayView({ date, onSelect, onScrollToToday }: Props) {
  const { from, to } = threeDayRange(date);
  const { hourHeightPx } = useAgendaZoom();
  const pinchHandlers = usePinchZoom();

  const { data: items = [], isSuccess } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", { from, to }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${from}&to=${to}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const days = [date, addDays(date, 1), addDays(date, 2)];

  const totalHeight = hourHeightPx * 24;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  const todayIso = toIsoDate(new Date());
  const includesToday = days.includes(todayIso);
  const gridRef = useRef<HTMLDivElement | null>(null);
  useTodayScroll(gridRef, includesToday, isSuccess, onScrollToToday, hourHeightPx);

  return (
    <div className="flex flex-col" ref={gridRef}>
      {/* Time grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${LEFT_GUTTER_PX}px repeat(3, minmax(0, 1fr))`,
          height: `${totalHeight}px`,
        }}
        data-testid="threeday-time-grid"
        {...pinchHandlers}
      >
        {/* Gutter */}
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 pr-2 text-right text-[10px] text-muted-foreground tabular-nums"
              style={{
                top: `${h * hourHeightPx - 6}px`,
                ...(h === 0 ? { top: "2px" } : null),
              }}
            >
              {formatTimeLabel(h * 60)}
            </div>
          ))}
        </div>
        {/* 3 chip columns */}
        {days.map((d) => (
          <ThreeDayColumn
            key={d}
            iso={d}
            items={items.filter((it) => it.startDate === d)}
            onSelect={onSelect}
            hourHeightPx={hourHeightPx}
          />
        ))}
      </div>
    </div>
  );
}

function ThreeDayColumn({
  iso,
  items,
  onSelect,
  hourHeightPx,
}: {
  iso: string;
  items: AgendaWindowItem[];
  onSelect: (item: AgendaWindowItem) => void;
  hourHeightPx: number;
}) {
  const [extViewing, setExtViewing] = useState<AgendaWindowItem | null>(null);
  const qc = useQueryClient();
  const colRef = useRef<HTMLDivElement | null>(null);

  const { chipHandlers, columnHandlers, dragState } = useDragReschedule({
    columnRef: colRef,
    hourHeightPx,
    columnDate: iso,
    onTap: onSelect,
    onCommit: async ({ item, newDate, newTime }) => {
      await apiRequest("PATCH", `/api/agenda-tasks/${item.id}`, {
        startDate: newDate,
        time: newTime,
        updatedAt: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
    },
  });

  const todayIso = toIsoDate(new Date());
  const isToday = iso === todayIso;

  const timed = useMemo(
    () => items.filter((it) => it.isAllDay !== 1 && it.time),
    [items],
  );

  // PR #36 — short-chip visual-overlap clustering. Compute the
  // minimum visual height in minutes so packLanes can cluster a 10-min
  // chip with its 1h neighbor that starts at the 10-min chip's true end.
  const MIN_CHIP_HEIGHT_PX = 18;
  const MIN_VISUAL_MINUTES = (MIN_CHIP_HEIGHT_PX / hourHeightPx) * 60;

  const packed = useMemo(() => {
    const inputs = timed
      .map((it, idx) => {
        const [h, m] = (it.time ?? "00:00").split(":").map(Number);
        const startMin = h * 60 + m;
        const dur = it.durationMinutes && it.durationMinutes > 0 ? it.durationMinutes : 30;
        const endMin = Math.min(24 * 60, startMin + dur);
        const visualEndMin = Math.min(24 * 60, Math.max(endMin, startMin + MIN_VISUAL_MINUTES));
        return { id: idx, startMin, endMin, visualEndMin, item: it };
      })
      .filter((x) => x.endMin > x.startMin);
    return packLanes(inputs);
  }, [timed, MIN_VISUAL_MINUTES]);

  const hours = Array.from({ length: 24 }, (_, h) => h);

  const MIN_CHIP_HEIGHT_PX_LOCAL = 18;

  return (
    <div
      ref={colRef}
      className="relative border-l"
      {...columnHandlers}
    >
      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/60"
          style={{ top: `${h * hourHeightPx}px` }}
        />
      ))}
      {hours.map((h) => (
        <div
          key={`half-${h}`}
          className="absolute left-0 right-0 border-t border-border/30"
          style={{ top: `${h * hourHeightPx + hourHeightPx / 2}px` }}
        />
      ))}

      {packed.map((p) => {
        const it = p.item;
        const c = findColor(it.color);
        const top = (p.startMin / 60) * hourHeightPx;
        const height = Math.max(
          MIN_CHIP_HEIGHT_PX,
          ((p.endMin - p.startMin) / 60) * hourHeightPx - 2,
        );
        const widthPct = 100 / p.laneCount;
        const leftPct = p.lane * widthPct;
        const isExt = !!(it as any).isExternal;
        return (
          <button
            key={`${it.id}-${it.startDate}-${p.startMin}`}
            onClick={(e) => { e.stopPropagation(); if (isExt) setExtViewing(it); }}
            className="absolute rounded-sm text-left overflow-hidden hover:opacity-95 transition-opacity border touch-none"
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
              backgroundColor: c.hex,
              opacity: isExt ? 0.82 : (dragState.draggingId === it.id ? 0.35 : 1),
              cursor: isExt ? "default" : "grab",
              borderColor: isExt ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)",
              backgroundImage: isExt ? "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.15) 4px,rgba(255,255,255,0.15) 6px)" : undefined,
            }}
            data-testid={`threeday-chip-${it.id}-${it.startDate}`}
            {...(isExt ? {} : chipHandlers(it, p.startMin))}
          >
            <AgendaChipContent
              item={it}
              startMin={p.startMin}
              endMin={p.endMin}
              titleHex={pickContrastingText(c.hex)}
              density="3day"
            />
          </button>
        );
      })}


      {/* Drag ghost */}
      {dragState.draggingId != null && dragState.ghostTopPx != null && (() => {
        const dragging = packed.find((p) => p.item.id === dragState.draggingId);
        if (!dragging) return null;
        const ghostHeight = Math.max(MIN_CHIP_HEIGHT_PX_LOCAL, ((dragging.endMin - dragging.startMin) / 60) * hourHeightPx - 2);
        const gc = findColor(dragging.item.color);
        return (
          <div
            className="absolute rounded-sm pointer-events-none z-20 border border-white/60 shadow-lg opacity-90"
            style={{
              top: `${dragState.ghostTopPx}px`,
              height: `${ghostHeight}px`,
              left: "1px",
              right: "1px",
              backgroundColor: gc.hex,
            }}
          />
        );
      })()}

      {isToday && <CurrentTimeLine />}
      <ExternalEventDetailSheet item={extViewing} onClose={() => setExtViewing(null)} />
    </div>
  );
}
