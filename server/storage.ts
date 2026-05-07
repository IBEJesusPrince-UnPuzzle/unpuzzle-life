import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc, isNull, gte, or } from "drizzle-orm";
import {
  users, invitations,
  projects, inboxItems, weeklyReviews,
  preferences,
  // V2 tables
  environmentPeople, environmentPlaces, environmentThings,
  projectEnvironment, responsibilities, roles, rolePeople,
  type User, type InsertUser,
  type Invitation, type InsertInvitation,
  type Project, type InsertProject,
  type InboxItem, type InsertInboxItem,
  type WeeklyReview, type InsertWeeklyReview,
  type Preferences,
  // V2 types
  type EnvironmentPerson, type InsertEnvironmentPerson,
  type EnvironmentPlace, type InsertEnvironmentPlace,
  type EnvironmentThing, type InsertEnvironmentThing,
  type ProjectEnvironment, type InsertProjectEnvironment,
  type Responsibility, type InsertResponsibility,
  type Role, type InsertRole,
  type RolePeople, type InsertRolePeople,
} from "@shared/schema";

const dbPath = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// ============================================================
// PHASE 0 — NUKE-ON-BOOT (TEMPORARY — remove in Phase 3)
// ============================================================
// While the v8 schema is still in flux (Phases 0-2), every boot drops
// every table and recreates from scratch. This is safe ONLY because
// there is no real user data yet — the single admin user is recreated
// by seedSuperAdmin() on every boot from ADMIN_EMAIL/ADMIN_PASSWORD.
//
// Once Phase 3 ships, real data starts accumulating; replace this
// block with proper additive migrations (ALTER TABLE ADD COLUMN, etc.).
//
// Foreign keys must be OFF for the drops because legacy and surviving
// tables hold FKs at each other and SQLite refuses to drop a parent
// while a child references it.
sqlite.pragma("foreign_keys = OFF");

const tablesToNuke = [
  // Legacy (Atomic Habits stack) — removed in v8
  "identity_votes",
  "identities",
  "area_vision_snapshots",
  "areas",
  "purposes",
  "routine_items",
  "routine_logs",
  "planner_tasks",
  "wizard_state",
  "wizard_drafts",
  "draft_reviews",
  "daily_reflections",
  "environment_entities",
  "beliefs",
  "anti_habits",
  "immutable_law_logs",
  "immutable_laws",
  "non_negotiables",
  "horizon_items",
  "habit_logs",
  "habits",
  "actions",
  "goals",
  "visions",
  "tasks",
  // Surviving tables (recreated below) — nuked because schema is in flux
  "role_people",
  "roles",
  "responsibilities",
  "project_environment",
  "environment_things",
  "environment_places",
  "environment_people",
  "weekly_reviews",
  "inbox_items",
  "projects",
  "preferences",
  "support_requests",
  "invitations",
  "users",
];
for (const t of tablesToNuke) {
  sqlite.exec(`DROP TABLE IF EXISTS ${t}`);
}

// ============================================================
// TABLE CREATION (surviving tables only)
// ============================================================
sqlite.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    invited_by INTEGER,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
  );

  CREATE TABLE inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    notes TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    processed_as TEXT,
    deleted_at TEXT,
    reference_project_id INTEGER REFERENCES projects(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE weekly_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    week_of TEXT NOT NULL,
    wins TEXT,
    lessons TEXT,
    next_week_focus TEXT,
    inbox_cleared INTEGER NOT NULL DEFAULT 0,
    projects_reviewed INTEGER NOT NULL DEFAULT 0,
    habits_reviewed INTEGER NOT NULL DEFAULT 0,
    puzzle_piece_ratings TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    display_name TEXT NOT NULL DEFAULT '',
    time_format TEXT NOT NULL DEFAULT '12h',
    clarity_skip_ritual INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE environment_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    relationship TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE environment_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE environment_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    category TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE project_environment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL
  );

  CREATE TABLE responsibilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    day_of_week TEXT,
    custom_cron_expr TEXT,
    is_preset INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    day_of_week TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE role_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL
  );

  CREATE TABLE support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    screenshot_base64 TEXT,
    page_url TEXT,
    user_agent TEXT,
    screen_size TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );
