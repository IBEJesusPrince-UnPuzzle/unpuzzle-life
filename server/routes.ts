import type { Express } from "express";
import type { Server } from "http";
import { storage, sqlite } from "./storage";
import { requireAuth, requireAdmin, getEffectiveUserId } from "./auth";
import {
  insertProjectSchema,
  insertInboxItemSchema,
  insertWeeklyReviewSchema,
  insertEnvironmentPersonSchema,
  insertEnvironmentPlaceSchema,
  insertEnvironmentThingSchema,
  insertEnvironmentProviderSchema,
  insertEnvironmentConditionSchema,
  insertProjectEnvironmentSchema,
  insertResponsibilitySchema,
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
} from "@shared/schema";
import { validateRecurrenceRule } from "./recurrence";

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

  const startDate = body.date;
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
  const date = body.date;

  // Timed event: endDate must be null/undefined.
  if (isAllDay === 0 || isAllDay === false) {
    if (endDate !== undefined && endDate !== null && endDate !== "") {
      return "endDate must be null when isAllDay = 0";
    }
    return null;
  }

  // All-day event with explicit endDate: must be valid YYYY-MM-DD and >= date.
  if (endDate !== undefined && endDate !== null && endDate !== "") {
    if (typeof endDate !== "string" || !dateRe.test(endDate)) {
      return "endDate must be in YYYY-MM-DD format";
    }
    if (typeof date === "string" && dateRe.test(date) && endDate < date) {
      return "endDate must be >= date";
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
    res.json(storage.createProject(userId, parsed.data));
  });
  app.patch("/api/projects/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateProject(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/projects/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteProject(userId, Number(req.params.id));
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
    const { displayName, timeFormat, claritySkipRitual } = req.body;
    const data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean } = {};
    if (displayName !== undefined) data.displayName = String(displayName).slice(0, 50);
    if (timeFormat !== undefined && (timeFormat === "12h" || timeFormat === "24h")) data.timeFormat = timeFormat;
    if (claritySkipRitual !== undefined) data.claritySkipRitual = !!claritySkipRitual;
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
  app.delete("/api/environment/people/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentPerson(userId, Number(req.params.id));
    res.json({ ok: true });
  });

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
  app.delete("/api/environment/places/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentPlace(userId, Number(req.params.id));
    res.json({ ok: true });
  });

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
  app.delete("/api/environment/things/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentThing(userId, Number(req.params.id));
    res.json({ ok: true });
  });

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
  app.post("/api/responsibilities", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertResponsibilitySchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Duplicate-name guard (case-insensitive, trimmed) — mirrors role rule.
    const trimmed = (parsed.data.name ?? "").trim();
    if (!trimmed) return res.status(400).json({ error: "Responsibility name is required." });
    const existing = storage.getResponsibilities(userId);
    if (existing.some(r => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ error: `You already have a responsibility named '${trimmed}'.` });
    }
    res.json(storage.createResponsibility(userId, { ...parsed.data, name: trimmed }));
  });
  app.patch("/api/responsibilities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const id = Number(req.params.id);
    const patch: any = { ...(req.body ?? {}) };
    // PR #18d alignment: per Google's calendar-level pattern, edits at the
    // responsibility level (this endpoint) always cascade to every instance.
    // There is no scope concept here — that lives on agenda_tasks for
    // per-instance edits from Day view. Any `scope` field that leaks in
    // from a stale client is silently dropped; drizzle's .set() rejects
    // unknown columns, so we have to strip it before forwarding.
    if ("scope" in patch) delete patch.scope;
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
    const result = storage.updateResponsibility(userId, id, patch);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/responsibilities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteResponsibility(userId, Number(req.params.id));
    res.json({ ok: true });
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
  app.delete("/api/environment/providers/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentProvider(userId, Number(req.params.id));
    res.json({ ok: true });
  });

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
  app.delete("/api/environment/conditions/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentCondition(userId, Number(req.params.id));
    res.json({ ok: true });
  });

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
    const result = storage.updateResponsibilitySupportLink(type, Number(linkId), {
      relationshipType: req.body.relationshipType,
      importance: req.body.importance,
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/responsibilities/:respId/support/:type/:linkId", (req, res) => {
    const { type, linkId } = req.params;
    if (!isSupportType(type)) return res.status(400).json({ error: "Invalid support type" });
    storage.unlinkResponsibilitySupport(type, Number(linkId));
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
    res.json(result);
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
    if (body.recurrenceRule) {
      const err = validateRecurrenceRule(body.recurrenceRule);
      if (err) return res.status(400).json({ error: `recurrenceRule invalid: ${err}` });
    }
    // PATCH-time recurrence-end enforcement: only run when the patch
    // touches recurrenceRule (otherwise we'd reject patches that don't
    // care about recurrence). When rule is being SET, also require
    // recurrenceEndDate AND date in the body (caller's responsibility).
    if (body.recurrenceRule !== undefined) {
      // For the cap check we need start date. Pull from body, else fail
      // soft (storage will use the row's existing date — but the modal
      // always sends date alongside, so this branch is just safety).
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
    res.json(storage.getAgendaWindow(userId, from, to));
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
