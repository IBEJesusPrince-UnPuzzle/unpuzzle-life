// PR #31 — /agenda/tasks/new — page-mode create route for an agenda task.
//
// Replaces the dialog-mode create that used to live in agenda.tsx
// (setEditing(null); setModalOpen(true)). Now the [+ Task] button on
// the agenda header and the [+ More] popover's "Add task" navigate
// here instead.
//
// URL params (read from window.location.search via a tiny helper):
//   ?date=YYYY-MM-DD        — pre-fills the form's Date field
//                              (defaults to today if missing/invalid)
//   ?time=HH:MM             — optional, pre-fills Start time (only used
//                              when not all-day; AgendaTaskModal already
//                              owns the default-09:00 fallback otherwise)
//
// Server contract is unchanged: AgendaTaskModal.saveMutation hits
// POST /api/agenda-tasks with origin='standalone' (see PR #15 / #14
// / #29c — same code path the dialog used).
//
// On save → navigate back to /agenda. On cancel → same.

import { useEffect } from "react";
import { useLocation } from "wouter";
import { AgendaTaskModal } from "@/components/agenda-task-modal";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readQuery(): { date: string; time: string | null } {
  // Hash router puts query params before the hash (?foo=bar#/route),
  // matching the pattern used by use-agenda-url-state.ts.
  const params = new URLSearchParams(window.location.search);
  const dateRaw = params.get("date");
  const date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayIso();
  const timeRaw = params.get("time");
  const time = timeRaw && /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : null;
  return { date, time };
}

export default function AgendaTaskNewPage() {
  const [, navigate] = useLocation();
  const { date /* , time */ } = readQuery();

  useEffect(() => {
    document.title = "New task — UnPuzzle";
  }, []);

  // NOTE: AgendaTaskModal doesn't currently accept a defaultTime prop in
  // create mode (its existing dialog never needed one). Keeping the
  // ?time= query parsed so the wiring is in place; threading it through
  // the modal's create-mode default belongs in a tiny follow-up if the
  // time-slot tap behavior is wanted. For PR #31 the parity goal is the
  // [+ Task] button replacement, which doesn't carry a time hint.

  return (
    <AgendaTaskModal
      open
      onOpenChange={(o) => {
        if (!o) navigate("/agenda");
      }}
      displayMode="page"
      defaultDate={date}
      onSaved={() => navigate("/agenda")}
      onCancel={() => navigate("/agenda")}
    />
  );
}