`);

// Insert default preferences row if none exists
try {
  const prefRow = sqlite.prepare("SELECT id FROM preferences LIMIT 1").get();
  if (!prefRow) {
    sqlite.exec("INSERT INTO preferences (user_id, display_name, time_format) VALUES (1, '', '12h')");
  }
} catch (_) { /* table will be handled above */ }

// Schema migration complete — re-enable foreign key enforcement for runtime queries.
sqlite.pragma("foreign_keys = ON");

export { sqlite };
export const db = drizzle(sqlite);

export interface IStorage {
  // Users
  getUserById(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  createUser(data: InsertUser): User;
  updateUser(id: number, data: Partial<InsertUser>): User | undefined;
  getAllUsers(): User[];

  // Invitations
  getInvitations(): Invitation[];
  getInvitationByToken(token: string): Invitation | undefined;
  createInvitation(data: InsertInvitation): Invitation;
  updateInvitation(id: number, data: Partial<InsertInvitation>): Invitation | undefined;
  deleteInvitation(id: number): void;

  // Projects
  getProjects(userId: number): Project[];
  createProject(userId: number, data: InsertProject): Project;
  updateProject(userId: number, id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(userId: number, id: number): void;

  // Inbox
  getInboxItems(userId: number): InboxItem[];
  getTrashedInboxItems(userId: number): InboxItem[];
  createInboxItem(userId: number, data: InsertInboxItem): InboxItem;
  updateInboxItem(userId: number, id: number, data: Partial<InsertInboxItem>): InboxItem | undefined;
  softDeleteInboxItem(userId: number, id: number): InboxItem | undefined;
  restoreInboxItem(userId: number, id: number): InboxItem | undefined;
  deleteInboxItem(userId: number, id: number): void;

  // Weekly Reviews
  getWeeklyReviews(userId: number): WeeklyReview[];
  createWeeklyReview(userId: number, data: InsertWeeklyReview): WeeklyReview;
  updateWeeklyReview(userId: number, id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined;

  // Preferences
  getPreferences(userId: number): { displayName: string; timeFormat: string; claritySkipRitual: boolean };
  updatePreferences(userId: number, data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean }): { displayName: string; timeFormat: string; claritySkipRitual: boolean };

  // V2: Environment People
  getEnvironmentPeople(userId: number): EnvironmentPerson[];
  createEnvironmentPerson(userId: number, data: InsertEnvironmentPerson): EnvironmentPerson;
  updateEnvironmentPerson(userId: number, id: number, data: Partial<InsertEnvironmentPerson>): EnvironmentPerson | undefined;
  deleteEnvironmentPerson(userId: number, id: number): void;

  // V2: Environment Places
  getEnvironmentPlaces(userId: number): EnvironmentPlace[];
  createEnvironmentPlace(userId: number, data: InsertEnvironmentPlace): EnvironmentPlace;
  updateEnvironmentPlace(userId: number, id: number, data: Partial<InsertEnvironmentPlace>): EnvironmentPlace | undefined;
  deleteEnvironmentPlace(userId: number, id: number): void;

  // V2: Environment Things
  getEnvironmentThings(userId: number): EnvironmentThing[];
  createEnvironmentThing(userId: number, data: InsertEnvironmentThing): EnvironmentThing;
  updateEnvironmentThing(userId: number, id: number, data: Partial<InsertEnvironmentThing>): EnvironmentThing | undefined;
  deleteEnvironmentThing(userId: number, id: number): void;

  // V2: Project Environment (junction)
  getProjectEnvironment(projectId: number): ProjectEnvironment[];
  addProjectEnvironment(data: InsertProjectEnvironment): ProjectEnvironment;
  removeProjectEnvironment(id: number): void;

  // V2: Responsibilities
  getResponsibilities(userId: number): Responsibility[];
  createResponsibility(userId: number, data: InsertResponsibility): Responsibility;
  updateResponsibility(userId: number, id: number, data: Partial<InsertResponsibility>): Responsibility | undefined;
  deleteResponsibility(userId: number, id: number): void;

  // V2: Roles
  getRoles(userId: number): Role[];
  createRole(userId: number, data: InsertRole): Role;
  updateRole(userId: number, id: number, data: Partial<InsertRole>): Role | undefined;
  deleteRole(userId: number, id: number): void;

  // V2: Role People (junction)
  getRolePeople(roleId: number): RolePeople[];
  addRolePerson(data: InsertRolePeople): RolePeople;
  removeRolePerson(id: number): void;

  // Reset
  resetDatabase(userId: number): void;
}

export class DatabaseStorage implements IStorage {
  // Users
  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }
  createUser(data: InsertUser): User {
    return db.insert(users).values(data).returning().get();
  }
  updateUser(id: number, data: Partial<InsertUser>): User | undefined {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }
  getAllUsers(): User[] {
    return db.select().from(users).all();
  }

  // Invitations
  getInvitations(): Invitation[] {
    return db.select().from(invitations).orderBy(desc(invitations.createdAt)).all();
  }
  getInvitationByToken(token: string): Invitation | undefined {
    return db.select().from(invitations).where(eq(invitations.token, token)).get();
  }
  createInvitation(data: InsertInvitation): Invitation {
    return db.insert(invitations).values(data).returning().get();
  }
  updateInvitation(id: number, data: Partial<InsertInvitation>): Invitation | undefined {
    return db.update(invitations).set(data).where(eq(invitations.id, id)).returning().get();
  }
  deleteInvitation(id: number): void {
    db.delete(invitations).where(eq(invitations.id, id)).run();
  }

  // Projects
  getProjects(userId: number): Project[] {
    return db.select().from(projects).where(and(eq(projects.userId, userId), or(eq(projects.archived, 0), isNull(projects.archived)))).orderBy(desc(projects.createdAt)).all();
  }
  createProject(userId: number, data: InsertProject): Project {
    return db.insert(projects).values({ ...data, userId }).returning().get();
  }
  updateProject(userId: number, id: number, data: Partial<InsertProject>): Project | undefined {
    return db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning().get();
  }
  deleteProject(userId: number, id: number): void {
    db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).run();
  }

  // Inbox
  getInboxItems(userId: number): InboxItem[] {
    return db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId), isNull(inboxItems.deletedAt))).orderBy(desc(inboxItems.createdAt)).all();
  }
  getTrashedInboxItems(userId: number): InboxItem[] {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return db.select().from(inboxItems)
      .where(and(
        eq(inboxItems.userId, userId),
        gte(inboxItems.deletedAt, sevenDaysAgo),
      ))
      .orderBy(desc(inboxItems.deletedAt)).all();
  }
  createInboxItem(userId: number, data: InsertInboxItem): InboxItem {
    return db.insert(inboxItems).values({ ...data, userId }).returning().get();
  }
  updateInboxItem(userId: number, id: number, data: Partial<InsertInboxItem>): InboxItem | undefined {
    return db.update(inboxItems).set(data).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning().get();
  }
  softDeleteInboxItem(userId: number, id: number): InboxItem | undefined {
    return db.update(inboxItems).set({
      deletedAt: new Date().toISOString(),
      processed: 1,
      processedAs: "trash",
    }).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning().get();
  }
  restoreInboxItem(userId: number, id: number): InboxItem | undefined {
    return db.update(inboxItems).set({
      deletedAt: null,
      processed: 0,
      processedAs: null,
    }).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning().get();
  }
  deleteInboxItem(userId: number, id: number): void {
    db.delete(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).run();
  }

  // Weekly Reviews
  getWeeklyReviews(userId: number): WeeklyReview[] {
    return db.select().from(weeklyReviews).where(eq(weeklyReviews.userId, userId)).orderBy(desc(weeklyReviews.weekOf)).all();
  }
  createWeeklyReview(userId: number, data: InsertWeeklyReview): WeeklyReview {
    return db.insert(weeklyReviews).values({ ...data, userId }).returning().get();
  }
  updateWeeklyReview(userId: number, id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined {
    return db.update(weeklyReviews).set(data).where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, userId))).returning().get();
  }

  // Preferences
  getPreferences(userId: number): { displayName: string; timeFormat: string; claritySkipRitual: boolean } {
    const row = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (!row) return { displayName: "", timeFormat: "12h", claritySkipRitual: false };
    return {
      displayName: row.displayName,
      timeFormat: row.timeFormat,
      claritySkipRitual: !!row.claritySkipRitual,
    };
  }
  updatePreferences(
    userId: number,
    data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean },
  ): { displayName: string; timeFormat: string; claritySkipRitual: boolean } {
    const existing = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (existing) {
      const updated: any = {};
      if (data.displayName !== undefined) updated.displayName = data.displayName;
      if (data.timeFormat !== undefined) updated.timeFormat = data.timeFormat;
      if (data.claritySkipRitual !== undefined) updated.claritySkipRitual = data.claritySkipRitual ? 1 : 0;
      db.update(preferences).set(updated).where(eq(preferences.id, existing.id)).run();
    } else {
      db.insert(preferences).values({
        userId,
        displayName: data.displayName ?? "",
        timeFormat: data.timeFormat ?? "12h",
        claritySkipRitual: data.claritySkipRitual ? 1 : 0,
      }).run();
    }
    return this.getPreferences(userId);
  }

  // V2: Environment People
  getEnvironmentPeople(userId: number): EnvironmentPerson[] {
    return db.select().from(environmentPeople).where(eq(environmentPeople.userId, userId)).all();
  }
  createEnvironmentPerson(userId: number, data: InsertEnvironmentPerson): EnvironmentPerson {
    return db.insert(environmentPeople).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentPerson(userId: number, id: number, data: Partial<InsertEnvironmentPerson>): EnvironmentPerson | undefined {
    return db.update(environmentPeople).set(data).where(and(eq(environmentPeople.id, id), eq(environmentPeople.userId, userId))).returning().get();
  }
  deleteEnvironmentPerson(userId: number, id: number): void {
    db.delete(environmentPeople).where(and(eq(environmentPeople.id, id), eq(environmentPeople.userId, userId))).run();
  }

  // V2: Environment Places
  getEnvironmentPlaces(userId: number): EnvironmentPlace[] {
    return db.select().from(environmentPlaces).where(eq(environmentPlaces.userId, userId)).all();
  }
  createEnvironmentPlace(userId: number, data: InsertEnvironmentPlace): EnvironmentPlace {
    return db.insert(environmentPlaces).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentPlace(userId: number, id: number, data: Partial<InsertEnvironmentPlace>): EnvironmentPlace | undefined {
    return db.update(environmentPlaces).set(data).where(and(eq(environmentPlaces.id, id), eq(environmentPlaces.userId, userId))).returning().get();
  }
  deleteEnvironmentPlace(userId: number, id: number): void {
    db.delete(environmentPlaces).where(and(eq(environmentPlaces.id, id), eq(environmentPlaces.userId, userId))).run();
  }

  // V2: Environment Things
  getEnvironmentThings(userId: number): EnvironmentThing[] {
    return db.select().from(environmentThings).where(eq(environmentThings.userId, userId)).all();
  }
  createEnvironmentThing(userId: number, data: InsertEnvironmentThing): EnvironmentThing {
    return db.insert(environmentThings).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentThing(userId: number, id: number, data: Partial<InsertEnvironmentThing>): EnvironmentThing | undefined {
    return db.update(environmentThings).set(data).where(and(eq(environmentThings.id, id), eq(environmentThings.userId, userId))).returning().get();
  }
  deleteEnvironmentThing(userId: number, id: number): void {
    db.delete(environmentThings).where(and(eq(environmentThings.id, id), eq(environmentThings.userId, userId))).run();
  }

  // V2: Project Environment (junction)
  getProjectEnvironment(projectId: number): ProjectEnvironment[] {
    return db.select().from(projectEnvironment).where(eq(projectEnvironment.projectId, projectId)).all();
  }
  addProjectEnvironment(data: InsertProjectEnvironment): ProjectEnvironment {
    return db.insert(projectEnvironment).values(data).returning().get();
  }
  removeProjectEnvironment(id: number): void {
    db.delete(projectEnvironment).where(eq(projectEnvironment.id, id)).run();
  }

  // V2: Responsibilities
  getResponsibilities(userId: number): Responsibility[] {
    return db.select().from(responsibilities).where(eq(responsibilities.userId, userId)).all();
  }
  createResponsibility(userId: number, data: InsertResponsibility): Responsibility {
    return db.insert(responsibilities).values({ ...data, userId }).returning().get();
  }
  updateResponsibility(userId: number, id: number, data: Partial<InsertResponsibility>): Responsibility | undefined {
    return db.update(responsibilities).set(data).where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId))).returning().get();
  }
  deleteResponsibility(userId: number, id: number): void {
    db.delete(responsibilities).where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId))).run();
  }

  // V2: Roles
  getRoles(userId: number): Role[] {
    return db.select().from(roles).where(eq(roles.userId, userId)).all();
  }
  createRole(userId: number, data: InsertRole): Role {
    return db.insert(roles).values({ ...data, userId }).returning().get();
  }
  updateRole(userId: number, id: number, data: Partial<InsertRole>): Role | undefined {
    return db.update(roles).set(data).where(and(eq(roles.id, id), eq(roles.userId, userId))).returning().get();
  }
  deleteRole(userId: number, id: number): void {
    // Cascade: delete role_people entries first
    db.delete(rolePeople).where(eq(rolePeople.roleId, id)).run();
    db.delete(roles).where(and(eq(roles.id, id), eq(roles.userId, userId))).run();
  }

  // V2: Role People (junction)
  getRolePeople(roleId: number): RolePeople[] {
    return db.select().from(rolePeople).where(eq(rolePeople.roleId, roleId)).all();
  }
  addRolePerson(data: InsertRolePeople): RolePeople {
    return db.insert(rolePeople).values(data).returning().get();
  }
  removeRolePerson(id: number): void {
    db.delete(rolePeople).where(eq(rolePeople.id, id)).run();
  }

  // Reset (clears the surviving v8-relevant tables for this user)
  resetDatabase(userId: number): void {
    const tables = [
      "projects", "inbox_items", "weekly_reviews",
      "environment_people", "environment_places", "environment_things",
      "responsibilities", "roles",
    ];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table} WHERE user_id = ${userId}`);
    }
    // Clean orphans in junction tables (no user_id column)
    sqlite.exec(`DELETE FROM project_environment WHERE project_id NOT IN (SELECT id FROM projects)`);
    sqlite.exec(`DELETE FROM role_people WHERE role_id NOT IN (SELECT id FROM roles)`);
    // Reset preferences to defaults for this user
    sqlite.exec(`UPDATE preferences SET display_name = '', time_format = '12h', clarity_skip_ritual = 0 WHERE user_id = ${userId}`);
  }
}

export const storage = new DatabaseStorage();
