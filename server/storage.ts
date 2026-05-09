import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc, isNull, gte, or } from "drizzle-orm";
import {
  users, invitations,
  projects, inboxItems, weeklyReviews,
  preferences,
  // V2 support taxonomy
  environmentPeople, environmentPlaces, environmentThings,
  environmentProviders, environmentConditions,
  projectEnvironment, responsibilities, roles, rolePeople,
  // Phase 1 junctions
  responsibilityRole,
  responsibilityPeople, responsibilityPlaces, responsibilityThings,
  responsibilityProviders, responsibilityConditions,
  projectResponsibility,
  // Phase 2 calendar
  projectTasks, agendaTasks,
  type User, type InsertUser,
  type Invitation, type InsertInvitation,
  type Project, type InsertProject,
  type InboxItem, type InsertInboxItem,
  type WeeklyReview, type InsertWeeklyReview,
  type Preferences,
  type EnvironmentPerson, type InsertEnvironmentPerson,
  type EnvironmentPlace, type InsertEnvironmentPlace,
  type EnvironmentThing, type InsertEnvironmentThing,
  type EnvironmentProvider, type InsertEnvironmentProvider,
  type EnvironmentCondition, type InsertEnvironmentCondition,
  type ProjectEnvironment, type InsertProjectEnvironment,
  type Responsibility, type InsertResponsibility,
  type Role, type InsertRole,
  type RolePeople, type InsertRolePeople,
  type ResponsibilityRole, type InsertResponsibilityRole,
  type ResponsibilityPeople, type InsertResponsibilityPeople,
  type ResponsibilityPlace, type InsertResponsibilityPlace,
  type ResponsibilityThing, type InsertResponsibilityThing,
  type ResponsibilityProvider, type InsertResponsibilityProvider,
  type ResponsibilityCondition, type InsertResponsibilityCondition,
  type ProjectResponsibility, type InsertProjectResponsibility,
  type ProjectTask, type InsertProjectTask,
  type AgendaTask, type InsertAgendaTask,
} from "@shared/schema";
import { expandMaster, isoToUtcDate, utcDateToIso, type MasterRow } from "./recurrence";

// Phase 3c — helpers for the multi-day all-day endDate logic. These keep
// getAgendaWindow readable when computing per-occurrence span inheritance.
function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = isoToUtcDate(fromIso).getTime();
  const b = isoToUtcDate(toIso).getTime();
  return Math.round((b - a) / 86400000);
}
function addDaysIso(iso: string, days: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToIso(d);
}
// All-day overlap test: a row whose [date, COALESCE(endDate, date)] interval
// touches the [windowStart, windowEnd] window in any way is included.
// This is symmetric — the row's interval and window's interval overlap iff
// row.start <= window.end AND row.end >= window.start.
function allDayOverlapsWindow(
  rowDate: string,
  rowEndDate: string | null | undefined,
  windowStart: string,
  windowEnd: string,
): boolean {
  const rowEnd = rowEndDate && rowEndDate >= rowDate ? rowEndDate : rowDate;
  return rowDate <= windowEnd && rowEnd >= windowStart;
}

const dbPath = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// ============================================================
// PHASE 3a — MIGRATIONS ON (nuke-on-boot retired)
// ============================================================
// Phases 0-2 used a destructive nuke-on-boot strategy: every boot
// dropped all tables and recreated them. That was safe while there
// was no real user data, but unsafe once the app starts accumulating
// agenda items, projects, responsibilities, etc.
//
// From Phase 3a forward:
//   - All CREATE TABLE statements use IF NOT EXISTS (idempotent).
//   - Schema additions ship as additive ALTER TABLE migrations,
//     wrapped in try/catch so they're idempotent (re-running is a
//     no-op when the column already exists).
//   - Destructive changes need an explicit migration step.
//
// Foreign keys are turned OFF for the brief migration window (so
// ALTER TABLE statements don't trip cascade rules), then turned
// back ON after CREATE TABLE statements run.
sqlite.pragma("foreign_keys = OFF");

