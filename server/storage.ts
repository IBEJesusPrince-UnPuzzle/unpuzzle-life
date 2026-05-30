import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc, isNull, gte, lte, or, inArray } from "drizzle-orm";
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
  // PR #23 — project↔support junctions (mirror of the responsibility ones).
  projectPeople, projectPlaces, projectThings, projectProviders, projectConditions,
  projectResponsibility,
  // Phase 2 calendar
  projectTasks, projectLinks, agendaTasks,
  // PR #32 — agenda task↔support junctions (mirror of the responsibility ones).
  agendaTaskPeople, agendaTaskPlaces, agendaTaskThings, agendaTaskProviders, agendaTaskConditions,
  // PR #29a — Phase 8 inbox processing
  filedNotes,
  // iCal feed sync
  externalCalendars, externalEvents,
  // PR #54 — Daily Review completions
  taskCompletions,
  // Push notifications
  fcmTokens,
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
  type FcmToken, type InsertFcmToken,
  // PR #23 project↔support types
  type ProjectPeople, type InsertProjectPeople,
  type ProjectPlace, type InsertProjectPlace,
  type ProjectThing, type InsertProjectThing,
  type ProjectProvider, type InsertProjectProvider,
  type ProjectCondition, type InsertProjectCondition,
  type ProjectResponsibility, type InsertProjectResponsibility,
  type ProjectTask, type InsertProjectTask,
  type ProjectLink, type InsertProjectLink,
  type AgendaTask, type InsertAgendaTask,
  type FiledNote, type InsertFiledNote,
  type FiledNoteTargetType,
  type TaskCompletion, type InsertTaskCompletion,
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

// PR #29c (Phase 8 Inbox processing) -- agenda_tasks gains a nullable
// responsibility_id column so Do It Later inbox tasks can carry their
// responsibility context. Existing rows remain NULL. See shared/schema.ts
// for the locked rationale.
tryMigration("agenda_tasks.responsibility_id", `ALTER TABLE agenda_tasks ADD COLUMN responsibility_id INTEGER`);

// PR #37 — users gains agenda_hour_height_px so the pinch-zoom hour-row
// height persists across sessions, shared across Day / 3-Day / Week.
// Existing users backfill to the default (56 px/h, same as the pre-PR #37
// constant), so render is unchanged until they pinch.
tryMigration("users.agenda_hour_height_px", `ALTER TABLE users ADD COLUMN agenda_hour_height_px INTEGER NOT NULL DEFAULT 56`);

// PR #21 — Project v2 schema (§10). All additions are nullable so existing
// project rows backfill as NULL. UI lands in PR #22; this PR is schema + API only.
tryMigration("projects.outcome_done",     `ALTER TABLE projects ADD COLUMN outcome_done TEXT`);
tryMigration("projects.status",           `ALTER TABLE projects ADD COLUMN status TEXT`);
tryMigration("projects.priority",         `ALTER TABLE projects ADD COLUMN priority TEXT`);
tryMigration("projects.target_date",      `ALTER TABLE projects ADD COLUMN target_date TEXT`);
tryMigration("projects.next_action",      `ALTER TABLE projects ADD COLUMN next_action TEXT`);
tryMigration("projects.blockers",         `ALTER TABLE projects ADD COLUMN blockers TEXT`);
tryMigration("projects.risks_watchouts",  `ALTER TABLE projects ADD COLUMN risks_watchouts TEXT`);
tryMigration("projects.notes",            `ALTER TABLE projects ADD COLUMN notes TEXT`);
tryMigration("projects.last_touched_at",  `ALTER TABLE projects ADD COLUMN last_touched_at TEXT`);
tryMigration("projects.stalled_at",       `ALTER TABLE projects ADD COLUMN stalled_at TEXT`);
// PR #21 — project_tasks gains a sortOrder for linear ordering inside a project.
tryMigration("project_tasks.sort_order",  `ALTER TABLE project_tasks ADD COLUMN sort_order INTEGER`);

// PR #22 — Date-handling schema sweep (locked per Date-handling.docx).
// Two-field rule: end_date for non-recurring items, recurrence_end_date for recurring items.
// History is never deleted; rows are re-parented (e.g. clearing project_id graduates a
// temporary responsibility to permanent without data loss).
tryMigration("responsibilities.start_date",            `ALTER TABLE responsibilities ADD COLUMN start_date TEXT`);
tryMigration("responsibilities.recurrence_end_date",   `ALTER TABLE responsibilities ADD COLUMN recurrence_end_date TEXT`);
tryMigration("responsibilities.project_id",            `ALTER TABLE responsibilities ADD COLUMN project_id INTEGER`);
// PR #52 — Habit loop columns for responsibility chip display
tryMigration("responsibilities.response",            `ALTER TABLE responsibilities ADD COLUMN response TEXT`);
tryMigration("responsibilities.cue",                 `ALTER TABLE responsibilities ADD COLUMN cue TEXT`);
tryMigration("responsibilities.craving",               `ALTER TABLE responsibilities ADD COLUMN craving TEXT`);
tryMigration("responsibilities.reward",              `ALTER TABLE responsibilities ADD COLUMN reward TEXT`);

// PR #53 — Support availability state (Available / Unavailable / Archived)
tryMigration("environment_people.state",      `ALTER TABLE environment_people ADD COLUMN state TEXT NOT NULL DEFAULT 'available'`);
tryMigration("environment_places.state",      `ALTER TABLE environment_places ADD COLUMN state TEXT NOT NULL DEFAULT 'available'`);
tryMigration("environment_things.state",      `ALTER TABLE environment_things ADD COLUMN state TEXT NOT NULL DEFAULT 'available'`);
tryMigration("environment_providers.state",   `ALTER TABLE environment_providers ADD COLUMN state TEXT NOT NULL DEFAULT 'available'`);
tryMigration("environment_conditions.state",  `ALTER TABLE environment_conditions ADD COLUMN state TEXT NOT NULL DEFAULT 'available'`);
// PR #53 — Optional reason when marking unavailable
tryMigration("environment_people.unavailable_reason",     `ALTER TABLE environment_people ADD COLUMN unavailable_reason TEXT`);
tryMigration("environment_places.unavailable_reason",     `ALTER TABLE environment_places ADD COLUMN unavailable_reason TEXT`);
tryMigration("environment_things.unavailable_reason",     `ALTER TABLE environment_things ADD COLUMN unavailable_reason TEXT`);
tryMigration("environment_providers.unavailable_reason",  `ALTER TABLE environment_providers ADD COLUMN unavailable_reason TEXT`);
tryMigration("environment_conditions.unavailable_reason", `ALTER TABLE environment_conditions ADD COLUMN unavailable_reason TEXT`);
tryMigration("project_tasks.start_date",               `ALTER TABLE project_tasks ADD COLUMN start_date TEXT`);
tryMigration("project_tasks.end_date",                 `ALTER TABLE project_tasks ADD COLUMN end_date TEXT`);
tryMigration("project_tasks.is_all_day",               `ALTER TABLE project_tasks ADD COLUMN is_all_day INTEGER NOT NULL DEFAULT 0`);
tryMigration("project_tasks.color",                   `ALTER TABLE project_tasks ADD COLUMN color TEXT`);

// Remove unused cadence and day_of_week columns from roles
tryMigration("roles.drop_cadence",                   `ALTER TABLE roles DROP COLUMN cadence`);
tryMigration("roles.drop_day_of_week",               `ALTER TABLE roles DROP COLUMN day_of_week`);

// Remove legacy recurrence fields from project_tasks
tryMigration("project_tasks.drop_recurrence_rule",   `ALTER TABLE project_tasks DROP COLUMN recurrence_rule`);
tryMigration("project_tasks.drop_recurrence_end_date", `ALTER TABLE project_tasks DROP COLUMN recurrence_end_date`);

// Remove unused cadence and day_of_week columns from responsibilities
tryMigration("responsibilities.drop_cadence",       `ALTER TABLE responsibilities DROP COLUMN cadence`);
tryMigration("responsibilities.drop_day_of_week",   `ALTER TABLE responsibilities DROP COLUMN day_of_week`);

// PR #30b — Agenda task-type visibility (Google parity, per-user server state).
// Three booleans on the existing preferences row; all default 1 (on).
tryMigration("preferences.show_responsibility", `ALTER TABLE preferences ADD COLUMN show_responsibility INTEGER NOT NULL DEFAULT 1`);
tryMigration("preferences.show_project_task",  `ALTER TABLE preferences ADD COLUMN show_project_task INTEGER NOT NULL DEFAULT 1`);
tryMigration("preferences.show_standalone",    `ALTER TABLE preferences ADD COLUMN show_standalone INTEGER NOT NULL DEFAULT 1`);

// Calendar source visibility (Google parity)
tryMigration("external_calendars.visible", `ALTER TABLE external_calendars ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`);

// PR #53 Phase 3 — Add covers_id column to support junction tables
tryMigration("responsibility_people.covers_id", `ALTER TABLE responsibility_people ADD COLUMN covers_id INTEGER`);
tryMigration("responsibility_places.covers_id", `ALTER TABLE responsibility_places ADD COLUMN covers_id INTEGER`);
tryMigration("responsibility_things.covers_id", `ALTER TABLE responsibility_things ADD COLUMN covers_id INTEGER`);
tryMigration("responsibility_providers.covers_id", `ALTER TABLE responsibility_providers ADD COLUMN covers_id INTEGER`);
tryMigration("responsibility_conditions.covers_id", `ALTER TABLE responsibility_conditions ADD COLUMN covers_id INTEGER`);
tryMigration("project_people.covers_id", `ALTER TABLE project_people ADD COLUMN covers_id INTEGER`);
tryMigration("project_places.covers_id", `ALTER TABLE project_places ADD COLUMN covers_id INTEGER`);
tryMigration("project_things.covers_id", `ALTER TABLE project_things ADD COLUMN covers_id INTEGER`);
tryMigration("project_providers.covers_id", `ALTER TABLE project_providers ADD COLUMN covers_id INTEGER`);
tryMigration("project_conditions.covers_id", `ALTER TABLE project_conditions ADD COLUMN covers_id INTEGER`);
tryMigration("agenda_task_people.covers_id", `ALTER TABLE agenda_task_people ADD COLUMN covers_id INTEGER`);
tryMigration("agenda_task_places.covers_id", `ALTER TABLE agenda_task_places ADD COLUMN covers_id INTEGER`);
tryMigration("agenda_task_things.covers_id", `ALTER TABLE agenda_task_things ADD COLUMN covers_id INTEGER`);
tryMigration("agenda_task_providers.covers_id", `ALTER TABLE agenda_task_providers ADD COLUMN covers_id INTEGER`);
tryMigration("agenda_task_conditions.covers_id", `ALTER TABLE agenda_task_conditions ADD COLUMN covers_id INTEGER`);

// Push notification support
tryMigration("users.notifications_enabled", `ALTER TABLE users ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 0`);
tryMigration("users.task_reminder_minutes", `ALTER TABLE users ADD COLUMN task_reminder_minutes INTEGER NOT NULL DEFAULT 15`);
tryMigration("users.daily_review_enabled", `ALTER TABLE users ADD COLUMN daily_review_enabled INTEGER NOT NULL DEFAULT 0`);
tryMigration("users.daily_review_time", `ALTER TABLE users ADD COLUMN daily_review_time TEXT NOT NULL DEFAULT '09:00'`);
tryMigration("users.project_deadline_alerts_enabled", `ALTER TABLE users ADD COLUMN project_deadline_alerts_enabled INTEGER NOT NULL DEFAULT 0`);
tryMigration("users.project_deadline_days_before", `ALTER TABLE users ADD COLUMN project_deadline_days_before INTEGER NOT NULL DEFAULT 1`);
tryMigration("users.stalled_project_alerts_enabled", `ALTER TABLE users ADD COLUMN stalled_project_alerts_enabled INTEGER NOT NULL DEFAULT 0`);
tryMigration("users.stalled_project_days_threshold", `ALTER TABLE users ADD COLUMN stalled_project_days_threshold INTEGER NOT NULL DEFAULT 7`);

// FCM tokens table
tryMigration("fcm_tokens.create", `CREATE TABLE IF NOT EXISTS fcm_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
)`);

