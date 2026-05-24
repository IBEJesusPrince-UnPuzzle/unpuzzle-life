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

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import { formatDateContextLabel, formatTimeLabel, timeToMinutes } from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  date: string | null;
  onSelect: (item: AgendaWindowItem) => void;
};

export function AgendaMonthDayOverlay({ open, onOpenChange, date, onSelect }: Props) {
  // Keep the Sheet mounted for 400ms after closing so the slide-out
  // animation can complete. Unmounting immediately would freeze the
  // animation AND — more critically — leaving it mounted while closed
  // causes Radix to apply pointer-events:none to <body>, blocking all
  // desktop clicks on the month grid.
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMounted(true);
    } else {
      timerRef.current = setTimeout(() => setMounted(false), 400);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open]);

  if (!mounted) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] overflow-y-auto"
        data-testid="month-day-overlay-sheet"
      >
        {date && (
          <>
            <SheetHeader className="flex flex-row items-center justify-between pr-8">
              <SheetTitle>{formatDateContextLabel(date)}</SheetTitle>
              <GoToDayButton date={date} onClose={() => onOpenChange(false)} />
            </SheetHeader>
            <div className="mt-3">
              <OverlayBody date={date} onSelect={onSelect} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GoToDayButton({ date, onClose }: { date: string; onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs shrink-0"
      onClick={() => {
        onClose();
        window.location.href = `/agenda?d=${date}&v=day`;
      }}
    >
      <CalendarDays className="w-3.5 h-3.5" />
      Day view
    </Button>
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
    queryKey: ["/api/agenda", "v2", { from: date, to: date }],
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
        // PR #41 — solid-fill rollout. Background uses the row's hex;
        // foreground (time + title) uses a contrasting text color.
        const fg = pickContrastingText(c.hex);
        return (
          <li key={`o-${it.id}-${it.startDate}-${it.time ?? "ad"}`}>
            <button
              type="button"
              onClick={() => onSelect(it)}
              className="w-full text-left rounded-md px-3 py-2 hover:opacity-95 transition-opacity"
              style={{ backgroundColor: c.hex }}
              data-testid={`month-day-overlay-row-${it.id}-${it.startDate}`}
            >
              <div className="flex items-center gap-2">
                {!isAD && it.time && (
                  <div
                    className="text-[11px] tabular-nums shrink-0 w-16"
                    style={{ color: fg, opacity: 0.9 }}
                  >
                    {formatTimeLabel(timeToMinutes(it.time) ?? 0)}
                  </div>
                )}
                <div
                  className="text-xs font-medium truncate"
                  style={{ color: fg }}
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
