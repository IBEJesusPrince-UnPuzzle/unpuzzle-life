// =============================================================================
// AgendaWeekView — Phase 3b (§20b) + Phase 3c
// =============================================================================
// 7-day week grid. Sunday-start (locked May 7, 2026 — per-user setting deferred).
//
// Locked behavior:
//   - 7 days at once on mobile (no horizontal scroll)
//   - Pattern/load/exception scan view — most compressed of the time-grid views
//   - Trailing-icon default for status (TBD when status icons are wired in)
//   - Side-by-side overlaps like Day
//   - All-day items: Google-like pill, status icons shown
//
// Phase 3b fixup (sticky shell):
//   The column header + all-day strip are exported separately as
//   AgendaWeekStickyShell. The page mounts that shell INSIDE its own sticky
//   header so the chrome stays pinned while the timed grid scrolls.
//   This view component now renders ONLY the time grid body.
//
// Phase 3c additions:
//   - Day-of-week header keeps two-line stack but today now uses an
//     OUTLINED ring around the day number (replaces solid color text)
//   - Shared AgendaAllDayStrip with multi-day spans + 3-row cap +
//     per-column +N more + clean clip at off-screen edges
//   - Timed chips: vertical text wrap (whitespace-normal, line-clamp-3)
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { packLanes } from "@/lib/lane-pack";
import {
  addDays,
  formatTimeLabel,
  toIsoDate,
  weekRange,
} from "@/lib/agenda-utils";
import { findColor } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import { CurrentTimeLine, HOUR_HEIGHT_PX } from "@/components/agenda-time-grid-shared";
import { AgendaAllDayStrip } from "@/components/agenda-all-day-strip";

const LEFT_GUTTER_PX = 48;

type Props = {
  date: string; // any date in the week to show
  onSelect: (item: AgendaWindowItem) => void;
};

type StickyShellProps = Props & {
  // +N more pill in the all-day strip opens the day overlay for that column.
  onMoreTap: (iso: string) => void;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// -----------------------------------------------------------------------------
// Sticky shell — column header + all-day strip
// -----------------------------------------------------------------------------
// Shared TanStack Query key with the body, so the page only fetches once.
export function AgendaWeekStickyShell({
  date,
  onSelect,
  onMoreTap,
}: StickyShellProps) {
  const { from, to } = weekRange(date);

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

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const todayIso = toIsoDate(new Date());

  return (
    <div className="border-t" data-testid="week-sticky-shell">
      {/* Column header — two-line stack: Sun / 4. Today's day number sits
          inside an outlined ring (NOT solid color) for full Google parity
          across views. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${LEFT_GUTTER_PX}px repeat(7, minmax(0, 1fr))` }}
        data-testid="week-column-header"
      >
        <div />
        {days.map((d, i) => {
          const isToday = d === todayIso;
          const dayNum = Number(d.split("-")[2]);
          return (
            <div
              key={d}
              className={
                "px-1 py-2 text-center text-[10px] border-l " +
                (isToday ? "text-chart-1" : "text-muted-foreground")
              }
              data-testid={`week-col-header-${d}`}
            >
              <div className="leading-tight">{DAY_LABELS[i]}</div>
              <div
                className={
                  "tabular-nums mt-0.5 inline-flex items-center justify-center " +
                  (isToday
                    ? "w-5 h-5 rounded-full ring-1 ring-chart-1 font-semibold"
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
          spans across columns with clean clip on off-screen edges. */}
      <AgendaAllDayStrip
        items={items}
        days={days}
        leftGutterPx={LEFT_GUTTER_PX}
        density="compact"
        testIdPrefix="week"
        onSelect={onSelect}
        onMoreTap={onMoreTap}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Body — time grid only (mounted under the sticky shell)
// -----------------------------------------------------------------------------
export function AgendaWeekView({ date, onSelect }: Props) {
  const { from, to } = weekRange(date);

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

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const totalHeight = HOUR_HEIGHT_PX * 24;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col">
      {/* Time grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${LEFT_GUTTER_PX}px repeat(7, minmax(0, 1fr))`,
          height: `${totalHeight}px`,
        }}
        data-testid="week-time-grid"
      >
        {/* Gutter (narrower than Day/3 Days because columns are tighter) */}
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 pr-1 text-right text-[9px] text-muted-foreground tabular-nums whitespace-nowrap"
              style={{
                top: `${h * HOUR_HEIGHT_PX - 6}px`,
                ...(h === 0 ? { top: "2px" } : null),
              }}
            >
              {formatTimeLabel(h * 60)}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <WeekColumn
            key={d}
            iso={d}
            items={items.filter((it) => it.startDate === d)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function WeekColumn({
  iso,
  items,
  onSelect,
}: {
  iso: string;
  items: AgendaWindowItem[];
  onSelect: (item: AgendaWindowItem) => void;
}) {
  const todayIso = toIsoDate(new Date());
  const isToday = iso === todayIso;

  const timed = useMemo(
    () => items.filter((it) => it.isAllDay !== 1 && it.time),
    [items],
  );

  const packed = useMemo(() => {
    const inputs = timed
      .map((it, idx) => {
        const [h, m] = (it.time ?? "00:00").split(":").map(Number);
        const startMin = h * 60 + m;
        const dur = it.durationMinutes && it.durationMinutes > 0 ? it.durationMinutes : 30;
        const endMin = Math.min(24 * 60, startMin + dur);
        return { id: idx, startMin, endMin, item: it };
      })
      .filter((x) => x.endMin > x.startMin);
    return packLanes(inputs);
  }, [timed]);

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const MIN_CHIP_HEIGHT_PX = 16;

  return (
    <div className="relative border-l">
      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/60"
          style={{ top: `${h * HOUR_HEIGHT_PX}px` }}
        />
      ))}

      {packed.map((p) => {
        const it = p.item;
        const c = findColor(it.color);
        const top = (p.startMin / 60) * HOUR_HEIGHT_PX;
        const height = Math.max(
          MIN_CHIP_HEIGHT_PX,
          ((p.endMin - p.startMin) / 60) * HOUR_HEIGHT_PX - 2,
        );
        const widthPct = 100 / p.laneCount;
        const leftPct = p.lane * widthPct;
        return (
          <button
            key={`${it.id}-${it.startDate}-${p.startMin}`}
            onClick={() => onSelect(it)}
            className="absolute rounded-sm text-left overflow-hidden hover:opacity-95 transition-opacity"
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
              backgroundColor: c.softHex,
            }}
            data-testid={`week-chip-${it.id}-${it.startDate}`}
          >
            <div className="px-1">
              {/* Vertical text wrap (Phase 3c): titles wrap onto multiple
                  lines so narrow Week columns can still show useful text
                  ("TK-Pic", "Connect with Benn", "Wix Bill Due $34") at
                  ~50px column width. Capped at 3 lines so a very long
                  title doesn't push past the chip's height. */}
              <div
                className="text-[9px] font-medium leading-tight whitespace-normal break-words line-clamp-3"
                style={{ color: c.hex }}
              >
                {it.title || "(untitled)"}
              </div>
            </div>
          </button>
        );
      })}

      {isToday && <CurrentTimeLine />}
    </div>
  );
}
