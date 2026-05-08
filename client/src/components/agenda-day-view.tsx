// =============================================================================
// AgendaDayView — Phase 3a (§22, §22a)
// =============================================================================
// Renders a single calendar day:
//
//   • All-day band at the top (one row per all-day item, color-chipped).
//   • 24-row time grid below it (12am → 11pm), with hour lines.
//   • Floating event cards positioned by start time; overlapping cards
//     side-by-side via the Google-style lane packing helper.
//   • Current-time line (red) that only renders on today.
//
// Source data: GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD (single day).
// Tap a card → onSelect(item) so parent can open the edit modal.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
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

  // Split into all-day vs timed.
  const { allDay, timed } = useMemo(() => {
    const allDay: AgendaWindowItem[] = [];
    const timed: AgendaWindowItem[] = [];
    for (const it of items) {
      if (it.isAllDay === 1 || !it.time) allDay.push(it);
      else timed.push(it);
    }
    return { allDay, timed };
  }, [items]);

  // Pack timed items into lanes for side-by-side overlap rendering.
  // packLanes wants startMin/endMin and uses `id` for lane bookkeeping;
  // since virtual instances of the same series share an id, build a
  // synthetic numeric key and feed it as the id into the helper.
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

  // Current-time line — only render on today, and only refresh once a minute.
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

  // On mount / date change, scroll to ~7am so morning is visible without a wall of empty hours.
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.scrollTop = HOUR_HEIGHT_PX * 7;
  }, [date]);

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* All-day band */}
      {allDay.length > 0 && (
        <div
          className="border-b bg-muted/30 px-3 py-2 space-y-1"
          data-testid="day-all-day-band"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            All day
          </div>
          {allDay.map((it) => {
            const c = findColor(it.color);
            return (
              <button
                key={`${it.id}-${it.date}`}
                onClick={() => onSelect(it)}
                className="w-full text-left rounded-md px-2 py-1 text-xs font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: c.softHex, color: "#1f2937" }}
                data-testid={`button-allday-${it.id}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                  style={{ backgroundColor: c.hex }}
                />
                {it.title || "(untitled)"}
              </button>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div
        ref={gridRef}
        className="relative flex-1 overflow-y-auto"
        data-testid="day-time-grid"
      >
        <div
          className="relative"
          style={{ height: `${HOUR_HEIGHT_PX * 24}px` }}
        >
          {/* Hour rows */}
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/60"
              style={{ top: `${h * HOUR_HEIGHT_PX}px`, height: `${HOUR_HEIGHT_PX}px` }}
            >
              <div className="absolute -top-2 left-2 text-[10px] text-muted-foreground tabular-nums">
                {formatTimeLabel(h * 60)}
              </div>
            </div>
          ))}

          {/* Card layer — left edge after the time gutter (~52px). */}
          <div className="absolute left-[52px] right-2 top-0 bottom-0">
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
                  key={`${it.id}-${it.date}-${p.startMin}`}
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
    </div>
  );
}