// PR #24 — Rename agenda_tasks.date → start_date.
// Migration strategy: dual-column transitional. Add the new column, backfill
// from the legacy `date` column on existing rows, then dual-write at every
// insert/update site so a downgrade can still read the old column. A follow-up
// PR drops `date` once we've shipped a release on `start_date` cleanly.
//
// On freshly-created tables (post this migration block running) `date` is
// still present per the CREATE TABLE block below — a future cleanup PR will
// remove it and bump the schema. For now, both columns exist and stay in sync.
tryMigration("agenda_tasks.start_date",  `ALTER TABLE agenda_tasks ADD COLUMN start_date TEXT`);
// Backfill any rows where start_date is still null. Idempotent: subsequent
// boots find every row already populated and the UPDATE is a no-op.
try {
  sqlite.exec(`UPDATE agenda_tasks SET start_date = date WHERE start_date IS NULL AND date IS NOT NULL`);
} catch (e: any) {
  const msg = String(e?.message ?? e);
  // Benign on a brand-new database where the table was just created and is empty,
  // or where the legacy `date` column has already been removed by a future PR.
  if (!msg.includes("no such column") && !msg.includes("no such table")) {
    console.warn(`[migration:agenda_tasks.start_date backfill] unexpected:`, msg);
  }
}
// Dual-write: relax the legacy `date` column's NOT NULL constraint so Drizzle
// inserts that only populate `start_date` succeed without listing `date`.
// SQLite can't ALTER a column's constraint in place, so we rebuild the table
// once — guarded by a check on the current schema. After this runs, the
// AFTER trigger below mirrors `start_date` → `date` for any reader still on
// the old column. Symmetric after-update trigger keeps them in sync.
try {
  // Detect whether the existing `date` column is still NOT NULL. PRAGMA
  // table_info returns rows with `notnull = 1` when the column is NOT NULL.
  const cols = sqlite.prepare(`PRAGMA table_info(agenda_tasks)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const dateCol = cols.find((c) => c.name === "date");
  const startDateCol = cols.find((c) => c.name === "start_date");
  // Only rebuild when both columns exist AND `date` is still NOT NULL.
  // Skips on a brand-new database (table was just created with `date` already
  // nullable per the CREATE TABLE block) and on subsequent boots after rebuild.
  if (dateCol && startDateCol && dateCol.notnull === 1) {
    sqlite.exec(`
      BEGIN;
      CREATE TABLE agenda_tasks__pr24 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        origin TEXT NOT NULL,
        origin_id INTEGER,
        title TEXT,
        date TEXT,
        start_date TEXT,
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
      INSERT INTO agenda_tasks__pr24
        SELECT id, user_id, origin, origin_id, title, date, start_date, end_date,
               time, duration_minutes, is_all_day, role_id, status, color,
               recurrence_rule, recurrence_end_date, series_id, is_override,
               original_date, is_cancelled, notes, created_at, updated_at
        FROM agenda_tasks;
      DROP TABLE agenda_tasks;
      ALTER TABLE agenda_tasks__pr24 RENAME TO agenda_tasks;
      COMMIT;
    `);
  }
} catch (e: any) {
  const msg = String(e?.message ?? e);
  if (!msg.includes("no such table")) {
    console.warn(`[migration:agenda_tasks date relax NOT NULL] unexpected:`, msg);
    // Roll back if the BEGIN went through but COMMIT failed.
    try { sqlite.exec(`ROLLBACK`); } catch {}
  }
}
// Dual-write triggers — keep the legacy `date` column in sync with `start_date`
// transparently to all callers. Drizzle now writes to `start_date`; the
// after-insert/update triggers mirror that value to `date` so any leftover
// reader still sees a valid value. Idempotent: DROP IF EXISTS then CREATE.
try {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS agenda_tasks_dualwrite_insert;
    CREATE TRIGGER agenda_tasks_dualwrite_insert
      AFTER INSERT ON agenda_tasks
      FOR EACH ROW
      WHEN NEW.start_date IS NOT NULL AND (NEW.date IS NULL OR NEW.date <> NEW.start_date)
      BEGIN
        UPDATE agenda_tasks SET date = NEW.start_date WHERE id = NEW.id;
      END;

    DROP TRIGGER IF EXISTS agenda_tasks_dualwrite_update;
    CREATE TRIGGER agenda_tasks_dualwrite_update
      AFTER UPDATE OF start_date ON agenda_tasks
      FOR EACH ROW
      WHEN NEW.start_date IS NOT NULL AND (NEW.date IS NULL OR NEW.date <> NEW.start_date)
      BEGIN
        UPDATE agenda_tasks SET date = NEW.start_date WHERE id = NEW.id;
      END;
  `);
} catch (e: any) {
  const msg = String(e?.message ?? e);
  if (!msg.includes("no such table") && !msg.includes("no such column")) {
    console.warn(`[migration:agenda_tasks dualwrite triggers] unexpected:`, msg);
  }
}

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
    agenda_hour_height_px INTEGER NOT NULL DEFAULT 56,
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
    -- PR #21 (§10) Project v2 fields. All nullable; UI in PR #22.
    outcome_done TEXT,
    status TEXT,
    priority TEXT,
    target_date TEXT,
    next_action TEXT,
    blockers TEXT,
    risks_watchouts TEXT,
    notes TEXT,
    last_touched_at TEXT,
    stalled_at TEXT,
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
    clarity_skip_ritual INTEGER NOT NULL DEFAULT 0,
    show_responsibility INTEGER NOT NULL DEFAULT 1,
    show_project_task INTEGER NOT NULL DEFAULT 1,
    show_standalone INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS environment_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    relationship TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    unavailable_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    unavailable_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    category TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    unavailable_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    unavailable_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL DEFAULT 'available',
    unavailable_reason TEXT,
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
    -- PR #22 date-handling sweep. start_date is required at creation (UI-enforced).
    -- recurrence_end_date is optional for permanent responsibilities, required when project_id is set.
    -- project_id (nullable) marks a TEMPORARY responsibility owned by a project.
    start_date TEXT,
    recurrence_end_date TEXT,
    project_id INTEGER REFERENCES projects(id),
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

  -- PR #23 — project↔support junctions, mirroring responsibility_<type>.
  CREATE TABLE IF NOT EXISTS project_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    person_id INTEGER NOT NULL REFERENCES environment_people(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS project_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    place_id INTEGER NOT NULL REFERENCES environment_places(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS project_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    thing_id INTEGER NOT NULL REFERENCES environment_things(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS project_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    provider_id INTEGER NOT NULL REFERENCES environment_providers(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS project_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    condition_id INTEGER NOT NULL REFERENCES environment_conditions(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );

  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    -- Legacy recurrence columns. Per PR #22 model, a recurring project task lives
    -- in the responsibilities table with project_id set, not here. These columns
    -- kept for backward-compat until cleanup PR.
    recurrence_rule TEXT,
    recurrence_end_date TEXT,
    -- PR #22 date-handling sweep. start_date required at creation (UI-enforced).
    -- end_date for multi-day support; nullable when single-day or all-day.
    start_date TEXT,
    end_date TEXT,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER,
    created_at TEXT NOT NULL
  );

  -- PR #21 — Related links / files attached to a project (§10 "Add link" rows).
  CREATE TABLE IF NOT EXISTS project_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agenda_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    origin TEXT NOT NULL,
    origin_id INTEGER,
    title TEXT,
    -- PR #24 -- date is legacy; populated by an AFTER trigger from start_date.
    -- Constraint relaxed from NOT NULL to nullable so Drizzle inserts that
    -- omit it still succeed. Existing databases get the same relaxation via
    -- the table-rebuild migration above. Future PR drops it.
    date TEXT,
    start_date TEXT,
    end_date TEXT,
    time TEXT,
    duration_minutes INTEGER,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    role_id INTEGER,
    -- PR #29c (Phase 8 Inbox processing) -- nullable, set by Do It Later.
    responsibility_id INTEGER,
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

  -- PR #32 — agenda task↔support junctions, mirroring responsibility_<type>
  -- and project_<type>. Carries relationship_type + importance so the shared
  -- SupportSection UI (used by responsibility-edit and project-edit) works
  -- without branching when reused on the agenda-task page.
  CREATE TABLE IF NOT EXISTS agenda_task_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_task_id INTEGER NOT NULL REFERENCES agenda_tasks(id),
    person_id INTEGER NOT NULL REFERENCES environment_people(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS agenda_task_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_task_id INTEGER NOT NULL REFERENCES agenda_tasks(id),
    place_id INTEGER NOT NULL REFERENCES environment_places(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS agenda_task_things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_task_id INTEGER NOT NULL REFERENCES agenda_tasks(id),
    thing_id INTEGER NOT NULL REFERENCES environment_things(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS agenda_task_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_task_id INTEGER NOT NULL REFERENCES agenda_tasks(id),
    provider_id INTEGER NOT NULL REFERENCES environment_providers(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
  );
  CREATE TABLE IF NOT EXISTS agenda_task_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_task_id INTEGER NOT NULL REFERENCES agenda_tasks(id),
    condition_id INTEGER NOT NULL REFERENCES environment_conditions(id),
    relationship_type TEXT NOT NULL DEFAULT 'primary',
    importance TEXT NOT NULL DEFAULT 'important'
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

  -- PR #29a (Phase 8 — Inbox processing) — Filed notes for File It path.
  -- See shared/schema.ts “filed_notes” block for the rationale and the
  -- target_type enum. Index on (user_id, target_type, target_id) makes
  -- per-entity reads cheap.
  CREATE TABLE IF NOT EXISTS filed_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    tag TEXT,
    source_inbox_item_id INTEGER REFERENCES inbox_items(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS filed_notes_target_idx
    ON filed_notes (user_id, target_type, target_id);

  -- iCal feed sync — external calendars and their events.
  CREATE TABLE IF NOT EXISTS external_calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4285F4',
    last_synced_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    series_id INTEGER,
    original_date TEXT,
    agenda_task_id INTEGER,
    status TEXT NOT NULL,
    rescheduled_to TEXT,
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS external_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id INTEGER NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
    uid TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '(No title)',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    location TEXT,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS external_events_cal_uid
    ON external_events (calendar_id, uid);
`);

// Insert default preferences row if none exists
try {
  const prefRow = sqlite.prepare("SELECT id FROM preferences LIMIT 1").get();
  if (!prefRow) {
    sqlite.exec("INSERT INTO preferences (user_id, display_name, time_format) VALUES (1, '', '12h')");
  }
} catch (_) { /* table will be handled above */ }

// PR #54 — unique index so each occurrence can only have one completion record.
tryMigration("task_completions.idx_series", `
  CREATE UNIQUE INDEX IF NOT EXISTS task_completions_series_date
  ON task_completions (user_id, series_id, original_date)
  WHERE series_id IS NOT NULL AND original_date IS NOT NULL
`);
// Drop the old index that lacked original_date (external events reuse the same
// agenda_task_id across dates, so we need originalDate in the key).
tryMigration("task_completions.drop_old_task_idx", `
  DROP INDEX IF EXISTS task_completions_task_id
`);
tryMigration("task_completions.idx_task", `
  CREATE UNIQUE INDEX IF NOT EXISTS task_completions_task_date
  ON task_completions (user_id, agenda_task_id, original_date)
  WHERE agenda_task_id IS NOT NULL AND series_id IS NULL
`);

// Schema migration complete — re-enable foreign key enforcement for runtime queries.
sqlite.pragma("foreign_keys = ON");

export { sqlite };
export const db = drizzle(sqlite);

// =============================================================================
// PR #19 — ResponsibilityScheduleInput
// =============================================================================
// The schedule fields that materialize on the master agenda_tasks row when
// a responsibility is created or its schedule is edited. These do NOT live
// on the responsibilities table — only color and recurrenceRule do (per
// PR #18d cascade design).
//
//   date              YYYY-MM-DD; first occurrence date (or single-day all-day)
//   time              HH:MM; null when isAllDay = true
//   durationMinutes   minutes; null when isAllDay = true
//   isAllDay          true = full-day event (time/duration cleared)
//   endDate           YYYY-MM-DD or null; only meaningful when isAllDay = true
//                     and the event spans multiple days. Null = single-day.
//   recurrenceRule    RRULE fragment, e.g. "FREQ=WEEKLY". Required (because
//                     responsibilities are recurring by nature — §23).
//                     Mirrors responsibilities.recurrenceRule.
// =============================================================================
// PR #29h — return shape of the cascading project delete. Per-table change
// counts so the client can format an accurate toast and we can verify the
// cascade in smoke tests.
export type ProjectDeleteSummary = {
  mode: "delete" | "preserve";
  project: number;
  projectTasks: number;
  agendaTasksDeleted: number;   // populated when mode='delete'
  agendaTasksPreserved: number; // populated when mode='preserve'
  links: number;
  people: number;
  places: number;
  things: number;
  providers: number;
  conditions: number;
  responsibility: number;
  inboxNulled: number;
};

export type ResponsibilityScheduleInput = {
  // PR #24 — renamed from `date` to mirror the agenda_tasks.start_date column.
  startDate: string;
  time: string | null;
  durationMinutes: number | null;
  isAllDay: boolean;
  endDate: string | null;
  recurrenceRule: string;
};

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

  // FCM Tokens
  getFcmTokens(userId: number): FcmToken[];
  getAllFcmTokens(): FcmToken[];
  createFcmToken(data: InsertFcmToken): FcmToken;
  deleteFcmToken(userId: number, token: string): void;
  deleteFcmTokenByToken(token: string): void;
  updateFcmTokenLastUsed(userId: number, token: string): void;

  // Projects
  getProjects(userId: number): Project[];
  createProject(userId: number, data: InsertProject): Project;
  updateProject(userId: number, id: number, data: Partial<InsertProject>): Project | undefined;
  // PR #29h — deleteProject now cascades. mode='delete' hard-deletes linked
  // agenda chips; mode='preserve' flips them to origin='standalone'.
  // Both modes cascade all 8 project-child tables and null inbox refs.
  deleteProject(userId: number, id: number, mode?: "delete" | "preserve"): ProjectDeleteSummary;
  // PR #29h — count of agenda_tasks linked to this project via its
  // project_tasks rows. Drives the radio visibility in the delete dialog.
  getLinkedAgendaCountForProject(userId: number, projectId: number): number;

  // Inbox
  getInboxItems(userId: number): InboxItem[];
  getTrashedInboxItems(userId: number): InboxItem[];
  createInboxItem(userId: number, data: InsertInboxItem): InboxItem;
  updateInboxItem(userId: number, id: number, data: Partial<InsertInboxItem>): InboxItem | undefined;
  softDeleteInboxItem(userId: number, id: number): InboxItem | undefined;
  restoreInboxItem(userId: number, id: number): InboxItem | undefined;
  deleteInboxItem(userId: number, id: number): void;
  // PR #29a — Phase 8 Inbox processing primitives.
  // getInboxItem returns a single row by id (used by the orchestrator to
  // confirm ownership and short-circuit if already processed).
  getInboxItem(userId: number, id: number): InboxItem | undefined;
  // markInboxProcessed flips processed=1 and sets processedAs to one of the
  // values defined in INBOX_PROCESSED_AS_VALUES. Idempotent.
  markInboxProcessed(userId: number, id: number, processedAs: string): InboxItem | undefined;
  // getSomedayInboxItems returns rows where processed=1 AND processedAs='someday'
  // AND deletedAt IS NULL, ordered by createdAt desc. Powers the /someday page.
  getSomedayInboxItems(userId: number): InboxItem[];
  // restoreInboxFromSomeday flips processed=0 and clears processedAs so the
  // row reappears in the unprocessed Inbox list and can be processed as
  // something else (per locked Q1 answer 2026-05-10).
  restoreInboxFromSomeday(userId: number, id: number): InboxItem | undefined;

  // PR #29a — Filed notes CRUD (File It target).
  // Always scoped by userId. listFiledNotes filters by target if both
  // targetType and targetId are provided; otherwise returns all of the
  // user's filed notes ordered by createdAt desc.
  listFiledNotes(
    userId: number,
    targetType?: FiledNoteTargetType,
    targetId?: number,
  ): FiledNote[];
  createFiledNote(userId: number, data: InsertFiledNote): FiledNote;
  deleteFiledNote(userId: number, id: number): void;

  // Weekly Reviews
  getWeeklyReviews(userId: number): WeeklyReview[];
  createWeeklyReview(userId: number, data: InsertWeeklyReview): WeeklyReview;
  updateWeeklyReview(userId: number, id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined;

  // Preferences
  getPreferences(userId: number): { displayName: string; timeFormat: string; claritySkipRitual: boolean; showResponsibility: boolean; showProjectTask: boolean; showStandalone: boolean; notificationsEnabled: boolean; taskReminderMinutes: number; dailyReviewEnabled: boolean; dailyReviewTime: string; projectDeadlineAlertsEnabled: boolean; projectDeadlineDaysBefore: number; stalledProjectAlertsEnabled: boolean; stalledProjectDaysThreshold: number };
  updatePreferences(userId: number, data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean; showResponsibility?: boolean; showProjectTask?: boolean; showStandalone?: boolean; notificationsEnabled?: boolean; taskReminderMinutes?: number; dailyReviewEnabled?: boolean; dailyReviewTime?: string; projectDeadlineAlertsEnabled?: boolean; projectDeadlineDaysBefore?: number; stalledProjectAlertsEnabled?: boolean; stalledProjectDaysThreshold?: number }): { displayName: string; timeFormat: string; claritySkipRitual: boolean; showResponsibility: boolean; showProjectTask: boolean; showStandalone: boolean; notificationsEnabled: boolean; taskReminderMinutes: number; dailyReviewEnabled: boolean; dailyReviewTime: string; projectDeadlineAlertsEnabled: boolean; projectDeadlineDaysBefore: number; stalledProjectAlertsEnabled: boolean; stalledProjectDaysThreshold: number };

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
  // PR #19 — includes master agenda_tasks schedule fields (or null when
  // the responsibility was created pre-PR #19).
  getResponsibilityWithSchedule(userId: number, id: number): {
    responsibility: Responsibility;
    schedule: {
      startDate: string;
      time: string | null;
      durationMinutes: number | null;
      isAllDay: boolean;
      endDate: string | null;
      recurrenceRule: string | null;
    } | null;
  } | undefined;
  // PR #19 — atomic create / update / delete. The `schedule` parameter
  // mirrors the master agenda_tasks row that materializes alongside the
  // responsibility (origin='responsibility'). When schedule is supplied:
  //   create: inserts both rows in one sqlite transaction.
  //   update: patches the existing master row (creating one if none exists).
  //   delete: drops every responsibility-origin agenda_tasks row first.
  // recurrenceRule lives on BOTH rows (responsibilities.recurrenceRule for
  // the cascade source-of-truth, agenda_tasks.recurrenceRule for the
  // recurrence engine to expand). The two are kept in sync here.
  createResponsibility(
    userId: number,
    data: InsertResponsibility,
    schedule?: ResponsibilityScheduleInput | null,
  ): Responsibility;
  updateResponsibility(
    userId: number,
    id: number,
    data: Partial<InsertResponsibility>,
    schedule?: Partial<ResponsibilityScheduleInput> | null,
  ): Responsibility | undefined;
  deleteResponsibility(userId: number, id: number): void;

  // PR #20 — Convert standalone task → responsibility (§22a).
  // Atomic transaction:
  //   1. If input.taskId is set, fetch the original task. Truncate it by
  //      setting recurrenceEndDate to the last actual occurrence ≤ today
  //      (last day it showed up before today, per user lock). For
  //      future-dated tasks (no occurrence yet), the floor is
  //      min(today, originalStart − 1). The original task row is preserved
  //      as history (no delete) per §22a.
  //   2. Insert a new responsibilities row from name, color, recurrenceRule.
  //   3. Insert the master agenda_tasks row (origin='responsibility',
  //      originId=resp.id) carrying date / time / duration / isAllDay /
  //      endDate / recurrenceRule / roleId from the source task.
  // taskId omitted = unsaved-task path (the form was open in create mode
  // and the user picked Convert before pressing Save). We just create the
  // responsibility from the in-flight payload — no source row to truncate.
  convertTaskToResponsibility(
    userId: number,
    input: {
      taskId: number | null;
      taskPayload: {
        title: string;
        color: string | null;
        recurrenceRule: string;
        startDate: string;
        time: string | null;
        durationMinutes: number | null;
        isAllDay: boolean;
        endDate: string | null;
        roleId: number | null;
      };
      today: string; // YYYY-MM-DD — caller-provided so server timezone can't
                     // skew the truncation floor by a day.
    },
  ): Responsibility;

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

  // PR #33: Support Makeup management (link summary + cascade delete).
  // The single entry points the /support/:type pages use.
  //
  // Returns per-parent counts + a small list of {id, name} for the edit
  // sheet's "Used by" rollup. The delete dialog only reads the counts;
  // the list is purely cosmetic for the rollup.
  getEnvironmentLinkSummary(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): {
    responsibilities: { count: number; items: { id: number; name: string }[] };
    projects: { count: number; items: { id: number; name: string }[] };
    agendaTasks: { count: number; items: { id: number; name: string }[] };
  } | null;
  deleteEnvironmentWithCascade(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): { responsibilities: number; projects: number; agendaTasks: number; envDeleted: number } | null;

  // Bulk per-entry link counts for one support type. Powers the
  // /support/:type list page's "Used in N places" / "Not used yet" sub-line
  // in one round trip instead of N+1 calls to getEnvironmentLinkSummary.
  // Sum is across all 3 parents (responsibilities + projects + agendaTasks).
  getEnvironmentLinkCounts(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
  ): { id: number; count: number }[];

  // Phase 1: Support state setter (works for all 5 support categories)
  setSupportState(supportType: "people" | "places" | "things" | "providers" | "conditions", userId: number, id: number, state: string): any;

  // Phase 1: Responsibility ↔ Role junction
  getResponsibilityRoles(responsibilityId: number): ResponsibilityRole[];
  // Bulk: all responsibility↔role links for a user (joined via responsibilities.user_id)
  getAllResponsibilityRolesForUser(userId: number): ResponsibilityRole[];
  linkResponsibilityRole(data: InsertResponsibilityRole): ResponsibilityRole;
  unlinkResponsibilityRole(id: number): void;

  // Phase 1: Responsibility ↔ Support junctions (one method set, dispatches by type)
  getResponsibilitySupports(responsibilityId: number, supportType: "people" | "places" | "things" | "providers" | "conditions"): any[];
  linkResponsibilitySupport(supportType: "people" | "places" | "things" | "providers" | "conditions", data: any): any;
  updateResponsibilitySupportLink(supportType: "people" | "places" | "things" | "providers" | "conditions", id: number, data: { relationshipType?: string; importance?: string; coversId?: number | null }): any;
  unlinkResponsibilitySupport(supportType: "people" | "places" | "things" | "providers" | "conditions", id: number): void;

  // Phase 1: Project ↔ Responsibility junction
  getProjectResponsibilities(projectId: number): ProjectResponsibility[];
  linkProjectResponsibility(data: InsertProjectResponsibility): ProjectResponsibility;
  unlinkProjectResponsibility(id: number): void;

  // Phase 2: Project tasks
  getProjectTasks(userId: number, projectId?: number): ProjectTask[];
  getProjectTask(userId: number, id: number): ProjectTask | undefined;
  createProjectTask(userId: number, data: InsertProjectTask): ProjectTask;
  // PR #29i — updateProjectTask now reverse-syncs the new title onto every
  // linked agenda_tasks row (origin='project', originId=:id) in the same
  // transaction when data.title is a string. Counterpart to PR #29g's
  // forward sync; together they keep the chip and the project task in lockstep.
  updateProjectTask(userId: number, id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined;
  deleteProjectTask(userId: number, id: number): void;
  // PR #29i — mirror a project_task title onto every linked agenda chip.
  // Returns the number of agenda_tasks rows updated. Safe to call directly
  // (it's also wrapped inside updateProjectTask's tx for atomic renames).
  syncAgendaTitlesForProjectTask(userId: number, projectTaskId: number, newTitle: string): number;

  // PR #23 — Project related links/files (§10 "Add link" rows)
  getProjectLinks(userId: number, projectId: number): ProjectLink[];
  createProjectLink(userId: number, data: InsertProjectLink): ProjectLink;
  deleteProjectLink(userId: number, id: number): void;

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
    // PR #39 — chip-layout enrichment.
    // Populated for every row by getAgendaWindow:
    //   - responsibility: roleNames from responsibility_role join.
    //   - project:        projectName from project_tasks.project_id;
    //                     responsibilityNames from project_responsibility.
    //   - standalone:     roleNames is [roleName] when roleId set, else [].
    // placeName = first Place support record by id ASC (no sortOrder column
    // on the junction tables), pulled from the right junction per origin.
    roleNames: string[];
    projectName: string | null;
    responsibilityNames: string[];
    placeName: string | null;
    placeCount: number;
  }>;

  // Phase 2: agenda default view
  getAgendaDefaultView(userId: number): string;
  setAgendaDefaultView(userId: number, view: string): void;
  getAgendaHourHeightPx(userId: number): number;
  setAgendaHourHeightPx(userId: number, hourHeightPx: number): void;

  // PR #54 — Task Completions (Daily Review)
  getCompletionsForDate(userId: number, date: string): TaskCompletion[];
  getCompletionsForRange(userId: number, from: string, to: string): TaskCompletion[];
  getCompletion(userId: number, key: { seriesId: number; originalDate: string } | { agendaTaskId: number }): TaskCompletion | undefined;
  upsertCompletion(userId: number, data: Omit<InsertTaskCompletion, "id" | "userId" | "completedAt">): TaskCompletion;
  deleteCompletion(userId: number, id: number): void;
  bulkUpsertCompletions(userId: number, items: Omit<InsertTaskCompletion, "id" | "userId" | "completedAt">[]): TaskCompletion[];

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

  // FCM Tokens
  getFcmTokens(userId: number): FcmToken[] {
    return db.select().from(fcmTokens).where(eq(fcmTokens.userId, userId)).all();
  }
  getAllFcmTokens(): FcmToken[] {
    return db.select().from(fcmTokens).all();
  }
  createFcmToken(data: InsertFcmToken): FcmToken {
    const now = new Date().toISOString();
    return db.insert(fcmTokens).values({ ...data, createdAt: now, lastUsedAt: now }).returning().get();
  }
  deleteFcmToken(userId: number, token: string): void {
    db.delete(fcmTokens).where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.token, token))).run();
  }
  deleteFcmTokenByToken(token: string): void {
    db.delete(fcmTokens).where(eq(fcmTokens.token, token)).run();
  }
  updateFcmTokenLastUsed(userId: number, token: string): void {
    db.update(fcmTokens).set({ lastUsedAt: new Date().toISOString() })
      .where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.token, token)))
      .run();
  }

  // Projects
  getProjects(userId: number): Project[] {
    return db.select().from(projects).where(and(eq(projects.userId, userId), or(eq(projects.archived, 0), isNull(projects.archived)))).orderBy(desc(projects.createdAt)).all();
  }
  createProject(userId: number, data: InsertProject): Project {
    return db.insert(projects).values({ ...data, userId }).returning().get();
  }
  updateProject(userId: number, id: number, data: Partial<InsertProject>): Project | undefined {
    const now = new Date().toISOString();
    const patch: Partial<InsertProject> = { ...data, lastTouchedAt: now };
    if (typeof data.status === 'string') {
      const current = db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).get();
      if (data.status === 'stalled' && current?.status !== 'stalled') {
        patch.stalledAt = now;
      } else if (data.status !== 'stalled' && current?.status === 'stalled') {
        patch.stalledAt = null;
      }
    }
    return db.update(projects).set(patch).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning().get();
  }
  // PR #29h — cascade delete across all project children + linked agenda
  // chips + null inbox refs. All in a single SQLite transaction so a partial
  // failure rolls back. mode='delete' removes linked agenda_tasks rows;
  // mode='preserve' flips them to standalone (origin='standalone', null id).
  deleteProject(
    userId: number,
    id: number,
    mode: "delete" | "preserve" = "delete",
  ): ProjectDeleteSummary {
    // Empty summary returned when the project isn't found / isn't owned by
    // this user. The handler checks `summary.project === 0` to 404.
    const emptySummary: ProjectDeleteSummary = {
      mode,
      project: 0,
      projectTasks: 0,
      agendaTasksDeleted: 0,
      agendaTasksPreserved: 0,
      links: 0,
      people: 0,
      places: 0,
      things: 0,
      providers: 0,
      conditions: 0,
      responsibility: 0,
      inboxNulled: 0,
    };

    const tx = sqlite.transaction(() => {
      // Ownership pre-check inside the tx — the junction tables don't carry
      // userId, so we can't filter them by it directly. Returning early here
      // also gives the route handler a clean 404 path.
      const owned = db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .get();
      if (!owned) return emptySummary;

      // Capture project_task ids first so we can target agenda_tasks before
      // the project_tasks rows go away.
      const taskRows = db
        .select({ id: projectTasks.id })
        .from(projectTasks)
        .where(and(eq(projectTasks.projectId, id), eq(projectTasks.userId, userId)))
        .all();
      const taskIds = taskRows.map(r => r.id);

      // Touch agenda_tasks first while the originId join is still valid.
      let agendaTasksDeleted = 0;
      let agendaTasksPreserved = 0;
      if (taskIds.length > 0) {
        if (mode === "delete") {
          const res = db
            .delete(agendaTasks)
            .where(and(
              eq(agendaTasks.userId, userId),
              eq(agendaTasks.origin, "project"),
              inArray(agendaTasks.originId, taskIds),
            ))
            .run();
          agendaTasksDeleted = Number(res.changes ?? 0);
        } else {
          const res = db
            .update(agendaTasks)
            .set({ origin: "standalone", originId: null })
            .where(and(
              eq(agendaTasks.userId, userId),
              eq(agendaTasks.origin, "project"),
              inArray(agendaTasks.originId, taskIds),
            ))
            .run();
          agendaTasksPreserved = Number(res.changes ?? 0);
        }
      }

      // Project-task rows themselves.
      const ptRes = db
        .delete(projectTasks)
        .where(and(eq(projectTasks.projectId, id), eq(projectTasks.userId, userId)))
        .run();

      // 7 junction / child tables (env x5, responsibility, links).
      // Junctions don't carry userId — ownership was already verified above.
      const linksRes = db
        .delete(projectLinks)
        .where(and(eq(projectLinks.projectId, id), eq(projectLinks.userId, userId)))
        .run();
      const peopleRes = db
        .delete(projectPeople)
        .where(eq(projectPeople.projectId, id))
        .run();
      const placesRes = db
        .delete(projectPlaces)
        .where(eq(projectPlaces.projectId, id))
        .run();
      const thingsRes = db
        .delete(projectThings)
        .where(eq(projectThings.projectId, id))
        .run();
      const providersRes = db
        .delete(projectProviders)
        .where(eq(projectProviders.projectId, id))
        .run();
      const conditionsRes = db
        .delete(projectConditions)
        .where(eq(projectConditions.projectId, id))
        .run();
      const respRes = db
        .delete(projectResponsibility)
        .where(eq(projectResponsibility.projectId, id))
        .run();

      // inbox_items.referenceProjectId — nullable FK, just null it out.
      const inboxRes = db
        .update(inboxItems)
        .set({ referenceProjectId: null })
        .where(and(eq(inboxItems.userId, userId), eq(inboxItems.referenceProjectId, id)))
        .run();

      // Finally the project row.
      const projRes = db
        .delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .run();

      return {
        mode,
        project: Number(projRes.changes ?? 0),
        projectTasks: Number(ptRes.changes ?? 0),
        agendaTasksDeleted,
        agendaTasksPreserved,
        links: Number(linksRes.changes ?? 0),
        people: Number(peopleRes.changes ?? 0),
        places: Number(placesRes.changes ?? 0),
        things: Number(thingsRes.changes ?? 0),
        providers: Number(providersRes.changes ?? 0),
        conditions: Number(conditionsRes.changes ?? 0),
        responsibility: Number(respRes.changes ?? 0),
        inboxNulled: Number(inboxRes.changes ?? 0),
      };
    });
    return tx();
  }

  // PR #29h — count of agenda_tasks rows linked to this project via its
  // project_tasks rows. Used by the delete dialog to decide whether to show
  // the DELETE-vs-PRESERVE radio.
  getLinkedAgendaCountForProject(userId: number, projectId: number): number {
    const taskRows = db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.userId, userId)))
      .all();
    const taskIds = taskRows.map(r => r.id);
    if (taskIds.length === 0) return 0;
    const rows = db
      .select({ id: agendaTasks.id })
      .from(agendaTasks)
      .where(and(
        eq(agendaTasks.userId, userId),
        eq(agendaTasks.origin, "project"),
        inArray(agendaTasks.originId, taskIds),
      ))
      .all();
    return rows.length;
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

  // PR #29a — Phase 8 Inbox processing primitives.
  getInboxItem(userId: number, id: number): InboxItem | undefined {
    return db.select().from(inboxItems)
      .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
      .get();
  }
  markInboxProcessed(userId: number, id: number, processedAs: string): InboxItem | undefined {
    return db.update(inboxItems).set({
      processed: 1,
      processedAs,
    }).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning().get();
  }
  getSomedayInboxItems(userId: number): InboxItem[] {
    return db.select().from(inboxItems)
      .where(and(
        eq(inboxItems.userId, userId),
        eq(inboxItems.processed, 1),
        eq(inboxItems.processedAs, "someday"),
        isNull(inboxItems.deletedAt),
      ))
      .orderBy(desc(inboxItems.createdAt))
      .all();
  }
  restoreInboxFromSomeday(userId: number, id: number): InboxItem | undefined {
    // Per locked Q1 (2026-05-10): item returns to unprocessed Inbox so it
    // can be processed as something else. Only flips the row when it is
    // currently a someday entry; other rows are left alone (returns the
    // current state — caller can detect by checking processedAs).
    const current = db.select().from(inboxItems)
      .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
      .get();
    if (!current) return undefined;
    if (current.processedAs !== "someday" || current.processed !== 1) {
      return current;
    }
    return db.update(inboxItems).set({
      processed: 0,
      processedAs: null,
    }).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning().get();
  }

  // PR #29a — Filed notes CRUD (File It target).
  listFiledNotes(
    userId: number,
    targetType?: FiledNoteTargetType,
    targetId?: number,
  ): FiledNote[] {
    const conditions = [eq(filedNotes.userId, userId)];
    if (targetType) conditions.push(eq(filedNotes.targetType, targetType));
    if (typeof targetId === "number") conditions.push(eq(filedNotes.targetId, targetId));
    return db.select().from(filedNotes)
      .where(and(...conditions))
      .orderBy(desc(filedNotes.createdAt))
      .all();
  }
  createFiledNote(userId: number, data: InsertFiledNote): FiledNote {
    return db.insert(filedNotes).values({
      ...data,
      userId,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  deleteFiledNote(userId: number, id: number): void {
    db.delete(filedNotes)
      .where(and(eq(filedNotes.id, id), eq(filedNotes.userId, userId)))
      .run();
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
  getPreferences(userId: number): { displayName: string; timeFormat: string; claritySkipRitual: boolean; showResponsibility: boolean; showProjectTask: boolean; showStandalone: boolean; notificationsEnabled: boolean; taskReminderMinutes: number; dailyReviewEnabled: boolean; dailyReviewTime: string; projectDeadlineAlertsEnabled: boolean; projectDeadlineDaysBefore: number; stalledProjectAlertsEnabled: boolean; stalledProjectDaysThreshold: number } {
    const row = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) return {
      displayName: "",
      timeFormat: "12h",
      claritySkipRitual: false,
      showResponsibility: true,
      showProjectTask: true,
      showStandalone: true,
      notificationsEnabled: false,
      taskReminderMinutes: 15,
      dailyReviewEnabled: false,
      dailyReviewTime: "09:00",
      projectDeadlineAlertsEnabled: false,
      projectDeadlineDaysBefore: 1,
      stalledProjectAlertsEnabled: false,
      stalledProjectDaysThreshold: 7,
    };
    return {
      displayName: row.displayName,
      timeFormat: row.timeFormat,
      claritySkipRitual: !!row.claritySkipRitual,
      showResponsibility: !!row.showResponsibility,
      showProjectTask: !!row.showProjectTask,
      showStandalone: !!row.showStandalone,
      // Notification preferences from users table
      notificationsEnabled: !!user?.notificationsEnabled,
      taskReminderMinutes: user?.taskReminderMinutes ?? 15,
      dailyReviewEnabled: !!user?.dailyReviewEnabled,
      dailyReviewTime: user?.dailyReviewTime ?? "09:00",
      projectDeadlineAlertsEnabled: !!user?.projectDeadlineAlertsEnabled,
      projectDeadlineDaysBefore: user?.projectDeadlineDaysBefore ?? 1,
      stalledProjectAlertsEnabled: !!user?.stalledProjectAlertsEnabled,
      stalledProjectDaysThreshold: user?.stalledProjectDaysThreshold ?? 7,
    };
  }
  updatePreferences(
    userId: number,
    data: { displayName?: string; timeFormat?: string; claritySkipRitual?: boolean; showResponsibility?: boolean; showProjectTask?: boolean; showStandalone?: boolean; notificationsEnabled?: boolean; taskReminderMinutes?: number; dailyReviewEnabled?: boolean; dailyReviewTime?: string; projectDeadlineAlertsEnabled?: boolean; projectDeadlineDaysBefore?: number; stalledProjectAlertsEnabled?: boolean; stalledProjectDaysThreshold?: number },
  ): { displayName: string; timeFormat: string; claritySkipRitual: boolean; showResponsibility: boolean; showProjectTask: boolean; showStandalone: boolean; notificationsEnabled: boolean; taskReminderMinutes: number; dailyReviewEnabled: boolean; dailyReviewTime: string; projectDeadlineAlertsEnabled: boolean; projectDeadlineDaysBefore: number; stalledProjectAlertsEnabled: boolean; stalledProjectDaysThreshold: number } {
    const existing = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (existing) {
      const updated: any = {};
      if (data.displayName !== undefined) updated.displayName = data.displayName;
      if (data.timeFormat !== undefined) updated.timeFormat = data.timeFormat;
      if (data.claritySkipRitual !== undefined) updated.claritySkipRitual = data.claritySkipRitual ? 1 : 0;
      if (data.showResponsibility !== undefined) updated.showResponsibility = data.showResponsibility ? 1 : 0;
      if (data.showProjectTask !== undefined) updated.showProjectTask = data.showProjectTask ? 1 : 0;
      if (data.showStandalone !== undefined) updated.showStandalone = data.showStandalone ? 1 : 0;
      db.update(preferences).set(updated).where(eq(preferences.id, existing.id)).run();
    } else {
      db.insert(preferences).values({
        userId,
        displayName: data.displayName ?? "",
        timeFormat: data.timeFormat ?? "12h",
        claritySkipRitual: data.claritySkipRitual ? 1 : 0,
        showResponsibility: data.showResponsibility === false ? 0 : 1,
        showProjectTask: data.showProjectTask === false ? 0 : 1,
        showStandalone: data.showStandalone === false ? 0 : 1,
      }).run();
    }

    // Update notification preferences in users table
    const userUpdated: any = {};
    if (data.notificationsEnabled !== undefined) userUpdated.notificationsEnabled = data.notificationsEnabled ? 1 : 0;
    if (data.taskReminderMinutes !== undefined) userUpdated.taskReminderMinutes = data.taskReminderMinutes;
    if (data.dailyReviewEnabled !== undefined) userUpdated.dailyReviewEnabled = data.dailyReviewEnabled ? 1 : 0;
    if (data.dailyReviewTime !== undefined) userUpdated.dailyReviewTime = data.dailyReviewTime;
    if (data.projectDeadlineAlertsEnabled !== undefined) userUpdated.projectDeadlineAlertsEnabled = data.projectDeadlineAlertsEnabled ? 1 : 0;
    if (data.projectDeadlineDaysBefore !== undefined) userUpdated.projectDeadlineDaysBefore = data.projectDeadlineDaysBefore;
    if (data.stalledProjectAlertsEnabled !== undefined) userUpdated.stalledProjectAlertsEnabled = data.stalledProjectAlertsEnabled ? 1 : 0;
    if (data.stalledProjectDaysThreshold !== undefined) userUpdated.stalledProjectDaysThreshold = data.stalledProjectDaysThreshold;

    if (Object.keys(userUpdated).length > 0) {
      db.update(users).set(userUpdated).where(eq(users.id, userId)).run();
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
    // Cascade: unlink from any responsibilities first (FK on responsibility_people).
    // The responsibilities themselves stay; the environment item simply
    // disappears from their People support sections.
    db.delete(responsibilityPeople).where(eq(responsibilityPeople.personId, id)).run();
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
    // Cascade: unlink from any responsibilities first (FK on responsibility_places).
    db.delete(responsibilityPlaces).where(eq(responsibilityPlaces.placeId, id)).run();
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
    // Cascade: unlink from any responsibilities first (FK on responsibility_things).
    db.delete(responsibilityThings).where(eq(responsibilityThings.thingId, id)).run();
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

  // PR #19 — Returns each responsibility plus the schedule fields from its
  // master agenda_tasks row (origin='responsibility', isOverride=0). The
  // responsibility-edit Schedule card uses this to seed Date/Time/Duration/
  // All-day on load. responsibilities created pre-PR #19 won't have a master
  // row yet — their `schedule` is null in that case.
  getResponsibilityWithSchedule(userId: number, id: number): {
    responsibility: Responsibility;
    schedule: {
      startDate: string;
      time: string | null;
      durationMinutes: number | null;
      isAllDay: boolean;
      endDate: string | null;
      recurrenceRule: string | null;
    } | null;
  } | undefined {
    const resp = db.select().from(responsibilities)
      .where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId)))
      .get();
    if (!resp) return undefined;
    const master = db.select().from(agendaTasks)
      .where(and(
        eq(agendaTasks.userId, userId),
        eq(agendaTasks.origin, "responsibility"),
        eq(agendaTasks.originId, id),
        eq(agendaTasks.isOverride, 0),
      ))
      .get();
    return {
      responsibility: resp,
      schedule: master
        ? {
            startDate: master.startDate,
            time: master.time,
            durationMinutes: master.durationMinutes,
            isAllDay: master.isAllDay === 1,
            endDate: master.endDate,
            recurrenceRule: master.recurrenceRule,
          }
        : null,
    };
  }
  // PR #19 — atomic create. Inserts the responsibility row and (when
  // schedule is supplied) the master agenda_tasks row in a single sqlite
  // transaction. The master row carries origin='responsibility' /
  // originId=resp.id so the agenda window query joins it back to the
  // responsibility for color/title (PR #18d COALESCE cascade). title and
  // color on the master row stay null — they live on the responsibility.
  createResponsibility(
    userId: number,
    data: InsertResponsibility,
    schedule?: ResponsibilityScheduleInput | null,
  ): Responsibility {
    const tx = sqlite.transaction(() => {
      const resp = db.insert(responsibilities).values({ ...data, userId }).returning().get();
      if (schedule) {
        const now = new Date().toISOString();
        const masterRow = db.insert(agendaTasks).values({
          userId,
          origin: "responsibility",
          originId: resp.id,
          title: null,                         // joins from responsibilities.name
          color: null,                         // joins from responsibilities.color
          startDate: schedule.startDate,
          endDate: schedule.isAllDay ? schedule.endDate : null,
          time: schedule.isAllDay ? null : schedule.time,
          durationMinutes: schedule.isAllDay ? null : schedule.durationMinutes,
          isAllDay: schedule.isAllDay ? 1 : 0,
          recurrenceRule: schedule.recurrenceRule,
          createdAt: now,
          updatedAt: now,
        }).returning().get();
        // Self-assign series_id so future overrides can point at this master
        // (mirrors the auto-assign in createAgendaTask).
        if (masterRow.recurrenceRule && !masterRow.seriesId) {
          db.update(agendaTasks).set({ seriesId: masterRow.id })
            .where(eq(agendaTasks.id, masterRow.id)).run();
        }
      }
      return resp;
    });
    return tx();
  }

  // PR #19 — atomic update. Patches the responsibility row, and when
  // schedule fields are present, patches the master agenda_tasks row
  // (origin='responsibility', originId=resp.id, isOverride=0) too. If the
  // master row doesn't exist yet (legacy responsibility predating PR #19),
  // it gets created on first schedule patch. recurrenceRule on the
  // responsibility row stays the source-of-truth for cascade reads (PR #18d
  // COALESCE), but the master row's recurrenceRule must mirror it so the
  // recurrence engine expands instances correctly.
  updateResponsibility(
    userId: number,
    id: number,
    data: Partial<InsertResponsibility>,
    schedule?: Partial<ResponsibilityScheduleInput> | null,
  ): Responsibility | undefined {
    const tx = sqlite.transaction(() => {
      let updated: Responsibility | undefined;
      if (Object.keys(data).length > 0) {
        updated = db.update(responsibilities).set(data)
          .where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId)))
          .returning().get();
      } else {
        updated = db.select().from(responsibilities)
          .where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId)))
          .get();
      }
      if (!updated) return undefined;

      if (schedule && Object.keys(schedule).length > 0) {
        const masterPatch: Partial<typeof agendaTasks.$inferInsert> = {
          updatedAt: new Date().toISOString(),
        };
        if (schedule.startDate !== undefined) masterPatch.startDate = schedule.startDate;
        if (schedule.isAllDay !== undefined) {
          masterPatch.isAllDay = schedule.isAllDay ? 1 : 0;
          if (schedule.isAllDay) {
            // All-day clears time/duration; endDate may stay or be patched below.
            masterPatch.time = null;
            masterPatch.durationMinutes = null;
          }
        }
        if (schedule.time !== undefined && !schedule.isAllDay) masterPatch.time = schedule.time;
        if (schedule.durationMinutes !== undefined && !schedule.isAllDay) {
          masterPatch.durationMinutes = schedule.durationMinutes;
        }
        if (schedule.endDate !== undefined) masterPatch.endDate = schedule.endDate;
        if (schedule.recurrenceRule !== undefined) masterPatch.recurrenceRule = schedule.recurrenceRule;

        const existingMaster = db.select().from(agendaTasks)
          .where(and(
            eq(agendaTasks.userId, userId),
            eq(agendaTasks.origin, "responsibility"),
            eq(agendaTasks.originId, id),
            eq(agendaTasks.isOverride, 0),
          ))
          .get();
        if (existingMaster) {
          db.update(agendaTasks).set(masterPatch)
            .where(eq(agendaTasks.id, existingMaster.id)).run();
        } else if (
          schedule.startDate !== undefined &&
          schedule.recurrenceRule !== undefined
        ) {
          // Legacy responsibility (created pre-PR #19) being given a
          // schedule for the first time. Insert a fresh master row.
          const now = new Date().toISOString();
          const created = db.insert(agendaTasks).values({
            userId,
            origin: "responsibility",
            originId: id,
            title: null,
            color: null,
            startDate: schedule.startDate,
            endDate: schedule.isAllDay ? (schedule.endDate ?? null) : null,
            time: schedule.isAllDay ? null : (schedule.time ?? null),
            durationMinutes: schedule.isAllDay ? null : (schedule.durationMinutes ?? null),
            isAllDay: schedule.isAllDay ? 1 : 0,
            recurrenceRule: schedule.recurrenceRule,
            createdAt: now,
            updatedAt: now,
          }).returning().get();
          if (created.recurrenceRule && !created.seriesId) {
            db.update(agendaTasks).set({ seriesId: created.id })
              .where(eq(agendaTasks.id, created.id)).run();
          }
        }
      } else if (data.recurrenceRule !== undefined) {
        // recurrenceRule on the responsibility row changed but no schedule
        // patch was sent. Mirror it onto the master agenda_tasks row so the
        // recurrence engine sees the new pattern. (Covers the existing PR #18d
        // "change Frequency in Schedule card" path.)
        db.update(agendaTasks)
          .set({ recurrenceRule: data.recurrenceRule, updatedAt: new Date().toISOString() })
          .where(and(
            eq(agendaTasks.userId, userId),
            eq(agendaTasks.origin, "responsibility"),
            eq(agendaTasks.originId, id),
            eq(agendaTasks.isOverride, 0),
          ))
          .run();
      }
      return updated;
    });
    return tx();
  }

  // PR #19 — cascade delete now also drops every responsibility-origin
  // agenda_tasks row (master + overrides + cancellations). Without this,
  // deleting a responsibility would leave orphaned masters with a dangling
  // originId, and the agenda window query would silently swallow them on
  // the responsibility-id lookup.
  deleteResponsibility(userId: number, id: number): void {
    // Cascade: every junction that holds a FK to responsibilities.id must go
    // first, otherwise SQLite raises FOREIGN KEY constraint failed. Order
    // doesn't matter among siblings; the responsibility row goes last.
    //
    // Affected junctions (per shared/schema.ts):
    //   - responsibility_role         (role linkage)
    //   - responsibility_people       (People support)
    //   - responsibility_places       (Places support)
    //   - responsibility_things       (Things support)
    //   - responsibility_providers    (Providers support)
    //   - responsibility_conditions   (Conditions support)
    //   - project_responsibility      (Phase 2 project linkage)
    //   - agenda_tasks (origin='responsibility', originId=id) — PR #19
    const tx = sqlite.transaction(() => {
      db.delete(responsibilityRole).where(eq(responsibilityRole.responsibilityId, id)).run();
      db.delete(responsibilityPeople).where(eq(responsibilityPeople.responsibilityId, id)).run();
      db.delete(responsibilityPlaces).where(eq(responsibilityPlaces.responsibilityId, id)).run();
      db.delete(responsibilityThings).where(eq(responsibilityThings.responsibilityId, id)).run();
      db.delete(responsibilityProviders).where(eq(responsibilityProviders.responsibilityId, id)).run();
      db.delete(responsibilityConditions).where(eq(responsibilityConditions.responsibilityId, id)).run();
      db.delete(projectResponsibility).where(eq(projectResponsibility.responsibilityId, id)).run();
      db.delete(agendaTasks)
        .where(and(
          eq(agendaTasks.userId, userId),
          eq(agendaTasks.origin, "responsibility"),
          eq(agendaTasks.originId, id),
        ))
        .run();
      db.delete(responsibilities).where(and(eq(responsibilities.id, id), eq(responsibilities.userId, userId))).run();
    });
    tx();
  }

  // PR #20 — Convert standalone task → responsibility (§22a).
  // See IStorage interface for the full contract. Truncation rule
  // (user-locked): "the last day it showed up before today is the last day
  // of the recurrence." Implementation:
  //   1. Build a virtual MasterRow from the source task and call
  //      expandMaster(master, originalStart, today) to enumerate every
  //      occurrence between the original start date and today (inclusive).
  //   2. The new recurrenceEndDate is the LAST entry in that list (the most
  //      recent occurrence on or before today). If the rule produces no
  //      occurrences yet (future-dated tasks, or tasks whose first occurrence
  //      hasn't fired), we fall back to min(today, originalStart − 1).
  //   3. The original task's recurrence_rule is left UNTOUCHED (§22a spec
  //      line 1283 — only the end date moves; the rule still describes the
  //      original cadence).
  convertTaskToResponsibility(
    userId: number,
    input: {
      taskId: number | null;
      taskPayload: {
        title: string;
        color: string | null;
        recurrenceRule: string;
        startDate: string;
        time: string | null;
        durationMinutes: number | null;
        isAllDay: boolean;
        endDate: string | null;
        roleId: number | null;
      };
      today: string;
    },
  ): Responsibility {
    const { taskId, taskPayload, today } = input;
    const tx = sqlite.transaction(() => {
      // 1. Truncate the original task (if it exists). We only touch
      //    recurrenceEndDate — leaving recurrence_rule alone per §22a.
      if (taskId) {
        const orig = db.select().from(agendaTasks)
          .where(and(eq(agendaTasks.id, taskId), eq(agendaTasks.userId, userId)))
          .get();
        if (!orig) {
          throw new Error(`Source task ${taskId} not found`);
        }
        // Compute the truncation floor. If the task has a recurrence rule
        // and at least one occurrence has fired on or before today, the new
        // end date is that occurrence. Otherwise (future-dated, no fire
        // yet), fall back to min(today, originalStart − 1).
        let newEnd: string;
        if (orig.recurrenceRule) {
          const occurrences = expandMaster(
            {
              id: orig.id,
              seriesId: orig.seriesId,
              recurrenceRule: orig.recurrenceRule,
              recurrenceEndDate: orig.recurrenceEndDate,
              startDate: orig.startDate,
            },
            orig.startDate,
            today,
          );
          if (occurrences.length > 0) {
            newEnd = occurrences[occurrences.length - 1].startDate;
          } else {
            // No occurrence has fired yet. Floor at min(today, start − 1).
            const startMinus1 = addDaysIso(orig.startDate, -1);
            newEnd = startMinus1 < today ? startMinus1 : today;
          }
        } else {
          // Non-recurring source task. Edge case — §22a's cap prompt only
          // fires when the rule is recurring, but we handle it defensively
          // by using min(today, originalStart − 1).
          const startMinus1 = addDaysIso(orig.startDate, -1);
          newEnd = startMinus1 < today ? startMinus1 : today;
        }
        db.update(agendaTasks)
          .set({
            recurrenceEndDate: newEnd,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(agendaTasks.id, taskId))
          .run();
      }

      // 2. Insert the new responsibility row. cadence stays at the schema
      //    default ('weekly') — the recurrence engine reads recurrenceRule,
      //    cadence is a v1 carry-over and not used by the agenda window
      //    expansion. The user can re-pick a cadence on the edit page.
      const now = new Date().toISOString();
      const resp = db.insert(responsibilities).values({
        userId,
        name: taskPayload.title,
        color: taskPayload.color,
        recurrenceRule: taskPayload.recurrenceRule,
        createdAt: now,
      }).returning().get();

      // 3. Insert the master agenda_tasks row. Mirrors the pattern in
      //    createResponsibility — title/color stay null and join from the
      //    responsibility row via PR #18d's COALESCE cascade.
      const masterRow = db.insert(agendaTasks).values({
        userId,
        origin: "responsibility",
        originId: resp.id,
        title: null,
        color: null,
        startDate: taskPayload.startDate,
        endDate: taskPayload.isAllDay ? taskPayload.endDate : null,
        time: taskPayload.isAllDay ? null : taskPayload.time,
        durationMinutes: taskPayload.isAllDay ? null : taskPayload.durationMinutes,
        isAllDay: taskPayload.isAllDay ? 1 : 0,
        roleId: taskPayload.roleId,
        recurrenceRule: taskPayload.recurrenceRule,
        createdAt: now,
        updatedAt: now,
      }).returning().get();
      // Self-assign series_id so future overrides can point at this master
      // (mirrors createAgendaTask + createResponsibility).
      if (masterRow.recurrenceRule && !masterRow.seriesId) {
        db.update(agendaTasks).set({ seriesId: masterRow.id })
          .where(eq(agendaTasks.id, masterRow.id)).run();
      }

      return resp;
    });
    return tx();
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
    // Cascade order:
    //   1. role_people     (no FK constraint, but we still own these rows)
    //   2. responsibility_role  (FK — unlink any responsibilities pointing here;
    //      responsibilities themselves stay and surface as orphans on the
    //      Support page's 'needs attention' banner, matching the existing UX)
    //   3. roles row
    db.delete(rolePeople).where(eq(rolePeople.roleId, id)).run();
    db.delete(responsibilityRole).where(eq(responsibilityRole.roleId, id)).run();
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
    // Cascade: unlink from any responsibilities first (FK on responsibility_providers).
    db.delete(responsibilityProviders).where(eq(responsibilityProviders.providerId, id)).run();
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
    // Cascade: unlink from any responsibilities first (FK on responsibility_conditions).
    db.delete(responsibilityConditions).where(eq(responsibilityConditions.conditionId, id)).run();
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
  getAllResponsibilityRolesForUser(userId: number): ResponsibilityRole[] {
    // Inner join responsibility_role → responsibilities (filtered by userId).
    const rows = db
      .select({
        id: responsibilityRole.id,
        responsibilityId: responsibilityRole.responsibilityId,
        roleId: responsibilityRole.roleId,
      })
      .from(responsibilityRole)
      .innerJoin(responsibilities, eq(responsibilities.id, responsibilityRole.responsibilityId))
      .where(eq(responsibilities.userId, userId))
      .all();
    return rows as ResponsibilityRole[];
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
    data: { relationshipType?: string; importance?: string; coversId?: number | null },
  ): any {
    const t = this.respSupportTable(supportType);
    const updates: any = {};
    if (data.relationshipType !== undefined) updates.relationshipType = data.relationshipType;
    if (data.importance !== undefined) updates.importance = data.importance;
    // PR #53: Support explicit workaround linking
    if (data.coversId !== undefined) updates.coversId = data.coversId;
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
  // PR #23: PROJECT ↔ SUPPORT JUNCTIONS (mirror of responsibility side)
  // ============================================================
  private projSupportTable(supportType: "people" | "places" | "things" | "providers" | "conditions"): any {
    switch (supportType) {
      case "people":     return projectPeople;
      case "places":     return projectPlaces;
      case "things":     return projectThings;
      case "providers":  return projectProviders;
      case "conditions": return projectConditions;
    }
  }
  getProjectSupports(
    projectId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
  ): any[] {
    const t = this.projSupportTable(supportType);
    return db.select().from(t).where(eq(t.projectId, projectId)).all();
  }
  linkProjectSupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    data: any,
  ): any {
    const t = this.projSupportTable(supportType);
    return db.insert(t).values(data).returning().get();
  }
  updateProjectSupportLink(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
    data: { relationshipType?: string; importance?: string; coversId?: number | null },
  ): any {
    const t = this.projSupportTable(supportType);
    const updates: any = {};
    if (data.relationshipType !== undefined) updates.relationshipType = data.relationshipType;
    if (data.importance !== undefined) updates.importance = data.importance;
    // PR #53: Support explicit workaround linking
    if (data.coversId !== undefined) updates.coversId = data.coversId;
    return db.update(t).set(updates).where(eq(t.id, id)).returning().get();
  }
  unlinkProjectSupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): void {
    const t = this.projSupportTable(supportType);
    db.delete(t).where(eq(t.id, id)).run();
  }

  // ============================================================
  // PR #32: AGENDA TASK ↔ SUPPORT JUNCTIONS (mirror of responsibility side)
  // ============================================================
  private agendaTaskSupportTable(supportType: "people" | "places" | "things" | "providers" | "conditions"): any {
    switch (supportType) {
      case "people":     return agendaTaskPeople;
      case "places":     return agendaTaskPlaces;
      case "things":     return agendaTaskThings;
      case "providers":  return agendaTaskProviders;
      case "conditions": return agendaTaskConditions;
    }
  }
  getAgendaTaskSupports(
    agendaTaskId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
  ): any[] {
    const t = this.agendaTaskSupportTable(supportType);
    return db.select().from(t).where(eq(t.agendaTaskId, agendaTaskId)).all();
  }
  linkAgendaTaskSupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    data: any,
  ): any {
    const t = this.agendaTaskSupportTable(supportType);
    return db.insert(t).values(data).returning().get();
  }
  updateAgendaTaskSupportLink(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
    data: { relationshipType?: string; importance?: string },
  ): any {
    const t = this.agendaTaskSupportTable(supportType);
    const updates: any = {};
    if (data.relationshipType !== undefined) updates.relationshipType = data.relationshipType;
    if (data.importance !== undefined) updates.importance = data.importance;
    return db.update(t).set(updates).where(eq(t.id, id)).returning().get();
  }
  unlinkAgendaTaskSupport(
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): void {
    const t = this.agendaTaskSupportTable(supportType);
    db.delete(t).where(eq(t.id, id)).run();
  }

  // ============================================================
  // PR #33: SUPPORT MAKEUP MANAGEMENT (link summary + cascade delete)
  // ============================================================
  //
  // The /support/<type> management page needs two operations the existing
  // per-type deletes don't cover:
  //
  //   1. Counting how many parent rows (responsibilities, projects, agenda
  //      tasks) reference a given env entry. Drives the confirmation dialog
  //      copy ("linked to 1 responsibility, 1 project, 1 agenda task").
  //
  //   2. Cascading the delete across all 3 parent kinds. The pre-PR #33
  //      deleteEnvironmentPerson/Place/Thing/Provider/Condition cascade only
  //      cascaded to the responsibility_* junction, leaving project_* and
  //      agenda_task_* dangling. PR #33 introduces the explicit cascade path
  //      so the Support Makeup pages can guarantee "delete this person and
  //      every link to it everywhere" in one call.
  //
  // Both methods dispatch by support type to the right 3 tables. The env
  // entry's ownership is verified at the entry level (env tables are
  // user-scoped, so an unowned id returns null and the route 404s).

  // Helper: the env table for a support type (used for ownership check).
  private envTableForType(supportType: "people" | "places" | "things" | "providers" | "conditions"): any {
    switch (supportType) {
      case "people":     return environmentPeople;
      case "places":     return environmentPlaces;
      case "things":     return environmentThings;
      case "providers":  return environmentProviders;
      case "conditions": return environmentConditions;
    }
  }

  // Helper: the FK column name on every junction table for a support type.
  // responsibility_people.personId, project_people.personId, etc. all share
  // the same field name across the 3 parents, so one string drives all 3 joins.
  private envFkFieldForType(supportType: "people" | "places" | "things" | "providers" | "conditions"): string {
    switch (supportType) {
      case "people":     return "personId";
      case "places":     return "placeId";
      case "things":     return "thingId";
      case "providers":  return "providerId";
      case "conditions": return "conditionId";
    }
  }

  // Count junction rows that reference a given env entry. Grouped by parent
  // kind because the dialog renders three separate lines. Returns null when
  // the env entry doesn't exist or doesn't belong to userId (the route maps
  // that to a 404).
  getEnvironmentLinkSummary(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): {
    responsibilities: { count: number; items: { id: number; name: string }[] };
    projects: { count: number; items: { id: number; name: string }[] };
    agendaTasks: { count: number; items: { id: number; name: string }[] };
  } | null {
    const envT = this.envTableForType(supportType);
    const owned = db.select().from(envT)
      .where(and(eq(envT.id, id), eq(envT.userId, userId)))
      .get();
    if (!owned) return null;

    const fkField = this.envFkFieldForType(supportType);
    const respT = this.respSupportTable(supportType);
    const projT = this.projSupportTable(supportType);
    const agendaT = this.agendaTaskSupportTable(supportType);

    // Pull junction rows for each parent kind, then resolve to parent rows
    // so the edit sheet's "Used by" rollup can render names. Each junction
    // row is unique per (parent, env) by upstream design, but we count rows
    // (not distinct parents) so a hypothetical duplicate still surfaces
    // accurately. The cascade delete removes every row regardless.
    const respLinks = db.select().from(respT).where(eq(respT[fkField], id)).all();
    const projLinks = db.select().from(projT).where(eq(projT[fkField], id)).all();
    const agendaLinks = db.select().from(agendaT).where(eq(agendaT[fkField], id)).all();

    // Resolve responsibility names. Junction's parent FK is
    // responsibilityId (not respId) for all 5 support tables — see schema.
    const respIds = respLinks.map((r: any) => r.responsibilityId);
    const respRows = respIds.length
      ? db.select({ id: responsibilities.id, name: responsibilities.name })
          .from(responsibilities)
          .where(and(eq(responsibilities.userId, userId), inArray(responsibilities.id, respIds)))
          .all()
      : [];

    // Projects: junction FK is projectId, display name is `title`.
    const projIds = projLinks.map((r: any) => r.projectId);
    const projRows = projIds.length
      ? db.select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(and(eq(projects.userId, userId), inArray(projects.id, projIds)))
          .all()
      : [];

    // Agenda tasks: junction FK is agendaTaskId, display name is `title`.
    // Title can be null for non-standalone tasks (resolved upstream from
    // the linked responsibility/project); we fall back to the literal
    // string "Untitled" so the rollup never renders an empty bullet.
    const agendaIds = agendaLinks.map((r: any) => r.agendaTaskId);
    const agendaRows = agendaIds.length
      ? db.select({ id: agendaTasks.id, title: agendaTasks.title })
          .from(agendaTasks)
          .where(and(eq(agendaTasks.userId, userId), inArray(agendaTasks.id, agendaIds)))
          .all()
      : [];

    return {
      responsibilities: {
        count: respLinks.length,
        items: respRows.map((r: any) => ({ id: r.id, name: r.name })),
      },
      projects: {
        count: projLinks.length,
        items: projRows.map((r: any) => ({ id: r.id, name: r.title })),
      },
      agendaTasks: {
        count: agendaLinks.length,
        items: agendaRows.map((r: any) => ({
          id: r.id,
          name: r.title ?? "Untitled",
        })),
      },
    };
  }

  // Cascade delete: removes every junction row across the 3 parents, then
  // the env entry itself. Returns the counts (so the route can build a
  // toast like "Sarah deleted (1 responsibility, 1 project, 1 agenda task
  // unlinked)."). Returns null when the env entry doesn't exist or doesn't
  // belong to userId.
  //
  // Order: junction rows first, then the env entry. If something goes wrong
  // mid-cascade we'd rather leave the env entry alive than have orphan
  // junction rows pointing at a deleted id.
  deleteEnvironmentWithCascade(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    id: number,
  ): { responsibilities: number; projects: number; agendaTasks: number; envDeleted: number } | null {
    const envT = this.envTableForType(supportType);
    const owned = db.select().from(envT)
      .where(and(eq(envT.id, id), eq(envT.userId, userId)))
      .get();
    if (!owned) return null;

    const fkField = this.envFkFieldForType(supportType);
    const respT = this.respSupportTable(supportType);
    const projT = this.projSupportTable(supportType);
    const agendaT = this.agendaTaskSupportTable(supportType);

    // Snapshot counts before the deletes (Drizzle's .delete().run() doesn't
    // return affected-row count uniformly across drivers, and we want stable
    // numbers for the response). Counts come from the same query the
    // link-summary endpoint uses so the dialog's pre-flight count and the
    // post-delete toast can't disagree.
    const respCount = db.select().from(respT).where(eq(respT[fkField], id)).all().length;
    const projCount = db.select().from(projT).where(eq(projT[fkField], id)).all().length;
    const agendaCount = db.select().from(agendaT).where(eq(agendaT[fkField], id)).all().length;

    db.delete(respT).where(eq(respT[fkField], id)).run();
    db.delete(projT).where(eq(projT[fkField], id)).run();
    db.delete(agendaT).where(eq(agendaT[fkField], id)).run();
    db.delete(envT).where(and(eq(envT.id, id), eq(envT.userId, userId))).run();

    return {
      responsibilities: respCount,
      projects: projCount,
      agendaTasks: agendaCount,
      envDeleted: 1,
    };
  }

  // Bulk count: for every env entry of `supportType` belonging to userId,
  // returns its combined link count across all 3 parent junctions. The
  // /support/:type list page calls this once per page mount and matches
  // against entries by id locally. Entries with zero links are included
  // with count: 0 so the list sub-line can show "Not used yet".
  getEnvironmentLinkCounts(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
  ): { id: number; count: number }[] {
    const envT = this.envTableForType(supportType);
    const fkField = this.envFkFieldForType(supportType);
    const respT = this.respSupportTable(supportType);
    const projT = this.projSupportTable(supportType);
    const agendaT = this.agendaTaskSupportTable(supportType);

    const entries = db.select({ id: envT.id }).from(envT).where(eq(envT.userId, userId)).all();
    if (entries.length === 0) return [];

    // Pull every junction row owned (transitively) by this user, then tally
    // per env id locally. Cheaper than N selects + simpler than building a
    // join expression that has to flow through the parent table just to
    // re-enforce the userId filter (env entries already carry user_id).
    const tally = new Map<number, number>();
    for (const e of entries) tally.set(e.id, 0);

    const respRows = db.select({ envId: respT[fkField] }).from(respT).all();
    const projRows = db.select({ envId: projT[fkField] }).from(projT).all();
    const agendaRows = db.select({ envId: agendaT[fkField] }).from(agendaT).all();

    for (const r of [...respRows, ...projRows, ...agendaRows]) {
      const cur = tally.get(r.envId);
      // Only count rows that belong to this user's env entries. Cross-user
      // junction rows (shouldn't exist, but defensive) get skipped.
      if (cur !== undefined) tally.set(r.envId, cur + 1);
    }

    return entries.map(e => ({ id: e.id, count: tally.get(e.id) ?? 0 }));
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
  // PR #29i — wrapped in a tx so the project_task PATCH and the linked
  // agenda title sync commit atomically. When data.title is provided, every
  // agenda_tasks row with origin='project' and originId=:id gets the same
  // title. The project task is the source of truth for linked chips, so the
  // sync is unconditional (Q4 = A): chip-side title overrides get overwritten
  // on every project rename. PR #29g's forward sync (chip → project) routes
  // through this same path — the sync becomes a no-op there (title already
  // matches), so no infinite loop is possible.
  updateProjectTask(userId: number, id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined {
    const tx = sqlite.transaction(() => {
      const updated = db.update(projectTasks).set(data)
        .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId)))
        .returning().get();
      if (updated && typeof data.title === "string") {
        this.syncAgendaTitlesForProjectTask(userId, id, data.title);
      }
      return updated;
    });
    return tx();
  }
  // PR #29i — see updateProjectTask comment above. Exposed on IStorage so
  // tests / future callers can trigger a sync without going through PATCH.
  syncAgendaTitlesForProjectTask(userId: number, projectTaskId: number, newTitle: string): number {
    const res = db
      .update(agendaTasks)
      .set({ title: newTitle })
      .where(and(
        eq(agendaTasks.userId, userId),
        eq(agendaTasks.origin, "project"),
        eq(agendaTasks.originId, projectTaskId),
      ))
      .run();
    return Number(res.changes ?? 0);
  }
  deleteProjectTask(userId: number, id: number): void {
    db.delete(projectTasks).where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId))).run();
  }

  // PR #23 — Project related links/files
  getProjectLinks(userId: number, projectId: number): ProjectLink[] {
    return db.select().from(projectLinks)
      .where(and(eq(projectLinks.userId, userId), eq(projectLinks.projectId, projectId)))
      .orderBy(asc(projectLinks.id))
      .all();
  }
  createProjectLink(userId: number, data: InsertProjectLink): ProjectLink {
    return db.insert(projectLinks).values({ ...data, userId }).returning().get();
  }
  deleteProjectLink(userId: number, id: number): void {
    db.delete(projectLinks).where(and(eq(projectLinks.id, id), eq(projectLinks.userId, userId))).run();
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
  ): Array<AgendaTask & {
    isVirtual: boolean;
    masterId: number;
    originalDate: string | null;
    roleNames: string[];
    projectName: string | null;
    responsibilityNames: string[];
    placeName: string | null;
    placeCount: number;
  }> {
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

    const out: Array<AgendaTask & {
      isVirtual: boolean;
      masterId: number;
      originalDate: string | null;
      roleNames: string[];
      projectName: string | null;
      responsibilityNames: string[];
      placeName: string | null;
      placeCount: number;
    }> = [];

    // 1. Expand masters; skip virtual instances that have an override (regardless of where the override moved to).
    //    For multi-day all-day masters we expand a widened window so that an
    //    occurrence starting BEFORE windowStart but ending inside the window
    //    still appears. The widened window is [windowStart - spanDays, windowEnd].
    //    Each virtual instance inherits the master's span (Phase 3c).
    for (const m of masters) {
      const masterSpanDays =
        m.isAllDay === 1 && m.endDate && m.endDate >= m.startDate
          ? daysBetweenIso(m.startDate, m.endDate)
          : 0;
      const expandStart = masterSpanDays > 0 ? addDaysIso(windowStart, -masterSpanDays) : windowStart;
      const expanded = expandMaster(
        {
          id: m.id,
          seriesId: m.seriesId,
          recurrenceRule: m.recurrenceRule,
          recurrenceEndDate: m.recurrenceEndDate,
          startDate: m.startDate,
        } satisfies MasterRow,
        expandStart,
        windowEnd,
      );
      for (const inst of expanded) {
        // Per-occurrence endDate: same span as the master.
        const instEndDate = masterSpanDays > 0 ? addDaysIso(inst.startDate, masterSpanDays) : null;
        // Skip occurrences whose [inst.startDate, instEndDate] don't overlap the window.
        if (!allDayOverlapsWindow(inst.startDate, instEndDate, windowStart, windowEnd) && masterSpanDays > 0) {
          continue;
        }
        // For non-multi-day masters, the original date-in-window check still applies.
        if (masterSpanDays === 0 && (inst.startDate < windowStart || inst.startDate > windowEnd)) {
          continue;
        }
        const ov = overrideBySeriesAndDate.get(overrideKey(inst.seriesId, inst.startDate));
        if (ov) continue; // override will be added below if it falls in the window
        out.push({
          ...m,
          id: m.id, // virtual instance keeps the master id; clients use originalDate to disambiguate
          startDate: inst.startDate,
          endDate: instEndDate, // per-occurrence span (Phase 3c)
          isVirtual: true,
          masterId: m.id,
          originalDate: null,
          // PR #39 — filled in by the enrichment pass below.
          roleNames: [],
          projectName: null,
          responsibilityNames: [],
          placeName: null,
          placeCount: 0,
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
          ? allDayOverlapsWindow(o.startDate, o.endDate, windowStart, windowEnd)
          : o.startDate >= windowStart && o.startDate <= windowEnd;
      if (inWindow) {
        out.push({
          ...o,
          isVirtual: false,
          masterId: o.seriesId ?? o.id,
          originalDate: o.originalDate,
          roleNames: [],
          projectName: null,
          responsibilityNames: [],
          placeName: null,
          placeCount: 0,
        });
      }
    }

    // 3. Add standalones that land in the window.
    //    All-day standalones use overlap test on [date, endDate] (Phase 3c).
    for (const s of standalones) {
      const inWindow =
        s.isAllDay === 1
          ? allDayOverlapsWindow(s.startDate, s.endDate, windowStart, windowEnd)
          : s.startDate >= windowStart && s.startDate <= windowEnd;
      if (inWindow) {
        out.push({
          ...s,
          isVirtual: false,
          masterId: s.id,
          originalDate: null,
          roleNames: [],
          projectName: null,
          responsibilityNames: [],
          placeName: null,
          placeCount: 0,
        });
      }
    }

    // Stable sort: startDate asc, then time asc (nulls last), then id asc.
    out.sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      const at = a.time ?? "99:99";
      const bt = b.time ?? "99:99";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.id - b.id;
    });

    // §1318 read rule (PR #18d) — COALESCE color and title from the linked
    // responsibility for rows that came from a responsibility origin and
    // didn't override those fields locally. This is what makes the
    // "calendar settings" card on the responsibility edit screen actually
    // cascade visually: responsibility.color flows into every instance
    // whose agenda_tasks.color is null, mirroring Google's calendar-level
    // color behavior.
    //
    // Notes on the join:
    //   - We look up responsibilities by originId (the FK to responsibilities.id),
    //     scoped to userId. One bulk select keeps this O(1) extra queries.
    //   - title COALESCE follows the same rule documented at agendaTasks.title
    //     in shared/schema.ts: agenda title wins, else responsibility name.
    //   - color COALESCE: explicit agenda_tasks.color wins (covers scope=all
    //     master patches, scope=this overrides, and scope=following's new
    //     master — all of which set color on the agenda_tasks row). Null
    //     falls back to the responsibility's color.
    //   - For overrides (origin='responsibility', isOverride=1) the override's
    //     color may itself be null when the user only changed something else;
    //     we still want to fall through to the responsibility default in that
    //     case, so the same COALESCE applies uniformly.
    const responsibilityIds = new Set<number>();
    for (const row of out) {
      if (row.origin === "responsibility" && row.originId != null) {
        responsibilityIds.add(row.originId);
      }
    }
    if (responsibilityIds.size > 0) {
      const respRows = db
        .select({
          id: responsibilities.id,
          name: responsibilities.name,
          color: responsibilities.color,
        })
        .from(responsibilities)
        .where(eq(responsibilities.userId, userId))
        .all();
      const byId = new Map(respRows.map((r) => [r.id, r]));
      for (const row of out) {
        if (row.origin !== "responsibility" || row.originId == null) continue;
        const resp = byId.get(row.originId);
        if (!resp) continue;
        if (row.color == null) row.color = resp.color;
        if (row.title == null) row.title = resp.name;
      }
    }

    // ----------------------------------------------------------------
    // PR #39 — chip-layout enrichment (Day / 3-Day / Week chips).
    //
    // Goal: each row leaves this function with roleNames, projectName,
    // responsibilityNames, placeName populated for whichever origin
    // applies. Done with bulk selects so the cost stays O(rows + lookups)
    // rather than O(rows × per-row queries).
    // ----------------------------------------------------------------

    // Pre-build a name lookup for all this user's roles, projects, and
    // places. Cheap on a small dataset and avoids three more selects
    // inside the per-origin loops.
    const allRoles = db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.userId, userId))
      .all();
    const roleNameById = new Map(allRoles.map((r) => [r.id, r.name]));

    const allPlaces = db
      .select({ id: environmentPlaces.id, name: environmentPlaces.name })
      .from(environmentPlaces)
      .where(eq(environmentPlaces.userId, userId))
      .all();
    const placeNameById = new Map(allPlaces.map((p) => [p.id, p.name]));

    const allProjects = db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(eq(projects.userId, userId))
      .all();
    const projectNameById = new Map(allProjects.map((p) => [p.id, p.title]));

    // Responsibility name lookup. Some rows already resolved it above
    // via the title COALESCE; we still need a clean name -> id map for
    // the project-task case where the row's title is the task name.
    const allResponsibilities = db
      .select({ id: responsibilities.id, name: responsibilities.name })
      .from(responsibilities)
      .where(eq(responsibilities.userId, userId))
      .all();
    const responsibilityNameById = new Map(
      allResponsibilities.map((r) => [r.id, r.name]),
    );

    // ---- Responsibility-origin enrichment -------------------------
    // roleNames ← responsibility_role join (insertion order = id ASC)
    // placeName ← first responsibility_places row by id ASC
    if (responsibilityIds.size > 0) {
      const respIdList = Array.from(responsibilityIds);

      const respRoleRows = db
        .select({
          responsibilityId: responsibilityRole.responsibilityId,
          roleId: responsibilityRole.roleId,
        })
        .from(responsibilityRole)
        .where(inArray(responsibilityRole.responsibilityId, respIdList))
        .orderBy(asc(responsibilityRole.id))
        .all();
      const rolesByResp = new Map<number, string[]>();
      for (const r of respRoleRows) {
        const name = roleNameById.get(r.roleId);
        if (!name) continue;
        const list = rolesByResp.get(r.responsibilityId) ?? [];
        list.push(name);
        rolesByResp.set(r.responsibilityId, list);
      }

      const respPlaceRows = db
        .select({
          responsibilityId: responsibilityPlaces.responsibilityId,
          placeId: responsibilityPlaces.placeId,
          id: responsibilityPlaces.id,
        })
        .from(responsibilityPlaces)
        .where(inArray(responsibilityPlaces.responsibilityId, respIdList))
        .orderBy(asc(responsibilityPlaces.id))
        .all();
      const placesByResp = new Map<number, number[]>();
      for (const r of respPlaceRows) {
        const list = placesByResp.get(r.responsibilityId) ?? [];
        list.push(r.placeId);
        placesByResp.set(r.responsibilityId, list);
      }

      for (const row of out) {
        if (row.origin !== "responsibility" || row.originId == null) continue;
        row.roleNames = rolesByResp.get(row.originId) ?? [];
        const placeIds = placesByResp.get(row.originId) ?? [];
        row.placeCount = placeIds.length;
        row.placeName = placeIds.length > 0 ? (placeNameById.get(placeIds[0]) ?? null) : null;
      }
    }

    // ---- Project-task-origin enrichment ---------------------------
    // projectName        ← project_tasks.projectId → projects.name
    // responsibilityNames ← project_responsibility for that project
    // placeName          ← first project_places row by id ASC
    const projectTaskIds = new Set<number>();
    for (const row of out) {
      if (row.origin === "project" && row.originId != null) {
        projectTaskIds.add(row.originId);
      }
    }
    if (projectTaskIds.size > 0) {
      const ptList = Array.from(projectTaskIds);
      const ptRows = db
        .select({ id: projectTasks.id, projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(inArray(projectTasks.id, ptList))
        .all();
      const projectIdByTaskId = new Map(ptRows.map((p) => [p.id, p.projectId]));

      const projectIdSet = new Set(ptRows.map((p) => p.projectId));
      const projectIdList = Array.from(projectIdSet);

      let respByProject = new Map<number, string[]>();
      let placesByProject = new Map<number, number[]>();
      if (projectIdList.length > 0) {
        const prRows = db
          .select({
            projectId: projectResponsibility.projectId,
            responsibilityId: projectResponsibility.responsibilityId,
            id: projectResponsibility.id,
          })
          .from(projectResponsibility)
          .where(inArray(projectResponsibility.projectId, projectIdList))
          .orderBy(asc(projectResponsibility.id))
          .all();
        for (const r of prRows) {
          const name = responsibilityNameById.get(r.responsibilityId);
          if (!name) continue;
          const list = respByProject.get(r.projectId) ?? [];
          list.push(name);
          respByProject.set(r.projectId, list);
        }

        const projPlaceRows = db
          .select({
            projectId: projectPlaces.projectId,
            placeId: projectPlaces.placeId,
            id: projectPlaces.id,
          })
          .from(projectPlaces)
          .where(inArray(projectPlaces.projectId, projectIdList))
          .orderBy(asc(projectPlaces.id))
          .all();
        for (const r of projPlaceRows) {
          const list = placesByProject.get(r.projectId) ?? [];
          list.push(r.placeId);
          placesByProject.set(r.projectId, list);
        }
      }

      for (const row of out) {
        if (row.origin !== "project" || row.originId == null) continue;
        const pid = projectIdByTaskId.get(row.originId);
        if (pid == null) continue;
        row.projectName = projectNameById.get(pid) ?? null;
        row.responsibilityNames = respByProject.get(pid) ?? [];
        const placeIds = placesByProject.get(pid) ?? [];
        row.placeCount = placeIds.length;
        row.placeName = placeIds.length > 0 ? (placeNameById.get(placeIds[0]) ?? null) : null;
      }
    }

    // ---- Standalone-task-origin enrichment ------------------------
    // roleNames ← [roleNameById.get(agenda_tasks.roleId)] if set
    // placeName ← first agenda_task_places row by id ASC
    const standaloneIds = new Set<number>();
    for (const row of out) {
      if (row.origin === "standalone") {
        // For standalones the agenda_tasks row is the originating row; its
        // id is what agenda_task_places references.
        standaloneIds.add(row.id);
      }
    }
    let placesByTask = new Map<number, number[]>();
    if (standaloneIds.size > 0) {
      const taskPlaceRows = db
        .select({
          agendaTaskId: agendaTaskPlaces.agendaTaskId,
          placeId: agendaTaskPlaces.placeId,
          id: agendaTaskPlaces.id,
        })
        .from(agendaTaskPlaces)
        .where(inArray(agendaTaskPlaces.agendaTaskId, Array.from(standaloneIds)))
        .orderBy(asc(agendaTaskPlaces.id))
        .all();
      for (const r of taskPlaceRows) {
        const list = placesByTask.get(r.agendaTaskId) ?? [];
        list.push(r.placeId);
        placesByTask.set(r.agendaTaskId, list);
      }
    }
    for (const row of out) {
      if (row.origin !== "standalone") continue;
      if (row.roleId != null) {
        const name = roleNameById.get(row.roleId);
        row.roleNames = name ? [name] : [];
      }
      const placeIds = placesByTask.get(row.id) ?? [];
      row.placeCount = placeIds.length;
      if (placeIds.length > 0) {
        row.placeName = placeNameById.get(placeIds[0]) ?? null;
      }
    }

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

  // PR #37 — pinch-zoom hour-row height (shared across Day / 3-Day / Week).
  // Clamp 28–112 px/h enforced at the route layer; this method trusts its
  // caller to pass a clamped value.
  getAgendaHourHeightPx(userId: number): number {
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    return u?.agendaHourHeightPx ?? 56;
  }
  setAgendaHourHeightPx(userId: number, hourHeightPx: number): void {
    db.update(users).set({ agendaHourHeightPx: hourHeightPx }).where(eq(users.id, userId)).run();
  }

  // Reset (clears the surviving v8-relevant tables for this user)
  resetDatabase(userId: number): void {
    // PR #29a — reorder for FK-safe deletion. Children must be deleted
    // before their parents under foreign_keys=ON.
    //   * filed_notes → inbox_items, projects, etc.  (delete first)
    //   * agenda_tasks, project_tasks → projects, responsibilities
    //   * project_responsibility, project_<support> → projects
    //   * responsibility_<support>, responsibility_role → responsibilities + roles
    //   * role_people → roles + people
    //   * project_environment → projects (legacy)
    //   * project_links → projects (PR #21)
    //
    // Then parent rows (projects, responsibilities, roles, support items,
    // inbox_items, weekly_reviews) are safe to delete.

    // 1) filed_notes (FK to inbox_items)
    sqlite.exec(`DELETE FROM filed_notes WHERE user_id = ${userId}`);

    // 2) Phase 2 calendar tables (FKs to projects/responsibilities)
    sqlite.exec(`DELETE FROM agenda_tasks WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM project_tasks WHERE user_id = ${userId}`);

    // 3) project link/junction tables (FKs to projects). These have no
    // user_id column — scope by joining to projects-of-this-user.
    sqlite.exec(`DELETE FROM project_links WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_responsibility WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_people WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_places WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_things WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_providers WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_conditions WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM project_environment WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${userId})`);

    // 4) responsibility junctions (FKs to responsibilities + support tables/roles)
    sqlite.exec(`DELETE FROM responsibility_role WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM responsibility_people WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM responsibility_places WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM responsibility_things WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM responsibility_providers WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);
    sqlite.exec(`DELETE FROM responsibility_conditions WHERE responsibility_id IN (SELECT id FROM responsibilities WHERE user_id = ${userId})`);

    // 5) role-people junction (FKs to roles + environment_people)
    sqlite.exec(`DELETE FROM role_people WHERE role_id IN (SELECT id FROM roles WHERE user_id = ${userId})`);

    // 6) Now the parent rows are safe.
    const tables = [
      "projects", "inbox_items", "weekly_reviews",
      "environment_people", "environment_places", "environment_things",
      "environment_providers", "environment_conditions",
      "responsibilities", "roles",
    ];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table} WHERE user_id = ${userId}`);
    }

    // Reset preferences to defaults for this user
    sqlite.exec(`UPDATE preferences SET display_name = '', time_format = '12h', clarity_skip_ritual = 0, show_responsibility = 1, show_project_task = 1, show_standalone = 1 WHERE user_id = ${userId}`);

    // External calendars + their events (cascade handles events)
    sqlite.exec(`DELETE FROM external_calendars WHERE user_id = ${userId}`);
  }

  // ============================================================
  // EXTERNAL CALENDARS
  // ============================================================

  listExternalCalendars(userId: number) {
    return db.select().from(externalCalendars).where(eq(externalCalendars.userId, userId)).all();
  }

  createExternalCalendar(userId: number, data: { name: string; url: string; color: string }) {
    const now = new Date().toISOString();
    const rows = db.insert(externalCalendars).values({
      userId,
      name: data.name,
      url: data.url,
      color: data.color,
      createdAt: now,
    }).returning().all();
    return rows[0];
  }

  deleteExternalCalendar(userId: number, id: number) {
    db.delete(externalCalendars)
      .where(and(eq(externalCalendars.id, id), eq(externalCalendars.userId, userId)))
      .run();
  }

  getExternalCalendar(userId: number, id: number) {
    return db.select().from(externalCalendars)
      .where(and(eq(externalCalendars.id, id), eq(externalCalendars.userId, userId)))
      .get() ?? null;
  }

  updateExternalCalendar(userId: number, id: number, data: { name?: string; color?: string; visible?: number }) {
    const cal = this.getExternalCalendar(userId, id);
    if (!cal) return null;
    db.update(externalCalendars)
      .set({
        name: data.name ?? cal.name,
        color: data.color ?? cal.color,
        visible: data.visible ?? (cal as any).visible ?? 1,
      })
      .where(and(eq(externalCalendars.id, id), eq(externalCalendars.userId, userId)))
      .run();
    return this.getExternalCalendar(userId, id);
  }

  upsertExternalEvents(calendarId: number, events: Array<{
    uid: string; title: string;
    startDate: string; endDate: string;
    startTime: string | null; endTime: string | null;
    isAllDay: number;
    description: string | null; location: string | null;
  }>) {
    const now = new Date().toISOString();
    for (const ev of events) {
      sqlite.prepare(`
        INSERT INTO external_events
          (calendar_id, uid, title, start_date, end_date, start_time, end_time, is_all_day, description, location, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(calendar_id, uid) DO UPDATE SET
          title=excluded.title, start_date=excluded.start_date, end_date=excluded.end_date,
          start_time=excluded.start_time, end_time=excluded.end_time, is_all_day=excluded.is_all_day,
          description=excluded.description, location=excluded.location, updated_at=excluded.updated_at
      `).run(
        calendarId, ev.uid, ev.title,
        ev.startDate, ev.endDate, ev.startTime, ev.endTime,
        ev.isAllDay, ev.description, ev.location,
        now, now,
      );
    }
    // Mark last synced
    db.update(externalCalendars)
      .set({ lastSyncedAt: now })
      .where(eq(externalCalendars.id, calendarId))
      .run();
  }

  getExternalEventsInWindow(userId: number, windowStart: string, windowEnd: string) {
    return sqlite.prepare(`
      SELECT ee.*, ec.color AS calendarColor, ec.name AS calendarName, ec.url AS calendarUrl
      FROM external_events ee
      JOIN external_calendars ec ON ec.id = ee.calendar_id
      WHERE ec.user_id = ?
        AND ec.visible = 1
        AND ee.end_date >= ? AND ee.start_date <= ?
      ORDER BY ee.start_date, COALESCE(ee.start_time, '99:99')
    `).all(userId, windowStart, windowEnd) as Array<{
      id: number; calendarId: number; uid: string; title: string;
      startDate: string; endDate: string; startTime: string | null; endTime: string | null;
      isAllDay: number; description: string | null; location: string | null;
      color: string | null; calendarColor: string; calendarName: string; calendarUrl: string;
      createdAt: string; updatedAt: string;
    }>;
  }

  // PR #53 Phase 3 — Get all items (responsibilities, projects, agenda tasks) that use
  // a specific support. Used in disruption dialog to show "This may affect…" list.
  getSupportAffectedItems(
    userId: number,
    supportType: "people" | "places" | "things" | "providers" | "conditions",
    supportId: number,
  ): {
    responsibilities: Array<{ id: number; name: string }>;
    projects: Array<{ id: number; name: string }>;
    agendaTasks: Array<{ id: number; name: string }>;
  } {
    const fkField = this.envFkFieldForType(supportType);
    const respT = this.respSupportTable(supportType);
    const projT = this.projSupportTable(supportType);
    const agendaT = this.agendaTaskSupportTable(supportType);

    // Get responsibility links
    const respLinks = db.select().from(respT).where(eq(respT[fkField], supportId)).all();
    const respIds = respLinks.map((r: any) => r.responsibilityId);
    const respRows = respIds.length
      ? db.select({ id: responsibilities.id, name: responsibilities.name })
          .from(responsibilities)
          .where(and(eq(responsibilities.userId, userId), inArray(responsibilities.id, respIds)))
          .all()
      : [];

    // Get project links
    const projLinks = db.select().from(projT).where(eq(projT[fkField], supportId)).all();
    const projIds = projLinks.map((r: any) => r.projectId);
    const projRows = projIds.length
      ? db.select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(and(eq(projects.userId, userId), inArray(projects.id, projIds)))
          .all()
      : [];

    // Get agenda task links
    const agendaLinks = db.select().from(agendaT).where(eq(agendaT[fkField], supportId)).all();
    const agendaIds = agendaLinks.map((r: any) => r.agendaTaskId);
    const agendaRows = agendaIds.length
      ? db.select({ id: agendaTasks.id, title: agendaTasks.title })
          .from(agendaTasks)
          .where(and(eq(agendaTasks.userId, userId), inArray(agendaTasks.id, agendaIds)))
          .all()
      : [];

    return {
      responsibilities: respRows.map((r: any) => ({ id: r.id, name: r.name })),
      projects: projRows.map((r: any) => ({ id: r.id, name: r.title ?? "Untitled Project" })),
      agendaTasks: agendaRows.map((r: any) => ({ id: r.id, name: r.title ?? "Untitled Task" })),
    };
  }

  // ============================================================
  // PR #54 — Task Completions (Daily Review)
  // ============================================================

  // Get all completions for a user on a given date (for the review page).
  // Matches both recurring (series_id + original_date) and standalone/external
  // (agenda_task_id + original_date) completions.
  getCompletionsForDate(userId: number, date: string): TaskCompletion[] {
    return db.select().from(taskCompletions)
      .where(and(
        eq(taskCompletions.userId, userId),
        eq(taskCompletions.originalDate, date),
      ))
      .all();
  }

  // Get all completions for a user in a date range (for multi-day review views).
  getCompletionsForRange(userId: number, from: string, to: string): TaskCompletion[] {
    return db.select().from(taskCompletions)
      .where(and(
        eq(taskCompletions.userId, userId),
        gte(taskCompletions.originalDate, from),
        lte(taskCompletions.originalDate, to),
      ))
      .all();
  }

  // Get a single completion by series+date (recurring) or agendaTaskId (standalone).
  getCompletion(userId: number, key: { seriesId: number; originalDate: string } | { agendaTaskId: number }): TaskCompletion | undefined {
    if ("seriesId" in key) {
      return db.select().from(taskCompletions)
        .where(and(
          eq(taskCompletions.userId, userId),
          eq(taskCompletions.seriesId, key.seriesId),
          eq(taskCompletions.originalDate, key.originalDate),
        ))
        .get();
    }
    return db.select().from(taskCompletions)
      .where(and(
        eq(taskCompletions.userId, userId),
        eq(taskCompletions.agendaTaskId, key.agendaTaskId),
      ))
      .get();
  }

  // Upsert a completion — insert or replace if one already exists for this occurrence.
  upsertCompletion(userId: number, data: Omit<InsertTaskCompletion, "id" | "userId" | "completedAt">): TaskCompletion {
    const now = new Date().toISOString();
    // Check if one exists already and update it, otherwise insert.
    let existing: TaskCompletion | undefined;
    if (data.seriesId != null && data.originalDate != null) {
      existing = db.select().from(taskCompletions)
        .where(and(
          eq(taskCompletions.userId, userId),
          eq(taskCompletions.seriesId, data.seriesId),
          eq(taskCompletions.originalDate, data.originalDate),
        ))
        .get();
    } else if (data.agendaTaskId != null) {
      existing = db.select().from(taskCompletions)
        .where(and(
          eq(taskCompletions.userId, userId),
          eq(taskCompletions.agendaTaskId, data.agendaTaskId),
          data.originalDate != null
            ? eq(taskCompletions.originalDate, data.originalDate)
            : isNull(taskCompletions.originalDate),
        ))
        .get();
    }
    if (existing) {
      return db.update(taskCompletions)
        .set({ status: data.status, rescheduledTo: data.rescheduledTo ?? null, completedAt: now })
        .where(eq(taskCompletions.id, existing.id))
        .returning()
        .get();
    }
    return db.insert(taskCompletions)
      .values({ ...data, userId, completedAt: now })
      .returning()
      .get();
  }

  // Delete a completion (undo).
  deleteCompletion(userId: number, id: number): void {
    db.delete(taskCompletions)
      .where(and(eq(taskCompletions.id, id), eq(taskCompletions.userId, userId)))
      .run();
  }

  // Bulk upsert completions for the review page "mark all" actions.
  bulkUpsertCompletions(userId: number, items: Omit<InsertTaskCompletion, "id" | "userId" | "completedAt">[]): TaskCompletion[] {
    return items.map(item => this.upsertCompletion(userId, item));
  }
}

export const storage = new DatabaseStorage();
