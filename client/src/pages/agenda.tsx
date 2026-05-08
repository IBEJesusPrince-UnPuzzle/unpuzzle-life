// =============================================================================
// AgendaPage — Phase 3b (§22, §22a, §23, §20a–§20d, §21)
// =============================================================================
// Phase 3b ships all four views (Day, 3 Days, Week, Month) plus the
// Month tap-day overlay (§20d). Header chrome is unchanged from Phase 3a;
// the body switches based on `view`, and a single shared swipe-nav hook
// drives ±step date changes per view (Day ±1d, 3 Days ±3d, Week ±7d,
// Month ±1mo) — same step rules Google Calendar uses.
//
// Header layout (locked §22):
//   Row 1: [Agenda title]   [Today]   [+ Task]
//   Row 2: [<] [date label] [>]                              [view selector]
//
// Date label updates per view:
//   Day:    "Wed, May 7"
//   3 Days: "May 7 – 9"
//   Week:   "May 4 – 10"
//   Month:  "May 2026"
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import {
  addDays,
  formatDateContextLabel,
  formatMonthLabel,
  formatRangeLabel,
  fromIsoDate,
  threeDayRange,
  toIsoDate,
  weekRange,
} from "@/lib/agenda-utils";
import { AgendaDayView } from "@/components/agenda-day-view";
import {
  AgendaThreeDayView,
  AgendaThreeDayStickyShell,
} from "@/components/agenda-three-day-view";
import {
  AgendaWeekView,
  AgendaWeekStickyShell,
} from "@/components/agenda-week-view";
import { AgendaMonthView } from "@/components/agenda-month-view";
import { AgendaMonthDayOverlay } from "@/components/agenda-month-day-overlay";
import { AgendaAllDayBand } from "@/components/agenda-all-day-band";
import {
  AgendaTaskModal,
  type AgendaWindowItem,
} from "@/components/agenda-task-modal";
import { AgendaTaskViewModal } from "@/components/agenda-task-view-modal";
import { useSwipeNav } from "@/hooks/use-swipe-nav";

type AgendaView = "day" | "3day" | "week" | "month";

