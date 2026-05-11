// =============================================================================
// AgendaTaskViewModal — PR #30a (Today card popup, Google parity)
// =============================================================================
// Locked spec source: pr30a-today-card-ascii.md + unpuzzle-pinned-questions.md
// RESOLVED-2 (Today card structure), §8 / §8a / §8b, §10 (Linked supports),
// §22a (tasks do not link to responsibilities).
//
// Behavior summary:
//   * ONE popup per chip tap. Collapsed by default; tapping [View details]
//     EXPANDS the same popup to reveal extra action buttons. There is no
//     separate detail page/route.
//   * Three card variants, keyed off the agenda_tasks.origin field returned
//     by GET /api/agenda-tasks/:id/card:
//       - 'responsibility' — header + "as <role(s)>" subline, supports from
//         the linked responsibility, expanded adds [Open responsibility]
//         + (if any) [Open project] + Linked project block.
//       - 'project'        — header + "to <project>" + "for <responsibility(ies)>"
//         sublines, supports from the project's own §10 Linked supports,
//         expanded adds Next action line + [Open project] + [Open responsibility].
//       - 'standalone'     — header + (optional) "as <role>" subline,
//         supports come back empty ((none)). [Respond] is the only action
//         button and only renders when a warning is present. No [View details].
//   * Status block shows ONE line: the first/highest-priority warning
//     (Q-3 locked); rest live in Support check.
//   * Support check icons read each support record's environment_*.state
//     column directly (per §3). state='unavailable' AND relationshipType=
//     'primary' → ⚠ warning, with workaround line indented underneath if a
//     temporary_workaround record exists in the same support type.
//   * Recurrence line uses Google's verbatim phrasing (Q-E).
//   * ⋯ overflow menu (Q-H): Delete + Duplicate. Delete fires the edit
//     modal's existing delete-with-scope flow (we close THIS popup and
//     immediately open the edit modal in delete-intent mode). Duplicate is
//     stubbed with the standard "Coming in next PR" toast for v1.
//   * [Respond] (Q-I): toast { title: "Coming in next PR", body:
//     "Disruption flow ships next" }.
//
// Data fetch: react-query against /api/agenda-tasks/:id/card. The endpoint
// resolves every join the popup needs in one round-trip; the client does
// no further fetches.
// =============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Pencil, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import {
  formatTimeLabel,
  fromIsoDate,
} from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "./agenda-task-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AgendaWindowItem | null;
  /** Parent dismisses this popup and opens the edit modal on the same row. */
  onEdit: (item: AgendaWindowItem) => void;
};

type CardSupport = {
  type: "people" | "places" | "things" | "providers" | "conditions";
  id: number;
  name: string;
  state: string; // 'available' | 'at_risk' | 'unavailable' | 'archived'
  relationshipType: string; // 'primary' | 'secondary' | 'optional' | 'temporary_workaround'
  importance: string;
};

type CardData =
  | {
      task: AgendaWindowItem;
      kind: "responsibility";
      responsibility: { id: number; name: string } | null;
      roles: string[];
      supports: CardSupport[];
      linkedProject:
        | { id: number; title: string; status: string; nextAction: string | null }
        | null;
    }
  | {
      task: AgendaWindowItem;
      kind: "project";
      project: { id: number; title: string; status: string } | null;
      projectTask: { id: number; title: string } | null;
      responsibilities: Array<{ id: number; name: string }>;
      supports: CardSupport[];
      nextAction: string | null;
    }
  | {
      task: AgendaWindowItem;
      kind: "standalone";
      role: { id: number; name: string } | null;
      supports: CardSupport[];
    };

// ---------------------------------------------------------------------------
// Date / time / recurrence formatters
// ---------------------------------------------------------------------------

