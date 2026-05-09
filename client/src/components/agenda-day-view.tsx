// =============================================================================
// AgendaDayView — Phase 3a (§22, §22a)
// =============================================================================
// Renders a single calendar day's TIMED grid:
//
//   • 24-row time grid (12am → 11pm), with hour lines.
//   • Floating event cards positioned by start time; overlapping cards
//     side-by-side via the Google-style lane packing helper.
//   • Current-time line (red) that only renders on today.
//
// All-day events render in a SEPARATE component (AgendaAllDayBand) that
// the page mounts inside its sticky header — matches Google Calendar where
// the all-day strip pins below the date row and only appears when there
// are all-day events. Both components share the same TanStack Query key
// so a single fetch backs both.
//
// Scroll model (Phase 3a):
//   The Day view is NOT its own scroll container. It renders as a single
//   tall block and lets the page's <main> element handle vertical scroll.
//   This avoids nested-scroll rendering glitches (label doubling, cut-off
//   12am, mobile gutter clipping) and matches the rest of the app.
//
//   Side benefit: when the user navigates from one day to the next, the
//   browser keeps main.scrollTop unchanged — so if they were looking at
//   3pm on Mon, they'll still be looking at 3pm when they flip to Tue.
//   Same Google Calendar feel, no JS required.
//
// Layout: CSS grid — fixed 60px gutter for hour labels + 1fr column for
// cards. The card column uses `position: relative` so absolute-positioned
// cards measure inside it, not against the whole page.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { packLanes } from "@/lib/lane-pack";
import {
  toIsoDate,
  formatTimeLabel,
  formatDurationLabel,
} from "@/lib/agenda-utils";
import { findColor } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

const HOUR_HEIGHT_PX = 56; // 56px / hour, ~14px / 15min — matches mobile Google Calendar density.
const MIN_CARD_HEIGHT_PX = 22;
const GUTTER_WIDTH_PX = 60;

type Props = {
  date: string; // YYYY-MM-DD
  onSelect: (item: AgendaWindowItem) => void;
};

export function AgendaDayView({ date, onSelect }: Props) {
  const { data: items = [] } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", { from: date, to: date }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${date}&to=${date}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Filter to timed events only — all-day events render in AgendaAllDayBand,
  // mounted by the page inside its sticky header.
  const timed = useMemo(
    () => items.filter((it) => it.isAllDay !== 1 && it.time),
    [items],
  );

  // Pack timed items into lanes. packLanes uses `id` for bookkeeping;
  // virtual instances of the same series share an id, so we feed a
  // synthetic numeric key based on array index.
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

  // Current-time line — render only on today, refresh once a minute.
  const isToday = date === toIsoDate(new Date());
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const totalHeight = HOUR_HEIGHT_PX * 24;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col">
      {/* Time grid — CSS grid with a fixed gutter and a flexible card column.
          The whole block sits in normal page flow; <main> handles scroll. */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${GUTTER_WIDTH_PX}px 1fr`,
          height: `${totalHeight}px`,
        }}
        data-testid="day-time-grid"
      >
        {/* Gutter — hour labels stacked at exact pixel offsets */}
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 pr-2 text-right text-[10px] text-muted-foreground tabular-nums"
              style={{
                top: `${h * HOUR_HEIGHT_PX - 6}px`,
                // first label clips against the top of the grid; nudge it down so
                // "12:00 AM" sits below the all-day band edge instead of being half-cut.
                ...(h === 0 ? { top: "2px" } : null),
              }}
            >
              {formatTimeLabel(h * 60)}
            </div>
          ))}
        </div>

        {/* Card column — relative so cards position inside it */}
        <div className="relative border-l">
          {/* Hour gridlines */}
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/60"
              style={{ top: `${h * HOUR_HEIGHT_PX}px` }}
            />
          ))}

          {/* Event cards */}
          {packed.map((p) => {
            const it = p.item;
            const c = findColor(it.color);
            const top = (p.startMin / 60) * HOUR_HEIGHT_PX;
            const height = Math.max(
              MIN_CARD_HEIGHT_PX,
              ((p.endMin - p.startMin) / 60) * HOUR_HEIGHT_PX - 2,
            );
            const widthPct = 100 / p.laneCount;
            const leftPct = p.lane * widthPct;
            return (
              <button
                key={`${it.id}-${it.startDate}-${p.startMin}`}
                onClick={() => onSelect(it)}
                className="absolute rounded-md text-left overflow-hidden hover:opacity-95 transition-opacity border border-white/40 shadow-sm"
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(${leftPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                  backgroundColor: c.softHex,
                }}
                data-testid={`button-card-${it.id}`}
              >
                <div className="px-2 py-1">
                  <div
                    className="text-xs font-semibold truncate"
                    style={{ color: c.hex }}
                  >
                    {it.title || "(untitled)"}
                  </div>
                  {height >= 36 && (
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {formatTimeLabel(p.startMin)} ·{" "}
                      {formatDurationLabel(p.endMin - p.startMin)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {/* Current-time line (today only) */}
          {isToday && (
            <div
              className="absolute left-0 right-0 pointer-events-none z-10"
              style={{ top: `${(nowMin / 60) * HOUR_HEIGHT_PX}px` }}
              data-testid="line-current-time"
            >
              <div className="relative">
                <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                <div className="h-px bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
