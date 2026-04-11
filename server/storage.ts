import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, or, desc, asc, isNull, gte } from "drizzle-orm";
import {
  users, invitations,
  purposes, visions, goals, areas, projects, actions,
  identities, habits, habitLogs, inboxItems, weeklyReviews,
  routineItems, routineLogs, plannerTasks, wizardState,
  environmentEntities, beliefs, antiHabits, immutableLaws, immutableLawLogs,
  preferences, areaVisionSnapshots,
  type User, type InsertUser,
  type Invitation, type InsertInvitation,
  type Purpose, type InsertPurpose,
  type Vision, type InsertVision,
  type Goal, type InsertGoal,
  type Area, type InsertArea,
  type AreaVisionSnapshot, type InsertAreaVisionSnapshot,
  type Project, type InsertProject,
  type Action, type InsertAction,
  type Identity, type InsertIdentity,
  type Habit, type InsertHabit,
  type HabitLog, type InsertHabitLog,
  type InboxItem, type InsertInboxItem,
  type WeeklyReview, type InsertWeeklyReview,
  type RoutineItem, type InsertRoutineItem,
  type RoutineLog, type InsertRoutineLog,
  type PlannerTask, type InsertPlannerTask,
  type EnvironmentEntity, type InsertEnvironmentEntity,
  type WizardState, type InsertWizardState,
  type Belief, type InsertBelief,
  type AntiHabit, type InsertAntiHabit,
  type ImmutableLaw, type InsertImmutableLaw,
  type ImmutableLawLog, type InsertImmutableLawLog,
  type Preferences,
} from "@shared/schema";

const dbPath = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables if they don't exist (handles fresh Render deploys)
// Must match shared/schema.ts exactly
// Also adds missing columns to existing tables for schema evolution
function addColumnIfMissing(table: string, column: string, definition: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.find(c => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch (_) { /* table doesn't exist yet, CREATE TABLE will handle it */ }
}
function renameColumnIfExists(table: string, oldName: string, newName: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const hasOld = cols.find(c => c.name === oldName);
    const hasNew = cols.find(c => c.name === newName);
    if (hasOld && !hasNew) {
      sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
    } else if (hasOld && hasNew) {
      // Both exist (e.g. from a previous partial migration that added newName)
      // Copy data from old to new where new is empty, then drop old column
      sqlite.exec(`UPDATE ${table} SET ${newName} = ${oldName} WHERE ${newName} = '' OR ${newName} IS NULL`);
      sqlite.exec(`ALTER TABLE ${table} DROP COLUMN ${oldName}`);
    }
  } catch (_) { /* ignore if table doesn't exist or rename fails */ }
}

