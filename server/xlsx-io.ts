/**
 * XLSX Import/Export module for UnPuzzle Life.
 * - Export: ExcelJS (styled workbook from template)
 * - Import: SheetJS (format-agnostic parsing)
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { storage, sqlite } from "./storage";

const __filename_local = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

// ============================================================
// CONSTANTS
// ============================================================

/** Sheet names in dependency order (parents before children) */
const IMPORT_ORDER = [
  "Purposes",
  "Areas",
  "Area Vision Snapshots",
  "Projects",
  "Identities",
  "Routine Items",
  "Routine Logs",
  "Planner Tasks",
  "Inbox Items",
  "Weekly Reviews",
  "Environment Entities",
  "Beliefs",
  "Anti Habits",
  "Immutable Laws",
  "Immutable Law Logs",
  // V2 tables (after their dependencies)
  "Environment People",
  "Environment Places",
  "Environment Things",
  "Responsibilities",
  "Roles",
  "Non Negotiables",
  "Wizard State",
];

/** Map of sheet name → SQL table name */
const SHEET_TO_TABLE: Record<string, string> = {
  "Purposes": "purposes",
  "Areas": "areas",
  "Area Vision Snapshots": "area_vision_snapshots",
  "Projects": "projects",
  "Identities": "identities",
  "Routine Items": "routine_items",
  "Routine Logs": "routine_logs",
  "Planner Tasks": "planner_tasks",
  "Inbox Items": "inbox_items",
  "Weekly Reviews": "weekly_reviews",
  "Environment Entities": "environment_entities",
  "Beliefs": "beliefs",
  "Anti Habits": "anti_habits",
  "Immutable Laws": "immutable_laws",
  "Immutable Law Logs": "immutable_law_logs",
  // V2 tables
  "Environment People": "environment_people",
  "Environment Places": "environment_places",
  "Environment Things": "environment_things",
  "Responsibilities": "responsibilities",
  "Roles": "roles",
  "Non Negotiables": "non_negotiables",
  "Wizard State": "wizard_state",
};

/** Leaf tables that can be safely replaced individually (no children depend on them) */
const LEAF_TABLES = new Set([
  "Purposes", "Area Vision Snapshots",
  "Routine Logs", "Planner Tasks", "Inbox Items", "Weekly Reviews",
  "Environment Entities", "Beliefs", "Immutable Law Logs", "Wizard State",
  // V2 leaf tables
  "Environment People", "Environment Places", "Environment Things",
  "Responsibilities", "Non Negotiables",
]);

// ============================================================
// HELPERS
// ============================================================

function getTemplatePath(): string {
  const candidates = [
    path.join(process.cwd(), "server", "templates", "unpuzzle-life-template.xlsx"),
    path.join(process.cwd(), "dist", "templates", "unpuzzle-life-template.xlsx"),
    path.join(__dirname_local, "templates", "unpuzzle-life-template.xlsx"),
    path.join(__dirname_local, "..", "server", "templates", "unpuzzle-life-template.xlsx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("Template not found. Run: node scripts/generate-template.cjs");
}

/** Serialize a JSON string array to semicolons. Returns empty string for null/empty. */
function jsonArrayToSemicolons(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "";
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr)) return arr.join(";");
    return String(jsonStr);
  } catch {
    return String(jsonStr || "");
  }
}

/** Deserialize semicolons back to a JSON string array. Returns null for empty. */
function semicolonsToJsonArray(str: string | null | undefined): string | null {
  if (!str || String(str).trim() === "") return null;
  const items = String(str).split(";").map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? JSON.stringify(items) : null;
}

/** Serialize a JSON object to key=value semicolons. e.g. {reason:4,finance:3} → "reason=4;finance=3" */
function jsonObjectToSemicolons(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "";
  try {
    const obj = JSON.parse(jsonStr);
    if (typeof obj === "object" && !Array.isArray(obj)) {
      return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(";");
    }
    return String(jsonStr);
  } catch {
    return String(jsonStr || "");
  }
}

/** Deserialize key=value semicolons back to JSON object. */
function semicolonsToJsonObject(str: string | null | undefined): string | null {
  if (!str || String(str).trim() === "") return null;
  const parts = String(str).split(";").map(s => s.trim()).filter(Boolean);
  const obj: Record<string, any> = {};
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      // Try to parse as number
      const num = Number(val);
      obj[key] = isNaN(num) ? val : num;
    }
  }
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
}

/** Serialize anchor_moments JSON: [{lifePiece, scene}] → "piece:scene;piece:scene" */
function anchorMomentsToSemicolons(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "";
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr)) {
      return arr.map((m: any) => `${m.lifePiece || m.piece || ""}:${m.scene || ""}`).join(";");
    }
    return "";
  } catch {
    return String(jsonStr || "");
  }
}

/** Deserialize "piece:scene;piece:scene" → JSON array */
function semicolonsToAnchorMoments(str: string | null | undefined): string | null {
  if (!str || String(str).trim() === "") return null;
  const parts = String(str).split(";").map(s => s.trim()).filter(Boolean);
  const arr = parts.map(p => {
    const colonIdx = p.indexOf(":");
    if (colonIdx > 0) {
      return { lifePiece: p.slice(0, colonIdx).trim(), scene: p.slice(colonIdx + 1).trim() };
    }
    return { lifePiece: "", scene: p };
  });
  return arr.length > 0 ? JSON.stringify(arr) : null;
}

/** Serialize frequency JSON to human-readable string */
function frequencyToString(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "";
  try {
    const obj = JSON.parse(jsonStr);
    if (typeof obj === "object" && obj.type) {
      if (obj.type === "daily") return "daily";
      if (obj.type === "weekly" && obj.days) return `weekly:${Array.isArray(obj.days) ? obj.days.join(",") : obj.days}`;
      if (obj.type === "monthly") return `monthly:${obj.dayOfMonth || 1}`;
      if (obj.type === "quarterly") return "quarterly";
      if (obj.type === "yearly") return "yearly";
      return obj.type;
    }
    return String(jsonStr);
  } catch {
    return String(jsonStr || "");
  }
}

