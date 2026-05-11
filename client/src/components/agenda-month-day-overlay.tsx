// =============================================================================
// AgendaMonthDayOverlay — Phase 3b (§20d)
// =============================================================================
// Closeable day agenda overlay opened by tapping a Month cell or a "+N more"
// chip. Bottom sheet on mobile, popover-style centered dialog on desktop.
//
// Locked behavior (calendar-spec-v2 §20d):
//   - Simple chronological list (NOT a mini Day view)
//   - All-day rows: plain accent row, NO time prefix
//   - Timed rows: time + title + status icon (status icon TBD when wired)
//   - Every row gets a soft transparent category-color fill
//   - Tap a row → opens the task modal for that item
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { findColor } from "@/lib/agenda-colors";
import { formatDateContextLabel, formatTimeLabel, timeToMinutes } from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  date: string | null;
  onSelect: (item: AgendaWindowItem) => void;
};

export function AgendaMonthDayOverlay({ open, onOpenChange, date, onSelect }: Props) {
  const isMobile = useIsMobile();

  if (!date) return null;

  const title = formatDateContextLabel(date);
  // PR #30b — do NOT close the overlay when a row is tapped. The view-popup
  // opens on TOP of the overlay (URL pushes ?task=N on top of ?overlay=ISO),
  // and tapping ✕ on the popup pops the URL back to the overlay-only state.
  // This is how Google Calendar's month-day overlay works.
  const body = (
    <OverlayBody date={date} onSelect={(it) => {
      onSelect(it);
    }} />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto"
          data-testid="month-day-overlay-sheet"
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-3">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        data-testid="month-day-overlay-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function OverlayBody({
  date,
  onSelect,
}: {
  date: string;
  onSelect: (item: AgendaWindowItem) => void;
}) {
  const { data: items = [], isLoading } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", { from: date, to: date }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${date}&to=${date}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Sort: all-day rows first (no time prefix), then timed asc by minutes.
  const ordered = [...items].sort((a, b) => {
    if (a.isAllDay !== b.isAllDay) return (b.isAllDay ?? 0) - (a.isAllDay ?? 0);
    const am = timeToMinutes(a.time) ?? 0;
    const bm = timeToMinutes(b.time) ?? 0;
    return am - bm;
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-4">Loading…</div>;
  }
  if (ordered.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        Nothing scheduled.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5" data-testid="month-day-overlay-list">
      {ordered.map((it) => {
        const c = findColor(it.color);
        const isAD = it.isAllDay === 1;
        return (
          <li key={`o-${it.id}-${it.startDate}-${it.time ?? "ad"}`}>
            <button
              type="button"
              onClick={() => onSelect(it)}
              className="w-full text-left rounded-md px-3 py-2 hover:opacity-95 transition-opacity"
              style={{ backgroundColor: c.softHex }}
              data-testid={`month-day-overlay-row-${it.id}-${it.startDate}`}
            >
              <div className="flex items-center gap-2">
                {!isAD && it.time && (
                  <div
                    className="text-[11px] tabular-nums shrink-0 w-16"
                    style={{ color: c.hex }}
                  >
                    {formatTimeLabel(timeToMinutes(it.time) ?? 0)}
                  </div>
                )}
                <div
                  className="text-xs font-medium truncate"
                  style={{ color: c.hex }}
                >
                  {it.title || "(untitled)"}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