// ============================================================
// TABLE CREATION
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

  CREATE TABLE IF NOT EXISTS purposes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    statement TEXT NOT NULL,
    principles TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS visions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    timeframe TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    anchor_moments TEXT
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    vision_id INTEGER REFERENCES visions(id),
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    area_id INTEGER REFERENCES areas(id),
    goal_id INTEGER REFERENCES goals(id),
    status TEXT NOT NULL DEFAULT 'active',
    due_date TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    notes TEXT,
    project_id INTEGER REFERENCES projects(id),
    area_id INTEGER REFERENCES areas(id),
    context TEXT,
    energy TEXT,
    time_estimate INTEGER,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    statement TEXT NOT NULL,
    area_id INTEGER REFERENCES areas(id),
    vision_id INTEGER REFERENCES visions(id),
    cue TEXT,
    craving TEXT,
    response TEXT,
    reward TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily',
    target_count INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    time_of_day TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    identity_id INTEGER REFERENCES identities(id),
    cue TEXT,
    craving TEXT,
    response TEXT,
    reward TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily',
    target_count INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    area_id INTEGER REFERENCES areas(id),
    time_of_day TEXT
  );
  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    habit_id INTEGER NOT NULL REFERENCES habits(id),
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS routine_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    location TEXT,
    cue TEXT,
    craving TEXT,
    response TEXT NOT NULL,
    reward TEXT,
    area_id INTEGER REFERENCES areas(id),
    habit_id INTEGER REFERENCES habits(id),
    day_variant TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    is_draft INTEGER NOT NULL DEFAULT 0,
    time_of_day TEXT
  );
  CREATE TABLE IF NOT EXISTS routine_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    routine_item_id INTEGER NOT NULL REFERENCES routine_items(id),
    date TEXT NOT NULL,
    completed_at TEXT,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    date TEXT NOT NULL,
    area_id INTEGER REFERENCES areas(id),
    goal TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    hours TEXT,
    result TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    recurrence TEXT,
    habit_id INTEGER REFERENCES habits(id),
    is_draft INTEGER NOT NULL DEFAULT 0,
    source_type TEXT
  );
  CREATE TABLE IF NOT EXISTS inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    notes TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    processed_as TEXT,
    deleted_at TEXT,
    reference_area_id INTEGER REFERENCES areas(id),
    reference_project_id INTEGER REFERENCES projects(id),
    area_id INTEGER REFERENCES areas(id),
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
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wizard_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    current_phase INTEGER NOT NULL DEFAULT 1,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS environment_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    identity_id INTEGER REFERENCES identities(id),
    area_id INTEGER REFERENCES areas(id),
    puzzle_piece TEXT,
    type TEXT NOT NULL,
    person_name TEXT,
    person_contact_method TEXT,
    person_contact_info TEXT,
    person_why TEXT,
    place_name TEXT,
    place_address TEXT,
    place_travel_method TEXT,
    place_why TEXT,
    thing_name TEXT,
    thing_usage TEXT,
    thing_why TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS beliefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    puzzle_piece TEXT NOT NULL,
    area_id INTEGER REFERENCES areas(id),
    old_belief TEXT NOT NULL DEFAULT '',
    new_belief TEXT NOT NULL DEFAULT '',
    why_it_matters TEXT,
    repetition_count INTEGER NOT NULL DEFAULT 0,
    graduated INTEGER NOT NULL DEFAULT 0,
    graduated_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS anti_habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    puzzle_piece TEXT NOT NULL,
    area_id INTEGER REFERENCES areas(id),
    identity_id INTEGER REFERENCES identities(id),
    title TEXT NOT NULL DEFAULT '',
    description TEXT,
    make_invisible TEXT,
    make_unattractive TEXT,
    make_difficult TEXT,
    make_unsatisfying TEXT,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_slip_date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS immutable_laws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    puzzle_piece TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    statement TEXT NOT NULL DEFAULT '',
    why_it_matters TEXT,
    linked_identity_ids TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    is_red_line INTEGER NOT NULL DEFAULT 0,
    enforcement_level INTEGER NOT NULL DEFAULT 1,
    trigger_conditions TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS immutable_law_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    immutable_law_id INTEGER NOT NULL REFERENCES immutable_laws(id),
    puzzle_piece TEXT NOT NULL,
    date TEXT NOT NULL,
    kept INTEGER NOT NULL,
    note TEXT,
    trigger_type TEXT,
    was_override INTEGER NOT NULL DEFAULT 0,
    override_reason TEXT,
    suggested_anti_habit_id INTEGER REFERENCES anti_habits(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    display_name TEXT NOT NULL DEFAULT '',
    time_format TEXT NOT NULL DEFAULT '12h'
  );

  CREATE TABLE IF NOT EXISTS area_vision_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    area_id INTEGER NOT NULL REFERENCES areas(id),
    previous_vision TEXT NOT NULL,
    note TEXT,
    changed_at TEXT NOT NULL
  );
