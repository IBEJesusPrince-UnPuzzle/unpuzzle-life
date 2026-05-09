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
  // Phase 2 (§23): per-user last selected Agenda view, follows them across devices.
  // 'day' | '3day' | 'week' | 'month'
  agendaDefaultView: text("agenda_default_view").notNull().default("day"),
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
// PROJECTS (Phase 0: identity/area/puzzle_piece columns dropped)
// ============================================================

// Phase 1 (§2): trigger / start_date / end_date added.
// trigger values: 'missing_support' | 'repeated_friction' | 'major_life_change' | 'new_identity_shift'
// start_date / end_date are nullable ISO date strings (YYYY-MM-DD); consumed by Phase 2 calendar + Phase 5 Project v2 UI.
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  description: text("description"),
  trigger: text("trigger"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
  archived: integer("archived").notNull().default(0),
  archivedAt: text("archived_at"),
});

// ============================================================
// GTD INBOX (Phase 0: areaId and linkedPlannerTaskId dropped)
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
  createdAt: text("created_at").notNull(),
});

// ============================================================
// WEEKLY REVIEW (kept through Phase 0; rebuilt in Phase 5)
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
  puzzlePieceRatings: text("puzzle_piece_ratings"), // legacy JSON (Phase 5 will reshape)
  createdAt: text("created_at").notNull(),
});

// ============================================================
// V2: SUPPORT TAXONOMY (§1) — People, Places, Things, Providers, Conditions
// ============================================================
// Phase 1 (§3): every support record carries a `state` column.
// state values: 'available' | 'at_risk' | 'unavailable' | 'archived' (default 'available')

export const environmentPeople = sqliteTable("environment_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  relationship: text("relationship"),
  state: text("state").notNull().default("available"),
  createdAt: text("created_at").notNull(),
});

export const environmentPlaces = sqliteTable("environment_places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  type: text("type"),
  state: text("state").notNull().default("available"),
  createdAt: text("created_at").notNull(),
});

export const environmentThings = sqliteTable("environment_things", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  category: text("category"),
  state: text("state").notNull().default("available"),
  createdAt: text("created_at").notNull(),
});

// New in Phase 1 — Providers (§1): who supplies/maintains it.
export const environmentProviders = sqliteTable("environment_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  type: text("type"), // free-form: 'subscription', 'service', 'institution', etc.
  state: text("state").notNull().default("available"),
  createdAt: text("created_at").notNull(),
});

// New in Phase 1 — Conditions (§1): what must be true.
export const environmentConditions = sqliteTable("environment_conditions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  state: text("state").notNull().default("available"),
  createdAt: text("created_at").notNull(),
});

// Junction: kept through Phase 0; replaced by responsibility_support in Phase 1
export const projectEnvironment = sqliteTable("project_environment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  entityType: text("entity_type").notNull(), // "person" | "place" | "thing"
  entityId: integer("entity_id").notNull(),
});

// ============================================================
// V2: RESPONSIBILITIES & ROLES (Phase 0: placeId/thingId dropped from responsibilities)
// ============================================================

// Phase 2 (§23) added two new fields:
//   color           — persists across all instances of this responsibility (chip color on Agenda)
//   recurrence_rule — RRULE-style string; responsibilities are recurring by nature
export const responsibilities = sqliteTable("responsibilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  cadence: text("cadence").notNull().default("weekly"), // daily | weekly | biweekly | monthly | custom
  dayOfWeek: text("day_of_week"),
  customCronExpr: text("custom_cron_expr"),
  isPreset: integer("is_preset").notNull().default(0),
  color: text("color"),
  recurrenceRule: text("recurrence_rule"),
  createdAt: text("created_at").notNull(),
});

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  cadence: text("cadence").notNull().default("weekly"), // daily | weekdays | weekly | biweekly | monthly | custom
  dayOfWeek: text("day_of_week"),
  createdAt: text("created_at").notNull(),
});

// Junction: links roles to people (supports groups). Pre-existing; Phase 5 will revisit.
export const rolePeople = sqliteTable("role_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull(),
  personId: integer("person_id").notNull(),
});

// ============================================================
// V2: JUNCTIONS (§2, §3, §3a, §3b)
// ============================================================
// Universal 4-option relationship rule (§3a): every responsibility-support link
// carries a relationship_type and an importance.
//   relationship_type: 'primary' | 'secondary' | 'optional' | 'temporary_workaround'
//   importance:        'critical' | 'important' | 'helpful'
// Stored as text columns; validated in app code at the API boundary.

