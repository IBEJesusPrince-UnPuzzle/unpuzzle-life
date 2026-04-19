# Phases 3-6: Implementation Instructions

Reference the v2 spec at `docs/v2-spec.md` for full design details.

## CRITICAL RULES (apply to ALL phases)
- Back button on every page uses `window.history.back()` (NOT hardcoded paths)
- Puzzle piece keys ALWAYS lowercase: reason, finance, fitness, talent, pleasure
- Colors: purple=reason, green=finance, blue=fitness, yellow=talent, red=pleasure — use `client/src/lib/piece-colors.ts`
- Nav menu is intentionally limited: Dashboard, Clarity (/horizons), UnPuzzle (/unpuzzle), Weekly Review (/review), Data (/data) — do NOT add nav items
- All API calls use `apiRequest` from `@/lib/queryClient`
- Use existing shadcn/ui components
- Existing routes/pages NOT listed in nav (inbox, planner, routine, etc.) should remain functional but are not part of v2 primary flow

---

## Phase 3: Identity Lifecycle & AI

### 3A: Identity Draft Review Page
**New page**: `client/src/pages/draft-review.tsx`
**Route**: `/drafts` (add to App.tsx router but NOT to nav sidebar)

**Purpose**: After wizard completion, user reviews DRAFT identities.

**UX**:
- List all identities with `status = "draft"` grouped by area
- Each identity card shows: statement, puzzle piece badge (colored), area name
- Three actions per identity:
  - **Keep** → promotes to PROJECT status via `PATCH /api/identities/:id/status` with `{ status: "project" }`
  - **Edit** → inline edit the statement text, then save via `PATCH /api/identities/:id`
  - **Remove** → delete via `DELETE /api/identities/:id`
- "All done" button returns to dashboard

### 3B: Project Builder Page
**New page**: `client/src/pages/project-builder.tsx`
**Route**: `/projects/:id/build` (add to App.tsx router)

**Purpose**: For identities in PROJECT status, user builds the environment and tasks.

**UX**:
- Header: identity statement + area name + puzzle piece badge
- Three sections for environment:
  1. **People**: List + add/remove. Combobox from `GET /api/environment/people` + "Create new". Link via `POST /api/projects/:id/environment` with `{ entityType: "person", entityId }`.
  2. **Places**: Same pattern with `GET /api/environment/places` + create. Link with `entityType: "place"`.
  3. **Things**: Same with `GET /api/environment/things` + create. Link with `entityType: "thing"`.
- **Tasks section**: Below environment. Tasks are created via `POST /api/planner-tasks` linked to the project (use `projectId` and `identityId` fields on plannerTasks). Each task has: description, optional due date.
- **AI Assist button** (see 3C below)

### 3C: AI Assist (Optional Feature)
**Server-side**: Add new route `POST /api/ai/suggest` in `server/routes.ts`
- Accepts: `{ identityStatement, areaVision, puzzlePiece }`
- Returns: `{ people: [], places: [], things: [], tasks: [] }`
- Implementation: Call OpenAI/Anthropic API (GPT-4o-mini preferred for cost)
  - If no API key configured → return 501 with message "AI not configured"
  - Rate limit: track in a simple counter per project (store in a `ai_usage` field or separate table)
  - Limit: 1 generation + 1 regeneration per project
- **Fallback**: If AI unavailable, hide the button. Project builder works fully without it.

**Client-side**: 
- "Ask AI for help" button on project builder page
- On click → `POST /api/ai/suggest` → show suggestions in a review panel
- Each suggestion has accept/reject toggle
- Accepted items get created via the normal CRUD APIs

**For now**: Implement the button and API route structure. If no OPENAI_API_KEY env var, the button shows "AI coming soon" or is hidden. The manual flow must work perfectly without AI.

### 3D: Graduation Flow
- When all tasks in a project are marked complete → show a prompt card:
  "Your environment is ready. Graduate this identity to a routine?"
- Two buttons: "Graduate to Routine" | "Keep as Project"
- Graduate: `PATCH /api/identities/:id/status` with `{ status: "routine" }`
- Also allow manual graduation button on the project builder page
- On graduation, prompt for cadence: daily, weekdays, specific days
  - Save cadence to the identity's `frequency` field

### 3E: Active Projects List
Modify the existing `client/src/pages/projects.tsx` to:
- Filter to only show identities with `status = "project"` (and their linked projects)
- Each project card links to `/projects/:id/build`
- Show progress: X/Y tasks complete

---

## Phase 4: Daily Agenda & Morning Briefing

### 4A: Morning Briefing Page
**New page**: `client/src/pages/morning-briefing.tsx`
**Route**: `/briefing` (add to App.tsx router, NOT to nav)

**Purpose**: "Here's what needs your attention" screen before daily agenda.

**Items to show**:
1. **Draft identities** awaiting review → link to `/drafts`
2. **Graduation candidates** (projects with all tasks complete) → link to project builder
3. **Overdue tasks** (plannerTasks past due date with status != "done") → inline action: reschedule or complete
4. **Stale projects** (projects with no task activity in 7+ days) → link to project builder

