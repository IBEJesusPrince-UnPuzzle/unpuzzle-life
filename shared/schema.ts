import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================
// USERS & INVITATIONS (Multi-tenancy)
// ============================================================

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"), // 'super_admin' | 'admin' | 'user'
  status: text("status").notNull().default("active"), // 'active' | 'suspended' | 'pending_approval'
  invitedBy: integer("invited_by"),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
});

export const invitations = sqliteTable("invitations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: integer("invited_by").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'expired'
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// ============================================================
// CLARITY OF LIFE (Top-down clarity)
// ============================================================

// C5: Purpose & Mission
export const purposes = sqliteTable("purposes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  statement: text("statement").notNull(),
  mission: text("mission"),
  createdAt: text("created_at").notNull(),
});

// C2: Areas of Focus
export const areas = sqliteTable("areas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  puzzlePiece: text("puzzle_piece"), // reason | finance | fitness | talent | pleasure
  visionText: text("vision_text"), // the user's immersive area vision text
  icon: text("icon"), // lucide icon name
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived").notNull().default(0), // 1 = archived, 0 = active
  archivedAt: text("archived_at"), // ISO 8601 timestamp
});

// Area Vision Snapshots (history of vision changes)
export const areaVisionSnapshots = sqliteTable("area_vision_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  areaId: integer("area_id").notNull().references(() => areas.id),
  previousVision: text("previous_vision").notNull(),
  note: text("note"),
  changedAt: text("changed_at").notNull(), // ISO 8601 timestamp
});

// C1: Identity (projects & routines derived from identities)
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  description: text("description"),
  areaId: integer("area_id").references(() => areas.id),
  puzzlePiece: text("puzzle_piece"), // inherited from identity on creation
  identityId: integer("identity_id").notNull().references(() => identities.id),
  createdAt: text("created_at").notNull(),
  archived: integer("archived").notNull().default(0),
  archivedAt: text("archived_at"),
});

// ============================================================
// ATOMIC HABITS (Bottom-up execution)
// ============================================================

// Identity Statements ("I am the type of person who...")
export const identities = sqliteTable("identities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  statement: text("statement").notNull(), // "I am a healthy person"
  areaId: integer("area_id").notNull().references(() => areas.id),
  cue: text("cue").notNull(),
  craving: text("craving").notNull(),
  response: text("response").notNull(),
  reward: text("reward").notNull(),
  frequency: text("frequency").notNull().default("daily"),
  active: integer("active").notNull().default(1),
  timeOfDay: text("time_of_day").notNull(),
  puzzlePiece: text("puzzle_piece").notNull(),          // reason | finance | fitness | talent | pleasure
  location: text("location").notNull(),                  // "where will this take place?"
  createdAt: text("created_at").notNull(),
  archived: integer("archived").notNull().default(0),
  archivedAt: text("archived_at"),
});

// ============================================================
// DAILY ROUTINE (Habit-stacked 24-hour schedule)
// ============================================================

export const routineItems = sqliteTable("routine_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  time: text("time").notNull(), // HH:MM format
  durationMinutes: integer("duration_minutes").notNull().default(10),
  location: text("location").notNull().default(""),
  cue: text("cue").notNull().default(""),
  craving: text("craving").notNull().default(""),
  response: text("response").notNull(),
  reward: text("reward").notNull().default(""),
  areaId: integer("area_id").notNull().references(() => areas.id),
  identityId: integer("identity_id").notNull().references(() => identities.id),
  puzzlePiece: text("puzzle_piece").notNull().default(""),
  dayVariant: text("day_variant").notNull().default(""),
  active: integer("active").notNull().default(1),
  isDraft: integer("is_draft").notNull().default(0),
  timeOfDay: text("time_of_day").notNull().default(""),
});

