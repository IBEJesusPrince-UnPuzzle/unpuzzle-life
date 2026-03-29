import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================
// GTD HORIZONS (Top-down clarity)
// ============================================================

// Horizon 5: Purpose & Principles
export const purposes = sqliteTable("purposes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statement: text("statement").notNull(),
  principles: text("principles"), // JSON array of strings
  createdAt: text("created_at").notNull(),
});

// Horizon 4: Vision (3-5 year picture)
export const visions = sqliteTable("visions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  timeframe: text("timeframe"), // e.g. "2027", "3 years"
  status: text("status").notNull().default("active"), // active, achieved, deferred
  createdAt: text("created_at").notNull(),
});

// Horizon 3: Goals (1-2 year objectives)
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  visionId: integer("vision_id").references(() => visions.id),
  targetDate: text("target_date"),
  status: text("status").notNull().default("active"), // active, achieved, deferred
  createdAt: text("created_at").notNull(),
});

// Horizon 2: Areas of Focus & Responsibility
export const areas = sqliteTable("areas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // lucide icon name
  sortOrder: integer("sort_order").notNull().default(0),
});

// Horizon 1: Projects (multi-step outcomes)
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  areaId: integer("area_id").references(() => areas.id),
  goalId: integer("goal_id").references(() => goals.id),
  status: text("status").notNull().default("active"), // active, completed, someday, deferred
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull(),
});

// Ground: Next Actions
export const actions = sqliteTable("actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  notes: text("notes"),
  projectId: integer("project_id").references(() => projects.id),
  areaId: integer("area_id").references(() => areas.id),
  context: text("context"), // @home, @work, @phone, @computer, @errands
  energy: text("energy"), // low, medium, high
  timeEstimate: integer("time_estimate"), // minutes
  dueDate: text("due_date"),
  completed: integer("completed").notNull().default(0),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// ATOMIC HABITS (Bottom-up execution)
// ============================================================

// Identity Statements ("I am the type of person who...")
export const identities = sqliteTable("identities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statement: text("statement").notNull(), // "I am a healthy person"
  areaId: integer("area_id").references(() => areas.id),
  visionId: integer("vision_id").references(() => visions.id),
  createdAt: text("created_at").notNull(),
});

// Habits linked to identities
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  identityId: integer("identity_id").references(() => identities.id),
  cue: text("cue"), // Implementation intention: "When I [cue]..."
  craving: text("craving"), // "I will want to..."
  response: text("response"), // "I will [response]..."
  reward: text("reward"), // "Which will give me..."
  frequency: text("frequency").notNull().default("daily"), // daily, weekdays, weekly
  targetCount: integer("target_count").notNull().default(1),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// Daily habit completions
export const habitLogs = sqliteTable("habit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habitId: integer("habit_id").notNull().references(() => habits.id),
  date: text("date").notNull(), // YYYY-MM-DD
  count: integer("count").notNull().default(1),
  note: text("note"),
});

// ============================================================
// GTD INBOX (Capture everything)
// ============================================================

export const inboxItems = sqliteTable("inbox_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  notes: text("notes"),
  processed: integer("processed").notNull().default(0),
  processedAs: text("processed_as"), // action, project, reference, someday, trash
  createdAt: text("created_at").notNull(),
});

// ============================================================
// WEEKLY REVIEW
// ============================================================

export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekOf: text("week_of").notNull(), // YYYY-MM-DD (Monday)
  wins: text("wins"), // JSON array
  lessons: text("lessons"), // JSON array
  nextWeekFocus: text("next_week_focus"), // JSON array
  inboxCleared: integer("inbox_cleared").notNull().default(0),
  projectsReviewed: integer("projects_reviewed").notNull().default(0),
  habitsReviewed: integer("habits_reviewed").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// INSERT SCHEMAS & TYPES
// ============================================================

export const insertPurposeSchema = createInsertSchema(purposes).omit({ id: true });
export const insertVisionSchema = createInsertSchema(visions).omit({ id: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true });
export const insertAreaSchema = createInsertSchema(areas).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertActionSchema = createInsertSchema(actions).omit({ id: true });
export const insertIdentitySchema = createInsertSchema(identities).omit({ id: true });
export const insertHabitSchema = createInsertSchema(habits).omit({ id: true });
export const insertHabitLogSchema = createInsertSchema(habitLogs).omit({ id: true });
export const insertInboxItemSchema = createInsertSchema(inboxItems).omit({ id: true });
export const insertWeeklyReviewSchema = createInsertSchema(weeklyReviews).omit({ id: true });

export type Purpose = typeof purposes.$inferSelect;
export type InsertPurpose = z.infer<typeof insertPurposeSchema>;
export type Vision = typeof visions.$inferSelect;
export type InsertVision = z.infer<typeof insertVisionSchema>;
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Area = typeof areas.$inferSelect;
export type InsertArea = z.infer<typeof insertAreaSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Action = typeof actions.$inferSelect;
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Identity = typeof identities.$inferSelect;
export type InsertIdentity = z.infer<typeof insertIdentitySchema>;
export type Habit = typeof habits.$inferSelect;
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type HabitLog = typeof habitLogs.$inferSelect;
export type InsertHabitLog = z.infer<typeof insertHabitLogSchema>;
export type InboxItem = typeof inboxItems.$inferSelect;
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type InsertWeeklyReview = z.infer<typeof insertWeeklyReviewSchema>;