**UX**:
- Card-based, each item type in its own section
- "Process" or dismiss each item
- "Proceed to Agenda" button at bottom (always available — soft gate, not hard lock)
- If no outstanding items, show "All clear! Here's your day." and auto-redirect to agenda

### 4B: Daily Agenda Page
**New page**: `client/src/pages/agenda.tsx`
**Route**: `/agenda` (add to App.tsx router, NOT to nav)

**Four streams displayed for today**:

1. **Routines**: Identities with `status = "routine"` whose `frequency` matches today
   - Show with puzzle piece color
   - Checkbox to mark done (use routineLogs table)

2. **Tasks**: Active project tasks (`plannerTasks` where `projectId` is not null and `date` matches today)
   - Show with project indicator
   - Checkbox to mark done

3. **Responsibilities**: From `responsibilities` table, filtered by cadence matching today
   - Show with neutral styling
   - Checkbox to mark done (need a completion tracking mechanism — use plannerTasks or a new simple log)

4. **Roles**: From `roles` table, filtered by cadence matching today
   - Show with people indicator
   - Checkbox to mark done

**Default ordering**: Chronological if times assigned, otherwise grouped by stream.

**View toggle**: Button to switch between chronological and stream-grouped views.

### 4C: Dashboard Integration
Modify `client/src/pages/dashboard.tsx`:
- If user has completed wizard AND has morning briefing items → show a card: "Start your day" linking to `/briefing`
- If no briefing items → show "Today's agenda" card linking to `/agenda`
- Keep existing dashboard content below

---

## Phase 5: UnPuzzle Hub Rework

Rewrite `client/src/pages/unpuzzle.tsx` to implement the dual-view hub.

### 5A: Wheel View (Default)
- Keep the existing 5-piece puzzle wheel visual
- Each piece shows aggregate status counts across ALL areas:
  - N draft, N project, N routine
  - Fetch from `GET /api/identities` grouped by puzzlePiece and status
- Visual health indicator per piece:
  - More routines = stronger/brighter color
  - All drafts = faded color
  - Mix = medium intensity
- Each piece is tappable → navigates to piece detail view

### 5B: Piece Detail View
**Route**: Still on `/unpuzzle` but with URL param: `/unpuzzle?piece=reason`

**Layout**:
1. **Global non-negotiable** at the top (from `GET /api/non-negotiables?areaId=` where areaId is null, filtered by piece)
   - Tap-to-edit pattern (same as Clarity page)
2. **Below**: All identities using this puzzle piece, grouped by area:
   ```
   Family
     → "I am someone who..." (ROUTINE ✓)
   Career  
     → "I am someone who..." (PROJECT — 3/5 tasks done)
   Health
     → "I am someone who..." (DRAFT)
   ```
3. Each identity card shows:
   - Statement text
   - Status badge (color-coded: draft=gray, project=amber, routine=green)
   - If PROJECT: task progress (X/Y tasks)
   - Tap → navigates to appropriate page (draft review, project builder, or routine detail)

### 5C: Keep Existing IdentityForm Export
The current `unpuzzle.tsx` exports `IdentityForm` which is used by `wizard.tsx`. Since we're rewriting the wizard, we can remove this dependency. But if any other file imports from unpuzzle.tsx, check first.

---

## Phase 6: Clarity Page Updates

Modify `client/src/pages/horizons.tsx` to integrate v2 features.

### 6A: Identity Status Display on Area Cards
Each `AreaVisionCard` should now show identity statements below the vision text:
- Fetch identities for this area: filter `GET /api/identities` by `areaId`
- Group by puzzle piece, show status badge:
  ```
  🟣 Reason: "I am someone who..." — Draft
  🟢 Finance: "I am someone who..." — Project (2/4 tasks)
  🔵 Fitness: "I am someone who..." — Routine ✓
  ```
- Each identity is tappable → navigates to draft review, project builder, or agenda
- Use small, compact display — don't overwhelm the vision card

### 6B: Non-Negotiables Section on Area Cards
Add an expandable "Boundaries" section on each area card:
- Collapsible section header: "Boundaries" with expand/collapse chevron
- Shows area-specific non-negotiables from `GET /api/non-negotiables?areaId=<id>`
- "Add boundary" button:
  - Puzzle piece selector (which piece does this boundary relate to?)
  - Statement input
  - Optional: reference to which global non-negotiable it operationalizes
  - Save via `POST /api/non-negotiables` with `{ puzzlePiece, statement, areaId, createdAt }`
- Each boundary shows its puzzle piece color indicator
- Tap-to-edit for existing boundaries

### 6C: Preserve Existing Features
All existing Clarity page features MUST remain working:
- Purpose banner (tap-to-edit) ✓
- Area vision cards (tap-to-edit) ✓
- Snapshot history badges ✓
- Archive / Duplicate & Archive menus ✓
- Add another area ✓
- Vision Writer subview ✓

---

## Final Steps After All Phases

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Run `npm run build` — must succeed
3. Run `node scripts/generate-template.cjs` — must succeed
4. Test the full flow manually:
   - New user → wizard (4 steps) → dashboard → draft review → project builder → graduation → agenda
5. Git commit each phase separately with descriptive messages