/** Deserialize frequency string back to JSON */
function stringToFrequency(str: string | null | undefined): string {
  if (!str || String(str).trim() === "") return JSON.stringify({ type: "daily", interval: 1 });
  const s = String(str).trim().toLowerCase();
  if (s === "daily") return JSON.stringify({ type: "daily", interval: 1 });
  if (s === "weekly") return JSON.stringify({ type: "weekly", interval: 1, days: ["monday"] });
  if (s.startsWith("weekly:")) {
    const days = s.slice(7).split(",").map(d => d.trim()).filter(Boolean);
    return JSON.stringify({ type: "weekly", interval: 1, days: days.length > 0 ? days : ["monday"] });
  }
  if (s === "weekdays") return JSON.stringify({ type: "weekly", interval: 1, days: ["monday", "tuesday", "wednesday", "thursday", "friday"] });
  if (s.startsWith("monthly")) {
    const day = s.includes(":") ? parseInt(s.split(":")[1]) || 1 : 1;
    return JSON.stringify({ type: "monthly", interval: 1, dayOfMonth: day });
  }
  if (s === "quarterly") return JSON.stringify({ type: "quarterly", interval: 1 });
  if (s === "yearly") return JSON.stringify({ type: "yearly", interval: 1 });
  return JSON.stringify({ type: "daily", interval: 1 });
}

/** Serialize day_variant JSON to "Mon=Dark;Tue=Colors" */
function dayVariantToSemicolons(jsonStr: string | null | undefined): string {
  return jsonObjectToSemicolons(jsonStr);
}

/** Deserialize "Mon=Dark;Tue=Colors" back to JSON */
function semicolonsToDayVariant(str: string | null | undefined): string | null {
  return semicolonsToJsonObject(str);
}

/** Safe cell value getter */
function cellVal(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function cellInt(v: any): number {
  const n = parseInt(String(v));
  return isNaN(n) ? 0 : n;
}

function cellIntOrNull(v: any): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = parseInt(String(v));
  return isNaN(n) ? null : n;
}

function cellOrNull(v: any): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  return String(v).trim();
}

// ============================================================
// BUILD LOOKUP MAPS
// ============================================================

interface LookupMaps {
  areasByName: Map<string, number>;
  projectsByTitle: Map<string, number>;
  identitiesByStatement: Map<string, number>;
  routineItemsByResponse: Map<string, number>;
  immutableLawsByTitle: Map<string, number>;
  antiHabitsByTitle: Map<string, number>;
  // V2
  peopleByName: Map<string, number>;
  placesByName: Map<string, number>;
  thingsByName: Map<string, number>;
}

function buildLookupMaps(userId: number): LookupMaps {
  const maps: LookupMaps = {
    areasByName: new Map(),
    projectsByTitle: new Map(),
    identitiesByStatement: new Map(),
    routineItemsByResponse: new Map(),
    immutableLawsByTitle: new Map(),
    antiHabitsByTitle: new Map(),
    // V2
    peopleByName: new Map(),
    placesByName: new Map(),
    thingsByName: new Map(),
  };

  const q = (sql: string) => {
    try { return sqlite.prepare(sql).all(userId) as any[]; } catch { return []; }
  };

  for (const r of q("SELECT id, name FROM areas WHERE user_id = ?")) maps.areasByName.set(r.name?.toLowerCase(), r.id);
  for (const r of q("SELECT id, title FROM projects WHERE user_id = ?")) maps.projectsByTitle.set(r.title?.toLowerCase(), r.id);
  for (const r of q("SELECT id, statement FROM identities WHERE user_id = ?")) maps.identitiesByStatement.set(r.statement?.toLowerCase(), r.id);
  for (const r of q("SELECT id, response FROM routine_items WHERE user_id = ?")) maps.routineItemsByResponse.set(r.response?.toLowerCase(), r.id);
  for (const r of q("SELECT id, title FROM immutable_laws WHERE user_id = ?")) maps.immutableLawsByTitle.set(r.title?.toLowerCase(), r.id);
  for (const r of q("SELECT id, title FROM anti_habits WHERE user_id = ?")) maps.antiHabitsByTitle.set(r.title?.toLowerCase(), r.id);
  // V2
  for (const r of q("SELECT id, name FROM environment_people WHERE user_id = ?")) maps.peopleByName.set(r.name?.toLowerCase(), r.id);
  for (const r of q("SELECT id, name FROM environment_places WHERE user_id = ?")) maps.placesByName.set(r.name?.toLowerCase(), r.id);
  for (const r of q("SELECT id, name FROM environment_things WHERE user_id = ?")) maps.thingsByName.set(r.name?.toLowerCase(), r.id);

  return maps;
}

/** Reverse lookup: build maps from ID → name for export */
interface ReverseMaps {
  areasById: Map<number, string>;
  projectsById: Map<number, string>;
  identitiesById: Map<number, string>;
  routineItemsById: Map<number, string>;
  immutableLawsById: Map<number, string>;
  antiHabitsById: Map<number, string>;
  // V2
  peopleById: Map<number, string>;
  placesById: Map<number, string>;
  thingsById: Map<number, string>;
}

function buildReverseMaps(userId: number): ReverseMaps {
  const maps: ReverseMaps = {
    areasById: new Map(),
    projectsById: new Map(),
    identitiesById: new Map(),
    routineItemsById: new Map(),
    immutableLawsById: new Map(),
    antiHabitsById: new Map(),
    // V2
    peopleById: new Map(),
    placesById: new Map(),
    thingsById: new Map(),
  };

  const q = (sql: string) => {
    try { return sqlite.prepare(sql).all(userId) as any[]; } catch { return []; }
  };

  for (const r of q("SELECT id, name FROM areas WHERE user_id = ?")) maps.areasById.set(r.id, r.name);
  for (const r of q("SELECT id, title FROM projects WHERE user_id = ?")) maps.projectsById.set(r.id, r.title);
  for (const r of q("SELECT id, statement FROM identities WHERE user_id = ?")) maps.identitiesById.set(r.id, r.statement);
  for (const r of q("SELECT id, response FROM routine_items WHERE user_id = ?")) maps.routineItemsById.set(r.id, r.response);
  for (const r of q("SELECT id, title FROM immutable_laws WHERE user_id = ?")) maps.immutableLawsById.set(r.id, r.title);
  for (const r of q("SELECT id, title FROM anti_habits WHERE user_id = ?")) maps.antiHabitsById.set(r.id, r.title);
  // V2
  for (const r of q("SELECT id, name FROM environment_people WHERE user_id = ?")) maps.peopleById.set(r.id, r.name);
  for (const r of q("SELECT id, name FROM environment_places WHERE user_id = ?")) maps.placesById.set(r.id, r.name);
  for (const r of q("SELECT id, name FROM environment_things WHERE user_id = ?")) maps.thingsById.set(r.id, r.name);

  return maps;
}

// ============================================================
// EXPORT
// ============================================================

