// PR #31 — /agenda/tasks/:id/edit — page-mode edit route for an agenda
// task.
//
// Replaces the dialog-mode edit that used to live in agenda.tsx
// (setEditing(item); setModalOpen(true)). The view-first sheet's
// pencil button (AgendaTaskViewModal) now navigates here.
//
// URL params:
//   :id                     — agenda_tasks.id of the row being edited
//   ?master=N               — present only when editing a VIRTUAL
//                              occurrence of a recurring series. The id
//                              and master differ because virtual rows
//                              are generated on the fly and reuse the
//                              master's id as a stable handle; the URL
//                              also needs the originalDate (?occurrence=)
//                              so the right instance is targeted.
//   ?occurrence=YYYY-MM-DD  — startDate of the specific occurrence
//                              being edited (overrides the fetched
//                              row's startDate so the form opens on the
//                              tapped instance, not the master's).
//
// Data flow:
//   GET /api/agenda-tasks/:id  → AgendaTask
//   Overlay isVirtual / masterId / startDate when ?master= is present
//   Pass as `editing` into AgendaTaskModal in page mode
//   AgendaTaskModal's existing saveMutation / deleteMutation paths fire
//   (with scope dialog for recurring rows) — same code path the dialog
//   used to use, no server contract change.

import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  AgendaTaskModal,
  type AgendaWindowItem,
} from "@/components/agenda-task-modal";
import type { AgendaTask } from "@shared/schema";

function readVirtualHints(): {
  masterId: number | null;
  occurrence: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const masterRaw = params.get("master");
  const masterId = masterRaw && /^\d+$/.test(masterRaw) ? Number(masterRaw) : null;
  const occRaw = params.get("occurrence");
  const occurrence =
    occRaw && /^\d{4}-\d{2}-\d{2}$/.test(occRaw) ? occRaw : null;
  return { masterId, occurrence };
}

export default function AgendaTaskEditPage() {
  const [, params] = useRoute<{ id?: string }>("/agenda/tasks/:id/edit");
  const [, navigate] = useLocation();

  const taskId = Number(params?.id);
  const validId = Number.isFinite(taskId) && taskId > 0;

  const { data: task, isLoading, error } = useQuery<AgendaTask>({
    queryKey: ["/api/agenda-tasks", taskId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/agenda-tasks/${taskId}`);
      return r.json();
    },
    enabled: validId,
  });

  useEffect(() => {
    document.title = "Edit task — UnPuzzle";
  }, []);

  if (!validId) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-agenda-task-edit-invalid">
        <p className="text-sm text-destructive">Invalid task id.</p>
        <Button variant="ghost" onClick={() => navigate("/agenda")}>
          Back to Agenda
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-md mx-auto" data-testid="page-agenda-task-edit-loading">
        <p className="text-sm text-muted-foreground">Loading task…</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-agenda-task-edit-error">
        <p className="text-sm text-destructive">Couldn&apos;t load task.</p>
        <Button variant="ghost" onClick={() => navigate("/agenda")}>
          Back to Agenda
        </Button>
      </div>
    );
  }

  // Build the editing item. When ?master= is present we're editing a
  // virtual occurrence — set isVirtual and override startDate so the
  // form opens on the tapped instance, exactly like the view-sheet's
  // edit-virtual path did before.
  const { masterId, occurrence } = readVirtualHints();
  const editing: AgendaWindowItem =
    masterId != null
      ? {
          ...task,
          isVirtual: true,
          masterId,
          startDate: occurrence ?? task.startDate,
        }
      : { ...task };

  // Keep editing.id pointing at the FETCHED row (the master in the
  // virtual case). AgendaTaskModal already does the right thing with
  // masterId for scope=this/following/all.

  return (
    <AgendaTaskModal
      open
      onOpenChange={(o) => {
        if (!o) navigate("/agenda");
      }}
      displayMode="page"
      // defaultDate is required by the modal's prop API but isn't read
      // when `editing` is set; pass the row's startDate to be safe.
      defaultDate={editing.startDate}
      editing={editing}
      onSaved={() => navigate("/agenda")}
      onCancel={() => navigate("/agenda")}
    />
  );
}
