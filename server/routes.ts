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
  insertProjectEnvironmentSchema,
  insertResponsibilitySchema,
  insertRoleSchema,
  insertRolePeopleSchema,
} from "@shared/schema";

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
    res.json(storage.createResponsibility(userId, parsed.data));
  });
  app.patch("/api/responsibilities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateResponsibility(userId, Number(req.params.id), req.body);
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
    const data = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
    const parsed = insertRoleSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createRole(userId, parsed.data));
  });
  app.patch("/api/roles/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateRole(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/roles/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteRole(userId, Number(req.params.id));
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
