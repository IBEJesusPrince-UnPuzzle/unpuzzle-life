# Habits as Tasks — Implementation Spec

## Overview
A habit is now a recurring task on the Daily Agenda. The "Add Habit" form becomes an identity-driven sentence builder. When saved, it creates a **draft** planner task that appears in the Daily Agenda with a "Draft" badge. The Routine page is merged into the Daily Agenda. 

## 1. Schema Changes

### habits table — add new fields
```ts
// ADD these columns to existing habits table:
areaId: integer("area_id").references(() => areas.id),  // "In the...{area}"
timeOfDay: text("time_of_day"),  // time-of-day category string
// Keep existing: name, description, identityId, cue, craving, response, reward, frequency, targetCount, active, createdAt
```

### plannerTasks table — add fields for habit-linked drafts
```ts
// ADD these columns:
habitId: integer("habit_id").references(() => habits.id),  // links task back to its habit
isDraft: integer("is_draft").notNull().default(0),  // 1 = draft, 0 = published
sourceType: text("source_type"),  // "habit" | "manual" | null
```

### Update insert schemas and types after schema changes

## 2. Time-of-Day Categories

Replace "Midday" with "Late Morning" everywhere. Add "Waking Hours". Used in:
- `planner.tsx` getTimePhase function
- `planner.tsx` phaseColors
- New habit form dropdown

```ts
const TIME_OF_DAY_CATEGORIES = [
  { value: "early_morning", label: "Early Morning", range: "12:00 AM – 5:59 AM" },
  { value: "morning", label: "Morning", range: "6:00 AM – 8:59 AM" },
  { value: "late_morning", label: "Late Morning", range: "9:00 AM – 11:59 AM" },
  { value: "afternoon", label: "Afternoon", range: "12:00 PM – 2:59 PM" },
  { value: "late_afternoon", label: "Late Afternoon", range: "3:00 PM – 5:59 PM" },
  { value: "evening", label: "Evening", range: "6:00 PM – 11:59 PM" },
  { value: "waking_hours", label: "Waking Hours", range: "8:00 AM – 7:59 PM" },
];
```

In `getTimePhase()`:
- `h < 6` → "Early Morning"
- `h < 9` → "Morning"  
- `h < 12` → "Late Morning"  (was "Midday")
- `h < 15` → "Afternoon"
- `h < 18` → "Late Afternoon"
- else → "Evening"

Note: "Waking Hours" (8am-7:59pm) is a selection option for habit creation only — it's a meta-category that tells the user "this habit can happen anytime during the day". In the Daily Agenda grouping, tasks from "Waking Hours" habits should appear in whatever time phase their actual scheduled time falls into.

## 3. Redesigned Add Habit Form

The form reads as a flowing identity sentence. Replace the entire `NewHabitForm` component in `habits.tsx`.

### Form Flow (top to bottom):

```
"In the..."
  [Area dropdown - all areas from /api/areas, grouped by category]

"...I am the type of person who..."
  [Input box]
  placeholder: "e.g. exercises, meal preps, eats breakfast, plays with my kids"

"...in the..."
  [Time of Day dropdown - the 7 categories above]

[Repeat section - REUSE RecurrenceBuilder from planner.tsx but:]
  - Remove "None" option (recurrence is required for habits)
  - Add "Quarterly" and "Yearly" buttons alongside Daily/Weekly/Monthly
  - Quarterly = { type: "quarterly", interval: 1 }
  - Yearly = { type: "yearly", interval: 1 }

"...because..."
  [Input box]
  placeholder: "e.g. it's delicious, I have fun, I don't like the feeling of being rushed"

"...I'll be rewarded by..."
  [Input box]  
  placeholder: "e.g. making my tummy smile, resetting my nervous system, having beautiful memories I can always look back on"
```

### On Save:
1. Create the habit record (POST /api/habits) with:
   - `name`: the identity action text (the "who..." input)
   - `areaId`: selected area
   - `timeOfDay`: selected time-of-day category
   - `craving`: the "because..." text
   - `reward`: the "I'll be rewarded by..." text
   - `frequency`: the recurrence JSON string
   - `response`: same as name (for backward compat with routine display)
   - `cue`: null (not in new form)
   - `identityId`: null (identity is now inline in the sentence)