// Additive migrations — each wrapped so re-runs are no-ops.
// Order: run BEFORE the CREATE TABLE block so columns exist on
// freshly-created tables AND on tables created by an earlier boot.
function tryMigration(label: string, sql: string) {
  try {
    sqlite.exec(sql);
  } catch (e: any) {
    // Expected failures (column already exists, table doesn't exist yet) are fine.
    // Anything else, surface in the log so it's debuggable.
    const msg = String(e?.message ?? e);
    const benign =
      msg.includes("duplicate column") ||
      msg.includes("no such table");
    if (!benign) {
      console.warn(`[migration:${label}] unexpected:`, msg);
    }
  }
}

// Phase 3a — agenda_tasks gains a `title` column for standalone tasks
// (created via the Agenda + Task button) that are not linked to a
// responsibility or project_task. Linked rows still derive their title
// from the joined record; this column is the standalone path.
tryMigration("agenda_tasks.title", `ALTER TABLE agenda_tasks ADD COLUMN title TEXT`);

// Phase 3c — agenda_tasks gains an `end_date` column for multi-day all-day
// events (e.g. "Teacher Appreciation Week" Tue–Fri). Nullable; only meaningful
// when is_all_day = 1. When set on an all-day row it must be >= date. Always
// null on timed rows. Backfill is a no-op — existing all-day rows stay null
// and render as single-day, identical to before.
tryMigration("agenda_tasks.end_date", `ALTER TABLE agenda_tasks ADD COLUMN end_date TEXT`);

// PR #15 — agenda_tasks gains an `is_cancelled` column for the
// "Delete just this occurrence" scope. Override row with isCancelled=1
// hides the virtual instance from the window query (Google parity:
// status=cancelled exception event).
tryMigration("agenda_tasks.is_cancelled", `ALTER TABLE agenda_tasks ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0`);

