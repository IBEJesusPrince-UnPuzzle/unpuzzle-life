// =============================================================================
// AgendaPage — Phase 3b (§22, §22a, §23, §20a–§20d, §21) + PR #30b
// =============================================================================
// Phase 3b ships all four views (Day, 3 Days, Week, Month) plus the
// Month tap-day overlay (§20d). Header chrome is unchanged from Phase 3a;
// the body switches based on `view`, and a single shared swipe-nav hook
// drives ±step date changes per view (Day ±1d, 3 Days ±3d, Week ±7d,
// Month ±1mo) — same step rules Google Calendar uses.
//
// Header layout (locked §22):
//   Row 1: [Agenda title]   [Today]   [+ Task]   [⚙]
//   Row 2: [<] [date label] [>]                              [view selector]
//
// Date label updates per view:
//   Day:    "Wed, May 7"
//   3 Days: "May 7 – 9"
//   Week:   "May 4 – 10"
//   Month:  "May 2026"
//
// PR #30b — URL state machine.
// Date, view, the month-day overlay, AND the view popup all live in
// window.location.search now so:
//   1. Tapping ✕ on the popup pops one entry and re-shows the overlay
//      (if one was open), or the agenda (if not).
//   2. After [Open project] / [Open responsibility] navigates away to
//      /projects/:id or /responsibilities/:id, browser Back returns to
//      /agenda with the popup + overlay restored (Google parity).
//   3. The task-type filter (gear popover) persists per-user on the
//      preferences table; /api/agenda already filters by it server-side.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { SidebarMenuButton } from "@/components/sidebar-menu";
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
import { AgendaScheduleView } from "@/components/agenda-schedule-view";
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
  type AgendaWindowItem,
} from "@/components/agenda-task-modal";
import { AgendaTaskViewModal } from "@/components/agenda-task-view-modal";
import { ExternalEventDetailSheet } from "@/components/external-event-detail-sheet";
import { AgendaTaskFilterMenu } from "@/components/agenda-task-filter-menu";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { useAgendaUrlState, type AgendaView } from "@/hooks/use-agenda-url-state";