/** "Wednesday, May 6". */
function formatLongDate(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build the date / time line shown under the title.
 *   single-day timed   →  "Wednesday, May 6 · 7:15 – 8:00 AM"
 *   single-day all-day →  "Wednesday, May 6"
 *   multi-day all-day  →  "Wednesday, May 6 – Friday, May 8"
 */
function formatWhen(item: AgendaWindowItem): string {
  const startLong = formatLongDate(item.startDate);
  if (item.isAllDay && item.endDate && item.endDate !== item.startDate) {
    return `${startLong} \u2013 ${formatLongDate(item.endDate)}`;
  }
  if (item.isAllDay) return startLong;
  if (item.time) {
    const [hh, mm] = item.time.split(":").map(Number);
    const startMin = hh * 60 + mm;
    const endMin = startMin + (item.durationMinutes ?? 0);
    return `${startLong} \u00b7 ${formatTimeLabel(startMin)} \u2013 ${formatTimeLabel(endMin)}`;
  }
  return startLong;
}

/**
 * Google-verbatim recurrence label (Q-E locked).
 *   FREQ=DAILY                                  → "Repeats daily"
 *   FREQ=WEEKLY;BYDAY=MO,WE,FR                  → "Repeats weekly on Mon, Wed, Fri"
 *   FREQ=WEEKLY (no BYDAY)                      → "Repeats weekly"
 *   FREQ=MONTHLY                                → "Repeats monthly"
 *   FREQ=YEARLY                                 → "Repeats yearly"
 * Anything we can't parse falls back to "Repeats".
 */
function formatRecurrence(rule: string | null | undefined): string | null {
  if (!rule) return null;
  const freqMatch = rule.match(/FREQ=([A-Z]+)/i);
  if (!freqMatch) return "Repeats";
  const freq = freqMatch[1].toUpperCase();
  if (freq === "WEEKLY") {
    const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/i);
    if (byDayMatch) {
      const map: Record<string, string> = {
        MO: "Mon",
        TU: "Tue",
        WE: "Wed",
        TH: "Thu",
        FR: "Fri",
        SA: "Sat",
        SU: "Sun",
      };
      const days = byDayMatch[1]
        .split(",")
        .map((d) => map[d.trim().toUpperCase()])
        .filter(Boolean);
      if (days.length) return `Repeats weekly on ${days.join(", ")}`;
    }
    return "Repeats weekly";
  }
  switch (freq) {
    case "DAILY":
      return "Repeats daily";
    case "MONTHLY":
      return "Repeats monthly";
    case "YEARLY":
      return "Repeats yearly";
    default:
      return "Repeats";
  }
}

// ---------------------------------------------------------------------------
// Status / support derivations
// ---------------------------------------------------------------------------

/**
 * §3b interpretation tightened for PR 30a:
 *   - state='unavailable' + relationshipType='primary'                → warning
 *   - state='at_risk' on any relationship type                        → note
 *   - everything else                                                 → ready
 * Per Q-3 the Status block shows the first/highest-priority warning only;
 * the order returned by the server (people, places, things, providers,
 * conditions) is treated as the priority order.
 *
 * For each broken-primary support we also look for a temporary_workaround
 * record in the same support type (people/places/...). If one exists AND
 * its own state is 'available', we render the indented workaround line
 * underneath the broken row.
 */
type SupportRow =
  | { kind: "ok"; support: CardSupport }
  | { kind: "note"; support: CardSupport }
  | { kind: "warn"; support: CardSupport; workaround: CardSupport | null };

function deriveSupportRows(supports: CardSupport[]): SupportRow[] {
  const workaroundsByType = new Map<string, CardSupport[]>();
  for (const s of supports) {
    if (s.relationshipType === "temporary_workaround") {
      const list = workaroundsByType.get(s.type) ?? [];
      list.push(s);
      workaroundsByType.set(s.type, list);
    }
  }
  const rows: SupportRow[] = [];
  for (const s of supports) {
    if (s.relationshipType === "temporary_workaround") {
      // Workarounds are rendered indented under the broken record they
      // cover; they do not get their own top-level row.
      continue;
    }
    if (s.state === "unavailable" && s.relationshipType === "primary") {
      const wa =
        (workaroundsByType.get(s.type) ?? []).find((w) => w.state === "available") ?? null;
      rows.push({ kind: "warn", support: s, workaround: wa });
    } else if (s.state === "at_risk") {
      rows.push({ kind: "note", support: s });
    } else {
      rows.push({ kind: "ok", support: s });
    }
  }
  return rows;
}

/**
 * Map relationship_type → label shown on the right side of each support row
 * (Q-K: uniformly across all three card variants).
 */
