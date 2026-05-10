// PR #29c — Do It Later page (Phase 8 inbox processing).
//
// Locked source: workspace/pr29c-do-it-later-hybrid-ascii.md and
// workspace/inbox-processing-plan.md.
//
// Q1 (locked 2026-05-10): Inherit the full AgendaTaskModal — recurrence,
// custom recurrence dialog, color, duration, all-day. The shared
// <AgendaTaskModal displayMode="page" ...> renders the same form body the
// Agenda surface uses, plus a page-mode-only Role + Responsibility +
// [+ Add support details] block between Color and Notes per the locked
// hybrid ASCII.
//
// Q2 (locked 2026-05-10): Support pivot tables don't exist yet — the
// [+ Add support details] button stubs to a toast. The actual pivots ship
// in PR 29d.
//
// Server contract (PR #29c, widened doItLaterPayloadSchema in PR #29c):
//   POST /api/inbox/:id/process { action: "do_it_later",
//                                  payload: { title, startDate, isAllDay,
//                                             endDate?, time?, durationMinutes?,
//                                             color?, recurrenceRule?,
//                                             recurrenceEndDate?, roleId?,
//                                             responsibilityId?, notes? } }
// Server enforces: recurrenceRule requires recurrenceEndDate, and
// isAllDay + endDate < startDate → 400.
import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AgendaTaskModal } from "@/components/agenda-task-modal";
import type { InboxItem } from "@shared/schema";

export default function InboxDoItLaterPage() {
  const [, params] = useRoute<{ id?: string }>("/inbox/process/:id/do-it-later");
  const [, navigate] = useLocation();

  const itemId = Number(params?.id);
  const validId = Number.isFinite(itemId) && itemId > 0;

  const { data: inboxItem, isLoading, error } = useQuery<InboxItem>({
    queryKey: [`/api/inbox/${itemId}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/inbox/${itemId}`);
      return r.json();
    },
    enabled: validId,
  });

  // Title for the document (the modal also renders its own header).
  useEffect(() => {
    document.title = "Do It Later — UnPuzzle";
  }, []);

  if (!validId) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-do-it-later-invalid">
        <p className="text-sm text-destructive">Invalid inbox item.</p>
        <Button variant="ghost" onClick={() => navigate("/inbox")}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-md mx-auto" data-testid="page-do-it-later-loading">
        <p className="text-sm text-muted-foreground">Loading item…</p>
      </div>
    );
  }

  if (error || !inboxItem) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-do-it-later-error">
        <p className="text-sm text-destructive">Couldn't load inbox item.</p>
        <Button variant="ghost" onClick={() => navigate("/inbox")}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  // Already-processed guard — same pattern as File It page.
  if (inboxItem.processed) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-do-it-later-already-processed">
        <p className="text-sm text-muted-foreground">
          This item has already been processed.
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/inbox")}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  // Default the task date to today (YYYY-MM-DD in local time).
  const today = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  return (
    <AgendaTaskModal
      // Required Dialog API surface. In page mode the `open`/`onOpenChange`
      // pair is only consulted by the shared close handlers — the actual
      // rendering uses the page wrapper, not the <Dialog>.
      open
      onOpenChange={(o) => {
        if (!o) navigate("/inbox");
      }}
      // Page-mode props (PR #29c).
      displayMode="page"
      inboxItemId={itemId}
      defaultTitle={inboxItem.content ?? ""}
      defaultDate={today}
      onSaved={() => navigate("/inbox")}
      onCancel={() => navigate("/inbox")}
    />
  );
}