// Daily routine completion logs
export const routineLogs = sqliteTable("routine_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  routineItemId: integer("routine_item_id").notNull().references(() => routineItems.id),
  date: text("date").notNull(), // YYYY-MM-DD
  completedAt: text("completed_at"),
  note: text("note"),
});

// ============================================================
// DAILY PLANNER TRACKER (DPT)
// ============================================================

export const plannerTasks = sqliteTable("planner_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  date: text("date").notNull(), // YYYY-MM-DD
  areaId: integer("area_id").references(() => areas.id),
  task: text("task").notNull(), // task description (what to do)
  startTime: text("start_time"), // HH:MM format
  endTime: text("end_time"), // HH:MM format
  hours: text("hours"), // decimal hours as string
  result: text("result"), // outcome notes
  status: text("status").notNull().default("planned"), // planned, done, skipped
  recurrence: text("recurrence"), // null=one-time, "daily", "weekdays", "weekend", "weekly:monday", "monthly"
  identityId: integer("identity_id").references(() => identities.id),
  projectId: integer("project_id").references(() => projects.id),
  context: text("context"), // @home, @work, @phone, @computer, @errands
  energy: text("energy"), // low, medium, high
  isDraft: integer("is_draft").notNull().default(0), // 1 = draft, 0 = published
});

// ============================================================
// GTD INBOX (Capture everything)
// ============================================================

export const inboxItems = sqliteTable("inbox_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  content: text("content").notNull(),
  notes: text("notes"),
  processed: integer("processed").notNull().default(0),
  processedAs: text("processed_as"), // task, project, reference, someday, trash
  deletedAt: text("deleted_at"),
  referenceProjectId: integer("reference_project_id").references(() => projects.id),
  linkedPlannerTaskId: integer("linked_planner_task_id").references(() => plannerTasks.id),
  areaId: integer("area_id").references(() => areas.id),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// WEEKLY REVIEW
// ============================================================

export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  weekOf: text("week_of").notNull(), // YYYY-MM-DD (Monday)
  wins: text("wins"), // JSON array
  lessons: text("lessons"), // JSON array
  nextWeekFocus: text("next_week_focus"), // JSON array
  inboxCleared: integer("inbox_cleared").notNull().default(0),
  projectsReviewed: integer("projects_reviewed").notNull().default(0),
  habitsReviewed: integer("habits_reviewed").notNull().default(0),
  puzzlePieceRatings: text("puzzle_piece_ratings"), // JSON: {reason: 1-5, finance: 1-5, fitness: 1-5, talent: 1-5, pleasure: 1-5}
  createdAt: text("created_at").notNull(),
});

// ============================================================
// WIZARD STATE
// ============================================================

export const wizardState = sqliteTable("wizard_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  currentPhase: integer("current_phase").notNull().default(1), // 1-4
  completed: integer("completed").notNull().default(0),
  completedAt: text("completed_at"),
});

// ============================================================
// ENVIRONMENT ENTITIES
// ============================================================

export const environmentEntities = sqliteTable("environment_entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  identityId: integer("identity_id").notNull().references(() => identities.id),
  areaId: integer("area_id").references(() => areas.id),
  puzzlePiece: text("puzzle_piece"),
  type: text("type").notNull(), // "person" | "place" | "thing"

  // Person fields
  personName: text("person_name"),
  personContactMethod: text("person_contact_method"),
  personContactInfo: text("person_contact_info"),
  personWhy: text("person_why"),

  // Place fields
  placeName: text("place_name"),
  placeAddress: text("place_address"),
  placeTravelMethod: text("place_travel_method"),
  placeWhy: text("place_why"),

  // Thing fields
  thingName: text("thing_name"),
  thingUsage: text("thing_usage"),
  thingWhy: text("thing_why"),

  createdAt: text("created_at").notNull(),
});

// ============================================================
// BELIEFS (Power of Your Subconscious Mind — reprogramming)
// ============================================================

