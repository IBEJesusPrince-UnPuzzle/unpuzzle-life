import type { Express } from "express";
import type { Server } from "http";
import { storage, sqlite } from "./storage";
import { requireAuth, requireAdmin, getEffectiveUserId } from "./auth";
import { format, toZonedTime } from "date-fns-tz";
import ExcelJS from "exceljs";
import {
  insertProjectSchema,
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TRIGGERS,
  insertInboxItemSchema,
  insertWeeklyReviewSchema,
  insertEnvironmentPersonSchema,
  insertEnvironmentPlaceSchema,
  insertEnvironmentThingSchema,
  insertEnvironmentProviderSchema,
  insertEnvironmentConditionSchema,
  insertProjectEnvironmentSchema,
  insertProjectLinkSchema,
  insertResponsibilitySchema,
  responsibilityScheduleSchema,
  responsibilitySchedulePatchSchema,
  convertTaskToResponsibilitySchema,
  insertRoleSchema,
  insertRolePeopleSchema,
  insertResponsibilityRoleSchema,
  insertProjectResponsibilitySchema,
  insertProjectTaskSchema,
  insertAgendaTaskSchema,
  SUPPORT_STATES,
  RELATIONSHIP_TYPES,
  IMPORTANCE_LEVELS,
  AGENDA_ORIGINS,
  AGENDA_STATUSES,
  AGENDA_VIEWS,
  PROJECT_TASK_STATUSES,
  // PR #29a — Phase 8 Inbox processing
  FILED_NOTE_TARGET_TYPES,
  INBOX_PROCESS_ACTIONS,
  type FiledNoteTargetType,
  type InboxProcessAction,
} from "@shared/schema";
import { validateRecurrenceRule } from "./recurrence";
import { z } from "zod";
import ical from "node-ical";

// Phase 1 helper: support type whitelist for /api/environment/{type} dispatch.
const SUPPORT_TYPES = ["people", "places", "things", "providers", "conditions"] as const;
type SupportTypeParam = typeof SUPPORT_TYPES[number];
// Phase 3c — cross-field validator for the multi-day all-day endDate column.
// Rules:
//   - When isAllDay = 1: endDate may be NULL (single-day) or a YYYY-MM-DD
//     string >= date.
//   - When isAllDay = 0: endDate must be NULL/undefined (timed events do not
//     span days at the all-day-pill level; long timed events are still a
//     single chip in the time grid).
// Returns an error string when invalid, or null when OK.
// Accepts a partial body (used by PATCH); fields that aren't present skip
// their respective checks. When isAllDay is being toggled by the patch we
// require the caller to also pass the relevant date(s) so we can validate
// the new shape.
//
// PR #14 — recurrenceEndDate enforcement (§8 prologue b + §22a)
// When a row carries a recurrenceRule, recurrenceEndDate is REQUIRED and
// must be capped at start + 1 year. The modal prompts the user before
// reaching this validator; this is defense in depth for direct API calls.
function validateAgendaRecurrenceEnd(body: Record<string, unknown>): string | null {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const rule = body.recurrenceRule;
  // No rule on this body → nothing to enforce. (PATCHes that don't touch
  // recurrence skip this check entirely.)
  if (rule === undefined) return null;
  if (rule === null || rule === "") return null;
  if (typeof rule !== "string") return null;

  const recEnd = body.recurrenceEndDate;
  if (recEnd === undefined || recEnd === null || recEnd === "") {
    return "recurrenceEndDate is required when recurrenceRule is set";
  }
  if (typeof recEnd !== "string" || !dateRe.test(recEnd)) {
    return "recurrenceEndDate must be in YYYY-MM-DD format";
  }

  const startDate = body.startDate;
  if (typeof startDate === "string" && dateRe.test(startDate)) {
    // 1-year cap. JS Date math handles leap years correctly: setting
    // "YYYY-MM-DD" with month-day Feb 29 → next year's Feb 28 (still
    // exactly 1 year out for cap purposes since the modal's default UI
    // never lets the user exceed this).
    const [y, m, d] = startDate.split("-").map(Number);
    const cap = new Date(Date.UTC(y + 1, m - 1, d));
    const capStr = `${cap.getUTCFullYear()}-${String(cap.getUTCMonth() + 1).padStart(2, "0")}-${String(cap.getUTCDate()).padStart(2, "0")}`;
    if (recEnd > capStr) {
      return "recurrenceEndDate cannot be more than 1 year after start date";
    }
    if (recEnd < startDate) {
      return "recurrenceEndDate must be on or after start date";
    }
  }
  return null;
}

function validateAgendaEndDate(body: Record<string, unknown>): string | null {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const hasIsAllDay = "isAllDay" in body;
  const hasEndDate = "endDate" in body;
  if (!hasEndDate && !hasIsAllDay) return null;

  const endDate = body.endDate;
  const isAllDay = body.isAllDay;
  // PR #24 — reads `startDate` (renamed from `date`).
  const startDate = body.startDate;

  // Timed event: endDate must be null/undefined.
  if (isAllDay === 0 || isAllDay === false) {
    if (endDate !== undefined && endDate !== null && endDate !== "") {
      return "endDate must be null when isAllDay = 0";
    }
    return null;
  }

  // All-day event with explicit endDate: must be valid YYYY-MM-DD and >= startDate.
  if (endDate !== undefined && endDate !== null && endDate !== "") {
    if (typeof endDate !== "string" || !dateRe.test(endDate)) {
      return "endDate must be in YYYY-MM-DD format";
    }
    if (typeof startDate === "string" && dateRe.test(startDate) && endDate < startDate) {
      return "endDate must be >= startDate";
    }
  }
  return null;
}

// PR #22 — Cross-field date validation per Date-handling.docx.
// Rules:
//   end_date is for non-recurring items only.
//   recurrence_end_date is for recurring items only.
//   On responsibilities, when projectId is set, recurrence_end_date is required
//   and must be ≤ the project's targetDate.
// Pure helper; takes a body and (optionally) the resolved project's targetDate.
const dateRe22 = /^\d{4}-\d{2}-\d{2}$/;
function validateResponsibilityDates(body: Record<string, unknown>, projectTargetDate?: string | null): string | null {
  const projectId = body.projectId;
  const recurrenceEndDate = body.recurrenceEndDate;
  const startDate = body.startDate;
  if (startDate !== undefined && startDate !== null && startDate !== "") {
    if (typeof startDate !== "string" || !dateRe22.test(startDate)) {
      return "startDate must be in YYYY-MM-DD format";
    }
  }
  if (recurrenceEndDate !== undefined && recurrenceEndDate !== null && recurrenceEndDate !== "") {
    if (typeof recurrenceEndDate !== "string" || !dateRe22.test(recurrenceEndDate)) {
      return "recurrenceEndDate must be in YYYY-MM-DD format";
    }
    if (typeof startDate === "string" && dateRe22.test(startDate) && recurrenceEndDate < startDate) {
      return "recurrenceEndDate must be ≥ startDate";
    }
  }
  // Temporary responsibility (projectId set) requires recurrenceEndDate ≤ project.targetDate.
  if (projectId !== undefined && projectId !== null) {
    if (recurrenceEndDate === undefined || recurrenceEndDate === null || recurrenceEndDate === "") {
      return "recurrenceEndDate is required when projectId is set (temporary responsibility)";
    }
    if (projectTargetDate && typeof recurrenceEndDate === "string" && recurrenceEndDate > projectTargetDate) {
      return `recurrenceEndDate (${recurrenceEndDate}) must be ≤ project.targetDate (${projectTargetDate})`;
    }
  }
  return null;
}

function validateProjectTaskDates(body: Record<string, unknown>): string | null {
  const startDate = body.startDate;
  const endDate = body.endDate;
  const isAllDay = body.isAllDay;
  if (startDate !== undefined && startDate !== null && startDate !== "") {
    if (typeof startDate !== "string" || !dateRe22.test(startDate)) {
      return "startDate must be in YYYY-MM-DD format";
    }
  }
  // Same shape as agenda_tasks: end_date only allowed when isAllDay=1.
  if (endDate !== undefined && endDate !== null && endDate !== "") {
    if (typeof endDate !== "string" || !dateRe22.test(endDate)) {
      return "endDate must be in YYYY-MM-DD format";
    }
    if (isAllDay === 0 || isAllDay === false) {
      return "endDate is only allowed when isAllDay = 1";
    }
    if (typeof startDate === "string" && dateRe22.test(startDate) && endDate < startDate) {
      return "endDate must be ≥ startDate";
    }
  }
  return null;
}

// PR #23 — Project required-dates validator (Date-handling.docx lock).
// Rules:
//   - startDate: required at create, must be YYYY-MM-DD
//   - targetDate: required at create, must be YYYY-MM-DD, ≥ startDate
//   - endDate: required when status === 'done'; must be YYYY-MM-DD; ≥ startDate;
//             must be NULL/absent when status !== 'done'
//
// `mode` lets callers signal whether they're creating (full body) or patching
// (subset). On PATCH we only validate the fields actually being changed, plus
// the status→endDate dependency when status is being transitioned.
function validateProjectDates(
  body: Record<string, unknown>,
  mode: "create" | "patch",
  existing?: { startDate?: string | null; endDate?: string | null; targetDate?: string | null; status?: string | null },
): string | null {
  const startDate = body.startDate ?? existing?.startDate ?? null;
  const targetDate = body.targetDate ?? existing?.targetDate ?? null;
  const endDate = body.endDate ?? existing?.endDate ?? null;
  const status = body.status ?? existing?.status ?? null;

  if (mode === "create") {
    if (typeof startDate !== "string" || !dateRe22.test(startDate)) {
      return "startDate is required (YYYY-MM-DD)";
    }
    if (typeof targetDate !== "string" || !dateRe22.test(targetDate)) {
      return "targetDate is required (YYYY-MM-DD)";
    }
  } else {
    if (body.startDate !== undefined && body.startDate !== null && body.startDate !== "") {
      if (typeof body.startDate !== "string" || !dateRe22.test(body.startDate)) {
        return "startDate must be in YYYY-MM-DD format";
      }
    }
    if (body.targetDate !== undefined && body.targetDate !== null && body.targetDate !== "") {
      if (typeof body.targetDate !== "string" || !dateRe22.test(body.targetDate)) {
        return "targetDate must be in YYYY-MM-DD format";
      }
    }
  }
  // targetDate must be ≥ startDate when both known.
  if (typeof startDate === "string" && dateRe22.test(startDate)
      && typeof targetDate === "string" && dateRe22.test(targetDate)
      && targetDate < startDate) {
    return "targetDate must be ≥ startDate";
  }
  // endDate: required iff status === 'done'.
  if (status === "done") {
    if (typeof endDate !== "string" || !dateRe22.test(endDate)) {
      return "endDate is required when status is 'done' (YYYY-MM-DD)";
    }
    if (typeof startDate === "string" && dateRe22.test(startDate) && endDate < startDate) {
      return "endDate must be ≥ startDate";
    }
  } else {
    // endDate must not be set unless status === 'done'.
    if (body.endDate !== undefined && body.endDate !== null && body.endDate !== "") {
      return "endDate may only be set when status is 'done'";
    }
  }
  return null;
}

function isSupportType(s: string): s is SupportTypeParam {
  return (SUPPORT_TYPES as readonly string[]).includes(s);
}

