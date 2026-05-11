// =============================================================================
// AgendaTaskModal — Phase 3a (§22a) + PR #29c (hybrid page mode)
// =============================================================================
// One modal handles three flows:
//
//   1. CREATE (standalone)     — opened by the Agenda + Task button.
//                                 POST /api/agenda-tasks with origin="standalone"
//                                 and the user-typed title.
//
//   2. EDIT (real row)         — opened by tapping a real (non-virtual)
//                                 agenda card. PATCH /api/agenda-tasks/:id.
//
//   3. EDIT (virtual instance) — opened by tapping a virtual recurring
//                                 instance. We do NOT mutate the master row;
//                                 instead we POST a brand-new row that carries
//                                 seriesId + originalDate + isOverride=1, which
//                                 the §22a window-merge will use to replace
//                                 that single occurrence (Phase 2 logic).
//
// PR #29c (Phase 8 Inbox processing) — same component now ALSO renders as a
// full page (displayMode="page") for the Do It Later inbox flow. In page mode:
//   * The <Dialog> chrome is omitted; the page wrapper supplies its own.
//   * Below Color, we render Role + Responsibility dropdowns and a stubbed
//     [+ Add support details] toggle (locked hybrid ASCII; the actual
//     support pivots ship in a follow-up PR).
//   * Save posts to /api/inbox/:id/process action=do_it_later instead of
//     /api/agenda-tasks, then navigates back to /inbox via onSaved.
//   * Edit / delete / scope dialog paths are unreachable in page mode (Do
//     It Later always creates a new row from an inbox item).
//
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GripVertical, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { CustomRecurrenceDialog } from "@/components/custom-recurrence-dialog";
import { useDraggableReorder } from "@/hooks/use-draggable-reorder";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RecurrenceScopeDialog,
  type RecurrenceScope,
} from "@/components/recurrence-scope-dialog";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import {
  addDaysIso,
  buildDropdownOptions,
  describeCustomRule,
  oneYearOut,
  optionToRule,
  ruleToOption,
  type StandardOption,
} from "@/lib/recurrence-form";
import type { AgendaTask, Project, ProjectTask } from "@shared/schema";

// =============================================================================
// PR 29e — Add to project collapsible (folded from inbox-add-to-project page).
//
// Sentinel id used in the preview list to mark the not-yet-created task. We
// pick a number that can never collide with a real ProjectTask.id (those
// start at 1 and are positive). useDraggableReorder is generic over
// DraggableItem which only requires { id: number }, so this works.
// =============================================================================
const NEW_TASK_ID = -1;

interface ProjectPreviewRow {
  id: number; // real ProjectTask.id, or NEW_TASK_ID
  title: string;
  isNew: boolean;
}

function sortExistingProjectTasks(rows: ProjectTask[]): ProjectTask[] {
  return [...rows].sort((a, b) => {
    const aHas = typeof a.sortOrder === "number";
    const bHas = typeof b.sortOrder === "number";
    if (aHas && bHas) {
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    } else if (aHas) {
      return -1;
    } else if (bHas) {
      return 1;
    }
    return a.id - b.id;
  });
}

// =============================================================================
// PR 29d — Google date/time parity helpers.
//
// The UI now thinks in (startDate, startTime, endDate, endTime). The DB still
// stores (startDate, time, durationMinutes, endDate). These helpers translate
// between the two layers without touching the schema.
//
// - timeToMinutes("HH:MM")           → minutes since midnight (0–1439)
// - minutesToTime(n)                  → "HH:MM" (n mod 1440)
// - addMinutesToDateTime(date,t,m)    → { date, time } after adding m minutes,
//                                        rolling date forward as needed
// - computeDurationMinutes(sd,st,ed,et) → minutes between two datetimes (≥0)
// =============================================================================

function timeToMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutesToDateTime(
  startDate: string,
  startTime: string,
  minutesToAdd: number,
): { date: string; time: string } {
  const startMin = timeToMinutes(startTime);
  const total = startMin + minutesToAdd;
  const dayShift = Math.floor(total / 1440);
  const newTime = minutesToTime(total);
  const newDate = dayShift === 0 ? startDate : addDaysIso(startDate, dayShift);
  return { date: newDate, time: newTime };
}

