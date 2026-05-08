// =============================================================================
// AgendaPage — Phase 3a (§22, §22a, §23)
// =============================================================================
// Phase 3a ships the Day view only. 3 Days / Week / Month land in Phase 3b,
// but the view selector renders all four buttons today so the locked §22
// chrome appears correct from the start; non-Day buttons show a "coming
// soon" placeholder.
//
// Header layout (locked §22):
//   Row 1: [Agenda title]   [Today]   [+ Task]
//   Row 2: [<] [date label] [>]                              [view selector]
//
// Default view is read once on mount from /api/agenda-default-view (so the
// user's preference survives reloads), and PATCHed back when they change it.
// =============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { addDays, formatDateContextLabel, toIsoDate } from "@/lib/agenda-utils";
import { AgendaDayView } from "@/components/agenda-day-view";
import {
  AgendaTaskModal,
  type AgendaWindowItem,
} from "@/components/agenda-task-modal";

type AgendaView = "day" | "3day" | "week" | "month";

export default function AgendaPage() {
  const [date, setDate] = useState<string>(() => toIsoDate(new Date()));
  const [view, setView] = useState<AgendaView>("day");

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaWindowItem | null>(null);

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

  function goPrev() {
    setDate((d) => addDays(d, -1));
  }
  function goNext() {
    setDate((d) => addDays(d, 1));
  }
  function goToday() {
    setDate(toIsoDate(new Date()));
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(item: AgendaWindowItem) {
    setEditing(item);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — locked §22 chrome. */}
      <div className="border-b px-4 py-3 space-y-2 bg-background">
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
            className="text-sm font-medium tabular-nums min-w-[140px] text-center"
            data-testid="text-date-context"
          >
            {formatDateContextLabel(date)}
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
            className="inline-flex rounded-md border bg-muted p-0.5"
            data-testid="view-selector"
          >
            {(["day", "3day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={
                  "px-2.5 h-7 text-xs rounded-sm transition-colors " +
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
      </div>

      {/* Body */}
      {view === "day" ? (
        <AgendaDayView date={date} onSelect={openEdit} />
      ) : (
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <p className="text-sm font-medium">
                {view === "3day" ? "3 Days" : view[0].toUpperCase() + view.slice(1)} view
              </p>
              <p className="text-xs text-muted-foreground">
                Arriving in Phase 3b. Day view is fully wired in the meantime.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <AgendaTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultDate={date}
        editing={editing}
      />
    </div>
  );
}