/** Column definitions for each sheet on export: maps sheet col key → how to extract from DB row */
function getExportRows(userId: number): Record<string, string[][]> {
  const rm = buildReverseMaps(userId);
  const q = (table: string) => {
    try { return sqlite.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(userId) as any[]; }
    catch { return []; }
  };

  const result: Record<string, string[][]> = {};

  // Purposes
  result["Purposes"] = q("purposes").map(r => [
    cellVal(r.statement),
  ]);

  // Areas
  result["Areas"] = q("areas").map(r => [
    cellVal(r.name),
    cellVal(r.puzzle_piece),
    cellVal(r.vision_text),
    cellVal(r.icon),
    cellVal(r.sort_order),
    cellVal(r.archived),
    cellVal(r.archived_at),
  ]);

  // Area Vision Snapshots
  result["Area Vision Snapshots"] = q("area_vision_snapshots").map(r => [
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.previous_vision),
    cellVal(r.note),
    cellVal(r.changed_at),
  ]);

  // Projects
  result["Projects"] = q("projects").map(r => [
    cellVal(r.title),
    cellVal(r.description),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.puzzle_piece),
    cellVal(rm.identitiesById.get(r.identity_id) || ""),
    cellVal(r.archived),
    cellVal(r.archived_at),
  ]);

  // Identities
  result["Identities"] = q("identities").map(r => [
    cellVal(r.statement),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.cue),
    cellVal(r.craving),
    cellVal(r.response),
    cellVal(r.reward),
    frequencyToString(r.frequency),
    cellVal(r.active),
    cellVal(r.time_of_day),
    cellVal(r.puzzle_piece),
    cellVal(r.location),
    cellVal(r.status || "draft"),
    cellVal(r.archived),
    cellVal(r.archived_at),
  ]);

  // Routine Items
  result["Routine Items"] = q("routine_items").map(r => [
    cellVal(r.sort_order),
    cellVal(r.time),
    cellVal(r.duration_minutes),
    cellVal(r.location),
    cellVal(r.cue),
    cellVal(r.craving),
    cellVal(r.response),
    cellVal(r.reward),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(rm.identitiesById.get(r.identity_id) || ""),
    cellVal(r.puzzle_piece),
    dayVariantToSemicolons(r.day_variant),
    cellVal(r.active),
    cellVal(r.is_draft),
    cellVal(r.time_of_day),
  ]);

  // Routine Logs
  result["Routine Logs"] = q("routine_logs").map(r => [
    cellVal(rm.routineItemsById.get(r.routine_item_id) || ""),
    cellVal(r.date),
    cellVal(r.completed_at),
    cellVal(r.note),
  ]);

  // Planner Tasks
  result["Planner Tasks"] = q("planner_tasks").map(r => [
    cellVal(r.date),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.task),
    cellVal(r.start_time),
    cellVal(r.end_time),
    cellVal(r.hours),
    cellVal(r.result),
    cellVal(r.status),
    cellVal(r.recurrence),
    cellVal(rm.identitiesById.get(r.identity_id) || ""),
    cellVal(rm.projectsById.get(r.project_id) || ""),
    cellVal(r.context),
    cellVal(r.energy),
    cellVal(r.is_draft),
  ]);

  // Inbox Items
  result["Inbox Items"] = q("inbox_items").map(r => [
    cellVal(r.content),
    cellVal(r.notes),
    cellVal(r.processed),
    cellVal(r.processed_as),
    cellVal(r.deleted_at),
    cellVal(rm.projectsById.get(r.reference_project_id) || ""),
    cellVal(r.linked_planner_task_id),
    cellVal(rm.areasById.get(r.area_id) || ""),
  ]);

  // Weekly Reviews
  result["Weekly Reviews"] = q("weekly_reviews").map(r => [
    cellVal(r.week_of),
    jsonArrayToSemicolons(r.wins),
    jsonArrayToSemicolons(r.lessons),
    jsonArrayToSemicolons(r.next_week_focus),
    cellVal(r.inbox_cleared),
    cellVal(r.projects_reviewed),
    cellVal(r.habits_reviewed),
    jsonObjectToSemicolons(r.puzzle_piece_ratings),
  ]);

  // Environment Entities
  result["Environment Entities"] = q("environment_entities").map(r => [
    cellVal(rm.identitiesById.get(r.identity_id) || ""),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.puzzle_piece),
    cellVal(r.type),
    cellVal(r.person_name),
    cellVal(r.person_contact_method),
    cellVal(r.person_contact_info),
    cellVal(r.person_why),
    cellVal(r.place_name),
    cellVal(r.place_address),
    cellVal(r.place_travel_method),
    cellVal(r.place_why),
    cellVal(r.thing_name),
    cellVal(r.thing_usage),
    cellVal(r.thing_why),
  ]);

  // Beliefs
  result["Beliefs"] = q("beliefs").map(r => [
    cellVal(r.puzzle_piece),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(r.old_belief),
    cellVal(r.new_belief),
    cellVal(r.why_it_matters),
    cellVal(r.repetition_count),
    cellVal(r.graduated),
    cellVal(r.graduated_at),
    cellVal(r.active),
  ]);

  // Anti Habits
  result["Anti Habits"] = q("anti_habits").map(r => [
    cellVal(r.puzzle_piece),
    cellVal(rm.areasById.get(r.area_id) || ""),
    cellVal(rm.identitiesById.get(r.identity_id) || ""),
    cellVal(r.title),
    cellVal(r.description),
    cellVal(r.make_invisible),
    cellVal(r.make_unattractive),
    cellVal(r.make_difficult),
    cellVal(r.make_unsatisfying),
    cellVal(r.current_streak),
    cellVal(r.longest_streak),
    cellVal(r.last_slip_date),
    cellVal(r.active),
  ]);

  // Immutable Laws
  result["Immutable Laws"] = q("immutable_laws").map(r => {
    // linked_identity_ids is a JSON array of IDs — resolve to statements
    let linkedStatements = "";
    if (r.linked_identity_ids) {
      try {
        const ids = JSON.parse(r.linked_identity_ids);
        if (Array.isArray(ids)) {
          linkedStatements = ids.map((id: number) => rm.identitiesById.get(id) || "").filter(Boolean).join(";");
        }
      } catch {}
    }
    return [
      cellVal(r.puzzle_piece),
      cellVal(r.title),
      cellVal(r.statement),
      cellVal(r.why_it_matters),
      linkedStatements,
      cellVal(r.is_primary),
      cellVal(r.is_red_line),
      cellVal(r.enforcement_level),
      jsonArrayToSemicolons(r.trigger_conditions),
      cellVal(r.active),
    ];
  });

  // Immutable Law Logs
  result["Immutable Law Logs"] = q("immutable_law_logs").map(r => [
    cellVal(rm.immutableLawsById.get(r.immutable_law_id) || ""),
    cellVal(r.puzzle_piece),
    cellVal(r.date),
    cellVal(r.kept),
    cellVal(r.note),
    cellVal(r.trigger_type),
    cellVal(r.was_override),
    cellVal(r.override_reason),
    cellVal(rm.antiHabitsById.get(r.suggested_anti_habit_id) || ""),
  ]);

  // V2: Environment People
  result["Environment People"] = q("environment_people").map(r => [
    cellVal(r.name),
    cellVal(r.relationship),
  ]);

  // V2: Environment Places
  result["Environment Places"] = q("environment_places").map(r => [
    cellVal(r.name),
    cellVal(r.type),
  ]);

  // V2: Environment Things
  result["Environment Things"] = q("environment_things").map(r => [
    cellVal(r.name),
    cellVal(r.category),
  ]);

  // V2: Responsibilities
  result["Responsibilities"] = q("responsibilities").map(r => [
    cellVal(r.name),
    cellVal(rm.placesById.get(r.place_id) || ""),
    cellVal(rm.thingsById.get(r.thing_id) || ""),
    cellVal(r.cadence),
    cellVal(r.day_of_week),
    cellVal(r.custom_cron_expr),
    cellVal(r.is_preset),
  ]);

  // V2: Roles (serialize linked people as semicolon-separated names)
  result["Roles"] = q("roles").map(r => {
    let peopleNames = "";
    try {
      const rp = sqlite.prepare("SELECT person_id FROM role_people WHERE role_id = ?").all(r.id) as any[];
      peopleNames = rp.map((p: any) => rm.peopleById.get(p.person_id) || "").filter(Boolean).join(";");
    } catch {}
    return [
      cellVal(r.name),
      cellVal(r.description),
      cellVal(r.cadence),
      cellVal(r.day_of_week),
      peopleNames,
    ];
  });

  // V2: Non Negotiables
  result["Non Negotiables"] = q("non_negotiables").map(r => [
    cellVal(r.puzzle_piece),
    cellVal(r.statement),
    cellVal(rm.areasById.get(r.area_id) || ""),
  ]);

  // Wizard State
  result["Wizard State"] = q("wizard_state").map(r => [
    cellVal(r.current_phase),
    cellVal(r.completed),
    cellVal(r.completed_at),
  ]);

  return result;
}