// Responsibilities can belong to multiple Roles (§5).
export const responsibilityRole = sqliteTable("responsibility_role", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  roleId: integer("role_id").notNull().references(() => roles.id),
});

// Five separate junction tables (one per support category) so foreign keys
// enforce integrity at the DB level. Same shape across all five.
export const responsibilityPeople = sqliteTable("responsibility_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  personId: integer("person_id").notNull().references(() => environmentPeople.id),
  relationshipType: text("relationship_type").notNull().default("primary"),
  importance: text("importance").notNull().default("important"),
});

export const responsibilityPlaces = sqliteTable("responsibility_places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  placeId: integer("place_id").notNull().references(() => environmentPlaces.id),
  relationshipType: text("relationship_type").notNull().default("primary"),
  importance: text("importance").notNull().default("important"),
});

export const responsibilityThings = sqliteTable("responsibility_things", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  thingId: integer("thing_id").notNull().references(() => environmentThings.id),
  relationshipType: text("relationship_type").notNull().default("primary"),
  importance: text("importance").notNull().default("important"),
});

export const responsibilityProviders = sqliteTable("responsibility_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  providerId: integer("provider_id").notNull().references(() => environmentProviders.id),
  relationshipType: text("relationship_type").notNull().default("primary"),
  importance: text("importance").notNull().default("important"),
});

export const responsibilityConditions = sqliteTable("responsibility_conditions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  conditionId: integer("condition_id").notNull().references(() => environmentConditions.id),
  relationshipType: text("relationship_type").notNull().default("primary"),
  importance: text("importance").notNull().default("important"),
});

// Projects can stand alone OR link to one primary responsibility plus optional more (§2).
export const projectResponsibility = sqliteTable("project_responsibility", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id),
  responsibilityId: integer("responsibility_id").notNull().references(() => responsibilities.id),
  isPrimary: integer("is_primary").notNull().default(0),
});

// ============================================================
// PHASE 2 — PROJECT TASKS (§23)
// ============================================================
// Minimum-viable shape; Phase 5 (Project v2) will extend.
// Project tasks become visible on Agenda by acquiring an agenda_tasks row
// with origin = 'project' and origin_id pointing here.
// Recurrence: optional; if set, recurrence_end_date is required and must be
// ≤ project.end_date (else triggers conversion prompt — enforced in app).
export const projectTasks = sqliteTable("project_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("open"), // 'open' | 'done' | 'cancelled'
  recurrenceRule: text("recurrence_rule"),
  recurrenceEndDate: text("recurrence_end_date"), // YYYY-MM-DD; required when recurrenceRule set
  createdAt: text("created_at").notNull(),
});

