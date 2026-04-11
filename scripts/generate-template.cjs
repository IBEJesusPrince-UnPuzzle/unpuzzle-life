/**
 * Generate the styled XLSX template for UnPuzzle Life import/export.
 * Run: node scripts/generate-template.cjs
 * Output: server/templates/unpuzzle-life-template.xlsx
 */
const ExcelJS = require("exceljs");
const path = require("path");

// Colors
const DARK_TEAL = "0D4F4F";
const LIGHT_TEAL = "E0F2F1";
const GREEN_BG = "C8E6C9";
const GRAY_BG = "E0E0E0";
const WHITE = "FFFFFF";

// Sheet definitions: { name, purpose, columns: [{ key, header, desc, required }] }
const SHEETS = [
  {
    name: "Purposes",
    purpose: "Life purpose statements and guiding principles",
    columns: [
      { key: "statement", header: "statement", desc: "Your purpose statement (e.g. 'To live with intention and serve others')", required: true },
      { key: "principles", header: "principles", desc: "Guiding principles separated by semicolons (e.g. 'Be kind;Stay focused;Act with integrity')", required: false },
    ],
  },
  {
    name: "Visions",
    purpose: "3-5 year vision statements",
    columns: [
      { key: "title", header: "title", desc: "Vision title (e.g. 'Financial Freedom by 2028')", required: true },
      { key: "description", header: "description", desc: "Detailed description of this vision", required: false },
      { key: "timeframe", header: "timeframe", desc: "Target timeframe (e.g. '2028', '3 years')", required: false },
      { key: "status", header: "status", desc: "active | achieved | deferred", required: false },
      { key: "anchor_moments", header: "anchor_moments", desc: "Anchor moments as piece:scene pairs separated by semicolons (e.g. 'fitness:Running a marathon;talent:Publishing a book')", required: false },
    ],
  },
  {
    name: "Goals",
    purpose: "Goals linked to visions",
    columns: [
      { key: "title", header: "title", desc: "Goal title", required: true },
      { key: "description", header: "description", desc: "Goal description", required: false },
      { key: "vision_title", header: "vision_title", desc: "Title of the linked vision (must match a Vision title exactly)", required: false },
      { key: "target_date", header: "target_date", desc: "Target date (YYYY-MM-DD)", required: false },
      { key: "status", header: "status", desc: "active | achieved | deferred", required: false },
    ],
  },
  {
    name: "Areas",
    purpose: "Areas of focus / responsibility",
    columns: [
      { key: "name", header: "name", desc: "Area name (e.g. 'Morning Routine', 'Career Growth')", required: true },
      { key: "description", header: "description", desc: "Brief description", required: false },
      { key: "category", header: "category", desc: "Category (e.g. UnPuzzle, Chores, Routines, Roles, Getting Things Done)", required: false },
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: false },
      { key: "vision_text", header: "vision_text", desc: "Your immersive area vision text", required: false },
      { key: "icon", header: "icon", desc: "Lucide icon name", required: false },
      { key: "sort_order", header: "sort_order", desc: "Display order (number)", required: false },
      { key: "archived", header: "archived", desc: "0 = active, 1 = archived", required: false },
      { key: "archived_at", header: "archived_at", desc: "Archive timestamp (ISO 8601)", required: false },
    ],
  },
  {
    name: "Area Vision Snapshots",
    purpose: "History of area vision changes",
    columns: [
      { key: "area_name", header: "area_name", desc: "Name of the area (must match an Area name exactly)", required: true },
      { key: "previous_vision", header: "previous_vision", desc: "The previous vision text before the change", required: true },
      { key: "note", header: "note", desc: "Note about why the vision changed", required: false },
      { key: "changed_at", header: "changed_at", desc: "When the change happened (ISO 8601)", required: true },
    ],
  },
  {
    name: "Projects",
    purpose: "Projects linked to areas, goals, and identities",
    columns: [
      { key: "title", header: "title", desc: "Project title", required: true },
      { key: "description", header: "description", desc: "Project description", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "goal_title", header: "goal_title", desc: "Linked goal title", required: false },
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: false },
      { key: "identity_statement", header: "identity_statement", desc: "Linked identity statement", required: false },
      { key: "status", header: "status", desc: "active | completed | someday | deferred", required: false },
      { key: "due_date", header: "due_date", desc: "Due date (YYYY-MM-DD)", required: false },
      { key: "archived", header: "archived", desc: "0 = active, 1 = archived", required: false },
      { key: "archived_at", header: "archived_at", desc: "Archive timestamp (ISO 8601)", required: false },
    ],
  },
  {
    name: "Actions",
    purpose: "Next actions / tasks linked to projects and areas",
    columns: [
      { key: "title", header: "title", desc: "Action title", required: true },
      { key: "notes", header: "notes", desc: "Additional notes", required: false },
      { key: "project_title", header: "project_title", desc: "Linked project title", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "context", header: "context", desc: "@home | @work | @phone | @computer | @errands", required: false },
      { key: "energy", header: "energy", desc: "low | medium | high", required: false },
      { key: "time_estimate", header: "time_estimate", desc: "Estimated minutes (number)", required: false },
      { key: "due_date", header: "due_date", desc: "Due date (YYYY-MM-DD)", required: false },
      { key: "completed", header: "completed", desc: "0 = not done, 1 = done", required: false },
      { key: "completed_at", header: "completed_at", desc: "Completion timestamp (ISO 8601)", required: false },
      { key: "archived", header: "archived", desc: "0 = active, 1 = archived", required: false },
      { key: "archived_at", header: "archived_at", desc: "Archive timestamp (ISO 8601)", required: false },
    ],
  },
  {
    name: "Identities",
    purpose: "Identity statements with habit loop and environment design",
    columns: [
      { key: "statement", header: "statement", desc: "Identity statement (e.g. 'I am a person who exercises daily')", required: true },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "vision_title", header: "vision_title", desc: "Linked vision title", required: false },
      { key: "cue", header: "cue", desc: "Habit cue / trigger", required: false },
      { key: "craving", header: "craving", desc: "What you crave / motivation", required: false },
      { key: "response", header: "response", desc: "The action / response", required: false },
      { key: "reward", header: "reward", desc: "The reward", required: false },
      { key: "frequency", header: "frequency", desc: "daily | weekly | monthly | quarterly | yearly", required: false },
      { key: "target_count", header: "target_count", desc: "Target count per period (number)", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
      { key: "time_of_day", header: "time_of_day", desc: "early_morning | morning | late_morning | afternoon | late_afternoon | evening | waking_hours", required: false },
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: false },
      { key: "location", header: "location", desc: "Where this takes place", required: false },
      { key: "environment_type", header: "environment_type", desc: "person | place | thing (or combined with semicolons)", required: false },
      { key: "env_person_name", header: "env_person_name", desc: "Environment person name", required: false },
      { key: "env_person_contact_method", header: "env_person_contact_method", desc: "call | text | email | in-person | video", required: false },
      { key: "env_person_contact_info", header: "env_person_contact_info", desc: "Contact info for the person", required: false },
      { key: "env_person_why", header: "env_person_why", desc: "Why this person is part of the environment", required: false },
      { key: "env_place_name", header: "env_place_name", desc: "Environment place name", required: false },
      { key: "env_place_address", header: "env_place_address", desc: "Place address", required: false },
      { key: "env_place_travel_method", header: "env_place_travel_method", desc: "drive | walk | transit | remote", required: false },
      { key: "env_place_why", header: "env_place_why", desc: "Why this place", required: false },
      { key: "env_thing_name", header: "env_thing_name", desc: "Environment thing name", required: false },
      { key: "env_thing_usage", header: "env_thing_usage", desc: "How you'll use it", required: false },
      { key: "env_thing_why", header: "env_thing_why", desc: "Why this thing", required: false },
      { key: "archived", header: "archived", desc: "0 = active, 1 = archived", required: false },
      { key: "archived_at", header: "archived_at", desc: "Archive timestamp (ISO 8601)", required: false },
    ],
  },
  {
    name: "Habits",
    purpose: "Habits linked to identities",
    columns: [
      { key: "name", header: "name", desc: "Habit name", required: true },
      { key: "description", header: "description", desc: "Habit description", required: false },
      { key: "identity_statement", header: "identity_statement", desc: "Linked identity statement", required: false },
      { key: "cue", header: "cue", desc: "Habit cue", required: false },
      { key: "craving", header: "craving", desc: "Craving / motivation", required: false },
      { key: "response", header: "response", desc: "The response action", required: false },
      { key: "reward", header: "reward", desc: "The reward", required: false },
      { key: "frequency", header: "frequency", desc: "daily | weekdays | weekly", required: false },
      { key: "target_count", header: "target_count", desc: "Target count (number)", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "time_of_day", header: "time_of_day", desc: "Time of day category", required: false },
      { key: "archived", header: "archived", desc: "0 = active, 1 = archived", required: false },
      { key: "archived_at", header: "archived_at", desc: "Archive timestamp (ISO 8601)", required: false },
    ],
  },
  {
    name: "Habit Logs",
    purpose: "Daily habit completion logs",
    columns: [
      { key: "habit_name", header: "habit_name", desc: "Name of the habit (must match a Habit name exactly)", required: true },
      { key: "date", header: "date", desc: "Date (YYYY-MM-DD)", required: true },
      { key: "count", header: "count", desc: "Completion count (number, default 1)", required: false },
      { key: "note", header: "note", desc: "Optional note", required: false },
    ],
  },
  {
    name: "Routine Items",
    purpose: "Daily routine schedule items",
    columns: [
      { key: "sort_order", header: "sort_order", desc: "Display order (number)", required: false },
      { key: "time", header: "time", desc: "Time (HH:MM format, e.g. '07:00')", required: true },
      { key: "duration_minutes", header: "duration_minutes", desc: "Duration in minutes (number)", required: false },
      { key: "location", header: "location", desc: "Location", required: false },
      { key: "cue", header: "cue", desc: "Habit cue", required: false },
      { key: "craving", header: "craving", desc: "Craving / motivation", required: false },
      { key: "response", header: "response", desc: "The routine action", required: true },
      { key: "reward", header: "reward", desc: "The reward", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "habit_name", header: "habit_name", desc: "Linked habit name", required: false },
      { key: "day_variant", header: "day_variant", desc: "Day-specific overrides (e.g. 'Mon=Dark;Tue=Colors')", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
      { key: "is_draft", header: "is_draft", desc: "0 = published, 1 = draft", required: false },
      { key: "time_of_day", header: "time_of_day", desc: "Time of day category", required: false },
    ],
  },
  {
    name: "Routine Logs",
    purpose: "Daily routine completion logs",
    columns: [
      { key: "routine_response", header: "routine_response", desc: "Response text of the routine item (must match a Routine Item response)", required: true },
      { key: "date", header: "date", desc: "Date (YYYY-MM-DD)", required: true },
      { key: "completed_at", header: "completed_at", desc: "Completion timestamp (ISO 8601)", required: false },
      { key: "note", header: "note", desc: "Optional note", required: false },
    ],
  },
  {
    name: "Planner Tasks",
    purpose: "Daily planner tasks and time blocks",
    columns: [
      { key: "date", header: "date", desc: "Date (YYYY-MM-DD)", required: true },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "goal", header: "goal", desc: "Task description", required: true },
      { key: "start_time", header: "start_time", desc: "Start time (HH:MM)", required: false },
      { key: "end_time", header: "end_time", desc: "End time (HH:MM)", required: false },
      { key: "hours", header: "hours", desc: "Decimal hours (e.g. '1.50')", required: false },
      { key: "result", header: "result", desc: "Outcome notes", required: false },
      { key: "status", header: "status", desc: "planned | done | skipped", required: false },
      { key: "recurrence", header: "recurrence", desc: "null | daily | weekdays | weekend | weekly:monday | monthly", required: false },
      { key: "habit_name", header: "habit_name", desc: "Linked habit name", required: false },
      { key: "is_draft", header: "is_draft", desc: "0 = published, 1 = draft", required: false },
      { key: "source_type", header: "source_type", desc: "habit | manual", required: false },
    ],
  },
  {
    name: "Inbox Items",
    purpose: "GTD capture inbox",
    columns: [
      { key: "content", header: "content", desc: "Inbox item content", required: true },
      { key: "notes", header: "notes", desc: "Additional notes", required: false },
      { key: "processed", header: "processed", desc: "0 = unprocessed, 1 = processed", required: false },
      { key: "processed_as", header: "processed_as", desc: "task | project | reference | someday | trash", required: false },
      { key: "deleted_at", header: "deleted_at", desc: "Deletion timestamp (ISO 8601)", required: false },
      { key: "reference_area_name", header: "reference_area_name", desc: "Reference area name", required: false },
      { key: "reference_project_title", header: "reference_project_title", desc: "Reference project title", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
    ],
  },
  {
    name: "Weekly Reviews",
    purpose: "Weekly review reflections and ratings",
    columns: [
      { key: "week_of", header: "week_of", desc: "Week start date — Monday (YYYY-MM-DD)", required: true },
      { key: "wins", header: "wins", desc: "Wins separated by semicolons", required: false },
      { key: "lessons", header: "lessons", desc: "Lessons separated by semicolons", required: false },
      { key: "next_week_focus", header: "next_week_focus", desc: "Focus items separated by semicolons", required: false },
      { key: "inbox_cleared", header: "inbox_cleared", desc: "0 = no, 1 = yes", required: false },
      { key: "projects_reviewed", header: "projects_reviewed", desc: "0 = no, 1 = yes", required: false },
      { key: "habits_reviewed", header: "habits_reviewed", desc: "0 = no, 1 = yes", required: false },
      { key: "puzzle_piece_ratings", header: "puzzle_piece_ratings", desc: "Ratings as key=value pairs (e.g. 'reason=4;finance=3;fitness=5;talent=2;pleasure=4')", required: false },
    ],
  },
  {
    name: "Environment Entities",
    purpose: "People, places, and things in your environment design",
    columns: [
      { key: "identity_statement", header: "identity_statement", desc: "Linked identity statement", required: false },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: false },
      { key: "type", header: "type", desc: "person | place | thing", required: true },
      { key: "person_name", header: "person_name", desc: "Person's name", required: false },
      { key: "person_contact_method", header: "person_contact_method", desc: "call | text | email | in-person | video", required: false },
      { key: "person_contact_info", header: "person_contact_info", desc: "Contact info", required: false },
      { key: "person_why", header: "person_why", desc: "Why this person", required: false },
      { key: "place_name", header: "place_name", desc: "Place name", required: false },
      { key: "place_address", header: "place_address", desc: "Place address", required: false },
      { key: "place_travel_method", header: "place_travel_method", desc: "drive | walk | transit | remote", required: false },
      { key: "place_why", header: "place_why", desc: "Why this place", required: false },
      { key: "thing_name", header: "thing_name", desc: "Thing name", required: false },
      { key: "thing_usage", header: "thing_usage", desc: "How you'll use it", required: false },
      { key: "thing_why", header: "thing_why", desc: "Why this thing", required: false },
    ],
  },
  {
    name: "Beliefs",
    purpose: "Belief reprogramming (old → new)",
    columns: [
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: true },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "old_belief", header: "old_belief", desc: "The limiting belief being replaced", required: true },
      { key: "new_belief", header: "new_belief", desc: "The replacement belief", required: true },
      { key: "why_it_matters", header: "why_it_matters", desc: "Short explanation", required: false },
      { key: "repetition_count", header: "repetition_count", desc: "Times reviewed (number)", required: false },
      { key: "graduated", header: "graduated", desc: "0 = in progress, 1 = graduated", required: false },
      { key: "graduated_at", header: "graduated_at", desc: "Graduation timestamp (ISO 8601)", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
    ],
  },
  {
    name: "Anti Habits",
    purpose: "Bad habits to break using inverted Four Laws",
    columns: [
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: true },
      { key: "area_name", header: "area_name", desc: "Linked area name", required: false },
      { key: "identity_statement", header: "identity_statement", desc: "The identity this protects", required: false },
      { key: "title", header: "title", desc: "Short name (e.g. 'No late-night snacking')", required: true },
      { key: "description", header: "description", desc: "What habit you're breaking", required: false },
      { key: "make_invisible", header: "make_invisible", desc: "Remove the cue", required: false },
      { key: "make_unattractive", header: "make_unattractive", desc: "Reframe the craving", required: false },
      { key: "make_difficult", header: "make_difficult", desc: "Add friction", required: false },
      { key: "make_unsatisfying", header: "make_unsatisfying", desc: "Add a consequence", required: false },
      { key: "current_streak", header: "current_streak", desc: "Days without the habit (number)", required: false },
      { key: "longest_streak", header: "longest_streak", desc: "Best streak (number)", required: false },
      { key: "last_slip_date", header: "last_slip_date", desc: "Last slip date (YYYY-MM-DD)", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
    ],
  },
  {
    name: "Immutable Laws",
    purpose: "Non-negotiable identity boundaries per puzzle piece",
    columns: [
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: true },
      { key: "title", header: "title", desc: "Short name (e.g. 'No Sleep Sacrifice Law')", required: true },
      { key: "statement", header: "statement", desc: "One-sentence law statement", required: true },
      { key: "why_it_matters", header: "why_it_matters", desc: "Why this law exists", required: false },
      { key: "linked_identity_statements", header: "linked_identity_statements", desc: "Identity statements this law protects, separated by semicolons", required: false },
      { key: "is_primary", header: "is_primary", desc: "0 = no, 1 = primary law for this piece", required: false },
      { key: "is_red_line", header: "is_red_line", desc: "0 = no, 1 = hard line", required: false },
      { key: "enforcement_level", header: "enforcement_level", desc: "1 = Awareness, 2 = Friction, 3 = Block", required: false },
      { key: "trigger_conditions", header: "trigger_conditions", desc: "Trigger conditions separated by semicolons", required: false },
      { key: "active", header: "active", desc: "0 = inactive, 1 = active", required: false },
    ],
  },
  {
    name: "Immutable Law Logs",
    purpose: "Daily tracking of laws kept or broken",
    columns: [
      { key: "immutable_law_title", header: "immutable_law_title", desc: "Title of the immutable law", required: true },
      { key: "puzzle_piece", header: "puzzle_piece", desc: "reason | finance | fitness | talent | pleasure", required: true },
      { key: "date", header: "date", desc: "Date (YYYY-MM-DD)", required: true },
      { key: "kept", header: "kept", desc: "1 = kept, 0 = broken", required: true },
      { key: "note", header: "note", desc: "Reflection note", required: false },
      { key: "trigger_type", header: "trigger_type", desc: "visibility | craving | convenience | emotion | social_pressure", required: false },
      { key: "was_override", header: "was_override", desc: "0 = no, 1 = conscious override", required: false },
      { key: "override_reason", header: "override_reason", desc: "Why the override happened", required: false },
      { key: "suggested_anti_habit_title", header: "suggested_anti_habit_title", desc: "Suggested anti-habit title", required: false },
    ],
  },
  {
    name: "Wizard State",
    purpose: "Onboarding wizard progress",
    columns: [
      { key: "current_phase", header: "current_phase", desc: "Current phase (1-4)", required: false },
      { key: "completed", header: "completed", desc: "0 = in progress, 1 = completed", required: false },
      { key: "completed_at", header: "completed_at", desc: "Completion timestamp (ISO 8601)", required: false },
    ],
  },
];