export async function exportWorkbook(userId: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(getTemplatePath());

  const exportData = getExportRows(userId);

  // Fill each data sheet
  for (const sheetName of IMPORT_ORDER) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    const rows = exportData[sheetName] || [];

    // Clear any existing data rows (row 4+)
    for (let r = ws.rowCount; r >= 4; r--) {
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });
    }

    // Write new data
    rows.forEach((rowData, idx) => {
      const row = ws.getRow(4 + idx);
      rowData.forEach((val, colIdx) => {
        row.getCell(colIdx + 1).value = val === "" ? null : val;
      });
      row.commit();
    });
  }

  // Update Overview record counts
  const overviewSheet = wb.getWorksheet("Overview");
  if (overviewSheet) {
    IMPORT_ORDER.forEach((sheetName, idx) => {
      const row = overviewSheet.getRow(5 + idx);
      row.getCell(4).value = (exportData[sheetName] || []).length;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// IMPORT HELPERS
// ============================================================

/** Parse a SheetJS worksheet, auto-stripping guidance rows 2-3 if detected */
function parseSheet(ws: XLSX.WorkSheet): Record<string, string>[] {
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (aoa.length < 1) return [];

  const headers = (aoa[0] as any[]).map((h: any) => String(h).trim().toLowerCase());

  let dataStartRow = 1; // 0-indexed
  if (aoa.length >= 3) {
    const row3 = (aoa[2] as any[]).map((v: any) => String(v).trim().toLowerCase());
    if (row3.every((v: string) => v === "" || v === "yes" || v === "no")) {
      dataStartRow = 3; // skip description (row 2) + required (row 3)
    }
  }

  const results: Record<string, string>[] = [];
  for (let i = dataStartRow; i < aoa.length; i++) {
    const row = aoa[i] as any[];
    if (row.every((cell: any) => String(cell).trim() === "")) continue; // skip blank rows
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = String(row[j] ?? "").trim();
    });
    results.push(obj);
  }
  return results;
}

// ============================================================
// IMPORT: FULL WORKBOOK
// ============================================================

export function importWorkbook(buffer: Buffer, userId: number): { counts: Record<string, number>; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const now = new Date().toISOString();

  const runTx = sqlite.transaction(() => {
    // Delete ALL user data (reverse dependency order)
    const allTables = [...IMPORT_ORDER].reverse().map(s => SHEET_TO_TABLE[s]).filter(Boolean);
    for (const table of allTables) {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }

    // Import in dependency order
    for (const sheetName of IMPORT_ORDER) {
      const ws = wb.Sheets[sheetName];
      if (!ws) { counts[sheetName] = 0; continue; }

      const rows = parseSheet(ws);
      if (rows.length === 0) { counts[sheetName] = 0; continue; }

      // Rebuild lookup maps after each parent table is inserted
      const maps = buildLookupMaps(userId);

      let inserted = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        try {
          insertRow(sheetName, row, userId, maps, now);
          inserted++;
        } catch (err: any) {
          errors.push(`${sheetName} row ${rowNum}: ${err.message}`);
        }
      }
      counts[sheetName] = inserted;
    }
  });

  runTx();
  return { counts, errors };
}

// ============================================================
// IMPORT: SINGLE TABLE CSV
// ============================================================

export function importSingleCsv(
  buffer: Buffer,
  sheetName: string,
  mode: "add" | "replace",
  userId: number
): { count: number; errors: string[] } {
  if (!SHEET_TO_TABLE[sheetName]) {
    return { count: 0, errors: [`Unknown table: ${sheetName}`] };
  }

  if (mode === "replace" && !LEAF_TABLES.has(sheetName)) {
    return { count: 0, errors: [`"${sheetName}" has dependent tables — use a full workbook import to replace it`] };
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { count: 0, errors: ["Empty file"] };

  const rows = parseSheet(ws);
  if (rows.length === 0) return { count: 0, errors: [] };

  const errors: string[] = [];
  const now = new Date().toISOString();
  let inserted = 0;

  const runTx = sqlite.transaction(() => {
    if (mode === "replace") {
      sqlite.prepare(`DELETE FROM ${SHEET_TO_TABLE[sheetName]} WHERE user_id = ?`).run(userId);
    }

    const maps = buildLookupMaps(userId);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      try {
        insertRow(sheetName, row, userId, maps, now);
        inserted++;
      } catch (err: any) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }
  });

  runTx();
  return { count: inserted, errors };
}

