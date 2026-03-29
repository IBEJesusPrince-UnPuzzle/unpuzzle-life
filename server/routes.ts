import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  insertPurposeSchema, insertVisionSchema, insertGoalSchema,
  insertAreaSchema, insertProjectSchema, insertActionSchema,
  insertIdentitySchema, insertHabitSchema, insertHabitLogSchema,
  insertInboxItemSchema, insertWeeklyReviewSchema,
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
    res.json(storage.createIdentity(parsed.data));
  });
  app.patch("/api/identities/:id", (req, res) => {
    const result = storage.updateIdentity(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });
  app.delete("/api/identities/:id", (req, res) => {
    storage.deleteIdentity(Number(req.params.id));
    res.json({ ok: true });
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
    res.json(storage.createHabit(parsed.data));
  });
  app.patch("/api/habits/:id", (req, res) => {
    const result = storage.updateHabit(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: "Not found" });
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
  app.delete("/api/inbox/:id", (req, res) => {
    storage.deleteInboxItem(Number(req.params.id));
    res.json({ ok: true });
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
  // DASHBOARD STATS
  // ============================================================
  app.get("/api/stats", (_req, res) => {
    const allActions = storage.getActions();
    const allProjects = storage.getProjects();
    const allHabits = storage.getHabits();
    const inboxCount = storage.getInboxItems().filter(i => !i.processed).length;
    const today = new Date().toISOString().split("T")[0];
    const todayLogs = storage.getHabitLogsByDate(today);
    const activeHabits = allHabits.filter(h => h.active);
    
    res.json({
      pendingActions: allActions.filter(a => !a.completed).length,
      completedToday: allActions.filter(a => a.completedAt?.startsWith(today)).length,
      activeProjects: allProjects.filter(p => p.status === "active").length,
      inboxCount,
      habitsCompletedToday: todayLogs.length,
      totalActiveHabits: activeHabits.length,
    });
  });
}