async function generate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UnPuzzle Life";
  wb.created = new Date();

  // ── Overview Sheet ──
  const overview = wb.addWorksheet("Overview", { properties: { tabColor: { argb: "0D4F4F" } } });
  overview.mergeCells("A1:D1");
  const titleCell = overview.getCell("A1");
  titleCell.value = "UnPuzzle Life — Data Workbook";
  titleCell.font = { size: 18, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_TEAL } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  overview.getRow(1).height = 40;

  overview.mergeCells("A2:D2");
  const subtitleCell = overview.getCell("A2");
  subtitleCell.value = "Each tab contains one data table. Rows 2-3 are guidance rows (auto-stripped on import).";
  subtitleCell.font = { size: 11, italic: true, color: { argb: "666666" } };
  subtitleCell.alignment = { vertical: "middle", wrapText: true };
  overview.getRow(2).height = 30;

  // Table of contents headers
  const tocHeaderRow = overview.getRow(4);
  const tocHeaders = ["Tab Name", "Purpose", "Required Fields", "Records"];
  tocHeaders.forEach((h, i) => {
    const cell = tocHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_TEAL } };
    cell.alignment = { vertical: "middle" };
  });
  tocHeaderRow.height = 25;

  SHEETS.forEach((sheet, idx) => {
    const row = overview.getRow(5 + idx);
    row.getCell(1).value = sheet.name;
    row.getCell(2).value = sheet.purpose;
    row.getCell(3).value = sheet.columns.filter(c => c.required).map(c => c.header).join(", ") || "None";
    row.getCell(4).value = 0; // placeholder for record count
    row.getCell(4).font = { italic: true, color: { argb: "999999" } };
  });

  overview.getColumn(1).width = 25;
  overview.getColumn(2).width = 55;
  overview.getColumn(3).width = 40;
  overview.getColumn(4).width = 12;
  overview.views = [{ state: "frozen", ySplit: 4 }];

  // ── Data Sheets ──
  for (const sheet of SHEETS) {
    const ws = wb.addWorksheet(sheet.name);
    const cols = sheet.columns;

    // Row 1: Headers
    const headerRow = ws.getRow(1);
    cols.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_TEAL } };
      cell.alignment = { vertical: "middle" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "CCCCCC" } },
        right: { style: "thin", color: { argb: "CCCCCC" } },
      };
    });
    headerRow.height = 25;

    // Row 2: Descriptions
    const descRow = ws.getRow(2);
    cols.forEach((col, i) => {
      const cell = descRow.getCell(i + 1);
      cell.value = col.desc;
      cell.font = { italic: true, size: 10, color: { argb: "555555" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_TEAL } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    descRow.height = 35;

    // Row 3: Required flags
    const reqRow = ws.getRow(3);
    cols.forEach((col, i) => {
      const cell = reqRow.getCell(i + 1);
      cell.value = col.required ? "Yes" : "No";
      cell.font = { bold: col.required, size: 10, color: { argb: col.required ? "1B5E20" : "666666" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? GREEN_BG : GRAY_BG } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    reqRow.height = 22;

    // Column widths
    cols.forEach((col, i) => {
      const descLen = col.desc.length;
      const headerLen = col.header.length;
      ws.getColumn(i + 1).width = Math.min(Math.max(headerLen + 4, Math.floor(descLen / 3), 14), 45);
    });

    // Freeze panes
    ws.views = [{ state: "frozen", ySplit: 3 }];
  }

  // Write
  const outPath = path.join(__dirname, "..", "server", "templates", "unpuzzle-life-template.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log(`Template generated: ${outPath}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