function relationshipLabel(rel: string): string {
  switch (rel) {
    case "primary":
      return "Critical";
    case "secondary":
      return "Important";
    case "optional":
      return "Helpful";
    case "temporary_workaround":
      return "Workaround";
    default:
      return "";
  }
}

/**
 * First/highest-priority warning for the Status block (Q-3 locked).
 * Returns the line text (e.g. "Car unavailable") or null when none.
 */
function firstStatusLine(rows: SupportRow[]): { kind: "warn" | "note"; text: string } | null {
  for (const r of rows) {
    if (r.kind === "warn") {
      return { kind: "warn", text: `${r.support.name} unavailable` };
    }
  }
  for (const r of rows) {
    if (r.kind === "note") {
      return { kind: "note", text: `${r.support.name} at risk` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgendaTaskViewModal({
  open,
  onOpenChange,
  item,
  onEdit,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Reset expansion every time the popup closes so the NEXT open starts
  // collapsed (Google parity — every chip tap starts fresh).
  function handleOpenChange(next: boolean) {
    if (!next) setExpanded(false);
    onOpenChange(next);
  }

  // Fetch the joined card data. Enabled only while the popup is open AND a
  // row is selected. We pass the master id for virtual instances so the
  // join data reflects the source row (overrides not yet wired).
  const cardId = item?.isVirtual ? item.masterId ?? item.id : item?.id;
  const cardQuery = useQuery<CardData>({
    queryKey: ["/api/agenda-tasks", cardId, "card"],
    queryFn: async () => {
      const r = await fetch(`/api/agenda-tasks/${cardId}/card`, { credentials: "include" });
      if (!r.ok) throw new Error(`card fetch failed: ${r.status}`);
      return r.json();
    },
    enabled: open && cardId != null,
  });

  if (!item) return null;

  const swatchHex = item.color || DEFAULT_AGENDA_COLOR_HEX;
  const titleText = item.title?.trim() || "(untitled)";
  const whenLine = formatWhen(item);
  const recurrenceLine = formatRecurrence(item.recurrenceRule);

  // While the join is in flight we still render the popup skeleton so the
  // user never sees a flash of empty page. Once it loads we swap in
  // supports + sublines + action buttons keyed off card.kind.
  const card = cardQuery.data ?? null;
  const supports: CardSupport[] = card
    ? card.kind === "responsibility" || card.kind === "project" || card.kind === "standalone"
      ? card.supports
      : []
    : [];
  const supportRows = deriveSupportRows(supports);
  const status = firstStatusLine(supportRows);
  const hasWarning = status?.kind === "warn";

  // -------------------------------------------------------------------
  // Sublines per card kind.
  // -------------------------------------------------------------------
  function renderSublines(): React.ReactNode {
    if (!card) return null;
    if (card.kind === "responsibility") {
      if (!card.roles.length) return null;
      return (
        <div className="text-sm text-muted-foreground" data-testid="text-view-subline-role">
          as {card.roles.join(", ")}
        </div>
      );
    }
    if (card.kind === "project") {
      const proj = card.project?.title ?? "(missing project)";
      // Q-J: collapsed subline shows first responsibility + " +N more".
      // Expanded view still uses the same text; the chip-row picker for
      // the [Open responsibility] action is what fans out below.
      const respLine =
        card.responsibilities.length === 0
          ? null
          : card.responsibilities.length === 1
          ? card.responsibilities[0].name
          : `${card.responsibilities[0].name} +${card.responsibilities.length - 1} more`;
      return (
        <>
          <div className="text-sm text-muted-foreground" data-testid="text-view-subline-project">
            to {proj}
          </div>
          {respLine && (
            <div className="text-sm text-muted-foreground" data-testid="text-view-subline-resp">
              for {respLine}
            </div>
          )}
        </>
      );
    }
    // standalone — only render when a role is set (cards 6 vs 8 in ASCII).
    if (!card.role) return null;
    return (
      <div className="text-sm text-muted-foreground" data-testid="text-view-subline-role">
        as {card.role.name}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Action handlers.
  // -------------------------------------------------------------------
  function handleEdit() {
    if (!item) return;
    onOpenChange(false);
    onEdit(item);
  }

  function handleRespond() {
    toast({
      title: "Coming in next PR",
      description: "Disruption flow ships next.",
    });
  }

  function handleDelete() {
    // Reuse the edit modal's existing delete-with-scope flow rather than
    // duplicating it here. We close THIS popup; the user lands on the edit
    // modal where the Delete button (and its scope dialog for recurring
    // rows) lives. (PR 15 already locked that surface.)
    if (!item) return;
    onOpenChange(false);
    onEdit(item);
  }

  function handleDuplicate() {
    toast({
      title: "Coming in next PR",
      description: "Duplicate ships in a follow-up PR.",
    });
  }

  function handleOpenResponsibility(id: number) {
    onOpenChange(false);
    navigate(`/responsibilities/${id}`);
  }

  function handleOpenProject(id: number) {
    onOpenChange(false);
    navigate(`/projects/${id}`);
  }

  // Whether the [View details] / [Hide details] toggle should render at
  // all. Standalone cards never show it (no project/responsibility to
  // navigate to).
  const showViewDetails = card?.kind === "responsibility" || card?.kind === "project";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          data-testid="agenda-view-modal"
          className={cn(
            "fixed z-50 bg-background border shadow-lg",
            "left-0 right-0 bottom-0 h-[85vh]",
            "rounded-t-2xl",
            "sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:right-auto",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md sm:h-auto sm:max-h-[85vh]",
            "sm:rounded-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
            "duration-200",
            "flex flex-col",
          )}
        >
          {/* Top bar: ✕ (left) · ✎ · ⋯ (right) */}
          <div className="flex items-center justify-between p-2 shrink-0">
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                data-testid="button-view-close"
                className="h-9 w-9"
              >
                <X className="w-5 h-5" />
              </Button>
            </DialogPrimitive.Close>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleEdit}
                aria-label="Edit"
                data-testid="button-view-edit"
                className="h-9 w-9"
              >
                <Pencil className="w-5 h-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="More options"
                    data-testid="button-view-overflow"
                    className="h-9 w-9"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={handleDelete} data-testid="button-view-delete">
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDuplicate} data-testid="button-view-duplicate">
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 pb-6 flex-1 overflow-y-auto">
            {/* Title row: color swatch + bold title (Q-B locked) */}
            <div className="flex items-start gap-3 mb-1">
              <div
                className="w-5 h-5 rounded-sm shrink-0 mt-2"
                style={{ backgroundColor: swatchHex }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title
                  className="text-2xl font-semibold leading-tight break-words"
                  data-testid="text-view-title"
                >
                  {titleText}
                </DialogPrimitive.Title>
                <div className="mt-1 space-y-0.5">{renderSublines()}</div>
              </div>
            </div>

            {/* Date / time + recurrence */}
            <div className="ml-8 mt-3">
              <div className="text-sm text-foreground" data-testid="text-view-when">
                {whenLine}
              </div>
              {recurrenceLine && (
                <div
                  className="text-sm text-muted-foreground mt-0.5"
                  data-testid="text-view-recurrence"
                >
                  {recurrenceLine}
                </div>
              )}
            </div>

            {/* Status block (Q-A: labeled, separate from Support check) */}
            <div className="ml-8 mt-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </div>
              <div className="mt-1 text-sm" data-testid="text-view-status">
                {status === null ? (
                  <span className="text-foreground">{"\u2713"} Ready</span>
                ) : status.kind === "warn" ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    {"\u26a0"} {status.text}
                  </span>
                ) : (
                  <span className="text-foreground">
                    {"\u2022"} Note: {status.text}
                  </span>
                )}
              </div>
            </div>

            {/* Support check block (Q-A: labeled, separate; Q-D: "(none)" when empty) */}
            <div className="ml-8 mt-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Support check
              </div>
              <div className="mt-1 text-sm space-y-1" data-testid="list-view-supports">
                {cardQuery.isLoading ? (
                  <div className="text-muted-foreground">Loading…</div>
                ) : supportRows.length === 0 ? (
                  <div className="text-muted-foreground">(none)</div>
                ) : (
                  supportRows.map((row) => {
                    const label = relationshipLabel(row.support.relationshipType);
                    const icon =
                      row.kind === "warn"
                        ? "\u26a0"
                        : row.kind === "note"
                        ? "\u2022"
                        : "\u2713";
                    const iconClass =
                      row.kind === "warn"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-foreground";
                    const labelText =
                      row.kind === "warn"
                        ? `${row.support.name} unavailable`
                        : row.kind === "note"
                        ? `${row.support.name} at risk`
                        : row.support.name;
                    return (
                      <div key={`${row.support.type}-${row.support.id}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className={iconClass}>
                            {icon} {labelText}
                          </span>
                          {label && (
                            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                          )}
                        </div>
                        {row.kind === "warn" && row.workaround && (
                          <div className="flex items-center justify-between gap-3 pl-5">
                            <span className="text-foreground">
                              {"\u2514\u2500 \u2713 "}
                              {row.workaround.name} available as workaround
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {relationshipLabel(row.workaround.relationshipType)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Expanded extras (kind-specific) */}
            {expanded && card?.kind === "responsibility" && card.linkedProject && (
              <div className="ml-8 mt-5" data-testid="block-view-linked-project">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Linked project
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {card.linkedProject.title}
                  <span className="text-muted-foreground">
                    {" \u00b7 "}
                    {card.linkedProject.status}
                  </span>
                </div>
                {card.linkedProject.nextAction && (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    Next action: {card.linkedProject.nextAction}
                  </div>
                )}
              </div>
            )}

            {expanded && card?.kind === "project" && card.nextAction && (
              <div className="ml-8 mt-5" data-testid="block-view-next-action">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Next action
                </div>
                <div className="mt-1 text-sm text-foreground">{card.nextAction}</div>
              </div>
            )}

            {/* Expanded picker — when a project links to multiple responsibilities,
                [Open responsibility] becomes a chip-row of names. Single-link
                projects render the regular button below in the action row. */}
            {expanded &&
              card?.kind === "project" &&
              card.responsibilities.length > 1 && (
                <div className="ml-8 mt-5" data-testid="block-view-resp-picker">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Open responsibility
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {card.responsibilities.map((r) => (
                      <Button
                        key={r.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenResponsibility(r.id)}
                        data-testid={`button-view-open-resp-${r.id}`}
                      >
                        {r.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

            {/* Action buttons row. The exact buttons depend on:
                  - card.kind
                  - expanded vs collapsed
                  - hasWarning (drives Respond visibility) */}
            <div className="ml-8 mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {/* Collapsed responsibility / project: [View details] */}
                {!expanded && showViewDetails && (
                  <Button
                    variant="outline"
                    onClick={() => setExpanded(true)}
                    data-testid="button-view-details"
                  >
                    View details
                  </Button>
                )}

                {/* Expanded responsibility: [Open responsibility] + (maybe) [Open project] */}
                {expanded && card?.kind === "responsibility" && card.responsibility && (
                  <Button
                    variant="outline"
                    onClick={() => handleOpenResponsibility(card.responsibility!.id)}
                    data-testid="button-view-open-resp"
                  >
                    Open responsibility
                  </Button>
                )}
                {expanded &&
                  card?.kind === "responsibility" &&
                  card.linkedProject && (
                    <Button
                      variant="outline"
                      onClick={() => handleOpenProject(card.linkedProject!.id)}
                      data-testid="button-view-open-project"
                    >
                      Open project
                    </Button>
                  )}

                {/* Expanded project: [Open project] + (single-link only) [Open responsibility] */}
                {expanded && card?.kind === "project" && card.project && (
                  <Button
                    variant="outline"
                    onClick={() => handleOpenProject(card.project!.id)}
                    data-testid="button-view-open-project"
                  >
                    Open project
                  </Button>
                )}
                {expanded &&
                  card?.kind === "project" &&
                  card.responsibilities.length === 1 && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleOpenResponsibility(card.responsibilities[0].id)
                      }
                      data-testid="button-view-open-resp"
                    >
                      Open responsibility
                    </Button>
                  )}

                {/* Expanded: [Hide details] toggle */}
                {expanded && showViewDetails && (
                  <Button
                    variant="ghost"
                    onClick={() => setExpanded(false)}
                    data-testid="button-view-hide-details"
                  >
                    Hide details
                  </Button>
                )}
              </div>

              {/* Respond — always right-aligned; renders only when a warning
                  is present, regardless of card kind / expanded state. */}
              {hasWarning && (
                <Button
                  variant="default"
                  onClick={handleRespond}
                  data-testid="button-view-respond"
                >
                  Respond
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
