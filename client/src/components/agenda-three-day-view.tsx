// =============================================================================
// AgendaThreeDayView — Phase 3b (§20a)
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
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { packLanes } from "@/lib/lane-pack";
import {
  addDays,
  formatTimeLabel,
  formatDateContextLabel,
  threeDayRange,
  toIsoDate,
} from "@/lib/agenda-utils";
import { findColor } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import { CurrentTimeLine, HOUR_HEIGHT_PX } from "@/components/agenda-time-grid-shared";

type Props = {
  date: string; // anchor day; columns are date, date+1, date+2
  onSelect: (item: AgendaWindowItem) => void;
};

// -----------------------------------------------------------------------------
// Sticky shell — column header + all-day strip
// -----------------------------------------------------------------------------
// Shared TanStack Query key with the body, so the page only fetches once.
export function AgendaThreeDayStickyShell({ date, onSelect }: Props) {
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
      {/* Column header row — day labels above the grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `60px repeat(3, 1fr)` }}
        data-testid="threeday-column-header"
      >
        <div />
        {days.map((d) => {
          const isToday = d === todayIso;
          return (
            <div
              key={d}
              className={
                "px-2 py-2 text-center text-xs border-l " +
                (isToday ? "font-semibold text-chart-1" : "text-muted-foreground")
              }
              data-testid={`threeday-col-header-${d}`}
            >
              {formatDateContextLabel(d)}
            </div>
          );
        })}
      </div>

      {/* All-day strip — only renders the row if any column has all-day items */}
      <ThreeDayAllDayStrip items={items} days={days} onSelect={onSelect} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Body — time grid only (mounted under the sticky shell)
// -----------------------------------------------------------------------------
export function AgendaThreeDayView({ date, onSelect }: Props) {
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

  const totalHeight = HOUR_HEIGHT_PX * 24;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col">
      {/* Time grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `60px repeat(3, 1fr)`,
          height: `${totalHeight}px`,
        }}
        data-testid="threeday-time-grid"
      >
        {/* Gutter */}
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 pr-2 text-right text-[10px] text-muted-foreground tabular-nums"
              style={{
                top: `${h * HOUR_HEIGHT_PX - 6}px`,
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
            items={items.filter((it) => it.date === d)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ThreeDayAllDayStrip({
  items,
  days,
  onSelect,
}: {
  items: AgendaWindowItem[];
  days: string[];
  onSelect: (item: AgendaWindowItem) => void;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaWindowItem[]>();
    for (const d of days) m.set(d, []);
    for (const it of items) {
      if (it.isAllDay !== 1) continue;
      const list = m.get(it.date);
      if (list) list.push(it);
    }
    return m;
  }, [items, days]);

  const anyAllDay = days.some((d) => (byDay.get(d) ?? []).length > 0);
  if (!anyAllDay) return null;

  return (
    <div
      className="grid border-t bg-muted/30"
      style={{ gridTemplateColumns: `60px repeat(3, 1fr)` }}
      data-testid="threeday-allday-strip"
    >
      <div className="text-[10px] text-muted-foreground text-right pr-2 py-1">
        all-day
      </div>
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div key={d} className="border-l px-1 py-1 space-y-1 min-h-[28px]">
            {list.map((it) => {
              const c = findColor(it.color);
              return (
                <button
                  key={`ad-${it.id}-${it.date}`}
                  onClick={() => onSelect(it)}
                  className="w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate hover:opacity-95 border border-white/40"
                  style={{ backgroundColor: c.softHex, color: c.hex }}
                  data-testid={`threeday-allday-${it.id}-${it.date}`}
                >
                  {it.title || "(untitled)"}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ThreeDayColumn({
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
  const MIN_CHIP_HEIGHT_PX = 18;

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
            key={`${it.id}-${it.date}-${p.startMin}`}
            onClick={() => onSelect(it)}
            className="absolute rounded-sm text-left overflow-hidden hover:opacity-95 transition-opacity border border-white/40"
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
              backgroundColor: c.softHex,
            }}
            data-testid={`threeday-chip-${it.id}-${it.date}`}
          >
            <div className="px-1 py-0.5">
              <div
                className="text-[10px] font-medium truncate leading-tight"
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