// ============================================================
// TABLE CREATION (idempotent — IF NOT EXISTS)
// ============================================================
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    invited_by INTEGER,
    agenda_default_view TEXT NOT NULL DEFAULT 'day',
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    trigger TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS inbox_items (
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

  CREATE TABLE IF NOT EXISTS weekly_reviews (
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

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    display_name TEXT NOT NULL DEFAULT '',
    time_format TEXT NOT NULL DEFAULT '12h',
    clarity_skip_ritual INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS environment_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    relationship TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    category TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_environment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responsibilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    day_of_week TEXT,
    custom_cron_expr TEXT,
    is_preset INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    recurrence_rule TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    day_of_week TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responsibility_role (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    role_id INTEGER NOT NULL REFERENCES roles(id)
  );

  CREATE TABLE IF NOT EXISTS responsibility_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    person_id INTEGER NOT NULL REFERENCES environment_people(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS responsibility_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    place_id INTEGER NOT NULL REFERENCES environment_places(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS responsibility_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    thing_id INTEGER NOT NULL REFERENCES environment_things(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS responsibility_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    provider_id INTEGER NOT NULL REFERENCES environment_providers(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS responsibility_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    condition_id INTEGER NOT NULL REFERENCES environment_conditions(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS project_responsibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    responsibility_id INTEGER NOT NULL REFERENCES responsibilities(id),
    is_primary INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    recurrence_rule TEXT,
    recurrence_end_date TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agenda_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    origin TEXT NOT NULL,
    origin_id INTEGER,
    title TEXT,
    date TEXT NOT NULL,
    end_date TEXT,
    time TEXT,
    duration_minutes INTEGER,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    role_id INTEGER,
    status TEXT NOT NULL DEFAULT 'ready',
    color TEXT,
    recurrence_rule TEXT,
    recurrence_end_date TEXT,
    series_id INTEGER,
    is_override INTEGER NOT NULL DEFAULT 0,
    original_date TEXT,
    is_cancelled INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_requests (
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

  // Phase 1: Environment Providers
  getEnvironmentProviders(userId: number): EnvironmentProvider[];
  createEnvironmentProvider(userId: number, data: InsertEnvironmentProvider): EnvironmentProvider;
  updateEnvironmentProvider(userId: number, id: number, data: Partial<InsertEnvironmentProvider>): EnvironmentProvider | undefined;
  deleteEnvironmentProvider(userId: number, id: number): void;

  // Phase 1: Environment Conditions
  getEnvironmentConditions(userId: number): EnvironmentCondition[];
  createEnvironmentCondition(userId: number, data: InsertEnvironmentCondition): EnvironmentCondition;
  updateEnvironmentCondition(userId: number, id: number, data: Partial<InsertEnvironmentCondition>): EnvironmentCondition | undefined;
  deleteEnvironmentCondition(userId: number, id: number): void;

  // Phase 1: Support state setter (works for all 5 support categories)
  setSupportState(supportType: "people" | "places" | "things" | "providers" | "conditions", userId: number, id: number, state: string): any;

  // Phase 1: Responsibility ↔ Role junction
  getResponsibilityRoles(responsibilityId: number): ResponsibilityRole[];
  linkResponsibilityRole(data: InsertResponsibilityRole): ResponsibilityRole;
  unlinkResponsibilityRole(id: number): void;

  // Phase 1: Responsibility ↔ Support junctions (one method set, dispatches by type)
  getResponsibilitySupports(responsibilityId: number, supportType: "people" | "places" | "things" | "providers" | "conditions"): any[];
  linkResponsibilitySupport(supportType: "people" | "places" | "things" | "providers" | "conditions", data: any): any;
  updateResponsibilitySupportLink(supportType: "people" | "places" | "things" | "providers" | "conditions", id: number, data: { relationshipType?: string; importance?: string }): any;
  unlinkResponsibilitySupport(supportType: "people" | "places" | "things" | "providers" | "conditions", id: number): void;

  // Phase 1: Project ↔ Responsibility junction
  getProjectResponsibilities(projectId: number): ProjectResponsibility[];
  linkProjectResponsibility(data: InsertProjectResponsibility): ProjectResponsibility;
  unlinkProjectResponsibility(id: number): void;

  // Phase 2: Project tasks
  getProjectTasks(userId: number, projectId?: number): ProjectTask[];
  getProjectTask(userId: number, id: number): ProjectTask | undefined;
  createProjectTask(userId: number, data: InsertProjectTask): ProjectTask;
  updateProjectTask(userId: number, id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined;
  deleteProjectTask(userId: number, id: number): void;

  // Phase 2: Agenda tasks (raw rows; no expansion)
  getAgendaTask(userId: number, id: number): AgendaTask | undefined;
  createAgendaTask(userId: number, data: InsertAgendaTask): AgendaTask;
  updateAgendaTask(userId: number, id: number, data: Partial<InsertAgendaTask>): AgendaTask | undefined;
  deleteAgendaTask(userId: number, id: number): void;

  // Phase 2: Agenda window query (hybrid expansion)
  getAgendaWindow(userId: number, windowStart: string, windowEnd: string): Array<AgendaTask & {
    isVirtual: boolean;
    masterId: number;
    originalDate: string | null;
  }>;

  // Phase 2: agenda default view
  getAgendaDefaultView(userId: number): string;
  setAgendaDefaultView(userId: number, view: string): void;

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

  // ============================================================
  // PHASE 1: ENVIRONMENT PROVIDERS
  // ============================================================
  getEnvironmentProviders(userId: number): EnvironmentProvider[] {
    return db.select().from(environmentProviders).where(eq(environmentProviders.userId, userId)).all();
  }
  createEnvironmentProvider(userId: number, data: InsertEnvironmentProvider): EnvironmentProvider {
    return db.insert(environmentProviders).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentProvider(userId: number, id: number, data: Partial<InsertEnvironmentProvider>): EnvironmentProvider | undefined {
    return db.update(environmentProviders).set(data).where(and(eq(environmentProviders.id, id), eq(environmentProviders.userId, userId))).returning().get();
  }
  deleteEnvironmentProvider(userId: number, id: number): void {
    db.delete(environmentProviders).where(and(eq(environmentProviders.id, id), eq(environmentProviders.userId, userId))).run();
  }

  // ============================================================
  // PHASE 1: ENVIRONMENT CONDITIONS
  // ============================================================
  getEnvironmentConditions(userId: number): EnvironmentCondition[] {
    return db.select().from(environmentConditions).where(eq(environmentConditions.userId, userId)).all();
  }
  createEnvironmentCondition(userId: number, data: InsertEnvironmentCondition): EnvironmentCondition {
    return db.insert(environmentConditions).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentCondition(userId: number, id: number, data: Partial<InsertEnvironmentCondition>): EnvironmentCondition | undefined {
    return db.update(environmentConditions).set(data).where(and(eq(environmentConditions.id, id), eq(environmentConditions.userId, userId))).returning().get();
  }
  deleteEnvironmentCondition(userId: number, id: number): void {
    db.delete(environmentConditions).where(and(eq(environmentConditions.id, id), eq(environmentConditions.userId, userId))).run();
  }

  // ============================================================
  // PHASE 1: SUPPORT STATE SETTER (works for all 5 categories)
  // ============================================================
  setSupportState(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    userId: number,
    id: number,
    state: string,
  ): any {
    const tableMap = {
      people: { table: environmentPeople },
      places: { table: environmentPlaces },
      things: { table: environmentThings },
      providers: { table: environmentProviders },
      conditions: { table: environmentConditions },
    } as const;
    const t = tableMap[supportType].table as any;
    return db.update(t).set({ state }).where(and(eq(t.id, id), eq(t.userId, userId))).returning().get();
  }

  // ============================================================
  // PHASE 1: RESPONSIBILITY ↔ ROLE JUNCTION
  // ============================================================
  getResponsibilityRoles(responsibilityId: number): ResponsibilityRole[] {
    return db.select().from(responsibilityRole).where(eq(responsibilityRole.responsibilityId, responsibilityId)).all();
  }
  linkResponsibilityRole(data: InsertResponsibilityRole): ResponsibilityRole {
    return db.insert(responsibilityRole).values(data).returning().get();
  }
  unlinkResponsibilityRole(id: number): void {
    db.delete(responsibilityRole).where(eq(responsibilityRole.id, id)).run();
  }

  // ============================================================
  // PHASE 1: RESPONSIBILITY ↔ SUPPORT JUNCTIONS
  // ============================================================
  // Helper to get the right Drizzle table for a support type.
  private respSupportTable(supportType: "people" | "places" | "things" | "providers" | "conditions"): any {
    switch (supportType) {
      case "people":     return responsibilityPeople;
      case "places":     return responsibilityPlaces;
      case "things":     return responsibilityThings;
      case "providers":  return responsibilityProviders;
      case "conditions": return responsibilityConditions;
    }
  }
  getResponsibilitySupports(
    responsibilityId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
  ): any[] {
    const t = this.respSupportTable(supportType);
    return db.select().from(t).where(eq(t.responsibilityId, responsibilityId)).all();
  }
  linkResponsibilitySupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    data: any,
  ): any {
    const t = this.respSupportTable(supportType);
    return db.insert(t).values(data).returning().get();
  }
  updateResponsibilitySupportLink(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
    data: { relationshipType?: string; importance?: string },
  ): any {
    const t = this.respSupportTable(supportType);
    const updates: any = {};
    if (data.relationshipType !== undefined) updates.relationshipType = data.relationshipType;
    if (data.importance !== undefined) updates.importance = data.importance;
    return db.update(t).set(updates).where(eq(t.id, id)).returning().get();
  }
  unlinkResponsibilitySupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): void {
    const t = this.respSupportTable(supportType);
    db.delete(t).where(eq(t.id, id)).run();
  }

  // ============================================================
  // PHASE 1: PROJECT ↔ RESPONSIBILITY JUNCTION
  // ============================================================
  getProjectResponsibilities(projectId: number): ProjectResponsibility[] {
    return db.select().from(projectResponsibility).where(eq(projectResponsibility.projectId, projectId)).all();
  }
  linkProjectResponsibility(data: InsertProjectResponsibility): ProjectResponsibility {
    return db.insert(projectResponsibility).values(data).returning().get();
  }
  unlinkProjectResponsibility(id: number): void {
    db.delete(projectResponsibility).where(eq(projectResponsibility.id, id)).run();
  }

  // ============================================================
  // PHASE 2: PROJECT TASKS
  // ============================================================
  getProjectTasks(userId: number, projectId?: number): ProjectTask[] {
    if (projectId !== undefined) {
      return db.select().from(projectTasks)
        .where(and(eq(projectTasks.userId, userId), eq(projectTasks.projectId, projectId)))
        .orderBy(asc(projectTasks.id))
        .all();
    }
    return db.select().from(projectTasks).where(eq(projectTasks.userId, userId)).orderBy(asc(projectTasks.id)).all();
  }
  getProjectTask(userId: number, id: number): ProjectTask | undefined {
    return db.select().from(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId))).get();
  }
  createProjectTask(userId: number, data: InsertProjectTask): ProjectTask {
    return db.insert(projectTasks).values({ ...data, userId }).returning().get();
  }
  updateProjectTask(userId: number, id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined {
    return db.update(projectTasks).set(data)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId)))
      .returning().get();
  }
  deleteProjectTask(userId: number, id: number): void {
    db.delete(projectTasks).where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId))).run();
  }

  // ============================================================
  // PHASE 2: AGENDA TASKS (raw rows)
  // ============================================================
  getAgendaTask(userId: number, id: number): AgendaTask | undefined {
    return db.select().from(agendaTasks)
      .where(and(eq(agendaTasks.id, id), eq(agendaTasks.userId, userId))).get();
  }
  createAgendaTask(userId: number, data: InsertAgendaTask): AgendaTask {
    const now = new Date().toISOString();
    const row = db.insert(agendaTasks).values({
      ...data,
      userId,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    }).returning().get();
    // If this row is a master series (recurrence_rule set, no series_id yet, not an override),
    // assign series_id = id so future overrides have something to point at.
    if (row.recurrenceRule && !row.seriesId && !row.isOverride) {
      const updated = db.update(agendaTasks).set({ seriesId: row.id })
        .where(eq(agendaTasks.id, row.id)).returning().get();
      return updated || row;
    }
    return row;
  }
  updateAgendaTask(userId: number, id: number, data: Partial<InsertAgendaTask>): AgendaTask | undefined {
    const updates = { ...data, updatedAt: new Date().toISOString() };
    return db.update(agendaTasks).set(updates)
      .where(and(eq(agendaTasks.id, id), eq(agendaTasks.userId, userId)))
      .returning().get();
  }
  deleteAgendaTask(userId: number, id: number): void {
    // PR #15 — cascade override + cancellation rows when deleting a master.
    // If the row being deleted is a master (has its own seriesId pointing
    // to itself, by the auto-assign rule), drop every other row whose
    // seriesId matches — keeps overrides and cancellations from becoming
    // orphans pointing at a non-existent master. Standalone or override
    // deletes are unaffected (their seriesId is null or points elsewhere).
    const target = db.select().from(agendaTasks)
      .where(and(eq(agendaTasks.id, id), eq(agendaTasks.userId, userId))).get();
    if (target && target.recurrenceRule && target.seriesId === id) {
      db.delete(agendaTasks)
        .where(and(eq(agendaTasks.seriesId, id), eq(agendaTasks.userId, userId)))
        .run();
      return;
    }
    db.delete(agendaTasks).where(and(eq(agendaTasks.id, id), eq(agendaTasks.userId, userId))).run();
  }

  // ============================================================
  // PHASE 2: AGENDA WINDOW QUERY (hybrid expansion)
  // ============================================================
  // Returns every "thing on the calendar" for this user between
  // windowStart and windowEnd (inclusive, YYYY-MM-DD).
  //
  // Strategy:
  //   1. Pull all agenda_tasks rows for this user. Three classes:
  //      a. masters (recurrence_rule set, is_override=0)
  //      b. overrides (is_override=1, original_date set)
  //      c. standalones (no recurrence_rule, is_override=0)
  //   2. Expand each master into virtual instances inside the window.
  //   3. For each virtual instance, look up an override row keyed by
  //      (seriesId, originalDate). If found, the override REPLACES the
  //      virtual instance (and the override may have moved to a different date,
  //      possibly outside the window — we still drop the virtual one).
  //   4. Standalones whose `date` falls in the window are returned as-is.
  //   5. Overrides whose `date` falls in the window are returned as-is
  //      (they replace their virtual counterpart).
  //
  // Each returned item has `isVirtual: true` if it came from rule expansion
  // (so callers know mutations need to materialize an override row),
  // or `isVirtual: false` for real rows.
  getAgendaWindow(
    userId: number,
    windowStart: string,
    windowEnd: string,
  ): Array<AgendaTask & { isVirtual: boolean; masterId: number; originalDate: string | null }> {
    const rows = db.select().from(agendaTasks).where(eq(agendaTasks.userId, userId)).all();
    const masters: AgendaTask[] = [];
    const overrides: AgendaTask[] = [];
    const standalones: AgendaTask[] = [];
    for (const r of rows) {
      if (r.isOverride) overrides.push(r);
      else if (r.recurrenceRule) masters.push(r);
      else standalones.push(r);
    }

    // Index overrides by (seriesId, originalDate) for O(1) lookup during expansion.
    const overrideKey = (seriesId: number | null, originalDate: string | null) =>
      `${seriesId ?? "x"}|${originalDate ?? "x"}`;
    const overrideBySeriesAndDate = new Map<string, AgendaTask>();
    for (const o of overrides) {
      overrideBySeriesAndDate.set(overrideKey(o.seriesId, o.originalDate), o);
    }

    const out: Array<AgendaTask & { isVirtual: boolean; masterId: number; originalDate: string | null }> = [];

    // 1. Expand masters; skip virtual instances that have an override (regardless of where the override moved to).
    //    For multi-day all-day masters we expand a widened window so that an
    //    occurrence starting BEFORE windowStart but ending inside the window
    //    still appears. The widened window is [windowStart - spanDays, windowEnd].
    //    Each virtual instance inherits the master's span (Phase 3c).
    for (const m of masters) {
      const masterSpanDays =
        m.isAllDay === 1 && m.endDate && m.endDate >= m.date
          ? daysBetweenIso(m.date, m.endDate)
          : 0;
      const expandStart = masterSpanDays > 0 ? addDaysIso(windowStart, -masterSpanDays) : windowStart;
      const expanded = expandMaster(
        {
          id: m.id,
          seriesId: m.seriesId,
          recurrenceRule: m.recurrenceRule,
          recurrenceEndDate: m.recurrenceEndDate,
          date: m.date,
        } satisfies MasterRow,
        expandStart,
        windowEnd,
      );
      for (const inst of expanded) {
        // Per-occurrence endDate: same span as the master.
        const instEndDate = masterSpanDays > 0 ? addDaysIso(inst.date, masterSpanDays) : null;
        // Skip occurrences whose [inst.date, instEndDate] don't overlap the window.
        if (!allDayOverlapsWindow(inst.date, instEndDate, windowStart, windowEnd) && masterSpanDays > 0) {
          continue;
        }
        // For non-multi-day masters, the original date-in-window check still applies.
        if (masterSpanDays === 0 && (inst.date < windowStart || inst.date > windowEnd)) {
          continue;
        }
        const ov = overrideBySeriesAndDate.get(overrideKey(inst.seriesId, inst.date));
        if (ov) continue; // override will be added below if it falls in the window
        out.push({
          ...m,
          id: m.id, // virtual instance keeps the master id; clients use originalDate to disambiguate
          date: inst.date,
          endDate: instEndDate, // per-occurrence span (Phase 3c)
          isVirtual: true,
          masterId: m.id,
          originalDate: null,
        });
      }
    }

    // 2. Add overrides that land in the window (their `date` is the rendered date).
    //    All-day overrides use overlap test on [date, endDate] (Phase 3c).
    //    PR #15 — cancellation overrides (isCancelled=1) are bookkeeping-only:
    //    they hide the virtual instance in step 1 (overrideBySeriesAndDate hit)
    //    and must NOT render themselves. Skip them here.
    for (const o of overrides) {
      if (o.isCancelled === 1) continue;
      const inWindow =
        o.isAllDay === 1
          ? allDayOverlapsWindow(o.date, o.endDate, windowStart, windowEnd)
          : o.date >= windowStart && o.date <= windowEnd;
      if (inWindow) {
        out.push({
          ...o,
          isVirtual: false,
          masterId: o.seriesId ?? o.id,
          originalDate: o.originalDate,
        });
      }
    }

    // 3. Add standalones that land in the window.
    //    All-day standalones use overlap test on [date, endDate] (Phase 3c).
    for (const s of standalones) {
      const inWindow =
        s.isAllDay === 1
          ? allDayOverlapsWindow(s.date, s.endDate, windowStart, windowEnd)
          : s.date >= windowStart && s.date <= windowEnd;
      if (inWindow) {
        out.push({
          ...s,
          isVirtual: false,
          masterId: s.id,
          originalDate: null,
        });
      }
    }

    // Stable sort: date asc, then time asc (nulls last), then id asc.
    out.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const at = a.time ?? "99:99";
      const bt = b.time ?? "99:99";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.id - b.id;
    });
    return out;
  }

  // ============================================================
  // PHASE 2: AGENDA DEFAULT VIEW (per-user)
  // ============================================================
  getAgendaDefaultView(userId: number): string {
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    return u?.agendaDefaultView || "day";
  }
  setAgendaDefaultView(userId: number, view: string): void {
    db.update(users).set({ agendaDefaultView: view }).where(eq(users.id, userId)).run();
  }

  // Reset (clears the surviving v8-relevant tables for this user)
  resetDatabase(userId: number): void {
    const tables = [
      "projects", "inbox_items", "weekly_reviews",
      "environment_people", "environment_places", "environment_things",
      "environment_providers", "environment_conditions",
      "responsibilities", "roles",
    ];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table} WHERE user_id = ${userId}`);
    }
    // Clean orphans in junction tables (no user_id column)
    sqlite.exec(`DELETE FROM project_environment WHERE project_id NOT IN (SELECT id FROM projects)`);
    sqlite.exec(`DELETE FROM role_people WHERE role_id NOT IN (SELECT id FROM roles)`);
    sqlite.exec(`DELETE FROM responsibility_role WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM responsibility_people WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM responsibility_places WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM responsibility_things WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM responsibility_providers WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM responsibility_conditions WHERE responsibility_id NOT IN (SELECT id FROM responsibilities)`);
    sqlite.exec(`DELETE FROM project_responsibility WHERE project_id NOT IN (SELECT id FROM projects)`);
    // Phase 2 calendar tables — user-scoped via user_id column.
    sqlite.exec(`DELETE FROM agenda_tasks WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM project_tasks WHERE user_id = ${userId}`);
    // Reset preferences to defaults for this user
    sqlite.exec(`UPDATE preferences SET display_name = '', time_format = '12h', clarity_skip_ritual = 0 WHERE user_id = ${userId}`);
  }
}

export const storage = new DatabaseStorage();
