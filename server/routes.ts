import type { Express } from "express";
import type { Server } from "http";
import { storage, sqlite } from "./storage";
import {
  insertPurposeSchema, insertVisionSchema, insertGoalSchema,
  insertAreaSchema, insertProjectSchema, insertActionSchema,
  insertIdentitySchema, insertHabitSchema, insertHabitLogSchema,
  insertInboxItemSchema, insertWeeklyReviewSchema,
  insertRoutineItemSchema, insertRoutineLogSchema,
  insertPlannerTaskSchema, insertEnvironmentEntitySchema,
  insertBeliefSchema, insertAntiHabitSchema,
  insertImmutableLawSchema, insertImmutableLawLogSchema,
} from "@shared/schema";

export function registerRoutes(server: Server, app: Express) {
  // ============================================================
  // PURPOSES
  // ============================================================
  app.get("/api/purposes", (_req, res) => {
    res.json(storage.getPurposes());
  });
  app.post("/api/purposes", (req, res) => {
    const parsed = insertPurposeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createPurpose(parsed.data));
  });
  app.patch("/api/purposes/:id", (req, res) => {
    const result = storage.updatePurpose(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/purposes/:id", (req, res) => {
    storage.deletePurpose(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // VISIONS
  // ============================================================
  app.get("/api/visions", (_req, res) => {
    res.json(storage.getVisions());
  });
  app.post("/api/visions", (req, res) => {
    const parsed = insertVisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createVision(parsed.data));
  });
  app.patch("/api/visions/:id", (req, res) => {
    const result = storage.updateVision(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/visions/:id", (req, res) => {
    storage.deleteVision(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // GOALS
  // ============================================================
  app.get("/api/goals", (_req, res) => {
    res.json(storage.getGoals());
  });
  app.post("/api/goals", (req, res) => {
    const parsed = insertGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createGoal(parsed.data));
  });
  app.patch("/api/goals/:id", (req, res) => {
    const result = storage.updateGoal(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/goals/:id", (req, res) => {
    storage.deleteGoal(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // AREAS
  // ============================================================
  app.get("/api/areas", (_req, res) => {
    res.json(storage.getAreas());
  });
  app.post("/api/areas", (req, res) => {
    const parsed = insertAreaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createArea(parsed.data));
  });
  app.patch("/api/areas/:id", (req, res) => {
    const result = storage.updateArea(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/areas/:id", (req, res) => {
    storage.deleteArea(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // AREA VISION EDITING & SNAPSHOTS
  // ============================================================
  app.patch("/api/areas/:id/vision", (req, res) => {
    try {
      const id = Number(req.params.id);
      const { vision, note } = req.body;
      if (typeof vision !== "string") return res.status(400).json({ error: "vision is required" });

      // Get current area
      const allAreas = storage.getAllAreasIncludingArchived();
      const area = allAreas.find(a => a.id === id);
      if (!area) return res.status(404).json({ error: "Area not found" });

      // Only create snapshot if vision actually changed
      if (area.visionText && area.visionText !== vision) {
        storage.createAreaVisionSnapshot({
          areaId: id,
          previousVision: area.visionText,
          note: note || null,
          changedAt: new Date().toISOString(),
        });
      }

      const updated = storage.updateArea(id, { visionText: vision });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.get("/api/areas/:id/snapshots", (req, res) => {
    try {
      const snapshots = storage.getAreaVisionSnapshots(Number(req.params.id));
      res.json(snapshots);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.get("/api/areas/:id/archive-preview", (req, res) => {
    try {
      const areaId = Number(req.params.id);
      // Use raw SQL to avoid schema mismatch on live DB
      const identityRows = sqlite.prepare("SELECT id, statement as name FROM identities WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId) as any[];
      const projectRows = sqlite.prepare("SELECT id, title as name FROM projects WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId) as any[];
      const habitRows = sqlite.prepare("SELECT id, name FROM habits WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId) as any[];
      const actionRows = sqlite.prepare("SELECT id, title as name FROM actions WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").all(areaId) as any[];
      res.json({
        identities: identityRows,
        projects: projectRows,
        habits: habitRows,
        tasks: actionRows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/areas/:id/archive", (req, res) => {
    try {
      const areaId = Number(req.params.id);
      const now = new Date().toISOString();

      // Archive the area
      storage.updateArea(areaId, { archived: 1, archivedAt: now } as any);

      // Archive linked items using raw SQL for safety
      sqlite.prepare("UPDATE identities SET archived = 1, archived_at = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId);
      sqlite.prepare("UPDATE projects SET archived = 1, archived_at = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId);
      sqlite.prepare("UPDATE habits SET archived = 1, archived_at = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId);
      sqlite.prepare("UPDATE actions SET archived = 1, archived_at = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(now, areaId);

      // Count what was archived
      const counts = {
        identities: (sqlite.prepare("SELECT changes() as c").get() as any)?.c || 0,
      };
      // Re-count properly
      const identitiesArchived = sqlite.prepare("SELECT COUNT(*) as c FROM identities WHERE area_id = ? AND archived_at = ?").get(areaId, now) as any;
      const projectsArchived = sqlite.prepare("SELECT COUNT(*) as c FROM projects WHERE area_id = ? AND archived_at = ?").get(areaId, now) as any;
      const habitsArchived = sqlite.prepare("SELECT COUNT(*) as c FROM habits WHERE area_id = ? AND archived_at = ?").get(areaId, now) as any;
      const tasksArchived = sqlite.prepare("SELECT COUNT(*) as c FROM actions WHERE area_id = ? AND archived_at = ?").get(areaId, now) as any;

      res.json({
        success: true,
        archivedCounts: {
          identities: identitiesArchived?.c || 0,
          projects: projectsArchived?.c || 0,
          habits: habitsArchived?.c || 0,
          tasks: tasksArchived?.c || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/areas/:id/duplicate-and-archive", (req, res) => {
    try {
      const areaId = Number(req.params.id);
      const { newName } = req.body;
      if (!newName || typeof newName !== "string") return res.status(400).json({ error: "newName is required" });

      // Check name collision with ALL areas (active + archived)
      const allAreas = storage.getAllAreasIncludingArchived();
      if (allAreas.some(a => a.name.toLowerCase() === newName.toLowerCase())) {
        return res.status(400).json({ error: "An area with this name already exists (or was previously used)." });
      }

      // Get original area
      const originalArea = allAreas.find(a => a.id === areaId);
      if (!originalArea) return res.status(404).json({ error: "Area not found" });

      const activeAreas = storage.getAreas();

      // Create new area with copied vision
      const newArea = storage.createArea({
        name: newName,
        description: originalArea.description,
        category: originalArea.category,
        puzzlePiece: originalArea.puzzlePiece,
        visionText: originalArea.visionText,
        icon: originalArea.icon,
        sortOrder: activeAreas.length,
        archived: 0,
      });

      // Move all linked items to the new area (re-point area_id)
      const newAreaId = (newArea as any).id;
      sqlite.prepare("UPDATE identities SET area_id = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId);
      sqlite.prepare("UPDATE projects SET area_id = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId);
      sqlite.prepare("UPDATE habits SET area_id = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId);
      sqlite.prepare("UPDATE actions SET area_id = ? WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").run(newAreaId, areaId);

      // Count what was moved
      const identitiesMoved = sqlite.prepare("SELECT COUNT(*) as c FROM identities WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId) as any;
      const projectsMoved = sqlite.prepare("SELECT COUNT(*) as c FROM projects WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId) as any;
      const habitsMoved = sqlite.prepare("SELECT COUNT(*) as c FROM habits WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId) as any;
      const tasksMoved = sqlite.prepare("SELECT COUNT(*) as c FROM actions WHERE area_id = ? AND (archived = 0 OR archived IS NULL)").get(newAreaId) as any;

      // Archive only the original area (linked items are now under the new area)
      const now = new Date().toISOString();
      storage.updateArea(areaId, { archived: 1, archivedAt: now } as any);

      res.json({
        newArea,
        movedCounts: {
          identities: identitiesMoved?.c || 0,
          projects: projectsMoved?.c || 0,
          habits: habitsMoved?.c || 0,
          tasks: tasksMoved?.c || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ============================================================
  // PROJECTS
  // ============================================================
  app.get("/api/projects", (_req, res) => {
    res.json(storage.getProjects());
  });
  app.post("/api/projects", (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createProject(parsed.data));
  });
  app.patch("/api/projects/:id", (req, res) => {
    const result = storage.updateProject(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/projects/:id", (req, res) => {
    storage.deleteProject(Number(req.params.id));
    res.json({ ok: true });
  });

  // Project detail: actions + references + related tasks + identity + environment entity
  app.get("/api/projects/:id/details", (req, res) => {
    const projectId = Number(req.params.id);
    const project = storage.getProjects().find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: "Not found" });

    const actions = storage.getActions().filter(a => a.projectId === projectId);
    const references = storage.getInboxItems().filter(
      i => i.processedAs === "reference" && i.referenceProjectId === projectId
    );
    const areas = storage.getAreas();

    // Include linked identity and environment entity if this project was auto-created from an identity
    const identityId = (project as any).identityId;
    const identity = identityId ? storage.getIdentities().find(i => i.id === identityId) : null;
    const environmentEntity = identity ? storage.getEnvironmentEntitiesByIdentity(identity.id)[0] || null : null;

    res.json({
      project,
      actions,
      references,
      areas,
      identity: identity || null,
      environmentEntity: environmentEntity || null,
    });
  });

  // Identity-based project detail: builds project view from identity chain
  app.get("/api/identity-projects/:identityId", (req, res) => {
    const identityId = Number(req.params.identityId);
    const identity = storage.getIdentities().find(i => i.id === identityId);
    if (!identity) return res.status(404).json({ error: "Identity not found" });

    const area = identity.areaId ? storage.getAreas().find(a => a.id === identity.areaId) : null;
    const areas = storage.getAreas();
    // habitId column on routineItems/plannerTasks now stores identityId
    const routineItems = storage.getRoutineItems().filter(r => r.habitId === identityId);
    const plannerTasks = storage.getAllPlannerTasks().filter(t => t.habitId === identityId);

    const title = identity.cue ? `${identity.statement} when ${identity.cue}` : identity.statement;
    const tag = area ? `${area.category || ""}.${area.name}` : "";

    res.json({
      identityId: identity.id,
      identity,
      area,
      areas,
      title,
      tag,
      routineItems,
      plannerTasks,
    });
  });

  // Lightweight identity chain lookup for project task badges in agenda
  app.get("/api/identity-chain/:identityId", (req, res) => {
    const identityId = Number(req.params.identityId);
    const identity = storage.getIdentities().find(i => i.id === identityId);
    if (!identity) return res.status(404).json({ error: "Identity not found" });

    const area = identity.areaId ? storage.getAreas().find(a => a.id === identity.areaId) : null;

    const projectTitle = identity.cue ? `${identity.statement} when ${identity.cue}` : identity.statement;
    const tag = area ? `${area.category || ""}.${area.name}` : "";

    res.json({
      identityId: identity.id,
      identityStatement: identity.statement,
      cue: identity.cue || null,
      areaName: area?.name || null,
      areaCategory: area?.category || null,
      projectTitle,
      tag,
    });
  });

  // One-time migration: copy habit fields to linked identities, update FK references
  app.post("/api/migrate-habits-to-identities", (_req, res) => {
    const allHabits = storage.getHabits();
    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const allPlannerTasks = storage.getAllPlannerTasks();
    let migratedIdentities = 0;
    let migratedRoutineItems = 0;
    let migratedPlannerTasks = 0;

    for (const habit of allHabits) {
      if (!habit.identityId) continue;
      const identity = allIdentities.find(i => i.id === habit.identityId);
      if (!identity) continue;

      // Copy habit fields to identity
      storage.updateIdentity(identity.id, {
        cue: habit.cue || identity.cue || null,
        craving: habit.craving || identity.craving || null,
        reward: habit.reward || identity.reward || null,
        frequency: habit.frequency || identity.frequency,
        targetCount: habit.targetCount ?? identity.targetCount,
        active: habit.active ?? identity.active,
        timeOfDay: habit.timeOfDay || identity.timeOfDay || null,
        areaId: habit.areaId || identity.areaId || null,
      });
      migratedIdentities++;

      // Update routineItems: habitId was habit.id, now should be identity.id
      for (const ri of allRoutineItems) {
        if (ri.habitId === habit.id) {
          storage.updateRoutineItem(ri.id, { habitId: habit.identityId });
          migratedRoutineItems++;
        }
      }

      // Update plannerTasks: habitId was habit.id, now should be identity.id
      for (const pt of allPlannerTasks) {
        if (pt.habitId === habit.id) {
          storage.updatePlannerTask(pt.id, { habitId: habit.identityId });
          migratedPlannerTasks++;
        }
      }
    }

    res.json({ migratedIdentities, migratedRoutineItems, migratedPlannerTasks });
  });

  // Backfill: create routine items for identities that don't have one
  app.post("/api/backfill-routines", (_req, res) => {
    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const identityIdsWithRoutine = new Set(allRoutineItems.map(r => r.habitId));
    let created = 0;

    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00", morning: "07:00", late_morning: "10:00",
      afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
    };

    for (const identity of allIdentities) {
      if (!identity.active) continue;
      if (identityIdsWithRoutine.has(identity.id)) continue;

      const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
      storage.createRoutineItem({
        sortOrder: 0,
        time: placeholderTime,
        durationMinutes: 10,
        location: null,
        cue: identity.cue || null,
        craving: identity.craving || null,
        response: identity.statement,
        reward: identity.reward || null,
        areaId: identity.areaId || null,
        habitId: identity.id,
        dayVariant: null,
        active: 1,
        isDraft: 1,
        timeOfDay: identity.timeOfDay || null,
      });
      created++;
    }

    res.json({ created, message: `Created ${created} routine items for identities that were missing them.` });
  });

  // References: all filed references, optionally filtered by area or project
  app.get("/api/references", (req, res) => {
    const allInbox = storage.getInboxItems();
    let refs = allInbox.filter(i => i.processedAs === "reference");
    if (req.query.areaId) {
      refs = refs.filter(r => r.referenceAreaId === Number(req.query.areaId));
    }
    if (req.query.projectId) {
      refs = refs.filter(r => r.referenceProjectId === Number(req.query.projectId));
    }
    res.json(refs);
  });

  // ============================================================
  // ACTIONS
  // ============================================================
  app.get("/api/actions", (_req, res) => {
    res.json(storage.getActions());
  });
  app.post("/api/actions", (req, res) => {
    const parsed = insertActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createAction(parsed.data));
  });
  app.patch("/api/actions/:id", (req, res) => {
    const result = storage.updateAction(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/actions/:id", (req, res) => {
    storage.deleteAction(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // IDENTITIES
  // ============================================================
  app.get("/api/identities", (_req, res) => {
    res.json(storage.getIdentities());
  });
  app.post("/api/identities", (req, res) => {
    const parsed = insertIdentitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const identity = storage.createIdentity(parsed.data);

    // Auto-create a Project linked to the identity
    const project = storage.createProject({
      title: identity.response || identity.statement,
      areaId: identity.areaId || null,
      puzzlePiece: identity.puzzlePiece || null,
      identityId: identity.id,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // Create a draft routine item linked to the project (habitId stores identityId for legacy compat)
    let routineItem = null;
    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00", morning: "07:00", late_morning: "10:00",
      afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
    };
    const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
    routineItem = storage.createRoutineItem({
      sortOrder: 0,
      time: placeholderTime,
      durationMinutes: 10,
      location: identity.location || null,
      cue: identity.cue || null,
      craving: identity.craving || null,
      response: identity.response || identity.statement,
      reward: identity.reward || null,
      areaId: identity.areaId || null,
      habitId: identity.id, // habitId column stores identityId
      dayVariant: null,
      active: 1,
      isDraft: 1,
      timeOfDay: identity.timeOfDay || null,
    });

    // If identity has environmentType set, auto-create an environmentEntity
    if (identity.environmentType) {
      storage.createEnvironmentEntity({
        identityId: identity.id,
        areaId: identity.areaId || null,
        puzzlePiece: identity.puzzlePiece || null,
        type: identity.environmentType,
        personName: identity.envPersonName || null,
        personContactMethod: identity.envPersonContactMethod || null,
        personContactInfo: identity.envPersonContactInfo || null,
        personWhy: identity.envPersonWhy || null,
        placeName: identity.envPlaceName || null,
        placeAddress: identity.envPlaceAddress || null,
        placeTravelMethod: identity.envPlaceTravelMethod || null,
        placeWhy: identity.envPlaceWhy || null,
        thingName: identity.envThingName || null,
        thingUsage: identity.envThingUsage || null,
        thingWhy: identity.envThingWhy || null,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ identity, project, routineItem });
  });
  app.patch("/api/identities/:id", (req, res) => {
    const identityId = Number(req.params.id);
    const result = storage.updateIdentity(identityId, req.body);
    if (!result) return res.status(404).json({ error: "Not found" });

    // Sync linked routine item — propagate changes
    const allRoutineItems = storage.getRoutineItems();
    const linkedItem = allRoutineItems.find(ri => ri.habitId === identityId);
    if (linkedItem) {
      const routineUpdate: Record<string, any> = {};
      if (req.body.statement !== undefined) routineUpdate.response = req.body.statement;
      if (req.body.craving !== undefined) routineUpdate.craving = req.body.craving;
      if (req.body.reward !== undefined) routineUpdate.reward = req.body.reward;
      if (req.body.areaId !== undefined) routineUpdate.areaId = req.body.areaId;
      if (req.body.cue !== undefined) routineUpdate.cue = req.body.cue;
      if (req.body.location !== undefined) routineUpdate.location = req.body.location;
      if (Object.keys(routineUpdate).length > 0) {
        storage.updateRoutineItem(linkedItem.id, routineUpdate);
      }
    }

    // Sync linked project — propagate puzzlePiece and response changes
    const allProjects = storage.getProjects();
    const linkedProject = allProjects.find(p => (p as any).identityId === identityId);
    if (linkedProject) {
      const projectUpdate: Record<string, any> = {};
      if (req.body.puzzlePiece !== undefined) projectUpdate.puzzlePiece = req.body.puzzlePiece;
      if (req.body.response !== undefined) projectUpdate.title = req.body.response;
      if (Object.keys(projectUpdate).length > 0) {
        storage.updateProject(linkedProject.id, projectUpdate);
      }
    }

    res.json(result);
  });
  app.delete("/api/identities/:id", (req, res) => {
    storage.deleteIdentity(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ENVIRONMENT ENTITIES
  // ============================================================
  app.get("/api/environment-entities", (_req, res) => {
    res.json(storage.getEnvironmentEntities());
  });
  app.get("/api/environment-entities/identity/:identityId", (req, res) => {
    res.json(storage.getEnvironmentEntitiesByIdentity(Number(req.params.identityId)));
  });
  app.get("/api/environment-entities/area/:areaId", (req, res) => {
    res.json(storage.getEnvironmentEntitiesByArea(Number(req.params.areaId)));
  });
  app.get("/api/environment-entities/:id", (req, res) => {
    const all = storage.getEnvironmentEntities();
    const entity = all.find(e => e.id === Number(req.params.id));
    if (!entity) return res.status(404).json({ error: "Not found" });
    res.json(entity);
  });
  app.post("/api/environment-entities", (req, res) => {
    const parsed = insertEnvironmentEntitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createEnvironmentEntity(parsed.data));
  });
  app.patch("/api/environment-entities/:id", (req, res) => {
    const result = storage.updateEnvironmentEntity(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/environment-entities/:id", (req, res) => {
    storage.deleteEnvironmentEntity(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // BELIEFS
  // ============================================================
  app.get("/api/beliefs", (_req, res) => {
    res.json(storage.getBeliefs());
  });
  app.get("/api/beliefs/puzzle-piece/:piece", (req, res) => {
    res.json(storage.getBeliefsByPuzzlePiece(req.params.piece));
  });
  app.post("/api/beliefs", (req, res) => {
    const parsed = insertBeliefSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createBelief(parsed.data));
  });
  app.patch("/api/beliefs/:id", (req, res) => {
    const result = storage.updateBelief(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/beliefs/:id/graduate", (req, res) => {
    const result = storage.updateBelief(Number(req.params.id), {
      graduated: 1,
      graduatedAt: new Date().toISOString(),
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/beliefs/:id/reviewed", (req, res) => {
    const all = storage.getBeliefs();
    const belief = all.find(b => b.id === Number(req.params.id));
    if (!belief) return res.status(404).json({ error: "Not found" });
    const result = storage.updateBelief(belief.id, {
      repetitionCount: belief.repetitionCount + 1,
    });
    res.json(result);
  });
  app.delete("/api/beliefs/:id", (req, res) => {
    storage.deleteBelief(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ANTI-HABITS
  // ============================================================
  app.get("/api/anti-habits", (_req, res) => {
    res.json(storage.getAntiHabits());
  });
  app.get("/api/anti-habits/puzzle-piece/:piece", (req, res) => {
    res.json(storage.getAntiHabitsByPuzzlePiece(req.params.piece));
  });
  app.post("/api/anti-habits", (req, res) => {
    const parsed = insertAntiHabitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createAntiHabit(parsed.data));
  });
  app.patch("/api/anti-habits/:id", (req, res) => {
    const result = storage.updateAntiHabit(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/anti-habits/:id/kept", (req, res) => {
    const all = storage.getAntiHabits();
    const antiHabit = all.find(a => a.id === Number(req.params.id));
    if (!antiHabit) return res.status(404).json({ error: "Not found" });
    const newStreak = antiHabit.currentStreak + 1;
    const result = storage.updateAntiHabit(antiHabit.id, {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, antiHabit.longestStreak),
    });
    res.json(result);
  });
  app.post("/api/anti-habits/:id/slip", (req, res) => {
    const all = storage.getAntiHabits();
    const antiHabit = all.find(a => a.id === Number(req.params.id));
    if (!antiHabit) return res.status(404).json({ error: "Not found" });
    const result = storage.updateAntiHabit(antiHabit.id, {
      currentStreak: 0,
      lastSlipDate: new Date().toISOString().split("T")[0],
    });
    res.json(result);
  });
  app.delete("/api/anti-habits/:id", (req, res) => {
    storage.deleteAntiHabit(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // IMMUTABLE LAWS
  // ============================================================
  app.get("/api/immutable-laws", (_req, res) => {
    res.json(storage.getImmutableLaws());
  });
  app.get("/api/immutable-laws/puzzle-piece/:piece", (req, res) => {
    res.json(storage.getImmutableLawsByPuzzlePiece(req.params.piece));
  });
  app.post("/api/immutable-laws", (req, res) => {
    const parsed = insertImmutableLawSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createImmutableLaw(parsed.data));
  });
  app.patch("/api/immutable-laws/:id", (req, res) => {
    const result = storage.updateImmutableLaw(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/immutable-laws/:id", (req, res) => {
    storage.deleteImmutableLaw(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // IMMUTABLE LAW LOGS
  // ============================================================
  app.get("/api/immutable-law-logs", (_req, res) => {
    res.json(storage.getImmutableLawLogs());
  });
  app.get("/api/immutable-law-logs/law/:lawId", (req, res) => {
    res.json(storage.getImmutableLawLogsByLaw(Number(req.params.lawId)));
  });
  app.get("/api/immutable-law-logs/date/:date", (req, res) => {
    res.json(storage.getImmutableLawLogsByDate(req.params.date));
  });
  app.post("/api/immutable-law-logs", (req, res) => {
    const parsed = insertImmutableLawLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createImmutableLawLog(parsed.data));
  });
  app.post("/api/immutable-law-logs/check-in", (req, res) => {
    const { lawId, kept, triggerType, note, wasOverride, overrideReason } = req.body;
    if (lawId == null || kept == null) {
      return res.status(400).json({ error: "lawId and kept are required" });
    }
    // Look up the law to get its puzzlePiece
    const allLaws = storage.getImmutableLaws();
    const law = allLaws.find(l => l.id === Number(lawId));
    if (!law) return res.status(404).json({ error: "Law not found" });

    const log = storage.createImmutableLawLog({
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

    // If broken and triggerType provided, suggest anti-habits for the same puzzle piece
    let antiHabitSuggestions: any[] = [];
    if (!kept && triggerType) {
      antiHabitSuggestions = storage.getAntiHabitsByPuzzlePiece(law.puzzlePiece);
    }

    res.json({ log, antiHabitSuggestions });
  });

  // ============================================================
  // HABITS
  // ============================================================
  app.get("/api/habits", (_req, res) => {
    res.json(storage.getHabits());
  });
  app.post("/api/habits", (req, res) => {
    const parsed = insertHabitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const habit = storage.createHabit(parsed.data);

    // Create a draft routine item linked to this habit
    // Map timeOfDay to a default placeholder time for grouping
    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00",
      morning: "07:00",
      late_morning: "10:00",
      afternoon: "13:00",
      late_afternoon: "16:00",
      evening: "20:00",
      waking_hours: "12:00",
    };
    const placeholderTime = timeOfDayMap[habit.timeOfDay || ""] || "12:00";

    storage.createRoutineItem({
      sortOrder: 0,
      time: placeholderTime,
      durationMinutes: 10,
      location: null,
      cue: null,
      craving: habit.craving || null,
      response: habit.name,
      reward: habit.reward || null,
      areaId: habit.areaId || null,
      habitId: habit.id,
      dayVariant: null,
      active: 1,
      isDraft: 1,
      timeOfDay: habit.timeOfDay || null,
    });

    res.json(habit);
  });
  app.patch("/api/habits/:id", (req, res) => {
    const habitId = Number(req.params.id);
    const result = storage.updateHabit(habitId, req.body);
    if (!result) return res.status(404).json({ error: "Not found" });

    // Sync linked routine item — propagate name/craving/reward changes
    const allRoutineItems = storage.getRoutineItems();
    const linkedItem = allRoutineItems.find(ri => ri.habitId === habitId);
    if (linkedItem) {
      const routineUpdate: Record<string, any> = {};
      if (req.body.name !== undefined) routineUpdate.response = req.body.name;
      if (req.body.craving !== undefined) routineUpdate.craving = req.body.craving;
      if (req.body.reward !== undefined) routineUpdate.reward = req.body.reward;
      if (req.body.areaId !== undefined) routineUpdate.areaId = req.body.areaId;
      if (Object.keys(routineUpdate).length > 0) {
        storage.updateRoutineItem(linkedItem.id, routineUpdate);
      }
    }

    res.json(result);
  });
  app.delete("/api/habits/:id", (req, res) => {
    storage.deleteHabit(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // HABIT LOGS
  // ============================================================
  app.get("/api/habit-logs", (req, res) => {
    const { date, habitId } = req.query;
    if (date) {
      res.json(storage.getHabitLogsByDate(date as string));
    } else if (habitId) {
      res.json(storage.getHabitLogs(Number(habitId)));
    } else {
      res.json([]);
    }
  });
  app.post("/api/habit-logs", (req, res) => {
    const parsed = insertHabitLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createHabitLog(parsed.data));
  });
  app.delete("/api/habit-logs/:id", (req, res) => {
    storage.deleteHabitLog(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // INBOX
  // ============================================================
  app.get("/api/inbox", (_req, res) => {
    res.json(storage.getInboxItems());
  });
  app.get("/api/inbox/trashed", (_req, res) => {
    res.json(storage.getTrashedInboxItems());
  });
  app.post("/api/inbox", (req, res) => {
    const parsed = insertInboxItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createInboxItem(parsed.data));
  });
  app.patch("/api/inbox/:id", (req, res) => {
    const result = storage.updateInboxItem(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/inbox/:id/soft-delete", (req, res) => {
    const result = storage.softDeleteInboxItem(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.post("/api/inbox/:id/restore", (req, res) => {
    const result = storage.restoreInboxItem(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/inbox/:id", (req, res) => {
    storage.deleteInboxItem(Number(req.params.id));
    res.json({ ok: true });
  });

  // Someday/Maybe project (auto-create)
  app.get("/api/someday-project", (_req, res) => {
    res.json(storage.getOrCreateSomedayProject());
  });

  // ============================================================
  // WEEKLY REVIEWS
  // ============================================================
  app.get("/api/weekly-reviews", (_req, res) => {
    res.json(storage.getWeeklyReviews());
  });
  app.post("/api/weekly-reviews", (req, res) => {
    const parsed = insertWeeklyReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createWeeklyReview(parsed.data));
  });
  app.patch("/api/weekly-reviews/:id", (req, res) => {
    const result = storage.updateWeeklyReview(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  // ============================================================
  // ROUTINE ITEMS
  // ============================================================
  app.get("/api/routine-items", (_req, res) => {
    res.json(storage.getRoutineItems());
  });
  app.post("/api/routine-items", (req, res) => {
    const parsed = insertRoutineItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createRoutineItem(parsed.data));
  });
  app.patch("/api/routine-items/:id", (req, res) => {
    const result = storage.updateRoutineItem(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/routine-items/:id", (req, res) => {
    storage.deleteRoutineItem(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============================================================
  // ROUTINE LOGS
  // ============================================================
  app.get("/api/routine-logs", (req, res) => {
    const { date } = req.query;
    if (date) {
      res.json(storage.getRoutineLogsByDate(date as string));
    } else {
      res.json([]);
    }
  });
  app.post("/api/routine-logs", (req, res) => {
    const parsed = insertRoutineLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createRoutineLog(parsed.data));
  });
  app.delete("/api/routine-logs/:id", (req, res) => {
    storage.deleteRoutineLog(Number(req.params.id));
    res.json({ ok: true });
  });

  // Seed routine from JSON file
  app.post("/api/routine-items/seed", (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array" });
    const created = items.map((item: any) => {
      const parsed = insertRoutineItemSchema.safeParse(item);
      if (!parsed.success) return null;
      return storage.createRoutineItem(parsed.data);
    }).filter(Boolean);
    res.json({ created: created.length });
  });

  // ============================================================
  // PLANNER TASKS
  // ============================================================
  app.get("/api/planner-tasks/drafts", (_req, res) => {
    res.json(storage.getDraftTasks());
  });
  app.get("/api/planner-tasks", (req, res) => {
    const { date, areaId, habitId, sourceType } = req.query;
    if (date) {
      res.json(storage.getPlannerTasksByDate(date as string));
    } else if (areaId) {
      res.json(storage.getPlannerTasksByArea(Number(areaId)));
    } else if (habitId && sourceType) {
      const all = storage.getAllPlannerTasks();
      res.json(all.filter(t => t.habitId === Number(habitId) && t.sourceType === sourceType));
    } else if (habitId) {
      const all = storage.getAllPlannerTasks();
      res.json(all.filter(t => t.habitId === Number(habitId)));
    } else {
      res.json(storage.getAllPlannerTasks());
    }
  });
  app.post("/api/planner-tasks", (req, res) => {
    const parsed = insertPlannerTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(storage.createPlannerTask(parsed.data));
  });

  // Generate recurring task instances for a date range
  app.post("/api/planner-tasks/generate-recurring", (req, res) => {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate required" });
    const allTasks = storage.getAllPlannerTasks();
    const templates = allTasks.filter(t => t.recurrence);
    let created = 0;
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

    // Helper: get the Nth weekday occurrence in a month (1-based, 5=last)
    function getNthWeekdayOfMonth(year: number, month: number, dayIndex: number, nth: number): number | null {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const dates: number[] = [];
      for (let d = first.getDate(); d <= last.getDate(); d++) {
        const test = new Date(year, month, d);
        if (test.getDay() === dayIndex) dates.push(d);
      }
      if (nth === 5) return dates[dates.length - 1] || null; // Last
      return dates[nth - 1] || null;
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const dow = d.getDay();
      const dayName = DAY_NAMES[dow];
      const existingForDate = storage.getPlannerTasksByDate(dateStr);

      for (const tpl of templates) {
        const rec = tpl.recurrence!;
        let matches = false;

        // Try parsing as JSON pattern first
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
            // For interval > 1 we need to check if this week aligns
            if (pattern.interval > 1) {
              // Calculate week offset from original date
              const origWeekStart = new Date(origDate);
              origWeekStart.setDate(origWeekStart.getDate() - origWeekStart.getDay());
              const curWeekStart = new Date(d);
              curWeekStart.setDate(curWeekStart.getDate() - curWeekStart.getDay());
              const weeksBetween = Math.round((curWeekStart.getTime() - origWeekStart.getTime()) / (7 * 86400000));
              matches = weeksBetween >= 0 && weeksBetween % pattern.interval === 0 && days.includes(dayName);
            }
          } else if (pattern.type === "monthly") {
            // Check if this month aligns with interval
            const monthsDiff = (d.getFullYear() - origDate.getFullYear()) * 12 + d.getMonth() - origDate.getMonth();
            const monthAligned = monthsDiff >= 0 && monthsDiff % (pattern.interval || 1) === 0;
            if (monthAligned) {
              if (pattern.weekOfMonth && pattern.dayOfWeek) {
                // "3rd Friday" style
                const targetDayIndex = DAY_NAMES.indexOf(pattern.dayOfWeek);
                const targetDate = getNthWeekdayOfMonth(d.getFullYear(), d.getMonth(), targetDayIndex, pattern.weekOfMonth);
                matches = targetDate === d.getDate();
              } else if (pattern.dayOfMonth) {
                matches = d.getDate() === pattern.dayOfMonth;
              }
            }
          }
        } else {
          // Legacy string formats
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
        const dup = existingForDate.find(e => e.goal === tpl.goal && e.areaId === tpl.areaId && e.habitId === tpl.habitId);
        if (dup) continue;
        storage.createPlannerTask({
          date: dateStr,
          areaId: tpl.areaId,
          goal: tpl.goal,
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
    const result = storage.updatePlannerTask(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/planner-tasks/:id", (req, res) => {
    storage.deletePlannerTask(Number(req.params.id));
    res.json({ ok: true });
  });

  // Seed areas from DPT
  app.post("/api/areas/seed", (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array" });
    const created = items.map((item: any) => {
      const parsed = insertAreaSchema.safeParse(item);
      if (!parsed.success) return null;
      return storage.createArea(parsed.data);
    }).filter(Boolean);
    res.json({ created: created.length });
  });

  // ============================================================
  // WIZARD STATE
  // ============================================================
  app.get("/api/wizard-state", (_req, res) => {
    let state = storage.getWizardState();
    if (!state) {
      state = storage.upsertWizardState({ currentPhase: 1, completed: 0 });
    }
    res.json(state);
  });
  app.patch("/api/wizard-state", (req, res) => {
    const state = storage.upsertWizardState(req.body);
    res.json(state);
  });
  app.post("/api/wizard/complete", (_req, res) => {
    // For every active identity with areaId, create a draft routine_item
    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const activeIdentities = allIdentities.filter(i => i.active && i.areaId);

    const timeOfDayMap: Record<string, string> = {
      early_morning: "03:00",
      morning: "07:00",
      late_morning: "10:00",
      afternoon: "13:00",
      late_afternoon: "16:00",
      evening: "20:00",
      waking_hours: "12:00",
    };

    let created = 0;
    for (const identity of activeIdentities) {
      // Skip if already has a linked routine item (habitId column stores identityId)
      const existing = allRoutineItems.find(r => r.habitId === identity.id);
      if (existing) continue;

      const placeholderTime = timeOfDayMap[identity.timeOfDay || ""] || "12:00";
      storage.createRoutineItem({
        sortOrder: 0,
        time: placeholderTime,
        durationMinutes: 10,
        location: null,
        cue: identity.cue || null,
        craving: identity.craving || null,
        response: identity.statement,
        reward: identity.reward || null,
        areaId: identity.areaId || null,
        habitId: identity.id, // habitId column repurposed to store identityId
        dayVariant: null,
        active: 1,
        isDraft: 1,
        timeOfDay: identity.timeOfDay || null,
      });
      created++;
    }

    // Mark wizard completed
    storage.upsertWizardState({
      completed: 1,
      completedAt: new Date().toISOString(),
    });

    res.json({ created });
  });

  // ============================================================
  // DASHBOARD STATS
  // ============================================================
  app.get("/api/stats", (_req, res) => {
    try {
    // Wrap legacy table queries in try/catch — production DB may lack newer columns
    let allActions: any[] = [];
    try { allActions = storage.getActions(); } catch {}
    let allProjects: any[] = [];
    try { allProjects = storage.getProjects(); } catch {}
    let inboxCount = 0;
    try { inboxCount = storage.getInboxItems().filter(i => !i.processed).length; } catch {}
    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);
    const activeIdentities = allIdentities.filter(i => i.active);

    const allPlannerTasks = storage.getAllPlannerTasks();
    const missedTasksCount = allPlannerTasks.filter(t => {
      if (t.status !== "planned" || !t.endTime) return false;
      if (t.date < today) return true;
      if (t.date === today && t.endTime < currentHHMM) return true;
      return false;
    }).length;

    const pendingActionsCount = allRoutineItems.filter(r => r.isDraft === 1).length;

    // identityVotePercent: active identities with areaId → routine items → planner tasks
    const identitiesWithArea = allIdentities.filter(i => i.active && i.areaId != null);
    let identityDone = 0;
    let identityTotal = 0;
    for (const identity of identitiesWithArea) {
      // habitId column stores identityId
      const linkedRoutineItems = allRoutineItems.filter(r => r.habitId === identity.id);
      if (linkedRoutineItems.length === 0) continue;
      const linkedTasks = allPlannerTasks.filter(t => {
        if (t.habitId !== identity.id) return false;
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
      pendingActions: allActions.filter(a => !a.completed).length,
      completedToday: allActions.filter(a => a.completedAt?.startsWith(today)).length,
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
  app.get("/api/dashboard-data", (_req, res) => {
    try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);

    // Wrap legacy table queries in try/catch — production DB may lack newer columns
    let allActions: any[] = [];
    try { allActions = storage.getActions(); } catch {}
    let inboxCount = 0;
    try { inboxCount = storage.getInboxItems().filter(i => !i.processed).length; } catch {}
    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const allAreas = storage.getAreas();
    const activeIdentities = allIdentities.filter(i => i.active);
    const allPlannerTasks = storage.getAllPlannerTasks();

    // Generate recurring tasks for today (same logic as generate-recurring endpoint)
    const templates = allPlannerTasks.filter(t => t.recurrence);
    const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const d = new Date(today + "T12:00:00");
    const dow = d.getDay();
    const dayName = DAY_NAMES[dow];
    const existingForDate = storage.getPlannerTasksByDate(today);

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
      const dup = existingForDate.find(e => e.goal === tpl.goal && e.areaId === tpl.areaId && e.habitId === tpl.habitId);
      if (dup) continue;
      storage.createPlannerTask({
        date: today,
        areaId: tpl.areaId,
        goal: tpl.goal,
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
      const linkedRoutineItems = allRoutineItems.filter(r => r.habitId === identity.id);
      if (linkedRoutineItems.length === 0) continue;
      const linkedTasks = allPlannerTasks.filter(t => {
        if (t.habitId !== identity.id) return false;
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

    // Fetch today's data
    const todaysTasks = recurringCreated > 0 ? storage.getPlannerTasksByDate(today) : existingForDate;
    const routineLogs = storage.getRoutineLogsByDate(today);

    res.json({
      stats: {
        pendingActions: allActions.filter(a => !a.completed).length,
        completedToday: allActions.filter(a => a.completedAt?.startsWith(today)).length,
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
  app.get("/api/identity-vote-details", (_req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const allIdentities = storage.getIdentities();
    const allRoutineItems = storage.getRoutineItems();
    const allPlannerTasks = storage.getAllPlannerTasks();
    const allAreas = storage.getAreas();

    const activeIdentities = allIdentities.filter(i => i.active && i.areaId != null);

    const breakdown = activeIdentities.map(identity => {
      const area = allAreas.find(a => a.id === identity.areaId);
      // habitId column stores identityId
      const linkedRoutineItems = allRoutineItems.filter(r => r.habitId === identity.id);

      const pastTasks = allPlannerTasks.filter(t => {
        if (t.habitId !== identity.id) return false;
        if (!t.endTime) return false;
        const isPast = t.date < today || (t.date === today && t.endTime < currentHHMM);
        return isPast && (t.status === "done" || t.status === "planned");
      });

      const done = pastTasks.filter(t => t.status === "done").length;
      const total = pastTasks.length;

      const upcomingTasks = allPlannerTasks.filter(t => {
        if (t.habitId !== identity.id) return false;
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
          goal: t.goal,
          date: t.date,
          startTime: t.startTime,
          endTime: t.endTime,
          status: t.status,
        })),
        pastTasks: pastTasks.slice(-5).map(t => ({
          id: t.id,
          goal: t.goal,
          date: t.date,
          status: t.status,
        })),
      };
    });

    const totalDone = breakdown.reduce((s, b) => s + b.done, 0);
    const totalAll = breakdown.reduce((s, b) => s + b.total, 0);
    const overallPercent = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

    // Identities with area but no routine (can't contribute)
    const identitiesWithoutRoutine = activeIdentities.filter(i => {
      return !allRoutineItems.some(r => r.habitId === i.id);
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
  app.get("/api/pending-actions", (_req, res) => {
    const allRoutineItems = storage.getRoutineItems();
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
  app.get("/api/missed-tasks", (_req, res) => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5);
    const allPlannerTasks = storage.getAllPlannerTasks();
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
    const { date, startTime, endTime } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: "date, startTime, and endTime are required" });
    }
    const result = storage.updatePlannerTask(Number(req.params.id), {
      date,
      startTime,
      endTime,
      status: "planned",
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  // ============================================================
  // BULK IMPORT
  // ============================================================
  app.post("/api/import", (req, res) => {
    const { type, rows } = req.body;
    if (!type || !Array.isArray(rows)) {
      return res.status(400).json({ error: "type and rows[] required" });
    }

    const now = new Date().toISOString();
    const allAreas = storage.getAreas();
    const allIdentities = storage.getIdentities();
    const allVisions = storage.getVisions();
    let created = 0;
    const errors: string[] = [];

    const findAreaByName = (name: string) => allAreas.find(a => a.name.toLowerCase() === name.toLowerCase());
    const findIdentityByStatement = (stmt: string) => allIdentities.find(i => i.statement.toLowerCase() === stmt.toLowerCase());
    const findVisionByTitle = (title: string) => allVisions.find(v => v.title.toLowerCase() === title.toLowerCase());

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 for header row + 0-indexed
        try {
          if (type === "purposes") {
            if (!row.statement) { errors.push(`Row ${rowNum}: missing statement`); continue; }
            const principles = row.principles ? JSON.stringify(row.principles.split("|").map((s: string) => s.trim()).filter(Boolean)) : null;
            storage.createPurpose({ statement: row.statement, principles, createdAt: now });
            created++;
          } else if (type === "visions") {
            if (!row.title) { errors.push(`Row ${rowNum}: missing title`); continue; }
            storage.createVision({ title: row.title, description: row.description || null, timeframe: row.timeframe || null, status: "active", createdAt: now });
            created++;
          } else if (type === "areas") {
            if (!row.name) { errors.push(`Row ${rowNum}: missing name`); continue; }
            storage.createArea({ name: row.name, description: row.description || null, category: row.responsibility || row.category || null, puzzlePiece: row.puzzle_piece || null, icon: null, sortOrder: allAreas.length + created });
            created++;
          } else if (type === "identities") {
            // All 7 fields required
            const missing: string[] = [];
            if (!row.statement) missing.push("statement");
            if (!row.area_name) missing.push("area_name");
            if (!row.cue) missing.push("cue");
            if (!row.time_of_day) missing.push("time_of_day");
            if (!row.recurrence) missing.push("recurrence");
            if (!row.craving) missing.push("craving");
            if (!row.reward) missing.push("reward");
            if (missing.length > 0) { errors.push(`Row ${rowNum}: missing ${missing.join(", ")}`); continue; }
            const area = findAreaByName(row.area_name);
            if (!area) { errors.push(`Row ${rowNum}: area "${row.area_name}" not found — import areas first`); continue; }
            // Map simple recurrence keywords to JSON patterns (matching RecurrenceBuilder output)
            const recurrenceMap: Record<string, string> = {
              "daily": JSON.stringify({ type: "daily", interval: 1 }),
              "weekly": JSON.stringify({ type: "weekly", interval: 1, days: ["monday"] }),
              "monthly": JSON.stringify({ type: "monthly", interval: 1, dayOfMonth: 1 }),
              "quarterly": JSON.stringify({ type: "quarterly", interval: 1 }),
              "yearly": JSON.stringify({ type: "yearly", interval: 1 }),
            };
            const recKey = row.recurrence.toLowerCase().trim();
            const freq = recurrenceMap[recKey];
            if (!freq) { errors.push(`Row ${rowNum}: invalid recurrence "${row.recurrence}" — use daily, weekly, monthly, quarterly, or yearly`); continue; }
            // Validate time_of_day
            const validTimes = ["early_morning", "morning", "late_morning", "afternoon", "late_afternoon", "evening", "waking_hours"];
            const todKey = row.time_of_day.toLowerCase().trim();
            if (!validTimes.includes(todKey)) { errors.push(`Row ${rowNum}: invalid time_of_day "${row.time_of_day}" — use ${validTimes.join(", ")}`); continue; }
            const newIdentity = storage.createIdentity({
              statement: row.statement,
              areaId: area.id,
              visionId: null,
              cue: row.cue,
              craving: row.craving,
              response: row.statement,
              reward: row.reward,
              frequency: freq,
              targetCount: 1,
              active: 1,
              timeOfDay: todKey,
              puzzlePiece: row.puzzle_piece || null,
              createdAt: now,
            });
            // Create linked routine item (same logic as POST /api/identities)
            if (newIdentity.cue || newIdentity.timeOfDay) {
              const timeOfDayMap: Record<string, string> = {
                early_morning: "03:00", morning: "07:00", late_morning: "10:00",
                afternoon: "13:00", late_afternoon: "16:00", evening: "20:00", waking_hours: "12:00",
              };
              const placeholderTime = timeOfDayMap[newIdentity.timeOfDay || ""] || "12:00";
              storage.createRoutineItem({
                sortOrder: 0,
                time: placeholderTime,
                durationMinutes: 10,
                location: null,
                cue: newIdentity.cue || null,
                craving: newIdentity.craving || null,
                response: newIdentity.statement,
                reward: newIdentity.reward || null,
                areaId: newIdentity.areaId || null,
                habitId: newIdentity.id,
                dayVariant: null,
                active: 1,
                isDraft: 1,
                timeOfDay: newIdentity.timeOfDay || null,
              });
            }
            created++;
          } else if (type === "habits") {
            // Legacy "habits" import now creates identities with habit fields
            if (!row.name) { errors.push(`Row ${rowNum}: missing name`); continue; }
            const area = row.area_name ? findAreaByName(row.area_name) : null;
            const freqMap: Record<string, string> = {
              "daily": JSON.stringify({ type: "daily", interval: 1 }),
              "weekly": JSON.stringify({ type: "weekly", interval: 1, days: ["monday"] }),
              "weekdays": JSON.stringify({ type: "weekly", interval: 1, days: ["monday","tuesday","wednesday","thursday","friday"] }),
            };
            storage.createIdentity({
              statement: row.name,
              areaId: area?.id || null,
              visionId: null,
              cue: row.cue || null,
              craving: row.because || null,
              response: row.name,
              reward: row.reward || null,
              frequency: freqMap[row.frequency?.toLowerCase()] || freqMap["daily"],
              targetCount: 1,
              active: 1,
              createdAt: now,
              timeOfDay: row.time_of_day || null,
            });
            created++;
          } else if (type === "goals") {
            if (!row.title) { errors.push(`Row ${rowNum}: missing title`); continue; }
            const vision = row.vision_title ? findVisionByTitle(row.vision_title) : null;
            storage.createGoal({ title: row.title, description: row.description || null, visionId: vision?.id || null, targetDate: row.target_date || null, status: "active", createdAt: now });
            created++;
          } else if (type === "tasks") {
            const taskText = row.task || row.goal; // accept 'task' or legacy 'goal' column
            if (!taskText || !row.date) { errors.push(`Row ${rowNum}: missing task or date`); continue; }
            const area = row.area_name ? findAreaByName(row.area_name) : null;
            let hours: string | null = null;
            if (row.start_time && row.end_time) {
              const [sh, sm] = row.start_time.split(":").map(Number);
              const [eh, em] = row.end_time.split(":").map(Number);
              const diff = (eh * 60 + em - sh * 60 - sm) / 60;
              if (diff > 0) hours = diff.toFixed(2);
            }
            storage.createPlannerTask({
              date: row.date,
              areaId: area?.id || null,
              goal: taskText,
              startTime: row.start_time || null,
              endTime: row.end_time || null,
              hours,
              result: null,
              status: "planned",
              recurrence: null,
              habitId: null,
              isDraft: 0,
              sourceType: "manual",
            });
            created++;
          } else {
            return res.status(400).json({ error: `Unknown type: ${type}` });
          }
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }

    res.json({ created, errors, total: rows.length });
  });

  // ============================================================
  // PREFERENCES
  // ============================================================
  app.get("/api/preferences", (_req, res) => {
    res.json(storage.getPreferences());
  });
  app.put("/api/preferences", (req, res) => {
    const { displayName, timeFormat } = req.body;
    const data: { displayName?: string; timeFormat?: string } = {};
    if (displayName !== undefined) data.displayName = String(displayName).slice(0, 50);
    if (timeFormat !== undefined && (timeFormat === "12h" || timeFormat === "24h")) data.timeFormat = timeFormat;
    res.json(storage.updatePreferences(data));
  });

  // ============================================================
  // EXPORT
  // ============================================================
  app.get("/api/export/json", (_req, res) => {
    const allData = storage.getAllDataForExport();
    const payload = {
      exportDate: new Date().toISOString(),
      version: 1,
      data: allData,
    };
    const dateStr = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Disposition", `attachment; filename="unpuzzle-life-export-${dateStr}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(payload);
  });

  app.get("/api/export/csv", async (_req, res) => {
    const archiver = await import("archiver");
    const allData = storage.getAllDataForExport();
    const dateStr = new Date().toISOString().split("T")[0];

    res.setHeader("Content-Disposition", `attachment; filename="unpuzzle-life-export-${dateStr}.zip"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver.default("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const [tableName, rows] of Object.entries(allData)) {
      if (!rows.length) {
        archive.append("", { name: `${tableName}.csv` });
        continue;
      }
      const headers = Object.keys(rows[0]);
      const csvRows = [headers.join(",")];
      for (const row of rows) {
        csvRows.push(headers.map(h => {
          const val = (row as any)[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(","));
      }
      archive.append(csvRows.join("\n"), { name: `${tableName}.csv` });
    }

    await archive.finalize();
  });

  // ============================================================
  // IMPORT (full JSON replacement)
  // ============================================================
  app.post("/api/import/json", (req, res) => {
    const body = req.body;
    if (!body || !body.data || typeof body.data !== "object") {
      return res.status(400).json({ error: "Invalid import format: missing 'data' key" });
    }

    const tableMap: Record<string, { drizzleTable: any; sqlName: string }> = {
      purposes: { drizzleTable: null, sqlName: "purposes" },
      visions: { drizzleTable: null, sqlName: "visions" },
      goals: { drizzleTable: null, sqlName: "goals" },
      areas: { drizzleTable: null, sqlName: "areas" },
      projects: { drizzleTable: null, sqlName: "projects" },
      actions: { drizzleTable: null, sqlName: "actions" },
      identities: { drizzleTable: null, sqlName: "identities" },
      habits: { drizzleTable: null, sqlName: "habits" },
      habitLogs: { drizzleTable: null, sqlName: "habit_logs" },
      routineItems: { drizzleTable: null, sqlName: "routine_items" },
      routineLogs: { drizzleTable: null, sqlName: "routine_logs" },
      plannerTasks: { drizzleTable: null, sqlName: "planner_tasks" },
      inboxItems: { drizzleTable: null, sqlName: "inbox_items" },
      weeklyReviews: { drizzleTable: null, sqlName: "weekly_reviews" },
      environmentEntities: { drizzleTable: null, sqlName: "environment_entities" },
      beliefs: { drizzleTable: null, sqlName: "beliefs" },
      antiHabits: { drizzleTable: null, sqlName: "anti_habits" },
      immutableLaws: { drizzleTable: null, sqlName: "immutable_laws" },
      immutableLawLogs: { drizzleTable: null, sqlName: "immutable_law_logs" },
      wizardState: { drizzleTable: null, sqlName: "wizard_state" },
    };

    const counts: Record<string, number> = {};

    try {
      const camelToSnake = (s: string) => s.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);

      const runTx = sqlite.transaction(() => {
        for (const [key, rows] of Object.entries(body.data)) {
          const mapping = tableMap[key];
          if (!mapping || !Array.isArray(rows)) continue;

          sqlite.prepare(`DELETE FROM ${mapping.sqlName}`).run();

          if (rows.length === 0) {
            counts[key] = 0;
            continue;
          }

          const firstRow = rows[0];
          const camelKeys = Object.keys(firstRow);
          const snakeKeys = camelKeys.map(camelToSnake);

          const placeholders = snakeKeys.map(() => "?").join(", ");
          const insertStmt = sqlite.prepare(
            `INSERT INTO ${mapping.sqlName} (${snakeKeys.join(", ")}) VALUES (${placeholders})`
          );

          for (const row of rows) {
            const values = camelKeys.map(k => {
              const v = (row as any)[k];
              return v === undefined ? null : v;
            });
            insertStmt.run(...values);
          }
          counts[key] = rows.length;
        }
      });

      runTx();
      res.json({ success: true, counts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // RESET
  // ============================================================
  app.post("/api/reset", (_req, res) => {
    try {
      storage.resetDatabase();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