// ============================================================
// PHASE 2 — AGENDA TASKS (§23)
// ============================================================
// Canonical scheduled-thing table. Every scheduled item appears here:
//   responsibility instance, scheduled project task, or standalone task.
//
// origin / origin_id is polymorphic by design (per spec). App-level
// integrity: when origin='responsibility', origin_id → responsibilities.id;
// when origin='project', origin_id → project_tasks.id; when
// origin='standalone', origin_id is NULL.
//
// Hybrid recurrence model:
//   * MASTER row     — recurrence_rule IS NOT NULL, is_override = 0.
//                      Persists once; instances are expanded on read by
//                      the recurrence engine (server/recurrence.ts).
//   * OVERRIDE row   — is_override = 1, series_id = master.series_id,
//                      original_date = the virtual instance date this row
//                      replaces. date = the new actual date (== original_date
//                      for in-place edits like color/time/state changes,
//                      != original_date when the user moved the instance).
//   * STANDALONE row — recurrence_rule IS NULL, series_id IS NULL,
//                      is_override = 0. A one-off scheduled task.
//
// Read rule for chip color: COALESCE(agenda_tasks.color, responsibilities.color)
// when joined; agenda_tasks.color is NULL for origin='responsibility', set otherwise.
export const agendaTasks = sqliteTable("agenda_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  origin: text("origin").notNull(), // 'responsibility' | 'project' | 'standalone'
  originId: integer("origin_id"), // null when origin='standalone'
  // Title goes one column beyond the §23 literal — required because standalone
  // tasks have nowhere else to put their name (responsibility/project rows can
  // join their title from the linked record). Read rule:
  //   COALESCE(agenda_tasks.title, responsibilities.name, project_tasks.title)
  // Approved Phase 3a, same pattern as original_date in Phase 2.
  title: text("title"),
  date: text("date").notNull(), // YYYY-MM-DD (start date for all-day events)
  // Phase 3c — multi-day all-day events. Nullable; only meaningful when
  // isAllDay = 1. When set, must be >= date. NULL means single-day all-day
  // (date == endDate effectively). Always NULL on timed rows.
  // Window-merge (§22a) overlap test for all-day rows is:
  //   date <= windowEnd AND COALESCE(endDate, date) >= windowStart
  // Recurrence: virtual instances inherit the master's span (same number of
  // days difference); see expandMasterToWindow in storage.ts.
  endDate: text("end_date"),
  time: text("time"), // HH:MM, null when isAllDay = 1
  durationMinutes: integer("duration_minutes"), // null when isAllDay = 1
  isAllDay: integer("is_all_day").notNull().default(0),
  roleId: integer("role_id"), // nullable; standalone tasks may have no role
  status: text("status").notNull().default("ready"), // 'ready' | 'note' | 'unavailable'
  color: text("color"), // null when origin='responsibility' (joins to responsibilities.color)
  recurrenceRule: text("recurrence_rule"),
  recurrenceEndDate: text("recurrence_end_date"), // required when recurrenceRule IS NOT NULL
  seriesId: integer("series_id"), // groups all instances + overrides of one series
  isOverride: integer("is_override").notNull().default(0),
  // Hybrid model bookkeeping (one column beyond §23; necessary to map
  // an override row back to the virtual instance it replaces).
  originalDate: text("original_date"), // YYYY-MM-DD; null unless isOverride=1
  // PR #15 — "Delete just this occurrence" stores a cancellation override:
  //   isOverride=1, isCancelled=1, originalDate=virtual instance date.
  // The window query skips virtual instances whose (seriesId, originalDate)
  // hits a cancellation row. Symmetric with edit-this (which writes an
  // override row that REPLACES the virtual instance); cancellation just
  // omits it. Mirrors Google's status=cancelled exception events.
  isCancelled: integer("is_cancelled").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================
// SUPPORT REQUESTS
// ============================================================

export const supportRequests = sqliteTable("support_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  description: text("description").notNull(),
  screenshotBase64: text("screenshot_base64"),
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  screenSize: text("screen_size"),
  status: text("status").notNull().default("open"), // "open" | "resolved"
  resolvedAt: text("resolved_at"),
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
  claritySkipRitual: integer("clarity_skip_ritual").notNull().default(0), // 0 | 1
});

// ============================================================
// INSERT SCHEMAS & TYPES
// ============================================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertInvitationSchema = createInsertSchema(invitations).omit({ id: true });

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertInboxItemSchema = createInsertSchema(inboxItems).omit({ id: true });
export const insertWeeklyReviewSchema = createInsertSchema(weeklyReviews).omit({ id: true });

export const insertEnvironmentPersonSchema = createInsertSchema(environmentPeople).omit({ id: true });
export const insertEnvironmentPlaceSchema = createInsertSchema(environmentPlaces).omit({ id: true });
export const insertEnvironmentThingSchema = createInsertSchema(environmentThings).omit({ id: true });
export const insertEnvironmentProviderSchema = createInsertSchema(environmentProviders).omit({ id: true });
export const insertEnvironmentConditionSchema = createInsertSchema(environmentConditions).omit({ id: true });
export const insertProjectEnvironmentSchema = createInsertSchema(projectEnvironment).omit({ id: true });
export const insertResponsibilitySchema = createInsertSchema(responsibilities).omit({ id: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true });
export const insertRolePeopleSchema = createInsertSchema(rolePeople).omit({ id: true });
export const insertResponsibilityRoleSchema = createInsertSchema(responsibilityRole).omit({ id: true });
export const insertResponsibilityPeopleSchema = createInsertSchema(responsibilityPeople).omit({ id: true });
export const insertResponsibilityPlaceSchema = createInsertSchema(responsibilityPlaces).omit({ id: true });
export const insertResponsibilityThingSchema = createInsertSchema(responsibilityThings).omit({ id: true });
export const insertResponsibilityProviderSchema = createInsertSchema(responsibilityProviders).omit({ id: true });
export const insertResponsibilityConditionSchema = createInsertSchema(responsibilityConditions).omit({ id: true });
export const insertProjectResponsibilitySchema = createInsertSchema(projectResponsibility).omit({ id: true });
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true });
export const insertAgendaTaskSchema = createInsertSchema(agendaTasks).omit({ id: true });