// ============================================================
// ROW INSERTION (per-table logic)
// ============================================================

function insertRow(
  sheetName: string,
  row: Record<string, string>,
  userId: number,
  maps: LookupMaps,
  now: string
) {
  const table = SHEET_TO_TABLE[sheetName];
  if (!table) throw new Error(`Unknown sheet: ${sheetName}`);

  switch (sheetName) {
    case "Purposes": {
      if (!row.statement) throw new Error("missing statement");
      sqlite.prepare(`INSERT INTO purposes (user_id, statement, created_at) VALUES (?, ?, ?)`)
        .run(userId, row.statement, now);
      break;
    }
    case "Areas": {
      if (!row.name) throw new Error("missing name");
      sqlite.prepare(`INSERT INTO areas (user_id, name, puzzle_piece, vision_text, icon, sort_order, archived, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.name, cellOrNull(row.puzzle_piece), cellOrNull(row.vision_text), cellOrNull(row.icon), cellInt(row.sort_order), cellInt(row.archived), cellOrNull(row.archived_at));
      break;
    }
    case "Area Vision Snapshots": {
      if (!row.area_name) throw new Error("missing area_name");
      const areaId = maps.areasByName.get(row.area_name.toLowerCase());
      if (!areaId) throw new Error(`area "${row.area_name}" not found`);
      sqlite.prepare(`INSERT INTO area_vision_snapshots (user_id, area_id, previous_vision, note, changed_at) VALUES (?, ?, ?, ?, ?)`)
        .run(userId, areaId, row.previous_vision || "", cellOrNull(row.note), row.changed_at || now);
      break;
    }
    case "Projects": {
      if (!row.title) throw new Error("missing title");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      const identityId = row.identity_statement ? (maps.identitiesByStatement.get(row.identity_statement.toLowerCase()) ?? null) : null;
      if (!identityId) throw new Error("missing or unresolved identity_statement (required)");
      sqlite.prepare(`INSERT INTO projects (user_id, title, description, area_id, puzzle_piece, identity_id, created_at, archived, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.title, cellOrNull(row.description), areaId, cellOrNull(row.puzzle_piece), identityId, now, cellInt(row.archived), cellOrNull(row.archived_at));
      break;
    }
    case "Identities": {
      if (!row.statement) throw new Error("missing statement");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      if (!areaId) throw new Error("missing or unresolved area_name (required)");
      const freq = row.frequency ? stringToFrequency(row.frequency) : JSON.stringify({ type: "daily", interval: 1 });
      const status = row.status && ["draft", "project", "routine"].includes(row.status) ? row.status : "draft";
      sqlite.prepare(`INSERT INTO identities (user_id, statement, area_id, cue, craving, response, reward, frequency, active, time_of_day, puzzle_piece, location, status, created_at, archived, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.statement, areaId, row.cue || "", row.craving || "", row.response || "", row.reward || "", freq, row.active !== undefined && row.active !== "" ? cellInt(row.active) : 1, row.time_of_day || "", row.puzzle_piece || "", row.location || "", status, now, cellInt(row.archived), cellOrNull(row.archived_at));
      break;
    }
    case "Routine Items": {
      if (!row.time || !row.response) throw new Error("missing time or response");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      if (!areaId) throw new Error("missing or unresolved area_name (required)");
      const identityId = row.identity_name ? (maps.identitiesByStatement.get(row.identity_name.toLowerCase()) ?? null) : null;
      if (!identityId) throw new Error("missing or unresolved identity_name (required)");
      sqlite.prepare(`INSERT INTO routine_items (user_id, sort_order, time, duration_minutes, location, cue, craving, response, reward, area_id, identity_id, puzzle_piece, day_variant, active, is_draft, time_of_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, cellInt(row.sort_order), row.time, cellInt(row.duration_minutes) || 10, row.location || "", row.cue || "", row.craving || "", row.response, row.reward || "", areaId, identityId, row.puzzle_piece || "", semicolonsToDayVariant(row.day_variant) || "", row.active !== undefined && row.active !== "" ? cellInt(row.active) : 1, cellInt(row.is_draft), row.time_of_day || "");
      break;
    }
    case "Routine Logs": {
      if (!row.routine_response || !row.date) throw new Error("missing routine_response or date");
      const routineItemId = maps.routineItemsByResponse.get(row.routine_response.toLowerCase());
      if (!routineItemId) throw new Error(`routine item "${row.routine_response}" not found`);
      sqlite.prepare(`INSERT INTO routine_logs (user_id, routine_item_id, date, completed_at, note) VALUES (?, ?, ?, ?, ?)`)
        .run(userId, routineItemId, row.date, cellOrNull(row.completed_at), cellOrNull(row.note));
      break;
    }
    case "Planner Tasks": {
      if (!row.date || !row.task) throw new Error("missing date or task");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      const identityId = row.identity_name ? (maps.identitiesByStatement.get(row.identity_name.toLowerCase()) ?? null) : null;
      const projectId = row.project_title ? (maps.projectsByTitle.get(row.project_title.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO planner_tasks (user_id, date, area_id, task, start_time, end_time, hours, result, status, recurrence, identity_id, project_id, context, energy, is_draft) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.date, areaId, row.task, cellOrNull(row.start_time), cellOrNull(row.end_time), cellOrNull(row.hours), cellOrNull(row.result), cellOrNull(row.status) || "planned", cellOrNull(row.recurrence), identityId, projectId, cellOrNull(row.context), cellOrNull(row.energy), cellInt(row.is_draft));
      break;
    }
    case "Inbox Items": {
      if (!row.content) throw new Error("missing content");
      const refProjectId = row.reference_project_title ? (maps.projectsByTitle.get(row.reference_project_title.toLowerCase()) ?? null) : null;
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO inbox_items (user_id, content, notes, processed, processed_as, deleted_at, reference_project_id, linked_planner_task_id, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.content, cellOrNull(row.notes), cellInt(row.processed), cellOrNull(row.processed_as), cellOrNull(row.deleted_at), refProjectId, cellIntOrNull(row.linked_planner_task_id), areaId, now);
      break;
    }
    case "Weekly Reviews": {
      if (!row.week_of) throw new Error("missing week_of");
      sqlite.prepare(`INSERT INTO weekly_reviews (user_id, week_of, wins, lessons, next_week_focus, inbox_cleared, projects_reviewed, habits_reviewed, puzzle_piece_ratings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.week_of, semicolonsToJsonArray(row.wins), semicolonsToJsonArray(row.lessons), semicolonsToJsonArray(row.next_week_focus), cellInt(row.inbox_cleared), cellInt(row.projects_reviewed), cellInt(row.habits_reviewed), semicolonsToJsonObject(row.puzzle_piece_ratings), now);
      break;
    }
    case "Environment Entities": {
      if (!row.type) throw new Error("missing type");
      const identityId = row.identity_statement ? (maps.identitiesByStatement.get(row.identity_statement.toLowerCase()) ?? null) : null;
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO environment_entities (user_id, identity_id, area_id, puzzle_piece, type, person_name, person_contact_method, person_contact_info, person_why, place_name, place_address, place_travel_method, place_why, thing_name, thing_usage, thing_why, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, identityId, areaId, cellOrNull(row.puzzle_piece), row.type, cellOrNull(row.person_name), cellOrNull(row.person_contact_method), cellOrNull(row.person_contact_info), cellOrNull(row.person_why), cellOrNull(row.place_name), cellOrNull(row.place_address), cellOrNull(row.place_travel_method), cellOrNull(row.place_why), cellOrNull(row.thing_name), cellOrNull(row.thing_usage), cellOrNull(row.thing_why), now);
      break;
    }
    case "Beliefs": {
      if (!row.puzzle_piece || !row.old_belief || !row.new_belief) throw new Error("missing puzzle_piece, old_belief, or new_belief");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO beliefs (user_id, puzzle_piece, area_id, old_belief, new_belief, why_it_matters, repetition_count, graduated, graduated_at, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.puzzle_piece, areaId, row.old_belief, row.new_belief, cellOrNull(row.why_it_matters), cellInt(row.repetition_count), cellInt(row.graduated), cellOrNull(row.graduated_at), row.active !== undefined && row.active !== "" ? cellInt(row.active) : 1, now);
      break;
    }
    case "Anti Habits": {
      if (!row.puzzle_piece || !row.title) throw new Error("missing puzzle_piece or title");
      const areaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      const identityId = row.identity_statement ? (maps.identitiesByStatement.get(row.identity_statement.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO anti_habits (user_id, puzzle_piece, area_id, identity_id, title, description, make_invisible, make_unattractive, make_difficult, make_unsatisfying, current_streak, longest_streak, last_slip_date, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.puzzle_piece, areaId, identityId, row.title, cellOrNull(row.description), cellOrNull(row.make_invisible), cellOrNull(row.make_unattractive), cellOrNull(row.make_difficult), cellOrNull(row.make_unsatisfying), cellInt(row.current_streak), cellInt(row.longest_streak), cellOrNull(row.last_slip_date), row.active !== undefined && row.active !== "" ? cellInt(row.active) : 1, now);
      break;
    }
    case "Immutable Laws": {
      if (!row.puzzle_piece || !row.title || !row.statement) throw new Error("missing puzzle_piece, title, or statement");
      // linked_identity_statements → resolve to IDs
      let linkedIds: string | null = null;
      if (row.linked_identity_statements) {
        const stmts = row.linked_identity_statements.split(";").map(s => s.trim()).filter(Boolean);
        const ids = stmts.map(s => maps.identitiesByStatement.get(s.toLowerCase())).filter(Boolean);
        linkedIds = ids.length > 0 ? JSON.stringify(ids) : null;
      }
      sqlite.prepare(`INSERT INTO immutable_laws (user_id, puzzle_piece, title, statement, why_it_matters, linked_identity_ids, is_primary, is_red_line, enforcement_level, trigger_conditions, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.puzzle_piece, row.title, row.statement, cellOrNull(row.why_it_matters), linkedIds, cellInt(row.is_primary), cellInt(row.is_red_line), cellInt(row.enforcement_level) || 1, semicolonsToJsonArray(row.trigger_conditions), row.active !== undefined && row.active !== "" ? cellInt(row.active) : 1, now);
      break;
    }
    case "Immutable Law Logs": {
      if (!row.immutable_law_title || !row.date) throw new Error("missing immutable_law_title or date");
      const lawId = maps.immutableLawsByTitle.get(row.immutable_law_title.toLowerCase());
      if (!lawId) throw new Error(`immutable law "${row.immutable_law_title}" not found`);
      const antiHabitId = row.suggested_anti_habit_title ? (maps.antiHabitsByTitle.get(row.suggested_anti_habit_title.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO immutable_law_logs (user_id, immutable_law_id, puzzle_piece, date, kept, note, trigger_type, was_override, override_reason, suggested_anti_habit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, lawId, cellOrNull(row.puzzle_piece) || "", row.date, cellInt(row.kept), cellOrNull(row.note), cellOrNull(row.trigger_type), cellInt(row.was_override), cellOrNull(row.override_reason), antiHabitId, now);
      break;
    }
    case "Environment People": {
      if (!row.name) throw new Error("missing name");
      sqlite.prepare(`INSERT INTO environment_people (user_id, name, relationship, created_at) VALUES (?, ?, ?, ?)`)
        .run(userId, row.name, cellOrNull(row.relationship), now);
      break;
    }
    case "Environment Places": {
      if (!row.name) throw new Error("missing name");
      sqlite.prepare(`INSERT INTO environment_places (user_id, name, type, created_at) VALUES (?, ?, ?, ?)`)
        .run(userId, row.name, cellOrNull(row.type), now);
      break;
    }
    case "Environment Things": {
      if (!row.name) throw new Error("missing name");
      sqlite.prepare(`INSERT INTO environment_things (user_id, name, category, created_at) VALUES (?, ?, ?, ?)`)
        .run(userId, row.name, cellOrNull(row.category), now);
      break;
    }
    case "Responsibilities": {
      if (!row.name) throw new Error("missing name");
      const placeId = row.place_name ? (maps.placesByName.get(row.place_name.toLowerCase()) ?? null) : null;
      const thingId = row.thing_name ? (maps.thingsByName.get(row.thing_name.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO responsibilities (user_id, name, place_id, thing_id, cadence, day_of_week, custom_cron_expr, is_preset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.name, placeId, thingId, cellOrNull(row.cadence) || "weekly", cellOrNull(row.day_of_week), cellOrNull(row.custom_cron_expr), cellInt(row.is_preset), now);
      break;
    }
    case "Roles": {
      if (!row.name) throw new Error("missing name");
      const result = sqlite.prepare(`INSERT INTO roles (user_id, name, description, cadence, day_of_week, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(userId, row.name, cellOrNull(row.description), cellOrNull(row.cadence) || "weekly", cellOrNull(row.day_of_week), now);
      // Populate role_people from semicolon-separated people_names
      if (row.people_names) {
        const roleId = Number(result.lastInsertRowid);
        const names = row.people_names.split(";").map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          const personId = maps.peopleByName.get(name.toLowerCase());
          if (personId) {
            sqlite.prepare(`INSERT INTO role_people (role_id, person_id) VALUES (?, ?)`).run(roleId, personId);
          }
        }
      }
      break;
    }
    case "Non Negotiables": {
      if (!row.puzzle_piece || !row.statement) throw new Error("missing puzzle_piece or statement");
      const nnAreaId = row.area_name ? (maps.areasByName.get(row.area_name.toLowerCase()) ?? null) : null;
      sqlite.prepare(`INSERT INTO non_negotiables (user_id, puzzle_piece, statement, area_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(userId, row.puzzle_piece, row.statement, nnAreaId, now, now);
      break;
    }
    case "Wizard State": {
      sqlite.prepare(`INSERT INTO wizard_state (user_id, current_phase, completed, completed_at) VALUES (?, ?, ?, ?)`)
        .run(userId, cellInt(row.current_phase) || 1, cellInt(row.completed), cellOrNull(row.completed_at));
      break;
    }
    default:
      throw new Error(`No import handler for sheet: ${sheetName}`);
  }
}

// ============================================================
// CSV TEMPLATE GENERATION
// ============================================================

/** Sheet column definitions — re-derive from template generator data */
const SHEET_COLUMNS: Record<string, { header: string; desc: string; required: boolean }[]> = {
  "Purposes": [
    { header: "statement", desc: "Your purpose statement", required: true },
  ],
  "Areas": [
    { header: "name", desc: "Area name", required: true },
    { header: "puzzle_piece", desc: "reason|finance|fitness|talent|pleasure", required: false },
    { header: "vision_text", desc: "Vision text", required: false },
    { header: "icon", desc: "Lucide icon", required: false },
    { header: "sort_order", desc: "Number", required: false },
    { header: "archived", desc: "0 or 1", required: false },
    { header: "archived_at", desc: "ISO 8601", required: false },
  ],
  "Area Vision Snapshots": [
    { header: "area_name", desc: "Area name", required: true },
    { header: "previous_vision", desc: "Previous vision text", required: true },
    { header: "note", desc: "Change note", required: false },
    { header: "changed_at", desc: "ISO 8601", required: true },
  ],
  "Projects": [
    { header: "title", desc: "Project title", required: true },
    { header: "description", desc: "Description", required: false },
    { header: "area_name", desc: "Linked area", required: false },
    { header: "puzzle_piece", desc: "Puzzle piece", required: false },
    { header: "identity_statement", desc: "Linked identity", required: true },
    { header: "archived", desc: "0 or 1", required: false },
    { header: "archived_at", desc: "ISO 8601", required: false },
  ],
  "Identities": [
    { header: "statement", desc: "Identity statement", required: true },
    { header: "area_name", desc: "Linked area", required: true },
    { header: "cue", desc: "Habit cue", required: true },
    { header: "craving", desc: "Craving", required: true },
    { header: "response", desc: "Response", required: true },
    { header: "reward", desc: "Reward", required: true },
    { header: "frequency", desc: "daily|weekly|monthly|quarterly|yearly", required: false },
    { header: "active", desc: "0 or 1", required: false },
    { header: "time_of_day", desc: "Time of day", required: true },
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "location", desc: "Location", required: true },
    { header: "status", desc: "draft|project|routine", required: false },
    { header: "archived", desc: "0 or 1", required: false },
    { header: "archived_at", desc: "ISO 8601", required: false },
  ],
  "Routine Items": [
    { header: "sort_order", desc: "Number", required: false },
    { header: "time", desc: "HH:MM", required: true },
    { header: "duration_minutes", desc: "Minutes", required: false },
    { header: "location", desc: "Location", required: true },
    { header: "cue", desc: "Cue", required: true },
    { header: "craving", desc: "Craving", required: true },
    { header: "response", desc: "Action", required: true },
    { header: "reward", desc: "Reward", required: true },
    { header: "area_name", desc: "Linked area", required: true },
    { header: "identity_name", desc: "Linked identity", required: true },
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "day_variant", desc: "Mon=X;Tue=Y", required: false },
    { header: "active", desc: "0 or 1", required: false },
    { header: "is_draft", desc: "0 or 1", required: false },
    { header: "time_of_day", desc: "Time of day", required: true },
  ],
  "Routine Logs": [
    { header: "routine_response", desc: "Routine item response text", required: true },
    { header: "date", desc: "YYYY-MM-DD", required: true },
    { header: "completed_at", desc: "ISO 8601", required: false },
    { header: "note", desc: "Note", required: false },
  ],
  "Planner Tasks": [
    { header: "date", desc: "YYYY-MM-DD", required: true },
    { header: "area_name", desc: "Linked area", required: false },
    { header: "task", desc: "Task description", required: true },
    { header: "start_time", desc: "HH:MM", required: false },
    { header: "end_time", desc: "HH:MM", required: false },
    { header: "hours", desc: "Decimal hours", required: false },
    { header: "result", desc: "Outcome", required: false },
    { header: "status", desc: "planned|done|skipped", required: false },
    { header: "recurrence", desc: "Recurrence pattern", required: false },
    { header: "identity_name", desc: "Linked identity", required: false },
    { header: "project_title", desc: "Linked project", required: false },
    { header: "context", desc: "@home|@work|@phone|@computer|@errands", required: false },
    { header: "energy", desc: "low|medium|high", required: false },
    { header: "is_draft", desc: "0 or 1", required: false },
  ],
  "Inbox Items": [
    { header: "content", desc: "Item content", required: true },
    { header: "notes", desc: "Notes", required: false },
    { header: "processed", desc: "0 or 1", required: false },
    { header: "processed_as", desc: "quick_task|task|project|reference|someday|trash", required: false },
    { header: "deleted_at", desc: "ISO 8601", required: false },
    { header: "reference_project_title", desc: "Reference project", required: false },
    { header: "linked_planner_task_id", desc: "Linked planner task ID", required: false },
    { header: "area_name", desc: "Linked area", required: false },
  ],
  "Weekly Reviews": [
    { header: "week_of", desc: "Monday YYYY-MM-DD", required: true },
    { header: "wins", desc: "Semicolon-separated", required: false },
    { header: "lessons", desc: "Semicolon-separated", required: false },
    { header: "next_week_focus", desc: "Semicolon-separated", required: false },
    { header: "inbox_cleared", desc: "0 or 1", required: false },
    { header: "projects_reviewed", desc: "0 or 1", required: false },
    { header: "habits_reviewed", desc: "0 or 1", required: false },
    { header: "puzzle_piece_ratings", desc: "reason=N;finance=N;fitness=N;talent=N;pleasure=N", required: false },
  ],
  "Environment Entities": [
    { header: "identity_statement", desc: "Linked identity", required: true },
    { header: "area_name", desc: "Linked area", required: false },
    { header: "puzzle_piece", desc: "Puzzle piece", required: false },
    { header: "type", desc: "person|place|thing", required: true },
    { header: "person_name", desc: "Name", required: false },
    { header: "person_contact_method", desc: "Contact method", required: false },
    { header: "person_contact_info", desc: "Contact info", required: false },
    { header: "person_why", desc: "Why", required: false },
    { header: "place_name", desc: "Name", required: false },
    { header: "place_address", desc: "Address", required: false },
    { header: "place_travel_method", desc: "Travel method", required: false },
    { header: "place_why", desc: "Why", required: false },
    { header: "thing_name", desc: "Name", required: false },
    { header: "thing_usage", desc: "Usage", required: false },
    { header: "thing_why", desc: "Why", required: false },
  ],
  "Beliefs": [
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "area_name", desc: "Linked area", required: false },
    { header: "old_belief", desc: "Limiting belief", required: true },
    { header: "new_belief", desc: "Replacement belief", required: true },
    { header: "why_it_matters", desc: "Explanation", required: false },
    { header: "repetition_count", desc: "Number", required: false },
    { header: "graduated", desc: "0 or 1", required: false },
    { header: "graduated_at", desc: "ISO 8601", required: false },
    { header: "active", desc: "0 or 1", required: false },
  ],
  "Anti Habits": [
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "area_name", desc: "Linked area", required: false },
    { header: "identity_statement", desc: "Protected identity", required: false },
    { header: "title", desc: "Short name", required: true },
    { header: "description", desc: "Description", required: false },
    { header: "make_invisible", desc: "Remove cue", required: false },
    { header: "make_unattractive", desc: "Reframe craving", required: false },
    { header: "make_difficult", desc: "Add friction", required: false },
    { header: "make_unsatisfying", desc: "Add consequence", required: false },
    { header: "current_streak", desc: "Days", required: false },
    { header: "longest_streak", desc: "Days", required: false },
    { header: "last_slip_date", desc: "YYYY-MM-DD", required: false },
    { header: "active", desc: "0 or 1", required: false },
  ],
  "Immutable Laws": [
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "title", desc: "Law title", required: true },
    { header: "statement", desc: "Law statement", required: true },
    { header: "why_it_matters", desc: "Explanation", required: false },
    { header: "linked_identity_statements", desc: "Identities separated by semicolons", required: false },
    { header: "is_primary", desc: "0 or 1", required: false },
    { header: "is_red_line", desc: "0 or 1", required: false },
    { header: "enforcement_level", desc: "1=Awareness 2=Friction 3=Block", required: false },
    { header: "trigger_conditions", desc: "Semicolon-separated", required: false },
    { header: "active", desc: "0 or 1", required: false },
  ],
  "Immutable Law Logs": [
    { header: "immutable_law_title", desc: "Law title", required: true },
    { header: "puzzle_piece", desc: "Puzzle piece", required: true },
    { header: "date", desc: "YYYY-MM-DD", required: true },
    { header: "kept", desc: "1=kept 0=broken", required: true },
    { header: "note", desc: "Reflection", required: false },
    { header: "trigger_type", desc: "Trigger type", required: false },
    { header: "was_override", desc: "0 or 1", required: false },
    { header: "override_reason", desc: "Reason", required: false },
    { header: "suggested_anti_habit_title", desc: "Anti-habit title", required: false },
  ],
  // V2 sheets
  "Environment People": [
    { header: "name", desc: "Person name", required: true },
    { header: "relationship", desc: "Relationship (e.g. Son, Wife, Friend)", required: false },
  ],
  "Environment Places": [
    { header: "name", desc: "Place name", required: true },
    { header: "type", desc: "room|vehicle|location", required: false },
  ],
  "Environment Things": [
    { header: "name", desc: "Thing name", required: true },
    { header: "category", desc: "vehicle|equipment|tool", required: false },
  ],
  "Responsibilities": [
    { header: "name", desc: "Responsibility name", required: true },
    { header: "place_name", desc: "Linked place name", required: false },
    { header: "thing_name", desc: "Linked thing name", required: false },
    { header: "cadence", desc: "daily|weekly|biweekly|monthly|custom", required: false },
    { header: "day_of_week", desc: "Day of week", required: false },
    { header: "custom_cron_expr", desc: "Custom cron expression", required: false },
    { header: "is_preset", desc: "0 or 1", required: false },
  ],
  "Roles": [
    { header: "name", desc: "Role name", required: true },
    { header: "description", desc: "Description", required: false },
    { header: "cadence", desc: "daily|weekdays|weekly|biweekly|monthly|custom", required: false },
    { header: "day_of_week", desc: "Day of week", required: false },
    { header: "people_names", desc: "Linked people names (semicolon-separated)", required: false },
  ],
  "Non Negotiables": [
    { header: "puzzle_piece", desc: "reason|finance|fitness|talent|pleasure", required: true },
    { header: "statement", desc: "Non-negotiable statement", required: true },
    { header: "area_name", desc: "Linked area (empty = global)", required: false },
  ],
  "Wizard State": [
    { header: "current_phase", desc: "1-4", required: false },
    { header: "completed", desc: "0 or 1", required: false },
    { header: "completed_at", desc: "ISO 8601", required: false },
  ],
};

/** Escape a CSV cell value */
function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function generateCsvTemplate(sheetName: string): string | null {
  const cols = SHEET_COLUMNS[sheetName];
  if (!cols) return null;

  const row1 = cols.map(c => csvEscape(c.header)).join(",");
  const row2 = cols.map(c => csvEscape(c.desc)).join(",");
  const row3 = cols.map(c => c.required ? "Yes" : "No").join(",");

  return `${row1}\n${row2}\n${row3}\n`;
}

/** Get list of valid sheet names for validation */
export function getSheetNames(): string[] {
  return [...IMPORT_ORDER];
}

/** Get list of leaf table names (safe for single-table replace) */
export function getLeafTables(): string[] {
  return IMPORT_ORDER.filter(s => LEAF_TABLES.has(s));
}

export { SHEET_TO_TABLE, LEAF_TABLES };