2. Create a draft planner task (POST /api/planner-tasks) with:
   - `goal`: the habit name/action
   - `areaId`: same area
   - `habitId`: the newly created habit's ID
   - `isDraft`: 1
   - `sourceType`: "habit"
   - `status`: "planned"
   - `date`: today's date (placeholder — user will set the real start date)
   - `recurrence`: the same recurrence JSON from the habit
   - `startTime`: null (user needs to set this)
   - `endTime`: null

## 4. Draft Tasks in Daily Agenda

### Display:
- Draft tasks appear in the Daily Agenda with a **"Draft" badge** (amber/gold color).
- Drafts without a startTime appear in an "Unscheduled" section at the bottom.
- Drafts show a subtle prompt: "Set a start date & time to activate"

### Publishing:
- User clicks on a draft task → opens the edit dialog (already exists)
- User sets a start date and start time → isDraft automatically becomes 0
- The task is now a regular recurring planner task

### API changes:
- `POST /api/planner-tasks`: accept `habitId`, `isDraft`, `sourceType` fields
- `PATCH /api/planner-tasks/:id`: when startTime is set and isDraft is 1, auto-set isDraft to 0
- `GET /api/planner-tasks?date=X`: include draft tasks (isDraft=1) for the current date
- New: `GET /api/planner-tasks/drafts` — returns all draft tasks regardless of date

## 5. Merge Routine into Daily Agenda

### Remove from nav:
- Delete "Routine" from `navItems` in `app-sidebar.tsx`
- Delete "Routine" from `mobileNavItems` in `App.tsx`
- Remove the `/routine` route from `AppRouter` in `App.tsx`
- Keep the `routine.tsx` file for now (don't delete) but it won't be reachable

### Merge routine display into planner.tsx:
- In the Daily Agenda's SorterView, after showing regular tasks for a time phase, also show active routine items that fall in that time phase
- Routine items appear as a distinct visual style: slightly different card styling (maybe a left border accent) to differentiate from manual tasks
- Routine items are checkable (use routineLogs for completion tracking, same as before)
- When expanded, routine items show the journal-style habit stack: "I'll..." / "and because..." / "I will..." / "and I'll be rewarded by..."

### Data queries:
- The planner page now also fetches `/api/routine-items` and `/api/routine-logs?date=X`
- Routine items are interleaved with planner tasks sorted by time

## 6. Recurrence Updates

### Add to RecurrenceBuilder:
Add "Quarterly" and "Yearly" to the recurrence type buttons.

```ts
type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
```

- Quarterly: every N quarters (3-month intervals). Simple — just `{ type: "quarterly", interval: N }`. For display: "Quarterly" or "Every N quarters".
- Yearly: every N years. `{ type: "yearly", interval: N }`. Display: "Yearly" or "Every N years".

Both quarterly and yearly only need the interval selector (Every N quarters/years), no sub-options.

Update `parseRecurrence`, `formatRecurrence`, `RecurrencePattern` interface.

### Habit-specific RecurrenceBuilder variant:
Create a version that omits "None" — could be a prop `requireRecurrence?: boolean` that hides the None option and defaults to "daily".

## 7. File Changes Summary

### shared/schema.ts
- Add `areaId`, `timeOfDay` to `habits` table
- Add `habitId`, `isDraft`, `sourceType` to `plannerTasks` table
- Update insert schemas and types

### server/storage.ts
- Add `getDraftTasks()` method
- Update `createPlannerTask` to handle new fields
- Update `updatePlannerTask` to auto-publish drafts when time is set

### server/routes.ts
- Update POST/PATCH for planner-tasks
- Add GET /api/planner-tasks/drafts
- Update habit creation to also create draft task

### client/src/pages/habits.tsx
- Complete rewrite of `NewHabitForm` → identity sentence builder
- Keep HabitRow display but update to show new fields
- Add area display, time-of-day badge

### client/src/pages/planner.tsx
- Rename "Midday" → "Late Morning" in getTimePhase and phaseColors
- Import and display routine items interleaved with planner tasks
- Show draft tasks with Draft badge
- Auto-publish logic on edit
- Add quarterly/yearly to RecurrenceBuilder

### client/src/App.tsx
- Remove Routine from mobileNavItems
- Remove /routine Route

### client/src/components/app-sidebar.tsx
- Remove Routine from navItems

### Run: `npx drizzle-kit push` after schema changes
