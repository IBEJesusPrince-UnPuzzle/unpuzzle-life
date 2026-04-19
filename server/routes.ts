import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage, sqlite } from "./storage";
import { requireAuth, getEffectiveUserId } from "./auth";
import { exportWorkbook, importWorkbook, importSingleCsv, generateCsvTemplate, getSheetNames, getLeafTables } from "./xlsx-io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename_routes = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_routes = path.dirname(__filename_routes);
import {
  insertPurposeSchema,
  insertAreaSchema, insertProjectSchema,
  insertIdentitySchema,
  insertInboxItemSchema, insertWeeklyReviewSchema,
  insertRoutineItemSchema, insertRoutineLogSchema,
  insertPlannerTaskSchema, insertEnvironmentEntitySchema,
  insertBeliefSchema, insertAntiHabitSchema,
  insertImmutableLawSchema, insertImmutableLawLogSchema,
  // V2 schemas
  insertEnvironmentPersonSchema, insertEnvironmentPlaceSchema, insertEnvironmentThingSchema,
  insertProjectEnvironmentSchema, insertResponsibilitySchema,
  insertRoleSchema, insertRolePeopleSchema, insertNonNegotiableSchema,
} from "@shared/schema";

export function registerRoutes(server: Server, app: Express) {
  // Apply requireAuth to all /api/* routes EXCEPT auth endpoints
  // Auth endpoints are registered in auth.ts and handled before this middleware
  app.use("/api", (req, res, next) => {
    // Skip auth check for auth endpoints
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  // ============================================================
  // PURPOSES
  // ============================================================
  app.get("/api/purposes", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getPurposes(userId));
  });
  app.post("/api/purposes", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertPurposeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createPurpose(userId, parsed.data));
  });
  app.patch("/api/purposes/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updatePurpose(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/purposes/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deletePurpose(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // AREAS
  // ============================================================
  app.get("/api/areas", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getAreas(userId));
  });
  app.post("/api/areas", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertAreaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createArea(userId, parsed.data));
  });
  app.patch("/api/areas/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateArea(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/areas/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteArea(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // AREA VISION EDITING & SNAPSHOTS
  // ============================================================
  app.patch("/api/areas/:id/vision", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const id = Number(req.params.id);
      const { vision, note } = req.body;
      if (typeof vision !== "string") return res.status(400).json({ error: "vision is required" });

      const allAreas = storage.getAllAreasIncludingArchived(userId);
      const area = allAreas.find(a => a.id === id);
      if (!area) return res.status(404).json({ error: "Area not found" });

      if (area.visionText && area.visionText !== vision) {
        storage.createAreaVisionSnapshot(userId, {
          areaId: id,
          previousVision: area.visionText,
          note: note || null,
          changedAt: new Date().toISOString(),
        });
      }

      const updated = storage.updateArea(userId, id, { visionText: vision });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.get("/api/areas/:id/snapshots", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const snapshots = storage.getAreaVisionSnapshots(userId, Number(req.params.id));
      res.json(snapshots);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.get("/api/areas/:id/archive-preview", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const areaId = Number(req.params.id);
      const identityRows = sqlite.prepare("SELECT id, statement as name FROM identities WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId, userId) as any[];
      const projectRows = sqlite.prepare("SELECT id, title as name FROM projects WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId, userId) as any[];
      res.json({
        identities: identityRows,
        projects: projectRows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/areas/:id/archive", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const areaId = Number(req.params.id);
      const now = new Date().toISOString();

      storage.updateArea(userId, areaId, { archived: 1, archivedAt: now } as any);

      sqlite.prepare("UPDATE identities SET archived = 1, archived_at = ? WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId, userId);
      sqlite.prepare("UPDATE projects SET archived = 1, archived_at = ? WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId, userId);

      const identitiesArchived = sqlite.prepare("SELECT COUNT(*) as c FROM identities WHERE area_id = ? AND user_id = ? AND archived_at = ?").get(areaId, userId, now) as any;
      const projectsArchived = sqlite.prepare("SELECT COUNT(*) as c FROM projects WHERE area_id = ? AND user_id = ? AND archived_at = ?").get(areaId, userId, now) as any;

      res.json({
        success: true,
        archivedCounts: {
          identities: identitiesArchived?.c || 0,
          projects: projectsArchived?.c || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/areas/:id/duplicate-and-archive", (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const areaId = Number(req.params.id);
      const { newName } = req.body;
      if (!newName || typeof newName !== "string") return res.status(400).json({ error: "newName is required" });

      const allAreas = storage.getAllAreasIncludingArchived(userId);
      if (allAreas.some(a => a.name.toLowerCase() === newName.toLowerCase())) {
        return res.status(400).json({ error: "An area with this name already exists (or was previously used)." });
      }

      const originalArea = allAreas.find(a => a.id === areaId);
      if (!originalArea) return res.status(404).json({ error: "Area not found" });

      const activeAreas = storage.getAreas(userId);

      const newArea = storage.createArea(userId, {
        name: newName,
        puzzlePiece: originalArea.puzzlePiece,
        visionText: originalArea.visionText,
        icon: originalArea.icon,
        sortOrder: activeAreas.length,
        archived: 0,
      });

      const newAreaId = (newArea as any).id;
      sqlite.prepare("UPDATE identities SET area_id = ? WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId, userId);
      sqlite.prepare("UPDATE projects SET area_id = ? WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId, userId);

      const identitiesMoved = sqlite.prepare("SELECT COUNT(*) as c FROM identities WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId, userId) as any;
      const projectsMoved = sqlite.prepare("SELECT COUNT(*) as c FROM projects WHERE area_id = ? AND user_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId, userId) as any;

      const now = new Date().toISOString();
      storage.updateArea(userId, areaId, { archived: 1, archivedAt: now } as any);

      res.json({
        newArea,
        movedCounts: {
          identities: identitiesMoved?.c || 0,
          projects: projectsMoved?.c || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
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

  // Project detail
  app.get("/api/projects/:id/details", (req, res) => {
    const userId = getEffectiveUserId(req);
    const projectId = Number(req.params.id);
    const project = storage.getProjects(userId).find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: "Not found" });

    const references = storage.getInboxItems(userId).filter(
      i => i.processedAs === "reference" && i.referenceProjectId === projectId
    );
    const allAreas = storage.getAreas(userId);

    const identityId = (project as any).identityId;
    const identity = identityId ? storage.getIdentities(userId).find(i => i.id === identityId) : null;
    const environmentEntity = identity ? storage.getEnvironmentEntitiesByIdentity(userId, identity.id)[0] || null : null;

    res.json({
      project,
      references,
      areas: allAreas,
      identity: identity || null,
      environmentEntity: environmentEntity || null,
    });
  });

  // Identity-based project detail
  app.get("/api/identity-projects/:identityId", (req, res) => {
    const userId = getEffectiveUserId(req);
    const identityId = Number(req.params.identityId);
    const identity = storage.getIdentities(userId).find(i => i.id === identityId);
    if (!identity) return res.status(404).json({ error: "Identity not found" });

    const area = identity.areaId ? storage.getAreas(userId).find(a => a.id === identity.areaId) : null;
    const allAreas = storage.getAreas(userId);
    const allRoutineItems = storage.getRoutineItems(userId).filter(r => r.identityId === identityId);
    const allPlannerTasks = storage.getAllPlannerTasks(userId).filter(t => t.identityId === identityId);

    const title = identity.cue ? `${identity.statement} when ${identity.cue}` : identity.statement;
    const tag = area?.name || "";

    res.json({
      identityId: identity.id,
      identity,
      area,
      areas: allAreas,
      title,
      tag,
      routineItems: allRoutineItems,
      plannerTasks: allPlannerTasks,
    });
  });

  // Lightweight identity chain lookup
  app.get("/api/identity-chain/:identityId", (req, res) => {
    const userId = getEffectiveUserId(req);
    const identityId = Number(req.params.identityId);
    const identity = storage.getIdentities(userId).find(i => i.id === identityId);
    if (!identity) return res.status(404).json({ error: "Identity not found" });

    const area = identity.areaId ? storage.getAreas(userId).find(a => a.id === identity.areaId) : null;

    const projectTitle = identity.cue ? `${identity.statement} when ${identity.cue}` : identity.statement;
    const tag = area?.name || "";

    res.json({
      identityId: identity.id,
      identityStatement: identity.statement,
      cue: identity.cue || null,
      areaName: area?.name || null,
      projectTitle,
      tag,
    });
  });

  // Backfill: create routine items for identities that don't have one
  app.post("/api/backfill-routines", (req, res) => {
    const userId = getEffectiveUserId(req);
    const allIdentities = storage.getIdentities(userId);
    const allRoutineItems = storage.getRoutineItems(userId);
    const identityIdsWithRoutine = new Set(allRoutineItems.map(r => r.identityId));
    let created = 0;

    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00", morning: "07:00", late_morning: "10:00",
      afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
    };

    for (const identity of allIdentities) {
      if (!identity.active) continue;
      if (identityIdsWithRoutine.has(identity.id)) continue;

      const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
      storage.createRoutineItem(userId, {
        sortOrder: 0,
        time: placeholderTime,
        durationMinutes: 10,
        location: identity.location || "",
        cue: identity.cue || "",
        craving: identity.craving || "",
        response: identity.statement,
        reward: identity.reward || "",
        areaId: identity.areaId,
        identityId: identity.id,
        puzzlePiece: identity.puzzlePiece || "",
        dayVariant: "",
        active: 1,
        isDraft: 1,
        timeOfDay: identity.timeOfDay || "",
      });
      created++;
    }

    res.json({ created, message: `Created ${created} routine items for identities that were missing them.` });
  });

  // References
  app.get("/api/references", (req, res) => {
    const userId = getEffectiveUserId(req);
    const allInbox = storage.getInboxItems(userId);
    let refs = allInbox.filter(i => i.processedAs === "reference");
    if (req.query.projectId) {
      refs = refs.filter(r => r.referenceProjectId === Number(req.query.projectId));
    }
    res.json(refs);
  });

  // ============================================================
  // IDENTITIES
  // ============================================================
  app.get("/api/identities", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getIdentities(userId));
  });
  app.post("/api/identities", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertIdentitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const identity = storage.createIdentity(userId, parsed.data);

    const project = storage.createProject(userId, {
      title: identity.response || identity.statement,
      areaId: identity.areaId || null,
      puzzlePiece: identity.puzzlePiece || null,
      identityId: identity.id,
      createdAt: new Date().toISOString(),
    });

    let routineItem = null;
    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00", morning: "07:00", late_morning: "10:00",
      afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
    };
    const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
    routineItem = storage.createRoutineItem(userId, {
      sortOrder: 0,
      time: placeholderTime,
      durationMinutes: 10,
      location: identity.location || "",
      cue: identity.cue || "",
      craving: identity.craving || "",
      response: identity.response || identity.statement,
      reward: identity.reward || "",
      areaId: identity.areaId,
      identityId: identity.id,
      puzzlePiece: identity.puzzlePiece || "",
      dayVariant: "",
      active: 1,
      isDraft: 1,
      timeOfDay: identity.timeOfDay || "",
    });

    res.json({ identity, project, routineItem });
  });
  app.patch("/api/identities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const identityId = Number(req.params.id);
    const result = storage.updateIdentity(userId, identityId, req.body);
    if (!result) return res.status(404).json({ error: "Not found" });

    const allRoutineItems = storage.getRoutineItems(userId);
    const linkedItem = allRoutineItems.find(ri => ri.identityId === identityId);
    if (linkedItem) {
      const routineUpdate: Record<string, any> = {};
      if (req.body.statement !== undefined) routineUpdate.response = req.body.statement;
      if (req.body.craving !== undefined) routineUpdate.craving = req.body.craving;
      if (req.body.reward !== undefined) routineUpdate.reward = req.body.reward;
      if (req.body.areaId !== undefined) routineUpdate.areaId = req.body.areaId;
      if (req.body.cue !== undefined) routineUpdate.cue = req.body.cue;
      if (req.body.location !== undefined) routineUpdate.location = req.body.location;
      if (req.body.puzzlePiece !== undefined) routineUpdate.puzzlePiece = req.body.puzzlePiece;
      if (Object.keys(routineUpdate).length > 0) {
        storage.updateRoutineItem(userId, linkedItem.id, routineUpdate);
      }
    }

    const allProjects = storage.getProjects(userId);
    const linkedProject = allProjects.find(p => (p as any).identityId === identityId);
    if (linkedProject) {
      const projectUpdate: Record<string, any> = {};
      if (req.body.puzzlePiece !== undefined) projectUpdate.puzzlePiece = req.body.puzzlePiece;
      if (req.body.response !== undefined) projectUpdate.title = req.body.response;
      if (Object.keys(projectUpdate).length > 0) {
        storage.updateProject(userId, linkedProject.id, projectUpdate);
      }
    }

    res.json(result);
  });
  app.delete("/api/identities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteIdentity(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ENVIRONMENT ENTITIES
  // ============================================================
  app.get("/api/environment-entities", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentEntities(userId));
  });
  app.get("/api/environment-entities/identity/:identityId", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentEntitiesByIdentity(userId, Number(req.params.identityId)));
  });
  app.get("/api/environment-entities/area/:areaId", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getEnvironmentEntitiesByArea(userId, Number(req.params.areaId)));
  });
  app.get("/api/environment-entities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const all = storage.getEnvironmentEntities(userId);
    const entity = all.find(e => e.id === Number(req.params.id));
    if (!entity) return res.status(404).json({ error: "Not found" });
    res.json(entity);
  });
  app.post("/api/environment-entities", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertEnvironmentEntitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentEntity(userId, parsed.data));
  });
  app.patch("/api/environment-entities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateEnvironmentEntity(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/environment-entities/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteEnvironmentEntity(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // BELIEFS
  // ============================================================
  app.get("/api/beliefs", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getBeliefs(userId));
  });
  app.get("/api/beliefs/puzzle-piece/:piece", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getBeliefsByPuzzlePiece(userId, req.params.piece));
  });
  app.post("/api/beliefs", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertBeliefSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createBelief(userId, parsed.data));
  });
  app.patch("/api/beliefs/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateBelief(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/beliefs/:id/graduate", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateBelief(userId, Number(req.params.id), {
      graduated: 1,
      graduatedAt: new Date().toISOString(),
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/beliefs/:id/reviewed", (req, res) => {
    const userId = getEffectiveUserId(req);
    const all = storage.getBeliefs(userId);
    const belief = all.find(b => b.id === Number(req.params.id));
    if (!belief) return res.status(404).json({ error: "Not found" });
    const result = storage.updateBelief(userId, belief.id, {
      repetitionCount: belief.repetitionCount + 1,
    });
    res.json(result);
  });
  app.delete("/api/beliefs/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteBelief(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ANTI-HABITS
  // ============================================================
  app.get("/api/anti-habits", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getAntiHabits(userId));
  });
  app.get("/api/anti-habits/puzzle-piece/:piece", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getAntiHabitsByPuzzlePiece(userId, req.params.piece));
  });
  app.post("/api/anti-habits", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertAntiHabitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createAntiHabit(userId, parsed.data));
  });
  app.patch("/api/anti-habits/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateAntiHabit(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/anti-habits/:id/kept", (req, res) => {
    const userId = getEffectiveUserId(req);
    const all = storage.getAntiHabits(userId);
    const antiHabit = all.find(a => a.id === Number(req.params.id));
    if (!antiHabit) return res.status(404).json({ error: "Not found" });
    const newStreak = antiHabit.currentStreak + 1;
    const result = storage.updateAntiHabit(userId, antiHabit.id, {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, antiHabit.longestStreak),
    });
    res.json(result);
  });
  app.post("/api/anti-habits/:id/slip", (req, res) => {
    const userId = getEffectiveUserId(req);
    const all = storage.getAntiHabits(userId);
    const antiHabit = all.find(a => a.id === Number(req.params.id));
    if (!antiHabit) return res.status(404).json({ error: "Not found" });
    const result = storage.updateAntiHabit(userId, antiHabit.id, {
      currentStreak: 0,
      lastSlipDate: new Date().toISOString().split("T")[0],
    });
    res.json(result);
  });
  app.delete("/api/anti-habits/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteAntiHabit(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // IMMUTABLE LAWS
  // ============================================================
  app.get("/api/immutable-laws", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getImmutableLaws(userId));
  });
  app.get("/api/immutable-laws/puzzle-piece/:piece", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getImmutableLawsByPuzzlePiece(userId, req.params.piece));
  });
  app.post("/api/immutable-laws", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertImmutableLawSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createImmutableLaw(userId, parsed.data));
  });
  app.patch("/api/immutable-laws/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateImmutableLaw(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/immutable-laws/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteImmutableLaw(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // IMMUTABLE LAW LOGS
  // ============================================================
  app.get("/api/immutable-law-logs", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getImmutableLawLogs(userId));
  });
  app.get("/api/immutable-law-logs/law/:lawId", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getImmutableLawLogsByLaw(userId, Number(req.params.lawId)));
  });
  app.get("/api/immutable-law-logs/date/:date", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getImmutableLawLogsByDate(userId, req.params.date));
  });
  app.post("/api/immutable-law-logs", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertImmutableLawLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createImmutableLawLog(userId, parsed.data));
  });
  app.post("/api/immutable-law-logs/check-in", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { lawId, kept, triggerType, note, wasOverride, overrideReason } = req.body;
    if (lawId == null || kept == null) {
      return res.status(400).json({ error: "lawId and kept are required" });
    }
    const allLaws = storage.getImmutableLaws(userId);
    const law = allLaws.find(l => l.id === Number(lawId));
    if (!law) return res.status(404).json({ error: "Law not found" });

    const log = storage.createImmutableLawLog(userId, {
      immutableLawId: law.id,
      puzzlePiece: law.puzzlePiece,
      date: new Date().toISOString().split("T")[0],
      kept: kept ? 1 : 0,
      note: note || null,
      triggerType: triggerType || null,
      wasOverride: wasOverride ? 1 : 0,
      overrideReason: overrideReason || null,
      suggestedAntiHabitId: null,
      createdAt: new Date().toISOString(),
    });

    let antiHabitSuggestions: any[] = [];
    if (!kept && triggerType) {
      antiHabitSuggestions = storage.getAntiHabitsByPuzzlePiece(userId, law.puzzlePiece);
    }

    res.json({ log, antiHabitSuggestions });
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
  // ROUTINE ITEMS
  // ============================================================
  app.get("/api/routine-items", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getRoutineItems(userId));
  });
  app.patch("/api/routine-items/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updateRoutineItem(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/routine-items/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteRoutineItem(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ROUTINE LOGS
  // ============================================================
  app.get("/api/routine-logs", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { date } = req.query;
    if (date) {
      res.json(storage.getRoutineLogsByDate(userId, date as string));
    } else {
      res.json([]);
    }
  });
  app.post("/api/routine-logs", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertRoutineLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createRoutineLog(userId, parsed.data));
  });
  app.delete("/api/routine-logs/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteRoutineLog(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // PLANNER TASKS
  // ============================================================
  app.get("/api/planner-tasks/drafts", (req, res) => {
    const userId = getEffectiveUserId(req);
    res.json(storage.getDraftTasks(userId));
  });
  app.get("/api/planner-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { date, areaId, identityId } = req.query;
    if (date) {
      res.json(storage.getPlannerTasksByDate(userId, date as string));
    } else if (areaId) {
      res.json(storage.getPlannerTasksByArea(userId, Number(areaId)));
    } else if (identityId) {
      const all = storage.getAllPlannerTasks(userId);
      res.json(all.filter(t => t.identityId === Number(identityId)));
    } else {
      res.json(storage.getAllPlannerTasks(userId));
    }
  });
  app.post("/api/planner-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const parsed = insertPlannerTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createPlannerTask(userId, parsed.data));
  });

  // Generate recurring task instances
  app.post("/api/planner-tasks/generate-recurring", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate required" });
    const allTasks = storage.getAllPlannerTasks(userId);
    const templates = allTasks.filter(t => t.recurrence);
    let created = 0;
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

    function getNthWeekdayOfMonth(year: number, month: number, dayIndex: number, nth: number): number | null {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const dates: number[] = [];
      for (let d = first.getDate(); d <= last.getDate(); d++) {
        const test = new Date(year, month, d);
        if (test.getDay() === dayIndex) dates.push(d);
      }
      if (nth === 5) return dates[dates.length - 1] || null;
      return dates[nth - 1] || null;
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const dow = d.getDay();
      const dayName = DAY_NAMES[dow];
      const existingForDate = storage.getPlannerTasksByDate(userId, dateStr);

      for (const tpl of templates) {
        const rec = tpl.recurrence!;
        let matches = false;

        let pattern: any = null;
        try { pattern = JSON.parse(rec); } catch {}

        if (pattern && pattern.type) {
          const origDate = new Date(tpl.date + "T12:00:00");
          const daysDiff = Math.floor((d.getTime() - origDate.getTime()) / 86400000);

          if (pattern.type === "daily") {
            matches = daysDiff >= 0 && daysDiff % pattern.interval === 0;
          } else if (pattern.type === "weekly") {
            const weeksDiff = Math.floor(daysDiff / 7);
            const sameWeekCycle = daysDiff >= 0 && weeksDiff % pattern.interval === 0;
            const days: string[] = pattern.days || [];
            matches = sameWeekCycle && days.includes(dayName);
            if (pattern.interval > 1) {
              const origWeekStart = new Date(origDate);
              origWeekStart.setDate(origWeekStart.getDate() - origWeekStart.getDay());
              const curWeekStart = new Date(d);
              curWeekStart.setDate(curWeekStart.getDate() - curWeekStart.getDay());
              const weeksBetween = Math.round((curWeekStart.getTime() - origWeekStart.getTime()) / (7 * 86400000));
              matches = weeksBetween >= 0 && weeksBetween % pattern.interval === 0 && days.includes(dayName);
            }
          } else if (pattern.type === "monthly") {
            const monthsDiff = (d.getFullYear() - origDate.getFullYear()) * 12 + d.getMonth() - origDate.getMonth();
            const monthAligned = monthsDiff >= 0 && monthsDiff % (pattern.interval || 1) === 0;
            if (monthAligned) {
              if (pattern.weekOfMonth && pattern.dayOfWeek) {
                const targetDayIndex = DAY_NAMES.indexOf(pattern.dayOfWeek);
                const targetDate = getNthWeekdayOfMonth(d.getFullYear(), d.getMonth(), targetDayIndex, pattern.weekOfMonth);
                matches = targetDate === d.getDate();
              } else if (pattern.dayOfMonth) {
                matches = d.getDate() === pattern.dayOfMonth;
              }
            }
          }
        } else {
          if (rec === "daily") matches = true;
          else if (rec === "weekdays") matches = dow >= 1 && dow <= 5;
          else if (rec === "weekend") matches = dow === 0 || dow === 6;
          else if (rec.startsWith("weekly:")) matches = dayName === rec.split(":")[1];
          else if (rec === "monthly") {
            const origDay = parseInt(tpl.date.split("-")[2]);
            matches = d.getDate() === origDay;
          }
        }

        if (!matches) continue;
        const dup = existingForDate.find(e => e.task === tpl.task && e.areaId === tpl.areaId && e.identityId === tpl.identityId);
        if (dup) continue;
        storage.createPlannerTask(userId, {
          date: dateStr,
          areaId: tpl.areaId,
          task: tpl.task,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          hours: tpl.hours,
          status: "planned",
          recurrence: tpl.recurrence,
        });
        created++;
      }
    }
    res.json({ created });
  });
  app.patch("/api/planner-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const result = storage.updatePlannerTask(userId, Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/planner-tasks/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deletePlannerTask(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // Seed areas
  app.post("/api/areas/seed", (req, res) => {
    const userId = getEffectiveUserId(req);
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array" });
    const created = items.map((item: any) => {
      const parsed = insertAreaSchema.safeParse(item);
      if (!parsed.success) return null;
      return storage.createArea(userId, parsed.data);
    }).filter(Boolean);
    res.json({ created: created.length });
  });

  // ============================================================
  // WIZARD STATE
  // ============================================================
  app.get("/api/wizard-state", (req, res) => {
    const userId = getEffectiveUserId(req);
    let state = storage.getWizardState(userId);
    if (!state) {
      state = storage.upsertWizardState(userId, { currentPhase: 1, completed: 0 });
    }
    res.json(state);
  });
  app.patch("/api/wizard-state", (req, res) => {
    const userId = getEffectiveUserId(req);
    const state = storage.upsertWizardState(userId, req.body);
    res.json(state);
  });
  app.post("/api/wizard/complete", (req, res) => {
    const userId = getEffectiveUserId(req);
    const allIdentities = storage.getIdentities(userId);
    const allRoutineItems = storage.getRoutineItems(userId);
    const activeIdentities = allIdentities.filter(i => i.active && i.areaId);

    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00", morning: "07:00", late_morning: "10:00",
      afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
    };

    let created = 0;
    for (const identity of activeIdentities) {
      const existing = allRoutineItems.find(r => r.identityId === identity.id);
      if (existing) continue;

      const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
      storage.createRoutineItem(userId, {
        sortOrder: 0,
        time: placeholderTime,
        durationMinutes: 10,
        location: identity.location || "",
        cue: identity.cue || "",
        craving: identity.craving || "",
        response: identity.statement,
        reward: identity.reward || "",
        areaId: identity.areaId,
        identityId: identity.id,
        puzzlePiece: identity.puzzlePiece || "",
        dayVariant: "",
        active: 1,
        isDraft: 1,
        timeOfDay: identity.timeOfDay || "",
      });
      created++;
    }

    storage.upsertWizardState(userId, {
      completed: 1,
      completedAt: new Date().toISOString(),
    });

    res.json({ created });
  });

  // ============================================================
  // DASHBOARD STATS
  // ============================================================
  app.get("/api/stats", (req, res) => {
    try {
    const userId = getEffectiveUserId(req);
    let inboxCount = 0;
    try { inboxCount = storage.getInboxItems(userId).filter(i => !i.processed).length; } catch {}
    const allIdentities = storage.getIdentities(userId);
    const allRoutineItems = storage.getRoutineItems(userId);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);
    const activeIdentities = allIdentities.filter(i => i.active);

    const allPlannerTasks = storage.getAllPlannerTasks(userId);
    const missedTasksCount = allPlannerTasks.filter(t => {
      if (t.status !== "planned" || !t.endTime) return false;
      if (t.date < today) return true;
      if (t.date === today && t.endTime < currentHHMM) return true;
      return false;
    }).length;

    const pendingActionsCount = allRoutineItems.filter(r => r.isDraft === 1).length;

    const identitiesWithArea = allIdentities.filter(i => i.active && i.areaId != null);
    let identityDone = 0;
    let identityTotal = 0;
    for (const identity of identitiesWithArea) {
      const linkedRoutineItems = allRoutineItems.filter(r => r.identityId === identity.id);
      if (linkedRoutineItems.length === 0) continue;
      const linkedTasks = allPlannerTasks.filter(t => {
        if (t.identityId !== identity.id) return false;
        if (!t.endTime) return false;
        const isPast = t.date < today || (t.date === today && t.endTime < currentHHMM);
        return isPast && (t.status === "done" || t.status === "planned");
      });
      for (const t of linkedTasks) {
        identityTotal++;
        if (t.status === "done") identityDone++;
      }
    }
    const identityVotePercent = identityTotal > 0 ? Math.round((identityDone / identityTotal) * 100) : 0;

    res.json({
      activeProjects: allIdentities.filter(i => i.active && i.areaId != null).length,
      inboxCount,
      totalActiveIdentities: allRoutineItems.filter(r => r.active && r.isDraft !== 1).length,
      missedTasksCount,
      pendingActionsCount,
      identityVotePercent,
    });
    } catch (err: any) {
      console.error("Stats error:", err?.message || err);
      res.status(500).json({ message: err?.message || "Internal server error" });
    }
  });

  // ============================================================
  // COMBINED DASHBOARD DATA
  // ============================================================
  app.get("/api/dashboard-data", (req, res) => {
    try {
    const userId = getEffectiveUserId(req);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);

    let inboxCount = 0;
    try { inboxCount = storage.getInboxItems(userId).filter(i => !i.processed).length; } catch {}
    const allIdentities = storage.getIdentities(userId);
    const allRoutineItems = storage.getRoutineItems(userId);
    const allAreas = storage.getAreas(userId);
    const activeIdentities = allIdentities.filter(i => i.active);
    const allPlannerTasks = storage.getAllPlannerTasks(userId);

    // Generate recurring tasks for today
    const templates = allPlannerTasks.filter(t => t.recurrence);
    const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const d = new Date(today + "T12:00:00");
    const dow = d.getDay();
    const dayName = DAY_NAMES[dow];
    const existingForDate = storage.getPlannerTasksByDate(userId, today);

    const getNthWeekdayOfMonthDash = (year: number, month: number, dayIndex: number, nth: number): number | null => {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const dates: number[] = [];
      for (let dd = first.getDate(); dd <= last.getDate(); dd++) {
        const test = new Date(year, month, dd);
        if (test.getDay() === dayIndex) dates.push(dd);
      }
      if (nth === 5) return dates[dates.length - 1] || null;
      return dates[nth - 1] || null;
    }

    let recurringCreated = 0;
    for (const tpl of templates) {
      const rec = tpl.recurrence!;
      let matches = false;
      let pattern: any = null;
      try { pattern = JSON.parse(rec); } catch {}

      if (pattern && pattern.type) {
        const origDate = new Date(tpl.date + "T12:00:00");
        const daysDiff = Math.floor((d.getTime() - origDate.getTime()) / 86400000);
        if (pattern.type === "daily") {
          matches = daysDiff >= 0 && daysDiff % pattern.interval === 0;
        } else if (pattern.type === "weekly") {
          const days: string[] = pattern.days || [];
          if (pattern.interval > 1) {
            const origWeekStart = new Date(origDate);
            origWeekStart.setDate(origWeekStart.getDate() - origWeekStart.getDay());
            const curWeekStart = new Date(d);
            curWeekStart.setDate(curWeekStart.getDate() - curWeekStart.getDay());
            const weeksBetween = Math.round((curWeekStart.getTime() - origWeekStart.getTime()) / (7 * 86400000));
            matches = weeksBetween >= 0 && weeksBetween % pattern.interval === 0 && days.includes(dayName);
          } else {
            const weeksDiff = Math.floor(daysDiff / 7);
            matches = daysDiff >= 0 && weeksDiff % pattern.interval === 0 && days.includes(dayName);
          }
        } else if (pattern.type === "monthly") {
          const monthsDiff = (d.getFullYear() - origDate.getFullYear()) * 12 + d.getMonth() - origDate.getMonth();
          const monthAligned = monthsDiff >= 0 && monthsDiff % (pattern.interval || 1) === 0;
          if (monthAligned) {
            if (pattern.weekOfMonth && pattern.dayOfWeek) {
              const targetDayIndex = DAY_NAMES.indexOf(pattern.dayOfWeek);
              const targetDate = getNthWeekdayOfMonthDash(d.getFullYear(), d.getMonth(), targetDayIndex, pattern.weekOfMonth);
              matches = targetDate === d.getDate();
            } else if (pattern.dayOfMonth) {
              matches = d.getDate() === pattern.dayOfMonth;
            }
          }
        }
      } else {
        if (rec === "daily") matches = true;
        else if (rec === "weekdays") matches = dow >= 1 && dow <= 5;
        else if (rec === "weekend") matches = dow === 0 || dow === 6;
        else if (rec.startsWith("weekly:")) matches = dayName === rec.split(":")[1];
        else if (rec === "monthly") {
          const origDay = parseInt(tpl.date.split("-")[2]);
          matches = d.getDate() === origDay;
        }
      }
      if (!matches) continue;
      const dup = existingForDate.find(e => e.task === tpl.task && e.areaId === tpl.areaId && e.identityId === tpl.identityId);
      if (dup) continue;
      storage.createPlannerTask(userId, {
        date: today,
        areaId: tpl.areaId,
        task: tpl.task,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        hours: tpl.hours,
        status: "planned",
        recurrence: tpl.recurrence,
      });
      recurringCreated++;
    }

    // Stats computation
    const missedTasksCount = allPlannerTasks.filter(t => {
      if (t.status !== "planned" || !t.endTime) return false;
      if (t.date < today) return true;
      if (t.date === today && t.endTime < currentHHMM) return true;
      return false;
    }).length;
    const pendingActionsCount = allRoutineItems.filter(r => r.isDraft === 1).length;

    const identitiesWithArea = allIdentities.filter(i => i.active && i.areaId != null);
    let identityDone = 0;
    let identityTotal = 0;
    for (const identity of identitiesWithArea) {
      const linkedRoutineItems = allRoutineItems.filter(r => r.identityId === identity.id);
      if (linkedRoutineItems.length === 0) continue;
      const linkedTasks = allPlannerTasks.filter(t => {
        if (t.identityId !== identity.id) return false;
        if (!t.endTime) return false;
        const isPast = t.date < today || (t.date === today && t.endTime < currentHHMM);
        return isPast && (t.status === "done" || t.status === "planned");
      });
      for (const t of linkedTasks) {
        identityTotal++;
        if (t.status === "done") identityDone++;
      }
    }
    const identityVotePercent = identityTotal > 0 ? Math.round((identityDone / identityTotal) * 100) : 0;

    const todaysTasks = recurringCreated > 0 ? storage.getPlannerTasksByDate(userId, today) : existingForDate;
    const routineLogs = storage.getRoutineLogsByDate(userId, today);

    res.json({
      stats: {
        activeProjects: allIdentities.filter(i => i.active && i.areaId != null).length,
        inboxCount,
        totalActiveIdentities: allRoutineItems.filter(r => r.active && r.isDraft !== 1).length,
        missedTasksCount,
        pendingActionsCount,
        identityVotePercent,
      },
      areas: allAreas,
      todaysTasks,
      routineItems: allRoutineItems,
      routineLogs,
      recurringCreated,
    });
    } catch (err: any) {
      console.error("Dashboard data error:", err?.message || err);
      res.status(500).json({ message: err?.message || "Internal server error" });
    }
  });

  // ============================================================
  // IDENTITY VOTE DETAILS
  // ============================================================
  app.get("/api/identity-vote-details", (req, res) => {
    const userId = getEffectiveUserId(req);
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const allIdentities = storage.getIdentities(userId);
    const allRoutineItems = storage.getRoutineItems(userId);
    const allPlannerTasks = storage.getAllPlannerTasks(userId);
    const allAreas = storage.getAreas(userId);

    const activeIdentities = allIdentities.filter(i => i.active && i.areaId != null);

    const breakdown = activeIdentities.map(identity => {
      const area = allAreas.find(a => a.id === identity.areaId);
      const linkedRoutineItems = allRoutineItems.filter(r => r.identityId === identity.id);

      const pastTasks = allPlannerTasks.filter(t => {
        if (t.identityId !== identity.id) return false;
        if (!t.endTime) return false;
        const isPast = t.date < today || (t.date === today && t.endTime < currentHHMM);
        return isPast && (t.status === "done" || t.status === "planned");
      });

      const done = pastTasks.filter(t => t.status === "done").length;
      const total = pastTasks.length;

      const upcomingTasks = allPlannerTasks.filter(t => {
        if (t.identityId !== identity.id) return false;
        if (t.status === "done" || t.status === "skipped") return false;
        const isFuture = t.date > today || (t.date === today && (!t.endTime || t.endTime >= currentHHMM));
        return isFuture;
      });

      return {
        identityId: identity.id,
        identityStatement: identity.statement,
        cue: identity.cue || null,
        areaName: area?.name || null,
        hasRoutine: linkedRoutineItems.length > 0,
        done,
        total,
        percent: total > 0 ? Math.round((done / total) * 100) : null,
        upcomingTasks: upcomingTasks.map(t => ({
          id: t.id,
          task: t.task,
          date: t.date,
          startTime: t.startTime,
          endTime: t.endTime,
          status: t.status,
        })),
        pastTasks: pastTasks.slice(-5).map(t => ({
          id: t.id,
          task: t.task,
          date: t.date,
          status: t.status,
        })),
      };
    });

    const totalDone = breakdown.reduce((s, b) => s + b.done, 0);
    const totalAll = breakdown.reduce((s, b) => s + b.total, 0);
    const overallPercent = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

    const identitiesWithoutRoutine = activeIdentities.filter(i => {
      return !allRoutineItems.some(r => r.identityId === i.id);
    }).map(i => ({
      identityId: i.id,
      identityStatement: i.statement,
    }));

    res.json({
      overallPercent,
      totalDone,
      totalAll,
      breakdown,
      identitiesWithoutRoutine,
    });
  });

  // ============================================================
  // PENDING ACTIONS
  // ============================================================
  app.get("/api/pending-actions", (req, res) => {
    const userId = getEffectiveUserId(req);
    const allRoutineItems = storage.getRoutineItems(userId);
    const draftItems = allRoutineItems.filter(r => r.isDraft === 1);
    res.json(draftItems.map(r => ({
      type: "draft_routine",
      id: r.id,
      name: r.response,
      page: "/routine",
    })));
  });

  // ============================================================
  // MISSED TASKS
  // ============================================================
  app.get("/api/missed-tasks", (req, res) => {
    const userId = getEffectiveUserId(req);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);
    const allPlannerTasks = storage.getAllPlannerTasks(userId);
    const missed = allPlannerTasks.filter(t => {
      if (t.status !== "planned" || !t.endTime) return false;
      if (t.date < today) return true;
      if (t.date === today && t.endTime < currentHHMM) return true;
      return false;
    });
    res.json(missed);
  });

  // ============================================================
  // POSTPONE PLANNER TASK
  // ============================================================
  app.patch("/api/planner-tasks/:id/postpone", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { date, startTime, endTime } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: "date, startTime, and endTime are required" });
    }
    const result = storage.updatePlannerTask(userId, Number(req.params.id), {
      date,
      startTime,
      endTime,
      status: "planned",
    });
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
    const { displayName, timeFormat } = req.body;
    const data: { displayName?: string; timeFormat?: string } = {};
    if (displayName !== undefined) data.displayName = String(displayName).slice(0, 50);
    if (timeFormat !== undefined && (timeFormat === "12h" || timeFormat === "24h")) data.timeFormat = timeFormat;
    res.json(storage.updatePreferences(userId, data));
  });

  // ============================================================
  // V2: ENVIRONMENT PEOPLE
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
  // V2: ENVIRONMENT PLACES
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
  // V2: ENVIRONMENT THINGS
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
  // V2: PROJECT ENVIRONMENT (junction)
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
  // V2: RESPONSIBILITIES
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
  // V2: ROLES
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

  // V2: ROLE PEOPLE (junction)
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
  // V2: NON-NEGOTIABLES
  // ============================================================
  app.get("/api/non-negotiables", (req, res) => {
    const userId = getEffectiveUserId(req);
    const areaIdParam = req.query.areaId;
    if (areaIdParam !== undefined) {
      const areaId = areaIdParam === "null" || areaIdParam === "" ? null : Number(areaIdParam);
      return res.json(storage.getNonNegotiablesByArea(userId, areaId));
    }
    res.json(storage.getNonNegotiables(userId));
  });
  app.post("/api/non-negotiables", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = {
      ...req.body,
      createdAt: req.body.createdAt || new Date().toISOString(),
      updatedAt: req.body.updatedAt || new Date().toISOString(),
    };
    const parsed = insertNonNegotiableSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createNonNegotiable(userId, parsed.data));
  });
  app.patch("/api/non-negotiables/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    const data = { ...req.body, updatedAt: new Date().toISOString() };
    const result = storage.updateNonNegotiable(userId, Number(req.params.id), data);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/non-negotiables/:id", (req, res) => {
    const userId = getEffectiveUserId(req);
    storage.deleteNonNegotiable(userId, Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // V2: IDENTITY STATUS UPDATE
  // ============================================================
  app.patch("/api/identities/:id/status", (req, res) => {
    const userId = getEffectiveUserId(req);
    const { status } = req.body;
    if (!status || !["draft", "project", "routine"].includes(status)) {
      return res.status(400).json({ error: "status must be one of: draft, project, routine" });
    }
    const result = storage.updateIdentity(userId, Number(req.params.id), { status });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  // ============================================================
  // XLSX EXPORT / IMPORT (new workbook system)
  // ============================================================
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  // Export styled XLSX workbook
  app.get("/api/export/xlsx", async (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      const buf = await exportWorkbook(userId);
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Disposition", `attachment; filename="unpuzzle-life-export-${dateStr}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download blank template
  app.get("/api/export/template", (_req, res) => {
    const candidates = [
      path.join(process.cwd(), "server", "templates", "unpuzzle-life-template.xlsx"),
      path.join(process.cwd(), "dist", "templates", "unpuzzle-life-template.xlsx"),
      path.join(__dirname_routes, "templates", "unpuzzle-life-template.xlsx"),
      path.join(__dirname_routes, "..", "server", "templates", "unpuzzle-life-template.xlsx"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        res.setHeader("Content-Disposition", 'attachment; filename="unpuzzle-life-template.xlsx"');
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.sendFile(p);
      }
    }
    res.status(404).json({ error: "Template not found" });
  });

  // Download single-table CSV template
  app.get("/api/export/csv-template/:sheetName", (req, res) => {
    const sheetName = req.params.sheetName;
    const csv = generateCsvTemplate(sheetName);
    if (!csv) return res.status(404).json({ error: `Unknown table: ${sheetName}` });
    const safeName = sheetName.toLowerCase().replace(/\s+/g, "-");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-template.csv"`);
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  });

  // Full workbook import (XLSX)
  app.post("/api/import/xlsx", upload.single("file"), (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = importWorkbook(req.file.buffer, userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Single-table CSV import
  app.post("/api/import/csv", upload.single("file"), (req, res) => {
    try {
      const userId = getEffectiveUserId(req);
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const sheetName = req.body.sheetName;
      const mode = req.body.mode === "replace" ? "replace" : "add";
      if (!sheetName) return res.status(400).json({ error: "sheetName is required" });
      const result = importSingleCsv(req.file.buffer, sheetName, mode as "add" | "replace", userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get available sheet names and leaf tables
  app.get("/api/import/meta", (_req, res) => {
    res.json({ sheets: getSheetNames(), leafTables: getLeafTables() });
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
