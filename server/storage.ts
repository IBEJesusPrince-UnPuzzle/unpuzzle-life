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
  // PR #23 — project↔support junctions (mirror of the responsibility ones).
  projectPeople, projectPlaces, projectThings, projectProviders, projectConditions,
  projectResponsibility,
  // Phase 2 calendar
  projectTasks, projectLinks, agendaTasks,
  // PR #29a — Phase 8 inbox processing
  filedNotes,
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
tryMigration("project_tasks.start_date",               `ALTER TABLE project_tasks ADD COLUMN start_date TEXT`);
tryMigration("project_tasks.end_date",                 `ALTER TABLE project_tasks ADD COLUMN end_date TEXT`);
tryMigration("project_tasks.is_all_day",               `ALTER TABLE project_tasks ADD COLUMN is_all_day INTEGER NOT NULL DEFAULT 0`);

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
    data: { relationshipType?: string; importance?: string },
  ): any {
    const t = this.projSupportTable(supportType);
    const updates: any = {};
    if (data.relationshipType !== undefined) updates.relationshipType = data.relationshipType;
    if (data.importance !== undefined) updates.importance = data.importance;
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
    sqlite.exec(`UPDATE preferences SET display_name = '', time_format = '12h', clarity_skip_ritual = 0 WHERE user_id = ${userId}`);
  }
}

export const storage = new DatabaseStorage();
