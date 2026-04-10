import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc, isNull, gte } from "drizzle-orm";
import {
  purposes, visions, goals, areas, projects, actions,
  identities, habits, habitLogs, inboxItems, weeklyReviews,
  routineItems, routineLogs, plannerTasks, wizardState,
  environmentEntities, beliefs, antiHabits, immutableLaws, immutableLawLogs,
  preferences,
  type Purpose, type InsertPurpose,
  type Vision, type InsertVision,
  type Goal, type InsertGoal,
  type Area, type InsertArea,
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
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS purposes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement TEXT NOT NULL,
    principles TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS visions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    timeframe TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    anchor_moments TEXT
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    vision_id INTEGER REFERENCES visions(id),
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    habit_id INTEGER NOT NULL REFERENCES habits(id),
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS routine_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    routine_item_id INTEGER NOT NULL REFERENCES routine_items(id),
    date TEXT NOT NULL,
    completed_at TEXT,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    current_phase INTEGER NOT NULL DEFAULT 1,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS environment_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    display_name TEXT NOT NULL DEFAULT '',
    time_format TEXT NOT NULL DEFAULT '12h'
  );
`);

// Insert default preferences row if none exists
try {
  const prefRow = sqlite.prepare("SELECT id FROM preferences LIMIT 1").get();
  if (!prefRow) {
    sqlite.exec("INSERT INTO preferences (display_name, time_format) VALUES ('', '12h')");
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

export { sqlite };
export const db = drizzle(sqlite);

export interface IStorage {
  // Purposes
  getPurposes(): Purpose[];
  createPurpose(data: InsertPurpose): Purpose;
  updatePurpose(id: number, data: Partial<InsertPurpose>): Purpose | undefined;
  deletePurpose(id: number): void;

  // Visions
  getVisions(): Vision[];
  createVision(data: InsertVision): Vision;
  updateVision(id: number, data: Partial<InsertVision>): Vision | undefined;
  deleteVision(id: number): void;

  // Goals
  getGoals(): Goal[];
  createGoal(data: InsertGoal): Goal;
  updateGoal(id: number, data: Partial<InsertGoal>): Goal | undefined;
  deleteGoal(id: number): void;

  // Areas
  getAreas(): Area[];
  createArea(data: InsertArea): Area;
  updateArea(id: number, data: Partial<InsertArea>): Area | undefined;
  deleteArea(id: number): void;

  // Projects
  getProjects(): Project[];
  createProject(data: InsertProject): Project;
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): void;

  // Actions
  getActions(): Action[];
  getActionsByProject(projectId: number): Action[];
  createAction(data: InsertAction): Action;
  updateAction(id: number, data: Partial<InsertAction>): Action | undefined;
  deleteAction(id: number): void;

  // Identities
  getIdentities(): Identity[];
  createIdentity(data: InsertIdentity): Identity;
  updateIdentity(id: number, data: Partial<InsertIdentity>): Identity | undefined;
  deleteIdentity(id: number): void;

  // Habits
  getHabits(): Habit[];
  createHabit(data: InsertHabit): Habit;
  updateHabit(id: number, data: Partial<InsertHabit>): Habit | undefined;
  deleteHabit(id: number): void;

  // Habit Logs
  getHabitLogs(habitId: number): HabitLog[];
  getHabitLogsByDate(date: string): HabitLog[];
  createHabitLog(data: InsertHabitLog): HabitLog;
  deleteHabitLog(id: number): void;

  // Inbox
  getInboxItems(): InboxItem[];
  getTrashedInboxItems(): InboxItem[];
  createInboxItem(data: InsertInboxItem): InboxItem;
  updateInboxItem(id: number, data: Partial<InsertInboxItem>): InboxItem | undefined;
  softDeleteInboxItem(id: number): InboxItem | undefined;
  restoreInboxItem(id: number): InboxItem | undefined;
  deleteInboxItem(id: number): void;
  getOrCreateSomedayProject(): Project;

  // Weekly Reviews
  getWeeklyReviews(): WeeklyReview[];
  createWeeklyReview(data: InsertWeeklyReview): WeeklyReview;
  updateWeeklyReview(id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined;

  // Routine Items
  getRoutineItems(): RoutineItem[];
  createRoutineItem(data: InsertRoutineItem): RoutineItem;
  updateRoutineItem(id: number, data: Partial<InsertRoutineItem>): RoutineItem | undefined;
  deleteRoutineItem(id: number): void;

  // Routine Logs
  getRoutineLogsByDate(date: string): RoutineLog[];
  createRoutineLog(data: InsertRoutineLog): RoutineLog;
  deleteRoutineLog(id: number): void;

  // Planner Tasks
  getPlannerTasksByDate(date: string): PlannerTask[];
  getPlannerTasksByArea(areaId: number): PlannerTask[];
  getAllPlannerTasks(): PlannerTask[];
  getDraftTasks(): PlannerTask[];
  createPlannerTask(data: InsertPlannerTask): PlannerTask;
  updatePlannerTask(id: number, data: Partial<InsertPlannerTask>): PlannerTask | undefined;
  deletePlannerTask(id: number): void;

  // Environment Entities
  getEnvironmentEntities(): EnvironmentEntity[];
  getEnvironmentEntitiesByIdentity(identityId: number): EnvironmentEntity[];
  getEnvironmentEntitiesByArea(areaId: number): EnvironmentEntity[];
  createEnvironmentEntity(data: InsertEnvironmentEntity): EnvironmentEntity;
  updateEnvironmentEntity(id: number, data: Partial<InsertEnvironmentEntity>): EnvironmentEntity | undefined;
  deleteEnvironmentEntity(id: number): void;

  // Beliefs
  getBeliefs(): Belief[];
  getBeliefsByPuzzlePiece(puzzlePiece: string): Belief[];
  createBelief(data: InsertBelief): Belief;
  updateBelief(id: number, data: Partial<InsertBelief>): Belief | undefined;
  deleteBelief(id: number): void;

  // Anti-Habits
  getAntiHabits(): AntiHabit[];
  getAntiHabitsByPuzzlePiece(puzzlePiece: string): AntiHabit[];
  createAntiHabit(data: InsertAntiHabit): AntiHabit;
  updateAntiHabit(id: number, data: Partial<InsertAntiHabit>): AntiHabit | undefined;
  deleteAntiHabit(id: number): void;

  // Immutable Laws
  getImmutableLaws(): ImmutableLaw[];
  getImmutableLawsByPuzzlePiece(puzzlePiece: string): ImmutableLaw[];
  createImmutableLaw(data: InsertImmutableLaw): ImmutableLaw;
  updateImmutableLaw(id: number, data: Partial<InsertImmutableLaw>): ImmutableLaw | undefined;
  deleteImmutableLaw(id: number): void;

  // Immutable Law Logs
  getImmutableLawLogs(): ImmutableLawLog[];
  getImmutableLawLogsByLaw(lawId: number): ImmutableLawLog[];
  getImmutableLawLogsByDate(date: string): ImmutableLawLog[];
  createImmutableLawLog(data: InsertImmutableLawLog): ImmutableLawLog;

  // Wizard State
  getWizardState(): WizardState | undefined;
  upsertWizardState(data: Partial<InsertWizardState>): WizardState;

  // Preferences
  getPreferences(): { displayName: string; timeFormat: string };
  updatePreferences(data: { displayName?: string; timeFormat?: string }): { displayName: string; timeFormat: string };

  // Reset
  resetDatabase(): void;

  // Export
  getAllDataForExport(): Record<string, any[]>;
}

export class DatabaseStorage implements IStorage {
  // Purposes
  getPurposes(): Purpose[] {
    return db.select().from(purposes).all();
  }
  createPurpose(data: InsertPurpose): Purpose {
    return db.insert(purposes).values(data).returning().get();
  }
  updatePurpose(id: number, data: Partial<InsertPurpose>): Purpose | undefined {
    return db.update(purposes).set(data).where(eq(purposes.id, id)).returning().get();
  }
  deletePurpose(id: number): void {
    db.delete(purposes).where(eq(purposes.id, id)).run();
  }

  // Visions
  getVisions(): Vision[] {
    return db.select().from(visions).orderBy(desc(visions.createdAt)).all();
  }
  createVision(data: InsertVision): Vision {
    return db.insert(visions).values(data).returning().get();
  }
  updateVision(id: number, data: Partial<InsertVision>): Vision | undefined {
    return db.update(visions).set(data).where(eq(visions.id, id)).returning().get();
  }
  deleteVision(id: number): void {
    db.delete(visions).where(eq(visions.id, id)).run();
  }

  // Goals
  getGoals(): Goal[] {
    return db.select().from(goals).orderBy(desc(goals.createdAt)).all();
  }
  createGoal(data: InsertGoal): Goal {
    return db.insert(goals).values(data).returning().get();
  }
  updateGoal(id: number, data: Partial<InsertGoal>): Goal | undefined {
    return db.update(goals).set(data).where(eq(goals.id, id)).returning().get();
  }
  deleteGoal(id: number): void {
    db.delete(goals).where(eq(goals.id, id)).run();
  }

  // Areas
  getAreas(): Area[] {
    return db.select().from(areas).orderBy(asc(areas.sortOrder)).all();
  }
  createArea(data: InsertArea): Area {
    return db.insert(areas).values(data).returning().get();
  }
  updateArea(id: number, data: Partial<InsertArea>): Area | undefined {
    return db.update(areas).set(data).where(eq(areas.id, id)).returning().get();
  }
  deleteArea(id: number): void {
    db.delete(areas).where(eq(areas.id, id)).run();
  }

  // Projects
  getProjects(): Project[] {
    return db.select().from(projects).orderBy(desc(projects.createdAt)).all();
  }
  createProject(data: InsertProject): Project {
    return db.insert(projects).values(data).returning().get();
  }
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    return db.update(projects).set(data).where(eq(projects.id, id)).returning().get();
  }
  deleteProject(id: number): void {
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  // Actions
  getActions(): Action[] {
    return db.select().from(actions).orderBy(desc(actions.createdAt)).all();
  }
  getActionsByProject(projectId: number): Action[] {
    return db.select().from(actions).where(eq(actions.projectId, projectId)).all();
  }
  createAction(data: InsertAction): Action {
    return db.insert(actions).values(data).returning().get();
  }
  updateAction(id: number, data: Partial<InsertAction>): Action | undefined {
    return db.update(actions).set(data).where(eq(actions.id, id)).returning().get();
  }
  deleteAction(id: number): void {
    db.delete(actions).where(eq(actions.id, id)).run();
  }

  // Identities
  getIdentities(): Identity[] {
    return db.select().from(identities).all();
  }
  createIdentity(data: InsertIdentity): Identity {
    return db.insert(identities).values(data).returning().get();
  }
  updateIdentity(id: number, data: Partial<InsertIdentity>): Identity | undefined {
    return db.update(identities).set(data).where(eq(identities.id, id)).returning().get();
  }
  deleteIdentity(id: number): void {
    db.delete(identities).where(eq(identities.id, id)).run();
  }

  // Habits
  getHabits(): Habit[] {
    return db.select().from(habits).all();
  }
  createHabit(data: InsertHabit): Habit {
    return db.insert(habits).values(data).returning().get();
  }
  updateHabit(id: number, data: Partial<InsertHabit>): Habit | undefined {
    return db.update(habits).set(data).where(eq(habits.id, id)).returning().get();
  }
  deleteHabit(id: number): void {
    db.delete(habits).where(eq(habits.id, id)).run();
  }

  // Habit Logs
  getHabitLogs(habitId: number): HabitLog[] {
    return db.select().from(habitLogs).where(eq(habitLogs.habitId, habitId)).orderBy(desc(habitLogs.date)).all();
  }
  getHabitLogsByDate(date: string): HabitLog[] {
    return db.select().from(habitLogs).where(eq(habitLogs.date, date)).all();
  }
  createHabitLog(data: InsertHabitLog): HabitLog {
    return db.insert(habitLogs).values(data).returning().get();
  }
  deleteHabitLog(id: number): void {
    db.delete(habitLogs).where(eq(habitLogs.id, id)).run();
  }

  // Inbox
  getInboxItems(): InboxItem[] {
    return db.select().from(inboxItems).where(isNull(inboxItems.deletedAt)).orderBy(desc(inboxItems.createdAt)).all();
  }
  getTrashedInboxItems(): InboxItem[] {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return db.select().from(inboxItems)
      .where(and(
        gte(inboxItems.deletedAt, sevenDaysAgo),
      ))
      .orderBy(desc(inboxItems.deletedAt)).all();
  }
  createInboxItem(data: InsertInboxItem): InboxItem {
    return db.insert(inboxItems).values(data).returning().get();
  }
  updateInboxItem(id: number, data: Partial<InsertInboxItem>): InboxItem | undefined {
    return db.update(inboxItems).set(data).where(eq(inboxItems.id, id)).returning().get();
  }
  softDeleteInboxItem(id: number): InboxItem | undefined {
    return db.update(inboxItems).set({
      deletedAt: new Date().toISOString(),
      processed: 1,
      processedAs: "trash",
    }).where(eq(inboxItems.id, id)).returning().get();
  }
  restoreInboxItem(id: number): InboxItem | undefined {
    return db.update(inboxItems).set({
      deletedAt: null,
      processed: 0,
      processedAs: null,
    }).where(eq(inboxItems.id, id)).returning().get();
  }
  deleteInboxItem(id: number): void {
    db.delete(inboxItems).where(eq(inboxItems.id, id)).run();
  }
  getOrCreateSomedayProject(): Project {
    const existing = db.select().from(projects)
      .where(eq(projects.title, "Someday/Maybe")).get();
    if (existing) return existing;
    return db.insert(projects).values({
      title: "Someday/Maybe",
      description: "Items to revisit when the time is right",
      status: "someday",
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  // Weekly Reviews
  getWeeklyReviews(): WeeklyReview[] {
    return db.select().from(weeklyReviews).orderBy(desc(weeklyReviews.weekOf)).all();
  }
  createWeeklyReview(data: InsertWeeklyReview): WeeklyReview {
    return db.insert(weeklyReviews).values(data).returning().get();
  }
  updateWeeklyReview(id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined {
    return db.update(weeklyReviews).set(data).where(eq(weeklyReviews.id, id)).returning().get();
  }

  // Routine Items
  getRoutineItems(): RoutineItem[] {
    return db.select().from(routineItems).orderBy(asc(routineItems.sortOrder)).all();
  }
  createRoutineItem(data: InsertRoutineItem): RoutineItem {
    return db.insert(routineItems).values(data).returning().get();
  }
  updateRoutineItem(id: number, data: Partial<InsertRoutineItem>): RoutineItem | undefined {
    return db.update(routineItems).set(data).where(eq(routineItems.id, id)).returning().get();
  }
  deleteRoutineItem(id: number): void {
    db.delete(routineLogs).where(eq(routineLogs.routineItemId, id)).run();
    db.delete(routineItems).where(eq(routineItems.id, id)).run();
  }

  // Routine Logs
  getRoutineLogsByDate(date: string): RoutineLog[] {
    return db.select().from(routineLogs).where(eq(routineLogs.date, date)).all();
  }
  createRoutineLog(data: InsertRoutineLog): RoutineLog {
    return db.insert(routineLogs).values(data).returning().get();
  }
  deleteRoutineLog(id: number): void {
    db.delete(routineLogs).where(eq(routineLogs.id, id)).run();
  }

  // Planner Tasks
  getPlannerTasksByDate(date: string): PlannerTask[] {
    return db.select().from(plannerTasks).where(eq(plannerTasks.date, date)).all();
  }
  getPlannerTasksByArea(areaId: number): PlannerTask[] {
    return db.select().from(plannerTasks).where(eq(plannerTasks.areaId, areaId)).orderBy(desc(plannerTasks.date)).all();
  }
  getAllPlannerTasks(): PlannerTask[] {
    return db.select().from(plannerTasks).all();
  }
  getDraftTasks(): PlannerTask[] {
    return db.select().from(plannerTasks).where(eq(plannerTasks.isDraft, 1)).all();
  }
  createPlannerTask(data: InsertPlannerTask): PlannerTask {
    return db.insert(plannerTasks).values(data).returning().get();
  }
  updatePlannerTask(id: number, data: Partial<InsertPlannerTask>): PlannerTask | undefined {
    // Auto-publish: if startTime is being set and task is a draft, auto-set isDraft to 0
    if (data.startTime) {
      const existing = db.select().from(plannerTasks).where(eq(plannerTasks.id, id)).get();
      if (existing && existing.isDraft === 1) {
        data.isDraft = 0;
      }
    }
    return db.update(plannerTasks).set(data).where(eq(plannerTasks.id, id)).returning().get();
  }
  deletePlannerTask(id: number): void {
    db.delete(plannerTasks).where(eq(plannerTasks.id, id)).run();
  }

  // Environment Entities
  getEnvironmentEntities(): EnvironmentEntity[] {
    return db.select().from(environmentEntities).all();
  }
  getEnvironmentEntitiesByIdentity(identityId: number): EnvironmentEntity[] {
    return db.select().from(environmentEntities).where(eq(environmentEntities.identityId, identityId)).all();
  }
  getEnvironmentEntitiesByArea(areaId: number): EnvironmentEntity[] {
    return db.select().from(environmentEntities).where(eq(environmentEntities.areaId, areaId)).all();
  }
  createEnvironmentEntity(data: InsertEnvironmentEntity): EnvironmentEntity {
    return db.insert(environmentEntities).values(data).returning().get();
  }
  updateEnvironmentEntity(id: number, data: Partial<InsertEnvironmentEntity>): EnvironmentEntity | undefined {
    return db.update(environmentEntities).set(data).where(eq(environmentEntities.id, id)).returning().get();
  }
  deleteEnvironmentEntity(id: number): void {
    db.delete(environmentEntities).where(eq(environmentEntities.id, id)).run();
  }

  // Beliefs
  getBeliefs(): Belief[] {
    return db.select().from(beliefs).orderBy(desc(beliefs.createdAt)).all();
  }
  getBeliefsByPuzzlePiece(puzzlePiece: string): Belief[] {
    return db.select().from(beliefs).where(eq(beliefs.puzzlePiece, puzzlePiece)).all();
  }
  createBelief(data: InsertBelief): Belief {
    return db.insert(beliefs).values(data).returning().get();
  }
  updateBelief(id: number, data: Partial<InsertBelief>): Belief | undefined {
    return db.update(beliefs).set(data).where(eq(beliefs.id, id)).returning().get();
  }
  deleteBelief(id: number): void {
    db.delete(beliefs).where(eq(beliefs.id, id)).run();
  }

  // Anti-Habits
  getAntiHabits(): AntiHabit[] {
    return db.select().from(antiHabits).orderBy(desc(antiHabits.createdAt)).all();
  }
  getAntiHabitsByPuzzlePiece(puzzlePiece: string): AntiHabit[] {
    return db.select().from(antiHabits).where(eq(antiHabits.puzzlePiece, puzzlePiece)).all();
  }
  createAntiHabit(data: InsertAntiHabit): AntiHabit {
    return db.insert(antiHabits).values(data).returning().get();
  }
  updateAntiHabit(id: number, data: Partial<InsertAntiHabit>): AntiHabit | undefined {
    return db.update(antiHabits).set(data).where(eq(antiHabits.id, id)).returning().get();
  }
  deleteAntiHabit(id: number): void {
    db.delete(antiHabits).where(eq(antiHabits.id, id)).run();
  }

  // Immutable Laws
  getImmutableLaws(): ImmutableLaw[] {
    return db.select().from(immutableLaws).orderBy(desc(immutableLaws.createdAt)).all();
  }
  getImmutableLawsByPuzzlePiece(puzzlePiece: string): ImmutableLaw[] {
    return db.select().from(immutableLaws).where(eq(immutableLaws.puzzlePiece, puzzlePiece)).all();
  }
  createImmutableLaw(data: InsertImmutableLaw): ImmutableLaw {
    return db.insert(immutableLaws).values(data).returning().get();
  }
  updateImmutableLaw(id: number, data: Partial<InsertImmutableLaw>): ImmutableLaw | undefined {
    return db.update(immutableLaws).set(data).where(eq(immutableLaws.id, id)).returning().get();
  }
  deleteImmutableLaw(id: number): void {
    db.delete(immutableLaws).where(eq(immutableLaws.id, id)).run();
  }

  // Immutable Law Logs
  getImmutableLawLogs(): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).orderBy(desc(immutableLawLogs.createdAt)).all();
  }
  getImmutableLawLogsByLaw(lawId: number): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).where(eq(immutableLawLogs.immutableLawId, lawId)).all();
  }
  getImmutableLawLogsByDate(date: string): ImmutableLawLog[] {
    return db.select().from(immutableLawLogs).where(eq(immutableLawLogs.date, date)).all();
  }
  createImmutableLawLog(data: InsertImmutableLawLog): ImmutableLawLog {
    return db.insert(immutableLawLogs).values(data).returning().get();
  }

  // Wizard State
  getWizardState(): WizardState | undefined {
    return db.select().from(wizardState).get();
  }
  upsertWizardState(data: Partial<InsertWizardState>): WizardState {
    const existing = this.getWizardState();
    if (existing) {
      return db.update(wizardState).set(data).where(eq(wizardState.id, existing.id)).returning().get();
    }
    return db.insert(wizardState).values({
      currentPhase: data.currentPhase ?? 1,
      completed: data.completed ?? 0,
      completedAt: data.completedAt ?? null,
    }).returning().get();
  }

  // Preferences
  getPreferences(): { displayName: string; timeFormat: string } {
    const row = db.select().from(preferences).get();
    if (!row) return { displayName: "", timeFormat: "12h" };
    return { displayName: row.displayName, timeFormat: row.timeFormat };
  }
  updatePreferences(data: { displayName?: string; timeFormat?: string }): { displayName: string; timeFormat: string } {
    const existing = db.select().from(preferences).get();
    if (existing) {
      const updated: any = {};
      if (data.displayName !== undefined) updated.displayName = data.displayName;
      if (data.timeFormat !== undefined) updated.timeFormat = data.timeFormat;
      db.update(preferences).set(updated).where(eq(preferences.id, existing.id)).run();
    } else {
      db.insert(preferences).values({
        displayName: data.displayName ?? "",
        timeFormat: data.timeFormat ?? "12h",
      }).run();
    }
    return this.getPreferences();
  }

  // Reset
  resetDatabase(): void {
    const tables = [
      "purposes", "visions", "goals", "areas", "projects", "actions",
      "identities", "habits", "habit_logs", "routine_items", "routine_logs",
      "planner_tasks", "inbox_items", "weekly_reviews", "wizard_state",
      "environment_entities", "beliefs", "anti_habits", "immutable_laws", "immutable_law_logs",
    ];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table}`);
    }
    // Reset preferences to defaults
    sqlite.exec("UPDATE preferences SET display_name = '', time_format = '12h'");
  }

  // Export
  getAllDataForExport(): Record<string, any[]> {
    return {
      purposes: db.select().from(purposes).all(),
      visions: db.select().from(visions).all(),
      goals: db.select().from(goals).all(),
      areas: db.select().from(areas).all(),
      projects: db.select().from(projects).all(),
      actions: db.select().from(actions).all(),
      identities: db.select().from(identities).all(),
      habits: db.select().from(habits).all(),
      habitLogs: db.select().from(habitLogs).all(),
      routineItems: db.select().from(routineItems).all(),
      routineLogs: db.select().from(routineLogs).all(),
      plannerTasks: db.select().from(plannerTasks).all(),
      inboxItems: db.select().from(inboxItems).all(),
      weeklyReviews: db.select().from(weeklyReviews).all(),
      environmentEntities: db.select().from(environmentEntities).all(),
      beliefs: db.select().from(beliefs).all(),
      antiHabits: db.select().from(antiHabits).all(),
      immutableLaws: db.select().from(immutableLaws).all(),
      immutableLawLogs: db.select().from(immutableLawLogs).all(),
      wizardState: db.select().from(wizardState).all(),
    };
  }
}

export const storage = new DatabaseStorage();
