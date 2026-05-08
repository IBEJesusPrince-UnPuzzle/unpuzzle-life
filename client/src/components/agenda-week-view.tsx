// =============================================================================
// AgendaWeekView — Phase 3b (§20b)
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

type Props = {
  date: string; // any date in the week to show
  onSelect: (item: AgendaWindowItem) => void;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// -----------------------------------------------------------------------------
// Sticky shell — column header + all-day strip
// -----------------------------------------------------------------------------
// Shared TanStack Query key with the body, so the page only fetches once.
export function AgendaWeekStickyShell({ date, onSelect }: Props) {
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
      {/* Column header — short labels (Sun4, Mon5, ...) */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}
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
                (isToday ? "font-semibold text-chart-1" : "text-muted-foreground")
              }
              data-testid={`week-col-header-${d}`}
            >
              <div>{DAY_LABELS[i]}</div>
              <div className="tabular-nums">{dayNum}</div>
            </div>
          );
        })}
      </div>

      {/* All-day strip */}
      <WeekAllDayStrip items={items} days={days} onSelect={onSelect} />
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
          gridTemplateColumns: `48px repeat(7, 1fr)`,
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
            items={items.filter((it) => it.date === d)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function WeekAllDayStrip({
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
      style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}
      data-testid="week-allday-strip"
    >
      <div className="text-[9px] text-muted-foreground text-right pr-1 py-1">
        all-day
      </div>
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div key={d} className="border-l px-0.5 py-0.5 space-y-0.5 min-h-[24px]">
            {list.map((it) => {
              const c = findColor(it.color);
              return (
                <button
                  key={`ad-${it.id}-${it.date}`}
                  onClick={() => onSelect(it)}
                  className="w-full text-left px-1 py-0.5 rounded text-[9px] truncate hover:opacity-95"
                  style={{ backgroundColor: c.softHex, color: c.hex }}
                  data-testid={`week-allday-${it.id}-${it.date}`}
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
            key={`${it.id}-${it.date}-${p.startMin}`}
            onClick={() => onSelect(it)}
            className="absolute rounded-sm text-left overflow-hidden hover:opacity-95 transition-opacity"
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
              backgroundColor: c.softHex,
            }}
            data-testid={`week-chip-${it.id}-${it.date}`}
          >
            <div className="px-1">
              <div
                className="text-[9px] font-medium truncate leading-tight"
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
