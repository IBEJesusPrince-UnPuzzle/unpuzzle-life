import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  purposes, visions, goals, areas, projects, actions,
  identities, habits, habitLogs, inboxItems, weeklyReviews,
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
} from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
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
  createInboxItem(data: InsertInboxItem): InboxItem;
  updateInboxItem(id: number, data: Partial<InsertInboxItem>): InboxItem | undefined;
  deleteInboxItem(id: number): void;

  // Weekly Reviews
  getWeeklyReviews(): WeeklyReview[];
  createWeeklyReview(data: InsertWeeklyReview): WeeklyReview;
  updateWeeklyReview(id: number, data: Partial<InsertWeeklyReview>): WeeklyReview | undefined;
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
    return db.select().from(inboxItems).orderBy(desc(inboxItems.createdAt)).all();
  }
  createInboxItem(data: InsertInboxItem): InboxItem {
    return db.insert(inboxItems).values(data).returning().get();
  }
  updateInboxItem(id: number, data: Partial<InsertInboxItem>): InboxItem | undefined {
    return db.update(inboxItems).set(data).where(eq(inboxItems.id, id)).returning().get();
  }
  deleteInboxItem(id: number): void {
    db.delete(inboxItems).where(eq(inboxItems.id, id)).run();
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
}

export const storage = new DatabaseStorage();
