# Change Specification: Horizons Repositioning + Inbox Processing Overhaul

## Part 1: Navigation & Horizons Restructuring

### 1A. Move Horizons in nav order
- Sidebar (`client/src/components/app-sidebar.tsx`): Move Horizons to last position (after Weekly Review)
- Mobile nav (`client/src/App.tsx` `mobileNavItems`): Move Horizons to last position (before the dark/light toggle)
- Horizons is now a "profile/settings" type section, not a daily driver

### 1B. Reorder Horizons page tabs
Current order: Purpose, Vision, Goals, Areas, Projects, Actions
New order: Purpose, Vision, Areas, Identity, Goals, Projects, Agenda
- Remove Actions tab entirely
- Move Identity section FROM habits page TO horizons page (between Areas and Goals)
- Add "Agenda" tab that links to/embeds the Daily Planner content
- Keep Identity section also visible on habits page (or just reference it from there)

### 1C. Rename "Daily Planner" → "Daily Agenda"
- Sidebar nav: "Planner" → "Agenda"  
- Mobile nav: "Planner" → "Agenda"
- Page title: "Daily Planner" → "Daily Agenda"
- Route stays /planner for backward compatibility (or change to /agenda)

## Part 2: Inbox Processing Overhaul

### Schema Changes
- Add `deletedAt` text field to `inboxItems` table for soft-delete (7-day trash)
- Ensure "Someday/Maybe" project exists (auto-create if missing)
- Add `referenceAreaId` and `referenceProjectId` fields to inboxItems for "File It" tracking

### 2A. "Do It (task < 5min)" 
- Replaces "Next Action (do it/delegate it)"
- When selected: show the Add Task dialog (same as Planner's AddTaskDialog) 
- Pre-fill the "What" field with the inbox item content
- Include a back breadcrumb "← Back to processing" to return to the 5-choice screen
- On task creation, mark inbox item as processed with processedAs="task"

### 2B. "Add To Projects (multi-step outcome)"
- Replaces "Project (multi-step outcome)"
- When selected: show a Projects list view (existing projects, sortable)
- User can drill into a project and add the inbox item as a task within that project
- Or create a new project from the inbox item
- Back breadcrumb to return to processing choices
- On completion, mark inbox item as processed with processedAs="project"

### 2C. "File It (reference later)"
- Replaces "Reference (file it)"
- When selected: show an Area dropdown + optional Project dropdown
- Links the item to an area (from Horizons) and optionally a project
- Back breadcrumb
- On filing, mark inbox item as processed with processedAs="reference"

### 2D. "Wonder It (someday/maybe)"
- Replaces "Someday/Maybe"
- When selected: automatically file under a default "Someday/Maybe" project
- This project maintains an ongoing list of all "wondered" items
- Items can be sent back to inbox for re-processing later
- Mark inbox item as processed with processedAs="someday"

### 2E. "Trash It (not actionable)"
- Replaces "Not actionable (trash)"
- Soft-delete: set deletedAt = now, keep for 7 days
- Show a "Recently Trashed" section at the bottom that shows items deleted in last 7 days
- Items can be restored back to inbox
- After 7 days, items are permanently gone (server-side cleanup)
- Mark inbox item as processed with processedAs="trash"

## UI Flow
The inbox processing now works as a MULTI-STEP wizard:
1. User clicks "Process" on an inbox item
2. Step 1: Choose one of the 5 options (Do It, Add To Projects, File It, Wonder It, Trash It)
3. Step 2: The chosen flow's specific UI appears (task form, project list, area selector, etc.)
4. Each step has a back breadcrumb to return to step 1
5. On completion, the inbox item is marked as processed
