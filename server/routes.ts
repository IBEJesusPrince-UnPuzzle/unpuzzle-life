import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  insertPurposeSchema, insertVisionSchema, insertGoalSchema,
  insertAreaSchema, insertProjectSchema, insertActionSchema,
  insertIdentitySchema, insertHabitSchema, insertHabitLogSchema,
  insertInboxItemSchema, insertWeeklyReviewSchema,
  insertRoutineItemSchema, insertRoutineLogSchema,
  insertPlannerTaskSchema,
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
    const { date, areaId } = req.query;
    if (date) {
      res.json(storage.getPlannerTasksByDate(date as string));
    } else if (areaId) {
      res.json(storage.getPlannerTasksByArea(Number(areaId)));
    } else {
      res.json([]);
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
        const dup = existingForDate.find(e => e.goal === tpl.goal && e.areaId === tpl.areaId);
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
  // DASHBOARD STATS
  // ============================================================
  app.get("/api/stats", (_req, res) => {
    const allActions = storage.getActions();
    const allProjects = storage.getProjects();
    const allHabits = storage.getHabits();
    const allRoutineItems = storage.getRoutineItems();
    const inboxCount = storage.getInboxItems().filter(i => !i.processed).length;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHHMM = now.toTimeString().slice(0, 5); // "HH:MM"
    const todayLogs = storage.getHabitLogsByDate(today);
    const activeHabits = allHabits.filter(h => h.active);

    // missedTasksCount: planned tasks with endTime in the past
    const allPlannerTasks = storage.getAllPlannerTasks();
    const missedTasksCount = allPlannerTasks.filter(t => {
      if (t.status !== "planned" || !t.endTime) return false;
      if (t.date < today) return true;
      if (t.date === today && t.endTime < currentHHMM) return true;
      return false;
    }).length;

    // pendingActionsCount: draft routine items
    const pendingActionsCount = allRoutineItems.filter(r => r.isDraft === 1).length;

    // identityVotePercent: habits linked to an identity → routine items → planner tasks with past endTime
    const habitsWithIdentity = allHabits.filter(h => h.identityId != null);
    let identityDone = 0;
    let identityTotal = 0;
    for (const habit of habitsWithIdentity) {
      const linkedRoutineItems = allRoutineItems.filter(r => r.habitId === habit.id);
      if (linkedRoutineItems.length === 0) continue;
      const linkedTasks = allPlannerTasks.filter(t => {
        if (t.habitId !== habit.id) return false;
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
      activeProjects: allProjects.filter(p => p.status === "active").length,
      inboxCount,
      habitsCompletedToday: todayLogs.length,
      totalActiveHabits: activeHabits.length,
      missedTasksCount,
      pendingActionsCount,
      identityVotePercent,
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
}