`);

// Insert default preferences row if none exists
try {
  const prefRow = sqlite.prepare("SELECT id FROM preferences LIMIT 1").get();
  if (!prefRow) {
    sqlite.exec("INSERT INTO preferences (user_id, display_name, time_format) VALUES (1, '', '12h')");
  }
} catch (_) { /* table will be handled above */ }

// Migrate renamed columns (old schema → new schema)
renameColumnIfExists("inbox_items", "text", "content");
renameColumnIfExists("projects", "name", "title");
renameColumnIfExists("weekly_reviews", "week_start", "week_of");

// Migrate missing columns on existing tables
// Core columns that may be missing on production DBs created before schema evolution
addColumnIfMissing("inbox_items", "content", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("inbox_items", "area_id", "INTEGER");
addColumnIfMissing("inbox_items", "created_at", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("projects", "title", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("projects", "status", "TEXT NOT NULL DEFAULT 'active'");
addColumnIfMissing("projects", "created_at", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("projects", "goal_id", "INTEGER");
addColumnIfMissing("actions", "area_id", "INTEGER");
addColumnIfMissing("actions", "title", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("actions", "created_at", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("areas", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("visions", "anchor_moments", "TEXT");
addColumnIfMissing("projects", "due_date", "TEXT");
addColumnIfMissing("actions", "notes", "TEXT");
addColumnIfMissing("actions", "due_date", "TEXT");
addColumnIfMissing("actions", "completed", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("actions", "completed_at", "TEXT");
addColumnIfMissing("habits", "identity_id", "INTEGER");
addColumnIfMissing("habits", "cue", "TEXT");
addColumnIfMissing("habits", "craving", "TEXT");
addColumnIfMissing("habits", "response", "TEXT");
addColumnIfMissing("habits", "reward", "TEXT");
addColumnIfMissing("habits", "time_of_day", "TEXT");
addColumnIfMissing("routine_items", "time", "TEXT DEFAULT '08:00'");
addColumnIfMissing("routine_items", "duration_minutes", "INTEGER NOT NULL DEFAULT 10");
addColumnIfMissing("routine_items", "location", "TEXT");
addColumnIfMissing("routine_items", "cue", "TEXT");
addColumnIfMissing("routine_items", "craving", "TEXT");
addColumnIfMissing("routine_items", "response", "TEXT DEFAULT ''");
addColumnIfMissing("routine_items", "reward", "TEXT");
addColumnIfMissing("routine_items", "area_id", "INTEGER");
addColumnIfMissing("routine_items", "habit_id", "INTEGER");
addColumnIfMissing("routine_items", "day_variant", "TEXT");
addColumnIfMissing("routine_items", "active", "INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("routine_items", "is_draft", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("routine_items", "time_of_day", "TEXT");
addColumnIfMissing("routine_logs", "completed_at", "TEXT");
addColumnIfMissing("routine_logs", "note", "TEXT");
addColumnIfMissing("inbox_items", "notes", "TEXT");
addColumnIfMissing("inbox_items", "processed_as", "TEXT");
addColumnIfMissing("inbox_items", "deleted_at", "TEXT");
addColumnIfMissing("inbox_items", "reference_area_id", "INTEGER");
addColumnIfMissing("inbox_items", "reference_project_id", "INTEGER");
addColumnIfMissing("weekly_reviews", "inbox_cleared", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("weekly_reviews", "projects_reviewed", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("weekly_reviews", "habits_reviewed", "INTEGER NOT NULL DEFAULT 0");

// Ensure identities table has all habit-loop columns (may be missing if DB was created before schema update)
addColumnIfMissing("identities", "cue", "TEXT");
addColumnIfMissing("identities", "craving", "TEXT");
addColumnIfMissing("identities", "response", "TEXT");
addColumnIfMissing("identities", "reward", "TEXT");
addColumnIfMissing("identities", "time_of_day", "TEXT");

// Phase 1: puzzle piece, environment entities, identity→project→routine chain
addColumnIfMissing("areas", "puzzle_piece", "TEXT");
addColumnIfMissing("areas", "vision_text", "TEXT");
addColumnIfMissing("identities", "puzzle_piece", "TEXT");
addColumnIfMissing("identities", "location", "TEXT");
addColumnIfMissing("identities", "environment_type", "TEXT");
addColumnIfMissing("identities", "env_person_name", "TEXT");
addColumnIfMissing("identities", "env_person_contact_method", "TEXT");
addColumnIfMissing("identities", "env_person_contact_info", "TEXT");
addColumnIfMissing("identities", "env_person_why", "TEXT");
addColumnIfMissing("identities", "env_place_name", "TEXT");
addColumnIfMissing("identities", "env_place_address", "TEXT");
addColumnIfMissing("identities", "env_place_travel_method", "TEXT");
addColumnIfMissing("identities", "env_place_why", "TEXT");
addColumnIfMissing("identities", "env_thing_name", "TEXT");
addColumnIfMissing("identities", "env_thing_usage", "TEXT");
addColumnIfMissing("identities", "env_thing_why", "TEXT");
addColumnIfMissing("projects", "puzzle_piece", "TEXT");
addColumnIfMissing("projects", "identity_id", "INTEGER");
addColumnIfMissing("weekly_reviews", "puzzle_piece_ratings", "TEXT");

// Ensure wizard_state has all columns
addColumnIfMissing("wizard_state", "current_phase", "INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("wizard_state", "completed", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("wizard_state", "completed_at", "TEXT");

// Area edit & archive: archived/archived_at columns on all linked tables
addColumnIfMissing("areas", "archived_at", "TEXT");
addColumnIfMissing("identities", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("identities", "archived_at", "TEXT");
addColumnIfMissing("habits", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("habits", "archived_at", "TEXT");
addColumnIfMissing("projects", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("projects", "archived_at", "TEXT");
addColumnIfMissing("actions", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("actions", "archived_at", "TEXT");

// Multi-tenancy: add user_id to ALL existing tables
const allDataTables = [
  "purposes", "visions", "goals", "areas", "projects", "actions",
  "identities", "habits", "habit_logs", "routine_items", "routine_logs",
  "planner_tasks", "inbox_items", "weekly_reviews", "wizard_state",
  "environment_entities", "beliefs", "anti_habits", "immutable_laws",
  "immutable_law_logs", "preferences", "area_vision_snapshots",
];
for (const table of allDataTables) {
  addColumnIfMissing(table, "user_id", "INTEGER NOT NULL DEFAULT 1");
}

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

  // Purposes
  getPurposes(userId: number): Purpose[];
  createPurpose(userId: number, data: InsertPurpose): Purpose;
  updatePurpose(userId: number, id: number, data: Partial<InsertPurpose>): Purpose | undefined;
  deletePurpose(userId: number, id: number): void;

  // Visions
  getVisions(userId: number): Vision[];
  createVision(userId: number, data: InsertVision): Vision;
  updateVision(userId: number, id: number, data: Partial<InsertVision>): Vision | undefined;
  deleteVision(userId: number, id: number): void;

  // Goals
  getGoals(userId: number): Goal[];
  createGoal(userId: number, data: InsertGoal): Goal;
  updateGoal(userId: number, id: number, data: Partial<InsertGoal>): Goal | undefined;
  deleteGoal(userId: number, id: number): void;

  // Areas
  getAreas(userId: number): Area[];
  getAllAreasIncludingArchived(userId: number): Area[];
  createArea(userId: number, data: InsertArea): Area;
  updateArea(userId: number, id: number, data: Partial<InsertArea>): Area | undefined;
  deleteArea(userId: number, id: number): void;

  // Area Vision Snapshots
  getAreaVisionSnapshots(userId: number, areaId: number): AreaVisionSnapshot[];
  createAreaVisionSnapshot(userId: number, data: InsertAreaVisionSnapshot): AreaVisionSnapshot;

  // Projects
  getProjects(userId: number): Project[];
  createProject(userId: number, data: InsertProject): Project;
  updateProject(userId: number, id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(userId: number, id: number): void;

  // Actions
  getActions(userId: number): Action[];
  getActionsByProject(userId: number, projectId: number): Action[];
  createAction(userId: number, data: InsertAction): Action;
  updateAction(userId: number, id: number, data: Partial<InsertAction>): Action | undefined;
  deleteAction(userId: number, id: number): void;

  // Identities
  getIdentities(userId: number): Identity[];
  createIdentity(userId: number, data: InsertIdentity): Identity;
  updateIdentity(userId: number, id: number, data: Partial<InsertIdentity>): Identity | undefined;
  deleteIdentity(userId: number, id: number): void;

  // Habits
  getHabits(userId: number): Habit[];
  createHabit(userId: number, data: InsertHabit): Habit;
  updateHabit(userId: number, id: number, data: Partial<InsertHabit>): Habit | undefined;
  deleteHabit(userId: number, id: number): void;

  // Habit Logs
  getHabitLogs(userId: number, habitId: number): HabitLog[];
  getHabitLogsByDate(userId: number, date: string): HabitLog[];
  createHabitLog(userId: number, data: InsertHabitLog): HabitLog;
  deleteHabitLog(userId: number, id: number): void;

  // Inbox
  getInboxItems(userId: number): InboxItem[];
  getTrashedInboxItems(userId: number): InboxItem[];
  createInboxItem(userId: number, data: InsertInboxItem): InboxItem;
  updateInboxItem(userId: number, id: number, data: Partial<InsertInboxItem>): InboxItem | undefined;
  softDeleteInboxItem(userId: number, id: number): InboxItem | undefined;
  restoreInboxItem(userId: number, id: number): InboxItem | undefined;
  deleteInboxItem(userId: number, id: number): void;
  getOrCreateSomedayProject(userId: number): Project;

  // Weekly Reviews
  getWeeklyReviews(userId: number): WeeklyReview[];
  createWeeklyReview(userId: number, data: InsertWeeklyReview): WeeklyReview;
  updateWeeklyReview(userId: number, id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined;

  // Routine Items
  getRoutineItems(userId: number): RoutineItem[];
  createRoutineItem(userId: number, data: InsertRoutineItem): RoutineItem;
  updateRoutineItem(userId: number, id: number, data: Partial<InsertRoutineItem>): RoutineItem | undefined;
  deleteRoutineItem(userId: number, id: number): void;

  // Routine Logs
  getRoutineLogsByDate(userId: number, date: string): RoutineLog[];
  createRoutineLog(userId: number, data: InsertRoutineLog): RoutineLog;
  deleteRoutineLog(userId: number, id: number): void;

  // Planner Tasks
  getPlannerTasksByDate(userId: number, date: string): PlannerTask[];
  getPlannerTasksByArea(userId: number, areaId: number): PlannerTask[];
  getAllPlannerTasks(userId: number): PlannerTask[];
  getDraftTasks(userId: number): PlannerTask[];
  createPlannerTask(userId: number, data: InsertPlannerTask): PlannerTask;
  updatePlannerTask(userId: number, id: number, data: Partial<InsertPlannerTask>): PlannerTask | undefined;
  deletePlannerTask(userId: number, id: number): void;

  // Environment Entities
  getEnvironmentEntities(userId: number): EnvironmentEntity[];
  getEnvironmentEntitiesByIdentity(userId: number, identityId: number): EnvironmentEntity[];
  getEnvironmentEntitiesByArea(userId: number, areaId: number): EnvironmentEntity[];
  createEnvironmentEntity(userId: number, data: InsertEnvironmentEntity): EnvironmentEntity;
  updateEnvironmentEntity(userId: number, id: number, data: Partial<InsertEnvironmentEntity>): EnvironmentEntity | undefined;
  deleteEnvironmentEntity(userId: number, id: number): void;

  // Beliefs
  getBeliefs(userId: number): Belief[];
  getBeliefsByPuzzlePiece(userId: number, puzzlePiece: string): Belief[];
  createBelief(userId: number, data: InsertBelief): Belief;
  updateBelief(userId: number, id: number, data: Partial<InsertBelief>): Belief | undefined;
  deleteBelief(userId: number, id: number): void;

  // Anti-Habits
  getAntiHabits(userId: number): AntiHabit[];
  getAntiHabitsByPuzzlePiece(userId: number, puzzlePiece: string): AntiHabit[];
  createAntiHabit(userId: number, data: InsertAntiHabit): AntiHabit;
  updateAntiHabit(userId: number, id: number, data: Partial<InsertAntiHabit>): AntiHabit | undefined;
  deleteAntiHabit(userId: number, id: number): void;

  // Immutable Laws
  getImmutableLaws(userId: number): ImmutableLaw[];
  getImmutableLawsByPuzzlePiece(userId: number, puzzlePiece: string): ImmutableLaw[];
  createImmutableLaw(userId: number, data: InsertImmutableLaw): ImmutableLaw;
  updateImmutableLaw(userId: number, id: number, data: Partial<InsertImmutableLaw>): ImmutableLaw | undefined;
  deleteImmutableLaw(userId: number, id: number): void;

  // Immutable Law Logs
  getImmutableLawLogs(userId: number): ImmutableLawLog[];
  getImmutableLawLogsByLaw(userId: number, lawId: number): ImmutableLawLog[];
  getImmutableLawLogsByDate(userId: number, date: string): ImmutableLawLog[];
  createImmutableLawLog(userId: number, data: InsertImmutableLawLog): ImmutableLawLog;

  // Wizard State
  getWizardState(userId: number): WizardState | undefined;
  upsertWizardState(userId: number, data: Partial<InsertWizardState>): WizardState;

  // Preferences
  getPreferences(userId: number): { displayName: string; timeFormat: string };
  updatePreferences(userId: number, data: { displayName?: string; timeFormat?: string }): { displayName: string; timeFormat: string };

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

  // Purposes
  getPurposes(userId: number): Purpose[] {
    return db.select().from(purposes).where(eq(purposes.userId, userId)).all();
  }
  createPurpose(userId: number, data: InsertPurpose): Purpose {
    return db.insert(purposes).values({ ...data, userId }).returning().get();
  }
  updatePurpose(userId: number, id: number, data: Partial<InsertPurpose>): Purpose | undefined {
    return db.update(purposes).set(data).where(and(eq(purposes.id, id), eq(purposes.userId, userId))).returning().get();
  }
  deletePurpose(userId: number, id: number): void {
    db.delete(purposes).where(and(eq(purposes.id, id), eq(purposes.userId, userId))).run();
  }

  // Visions
  getVisions(userId: number): Vision[] {
    return db.select().from(visions).where(eq(visions.userId, userId)).orderBy(desc(visions.createdAt)).all();
  }
  createVision(userId: number, data: InsertVision): Vision {
    return db.insert(visions).values({ ...data, userId }).returning().get();
  }
  updateVision(userId: number, id: number, data: Partial<InsertVision>): Vision | undefined {
    return db.update(visions).set(data).where(and(eq(visions.id, id), eq(visions.userId, userId))).returning().get();
  }
  deleteVision(userId: number, id: number): void {
    db.delete(visions).where(and(eq(visions.id, id), eq(visions.userId, userId))).run();
  }

  // Goals
  getGoals(userId: number): Goal[] {
    return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt)).all();
  }
  createGoal(userId: number, data: InsertGoal): Goal {
    return db.insert(goals).values({ ...data, userId }).returning().get();
  }
  updateGoal(userId: number, id: number, data: Partial<InsertGoal>): Goal | undefined {
    return db.update(goals).set(data).where(and(eq(goals.id, id), eq(goals.userId, userId))).returning().get();
  }
  deleteGoal(userId: number, id: number): void {
    db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId))).run();
  }

  // Areas
  getAreas(userId: number): Area[] {
    return db.select().from(areas).where(and(eq(areas.userId, userId), or(eq(areas.archived, 0), isNull(areas.archived)))).orderBy(asc(areas.sortOrder)).all();
  }
  getAllAreasIncludingArchived(userId: number): Area[] {
    return db.select().from(areas).where(eq(areas.userId, userId)).orderBy(asc(areas.sortOrder)).all();
  }
  createArea(userId: number, data: InsertArea): Area {
    return db.insert(areas).values({ ...data, userId }).returning().get();
  }
  updateArea(userId: number, id: number, data: Partial<InsertArea>): Area | undefined {
    return db.update(areas).set(data).where(and(eq(areas.id, id), eq(areas.userId, userId))).returning().get();
  }
  deleteArea(userId: number, id: number): void {
    db.delete(areas).where(and(eq(areas.id, id), eq(areas.userId, userId))).run();
  }

  // Area Vision Snapshots
  getAreaVisionSnapshots(userId: number, areaId: number): AreaVisionSnapshot[] {
    return db.select().from(areaVisionSnapshots).where(and(eq(areaVisionSnapshots.areaId, areaId), eq(areaVisionSnapshots.userId, userId))).orderBy(desc(areaVisionSnapshots.changedAt)).all();
  }
  createAreaVisionSnapshot(userId: number, data: InsertAreaVisionSnapshot): AreaVisionSnapshot {
    return db.insert(areaVisionSnapshots).values({ ...data, userId }).returning().get();
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

  // Actions
  getActions(userId: number): Action[] {
    return db.select().from(actions).where(and(eq(actions.userId, userId), or(eq(actions.archived, 0), isNull(actions.archived)))).orderBy(desc(actions.createdAt)).all();
  }
  getActionsByProject(userId: number, projectId: number): Action[] {
    return db.select().from(actions).where(and(eq(actions.projectId, projectId), eq(actions.userId, userId))).all();
  }
  createAction(userId: number, data: InsertAction): Action {
    return db.insert(actions).values({ ...data, userId }).returning().get();
  }
  updateAction(userId: number, id: number, data: Partial<InsertAction>): Action | undefined {
    return db.update(actions).set(data).where(and(eq(actions.id, id), eq(actions.userId, userId))).returning().get();
  }
  deleteAction(userId: number, id: number): void {
    db.delete(actions).where(and(eq(actions.id, id), eq(actions.userId, userId))).run();
  }

  // Identities
  getIdentities(userId: number): Identity[] {
    return db.select().from(identities).where(and(eq(identities.userId, userId), or(eq(identities.archived, 0), isNull(identities.archived)))).all();
  }
  createIdentity(userId: number, data: InsertIdentity): Identity {
    return db.insert(identities).values({ ...data, userId }).returning().get();
  }
  updateIdentity(userId: number, id: number, data: Partial<InsertIdentity>): Identity | undefined {
    return db.update(identities).set(data).where(and(eq(identities.id, id), eq(identities.userId, userId))).returning().get();
  }
  deleteIdentity(userId: number, id: number): void {
    db.delete(identities).where(and(eq(identities.id, id), eq(identities.userId, userId))).run();
  }

  // Habits
  getHabits(userId: number): Habit[] {
    return db.select().from(habits).where(and(eq(habits.userId, userId), or(eq(habits.archived, 0), isNull(habits.archived)))).all();
  }
  createHabit(userId: number, data: InsertHabit): Habit {
    return db.insert(habits).values({ ...data, userId }).returning().get();
  }
  updateHabit(userId: number, id: number, data: Partial<InsertHabit>): Habit | undefined {
    return db.update(habits).set(data).where(and(eq(habits.id, id), eq(habits.userId, userId))).returning().get();
  }
  deleteHabit(userId: number, id: number): void {
    db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId))).run();
  }

  // Habit Logs
  getHabitLogs(userId: number, habitId: number): HabitLog[] {
    return db.select().from(habitLogs).where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId))).orderBy(desc(habitLogs.date)).all();
  }
  getHabitLogsByDate(userId: number, date: string): HabitLog[] {
    return db.select().from(habitLogs).where(and(eq(habitLogs.date, date), eq(habitLogs.userId, userId))).all();
  }
  createHabitLog(userId: number, data: InsertHabitLog): HabitLog {
    return db.insert(habitLogs).values({ ...data, userId }).returning().get();
  }
  deleteHabitLog(userId: number, id: number): void {
    db.delete(habitLogs).where(and(eq(habitLogs.id, id), eq(habitLogs.userId, userId))).run();
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
  getOrCreateSomedayProject(userId: number): Project {
    const existing = db.select().from(projects)
      .where(and(eq(projects.title, "Someday/Maybe"), eq(projects.userId, userId))).get();
    if (existing) return existing;
    return db.insert(projects).values({
      userId,
      title: "Someday/Maybe",
      description: "Items to revisit when the time is right",
      status: "someday",
      createdAt: new Date().toISOString(),
    }).returning().get();
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

  // Routine Items
  getRoutineItems(userId: number): RoutineItem[] {
    return db.select().from(routineItems).where(eq(routineItems.userId, userId)).orderBy(asc(routineItems.sortOrder)).all();
  }
  createRoutineItem(userId: number, data: InsertRoutineItem): RoutineItem {
    return db.insert(routineItems).values({ ...data, userId }).returning().get();
  }
  updateRoutineItem(userId: number, id: number, data: Partial<InsertRoutineItem>): RoutineItem | undefined {
    return db.update(routineItems).set(data).where(and(eq(routineItems.id, id), eq(routineItems.userId, userId))).returning().get();
  }
  deleteRoutineItem(userId: number, id: number): void {
    // Delete related logs first, then the item — both scoped to user
    db.delete(routineLogs).where(and(eq(routineLogs.routineItemId, id), eq(routineLogs.userId, userId))).run();
    db.delete(routineItems).where(and(eq(routineItems.id, id), eq(routineItems.userId, userId))).run();
  }

  // Routine Logs
  getRoutineLogsByDate(userId: number, date: string): RoutineLog[] {
    return db.select().from(routineLogs).where(and(eq(routineLogs.date, date), eq(routineLogs.userId, userId))).all();
  }
  createRoutineLog(userId: number, data: InsertRoutineLog): RoutineLog {
    return db.insert(routineLogs).values({ ...data, userId }).returning().get();
  }
  deleteRoutineLog(userId: number, id: number): void {
    db.delete(routineLogs).where(and(eq(routineLogs.id, id), eq(routineLogs.userId, userId))).run();
  }

  // Planner Tasks
  getPlannerTasksByDate(userId: number, date: string): PlannerTask[] {
    return db.select().from(plannerTasks).where(and(eq(plannerTasks.date, date), eq(plannerTasks.userId, userId))).all();
  }
  getPlannerTasksByArea(userId: number, areaId: number): PlannerTask[] {
    return db.select().from(plannerTasks).where(and(eq(plannerTasks.areaId, areaId), eq(plannerTasks.userId, userId))).orderBy(desc(plannerTasks.date)).all();
  }
  getAllPlannerTasks(userId: number): PlannerTask[] {
    return db.select().from(plannerTasks).where(eq(plannerTasks.userId, userId)).all();
  }
  getDraftTasks(userId: number): PlannerTask[] {
    return db.select().from(plannerTasks).where(and(eq(plannerTasks.isDraft, 1), eq(plannerTasks.userId, userId))).all();
  }
  createPlannerTask(userId: number, data: InsertPlannerTask): PlannerTask {
    return db.insert(plannerTasks).values({ ...data, userId }).returning().get();
  }
  updatePlannerTask(userId: number, id: number, data: Partial<InsertPlannerTask>): PlannerTask | undefined {
    // Auto-publish: if startTime is being set and task is a draft, auto-set isDraft to 0
    if (data.startTime) {
      const existing = db.select().from(plannerTasks).where(and(eq(plannerTasks.id, id), eq(plannerTasks.userId, userId))).get();
      if (existing && existing.isDraft === 1) {
        data.isDraft = 0;
      }
    }
    return db.update(plannerTasks).set(data).where(and(eq(plannerTasks.id, id), eq(plannerTasks.userId, userId))).returning().get();
  }
  deletePlannerTask(userId: number, id: number): void {
    db.delete(plannerTasks).where(and(eq(plannerTasks.id, id), eq(plannerTasks.userId, userId))).run();
  }

  // Environment Entities
  getEnvironmentEntities(userId: number): EnvironmentEntity[] {
    return db.select().from(environmentEntities).where(eq(environmentEntities.userId, userId)).all();
  }
  getEnvironmentEntitiesByIdentity(userId: number, identityId: number): EnvironmentEntity[] {
    return db.select().from(environmentEntities).where(and(eq(environmentEntities.identityId, identityId), eq(environmentEntities.userId, userId))).all();
  }
  getEnvironmentEntitiesByArea(userId: number, areaId: number): EnvironmentEntity[] {
    return db.select().from(environmentEntities).where(and(eq(environmentEntities.areaId, areaId), eq(environmentEntities.userId, userId))).all();
  }
  createEnvironmentEntity(userId: number, data: InsertEnvironmentEntity): EnvironmentEntity {
    return db.insert(environmentEntities).values({ ...data, userId }).returning().get();
  }
  updateEnvironmentEntity(userId: number, id: number, data: Partial<InsertEnvironmentEntity>): EnvironmentEntity | undefined {
    return db.update(environmentEntities).set(data).where(and(eq(environmentEntities.id, id), eq(environmentEntities.userId, userId))).returning().get();
  }
  deleteEnvironmentEntity(userId: number, id: number): void {
    db.delete(environmentEntities).where(and(eq(environmentEntities.id, id), eq(environmentEntities.userId, userId))).run();
  }

  // Beliefs
  getBeliefs(userId: number): Belief[] {
    return db.select().from(beliefs).where(eq(beliefs.userId, userId)).orderBy(desc(beliefs.createdAt)).all();
  }
  getBeliefsByPuzzlePiece(userId: number, puzzlePiece: string): Belief[] {
    return db.select().from(beliefs).where(and(eq(beliefs.puzzlePiece, puzzlePiece), eq(beliefs.userId, userId))).all();
  }
  createBelief(userId: number, data: InsertBelief): Belief {
    return db.insert(beliefs).values({ ...data, userId }).returning().get();
  }
  updateBelief(userId: number, id: number, data: Partial<InsertBelief>): Belief | undefined {
    return db.update(beliefs).set(data).where(and(eq(beliefs.id, id), eq(beliefs.userId, userId))).returning().get();
  }
  deleteBelief(userId: number, id: number): void {
    db.delete(beliefs).where(and(eq(beliefs.id, id), eq(beliefs.userId, userId))).run();
  }

  // Anti-Habits
  getAntiHabits(userId: number): AntiHabit[] {
    return db.select().from(antiHabits).where(eq(antiHabits.userId, userId)).orderBy(desc(antiHabits.createdAt)).all();
  }
  getAntiHabitsByPuzzlePiece(userId: number, puzzlePiece: string): AntiHabit[] {
    return db.select().from(antiHabits).where(and(eq(antiHabits.puzzlePiece, puzzlePiece), eq(antiHabits.userId, userId))).all();
  }
  createAntiHabit(userId: number, data: InsertAntiHabit): AntiHabit {
    return db.insert(antiHabits).values({ ...data, userId }).returning().get();
  }
  updateAntiHabit(userId: number, id: number, data: Partial<InsertAntiHabit>): AntiHabit | undefined {
    return db.update(antiHabits).set(data).where(and(eq(antiHabits.id, id), eq(antiHabits.userId, userId))).returning().get();
  }
  deleteAntiHabit(userId: number, id: number): void {
    db.delete(antiHabits).where(and(eq(antiHabits.id, id), eq(antiHabits.userId, userId))).run();
  }

  // Immutable Laws
  getImmutableLaws(userId: number): ImmutableLaw[] {
    return db.select().from(immutableLaws).where(eq(immutableLaws.userId, userId)).orderBy(desc(immutableLaws.createdAt)).all();
  }
  getImmutableLawsByPuzzlePiece(userId: number, puzzlePiece: string): ImmutableLaw[] {
    return db.select().from(immutableLaws).where(and(eq(immutableLaws.puzzlePiece, puzzlePiece), eq(immutableLaws.userId, userId))).all();
  }
  createImmutableLaw(userId: number, data: InsertImmutableLaw): ImmutableLaw {
    return db.insert(immutableLaws).values({ ...data, userId }).returning().get();
  }
  updateImmutableLaw(userId: number, id: number, data: Partial<InsertImmutableLaw>): ImmutableLaw | undefined {
    return db.update(immutableLaws).set(data).where(and(eq(immutableLaws.id, id), eq(immutableLaws.userId, userId))).returning().get();
  }
  deleteImmutableLaw(userId: number, id: number): void {
    db.delete(immutableLaws).where(and(eq(immutableLaws.id, id), eq(immutableLaws.userId, userId))).run();
  }

  // Immutable Law Logs
  getImmutableLawLogs(userId: number): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).where(eq(immutableLawLogs.userId, userId)).orderBy(desc(immutableLawLogs.createdAt)).all();
  }
  getImmutableLawLogsByLaw(userId: number, lawId: number): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).where(and(eq(immutableLawLogs.immutableLawId, lawId), eq(immutableLawLogs.userId, userId))).all();
  }
  getImmutableLawLogsByDate(userId: number, date: string): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).where(and(eq(immutableLawLogs.date, date), eq(immutableLawLogs.userId, userId))).all();
  }
  createImmutableLawLog(userId: number, data: InsertImmutableLawLog): ImmutableLawLog {
    return db.insert(immutableLawLogs).values({ ...data, userId }).returning().get();
  }

  // Wizard State
  getWizardState(userId: number): WizardState | undefined {
    return db.select().from(wizardState).where(eq(wizardState.userId, userId)).get();
  }
  upsertWizardState(userId: number, data: Partial<InsertWizardState>): WizardState {
    const existing = this.getWizardState(userId);
    if (existing) {
      return db.update(wizardState).set(data).where(eq(wizardState.id, existing.id)).returning().get();
    }
    return db.insert(wizardState).values({
      userId,
      currentPhase: data.currentPhase ?? 1,
      completed: data.completed ?? 0,
      completedAt: data.completedAt ?? null,
    }).returning().get();
  }

  // Preferences
  getPreferences(userId: number): { displayName: string; timeFormat: string } {
    const row = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (!row) return { displayName: "", timeFormat: "12h" };
    return { displayName: row.displayName, timeFormat: row.timeFormat };
  }
  updatePreferences(userId: number, data: { displayName?: string; timeFormat?: string }): { displayName: string; timeFormat: string } {
    const existing = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (existing) {
      const updated: any = {};
      if (data.displayName !== undefined) updated.displayName = data.displayName;
      if (data.timeFormat !== undefined) updated.timeFormat = data.timeFormat;
      db.update(preferences).set(updated).where(eq(preferences.id, existing.id)).run();
    } else {
      db.insert(preferences).values({
        userId,
        displayName: data.displayName ?? "",
        timeFormat: data.timeFormat ?? "12h",
      }).run();
    }
    return this.getPreferences(userId);
  }

  // Reset
  resetDatabase(userId: number): void {
    const tables = [
      "purposes", "visions", "goals", "areas", "projects", "actions",
      "identities", "habits", "habit_logs", "routine_items", "routine_logs",
      "planner_tasks", "inbox_items", "weekly_reviews", "wizard_state",
      "environment_entities", "beliefs", "anti_habits", "immutable_laws", "immutable_law_logs",
      "area_vision_snapshots",
    ];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table} WHERE user_id = ${userId}`);
    }
    // Reset preferences to defaults for this user
    sqlite.exec(`UPDATE preferences SET display_name = '', time_format = '12h' WHERE user_id = ${userId}`);
  }

}

export const storage = new DatabaseStorage();
