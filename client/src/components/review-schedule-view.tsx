// =============================================================================
// ReviewScheduleView — Infinite scroll schedule view for Review page
// =============================================================================
// Similar to AgendaScheduleView but renders review task blocks with
// completion status and action buttons. Implements infinite scroll around
// the chosen date in 14-day chunks.
// =============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  toIsoDate,
  fromIsoDate,
  addDays,
  formatTimeLabel,
  formatDateContextLabel,
  timeToMinutes,
} from "@/lib/agenda-utils";
import { cn } from "@/lib/utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import type { TaskCompletion } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, SkipForward, XCircle, CalendarClock } from "lucide-react";

const WINDOW_DAYS = 7;

type ReviewItem = AgendaWindowItem & {
  completion: TaskCompletion | null;
};

type CompletionStatus = "done" | "missed" | "skipped" | "rescheduled";

const STATUS_CONFIG = {
  done: { icon: CheckCircle2, className: "text-green-600", label: "Done" },
  missed: { icon: XCircle, className: "text-red-600", label: "Missed" },
  skipped: { icon: SkipForward, className: "text-orange-600", label: "Skipped" },
  rescheduled: { icon: CalendarClock, className: "text-blue-600", label: "Rescheduled" },
};

interface ReviewScheduleViewProps {
  date: string;
  onOpenView: (item: AgendaWindowItem) => void;
  onReschedule: (item: AgendaWindowItem) => void;
  onMark: (item: AgendaWindowItem, status: CompletionStatus) => void;
  onUndo: (id: number) => void;
  isExternal: (item: AgendaWindowItem) => boolean;
}

export function ReviewScheduleView({
  date,
  onOpenView,
  onReschedule,
  onMark,
  onUndo,
  isExternal,
}: ReviewScheduleViewProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ from: date, to: date });

  // Calculate initial range centered on the chosen date
  const initialRange = useMemo(() => {
    const d = fromIsoDate(date);
    const start = addDays(date, -WINDOW_DAYS / 2);
    const end = addDays(date, WINDOW_DAYS / 2);
    return { from: start, to: end };
  }, [date]);

  // Fetch agenda items for the visible range
  const { data: agendaItems = [], isLoading } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", "v2", visibleRange],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${visibleRange.from}&to=${visibleRange.to}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Fetch completions for the visible range
  const { data: completions = [] } = useQuery<TaskCompletion[]>({
    queryKey: ["/api/completions", visibleRange],
    queryFn: async () => {
      const r = await fetch(`/api/completions?from=${visibleRange.from}&to=${visibleRange.to}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Merge items with completions
  const reviewItems: ReviewItem[] = useMemo(() => {
    const findCompletion = (item: AgendaWindowItem): TaskCompletion | null => {
      if (isExternal(item)) {
        return completions.find(c => c.agendaTaskId === item.id && c.originalDate === item.startDate) ?? null;
      }
      if (item.seriesId) {
        return completions.find(c => c.seriesId === item.seriesId && c.originalDate === item.startDate) ?? null;
      }
      return completions.find(c => c.agendaTaskId === item.id && c.originalDate === item.startDate) ?? null;
    };
    return agendaItems.map(i => ({ ...i, completion: findCompletion(i) }));
  }, [agendaItems, completions, isExternal]);

  // Group items by date
  const itemsByDate = useMemo(() => {
    const groups: Record<string, ReviewItem[]> = {};
    reviewItems.forEach(item => {
      const d = item.startDate;
      if (!groups[d]) groups[d] = [];
      groups[d].push(item);
    });
    return groups;
  }, [reviewItems]);

  // Sort dates chronologically
  const sortedDates = useMemo(() => {
    return Object.keys(itemsByDate).sort();
  }, [itemsByDate]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    
    // Load more when near bottom
    if (scrollTop + clientHeight > scrollHeight - 200) {
      const currentEnd = fromIsoDate(visibleRange.to);
      const newEnd = addDays(visibleRange.to, WINDOW_DAYS);
      setVisibleRange(prev => ({ ...prev, to: newEnd }));
    }
    
    // Load more when near top
    if (scrollTop < 200) {
      const newStart = addDays(visibleRange.from, -WINDOW_DAYS);
      setVisibleRange(prev => ({ ...prev, from: newStart }));
    }
  }, [visibleRange]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll);
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // Scroll to the chosen date on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      const dateElement = document.getElementById(`date-${date}`);
      if (dateElement && scrollRef.current) {
        dateElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [date]);

  // Render a single task block
  function renderTaskBlock(item: ReviewItem) {
    const external = isExternal(item);
    const startMin = timeToMinutes(item.time);
    const timeLabel = item.isAllDay ? "All day" : (startMin != null ? formatTimeLabel(startMin) : "");
    const completion = item.completion;

    return (
      <div
        key={`${item.id}-${item.startDate}`}
        className="flex items-start gap-2 px-3 py-2 rounded-md border border-transparent hover:bg-accent transition-colors"
      >
        {!external && (
          <Checkbox className="mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onOpenView(item)}
            className="text-sm font-medium truncate text-left hover:text-primary transition-colors block"
          >
            {item.title ?? "Untitled"}
          </button>
          {timeLabel && (
            <p className="text-xs text-muted-foreground">{timeLabel}</p>
          )}
          {item.placeName && (
            <p className="text-xs text-muted-foreground">in {item.placeName}</p>
          )}
        </div>
        {!external && (
          <div className="flex items-center gap-1 shrink-0">
            {!completion ? (
              <>
                {(["done", "missed", "skipped"] as CompletionStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      title={cfg.label}
                      onClick={() => onMark(item, s)}
                      className={cn("p-1 rounded hover:bg-accent transition-colors", cfg.className)}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
                <button
                  title="Reschedule"
                  onClick={() => onReschedule(item)}
                  className={cn("p-1 rounded hover:bg-accent transition-colors", STATUS_CONFIG.rescheduled.className)}
                >
                  <CalendarClock className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                title="Undo"
                onClick={() => onUndo(completion.id)}
                className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground mt-6 text-center">Loading…</p>;
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="space-y-4">
        {sortedDates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">No items scheduled for this period.</p>
        ) : (
          sortedDates.map(date => {
            const items = itemsByDate[date];
            const dayLabel = formatDateContextLabel(date);
            return (
              <div key={date} id={`date-${date}`} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground sticky top-0 bg-background py-1">
                  {dayLabel}
                </div>
                <div className="space-y-1">
                  {items.map(renderTaskBlock)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