export const beliefs = sqliteTable("beliefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  puzzlePiece: text("puzzle_piece").notNull(), // reason | finance | fitness | talent | pleasure
  areaId: integer("area_id").references(() => areas.id), // optional area link
  oldBelief: text("old_belief").notNull(),         // the limiting belief being replaced
  newBelief: text("new_belief").notNull(),          // the replacement belief
  whyItMatters: text("why_it_matters"),             // short explanation
  repetitionCount: integer("repetition_count").notNull().default(0), // times reviewed in morning/evening programming
  graduated: integer("graduated").notNull().default(0), // 1 = "I believe this now" — archived
  graduatedAt: text("graduated_at"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// ANTI-HABITS (Atomic Habits inversions)
// ============================================================

export const antiHabits = sqliteTable("anti_habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  puzzlePiece: text("puzzle_piece").notNull(), // reason | finance | fitness | talent | pleasure
  areaId: integer("area_id").references(() => areas.id),
  identityId: integer("identity_id").references(() => identities.id), // the identity this protects
  title: text("title").notNull(),               // short name, e.g. "No late-night snacking"
  description: text("description"),             // what habit you're breaking
  // Inverted Four Laws (Make it Invisible/Unattractive/Difficult/Unsatisfying)
  makeInvisible: text("make_invisible"),         // environment redesign — remove the cue
  makeUnattractive: text("make_unattractive"),   // reframe the craving
  makeDifficult: text("make_difficult"),         // add friction to the response
  makeUnsatisfying: text("make_unsatisfying"),   // add a consequence to the reward
  // Streak tracking (counting days WITHOUT the bad habit)
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastSlipDate: text("last_slip_date"),          // YYYY-MM-DD — date of last slip
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// IMMUTABLE LAWS (identity boundaries per puzzle piece)
// ============================================================

export const immutableLaws = sqliteTable("immutable_laws", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  puzzlePiece: text("puzzle_piece").notNull(), // reason | finance | fitness | talent | pleasure
  title: text("title").notNull(),               // short name, e.g. "No Sleep Sacrifice Law"
  statement: text("statement").notNull(),        // one-sentence law
  whyItMatters: text("why_it_matters"),          // short explanation tied to identity/beliefs
  linkedIdentityIds: text("linked_identity_ids"), // JSON array of identity IDs this law protects
  isPrimary: integer("is_primary").notNull().default(0), // 1 = highlighted as primary law for this puzzle piece
  isRedLine: integer("is_red_line").notNull().default(0), // 1 = hard line, justifies stronger blocking
  // Enforcement configuration
  enforcementLevel: integer("enforcement_level").notNull().default(1), // 1=Awareness, 2=Friction, 3=Block
  // Conditions for triggering enforcement (stored as JSON for flexibility)
  triggerConditions: text("trigger_conditions"),  // JSON: conditions that activate enforcement
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// IMMUTABLE LAW LOGS (kept/broken tracking)
// ============================================================

export const immutableLawLogs = sqliteTable("immutable_law_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  immutableLawId: integer("immutable_law_id").notNull().references(() => immutableLaws.id),
  puzzlePiece: text("puzzle_piece").notNull(),
  date: text("date").notNull(),                  // YYYY-MM-DD
  kept: integer("kept").notNull(),               // 1 = kept, 0 = broken
  note: text("note"),                            // short reflection: what happened / why
  triggerType: text("trigger_type"),             // visibility | craving | convenience | emotion | social_pressure
  // Override tracking (Level 3 conscious override)
  wasOverride: integer("was_override").notNull().default(0), // 1 = user explicitly overrode a Block
  overrideReason: text("override_reason"),
  // Anti-habit suggestion outcome
  suggestedAntiHabitId: integer("suggested_anti_habit_id").references(() => antiHabits.id),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// PREFERENCES
// ============================================================

export const preferences = sqliteTable("preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  displayName: text("display_name").notNull().default(""),
  timeFormat: text("time_format").notNull().default("12h"), // "12h" | "24h"
});

// ============================================================
// INSERT SCHEMAS & TYPES
// ============================================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertInvitationSchema = createInsertSchema(invitations).omit({ id: true });

export const insertPurposeSchema = createInsertSchema(purposes).omit({ id: true });
export const insertAreaSchema = createInsertSchema(areas).omit({ id: true });
export const insertAreaVisionSnapshotSchema = createInsertSchema(areaVisionSnapshots).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertIdentitySchema = createInsertSchema(identities).omit({ id: true });
export const insertInboxItemSchema = createInsertSchema(inboxItems).omit({ id: true });
export const insertWeeklyReviewSchema = createInsertSchema(weeklyReviews).omit({ id: true });
export const insertRoutineItemSchema = createInsertSchema(routineItems).omit({ id: true });
export const insertRoutineLogSchema = createInsertSchema(routineLogs).omit({ id: true });
export const insertPlannerTaskSchema = createInsertSchema(plannerTasks).omit({ id: true });
export const insertEnvironmentEntitySchema = createInsertSchema(environmentEntities).omit({ id: true });
export const insertWizardStateSchema = createInsertSchema(wizardState).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type Purpose = typeof purposes.$inferSelect;
export type InsertPurpose = z.infer<typeof insertPurposeSchema>;
export type Area = typeof areas.$inferSelect;
export type InsertArea = z.infer<typeof insertAreaSchema>;
export type AreaVisionSnapshot = typeof areaVisionSnapshots.$inferSelect;
export type InsertAreaVisionSnapshot = z.infer<typeof insertAreaVisionSnapshotSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Identity = typeof identities.$inferSelect;
export type InsertIdentity = z.infer<typeof insertIdentitySchema>;
export type InboxItem = typeof inboxItems.$inferSelect;
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type InsertWeeklyReview = z.infer<typeof insertWeeklyReviewSchema>;
export type RoutineItem = typeof routineItems.$inferSelect;
export type InsertRoutineItem = z.infer<typeof insertRoutineItemSchema>;
export type RoutineLog = typeof routineLogs.$inferSelect;
export type InsertRoutineLog = z.infer<typeof insertRoutineLogSchema>;
export type PlannerTask = typeof plannerTasks.$inferSelect;
export type InsertPlannerTask = z.infer<typeof insertPlannerTaskSchema>;
export type EnvironmentEntity = typeof environmentEntities.$inferSelect;
export type InsertEnvironmentEntity = z.infer<typeof insertEnvironmentEntitySchema>;
export type WizardState = typeof wizardState.$inferSelect;
export type InsertWizardState = z.infer<typeof insertWizardStateSchema>;

export const insertPreferencesSchema = createInsertSchema(preferences).omit({ id: true });

export const insertBeliefSchema = createInsertSchema(beliefs).omit({ id: true });
export const insertAntiHabitSchema = createInsertSchema(antiHabits).omit({ id: true });
export const insertImmutableLawSchema = createInsertSchema(immutableLaws).omit({ id: true });
export const insertImmutableLawLogSchema = createInsertSchema(immutableLawLogs).omit({ id: true });

export type Preferences = typeof preferences.$inferSelect;
export type InsertPreferences = z.infer<typeof insertPreferencesSchema>;

export type Belief = typeof beliefs.$inferSelect;
export type InsertBelief = z.infer<typeof insertBeliefSchema>;
export type AntiHabit = typeof antiHabits.$inferSelect;
export type InsertAntiHabit = z.infer<typeof insertAntiHabitSchema>;
export type ImmutableLaw = typeof immutableLaws.$inferSelect;
export type InsertImmutableLaw = z.infer<typeof insertImmutableLawSchema>;
export type ImmutableLawLog = typeof immutableLawLogs.$inferSelect;
export type InsertImmutableLawLog = z.infer<typeof insertImmutableLawLogSchema>;