export default function AgendaPage() {
  const [date, setDate] = useState<string>(() => toIsoDate(new Date()));
  const [view, setView] = useState<AgendaView>("day");

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaWindowItem | null>(null);

  // View-first sheet (PR #13). Tapping a chip/bar opens this sheet; the
  // pencil inside it then opens the existing edit modal as a clean swap.
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<AgendaWindowItem | null>(null);

  // Month-day overlay state.
  const [overlayDate, setOverlayDate] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Read the persisted default view once on mount.
  const { data: defaultViewResp } = useQuery<{ view: AgendaView }>({
    queryKey: ["/api/agenda-default-view"],
  });
  useEffect(() => {
    if (defaultViewResp?.view) setView(defaultViewResp.view);
  }, [defaultViewResp?.view]);

  // Persist view changes back to the server (fire-and-forget).
  function changeView(next: AgendaView) {
    setView(next);
    apiRequest("PATCH", "/api/agenda-default-view", { view: next }).catch(() => {
      // Non-critical — the in-memory view still updates.
    });
  }

  // Per-view step. Locked May 7, 2026:
  //   Day ±1d, 3 Days ±3d, Week ±7d, Month ±1mo.
  function step(direction: -1 | 1) {
    if (view === "month") {
      const d = fromIsoDate(date);
      const next = new Date(d.getFullYear(), d.getMonth() + direction, d.getDate());
      // Clamp the day if we cross to a shorter month (e.g. May 31 → Jun 30)
      const lastOfNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      if (next.getDate() !== d.getDate()) {
        next.setDate(Math.min(d.getDate(), lastOfNext));
      }
      setDate(toIsoDate(next));
      return;
    }
    const stepDays = view === "day" ? 1 : view === "3day" ? 3 : 7;
    setDate((d) => addDays(d, direction * stepDays));
  }
  const goPrev = () => step(-1);
  const goNext = () => step(1);
  const goToday = () => setDate(toIsoDate(new Date()));

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(item: AgendaWindowItem) {
    setEditing(item);
    setModalOpen(true);
  }
  // View-first entry (PR #13). Every chip/bar tap routes here instead of
  // jumping straight into edit.
  function openView(item: AgendaWindowItem) {
    setViewing(item);
    setViewOpen(true);
  }

  function openOverlay(iso: string) {
    setOverlayDate(iso);
    setOverlayOpen(true);
  }

  // Header date label per view.
  const dateLabel = useMemo(() => {
    if (view === "day") return formatDateContextLabel(date);
    if (view === "month") return formatMonthLabel(date);
    const range = view === "3day" ? threeDayRange(date) : weekRange(date);
    return formatRangeLabel(range.from, range.to);
  }, [view, date]);

  // Swipe gesture — disabled while any modal/overlay is open so it doesn't
  // hijack interactions inside them.
  const swipeHandlers = useSwipeNav({
    onPrev: goPrev,
    onNext: goNext,
    disabled: modalOpen || overlayOpen || viewOpen,
  });

  return (
    <div>
      {/* Header — locked §22 chrome. Sticky so it stays visible while the
          body scrolls underneath in the page's main scroll container. */}
      <div className="sticky top-0 z-20 border-b px-4 py-3 space-y-2 bg-background">
        {/* Row 1 */}
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-chart-1" />
            Agenda
          </h1>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            data-testid="button-today"
          >
            Today
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            data-testid="button-add-task"
          >
            <Plus className="w-4 h-4 mr-1" /> Task
          </Button>
        </div>

        {/* Row 2 */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            data-testid="button-prev-day"
            className="h-7 w-7"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div
            className="text-sm font-medium tabular-nums px-2 text-center whitespace-nowrap"
            data-testid="text-date-context"
          >
            {dateLabel}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            data-testid="button-next-day"
            className="h-7 w-7"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="flex-1" />

          {/* View selector */}
          <div
            className="inline-flex shrink-0 rounded-md border bg-muted p-0.5"
            data-testid="view-selector"
          >
            {(["day", "3day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={
                  "px-2.5 h-7 text-xs rounded-sm transition-colors whitespace-nowrap " +
                  (view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground")
                }
                data-testid={`button-view-${v}`}
              >
                {v === "3day" ? "3 Days" : v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Per-view sticky chrome. Each lives INSIDE the page-level sticky
            header so the column header + all-day strip stay pinned while
            the time grid scrolls underneath. Day uses its own All-Day band;
            3 Days/Week mount their column-header + all-day strip together;
            Month has no inline chrome. */}
        {view === "day" && (
          <AgendaAllDayBand date={date} onSelect={openView} />
        )}
        {/* 3 Days / Week sticky shells span full width to align with the
            time grid below; cancel the page header's px-4 with -mx-4. */}
        {view === "3day" && (
          <div className="-mx-4">
            <AgendaThreeDayStickyShell
              date={date}
              onSelect={openView}
              onMoreTap={openOverlay}
            />
          </div>
        )}
        {view === "week" && (
          <div className="-mx-4">
            <AgendaWeekStickyShell
              date={date}
              onSelect={openView}
              onMoreTap={openOverlay}
            />
          </div>
        )}
      </div>

      {/* Body — wrapped in the swipe-nav container so all four views
          share the gesture. Swipe is horizontal-only and won't fire when
          a modal or overlay is open. */}
      <div {...swipeHandlers} data-testid="agenda-body">
        {view === "day" && <AgendaDayView date={date} onSelect={openView} />}
        {view === "3day" && <AgendaThreeDayView date={date} onSelect={openView} />}
        {view === "week" && <AgendaWeekView date={date} onSelect={openView} />}
        {view === "month" && <AgendaMonthView date={date} onDayTap={openOverlay} />}
      </div>

      <AgendaTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultDate={date}
        editing={editing}
      />

      {/* View-first sheet (PR #13). Pencil inside this sheet routes back
          through openEdit, which opens the existing edit modal as a clean
          swap (Google parity). */}
      <AgendaTaskViewModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        item={viewing}
        onEdit={openEdit}
      />

      <AgendaMonthDayOverlay
        open={overlayOpen}
        onOpenChange={setOverlayOpen}
        date={overlayDate}
        onSelect={openView}
      />
    </div>
  );
}
