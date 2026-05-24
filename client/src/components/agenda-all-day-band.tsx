// =============================================================================
// AgendaAllDayBand — Phase 3a
// =============================================================================
// Renders the all-day strip for a single day, intended to be mounted INSIDE
// the page's sticky header (so it pins below the date row and stays visible
// while the timed grid scrolls underneath, matching Google Calendar).
//
// Renders nothing when the day has no all-day events — no empty band, no
// gap. Subscribes to the same TanStack Query key the timed grid uses, so
// only one fetch backs both components.
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

type Props = {
  date: string; // YYYY-MM-DD
  onSelect: (item: AgendaWindowItem) => void;
};

export function AgendaAllDayBand({ date, onSelect }: Props) {
  const { data: items = [] } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", "v2", { from: date, to: date }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${date}&to=${date}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const allDay = useMemo(
    () => items.filter((it) => it.isAllDay === 1 || !it.time),
    [items],
  );

  if (allDay.length === 0) return null;

  return (
    <div
      className="border-t pt-2 space-y-1"
      data-testid="day-all-day-band"
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        All day
      </div>
      {allDay.map((it) => {
        const c = findColor(it.color);
        // PR #41 — solid-fill rollout. The leading dot is dropped because
        // the chip body is now the same hex — the dot would be invisible.
        const fg = pickContrastingText(c.hex);
        return (
          <button
            key={`${it.id}-${it.startDate}`}
            onClick={() => onSelect(it)}
            className="w-full text-left rounded-md px-2 py-1 text-xs font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: c.hex, color: fg }}
            data-testid={`button-allday-${it.id}`}
          >
            {it.title || "(untitled)"}
          </button>
        );
      })}
    </div>
  );
}