export function registerRoutes(server: Server, app: Express) {
  // Apply requireAuth to all /api/* routes EXCEPT auth endpoints
  // Auth endpoints are registered in auth.ts and handled before this middleware
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  // ============================================================
  // PROJECTS
  // ============================================================
  app.get("/api/projects", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getProjects(userId));
  });
  app.post("/api/projects", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertProjectSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // PR #23 — enforce Date-handling.docx required-dates lock at create.
    const dateErr = validateProjectDates(parsed.data as Record<string, unknown>, "create");
    if (dateErr) return res.status(400).json({ error: dateErr });
    res.json(storage.createProject(userId, parsed.data));
  });
  // PR #21 — PATCH validator. Accepts any subset of project columns. Enum-valued
  // fields (status, priority, trigger) are checked here; freeform text fields
  // pass through. Zod .partial() means every field is optional. Unknown fields
  // are stripped (.strict() would 400 — we want forward-compat).
  const projectPatchSchema = z.object({
    title:           z.string().min(1).optional(),
    description:     z.string().nullable().optional(),
    trigger:         z.enum(PROJECT_TRIGGERS).nullable().optional(),
    startDate:       z.string().nullable().optional(),
    endDate:         z.string().nullable().optional(),
    outcomeDone:     z.string().nullable().optional(),
    status:          z.enum(PROJECT_STATUSES).nullable().optional(),
    priority:        z.enum(PROJECT_PRIORITIES).nullable().optional(),
    targetDate:      z.string().nullable().optional(),
    nextAction:      z.string().nullable().optional(),
    blockers:        z.string().nullable().optional(),
    risksWatchouts:  z.string().nullable().optional(),
    notes:           z.string().nullable().optional(),
    lastTouchedAt:   z.string().nullable().optional(),
    stalledAt:       z.string().nullable().optional(),
    archived:        z.number().int().optional(),
    archivedAt:      z.string().nullable().optional(),
  });
  app.patch("/api/projects/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Drizzle throws on .set({}) — short-circuit empty patches by re-fetching.
    if (Object.keys(parsed.data).length === 0) {
      const existing = storage.getProjects(userId).find(p => p.id === Number(req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      return res.json(existing);
    }
    // PR #23 — enforce Date-handling.docx required-dates lock on patch.
    const existing = storage.getProjects(userId).find(p => p.id === Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const dateErr = validateProjectDates(parsed.data as Record<string, unknown>, "patch", existing);
    if (dateErr) return res.status(400).json({ error: dateErr });
    const result = storage.updateProject(userId, Number(req.params.id), parsed.data);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // PR #29h — GET count of agenda_tasks linked to this project via its
  // project_tasks rows. Drives the radio visibility in the delete dialog.
  app.get("/api/projects/:id/linked-agenda-count", (req, res) => {
    const userId = getEffectiveUserId(req);
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }
    // Ownership check — don't leak counts for projects the user can't see.
    const exists = storage.getProjects(userId).some(p => p.id === projectId);
    if (!exists) return res.status(404).json({ error: "Not found" });
    const count = storage.getLinkedAgendaCountForProject(userId, projectId);
    res.json({ count });
  });

  // PR #29h — cascade delete. mode='delete' (default) hard-deletes linked
  // agenda chips; mode='preserve' flips them to standalone. Both modes
  // cascade all 8 project-child tables and null inbox refs.
  app.delete("/api/projects/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }
    const rawMode = String(req.query.mode ?? "delete");
    if (rawMode !== "delete" && rawMode !== "preserve") {
      return res.status(400).json({ error: "mode must be 'delete' or 'preserve'" });
    }
    const summary = storage.deleteProject(userId, projectId, rawMode);
    if (summary.project === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, summary });
  });

  // ============================================================
  // PROJECT LINKS (PR #23 — related links for project edit page)
  // ============================================================
  // GET    /api/project-links?projectId=N  — list links for a project
  // POST   /api/project-links              — create { projectId, label, url }
  // DELETE /api/project-links/:id          — remove a single link
  app.get("/api/project-links", (req, res) => {
    const userId = getEffectiveUserId(req);
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "projectId query param is required" });
    }
    res.json(storage.getProjectLinks(userId, projectId));
  });
  app.post("/api/project-links", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertProjectLinkSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createProjectLink(userId, parsed.data));
  });
  app.delete("/api/project-links/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteProjectLink(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // INBOX
  // ============================================================
  app.get("/api/inbox", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getInboxItems(userId));
  });
  app.get("/api/inbox/trashed", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getTrashedInboxItems(userId));
  });
  app.post("/api/inbox", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertInboxItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createInboxItem(userId, parsed.data));
  });
  app.patch("/api/inbox/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateInboxItem(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/inbox/:id/soft-delete", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.softDeleteInboxItem(userId, Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/inbox/:id/restore", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.restoreInboxItem(userId, Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/inbox/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteInboxItem(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // PR #29a (Phase 8) — INBOX PROCESSING ORCHESTRATOR + SOMEDAY
  // ============================================================
  // Tier 1 source: session b2f73166 turn 30 (2026-05-03 23:30 UTC).
  // Six actions in fixed order: do_it_now / do_it_later / add_to_project /
  // file_it / wonder_it / trash_it.
  //
  // Locked semantics (2026-05-10):
  //   do_it_now    -> mark inbox item processed=1, processedAs='done'.
  //                   No downstream record. (Q7 lock)
  //   do_it_later  -> create an agenda_task from payload, set processedAs='task'.
  //                   Reuses POST /api/agenda-tasks contract (PR #14b).
  //                   The dedicated screen lands in PR #29c — this orchestrator
  //                   accepts the same body schema so the UI can post directly.
  //   add_to_project -> create a project_task with sortOrder, processedAs='project'.
  //                     Reorder UX (PR #27 drag) is client-side; the request
  //                     just sends the final desired sortOrder integer.
  //   file_it      -> create a filed_notes row, processedAs='filed'.
  //   wonder_it    -> processedAs='someday' only. /someday list reads it.
  //   trash_it     -> mirror the existing soft-delete flow (sets deletedAt).
  //
  // Validation strategy: per-action narrow zod parse. The body comes in two
  // parts: { action, payload }. We pick the schema by action.

  // do_it_later body -- PR #29c widened the schema to accept the full
  // agenda_task payload from the hybrid <AgendaTaskForm mode="page">. This
  // lets the inbox Do It Later page persist recurrence, color, and the
  // responsibility_id link added by PR #29c. The orchestrator still owns
  // the cross-field rules (isAllDay vs time+duration, recurrence end date
  // present when recurrenceRule set) and the inbox-side processed flag.
  const doItLaterPayloadSchema = z.object({
    title: z.string().trim().min(1, "Task name is required"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
    isAllDay: z.boolean().default(false),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    roleId: z.number().int().positive().nullable().optional(),
    // PR #30a -- the Responsibility dropdown was removed from Do It Later
    // per RESOLVED-1 (§22a wins over §19). The field is no longer parsed
    // here; if an older client still posts a responsibilityId zod will
    // silently drop it (default non-strict parse) and the insert below
    // writes null. Standalone tasks do not link to responsibilities.
    color: z.string().nullable().optional(),
    // PR #29c -- recurrence fields mirror /api/agenda-tasks contract.
    recurrenceRule: z.string().nullable().optional(),
    recurrenceEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().nullable().optional(),
    // PR #29f -- optional project linkage from the collapsible [+ Add to project]
    // section on the AgendaTaskModal page-mode form (PR #29e UI). When projectId
    // is set we dual-write: insert a project_tasks row first, then the agenda_tasks
    // row with origin='project' + originId pointing at the new project_tasks.id.
    // sortOrder is the integer position the user landed on after dragging the
    // [new] row inside the preview list (Q9-C: end-of-list when no drag).
    projectId: z.number().int().positive().nullable().optional(),
    sortOrder: z.number().int().nullable().optional(),
  });

  const addToProjectPayloadSchema = z.object({
    projectId: z.number().int().positive(),
    taskName: z.string().trim().min(1, "Task name is required"),
    // sortOrder — the final integer the client computed after drag-reorder.
    // When omitted, the orchestrator computes "last" (max + 1) on the server.
    sortOrder: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  const fileItPayloadSchema = z.object({
    targetType: z.enum(FILED_NOTE_TARGET_TYPES as unknown as [FiledNoteTargetType, ...FiledNoteTargetType[]]),
    targetId: z.number().int().positive(),
    note: z.string().trim().min(1, "Note is required"),
    tag: z.string().trim().nullable().optional(),
  });

  // Master orchestrator. Validates the row exists and isn't already processed,
  // dispatches by action, and returns { item, created } where `created` is the
  // downstream record (or null for do_it_now / wonder_it / trash_it).
  app.post("/api/inbox/:id/process", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid inbox id" });
    }

    const action = req.body?.action as InboxProcessAction | undefined;
    if (!action || !INBOX_PROCESS_ACTIONS.includes(action)) {
      return res.status(400).json({
        error: `action must be one of: ${INBOX_PROCESS_ACTIONS.join(", ")}`,
      });
    }

    const item = storage.getInboxItem(userId, id);
    if (!item) return res.status(404).json({ error: "Inbox item not found" });

    // Idempotency guard — don't re-process an already-processed row except for
    // trash, which can be safely re-soft-deleted (sets deletedAt regardless).
    if (item.processed === 1 && action !== "trash_it") {
      return res.status(409).json({
        error: "Inbox item is already processed",
        item,
      });
    }

    try {
      switch (action) {
        case "do_it_now": {
          // Locked Q7: mark complete. No downstream record.
          const updated = storage.markInboxProcessed(userId, id, "done");
          return res.json({ item: updated, created: null });
        }

        case "wonder_it": {
          const updated = storage.markInboxProcessed(userId, id, "someday");
          return res.json({ item: updated, created: null });
        }

        case "trash_it": {
          // Reuse existing soft-delete behavior (also sets processedAs='trash').
          const updated = storage.softDeleteInboxItem(userId, id);
          return res.json({ item: updated, created: null });
        }

        case "do_it_later": {
          const parsed = doItLaterPayloadSchema.safeParse(req.body?.payload);
          if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.message });
          }
          const p = parsed.data;
          // Time/duration cross-field rule for non-all-day rows. Mirrors the
          // agenda-tasks POST guard.
          if (!p.isAllDay && (p.time == null || p.durationMinutes == null)) {
            return res.status(400).json({
              error: "time and durationMinutes are required when not all-day",
            });
          }
          // PR #29c -- if recurrenceRule is set, recurrenceEndDate must also
          // be set. Mirrors the §22a cap rule from PR #14b.
          if (p.recurrenceRule && !p.recurrenceEndDate) {
            return res.status(400).json({
              error: "recurrenceEndDate is required when recurrenceRule is set",
            });
          }
          // PR #29c -- all-day endDate must be >= startDate when supplied.
          if (p.isAllDay && p.endDate && p.endDate < p.startDate) {
            return res.status(400).json({
              error: "endDate must be on or after startDate",
            });
          }

          // PR #29f -- optional project linkage (Q1 locked: dual-write,
          // origin='project'). When the client supplied a projectId, we
          // insert the project_tasks row FIRST, then thread its id into the
          // agenda_tasks row as originId. The agenda row is the canonical
          // chip the user sees on the calendar; the project_tasks row is
          // what shows up inside the project's task list (already sorted by
          // sortOrder, NULLs-last, from PR #21).
          //
          // Q4 locked: the client's dropdown projectId wins silently. The
          // referenceProjectId on the inbox item is only a UI auto-expand
          // hint -- it is NOT checked here.
          let projectTaskRow: ReturnType<typeof storage.createProjectTask> | null = null;
          if (p.projectId != null) {
            // Ownership guard -- confirm the project belongs to this user.
            // Mirrors the implicit guard add_to_project relies on (its
            // payload demands a positive projectId and the create call is
            // user-scoped, but we add an explicit lookup here so we can
            // return a clean 404 instead of an insert-time FK error).
            const ownProjects = storage.getProjects(userId);
            if (!ownProjects.some((pr) => pr.id === p.projectId)) {
              return res.status(404).json({ error: "Project not found" });
            }
            // sortOrder fallback -- mirror the add_to_project orchestrator
            // (Q9-C: silent end-of-list placement when no drag). The PR #29e
            // client always supplies the post-drag value via newRowIndex.
            let sortOrder = p.sortOrder ?? null;
            if (sortOrder == null) {
              const existing = storage.getProjectTasks(userId, p.projectId);
              const maxSort = existing.reduce((m, t) => {
                const v = t.sortOrder;
                return typeof v === "number" && v > m ? v : m;
              }, 0);
              sortOrder = maxSort + 1;
            }
            projectTaskRow = storage.createProjectTask(userId, {
              projectId: p.projectId,
              title: p.title,
              notes: p.notes ?? null,
              status: "open",
              sortOrder,
              startDate: null,
              endDate: null,
              isAllDay: 0,
              recurrenceRule: null,
              recurrenceEndDate: null,
              createdAt: new Date().toISOString(),
            });
          }

          const now = new Date().toISOString();
          const created = storage.createAgendaTask(userId, {
            // PR #29f -- when a project was picked we point at it through the
            // existing polymorphic origin pattern. Otherwise stay 'standalone'.
            origin: projectTaskRow ? "project" : "standalone",
            originId: projectTaskRow ? projectTaskRow.id : null,
            title: p.title,
            startDate: p.startDate,
            endDate: p.isAllDay ? (p.endDate ?? null) : null,
            time: p.isAllDay ? null : (p.time ?? null),
            durationMinutes: p.isAllDay ? null : (p.durationMinutes ?? null),
            isAllDay: p.isAllDay ? 1 : 0,
            roleId: p.roleId ?? null,
            // PR #30a -- no responsibility link on Do It Later tasks. The
            // agenda_tasks.responsibility_id column still exists for legacy
            // rows but new inbox-spawned rows always write null here.
            responsibilityId: null,
            color: p.color ?? null,
            status: "ready",
            recurrenceRule: p.recurrenceRule ?? null,
            recurrenceEndDate: p.recurrenceEndDate ?? null,
            seriesId: null,
            isOverride: 0,
            originalDate: null,
            isCancelled: 0,
            notes: p.notes ?? null,
            createdAt: now,
            updatedAt: now,
          });
          // PR #29f -- when both rows exist the inbox item is processedAs
          // 'task' (the user's primary intent was scheduling). The project
          // side is durable but auxiliary. This matches the locked Q3 stance
          // that project-linked agenda chips edit through the agenda surface
          // (deferred to PR #29g).
          const updated = storage.markInboxProcessed(userId, id, "task");
          return res.json({ item: updated, created, projectTask: projectTaskRow });
        }

        case "add_to_project": {
          const parsed = addToProjectPayloadSchema.safeParse(req.body?.payload);
          if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.message });
          }
          const p = parsed.data;
          // Compute sortOrder when the client didn't supply one. Per locked
          // rule (b2f73166:3403-3406): "The new task is added last by default.
          // Before saving, the user can reorder the project task list."
          // The client always sends the post-reorder sortOrder; this fallback
          // covers programmatic callers.
          let sortOrder = p.sortOrder ?? null;
          if (sortOrder == null) {
            const existing = storage.getProjectTasks(userId, p.projectId);
            const maxSort = existing.reduce((m, t) => {
              const v = t.sortOrder;
              return typeof v === "number" && v > m ? v : m;
            }, 0);
            sortOrder = maxSort + 1;
          }
          const projectTaskRow = storage.createProjectTask(userId, {
            projectId: p.projectId,
            title: p.taskName,
            notes: p.notes ?? null,
            status: "open",
            sortOrder,
            startDate: null,
            endDate: null,
            isAllDay: 0,
            recurrenceRule: null,
            recurrenceEndDate: null,
            createdAt: new Date().toISOString(),
          });
          // Dual-write: create agenda_task so it shows in agenda/review
          // This mirrors the do_it_later with projectId behavior
          const nowIso = new Date().toISOString();
          const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
          storage.createAgendaTask(userId, {
            title: p.taskName,
            notes: p.notes ?? null,
            status: "open",
            origin: "project",
            originId: projectTaskRow.id,
            startDate: today, // Use today for unscheduled project task
            isAllDay: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          const updated = storage.markInboxProcessed(userId, id, "project");
          return res.json({ item: updated, created: projectTaskRow });
        }

        case "file_it": {
          const parsed = fileItPayloadSchema.safeParse(req.body?.payload);
          if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.message });
          }
          const p = parsed.data;
          const created = storage.createFiledNote(userId, {
            targetType: p.targetType,
            targetId: p.targetId,
            note: p.note,
            tag: p.tag ?? null,
            sourceInboxItemId: id,
          });
          const updated = storage.markInboxProcessed(userId, id, "filed");
          return res.json({ item: updated, created });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[inbox process] action=${action} id=${id}:`, msg);
      return res.status(500).json({ error: msg });
    }
  });

  // GET /api/inbox/someday — list of wondered items (Q1 lock).
  // Must register BEFORE GET /api/inbox/:id so the literal "someday"
  // path doesn't get matched as an id parameter.
  app.get("/api/inbox/someday", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getSomedayInboxItems(userId));
  });

  // PR #29b — Single inbox item by id. Used by the File It / Do It Later /
  // Add to Project pages to render the source-item header. Registered after
  // /trashed and /someday so those literal paths take precedence.
  app.get("/api/inbox/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id must be a number" });
    const item = storage.getInboxItem(userId, id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  // POST /api/inbox/:id/restore-from-someday — "Move back to Inbox" action
  // on the /someday page. Flips processed=0, clears processedAs.
  app.post("/api/inbox/:id/restore-from-someday", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid inbox id" });
    }
    const result = storage.restoreInboxFromSomeday(userId, id);
    if (!result) return res.status(404).json({ error: "Inbox item not found" });
    res.json(result);
  });

  // ============================================================
  // PR #29a (Phase 8) — FILED NOTES (File It)
  // ============================================================
  // GET /api/filed-notes
  //   Optional query params: targetType, targetId. When both are present,
  //   results are filtered to that single entity. When neither is present,
  //   returns the user's full notes list (newest first).
  app.get("/api/filed-notes", (req, res) => {
    const userId = getEffectiveUserId(req);
    const rawType = typeof req.query.targetType === "string" ? req.query.targetType : undefined;
    const rawId = typeof req.query.targetId === "string" ? Number(req.query.targetId) : undefined;
    let targetType: FiledNoteTargetType | undefined;
    if (rawType !== undefined) {
      if (!FILED_NOTE_TARGET_TYPES.includes(rawType as FiledNoteTargetType)) {
        return res.status(400).json({
          error: `targetType must be one of: ${FILED_NOTE_TARGET_TYPES.join(", ")}`,
        });
      }
      targetType = rawType as FiledNoteTargetType;
    }
    const targetId = typeof rawId === "number" && Number.isFinite(rawId) ? rawId : undefined;
    res.json(storage.listFiledNotes(userId, targetType, targetId));
  });

  // POST /api/filed-notes — standalone create (used by File It flow when
  // the user files a note outside the orchestrator path, e.g. from a future
  // entity-page "Add note" button).
  app.post("/api/filed-notes", (req, res) => {
    const userId = getEffectiveUserId(req);
    const schema = z.object({
      targetType: z.enum(FILED_NOTE_TARGET_TYPES as unknown as [FiledNoteTargetType, ...FiledNoteTargetType[]]),
      targetId: z.number().int().positive(),
      note: z.string().trim().min(1, "Note is required"),
      tag: z.string().trim().nullable().optional(),
      sourceInboxItemId: z.number().int().positive().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = storage.createFiledNote(userId, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      note: parsed.data.note,
      tag: parsed.data.tag ?? null,
      sourceInboxItemId: parsed.data.sourceInboxItemId ?? null,
    });
    res.json(created);
  });

  app.delete("/api/filed-notes/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }
    storage.deleteFiledNote(userId, id);
    res.json({ ok: true });
  });

  // ============================================================
  // PR #54 — DAILY REVIEW: TASK COMPLETIONS
  // ============================================================

  // GET /api/completions?date=YYYY-MM-DD OR ?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/completions", (req, res) => {
    const userId = getEffectiveUserId(req);
    const date = String(req.query.date ?? "");
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    
    if (date) {
      if (!dateRe.test(date)) {
        return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
      }
      res.json(storage.getCompletionsForDate(userId, date));
    } else if (from && to) {
      if (!dateRe.test(from) || !dateRe.test(to)) {
        return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
      }
      if (from > to) {
        return res.status(400).json({ error: "from must be <= to" });
      }
      res.json(storage.getCompletionsForRange(userId, from, to));
    } else {
      return res.status(400).json({ error: "Provide either date OR (from AND to)" });
    }
  });

  // POST /api/completions — upsert a single completion
  // Body: { seriesId, originalDate } OR { agendaTaskId }, plus { status, rescheduledTo? }
  app.post("/api/completions", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { seriesId, originalDate, agendaTaskId, status, rescheduledTo } = req.body ?? {};
    const validStatuses = ["done", "missed", "skipped", "rescheduled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }
    const hasRecurringKey = seriesId != null && originalDate != null;
    const hasTaskKey = agendaTaskId != null && seriesId == null;
    if (!hasRecurringKey && !hasTaskKey) {
      return res.status(400).json({ error: "Provide (seriesId + originalDate) for recurring, or agendaTaskId for standalone" });
    }
    const result = storage.upsertCompletion(userId, {
      seriesId: seriesId ?? null,
      originalDate: originalDate ?? null,
      agendaTaskId: agendaTaskId ?? null,
      status,
      rescheduledTo: rescheduledTo ?? null,
    });
    res.json(result);
  });

  // POST /api/completions/bulk — bulk upsert for "mark all" actions
  app.post("/api/completions/bulk", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }
    const validStatuses = ["done", "missed", "skipped", "rescheduled"];
    for (const item of items) {
      if (!validStatuses.includes(item.status)) {
        return res.status(400).json({ error: `Invalid status: ${item.status}` });
      }
    }
    const results = storage.bulkUpsertCompletions(userId, items);
    res.json(results);
  });

  // DELETE /api/completions/:id — undo a completion
  app.delete("/api/completions/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteCompletion(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // WEEKLY REVIEWS
  // ============================================================
  app.get("/api/weekly-reviews", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getWeeklyReviews(userId));
  });
  app.post("/api/weekly-reviews", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertWeeklyReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createWeeklyReview(userId, parsed.data));
  });
  app.patch("/api/weekly-reviews/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateWeeklyReview(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  // ============================================================
  // PREFERENCES
  // ============================================================
  app.get("/api/preferences", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getPreferences(userId));
  });
  app.put("/api/preferences", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { displayName, timeFormat, claritySkipRitual, showResponsibility, showProjectTask, showStandalone } = req.body;
    const data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean; showResponsibility?: boolean; showProjectTask?: boolean; showStandalone?: boolean } = {};
    if (displayName !== undefined) data.displayName = String(displayName).slice(0, 50);
    if (timeFormat !== undefined && (timeFormat === "12h" || timeFormat === "24h")) data.timeFormat = timeFormat;
    if (claritySkipRitual !== undefined) data.claritySkipRitual = !!claritySkipRitual;
    if (showResponsibility !== undefined) data.showResponsibility = !!showResponsibility;
    if (showProjectTask !== undefined) data.showProjectTask = !!showProjectTask;
    if (showStandalone !== undefined) data.showStandalone = !!showStandalone;
    res.json(storage.updatePreferences(userId, data));
  });

  // ============================================================
  // ENVIRONMENT: PEOPLE
  // ============================================================
  app.get("/api/environment/people", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentPeople(userId));
  });
  app.post("/api/environment/people", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertEnvironmentPersonSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentPerson(userId, parsed.data));
  });
  app.patch("/api/environment/people/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentPerson(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // DELETE /api/environment/people/:id — superseded by the generic
  // DELETE /api/environment/:type/:id?cascade=true handler (PR #33).
  // Removed because the bare-delete it was doing 500'd whenever links
  // existed (FK constraint), and no client called it.

  // ============================================================
  // ENVIRONMENT: PLACES
  // ============================================================
  app.get("/api/environment/places", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentPlaces(userId));
  });
  app.post("/api/environment/places", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertEnvironmentPlaceSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentPlace(userId, parsed.data));
  });
  app.patch("/api/environment/places/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentPlace(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // DELETE /api/environment/places/:id — superseded by generic handler (PR #33).

  // ============================================================
  // ENVIRONMENT: THINGS
  // ============================================================
  app.get("/api/environment/things", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentThings(userId));
  });
  app.post("/api/environment/things", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertEnvironmentThingSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentThing(userId, parsed.data));
  });
  app.patch("/api/environment/things/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentThing(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // DELETE /api/environment/things/:id — superseded by generic handler (PR #33).

  // ============================================================
  // PROJECT ENVIRONMENT (junction)
  // ============================================================
  app.get("/api/projects/:id/environment", (req, res) => {
    res.json(storage.getProjectEnvironment(Number(req.params.id)));
  });
  app.post("/api/projects/:id/environment", (req, res) => {
    const data = { ...req.body, projectId: Number(req.params.id) };
    const parsed = insertProjectEnvironmentSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.addProjectEnvironment(parsed.data));
  });
  app.delete("/api/projects/:projectId/environment/:id", (req, res) => {
    storage.removeProjectEnvironment(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // RESPONSIBILITIES
  // ============================================================
  app.get("/api/responsibilities", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getResponsibilities(userId));
  });
  // PR #19 — returns the responsibility row PLUS its schedule (the master
  // agenda_tasks row's date / time / duration / isAllDay / endDate /
  // recurrenceRule). schedule is null for responsibilities created
  // pre-PR #19 that haven't been given a schedule yet.
  app.get("/api/responsibilities/:id/schedule", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    const result = storage.getResponsibilityWithSchedule(userId, id);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // PR #19 — POST now accepts an optional `schedule` payload (date / time /
  // durationMinutes / isAllDay / endDate / recurrenceRule). When supplied,
  // the responsibility row and the master agenda_tasks row are inserted in
  // a single transaction (storage.createResponsibility). schedule must pass
  // the cross-field check (time + duration required when not all-day);
  // otherwise we 400. recurrenceRule on the schedule is mirrored onto
  // responsibilities.recurrenceRule when the body doesn't supply it
  // separately, so the cascade source-of-truth stays in sync.
  app.post("/api/responsibilities", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { schedule: scheduleRaw, ...rest } = req.body ?? {};
    const data = { ...rest, createdAt: rest.createdAt || new Date().toISOString() };
    const parsed = insertResponsibilitySchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // PR #22 — cross-field date validation. If projectId set, look up project.targetDate.
    let projectTargetDate: string | null | undefined;
    if (parsed.data.projectId != null) {
      const proj = storage.getProjects(userId).find(p => p.id === parsed.data.projectId);
      if (!proj) return res.status(400).json({ error: `projectId ${parsed.data.projectId} not found` });
      projectTargetDate = proj.targetDate;
    }
    const dateErr = validateResponsibilityDates(parsed.data as Record<string, unknown>, projectTargetDate);
    if (dateErr) return res.status(400).json({ error: dateErr });
    // Duplicate-name guard (case-insensitive, trimmed) — mirrors role rule.
    const trimmed = (parsed.data.name ?? "").trim();
    if (!trimmed) return res.status(400).json({ error: "Responsibility name is required." });
    const existing = storage.getResponsibilities(userId);
    if (existing.some(r => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ error: `You already have a responsibility named '${trimmed}'.` });
    }

    let schedule: z.infer<typeof responsibilityScheduleSchema> | null = null;
    if (scheduleRaw !== undefined && scheduleRaw !== null) {
      const sched = responsibilityScheduleSchema.safeParse(scheduleRaw);
      if (!sched.success) return res.status(400).json({ error: sched.error.message });
      // Validate the recurrence rule with the same engine the agenda modal uses.
      const ruleErr = validateRecurrenceRule(sched.data.recurrenceRule);
      if (ruleErr) return res.status(400).json({ error: `Invalid recurrence rule: ${ruleErr}` });
      schedule = sched.data;
      // Mirror the schedule's recurrenceRule onto the responsibility row when
      // the body didn't set one explicitly. Cascade reads (PR #18d COALESCE)
      // need it on responsibilities; the master agenda_tasks row needs it for
      // the recurrence engine.
      if (parsed.data.recurrenceRule == null) {
        parsed.data.recurrenceRule = sched.data.recurrenceRule;
      }
    }

    res.json(storage.createResponsibility(
      userId,
      { ...parsed.data, name: trimmed },
      schedule
        ? { ...schedule, endDate: schedule.endDate ?? null }
        : null,
    ));
  });
  app.patch("/api/responsibilities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    const { schedule: scheduleRaw, ...rest } = req.body ?? {};
    const patch: any = { ...rest };
    // PR #18d alignment: per Google's calendar-level pattern, edits at the
    // responsibility level (this endpoint) always cascade to every instance.
    // There is no scope concept here — that lives on agenda_tasks for
    // per-instance edits from Day view. Any `scope` field that leaks in
    // from a stale client is silently dropped; drizzle's .set() rejects
    // unknown columns, so we have to strip it before forwarding.
    if ("scope" in patch) delete patch.scope;
    // PR #22 — cross-field date validation. Re-resolve targetDate based on the
    // patch's projectId or the existing row's projectId.
    if ("startDate" in patch || "recurrenceEndDate" in patch || "projectId" in patch) {
      const existing = storage.getResponsibilities(userId).find(r => r.id === id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const merged: Record<string, unknown> = {
        startDate: "startDate" in patch ? patch.startDate : existing.startDate,
        recurrenceEndDate: "recurrenceEndDate" in patch ? patch.recurrenceEndDate : existing.recurrenceEndDate,
        projectId: "projectId" in patch ? patch.projectId : existing.projectId,
      };
      let projectTargetDate: string | null | undefined;
      if (merged.projectId != null) {
        const proj = storage.getProjects(userId).find(p => p.id === merged.projectId);
        if (!proj) return res.status(400).json({ error: `projectId ${merged.projectId} not found` });
        projectTargetDate = proj.targetDate;
      }
      const dateErr = validateResponsibilityDates(merged, projectTargetDate);
      if (dateErr) return res.status(400).json({ error: dateErr });
    }
    // Duplicate-name guard on rename (case-insensitive, trimmed).
    if (typeof patch.name === "string") {
      const trimmed = patch.name.trim();
      if (!trimmed) return res.status(400).json({ error: "Responsibility name is required." });
      const existing = storage.getResponsibilities(userId);
      if (existing.some(r => r.id !== id && r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        return res.status(409).json({ error: `You already have a responsibility named '${trimmed}'.` });
      }
      patch.name = trimmed;
    }

    // PR #19 — schedule patch (PATCH variant: every field optional, no
    // cross-field requirement). Storage layer handles the master row.
    let schedulePatch: z.infer<typeof responsibilitySchedulePatchSchema> | null = null;
    if (scheduleRaw !== undefined && scheduleRaw !== null) {
      const sched = responsibilitySchedulePatchSchema.safeParse(scheduleRaw);
      if (!sched.success) return res.status(400).json({ error: sched.error.message });
      if (sched.data.recurrenceRule !== undefined) {
        const ruleErr = validateRecurrenceRule(sched.data.recurrenceRule);
        if (ruleErr) return res.status(400).json({ error: `Invalid recurrence rule: ${ruleErr}` });
        // Keep responsibility-level recurrenceRule in sync if the body didn't
        // also set it directly (cascade source-of-truth).
        if (patch.recurrenceRule === undefined) {
          patch.recurrenceRule = sched.data.recurrenceRule;
        }
      }
      schedulePatch = sched.data;
    }

    const result = storage.updateResponsibility(userId, id, patch, schedulePatch);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/responsibilities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteResponsibility(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // PR #20 — Convert standalone task → responsibility (§22a). One atomic
  // request that:
  //   1. Truncates the original task's recurrence_end_date to the last
  //      occurrence on/before today (or min(today, start − 1) for
  //      future-dated tasks). Original recurrence_rule stays untouched
  //      per §22a.
  //   2. Inserts the new responsibility row.
  //   3. Inserts the master agenda_tasks row (origin='responsibility')
  //      with the source task's date/time/duration/isAllDay/endDate/role.
  // The client redirects to /responsibilities/:id/edit on success.
  // Duplicate-name handling mirrors POST /api/responsibilities (409).
  app.post("/api/responsibilities/convert-from-task", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = convertTaskToResponsibilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Validate the recurrence rule with the same engine the modal uses.
    const ruleErr = validateRecurrenceRule(parsed.data.taskPayload.recurrenceRule);
    if (ruleErr) return res.status(400).json({ error: `Invalid recurrence rule: ${ruleErr}` });
    // Duplicate-name guard — same shape as POST /api/responsibilities.
    const trimmed = parsed.data.taskPayload.title.trim();
    if (!trimmed) return res.status(400).json({ error: "Task name is required." });
    const existing = storage.getResponsibilities(userId);
    if (existing.some(r => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ error: `You already have a responsibility named '${trimmed}'.` });
    }
    try {
      const resp = storage.convertTaskToResponsibility(userId, {
        taskId: parsed.data.taskId,
        taskPayload: { ...parsed.data.taskPayload, title: trimmed },
        today: parsed.data.today,
      });
      res.json(resp);
    } catch (err: any) {
      // Source task not found (taskId stale) is the most common failure.
      const msg = err?.message || String(err);
      if (/not found/i.test(msg)) return res.status(404).json({ error: msg });
      throw err;
    }
  });

  // ============================================================
  // ROLES
  // ============================================================
  app.get("/api/roles", (req, res) => {
    const userId = getEffectiveUserId(req);
    const allRoles = storage.getRoles(userId);
    // Embed people array in each role for convenience
    const enriched = allRoles.map(role => ({
      ...role,
      people: storage.getRolePeople(role.id),
    }));
    res.json(enriched);
  });
  app.post("/api/roles", (req, res) => {
    const userId = getEffectiveUserId(req);
    // Hide cadence/dayOfWeek from UI per addendum A7.1; default on create.
    const data = {
      cadence: "weekly",
      dayOfWeek: null,
      ...req.body,
      createdAt: req.body.createdAt || new Date().toISOString(),
    };
    const parsed = insertRoleSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Duplicate-name guard (case-insensitive, trimmed) per addendum A4.2.
    const trimmed = (parsed.data.name ?? "").trim();
    if (!trimmed) return res.status(400).json({ error: "Role name is required." });
    const existing = storage.getRoles(userId);
    if (existing.some(r => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ error: `You already have a role named '${trimmed}'.` });
    }
    res.json(storage.createRole(userId, { ...parsed.data, name: trimmed }));
  });
  app.patch("/api/roles/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    // Strip cadence/dayOfWeek from PATCH bodies per addendum A7.1 — the
    // edit screen never touches them; preserve whatever's on disk.
    const { cadence: _c, dayOfWeek: _d, ...patch } = req.body ?? {};
    // Duplicate-name guard on rename per addendum A4.2.
    if (typeof patch.name === "string") {
      const trimmed = patch.name.trim();
      if (!trimmed) return res.status(400).json({ error: "Role name is required." });
      const existing = storage.getRoles(userId);
      if (existing.some(r => r.id !== id && r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        return res.status(409).json({ error: `You already have a role named '${trimmed}'.` });
      }
      patch.name = trimmed;
    }
    const result = storage.updateRole(userId, id, patch);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/roles/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    // Self role cannot be deleted per addendum A4.1 (LOCKED).
    const all = storage.getRoles(userId);
    const target = all.find(r => r.id === id);
    if (target && target.name.trim().toLowerCase() === "self") {
      return res.status(409).json({ error: "Self cannot be deleted." });
    }
    storage.deleteRole(userId, id);
    res.json({ ok: true });
  });

  // ROLE PEOPLE (junction)
  app.post("/api/roles/:id/people", (req, res) => {
    const data = { ...req.body, roleId: Number(req.params.id) };
    const parsed = insertRolePeopleSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.addRolePerson(parsed.data));
  });
  app.delete("/api/roles/:roleId/people/:id", (req, res) => {
    storage.removeRolePerson(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // PHASE 1 §§1-3 — PROVIDERS, CONDITIONS, STATE, JUNCTIONS
  // ============================================================

  // ----- Environment Providers -----
  app.get("/api/environment/providers", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentProviders(userId));
  });
  app.post("/api/environment/providers", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertEnvironmentProviderSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentProvider(userId, parsed.data));
  });
  app.patch("/api/environment/providers/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentProvider(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // DELETE /api/environment/providers/:id — superseded by generic handler (PR #33).

  // ----- Environment Conditions -----
  app.get("/api/environment/conditions", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentConditions(userId));
  });
  app.post("/api/environment/conditions", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertEnvironmentConditionSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentCondition(userId, parsed.data));
  });
  app.patch("/api/environment/conditions/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentCondition(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  // DELETE /api/environment/conditions/:id — superseded by generic handler (PR #33).

  // ----- Support state setter (works for all 5 categories) -----
  // PATCH /api/environment/{type}/:id/state  body: { state: '...' }
  app.patch("/api/environment/:type/:id/state", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const { state } = req.body || {};
    if (!state || !(SUPPORT_STATES as readonly string[]).includes(state)) {
      return res.status(400).json({ error: `state must be one of: ${SUPPORT_STATES.join(", ")}` });
    }
    const result = storage.setSupportState(type, userId, Number(id), state);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  // ----- PR #33: Support Makeup management — link summary + cascade delete -----
  // GET /api/environment/:type/link-counts
  //   Bulk per-entry link counts for one support type. Powers the
  //   /support/:type list page's sub-line in one call instead of N+1.
  //   Returns [{ id, count }] for every entry of that type owned by the
  //   caller (zero-count entries included so the list can render
  //   "Not used yet").
  app.get("/api/environment/:type/link-counts", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { type } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    res.json(storage.getEnvironmentLinkCounts(userId, type));
  });

  // GET /api/environment/:type/:id/link-summary
  //   Returns the count of junction rows across all 3 parents
  //   (responsibilities, projects, agendaTasks) that reference this env entry.
  //   The /support/:type edit sheet's "Used by" rollup and the delete dialog's
  //   pre-flight count both consume this. 404 when the entry doesn't exist or
  //   doesn't belong to the caller.
  app.get("/api/environment/:type/:id/link-summary", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const summary = storage.getEnvironmentLinkSummary(userId, type, Number(id));
    if (!summary) return res.status(404).json({ error: "Not found" });
    res.json(summary);
  });

  // DELETE /api/environment/:type/:id?cascade=true
  //   Single destructive path: removes every junction row across the 3 parents
  //   (15 tables total) and then the env entry itself. Returns the per-parent
  //   counts so the client can build a summary toast.
  //
  //   The existing per-type DELETE handlers above only cascade to the
  //   responsibility_* junctions (legacy behavior from §3); this new endpoint
  //   is the full cross-parent cascade and is intentionally distinct.
  //
  //   We require ?cascade=true as an explicit opt-in so a stray DELETE without
  //   the flag can't silently take out projects + agenda task links.
  app.delete("/api/environment/:type/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    if (req.query.cascade !== "true") {
      return res.status(400).json({ error: "cascade=true query param required" });
    }
    const summary = storage.deleteEnvironmentWithCascade(userId, type, Number(id));
    if (!summary) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, summary });
  });

  // PR #53 Phase 3 — Get all responsibilities/projects/agenda tasks using a specific support.
  // Used by disruption dialog to show "This may affect…" list with complete cross-reference.
  app.get("/api/environment/:type/:id/affected-items", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const items = storage.getSupportAffectedItems(userId, type, Number(id));
    res.json(items);
  });

  // ----- Responsibility ↔ Role junction -----
  app.get("/api/responsibilities/:id/roles", (req, res) => {
    res.json(storage.getResponsibilityRoles(Number(req.params.id)));
  });
  // Bulk endpoint: returns every responsibility↔role link for the current user.
  // Used by /support dashboard and §5 role detail to label responsibilities
  // with their linked roles without N+1 fetching.
  app.get("/api/responsibility-roles", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getAllResponsibilityRolesForUser(userId));
  });
  app.post("/api/responsibilities/:id/roles", (req, res) => {
    const userId = getEffectiveUserId(req);
    const respId = Number(req.params.id);
    const data = { ...req.body, responsibilityId: respId };
    const parsed = insertResponsibilityRoleSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Prevent duplicate role link on the same responsibility.
    const existingLinks = storage.getResponsibilityRoles(respId);
    if (existingLinks.some(l => l.roleId === parsed.data.roleId)) {
      return res.status(409).json({ error: "That role is already linked to this responsibility." });
    }
    // Verify role belongs to current user (guard cross-user link attempts).
    const userRoles = storage.getRoles(userId);
    if (!userRoles.some(r => r.id === parsed.data.roleId)) {
      return res.status(404).json({ error: "Role not found." });
    }
    res.json(storage.linkResponsibilityRole(parsed.data));
  });
  app.delete("/api/responsibilities/:respId/roles/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const respId = Number(req.params.respId);
    const linkId = Number(req.params.id);
    // Pleasure-keeps-Self enforcement (addendum: locked spec §5).
    // For the responsibility named exactly "UnPuzzle Pleasure" (case-sensitive),
    // the link to the Self role cannot be removed — Self stays personally
    // protected even when the responsibility is shared with other roles.
    const allResps = storage.getResponsibilities(userId);
    const resp = allResps.find(r => r.id === respId);
    if (resp && resp.name === "UnPuzzle Pleasure") {
      const links = storage.getResponsibilityRoles(respId);
      const link = links.find(l => l.id === linkId);
      if (link) {
        const userRoles = storage.getRoles(userId);
        const linkedRole = userRoles.find(r => r.id === link.roleId);
        if (linkedRole && linkedRole.name.trim().toLowerCase() === "self") {
          return res.status(409).json({
            error: "Self stays linked to UnPuzzle Pleasure so it remains personally protected.",
          });
        }
      }
    }
    storage.unlinkResponsibilityRole(linkId);
    res.json({ ok: true });
  });

  // ----- Responsibility ↔ Support junctions (5 categories) -----
  // GET    /api/responsibilities/:id/support/:type
  // POST   /api/responsibilities/:id/support/:type   body: { <fkField>, relationshipType?, importance? }
  // PATCH  /api/responsibilities/:respId/support/:type/:linkId   body: { relationshipType?, importance? }
  // DELETE /api/responsibilities/:respId/support/:type/:linkId
  function validateRelImp(body: any): string | null {
    if (body.relationshipType !== undefined && !(RELATIONSHIP_TYPES as readonly string[]).includes(body.relationshipType)) {
      return `relationshipType must be one of: ${RELATIONSHIP_TYPES.join(", ")}`;
    }
    if (body.importance !== undefined && !(IMPORTANCE_LEVELS as readonly string[]).includes(body.importance)) {
      return `importance must be one of: ${IMPORTANCE_LEVELS.join(", ")}`;
    }
    return null;
  }
  // Map support type → the FK column name in its junction table.
  const supportFkField: Record<SupportTypeParam, string> = {
    people: "personId",
    places: "placeId",
    things: "thingId",
    providers: "providerId",
    conditions: "conditionId",
  };

  app.get("/api/responsibilities/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    res.json(storage.getResponsibilitySupports(Number(id), type));
  });
  app.post("/api/responsibilities/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const fkField = supportFkField[type];
    const fkValue = req.body?.[fkField];
    if (typeof fkValue !== "number") {
      return res.status(400).json({ error: `${fkField} (number) is required` });
    }
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const data: any = {
      responsibilityId: Number(id),
      [fkField]: fkValue,
    };
    if (req.body.relationshipType !== undefined) data.relationshipType = req.body.relationshipType;
    if (req.body.importance !== undefined) data.importance = req.body.importance;
    res.json(storage.linkResponsibilitySupport(type, data));
  });
  app.patch("/api/responsibilities/:respId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const updates: any = {};
    if (req.body.relationshipType !== undefined) updates.relationshipType = req.body.relationshipType;
    if (req.body.importance !== undefined) updates.importance = req.body.importance;
    // PR #53: Support explicit workaround linking
    if (req.body.coversId !== undefined) updates.coversId = req.body.coversId;
    const result = storage.updateResponsibilitySupportLink(type, Number(linkId), updates);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/responsibilities/:respId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    storage.unlinkResponsibilitySupport(type, Number(linkId));
    res.json({ ok: true });
  });

  // ----- Project ↔ Support junctions (PR #23) -----
  app.get("/api/projects/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    res.json(storage.getProjectSupports(Number(id), type));
  });
  app.post("/api/projects/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const fkField = supportFkField[type];
    const fkValue = req.body?.[fkField];
    if (typeof fkValue !== "number") {
      return res.status(400).json({ error: `${fkField} (number) is required` });
    }
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const data: any = {
      projectId: Number(id),
      [fkField]: fkValue,
    };
    if (req.body.relationshipType !== undefined) data.relationshipType = req.body.relationshipType;
    if (req.body.importance !== undefined) data.importance = req.body.importance;
    res.json(storage.linkProjectSupport(type, data));
  });
  app.patch("/api/projects/:projectId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const updates: any = {};
    if (req.body.relationshipType !== undefined) updates.relationshipType = req.body.relationshipType;
    if (req.body.importance !== undefined) updates.importance = req.body.importance;
    // PR #53: Support explicit workaround linking
    if (req.body.coversId !== undefined) updates.coversId = req.body.coversId;
    const result = storage.updateProjectSupportLink(type, Number(linkId), updates);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/projects/:projectId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    storage.unlinkProjectSupport(type, Number(linkId));
    res.json({ ok: true });
  });

  // ----- Agenda Task ↔ Support junctions (PR #32) -----
  // Mirrors the responsibility and project support routes exactly. Same
  // dispatch by :type, same fk-field mapping, same validateRelImp, same
  // PATCH semantics. The shared SupportSection UI component drives all three
  // parents (responsibility, project, agendaTask) by passing parentType.
  app.get("/api/agenda-tasks/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    res.json(storage.getAgendaTaskSupports(Number(id), type));
  });
  app.post("/api/agenda-tasks/:id/support/:type", (req, res) => {
    const { type, id } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const fkField = supportFkField[type];
    const fkValue = req.body?.[fkField];
    if (typeof fkValue !== "number") {
      return res.status(400).json({ error: `${fkField} (number) is required` });
    }
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const data: any = {
      agendaTaskId: Number(id),
      [fkField]: fkValue,
    };
    if (req.body.relationshipType !== undefined) data.relationshipType = req.body.relationshipType;
    if (req.body.importance !== undefined) data.importance = req.body.importance;
    res.json(storage.linkAgendaTaskSupport(type, data));
  });
  app.patch("/api/agenda-tasks/:taskId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    const validationErr = validateRelImp(req.body);
    if (validationErr) return res.status(400).json({ error: validationErr });
    const result = storage.updateAgendaTaskSupportLink(type, Number(linkId), {
      relationshipType: req.body.relationshipType,
      importance: req.body.importance,
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/agenda-tasks/:taskId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    storage.unlinkAgendaTaskSupport(type, Number(linkId));
    res.json({ ok: true });
  });

  // ----- Project ↔ Responsibility junction -----
  app.get("/api/projects/:id/responsibilities", (req, res) => {
    res.json(storage.getProjectResponsibilities(Number(req.params.id)));
  });
  app.post("/api/projects/:id/responsibilities", (req, res) => {
    const body = req.body || {};
    const isPrimary = body.isPrimary === true || body.isPrimary === 1 ? 1 : 0;
    const data = {
      projectId: Number(req.params.id),
      responsibilityId: Number(body.responsibilityId),
      isPrimary,
    };
    const parsed = insertProjectResponsibilitySchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.linkProjectResponsibility(parsed.data));
  });
  app.delete("/api/projects/:projectId/responsibilities/:id", (req, res) => {
    storage.unlinkProjectResponsibility(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // SUPPORT REQUESTS
  // ============================================================
  app.post("/api/support-requests", requireAuth, (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const { description, screenshotBase64, pageUrl, userAgent, screenSize } = req.body || {};
      if (!description || typeof description !== "string") {
        return res.status(400).json({ error: "description is required" });
      }
      const createdAt = new Date().toISOString();
      const result = sqlite
        .prepare(
          `INSERT INTO support_requests (user_id, description, screenshot_base64, page_url, user_agent, screen_size, status, resolved_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?)`
        )
        .run(
          userId,
          description,
          screenshotBase64 || null,
          pageUrl || null,
          userAgent || null,
          screenSize || null,
          createdAt
        );
      const row = sqlite
        .prepare("SELECT * FROM support_requests WHERE id = ?")
        .get(result.lastInsertRowid) as any;
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.get("/api/admin/support-requests", requireAdmin, (_req, res) => {
    try {
      const rows = sqlite
        .prepare(
          `SELECT sr.id, sr.user_id as userId, u.email as userEmail, u.display_name as userDisplayName,
                  sr.description, sr.screenshot_base64 as screenshotBase64,
                  sr.page_url as pageUrl, sr.user_agent as userAgent, sr.screen_size as screenSize,
                  sr.status, sr.resolved_at as resolvedAt, sr.created_at as createdAt
           FROM support_requests sr
           LEFT JOIN users u ON u.id = sr.user_id
           ORDER BY sr.created_at DESC`
        )
        .all();
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.patch("/api/admin/support-requests/:id", requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (status !== "resolved") {
        return res.status(400).json({ error: "status must be 'resolved'" });
      }
      const resolvedAt = new Date().toISOString();
      const updateResult = sqlite
        .prepare("UPDATE support_requests SET status = ?, resolved_at = ? WHERE id = ?")
        .run("resolved", resolvedAt, id);
      if (updateResult.changes === 0) {
        return res.status(404).json({ error: "Not found" });
      }
      const row = sqlite.prepare("SELECT * FROM support_requests WHERE id = ?").get(id) as any;
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ============================================================
  // PHASE 2 §22 — PROJECT TASKS
  // ============================================================
  app.get("/api/project-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const projectIdRaw = req.query.projectId;
    const projectId = projectIdRaw !== undefined ? Number(projectIdRaw) : undefined;
    if (projectIdRaw !== undefined && Number.isNaN(projectId)) {
      return res.status(400).json({ error: "projectId must be a number" });
    }
    res.json(storage.getProjectTasks(userId, projectId));
  });
  app.get("/api/project-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.getProjectTask(userId, Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/project-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    if (data.status !== undefined && !(PROJECT_TASK_STATUSES as readonly string[]).includes(data.status)) {
      return res.status(400).json({ error: `status must be one of: ${PROJECT_TASK_STATUSES.join(", ")}` });
    }
    if (data.recurrenceRule) {
      const err = validateRecurrenceRule(data.recurrenceRule);
      if (err) return res.status(400).json({ error: `recurrenceRule invalid: ${err}` });
    }
    const parsed = insertProjectTaskSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // PR #22 — date-handling validation (start/end/all-day shape).
    const dateErr = validateProjectTaskDates(parsed.data as Record<string, unknown>);
    if (dateErr) return res.status(400).json({ error: dateErr });
    res.json(storage.createProjectTask(userId, parsed.data));
  });
  app.patch("/api/project-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const body = req.body || {};
    if (body.status !== undefined && !(PROJECT_TASK_STATUSES as readonly string[]).includes(body.status)) {
      return res.status(400).json({ error: `status must be one of: ${PROJECT_TASK_STATUSES.join(", ")}` });
    }
    if (body.recurrenceRule) {
      const err = validateRecurrenceRule(body.recurrenceRule);
      if (err) return res.status(400).json({ error: `recurrenceRule invalid: ${err}` });
    }
    // PR #22 — if any date field is in the patch, re-merge with existing row
    // and validate the combined shape (matches responsibility PATCH pattern).
    if ("startDate" in body || "endDate" in body || "isAllDay" in body) {
      const existing = storage.getProjectTask(userId, Number(req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const merged: Record<string, unknown> = {
        startDate: "startDate" in body ? body.startDate : existing.startDate,
        endDate: "endDate" in body ? body.endDate : existing.endDate,
        isAllDay: "isAllDay" in body ? body.isAllDay : existing.isAllDay,
      };
      const dateErr = validateProjectTaskDates(merged);
      if (dateErr) return res.status(400).json({ error: dateErr });
    }
    const result = storage.updateProjectTask(userId, Number(req.params.id), body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/project-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteProjectTask(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // PHASE 2 §22a — AGENDA TASKS (calendar, with hybrid recurrence)
  // ============================================================
  app.get("/api/agenda-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.getAgendaTask(userId, Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    // Enrich with projectName for project tasks
    if (result.origin === "project" && result.originId) {
      try {
        const projectTask = storage.getProjectTask(userId, result.originId);
        if (projectTask) {
          const projects = storage.getProjects(userId);
          const project = projects.find(p => p.id === projectTask.projectId);
          if (project) {
            (result as any).projectName = project.title;
          }
        }
      } catch (e) {
        // If project lookup fails, still return the task without projectName
        console.error("Error enriching project name:", e);
      }
    }
    res.json(result);
  });

  // ----------------------------------------------------------------------
  // PR #30a — Today card popup data join.
  // Returns the agenda_tasks row plus everything the AgendaTaskViewModal
  // (PR #30a) needs to render its three card variants without issuing N
  // follow-up requests from the client:
  //   * origin='responsibility' — linked responsibility name + role names
  //     (via responsibility_role junction) + the responsibility's own
  //     People/Places/Things/Providers/Conditions, joined to environment_*
  //     for name + state + relationship_type, plus the responsibility's
  //     linked project (first row by id) + that project's next-action
  //     project_task (status='open', sortOrder NULLs-last).
  //   * origin='project'         — the project_tasks row → its project (name)
  //     → the project's OWN supports per §10 (Linked supports list) → the
  //     project's linked responsibilities (names, primary first) → the next
  //     open project_task in this project after the current row by
  //     sortOrder. Per RESOLVED-2 the project task subline shows the
  //     project name + responsibility names; per RESOLVED-2 the Support
  //     check reads from the project's supports, not the responsibility's.
  //   * origin='standalone'      — only the agenda row plus its roleId
  //     resolved to a role name. There is no task_support table in the
  //     schema (see RESOLVED-1 / §22a notes), so supports come back as an
  //     empty array and the client renders "(none)".
  // Support rows are always returned in the order: people, places, things,
  // providers, conditions — matching the locked Support module ordering.
  app.get("/api/agenda-tasks/:id/card", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid agenda task id" });
    }
    const task = storage.getAgendaTask(userId, id);
    if (!task) return res.status(404).json({ error: "Not found" });

    // Common helper — collect the five support categories for a parent id
    // (either a responsibility or a project) and normalize them into a flat
    // list of { type, name, state, relationshipType, importance } objects.
    // The environment_* tables vary only in their FK column name, but all
    // five carry { id, name, state } so the join shape is uniform.
    const SUPPORT_TYPES: Array<"people" | "places" | "things" | "providers" | "conditions"> =
      ["people", "places", "things", "providers", "conditions"];

    type CardSupport = {
      type: "people" | "places" | "things" | "providers" | "conditions";
      id: number;
      linkId?: number;
      name: string;
      state: string;
      relationshipType: string;
      importance: string;
      // PR #53: ID of the critical support this workaround covers (junction row ID)
      coversId?: number | null;
      // PR #53: Reason why support is unavailable (if applicable)
      unavailableReason?: string | null;
    };

    // Build per-type id→env lookup once. The list-getters return user-scoped
    // rows; we index them by id so the join below doesn't issue N queries.
    const envByType: Record<"people" | "places" | "things" | "providers" | "conditions", Map<number, { name: string; state: string; unavailableReason?: string | null }>> = {
      people: new Map(storage.getEnvironmentPeople(userId).map((r) => [r.id, { name: r.name, state: r.state, unavailableReason: r.unavailableReason }])),
      places: new Map(storage.getEnvironmentPlaces(userId).map((r) => [r.id, { name: r.name, state: r.state, unavailableReason: r.unavailableReason }])),
      things: new Map(storage.getEnvironmentThings(userId).map((r) => [r.id, { name: r.name, state: r.state, unavailableReason: r.unavailableReason }])),
      providers: new Map(storage.getEnvironmentProviders(userId).map((r) => [r.id, { name: r.name, state: r.state, unavailableReason: r.unavailableReason }])),
      conditions: new Map(storage.getEnvironmentConditions(userId).map((r) => [r.id, { name: r.name, state: r.state, unavailableReason: r.unavailableReason }])),
    };

    function collectSupports(
      kind: "responsibility" | "project",
      parentId: number,
    ): CardSupport[] {
      const out: CardSupport[] = [];
      for (const t of SUPPORT_TYPES) {
        const links: any[] = kind === "responsibility"
          ? storage.getResponsibilitySupports(parentId, t)
          : storage.getProjectSupports(parentId, t);
        if (!links.length) continue;
        // Each link row carries a foreign key into environment_<t>; look
        // up the environment record for name + state via the prebuilt map.
        const fkCol = t === "people"
          ? "personId"
          : t === "places"
          ? "placeId"
          : t === "things"
          ? "thingId"
          : t === "providers"
          ? "providerId"
          : "conditionId";
        for (const link of links) {
          const supportId: number = link[fkCol];
          const env = envByType[t].get(supportId);
          if (!env) continue;
          out.push({
            type: t,
            id: supportId,
            linkId: link.id,
            name: env.name,
            state: env.state,
            relationshipType: link.relationshipType,
            importance: link.importance,
            coversId: link.coversId,
            unavailableReason: env.unavailableReason,
          });
        }
      }
      return out;
    }

    if (task.origin === "responsibility" && task.originId != null) {
      // No single-row responsibility getter exists; getResponsibilityWithSchedule
      // returns { responsibility, schedule } and short-circuits on ownership.
      const respWrap = storage.getResponsibilityWithSchedule(userId, task.originId);
      const resp = respWrap?.responsibility;
      if (!resp) {
        // The agenda row points at a responsibility that no longer exists.
        // Return the task with empty join data; the client renders "(none)".
        return res.json({ task, kind: "responsibility", responsibility: null, roles: [], supports: [], linkedProject: null });
      }
      // Roles via the responsibility_role junction → resolve role names.
      const links = storage.getResponsibilityRoles(resp.id);
      const allRoles = storage.getRoles(userId);
      const roleNameById = new Map(allRoles.map((r) => [r.id, r.name]));
      const roles = links
        .map((l) => roleNameById.get(l.roleId))
        .filter((n): n is string => typeof n === "string");

      const supports = collectSupports("responsibility", resp.id);

      // Linked project — prefer the responsibility's direct projectId
      // backlink (§2 "project may link to a responsibility"), then fall
      // back to scanning project_responsibility for older rows that only
      // wrote the junction. When multiple projects link, we surface the
      // first by id and ignore the rest (single-project line per ASCII).
      const projects = storage.getProjects(userId);
      let linkedProject: { id: number; title: string; status: string; nextAction: string | null } | null = null;
      const respLinkedProjectId = (resp as any).projectId ?? null;
      let projectMatch = respLinkedProjectId != null
        ? projects.find((p) => p.id === respLinkedProjectId) ?? null
        : null;
      if (!projectMatch) {
        for (const p of projects) {
          const pr = storage.getProjectResponsibilities(p.id);
          if (pr.some((row) => row.responsibilityId === resp.id)) {
            projectMatch = p;
            break;
          }
        }
      }
      if (projectMatch) {
        // Next-action: first status='open' project_task by sortOrder
        // (NULLs-last), then by id as tiebreaker.
        const tasks = storage.getProjectTasks(userId, projectMatch.id);
        const open = tasks.filter((t) => t.status === "open");
        open.sort((a, b) => {
          const aS = a.sortOrder == null ? Number.MAX_SAFE_INTEGER : a.sortOrder;
          const bS = b.sortOrder == null ? Number.MAX_SAFE_INTEGER : b.sortOrder;
          if (aS !== bS) return aS - bS;
          return a.id - b.id;
        });
        linkedProject = {
          id: projectMatch.id,
          title: projectMatch.title,
          status: projectMatch.status ?? "active",
          nextAction: open[0]?.title ?? null,
        };
      }

      // PR #52 — Include full responsibility row (response/cue/craving/reward)
      // plus schedule for expanded card view.
      const schedule = respWrap?.schedule ?? null;

      return res.json({
        task,
        kind: "responsibility",
        responsibility: {
          id: resp.id,
          name: resp.name,
          response: resp.response,
          cue: resp.cue,
          craving: resp.craving,
          reward: resp.reward,
        },
        roles,
        supports,
        linkedProject,
        schedule,
      });
    }

    if (task.origin === "project" && task.originId != null) {
      const projectTask = storage.getProjectTask(userId, task.originId);
      if (!projectTask) {
        return res.json({ task, kind: "project", project: null, projectTask: null, responsibilities: [], supports: [], nextAction: null });
      }
      const projects = storage.getProjects(userId);
      const project = projects.find((p) => p.id === projectTask.projectId) ?? null;
      if (!project) {
        return res.json({ task, kind: "project", project: null, projectTask, responsibilities: [], supports: [], nextAction: null });
      }
      // Linked responsibilities, primary first. project_responsibility
      // carries isPrimary; we sort isPrimary=1 ahead of the rest, then by
      // id for stable order.
      const prLinks = storage.getProjectResponsibilities(project.id);
      const allResps = storage.getResponsibilities(userId);
      const respById = new Map(allResps.map((r) => [r.id, r]));
      const linkedResps = prLinks
        .map((l) => ({ link: l, resp: respById.get(l.responsibilityId) }))
        .filter((x): x is { link: typeof prLinks[number]; resp: typeof allResps[number] } => x.resp != null)
        .sort((a, b) => {
          if (a.link.isPrimary !== b.link.isPrimary) {
            return b.link.isPrimary - a.link.isPrimary;
          }
          return a.link.id - b.link.id;
        })
        .map(({ resp }) => ({ id: resp.id, name: resp.name }));

      const supports = collectSupports("project", project.id);

      // Next action: next status='open' task in THIS project, by sortOrder
      // (NULLs-last), excluding the current row itself. If the current row
      // is the last open task, nextAction is null and the client omits the
      // Next action block (per ASCII variant 5 note).
      const tasks = storage.getProjectTasks(userId, project.id);
      const open = tasks.filter((t) => t.status === "open" && t.id !== projectTask.id);
      open.sort((a, b) => {
        const aS = a.sortOrder == null ? Number.MAX_SAFE_INTEGER : a.sortOrder;
        const bS = b.sortOrder == null ? Number.MAX_SAFE_INTEGER : b.sortOrder;
        if (aS !== bS) return aS - bS;
        return a.id - b.id;
      });

      return res.json({
        task,
        kind: "project",
        project: { id: project.id, title: project.title, status: project.status ?? "active" },
        projectTask: { id: projectTask.id, title: projectTask.title },
        responsibilities: linkedResps,
        supports,
        nextAction: open[0]?.title ?? null,
      });
    }

    // origin='standalone' — resolve the role (if any), then collect the
    // task's own People/Places/Things/Providers/Conditions from the
    // agenda_task_* pivot tables (added in PR #14b and written through by
    // the page-mode Support card). Mirrors the responsibility / project
    // pattern above so the popup renders identical "X · status" rows.
    //
    // PR #43 fix: previously the supports list was hard-coded to [] with a
    // stale comment claiming no task_support table existed. The five pivot
    // tables DO exist (agenda_task_people / _places / _things / _providers /
    // _conditions), each carrying relationshipType + importance, so the
    // collect-and-join shape is identical to collectSupports().
    const role = task.roleId != null
      ? storage.getRoles(userId).find((r) => r.id === task.roleId) ?? null
      : null;
    const standaloneSupports: CardSupport[] = [];
    for (const t of SUPPORT_TYPES) {
      const links = storage.getAgendaTaskSupports(task.id, t);
      if (!links.length) continue;
      const fkCol = t === "people"
        ? "personId"
        : t === "places"
        ? "placeId"
        : t === "things"
        ? "thingId"
        : t === "providers"
        ? "providerId"
        : "conditionId";
      for (const link of links) {
        const supportId: number = (link as any)[fkCol];
        const env = envByType[t].get(supportId);
        if (!env) continue;
        standaloneSupports.push({
          type: t,
          id: supportId,
          linkId: (link as any).id,
          name: env.name,
          state: env.state,
          relationshipType: (link as any).relationshipType,
          importance: (link as any).importance,
          coversId: (link as any).coversId,
        });
      }
    }
    return res.json({
      task,
      kind: "standalone",
      role: role ? { id: role.id, name: role.name } : null,
      supports: standaloneSupports,
    });
  });
  app.post("/api/agenda-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const nowIso = new Date().toISOString();
    const data = {
      ...req.body,
      createdAt: req.body.createdAt || nowIso,
      updatedAt: req.body.updatedAt || nowIso,
    };
    if (data.origin !== undefined && !(AGENDA_ORIGINS as readonly string[]).includes(data.origin)) {
      return res.status(400).json({ error: `origin must be one of: ${AGENDA_ORIGINS.join(", ")}` });
    }
    if (data.status !== undefined && !(AGENDA_STATUSES as readonly string[]).includes(data.status)) {
      return res.status(400).json({ error: `status must be one of: ${AGENDA_STATUSES.join(", ")}` });
    }
    if (data.recurrenceRule) {
      const err = validateRecurrenceRule(data.recurrenceRule);
      if (err) return res.status(400).json({ error: `recurrenceRule invalid: ${err}` });
    }
    const recEndErr = validateAgendaRecurrenceEnd(data);
    if (recEndErr) return res.status(400).json({ error: recEndErr });
    const endDateErr = validateAgendaEndDate(data);
    if (endDateErr) return res.status(400).json({ error: endDateErr });
    const parsed = insertAgendaTaskSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createAgendaTask(userId, parsed.data));
  });
  app.patch("/api/agenda-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const body = { ...(req.body || {}) };
    if (body.origin !== undefined && !(AGENDA_ORIGINS as readonly string[]).includes(body.origin)) {
      return res.status(400).json({ error: `origin must be one of: ${AGENDA_ORIGINS.join(", ")}` });
    }
    if (body.status !== undefined && !(AGENDA_STATUSES as readonly string[]).includes(body.status)) {
      return res.status(400).json({ error: `status must be one of: ${AGENDA_STATUSES.join(", ")}` });
    }
    // Prevent changing origin from project to standalone
    if (body.origin !== undefined) {
      const existing = storage.getAgendaTask(userId, Number(req.params.id));
      if (existing && existing.origin === "project" && body.origin !== "project") {
        return res.status(400).json({ error: "Cannot change origin of project-linked tasks" });
      }
    }
    if (body.recurrenceRule) {
      const err = validateRecurrenceRule(body.recurrenceRule);
      if (err) return res.status(400).json({ error: `recurrenceRule invalid: ${err}` });
    }
    // PATCH-time recurrence-end enforcement: only run when the patch
    // touches recurrenceRule (otherwise we'd reject patches that don't
    // care about recurrence). When rule is being SET, also require
    // recurrenceEndDate AND startDate in the body (caller's responsibility).
    if (body.recurrenceRule !== undefined) {
      // For the cap check we need start date. Pull from body, else fail
      // soft (storage will use the row's existing startDate — but the modal
      // always sends startDate alongside, so this branch is just safety).
      const recEndErr = validateAgendaRecurrenceEnd(body);
      if (recEndErr) return res.status(400).json({ error: recEndErr });
    }
    const endDateErr = validateAgendaEndDate(body);
    if (endDateErr) return res.status(400).json({ error: endDateErr });
    // Auto-bump updatedAt for any mutation.
    body.updatedAt = new Date().toISOString();
    const result = storage.updateAgendaTask(userId, Number(req.params.id), body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/agenda-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteAgendaTask(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // Window query — expands recurring masters and merges overrides + standalones.
  // GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/agenda", (req, res) => {
    const userId = getEffectiveUserId(req);
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) {
      return res.status(400).json({ error: "from and to are required as YYYY-MM-DD" });
    }
    if (from > to) {
      return res.status(400).json({ error: "from must be <= to" });
    }
    // PR #30b — server-side task-type filter (Google parity).
    // Read the user's preferences and drop rows whose origin is hidden.
    const prefs = storage.getPreferences(userId);
    const rows = storage.getAgendaWindow(userId, from, to);
    const filtered = rows.filter((r: any) => {
      if (r.origin === "responsibility") return prefs.showResponsibility;
      if (r.origin === "project") return prefs.showProjectTask;
      if (r.origin === "standalone") return prefs.showStandalone;
      return true;
    });
    // Merge external calendar events as read-only items.
    const extEvents = storage.getExternalEventsInWindow(userId, from, to);
    const extMapped = extEvents.map((ev: any) => {
      const startTime: string | null = ev.start_time ?? ev.startTime ?? null;
      const endTime: string | null = ev.end_time ?? ev.endTime ?? null;
      const startDate: string = ev.start_date ?? ev.startDate;
      const endDate: string = ev.end_date ?? ev.endDate;
      const isAllDay: number = ev.is_all_day ?? ev.isAllDay ?? 0;
      const calendarColor: string = ev.calendarColor ?? ev.calendar_color ?? "#4285F4";
      return ({
      id: -(ev.id),           // negative id signals read-only to the client
      origin: "external" as const,
      originId: null,
      uid: ev.uid,
      title: ev.title,
      startDate,
      endDate,
      time: startTime,
      endTime,
      durationMinutes: (startTime && endTime)
        ? (() => {
            const [sh, sm] = startTime.split(":").map(Number);
            const [eh, em] = endTime.split(":").map(Number);
            return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
          })()
        : null,
      isAllDay,
      color: ev.color ?? calendarColor,
      calendarName: ev.calendarName ?? ev.calendar_name,
      calendarUrl: ev.calendarUrl ?? ev.calendar_url ?? null,
      description: ev.description,
      location: ev.location,
      isVirtual: false,
      isExternal: true,
      // Fill required AgendaWindowItem fields with safe defaults.
      status: "ready",
      roleId: null, userId, isOverride: 0, isCancelled: 0,
      seriesId: null, originalDate: null, masterId: -(ev.id),
      recurrenceRule: null, recurrenceEndDate: null, notes: null,
      responsibilityId: null, roleNames: [], projectName: null,
      responsibilityNames: [], placeName: null, placeCount: 0,
      createdAt: ev.created_at ?? ev.createdAt, updatedAt: ev.updated_at ?? ev.updatedAt,
    });
    });
    res.json([...filtered, ...extMapped]);
  });

  // ============================================================
  // EXTERNAL CALENDARS
  // ============================================================
  app.get("/api/external-calendars", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.listExternalCalendars(userId));
  });

  app.post("/api/external-calendars", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = z.object({
      name: z.string().trim().min(1),
      url: z.string().url(),
      color: z.string().default("#4285F4"),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createExternalCalendar(userId, parsed.data));
  });

  // PATCH /api/external-calendars/:id — update name, color, and/or visibility
  app.patch("/api/external-calendars/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    const { name, color, visible } = req.body;
    if (name !== undefined && typeof name !== "string") {
      return res.status(400).json({ error: "name must be a string" });
    }
    if (color !== undefined && typeof color !== "string") {
      return res.status(400).json({ error: "color must be a string" });
    }
    if (visible !== undefined && typeof visible !== "number") {
      return res.status(400).json({ error: "visible must be a number" });
    }
    const result = storage.updateExternalCalendar(userId, id, { name, color, visible });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  app.delete("/api/external-calendars/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteExternalCalendar(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/external-calendars/:id/sync", async (req, res) => {
    const userId = getEffectiveUserId(req);
    const cal = storage.getExternalCalendar(userId, Number(req.params.id));
    if (!cal) return res.status(404).json({ error: "Not found" });
    try {
      const events = await ical.async.fromURL(cal.url);
      const toUpsert: Parameters<typeof storage.upsertExternalEvents>[1] = [];
      for (const rawEv of Object.values(events)) {
        if (!rawEv || rawEv.type !== "VEVENT") continue;
        const ev = rawEv as any;
        const start: Date | undefined = ev.start;
        const end: Date | undefined = ev.end ?? ev.start;
        if (!start) continue;
        // node-ical sets datetype="date" for all-day events and
        // datetype="date-time" (or omits it) for timed events.
        // Guard: also treat as all-day if the Date object has no time
        // component (midnight UTC with getUTCHours===0 && getUTCMinutes===0
        // is how node-ical represents a bare DATE value).
        const isAllDay =
          ev.datetype === "date" ||
          (ev.datetype !== "date-time" &&
            start.getUTCHours() === 0 &&
            start.getUTCMinutes() === 0 &&
            start.getUTCSeconds() === 0 &&
            start.getMilliseconds() === 0 &&
            !String(ev.start).includes("T"));
        // Use UTC date string for all-day; local time for timed events.
        const toDateStrUtc = (d: Date) => d.toISOString().slice(0, 10);
        const toDateStrLocal = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const dy = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${dy}`;
        };
        const toTimeStr = (d: Date, tz: string | undefined) => {
          if (tz) {
            // Event has timezone info - use it
            return format(d, "HH:mm", { timeZone: tz });
          } else {
            // No timezone info - floating time
            // On Render (UTC), node-ical interprets as UTC, but we want Eastern
            // Convert UTC to Eastern using toZonedTime
            const easternTime = toZonedTime(d, "America/New_York");
            return format(easternTime, "HH:mm");
          }
        };
        const startDate = isAllDay ? toDateStrUtc(start) : toDateStrLocal(start);
        const endRaw = end ? (isAllDay ? toDateStrUtc(end) : toDateStrLocal(end)) : startDate;
        // iCal all-day end dates are exclusive (next day); subtract 1 day.
        const endDate = isAllDay && endRaw > startDate
          ? toDateStrUtc(new Date(new Date(endRaw).getTime() - 86400000))
          : endRaw;
        console.log(`[ical-sync] uid=${ev.uid} datetype=${ev.datetype} isAllDay=${isAllDay} start=${ev.start} startDate=${startDate} startTime=${isAllDay ? null : toTimeStr(start, ev.tzid)}`);
        toUpsert.push({
          uid: String(ev.uid ?? `${startDate}-${ev.summary}`),
          title: String(ev.summary ?? "(No title)"),
          startDate,
          endDate,
          startTime: isAllDay ? null : toTimeStr(start, ev.tzid),
          endTime: isAllDay || !end ? null : toTimeStr(end, ev.tzid),
          isAllDay: isAllDay ? 1 : 0,
          description: ev.description ? String(ev.description) : null,
          location: ev.location ? String(ev.location) : null,
        });
      }
      storage.upsertExternalEvents(cal.id, toUpsert);
      res.json({ synced: toUpsert.length });
    } catch (err: any) {
      res.status(502).json({ error: `Failed to fetch calendar: ${err.message}` });
    }
  });

  // Default agenda view preference (per §23).
  app.get("/api/agenda-default-view", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json({ view: storage.getAgendaDefaultView(userId) });
  });
  app.patch("/api/agenda-default-view", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { view } = req.body || {};
    if (!view || !(AGENDA_VIEWS as readonly string[]).includes(view)) {
      return res.status(400).json({ error: `view must be one of: ${AGENDA_VIEWS.join(", ")}` });
    }
    storage.setAgendaDefaultView(userId, view);
    res.json({ view });
  });

  // PR #37 — pinch-zoom hour-row height (shared across Day / 3-Day / Week).
  // Clamp 28–112 px/h. Default 56 px/h matches the pre-PR #37 constant.
  app.get("/api/agenda-hour-height", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json({ hourHeightPx: storage.getAgendaHourHeightPx(userId) });
  });
  app.patch("/api/agenda-hour-height", (req, res) => {
    const userId = getEffectiveUserId(req);
    const raw = (req.body || {}).hourHeightPx;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: "hourHeightPx must be a number" });
    }
    const clamped = Math.min(112, Math.max(28, Math.round(n)));
    storage.setAgendaHourHeightPx(userId, clamped);
    res.json({ hourHeightPx: clamped });
  });

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================
  app.get("/api/export", async (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "UnPuzzle Life";
      workbook.created = new Date();

      // Overview sheet
      const overviewSheet = workbook.addWorksheet("Overview");
      overviewSheet.addRow(["Export Date", new Date().toLocaleDateString()]);
      overviewSheet.addRow(["Export Time", new Date().toLocaleTimeString()]);
      overviewSheet.addRow(["User ID", userId]);
      overviewSheet.addRow(["Version", "2.0"]);
      
      // Style the overview sheet - two-column layout
      overviewSheet.getColumn(1).width = 20;
      overviewSheet.getColumn(2).width = 25;
      overviewSheet.eachRow((row, rowNumber) => {
        row.getCell(1).font = { bold: true };
      });

      // Agenda Tasks sheet
      const agendaTasksSheet = workbook.addWorksheet("Agenda Tasks");
      agendaTasksSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Origin", key: "origin" },
        { header: "Origin ID", key: "originId" },
        { header: "Title", key: "title" },
        { header: "Start Date", key: "startDate" },
        { header: "End Date", key: "endDate" },
        { header: "Time", key: "time" },
        { header: "Duration Minutes", key: "durationMinutes" },
        { header: "Is All Day", key: "isAllDay" },
        { header: "Role ID", key: "roleId" },
        { header: "Responsibility ID", key: "responsibilityId" },
        { header: "Status", key: "status" },
        { header: "Color", key: "color" },
        { header: "Recurrence Rule", key: "recurrenceRule" },
        { header: "Recurrence End Date", key: "recurrenceEndDate" },
        { header: "Series ID", key: "seriesId" },
        { header: "Is Override", key: "isOverride" },
        { header: "Original Date", key: "originalDate" },
        { header: "Is Cancelled", key: "isCancelled" },
        { header: "Notes", key: "notes" },
        { header: "Created At", key: "createdAt" },
        { header: "Updated At", key: "updatedAt" },
      ];
      // Get all agenda tasks by querying with a wide date range
      const agendaTasks = storage.getAgendaWindow(userId, "2000-01-01", "2100-12-31");
      // Filter out virtual tasks to only export base/master tasks
      const baseAgendaTasks = agendaTasks.filter((task: any) => !task.isVirtual);
      agendaTasksSheet.addRows(baseAgendaTasks);
      
      // Style the agenda tasks sheet
      agendaTasksSheet.getRow(1).font = { bold: true };
      agendaTasksSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Project Tasks sheet
      const projectTasksSheet = workbook.addWorksheet("Project Tasks");
      projectTasksSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Project ID", key: "projectId" },
        { header: "Title", key: "title" },
        { header: "Notes", key: "notes" },
        { header: "Status", key: "status" },
        { header: "Recurrence Rule", key: "recurrenceRule" },
        { header: "Recurrence End Date", key: "recurrenceEndDate" },
        { header: "Start Date", key: "startDate" },
        { header: "End Date", key: "endDate" },
        { header: "Is All Day", key: "isAllDay" },
        { header: "Sort Order", key: "sortOrder" },
        { header: "Created At", key: "createdAt" },
      ];
      const projectTasks = storage.getProjectTasks(userId);
      projectTasksSheet.addRows(projectTasks);
      
      // Style the project tasks sheet
      projectTasksSheet.getRow(1).font = { bold: true };
      projectTasksSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Projects sheet
      const projectsSheet = workbook.addWorksheet("Projects");
      projectsSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Title", key: "title" },
        { header: "Description", key: "description" },
        { header: "Trigger", key: "trigger" },
        { header: "Start Date", key: "startDate" },
        { header: "End Date", key: "endDate" },
        { header: "Outcome Done", key: "outcomeDone" },
        { header: "Status", key: "status" },
        { header: "Priority", key: "priority" },
        { header: "Target Date", key: "targetDate" },
        { header: "Next Action", key: "nextAction" },
        { header: "Blockers", key: "blockers" },
        { header: "Risks Watchouts", key: "risksWatchouts" },
        { header: "Notes", key: "notes" },
        { header: "Last Touched At", key: "lastTouchedAt" },
        { header: "Stalled At", key: "stalledAt" },
        { header: "Archived", key: "archived" },
        { header: "Archived At", key: "archivedAt" },
        { header: "Created At", key: "createdAt" },
      ];
      const projects = storage.getProjects(userId);
      projectsSheet.addRows(projects);
      
      // Style the projects sheet
      projectsSheet.getRow(1).font = { bold: true };
      projectsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Responsibilities sheet
      const responsibilitiesSheet = workbook.addWorksheet("Responsibilities");
      responsibilitiesSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Cadence", key: "cadence" },
        { header: "Day of Week", key: "dayOfWeek" },
        { header: "Custom Cron Expr", key: "customCronExpr" },
        { header: "Is Preset", key: "isPreset" },
        { header: "Color", key: "color" },
        { header: "Recurrence Rule", key: "recurrenceRule" },
        { header: "Start Date", key: "startDate" },
        { header: "Recurrence End Date", key: "recurrenceEndDate" },
        { header: "Project ID", key: "projectId" },
        { header: "Response", key: "response" },
        { header: "Cue", key: "cue" },
        { header: "Craving", key: "craving" },
        { header: "Reward", key: "reward" },
        { header: "Created At", key: "createdAt" },
      ];
      const responsibilities = storage.getResponsibilities(userId);
      responsibilitiesSheet.addRows(responsibilities);
      
      // Style the responsibilities sheet
      responsibilitiesSheet.getRow(1).font = { bold: true };
      responsibilitiesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Support taxonomy sheets
      const people = storage.getEnvironmentPeople(userId);
      const peopleSheet = workbook.addWorksheet("People");
      peopleSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Relationship", key: "relationship" },
        { header: "State", key: "state" },
        { header: "Unavailable Reason", key: "unavailableReason" },
        { header: "Created At", key: "createdAt" },
      ];
      peopleSheet.addRows(people);
      
      // Style the people sheet
      peopleSheet.getRow(1).font = { bold: true };
      peopleSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const places = storage.getEnvironmentPlaces(userId);
      const placesSheet = workbook.addWorksheet("Places");
      placesSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Type", key: "type" },
        { header: "State", key: "state" },
        { header: "Unavailable Reason", key: "unavailableReason" },
        { header: "Created At", key: "createdAt" },
      ];
      placesSheet.addRows(places);
      
      // Style the places sheet
      placesSheet.getRow(1).font = { bold: true };
      placesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const things = storage.getEnvironmentThings(userId);
      const thingsSheet = workbook.addWorksheet("Things");
      thingsSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Category", key: "category" },
        { header: "State", key: "state" },
        { header: "Unavailable Reason", key: "unavailableReason" },
        { header: "Created At", key: "createdAt" },
      ];
      thingsSheet.addRows(things);
      
      // Style the things sheet
      thingsSheet.getRow(1).font = { bold: true };
      thingsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const providers = storage.getEnvironmentProviders(userId);
      const providersSheet = workbook.addWorksheet("Providers");
      providersSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Type", key: "type" },
        { header: "State", key: "state" },
        { header: "Unavailable Reason", key: "unavailableReason" },
        { header: "Created At", key: "createdAt" },
      ];
      providersSheet.addRows(providers);
      
      // Style the providers sheet
      providersSheet.getRow(1).font = { bold: true };
      providersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const conditions = storage.getEnvironmentConditions(userId);
      const conditionsSheet = workbook.addWorksheet("Conditions");
      conditionsSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Name", key: "name" },
        { header: "Description", key: "description" },
        { header: "State", key: "state" },
        { header: "Unavailable Reason", key: "unavailableReason" },
        { header: "Created At", key: "createdAt" },
      ];
      conditionsSheet.addRows(conditions);
      
      // Style the conditions sheet
      conditionsSheet.getRow(1).font = { bold: true };
      conditionsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Task Completions sheet
      const completionsSheet = workbook.addWorksheet("Task Completions");
      completionsSheet.columns = [
        { header: "ID", key: "id" },
        { header: "Series ID", key: "seriesId" },
        { header: "Original Date", key: "originalDate" },
        { header: "Agenda Task ID", key: "agendaTaskId" },
        { header: "Status", key: "status" },
        { header: "Rescheduled To", key: "rescheduledTo" },
        { header: "Completed At", key: "completedAt" },
      ];
      // Get all completions by querying with a wide date range
      const completions = storage.getCompletionsForRange(userId, "2000-01-01", "2100-12-31");
      completionsSheet.addRows(completions);
      
      // Style the completions sheet
      completionsSheet.getRow(1).font = { bold: true };
      completionsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `unpuzzle-life-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // RESET
  // ============================================================
  app.post("/api/reset", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      storage.resetDatabase(userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
