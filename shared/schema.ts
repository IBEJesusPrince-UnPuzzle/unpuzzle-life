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
// PROJECTS (Phase 0: identity/area/puzzle_piece columns dropped)
// ============================================================

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  description: text("description"),
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
// V2: SHARED ENVIRONMENT (People, Places, Things)
// ============================================================

export const environmentPeople = sqliteTable("environment_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  relationship: text("relationship"),
  createdAt: text("created_at").notNull(),
});

export const environmentPlaces = sqliteTable("environment_places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  type: text("type"),
  createdAt: text("created_at").notNull(),
});

export const environmentThings = sqliteTable("environment_things", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  category: text("category"),
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

export const responsibilities = sqliteTable("responsibilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  cadence: text("cadence").notNull().default("weekly"), // daily | weekly | biweekly | monthly | custom
  dayOfWeek: text("day_of_week"),
  customCronExpr: text("custom_cron_expr"),
  isPreset: integer("is_preset").notNull().default(0),
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

// Junction: links roles to people (supports groups)
export const rolePeople = sqliteTable("role_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull(),
  personId: integer("person_id").notNull(),
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
export const insertProjectEnvironmentSchema = createInsertSchema(projectEnvironment).omit({ id: true });
export const insertResponsibilitySchema = createInsertSchema(responsibilities).omit({ id: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true });
export const insertRolePeopleSchema = createInsertSchema(rolePeople).omit({ id: true });

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
export type ProjectEnvironment = typeof projectEnvironment.$inferSelect;
export type InsertProjectEnvironment = z.infer<typeof insertProjectEnvironmentSchema>;
export type Responsibility = typeof responsibilities.$inferSelect;
export type InsertResponsibility = z.infer<typeof insertResponsibilitySchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RolePeople = typeof rolePeople.$inferSelect;
export type InsertRolePeople = z.infer<typeof insertRolePeopleSchema>;

export type Preferences = typeof preferences.$inferSelect;
export type InsertPreferences = z.infer<typeof insertPreferencesSchema>;

export type SupportRequest = typeof supportRequests.$inferSelect;
export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