export const insertPreferencesSchema = createInsertSchema(preferences).omit({ id: true });
export const insertSupportRequestSchema = createInsertSchema(supportRequests).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InboxItem = typeof inboxItems.$inferSelect;
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type InsertWeeklyReview = z.infer<typeof insertWeeklyReviewSchema>;

export type EnvironmentPerson = typeof environmentPeople.$inferSelect;
export type InsertEnvironmentPerson = z.infer<typeof insertEnvironmentPersonSchema>;
export type EnvironmentPlace = typeof environmentPlaces.$inferSelect;
export type InsertEnvironmentPlace = z.infer<typeof insertEnvironmentPlaceSchema>;
export type EnvironmentThing = typeof environmentThings.$inferSelect;
export type InsertEnvironmentThing = z.infer<typeof insertEnvironmentThingSchema>;
export type EnvironmentProvider = typeof environmentProviders.$inferSelect;
export type InsertEnvironmentProvider = z.infer<typeof insertEnvironmentProviderSchema>;
export type EnvironmentCondition = typeof environmentConditions.$inferSelect;
export type InsertEnvironmentCondition = z.infer<typeof insertEnvironmentConditionSchema>;
export type ProjectEnvironment = typeof projectEnvironment.$inferSelect;
export type InsertProjectEnvironment = z.infer<typeof insertProjectEnvironmentSchema>;
export type Responsibility = typeof responsibilities.$inferSelect;
export type InsertResponsibility = z.infer<typeof insertResponsibilitySchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RolePeople = typeof rolePeople.$inferSelect;
export type InsertRolePeople = z.infer<typeof insertRolePeopleSchema>;
export type ResponsibilityRole = typeof responsibilityRole.$inferSelect;
export type InsertResponsibilityRole = z.infer<typeof insertResponsibilityRoleSchema>;
export type ResponsibilityPeople = typeof responsibilityPeople.$inferSelect;
export type InsertResponsibilityPeople = z.infer<typeof insertResponsibilityPeopleSchema>;
export type ResponsibilityPlace = typeof responsibilityPlaces.$inferSelect;
export type InsertResponsibilityPlace = z.infer<typeof insertResponsibilityPlaceSchema>;
export type ResponsibilityThing = typeof responsibilityThings.$inferSelect;
export type InsertResponsibilityThing = z.infer<typeof insertResponsibilityThingSchema>;
export type ResponsibilityProvider = typeof responsibilityProviders.$inferSelect;
export type InsertResponsibilityProvider = z.infer<typeof insertResponsibilityProviderSchema>;
export type ResponsibilityCondition = typeof responsibilityConditions.$inferSelect;
export type InsertResponsibilityCondition = z.infer<typeof insertResponsibilityConditionSchema>;
export type ProjectResponsibility = typeof projectResponsibility.$inferSelect;
export type InsertProjectResponsibility = z.infer<typeof insertProjectResponsibilitySchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type AgendaTask = typeof agendaTasks.$inferSelect;
export type InsertAgendaTask = z.infer<typeof insertAgendaTaskSchema>;

// Phase 1 enum constants — single source of truth for validators.
export const SUPPORT_STATES = ["available", "at_risk", "unavailable", "archived"] as const;
export const RELATIONSHIP_TYPES = ["primary", "secondary", "optional", "temporary_workaround"] as const;
export const IMPORTANCE_LEVELS = ["critical", "important", "helpful"] as const;
export const PROJECT_TRIGGERS = ["missing_support", "repeated_friction", "major_life_change", "new_identity_shift"] as const;
export type SupportState = typeof SUPPORT_STATES[number];
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];
export type ImportanceLevel = typeof IMPORTANCE_LEVELS[number];
export type ProjectTrigger = typeof PROJECT_TRIGGERS[number];

// Phase 2 enum constants.
export const AGENDA_ORIGINS = ["responsibility", "project", "standalone"] as const;
export const AGENDA_STATUSES = ["ready", "note", "unavailable"] as const;
export const AGENDA_VIEWS = ["day", "3day", "week", "month"] as const;
export const PROJECT_TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type AgendaOrigin = typeof AGENDA_ORIGINS[number];
export type AgendaStatus = typeof AGENDA_STATUSES[number];
export type AgendaView = typeof AGENDA_VIEWS[number];
export type ProjectTaskStatus = typeof PROJECT_TASK_STATUSES[number];

export type Preferences = typeof preferences.$inferSelect;
export type InsertPreferences = z.infer<typeof insertPreferencesSchema>;

export type SupportRequest = typeof supportRequests.$inferSelect;
export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