function computeDurationMinutes(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number {
  // Date difference in days * 1440 + (endTime - startTime). Returns >= 0.
  const startBase = new Date(startDate + "T00:00:00").getTime();
  const endBase = new Date(endDate + "T00:00:00").getTime();
  const dayDiff = Math.round((endBase - startBase) / 86400000);
  const min = dayDiff * 1440 + (timeToMinutes(endTime) - timeToMinutes(startTime));
  return Math.max(0, min);
}

// The window endpoint enriches AgendaTask with these virtual-instance fields.
export type AgendaWindowItem = AgendaTask & {
  isVirtual?: boolean;
  masterId?: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-fill the create form with this date (Day view's current day).
  defaultDate: string; // YYYY-MM-DD
  // When set, modal is in edit mode. Otherwise it's create mode.
  editing?: AgendaWindowItem | null;
  // PR #29c (Phase 8 Inbox processing) — when "page", omit the Dialog chrome
  // and render inline so the inbox Do It Later page can host this component.
  // Default "dialog" preserves the existing Agenda + Task behavior verbatim.
  displayMode?: "dialog" | "page";
  // PR #29c — page-mode props. Used only when displayMode === "page".
  inboxItemId?: number;
  // Seed the title from the inbox row's content. (Could derive in the page
  // wrapper, but passing it here keeps state ownership in the form.)
  defaultTitle?: string;
  // PR #29e — when the inbox item was captured with a project hint
  // (inbox_items.reference_project_id), pass it here so the [+ Add to
  // project] collapsible auto-expands and prefills the project picker
  // (Q5-C locked). Page-mode only; ignored in dialog mode.
  referenceProjectId?: number | null;
  // Called after a successful Save in page mode so the page can navigate
  // back to /inbox and invalidate the inbox list cache.
  onSaved?: () => void;
  // Called when the user clicks Cancel in page mode.
  onCancel?: () => void;
};

// PR #19 — duration helpers were extracted to client/src/lib/duration.ts so
// the responsibility-edit Schedule card can reuse the same rules without
// reaching into a sibling component. Behavior unchanged.

export function AgendaTaskModal({
  open,
  onOpenChange,
  defaultDate,
  editing,
  displayMode = "dialog",
  inboxItemId,
  defaultTitle,
  referenceProjectId,
  onSaved,
  onCancel,
}: Props) {
  const isPageMode = displayMode === "page";
  const { toast } = useToast();
  // PR #20 — wouter setLocation for redirecting to /responsibilities/:id/edit
  // after a successful convert-to-responsibility.
  const [, setLocation] = useLocation();

  // Mode resolution. Virtual rows have isVirtual=true and a non-null masterId.
  const mode: "create" | "edit-real" | "edit-virtual" = useMemo(() => {
    if (!editing) return "create";
    if (editing.isVirtual) return "edit-virtual";
    return "edit-real";
  }, [editing]);

  // Form state.
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  // PR 29d — endDate is ALWAYS set (Google parity). Defaults to == date
  // (single-day). Phase 3c's "empty means single-day" shorthand removed.
  const [endDate, setEndDate] = useState(defaultDate);
  const [isAllDay, setIsAllDay] = useState(false);
  const [time, setTime] = useState("09:00");
  // PR 29d — endTime is the new source of truth for the UI. durationMinutes
  // remains the DB column; we compute it from (start, end) on save and
  // compute endTime from (start, durationMinutes) on load. Default new
  // event = start + 60 min (Q2-B).
  const [endTime, setEndTime] = useState("10:00");
  const [color, setColor] = useState(DEFAULT_AGENDA_COLOR_HEX);
  const [notes, setNotes] = useState("");

  // PR #14 — recurrence (§8 prologue b + §22a)
  // recurrenceOption drives the dropdown; customRuleSnapshot holds the
  // verbatim rule string when we open an existing row whose RRULE doesn't
  // match any of the 6 standard options (the dropdown then renders a
  // synthetic "customExisting" item that's read-only until PR #14b ships
  // the Custom dialog). recurrenceEndDate is REQUIRED whenever option != none.
  const [recurrenceOption, setRecurrenceOption] = useState<StandardOption>("none");
  const [customRuleSnapshot, setCustomRuleSnapshot] = useState<string | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  // §22a 1-year cap prompt state. pendingEndDate holds the user's typed
  // value while the AlertDialog is open. (Retained from PR #14 for any
  // future inline pickers; the Custom dialog ships its own cap prompt.)
  const [showCapPrompt, setShowCapPrompt] = useState(false);
  const [pendingEndDate, setPendingEndDate] = useState("");

  // PR #14b — Custom recurrence dialog state.
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  // PR #15 — Scope dialog state for recurring-instance Save/Delete.
  // When the user clicks Save or Delete on a recurring row, we intercept
  // the mutation, open the scope dialog, and only fire the actual mutation
  // after the user picks This / Following / All.
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeIntent, setScopeIntent] = useState<"save" | "delete">("save");

  // PR #29c — page-mode-only state: role + responsibility pickers, support
  // toggle. roleId/responsibilityId default to null so existing dialog-mode
  // callers see no behavior change (these fields are simply not rendered in
  // dialog mode and not sent in the dialog-mode mutation payload).
  const [roleId, setRoleId] = useState<number | null>(null);
  const [responsibilityId, setResponsibilityId] = useState<number | null>(null);

  // PR #29e — page-mode-only state for the [+ Add to project] collapsible.
  // Collapsed by default; auto-expands when referenceProjectId is set on the
  // inbox item (Q5-C). orderOverride is the user's dragged order of the
  // preview rows; null means "natural order" (existing tasks sorted, new row
  // at the bottom). The chosen position becomes the sortOrder we'd write to
  // the new project task. Schema wiring is deferred to PR 29f (Q6-A).
  const [addToProjectExpanded, setAddToProjectExpanded] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null);

  // PR #29c — page-mode data fetches for Role / Responsibility pickers.
  // Guarded by isPageMode so dialog-mode (Agenda) never issues these
  // queries. responsibility_roles is the junction the schema uses to link
  // responsibilities to roles; responsibilities have NO direct role_id
  // column, so we client-side filter via the junction.
  const rolesQuery = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/roles"],
    enabled: isPageMode,
  });
  const responsibilitiesQuery = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/responsibilities"],
    enabled: isPageMode,
  });
  const respRolesQuery = useQuery<Array<{ responsibilityId: number; roleId: number }>>({
    queryKey: ["/api/responsibility-roles"],
    enabled: isPageMode,
  });

  // PR #29e — page-mode-only project picker + existing tasks for the
  // selected project. Both gated by isPageMode so dialog mode never fires.
  const projectsQuery = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isPageMode,
  });
  const projectTasksEnabled = isPageMode && projectId !== null;
  const projectTasksQuery = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${projectId ?? 0}`],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/project-tasks?projectId=${projectId}`,
      );
      return r.json();
    },
    enabled: projectTasksEnabled,
  });

  // Responsibilities filtered by the currently-picked Role. Null role => empty.
  const filteredResponsibilities = useMemo(() => {
    if (!isPageMode || roleId == null) return [];
    const allowedIds = new Set(
      (respRolesQuery.data ?? [])
        .filter((rr) => rr.roleId === roleId)
        .map((rr) => rr.responsibilityId),
    );
    return (responsibilitiesQuery.data ?? []).filter((r) => allowedIds.has(r.id));
  }, [isPageMode, roleId, respRolesQuery.data, responsibilitiesQuery.data]);

  // Reset/seed whenever the modal opens or the editing target changes.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title ?? "");
      setDate(editing.startDate);
      // PR 29d — endDate is ALWAYS set in the UI. Default to == startDate
      // (treats legacy null endDate rows as single-day). When the row has a
      // distinct endDate (multi-day all-day), use it.
      const seedEnd =
        editing.endDate && editing.endDate !== editing.startDate
          ? editing.endDate
          : editing.startDate;
      setEndDate(seedEnd);
      setIsAllDay(editing.isAllDay === 1);
      const seedTime = editing.time ?? "09:00";
      setTime(seedTime);
      // PR 29d — compute endTime from (startTime + durationMinutes) so the
      // UI shows what the row actually represents. All-day rows get the
      // baseline 09:00–10:00 stub so toggling all-day off has sensible values.
      const dur = editing.durationMinutes ?? 60;
      if (editing.isAllDay === 1 || dur <= 0) {
        setEndTime("10:00");
      } else {
        const { time: et } = addMinutesToDateTime(
          editing.startDate,
          seedTime,
          dur,
        );
        setEndTime(et);
      }
      setColor(editing.color ?? DEFAULT_AGENDA_COLOR_HEX);
      setNotes(editing.notes ?? "");
      // PR #14 — recurrence seeding.
      const matched = ruleToOption(editing.recurrenceRule ?? null, editing.startDate);
      if (matched === null) {
        // Existing rule doesn't match any standard → hold it in a snapshot
        // and surface a read-only "Custom (…)" dropdown item.
        setRecurrenceOption("customExisting");
        setCustomRuleSnapshot(editing.recurrenceRule ?? null);
      } else {
        setRecurrenceOption(matched);
        setCustomRuleSnapshot(null);
      }
      setRecurrenceEndDate(editing.recurrenceEndDate ?? "");
    } else {
      // PR #29c — in page mode, seed Title from the inbox item's content.
      setTitle(isPageMode ? (defaultTitle ?? "") : "");
      setDate(defaultDate);
      // PR 29d — endDate defaults to == startDate (single-day). endTime
      // defaults to start + 60 min (Q2-B).
      setEndDate(defaultDate);
      setIsAllDay(false);
      setTime("09:00");
      const { time: defaultEnd } = addMinutesToDateTime(defaultDate, "09:00", 60);
      setEndTime(defaultEnd);
      setColor(DEFAULT_AGENDA_COLOR_HEX);
      setNotes("");
      setRecurrenceOption("none");
      setCustomRuleSnapshot(null);
      setRecurrenceEndDate("");
      // PR #29c — reset role/responsibility on each fresh open in page mode.
      setRoleId(null);
      setResponsibilityId(null);
      // PR #29e — reset the Add to project collapsible. The auto-expand
      // effect below re-opens it if referenceProjectId is set.
      setAddToProjectExpanded(false);
      setProjectId(null);
      setOrderOverride(null);
    }
  }, [open, editing, defaultDate, isPageMode, defaultTitle]);

  // PR #29e — Q5-C auto-expand: when the inbox item was captured with a
  // referenceProjectId, open the collapsible on mount and prefill the
  // project picker. Runs once per open / referenceProjectId change.
  useEffect(() => {
    if (!open) return;
    if (!isPageMode) return;
    if (referenceProjectId != null) {
      setAddToProjectExpanded(true);
      setProjectId(referenceProjectId);
    }
  }, [open, isPageMode, referenceProjectId]);

  // Changing project resets the local drag order so the new project's
  // tasks render in their natural order with the new row at the bottom.
  useEffect(() => {
    setOrderOverride(null);
  }, [projectId]);

  // PR #29e — preview rows: sorted existing tasks + new row at the bottom,
  // then apply any local drag override.
  const previewRows: ProjectPreviewRow[] = useMemo(() => {
    const sorted = sortExistingProjectTasks(projectTasksQuery.data ?? []);
    const base: ProjectPreviewRow[] = [
      ...sorted.map((t) => ({ id: t.id, title: t.title, isNew: false })),
      { id: NEW_TASK_ID, title: title.trim() || "(new task)", isNew: true },
    ];
    if (!orderOverride) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    const ordered: ProjectPreviewRow[] = [];
    orderOverride.forEach((id) => {
      const r = byId.get(id);
      if (r) {
        ordered.push(r);
        byId.delete(id);
      }
    });
    base.forEach((r) => {
      if (byId.has(r.id)) ordered.push(r);
    });
    return ordered;
  }, [projectTasksQuery.data, title, orderOverride]);

  // Drag-to-reorder hook. onCommit captures the new id order in local state
  // only; no PATCH fires until Save (and Save in this PR doesn't yet write
  // project linkage — schema wiring deferred to PR 29f per Q6-A).
  const dragHandle = useDraggableReorder<ProjectPreviewRow>({
    items: previewRows,
    onCommit: (next) => setOrderOverride(next),
  });

  // PR #29e — the sortOrder we'd send on Save = index of the new row in
  // the preview. Q9-C (locked): when the user never dragged the new row,
  // orderOverride stays null and the new row is at the bottom, so newRowIndex
  // resolves to end-of-list silently — no warning, no block.
  const newRowIndex = useMemo(() => {
    const idx = previewRows.findIndex((r) => r.id === NEW_TASK_ID);
    return idx >= 0 ? idx : previewRows.length - 1;
  }, [previewRows]);

  // Compute the active RRULE for the current form state.
  //   - none → null
  //   - customExisting → the snapshot we held from the row (untouched)
  //   - any standard option → derived from the start date
  // PR #14 disables the "custom" entry (it shows a toast + reverts), so we
  // never see it in this function.
  function activeRule(): string | null {
    if (recurrenceOption === "none") return null;
    if (recurrenceOption === "customExisting") return customRuleSnapshot;
    return optionToRule(recurrenceOption, date);
  }

  function buildPayload() {
    // PR 29d — derive durationMinutes from (start, end) when not all-day.
    // The DB column is unchanged; the UI is the only thing that thinks in
    // end-time. When all-day, duration is null (Phase 3c semantics).
    const durationMinutes = isAllDay
      ? null
      : computeDurationMinutes(date, time, endDate, endTime);
    // PR 29d — endDate is now ALWAYS present in form state. We send it to
    // the server only when it represents a multi-day span (endDate > date,
    // and all-day). For single-day all-day we send null to match the
    // existing Phase 3c contract (server interprets null as endDate==start).
    // For timed events, durationMinutes already captures the time-of-day
    // delta, so endDate of a same-day timed event is implicit.
    const payloadEndDate =
      isAllDay && endDate && endDate > date ? endDate : null;
    const rule = activeRule();
    return {
      title: title.trim() || null,
      startDate: date,
      endDate: payloadEndDate,
      isAllDay: isAllDay ? 1 : 0,
      time: isAllDay ? null : time,
      durationMinutes,
      color,
      notes: notes.trim() || null,
      // PR #14 — recurrence fields. Send explicit null when option=none
      // so a previously-recurring master can be flipped back to standalone.
      recurrenceRule: rule,
      recurrenceEndDate: rule ? recurrenceEndDate : null,
    };
  }

  // PR #15 — Is the editing target part of a recurring series?
  // Two cases:
  //   - Virtual instance (always recurring; came from rule expansion)
  //   - Real master (real row that itself carries a recurrenceRule)
  // Real overrides (isOverride=1) are NOT treated as recurring for scope
  //   purposes — they're already a single instance, edits/deletes apply
  //   only to themselves. (An override row's seriesId points to the master,
  //   but the override itself has no recurrenceRule.)
  const isRecurring =
    !!editing &&
    (mode === "edit-virtual" ||
      (mode === "edit-real" && !!editing.recurrenceRule && editing.isOverride !== 1));

  // PR #15 — execute Save with a scope. Always invoked through saveMutation.
  // For non-recurring tasks scope is irrelevant and ignored (mode steers).
  // For recurring tasks scope drives one of three branches:
  //   - "this"      → POST override (same as legacy edit-virtual path)
  //   - "following" → PATCH master recurrenceEndDate = occurrence - 1,
  //                   POST new master from occurrence forward with edits
  //   - "all"       → PATCH master with new fields (legacy edit-real path)
  const saveMutation = useMutation({
    mutationFn: async (scope: RecurrenceScope | null) => {
      // Non-recurring: existing behavior verbatim (no scope).
      if (!isRecurring) {
        if (mode === "edit-real" && editing) {
          const r = await apiRequest("PATCH", `/api/agenda-tasks/${editing.id}`, buildPayload());
          return r.json();
        }
        // Create
        const payload = {
          ...buildPayload(),
          origin: "standalone" as const,
        };
        const r = await apiRequest("POST", "/api/agenda-tasks", payload);
        return r.json();
      }

      // Recurring branches — scope is required by the time we get here.
      if (!editing || !scope) return;
      const masterId = editing.masterId ?? editing.id;
      const occurrenceDate = editing.startDate;

      if (scope === "this") {
        // Override creation: a NEW row, seriesId points back to the master,
        // originalDate stamps which instance is being replaced.
        // Overrides themselves never carry recurrence (Google parity:
        // "Only this event" can't change the rule).
        const { recurrenceRule: _r, recurrenceEndDate: _re, ...overrideBase } = buildPayload();
        const payload = {
          ...overrideBase,
          origin: "standalone" as const,
          seriesId: masterId,
          originalDate: occurrenceDate,
          isOverride: 1,
        };
        const r = await apiRequest("POST", "/api/agenda-tasks", payload);
        return r.json();
      }

      if (scope === "all") {
        // PATCH the master directly. If the user is editing a virtual
        // instance, route the patch to the master id, not the virtual id.
        //
        // PR #15 subtlety: when editing a virtual instance, the form's `date`
        // field is seeded from the virtual occurrence (e.g. May 25), NOT the
        // master's start date (May 11). If the user didn't change the date,
        // forwarding it would shift the entire series. So in scope=all on a
        // virtual instance, we strip startDate (and the dependent endDate)
        // from the patch when the user hasn't modified them — detected by
        // comparing current form state to the editing target's seed.
        // Google Calendar disables the date field outright in this scenario;
        // this preserves intent without locking the user out.
        const payload = buildPayload();
        const stripDateFields =
          mode === "edit-virtual" && date === editing.startDate;
        if (stripDateFields) {
          delete (payload as any).startDate;
          delete (payload as any).endDate;
        }
        const r = await apiRequest("PATCH", `/api/agenda-tasks/${masterId}`, payload);
        return r.json();
      }

      // scope === "following"
      // 1. Truncate the original master so it ENDS the day before the
      //    occurrence the user picked. recurrenceEndDate is inclusive on
      //    the server (acts as UNTIL).
      const truncatedEnd = addDaysIso(occurrenceDate, -1);
      await apiRequest("PATCH", `/api/agenda-tasks/${masterId}`, {
        recurrenceEndDate: truncatedEnd,
      });
      // 2. Create a new master from the occurrence date forward with the
      //    edited fields. The new master gets its own seriesId (server
      //    auto-assigns on insert when seriesId is null and a rule is set).
      const payload = {
        ...buildPayload(),
        origin: "standalone" as const,
      };
      const r = await apiRequest("POST", "/api/agenda-tasks", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({
        title: "Could not save",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });

  // PR #29c (Phase 8 Inbox processing) — page-mode Save. Posts to the
  // orchestrator do_it_later action, which creates the agenda_task and
  // marks the inbox item processed atomically. Never reachable from the
  // dialog-mode flow (the Save button dispatches saveMutation in that case).
  // Recurrence + scope dialogs are unreachable here because Do It Later is
  // always a fresh create from an inbox item.
  const inboxSaveMutation = useMutation({
    mutationFn: async () => {
      if (!inboxItemId) throw new Error("Missing inboxItemId");
      // Reuse buildPayload() so recurrence + color + endDate semantics match
      // the Agenda + Task flow exactly. Add the inbox-only fields on top.
      const base = buildPayload();
      const payload = {
        title: (base.title ?? "").trim(),
        startDate: base.startDate,
        isAllDay: base.isAllDay === 1,
        time: base.time,
        durationMinutes: base.durationMinutes,
        endDate: base.endDate,
        color: base.color,
        notes: base.notes,
        recurrenceRule: base.recurrenceRule,
        recurrenceEndDate: base.recurrenceEndDate,
        roleId,
        responsibilityId,
      };
      // PR #29e — TODO(PR 29f): the user can now pick a project + drag the
      // new row's position inside the collapsible [+ Add to project] section
      // (locked Q5-C / Q9-C). Save currently records ONLY the agenda_task
      // row — the project linkage (projectId, sortOrder = newRowIndex) is
      // intentionally NOT sent yet. The schema change to add project_id +
      // sortOrder columns on agenda_tasks plus a UNION in the agenda query
      // ships in PR 29f (Q6-A deferred). When that lands, extend `payload`
      // here with `{ projectId, sortOrder: newRowIndex }` when the section
      // is expanded AND projectId !== null.
      const r = await apiRequest(
        "POST",
        `/api/inbox/${inboxItemId}/process`,
        { action: "do_it_later", payload },
      );
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      // PR #29e TODO(PR 29f): when project linkage is wired, also invalidate
      // `/api/project-tasks?projectId=${projectId}` here.
      if (onSaved) onSaved();
    },
    onError: (e: any) => {
      toast({
        title: "Could not save",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });

  // PR #15 — Delete with scope.
  //   - non-recurring: DELETE the row (legacy)
  //   - this:          POST cancellation override (isCancelled=1)
  //   - following:     PATCH master recurrenceEndDate = occurrence - 1
  //   - all:           DELETE master id
  const deleteMutation = useMutation({
    mutationFn: async (scope: RecurrenceScope | null) => {
      if (!editing) return;

      if (!isRecurring) {
        await apiRequest("DELETE", `/api/agenda-tasks/${editing.id}`, undefined);
        return;
      }

      if (!scope) return;
      const masterId = editing.masterId ?? editing.id;
      const occurrenceDate = editing.startDate;

      if (scope === "this") {
        // Cancellation override row — hides this single virtual instance.
        // Carries no user-facing fields; it's bookkeeping.
        const payload = {
          origin: "standalone" as const,
          title: null,
          startDate: occurrenceDate,
          isAllDay: 0,
          color: DEFAULT_AGENDA_COLOR_HEX,
          seriesId: masterId,
          originalDate: occurrenceDate,
          isOverride: 1,
          isCancelled: 1,
        };
        await apiRequest("POST", "/api/agenda-tasks", payload);
        return;
      }

      if (scope === "all") {
        await apiRequest("DELETE", `/api/agenda-tasks/${masterId}`, undefined);
        return;
      }

      // scope === "following"
      const truncatedEnd = addDaysIso(occurrenceDate, -1);
      await apiRequest("PATCH", `/api/agenda-tasks/${masterId}`, {
        recurrenceEndDate: truncatedEnd,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({
        title: "Could not delete",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });

  // PR #15 — click handlers on the footer Save/Delete buttons.
  // For recurring rows we open the scope dialog; for everything else we
  // fire the mutation directly with scope=null.
  // PR #29c — in page mode we dispatch the inbox orchestrator mutation
  // instead; recurrence is allowed but scope dialog is unreachable (page
  // mode is always a fresh create, never an edit).
  function onSaveClick() {
    if (isPageMode) {
      inboxSaveMutation.mutate();
      return;
    }
    if (isRecurring) {
      setScopeIntent("save");
      setScopeDialogOpen(true);
      return;
    }
    saveMutation.mutate(null);
  }

  function onDeleteClick() {
    if (isRecurring) {
      setScopeIntent("delete");
      setScopeDialogOpen(true);
      return;
    }
    deleteMutation.mutate(null);
  }

  function onScopeConfirm(scope: RecurrenceScope) {
    if (scopeIntent === "save") {
      saveMutation.mutate(scope);
    } else {
      deleteMutation.mutate(scope);
    }
  }

  const titleText =
    isPageMode
      ? "Do It Later"
      : mode === "create"
        ? "Add task"
        : mode === "edit-virtual"
          ? "Edit this occurrence"
          : "Edit task";

  // PR 29d — endDate is always set. Require endDate >= startDate regardless
  // of all-day. For timed events the same-day case with endTime > startTime
  // is the common path; cross-midnight is handled by the time onChange
  // handler (Q5-A auto-rolls endDate). Either way endDate >= startDate is
  // the only structural requirement.
  const endDateValid = endDate >= date;

  // PR #14 — recurrence-end validation (only enforced when option != none
  // and we're NOT in edit-virtual mode, where recurrence fields are hidden).
  const recurrenceActive =
    mode !== "edit-virtual" && recurrenceOption !== "none";
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const recEndValid =
    !recurrenceActive ||
    (dateRe.test(recurrenceEndDate) &&
      recurrenceEndDate >= date &&
      recurrenceEndDate <= oneYearOut(date));

  const canSave =
    title.trim().length > 0 &&
    dateRe.test(date) &&
    endDateValid &&
    recEndValid;

  // PR #14 — dropdown items, dynamically labeled per the current start date.
  // When editing a row whose existing rule doesn't match a standard, prepend
  // a synthetic "customExisting" item so users see what's currently saved.
  const dropdownItems = useMemo(() => {
    const base = buildDropdownOptions(date);
    if (recurrenceOption === "customExisting" && customRuleSnapshot) {
      return [
        { value: "customExisting" as StandardOption, label: describeCustomRule(customRuleSnapshot) },
        ...base,
      ];
    }
    return base;
  }, [date, recurrenceOption, customRuleSnapshot]);

  // Handle dropdown selection. "custom" opens the Custom recurrence dialog
  // (PR #14b). Selecting the synthetic "customExisting" entry while it's
  // already the active option also reopens the dialog so the user can edit.
  // Everything else commits and seeds a default end-date if the user hasn't
  // picked one yet.
  function onRecurrenceChange(next: StandardOption) {
    if (next === "custom") {
      // Open the Custom dialog. Don't change recurrenceOption yet — if the
      // user cancels the dialog, the dropdown should revert to its prior
      // selection. We do that by leaving state alone here and only updating
      // it in onCustomDialogSave.
      setCustomDialogOpen(true);
      return;
    }
    if (next === "customExisting") {
      // User re-clicked their existing custom entry — open the dialog so
      // they can edit it. Same revert-on-cancel semantics.
      setCustomDialogOpen(true);
      return;
    }
    // Switching AWAY from a customExisting drops the snapshot. (next is
    // narrowed to non-custom by the early returns above.)
    if (recurrenceOption === "customExisting") {
      setCustomRuleSnapshot(null);
    }
    setRecurrenceOption(next);
    if (next === "none") {
      setRecurrenceEndDate("");
    } else if (!recurrenceEndDate) {
      setRecurrenceEndDate(oneYearOut(date));
    }
  }

  // Custom dialog save callback. The dialog hands us the built RRULE plus an
  // optional end date (only set when ends=on). We mirror that into the
  // "customExisting" slot so the dropdown describes it back to the user.
  function onCustomDialogSave(rule: string, endDate: string) {
    setCustomRuleSnapshot(rule);
    setRecurrenceOption("customExisting");
    if (endDate) {
      setRecurrenceEndDate(endDate);
    } else {
      // ends=never or ends=after — no end-date column set. (For ends=after
      // the COUNT lives inside the rule itself.) We still keep an internal
      // 1-year safety cap on the column so legacy consumers don't see
      // unbounded series; the engine reads recurrenceEndDate as a hard stop.
      setRecurrenceEndDate(oneYearOut(date));
    }
  }

  // Handle Ends-on date input. If the user types a date past start + 1 year,
  // open the §22a prompt instead of committing.
  function onRecurrenceEndDateChange(next: string) {
    if (!next) {
      setRecurrenceEndDate(next);
      return;
    }
    if (dateRe.test(next) && next > oneYearOut(date)) {
      setPendingEndDate(next);
      setShowCapPrompt(true);
      return;
    }
    setRecurrenceEndDate(next);
  }

  // §22a prompt actions.
  function capAtOneYear() {
    setRecurrenceEndDate(oneYearOut(date));
    setPendingEndDate("");
    setShowCapPrompt(false);
  }
  // PR #20 — Convert-to-responsibility (§22a). Atomic create-and-redirect:
  //   * Saved task path: send taskId so the server truncates the original
  //     row's recurrence_end_date to the last occurrence ≤ today.
  //   * Unsaved task path: send taskId=null — the source row was never
  //     persisted, so there's nothing to truncate; just create the
  //     responsibility from the in-flight payload.
  // The server returns the new responsibility row; we redirect to its edit
  // page so the user can fill in the rest (people / places / things /
  // providers / conditions — standalone tasks don't carry those today).
  // ruleOverride lets the Custom dialog's cap prompt feed in the rule the
  // user just authored (which hasn't been committed to the parent form's
  // state yet — commit happens via onSave). When omitted, we fall back to
  // the parent form's activeRule().
  const convertMutation = useMutation({
    mutationFn: async (ruleOverride?: string) => {
      // Today in the user's local clock (server uses this as the truncation
      // floor; passing it from the client avoids server-timezone drift).
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      // Pull the current form payload, then layer in any rule override
      // from the Custom dialog. The recurrence rule must be present —
      // §22a's prompt only fires for recurring tasks.
      const base = buildPayload();
      const rule = ruleOverride ?? base.recurrenceRule;
      if (!rule) throw new Error("Cannot convert: no recurrence rule");
      // Saved-task source uses editing.id (or editing.masterId for virtual
      // instances; convert always operates on the master/series, never an
      // override). Unsaved (mode=create) sends taskId=null.
      const taskId =
        editing && (mode === "edit-real" || mode === "edit-virtual")
          ? (editing.masterId ?? editing.id)
          : null;
      const taskPayload = {
        title: title.trim(),
        color: base.color ?? null,
        recurrenceRule: rule,
        startDate: base.startDate,
        time: base.time,
        durationMinutes: base.durationMinutes,
        isAllDay: base.isAllDay === 1,
        endDate: base.endDate,
        // Standalone tasks don't have a role picker today, but a
        // saved task may already carry a role_id from server-seeded data —
        // pass it through if present.
        roleId: editing?.roleId ?? null,
      };
      const r = await apiRequest("POST", "/api/responsibilities/convert-from-task", {
        taskId,
        taskPayload,
        today,
      });
      return r.json() as Promise<{ id: number }>;
    },
    onSuccess: (resp) => {
      // Invalidate caches so Agenda + Support lists reflect the new
      // responsibility and (if a saved task was truncated) the agenda
      // window stops expanding the original past today.
      queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-window"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-tasks"] });
      // Close every open chrome layer (parent modal, parent cap prompt,
      // Custom dialog) before navigating so the user sees the responsibility
      // edit page cleanly.
      setPendingEndDate("");
      setShowCapPrompt(false);
      setCustomDialogOpen(false);
      onOpenChange(false);
      setLocation(`/responsibilities/${resp.id}/edit`);
    },
    onError: (err: any) => {
      toast({
        title: "Could not convert task",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  function convertToResponsibility() {
    convertMutation.mutate(undefined);
  }
  // Bridge for the Custom dialog's Convert button (§22a). Passes the rule
  // the user just authored in that dialog so the conversion uses the new
  // rule instead of the parent form's stale activeRule().
  function convertToResponsibilityFromDialog(rule: string) {
    convertMutation.mutate(rule);
  }
  function cancelCapPrompt() {
    setPendingEndDate("");
    setShowCapPrompt(false);
  }

  // PR #29c — Save button disabled state. In dialog mode this tracks the
  // legacy saveMutation; in page mode it tracks the inbox orchestrator
  // mutation instead.
  const saveIsPending = isPageMode
    ? inboxSaveMutation.isPending
    : saveMutation.isPending;
  // PR #29c — Save button label changes for inbox flow per locked ASCII
  // ("Save task" instead of "Save").
  const saveButtonLabel = isPageMode
    ? saveIsPending
      ? "Saving…"
      : "Save task"
    : saveIsPending
      ? "Saving…"
      : "Save";

  // PR #29c — wrap the body + dialogs + footer in render helpers so we can
  // either nest them in <DialogContent> (dialog mode, the locked Agenda
  // flow) or render them inline in a page wrapper (page mode, inbox Do It
  // Later). The inner JSX is byte-for-byte identical between the two modes
  // except for the new isPageMode-gated Role/Responsibility/support block,
  // so the Agenda + Task experience stays visually unchanged.
  const headerJsx = (
    <DialogTitle>{titleText}</DialogTitle>
  );

  // Body JSX (Title → Date → All-day → End date → Time/Duration →
  // Recurrence → Color → [page-only Role/Resp/support] → Notes). Returned
  // wrapped in the same <div className="space-y-4 py-2"> the Dialog has
  // always used, so the rendered DOM matches the pre-refactor shape
  // exactly when called from the Dialog branch.
  const renderFormBody = () => (
    <div className="space-y-4 py-2">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="What is this task?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              data-testid="input-task-title"
            />
          </div>

          {/* PR 29d — All-day toggle. Moved to be the first row of the
              date/time block to match Google's screenshot. */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-all-day"
              checked={isAllDay}
              onCheckedChange={(v) => {
                const next = v === true;
                setIsAllDay(next);
                if (next) {
                  // Going all-day: collapse end to single-day default.
                  setEndDate(date);
                }
              }}
              data-testid="checkbox-task-all-day"
            />
            <Label htmlFor="task-all-day" className="cursor-pointer">
              All-day
            </Label>
          </div>

          {/* PR 29d — Starts row. Date (always) + Time (only when not
              all-day). The time input sits to the right of the date on a
              single row. Mobile keeps the same two-column ratio. */}
          <div className="space-y-1.5">
            <Label htmlFor="task-date">Starts</Label>
            <div className={isAllDay ? "" : "grid grid-cols-[1fr_9rem] gap-2 items-center"}>
              <Input
                id="task-date"
                type="date"
                value={date}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setDate(nextStart);
                  // Keep endDate >= startDate. If user moves start past end,
                  // pull end forward to match (single-day after the change).
                  if (endDate && nextStart && endDate < nextStart) {
                    setEndDate(nextStart);
                  }
                  // If endDate was previously == old start (single-day), keep it
                  // == new start so the row stays single-day.
                  if (!isAllDay && endDate === date) {
                    setEndDate(nextStart);
                  }
                }}
                data-testid="input-task-date"
              />
              {!isAllDay && (
                <Input
                  id="task-time"
                  type="time"
                  value={time}
                  className="w-full"
                  onChange={(e) => {
                    setTime(e.target.value);
                  }}
                  data-testid="input-task-time"
                />
              )}
            </div>
          </div>

          {/* PR 29d — Ends row. Date (always visible, defaults to startDate)
              + Time (only when not all-day). Cross-midnight: when the user
              picks an endTime <= startTime on the SAME date, endDate auto-
              advances to startDate + 1 day (Q5-A). */}
          <div className="space-y-1.5">
            <Label htmlFor="task-end-date">Ends</Label>
            <div className={isAllDay ? "" : "grid grid-cols-[1fr_9rem] gap-2 items-center"}>
              <Input
                id="task-end-date"
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-task-end-date"
              />
              {!isAllDay && (
                <Input
                  id="task-end-time"
                  type="time"
                  value={endTime}
                  className="w-full"
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    setEndTime(nextEnd);
                    // Q5-A — cross-midnight auto-roll. If end is on the same
                    // date as start but the time is at-or-before start, roll
                    // endDate forward by one day. Only triggers when the user
                    // hasn't already manually set a different end date.
                    if (endDate === date && nextEnd <= time) {
                      setEndDate(addDaysIso(date, 1));
                    }
                  }}
                  data-testid="input-task-end-time"
                />
              )}
            </div>
            {!endDateValid && (
              <p className="text-xs text-destructive" data-testid="text-end-date-error">
                End date must be on or after the start date.
              </p>
            )}
          </div>

          {/* Recurrence (PR #14) — hidden in edit-virtual mode (Google parity:
              "Only this event" can't change the recurrence rule; that lives on
              the master series). Placed directly after the date/time block to
              match Google Calendar's field order. */}
          {mode !== "edit-virtual" && (
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence">Recurrence</Label>
              <select
                id="task-recurrence"
                value={recurrenceOption}
                onChange={(e) => onRecurrenceChange(e.target.value as StandardOption)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-task-recurrence"
              >
                {dropdownItems.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Note: the recurrence end-date input is intentionally NOT shown here.
              Google Calendar parity — standard options on the main modal don't
              expose an end date; that control lives only inside the Custom
              recurrence dialog (PR #14b) where it appears as Ends: Never / On
              [date] / After N occurrences. The 1-year cap (§22a) still applies:
              we auto-seed recurrenceEndDate = start + 1y when the user picks a
              standard option (see onRecurrenceChange), and the §22a prompt
              fires from the Custom dialog when the user manually picks a date
              past the cap. */}

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* PR #29c — page-mode-only: Role + Responsibility + stub support
              toggle. Renders below Color, above Notes (locked hybrid ASCII).
              The [+ Add support details] button stubs to a toast — the
              actual support pivots ship in a follow-up PR. */}
          {isPageMode && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="task-role">Role</Label>
                <select
                  id="task-role"
                  value={roleId == null ? "" : String(roleId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = v === "" ? null : Number(v);
                    setRoleId(next);
                    // Changing role invalidates the responsibility pick.
                    setResponsibilityId(null);
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-task-role"
                >
                  <option value="">Choose role…</option>
                  {(rolesQuery.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-responsibility">Responsibility</Label>
                <select
                  id="task-responsibility"
                  value={responsibilityId == null ? "" : String(responsibilityId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setResponsibilityId(v === "" ? null : Number(v));
                  }}
                  disabled={roleId == null}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                  data-testid="select-task-responsibility"
                >
                  <option value="">
                    {roleId == null ? "Choose a role first…" : "Choose responsibility…"}
                  </option>
                  {filteredResponsibilities.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast({
                      title: "Coming in next PR",
                      description:
                        "Linking People / Places / Things / Providers / Conditions ships in PR 29d.",
                    })
                  }
                  data-testid="button-add-support-details"
                >
                  + Add support details
                </Button>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="textarea-task-notes"
            />
          </div>

          {/* PR #29e — [+ Add to project] collapsible (locked Q2-C). Page mode
              only. Collapsed by default; auto-expands when referenceProjectId
              is set on the inbox item (Q5-C). Section is below Notes per the
              locked ASCII (workspace/pr29c-amend-add-to-project-ascii.md).
              Schema wiring (project_id + sortOrder on agenda_tasks) is
              deferred to PR 29f — see TODO in inboxSaveMutation. */}
          {isPageMode && !addToProjectExpanded && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddToProjectExpanded(true)}
                data-testid="button-add-to-project-expand"
              >
                + Add to project
              </Button>
            </div>
          )}

          {isPageMode && addToProjectExpanded && (
            <div
              className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
              data-testid="section-add-to-project"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Add to project</span>
              </div>

              {/* Project picker */}
              <div className="space-y-1.5">
                <Label htmlFor="add-to-project-select">Project</Label>
                <Select
                  value={projectId === null ? "" : String(projectId)}
                  onValueChange={(v) => setProjectId(v ? Number(v) : null)}
                >
                  <SelectTrigger
                    id="add-to-project-select"
                    data-testid="select-add-to-project"
                  >
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectsQuery.data ?? []).map((p) => (
                      <SelectItem
                        key={p.id}
                        value={String(p.id)}
                        data-testid={`option-add-to-project-${p.id}`}
                      >
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Draggable preview list — only shown when a project is
                  picked. Reuses the shared useDraggableReorder hook (PR #27
                  + PR #29c) with NEW_TASK_ID=-1 as the sentinel for the
                  not-yet-created row. */}
              {projectId !== null && (
                <div className="space-y-1.5">
                  <Label>Reorder — drag to position new task</Label>
                  {projectTasksQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">
                      Loading tasks…
                    </p>
                  ) : (
                    <ul
                      className="space-y-1.5"
                      data-testid="list-add-to-project-preview"
                    >
                      {previewRows.map((row) => {
                        const isDragging = dragHandle.draggingId === row.id;
                        const isDropTarget =
                          dragHandle.dropTargetId === row.id &&
                          dragHandle.draggingId !== null &&
                          dragHandle.draggingId !== row.id;
                        return (
                          <li
                            key={row.id}
                            data-task-row="true"
                            data-task-id={row.id}
                            data-testid={`preview-row-${row.isNew ? "new" : row.id}`}
                            onDragOver={(e) => dragHandle.onDragOverRow(e, row.id)}
                            onDrop={(e) => dragHandle.onDropRow(e, row.id)}
                            className={[
                              "flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm",
                              isDragging ? "opacity-50" : "",
                              isDropTarget ? "border-primary" : "border-border",
                            ].filter(Boolean).join(" ")}
                          >
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => dragHandle.onDragStart(e, row.id)}
                              onDragEnd={dragHandle.onDragEnd}
                              onPointerDown={(e) => dragHandle.onGripPointerDown(e, row.id)}
                              onPointerMove={dragHandle.onGripPointerMove}
                              onPointerUp={dragHandle.onGripPointerUp}
                              onPointerCancel={dragHandle.onGripPointerCancel}
                              aria-label="Drag to reorder"
                              data-testid={`grip-preview-${row.isNew ? "new" : row.id}`}
                              className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </button>
                            <span className="flex-1 truncate">{row.title}</span>
                            {row.isNew && (
                              <span
                                className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                data-testid="badge-new"
                              >
                                new
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddToProjectExpanded(false);
                    setProjectId(null);
                    setOrderOverride(null);
                  }}
                  data-testid="button-add-to-project-hide"
                >
                  − Hide project
                </Button>
              </div>
            </div>
          )}

      {mode === "edit-virtual" && (
        <p className="text-xs text-muted-foreground">
          Saving will only change this single occurrence. The recurring
          series stays intact.
        </p>
      )}
    </div>
  );

  // Inline dialogs (Custom recurrence + §22a cap prompt + Scope dialog).
  // These are siblings of the form body, not nested inside it. Rendered
  // by both Dialog and page mode so behavior is identical.
  const renderInlineDialogs = () => (
    <>
      {/* PR #14b — Custom recurrence dialog. Renders inside the modal so
          it inherits the same dismissal lifecycle. The dialog ships its
          own §22a cap prompt internally. */}
      <CustomRecurrenceDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        startDate={date}
        initialRule={
          recurrenceOption === "customExisting" ? customRuleSnapshot : null
        }
        initialEndDate={
          recurrenceOption === "customExisting" ? recurrenceEndDate : ""
        }
        onSave={onCustomDialogSave}
        onConvertToResponsibility={convertToResponsibilityFromDialog}
      />

      {/* §22a end-date prompt (PR #14). Retained for any future inline
          pickers; currently unreachable because the Custom dialog ships
          its own cap prompt and standard options auto-seed the cap. */}
      <AlertDialog open={showCapPrompt} onOpenChange={(o) => !o && cancelCapPrompt()}>
        {/* z-[60] forces this prompt above the parent Dialog's z-50 stack
            — without it, the alert content sits in the same layer as the
            Dialog and visually merges with it. */}
        <AlertDialogContent
          data-testid="alert-recurrence-cap"
          className="z-[60]"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>This recurrence goes past a year</AlertDialogTitle>
            <AlertDialogDescription>
              What do you want to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Override the default footer (flex-col-reverse + sm:flex-row)
              because we want a vertical stack on every breakpoint with
              clear top-to-bottom reading order. */}
          <div className="flex flex-col gap-2 mt-4">
            <AlertDialogAction
              onClick={capAtOneYear}
              data-testid="button-recurrence-cap"
            >
              Cap at 1 year
            </AlertDialogAction>
            <AlertDialogAction
              onClick={convertToResponsibility}
              disabled={convertMutation.isPending}
              data-testid="button-recurrence-convert"
            >
              Convert to responsibility
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={cancelCapPrompt}
              data-testid="button-recurrence-cap-cancel"
              className="mt-0"
            >
              Cancel
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* PR #15 — Scope dialog for recurring Save/Delete. */}
      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        intent={scopeIntent}
        onConfirm={onScopeConfirm}
      />
    </>
  );

  return isPageMode ? (
    <div
      className="mx-auto w-full max-w-md px-4 py-4 sm:py-6"
      data-testid="page-agenda-task"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (onCancel ? onCancel() : onOpenChange(false))}
          data-testid="button-back"
        >
          ← Back
        </Button>
        <h1 className="text-base font-semibold" data-testid="text-page-title">
          {titleText}
        </h1>
        <span className="w-12" aria-hidden />
      </div>

      {renderFormBody()}
      {renderInlineDialogs()}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => (onCancel ? onCancel() : onOpenChange(false))}
          data-testid="button-task-cancel"
        >
          Cancel
        </Button>
        <Button
          onClick={onSaveClick}
          disabled={!canSave || saveIsPending}
          data-testid="button-task-save"
        >
          {saveButtonLabel}
        </Button>
      </div>
    </div>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-agenda-task">
        <DialogHeader>
          {headerJsx}
        </DialogHeader>

        {renderFormBody()}

        {renderInlineDialogs()}

        <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
          {/* PR #15 — Delete now also shows for edit-virtual so users can
              delete a single recurring occurrence (scope="this"). */}
          {mode !== "create" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteClick}
              disabled={deleteMutation.isPending}
              data-testid="button-task-delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-task-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={onSaveClick}
              disabled={!canSave || saveIsPending}
              data-testid="button-task-save"
            >
              {saveButtonLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