export default function AgendaPage() {
  // URL is the source of truth for date/view/overlay/popup (PR #30b).
  const { state: url, replace: urlReplace, push: urlPush, back: urlBack, popPopupThen: urlPopPopupThen } = useAgendaUrlState();

  // PR #31 — page-mode routes for create/edit
  const [, navigate] = useLocation();

  const date = url.d;
  const view: AgendaView = url.v ?? "day";

  const overlayOpen = url.overlay != null;
  const overlayDate = url.overlay;

  const viewOpen = url.task != null;

  // PR #31 — create/edit are now full page routes (/agenda/tasks/new and
  // /agenda/tasks/:id/edit), not a dialog. The local modal state was
  // removed; openCreate and openEdit navigate instead. Back button on the
  // page returns here cleanly (no special history-stack handling needed
  // because the destination is a real route, not an overlay query param).

  // The view-popup needs an AgendaWindowItem to drive its top-bar (title,
  // color, time, recurrence). When the user clicks a row we already have
  // the object — stash it. When the user lands here via browser Back from
  // /projects or /responsibilities, ?task=N is in the URL but `viewing` is
  // null on a fresh mount; we fall back to fetching /api/agenda-tasks/:id.
  const [viewingCache, setViewingCache] = useState<AgendaWindowItem | null>(null);

  // External calendar events use a different sheet (read-only)
  const [externalEvent, setExternalEvent] = useState<AgendaWindowItem | null>(null);

  const taskIdFromUrl = url.task;
  const { data: taskFromUrl } = useQuery<AgendaWindowItem>({
    queryKey: ["/api/agenda-tasks", taskIdFromUrl],
    queryFn: async () => {
      const r = await fetch(`/api/agenda-tasks/${taskIdFromUrl}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const row = await r.json();
      // Virtual flag is hinted by the URL's `master` param; if present,
      // the user opened a virtual instance and Back brought them back.
      if (url.master != null) {
        row.isVirtual = true;
        row.masterId = url.master;
      }
      return row as AgendaWindowItem;
    },
    enabled: taskIdFromUrl != null && viewingCache?.id !== taskIdFromUrl,
  });

  const viewing: AgendaWindowItem | null =
    viewingCache && viewingCache.id === taskIdFromUrl ? viewingCache : taskFromUrl ?? null;

  // Read the persisted default view once on mount AND apply it only if
  // the URL itself didn't already pin a view (so reload of a bookmarked
  // URL stays on the URL's view).
  const { data: defaultViewResp } = useQuery<{ view: AgendaView }>({
    queryKey: ["/api/agenda-default-view"],
  });
  useEffect(() => {
    if (url.v == null && defaultViewResp?.view) {
      urlReplace({ v: defaultViewResp.view });
    }
  }, [defaultViewResp?.view, url.v, urlReplace]);

  // Persist view changes back to the server (fire-and-forget).
  function changeView(next: AgendaView) {
    urlReplace({ v: next });
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
      const lastOfNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      if (next.getDate() !== d.getDate()) {
        next.setDate(Math.min(d.getDate(), lastOfNext));
      }
      urlReplace({ d: toIsoDate(next) });
      return;
    }
    const stepDays = view === "day" ? 1 : view === "3day" ? 3 : 7;
    urlReplace({ d: addDays(date, direction * stepDays) });
  }
  const goPrev = () => step(-1);
  const goNext = () => step(1);

  // PR #40 — Today now also triggers a one-shot "scroll to previous full
  // hour" effect on time-axis views (Schedule / Day / 3-Day / Week). We
  // bump a counter every tap; child views watch this and auto-scroll.
  // Month has no time axis so it ignores the counter.
  const [todayScrollKey, setTodayScrollKey] = useState(0);
  const goToday = () => {
    urlReplace({ d: toIsoDate(new Date()) });
    setTodayScrollKey((n) => n + 1);
  };

  // PR #31 — [+ Task] now navigates to the page-mode create route.
  // The current `date` (URL `d` param) is forwarded so the form opens
  // pre-filled on the visible day (matches the legacy dialog's
  // defaultDate={date} behavior).
  function openCreate() {
    navigate(`/agenda/tasks/new?date=${encodeURIComponent(date)}`);
  }

  // PR #31 — edit pencil navigates to the page-mode edit route.
  // Virtual occurrences forward both ?master= and ?occurrence= so the
  // edit page can reconstruct the AgendaWindowItem (matches the legacy
  // setEditing({ ...item, isVirtual: true, masterId }) shape).
  //
  // Sequencing: the view sheet's pencil calls onOpenChange(false) (which
  // fires urlBack — a history.back()) *before* onEdit. history.back() is
  // asynchronous; if we navigate() synchronously here, the pushState lands
  // first, then the queued pop unwinds it and leaves the user on /agenda.
  // Wait for the popstate to settle, then navigate. urlPopPopupThen does
  // not apply because the back was already initiated by the view-sheet's
  // close handler — we just need to ride that wave.
  function openEdit(item: AgendaWindowItem) {
    const params = new URLSearchParams();
    if (item.isVirtual) {
      params.set("master", String(item.masterId ?? item.id));
      params.set("occurrence", item.startDate);
    }
    const qs = params.toString();
    const path = `/agenda/tasks/${item.id}/edit${qs ? `?${qs}` : ""}`;
    // If a popup is on the URL (task=...), wait for the back-pop that the
    // view sheet's onOpenChange(false) just queued to finish before pushing
    // the edit route. Otherwise navigate immediately (called from a path
    // that didn't open a popup, e.g. direct list -> edit).
    if (url.task != null) {
      const onPop = () => {
        window.removeEventListener("popstate", onPop);
        navigate(path);
      };
      window.addEventListener("popstate", onPop);
    } else {
      navigate(path);
    }
  }
  // View-first entry (PR #13 / #30a). Tapping any chip/bar pushes the popup
  // onto the history stack so Back closes it cleanly.
  // PR #53: External calendar events open read-only sheet instead of task modal
  function openView(item: AgendaWindowItem) {
    // External events have origin === "external" or negative IDs
    if (item.origin === "external" || item.id < 0) {
      setExternalEvent(item);
      return;
    }
    setViewingCache(item);
    urlPush({ task: item.id, master: item.isVirtual ? item.masterId ?? null : null });
  }

  function openOverlay(iso: string) {
    urlPush({ overlay: iso });
  }

  // Close handlers go through the URL so the browser back stack stays in
  // sync. Calling .back() pops one entry; popstate inside useAgendaUrlState
  // re-reads the URL and updates view/overlay/task flags.
  function handleViewOpenChange(next: boolean) {
    if (next) return; // open is driven by URL push above
    urlBack();
  }
  function handleOverlayOpenChange(next: boolean) {
    if (next) return;
    urlBack();
  }

  // PR #40 — Schedule view tracks the day visible at the top of its
  // scroll viewport. The visible date is debounced (200 ms) before being
  // written to the master URL anchor via urlReplace so that switching to
  // another view lands on the last scrolled date. The debounce prevents
  // urlReplace from firing on every scroll frame, preserving 60fps momentum.
  const scheduleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScheduleVisibleDateChange = useCallback(
    (iso: string | null) => {
      if (iso === null) return;
      if (scheduleDebounceRef.current !== null) {
        clearTimeout(scheduleDebounceRef.current);
      }
      scheduleDebounceRef.current = setTimeout(() => {
        scheduleDebounceRef.current = null;
        urlReplace({ d: iso });
      }, 200);
    },
    [urlReplace],
  );

  // Derived: while in schedule view, the header label follows url.d (the
  // master anchor), which is kept up-to-date by the debounced handler above.
  const scheduleVisibleDate: string | null = view === "schedule" ? date : null;

  // Header date label per view.
  const dateLabel = useMemo(() => {
    if (view === "schedule") {
      const iso = scheduleVisibleDate ?? date;
      return formatMonthLabel(iso);
    }
    if (view === "day") return formatDateContextLabel(date);
    if (view === "month") return formatMonthLabel(date);
    const range = view === "3day" ? threeDayRange(date) : weekRange(date);
    return formatRangeLabel(range.from, range.to);
  }, [view, date, scheduleVisibleDate]);

  // Swipe gesture — disabled while any modal/overlay is open so it doesn't
  // hijack interactions inside them.
  const swipeHandlers = useSwipeNav({
    onPrev: goPrev,
    onNext: goNext,
    disabled: overlayOpen || viewOpen,
  });

  return (
    <div>
      {/* Header — locked §22 chrome. Sticky so it stays visible while the
          body scrolls underneath in the page's main scroll container. */}
      <div className="sticky top-0 z-20 border-b px-4 py-3 space-y-2 bg-background">
        {/* Row 1 */}
        <div className="flex items-center gap-2">
          <SidebarMenuButton />
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/agenda/calendar-sources")}
            title="Calendar sources"
          >
            <ListChecks className="w-5 h-5 text-chart-1" />
          </Button>
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
          {/* PR #30b — gear popover for task-type visibility (Google parity). */}
          <AgendaTaskFilterMenu />
        </div>

        {/* Row 2 — PR #40: chevrons removed. Date label stands alone; nav
            is swipe-only on grid views and scroll-driven on Schedule. */}
        <div className="flex items-center gap-1">
          <div
            className="text-sm font-medium tabular-nums px-2 whitespace-nowrap"
            data-testid="text-date-context"
          >
            {dateLabel}
          </div>
          <div className="flex-1" />

          {/* View selector — PR #40 adds Schedule leftmost (5 segments). */}
          <div
            className="inline-flex shrink-0 rounded-md border bg-muted p-0.5"
            data-testid="view-selector"
          >
            {(["schedule", "day", "3day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={
                  "px-2 h-7 text-xs rounded-sm transition-colors whitespace-nowrap " +
                  (view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground")
                }
                data-testid={`button-view-${v}`}
              >
                {v === "3day"
                  ? "3 Days"
                  : v === "schedule"
                  ? "Schedule"
                  : v[0].toUpperCase() + v.slice(1)}
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

      {/* Body — wrapped in the swipe-nav container so all four grid views
          share the gesture. Swipe is horizontal-only and won't fire when
          a modal or overlay is open. Schedule view is a scroll-driven
          list and ignores swipe-nav. */}
      <div {...(view === "schedule" ? {} : swipeHandlers)} data-testid="agenda-body">
        {view === "schedule" && (
          <AgendaScheduleView
            date={date}
            onSelect={openView}
            todayScrollKey={todayScrollKey}
            onVisibleDateChange={handleScheduleVisibleDateChange}
          />
        )}
        {view === "day" && (
          <AgendaDayView
            date={date}
            onSelect={openView}
            todayScrollKey={todayScrollKey}
          />
        )}
        {view === "3day" && (
          <AgendaThreeDayView
            date={date}
            onSelect={openView}
            todayScrollKey={todayScrollKey}
          />
        )}
        {view === "week" && (
          <AgendaWeekView
            date={date}
            onSelect={openView}
            todayScrollKey={todayScrollKey}
          />
        )}
        {view === "month" && <AgendaMonthView date={date} onDayTap={openOverlay} onSelect={openView} />}
      </div>

      {/* PR #31 — AgendaTaskModal removed from agenda. Create/edit now
          live at /agenda/tasks/new and /agenda/tasks/:id/edit (page mode). */}

      {/* View-first sheet (PR #13). Pencil inside this sheet routes back
          through openEdit, which now navigates to the edit page. */}
      <AgendaTaskViewModal
        open={viewOpen}
        onOpenChange={handleViewOpenChange}
        item={viewOpen ? viewing : null}
        onEdit={openEdit}
        onNavigateAway={urlPopPopupThen}
      />

      {/* PR #53: External calendar events show read-only sheet */}
      <ExternalEventDetailSheet
        item={externalEvent}
        onClose={() => setExternalEvent(null)}
      />

      <AgendaMonthDayOverlay
        open={overlayOpen}
        onOpenChange={handleOverlayOpenChange}
        date={overlayDate}
        onSelect={openView}
      />
    </div>
  );
}
