# UnPuzzle Life v2 — Comprehensive Design Spec

> This document captures all design decisions from the April 2026 conversation sessions.
> It is the single reference before any code changes begin.

---

## Table of Contents

1. [Philosophy & Influences](#1-philosophy--influences)
2. [Core Entities](#2-core-entities)
3. [The Wizard (Guided Onboarding)](#3-the-wizard-guided-onboarding)
4. [Identity Lifecycle](#4-identity-lifecycle)
5. [AI Integration](#5-ai-integration)
6. [People, Places & Things (Shared Environment)](#6-people-places--things-shared-environment)
7. [Responsibilities](#7-responsibilities)
8. [Roles](#8-roles)
9. [Daily Agenda](#9-daily-agenda)
10. [Morning Briefing](#10-morning-briefing)
11. [Non-Negotiables (Two-Layer Model)](#11-non-negotiables-two-layer-model)
12. [Clarity Page (Post-Onboarding Home)](#12-clarity-page-post-onboarding-home)
13. [UnPuzzle Hub Page](#13-unpuzzle-hub-page)
14. [Weekly Review](#14-weekly-review)
15. [Preset Data](#15-preset-data)
16. [Attribution](#16-attribution)
17. [Schema Changes Summary](#17-schema-changes-summary)
18. [Existing Rules (Preserved)](#18-existing-rules-preserved)

---

## 1. Philosophy & Influences

### Pat Flynn — *Will It Fly?* (The Airport Test)
- Users discover their life areas and 5-year visions through a guided narrative, not blank forms.
- The Airport Test places the user 5 years in the future, telling an old friend why life is amazing.
- Areas and visions emerge together in one emotional, journaling-style step.
- The exercise validates alignment: does what I'm doing today fit the person I want to become?

### Mike Michalowicz — *The Pumpkin Plan* (Non-Negotiables / Boundaries)
- Non-negotiables are unbreakable rules — the spine of your life, not aspirational values.
- Discovery process: observe emotional reactions over time. Strong negative reactions signal a violated boundary.
- Non-negotiables serve as a decision filter: every opportunity, relationship, and commitment is measured against them.
- Two layers: global boundaries (universal identity) + area-specific boundaries (contextual application).

### James Clear — *Atomic Habits* (Identity-Based Habits)
- Habits are built from identity, not outcomes. "I am someone who..." drives behavior.
- The identity → environment → routine pipeline is the app's core lifecycle.
- Environment design (people, places, things) makes good habits easier and bad habits harder.

### Core App Philosophy — Three Pillars
- **Clarity**: True self-discovery. The guided journey helps the user define who they want to become. (Airport Test, visions, identity statements)
- **Environment**: What it takes to get there. AI helps bridge the gap between vision and action by suggesting the people, places, things, and tasks needed. (Projects)
- **Discipline**: Just do it. Once the environment supports the identity, all that's left is execution. (Routines on the Daily Agenda)

### Additional Principles
- "Context tells you how to act on something. Environment tells you why it matters to your identity."
- Everything is accounted for and in its place — no loose ends.
- If it doesn't fit in your ideal life, you can't do it (tasks only exist inside projects).
- The 5 puzzle pieces (Reason, Finance, Fitness, Talent, Pleasure) are a **lens/framework** applied within each user-defined life area — not standalone categories.

---

## 2. Core Entities

### Hierarchy

```
Purpose (one statement — the big-picture why)
  └─ Life Areas (user-named, from Airport Test — e.g., Family, Career, Health, Adventure)
       └─ Vision (5-year narrative per area, written during Airport Test)
            └─ Identity Statements (one per puzzle piece lens, per area)
                 └─ Status lifecycle: DRAFT → PROJECT → ROUTINE
                      └─ Projects contain: Environment (People, Places, Things) + Tasks
                      └─ Routines appear on Daily Agenda
```

### The Four Streams on the Daily Agenda

| Stream | Source | Nature |
|--------|--------|--------|
| Routines | Graduated identity statements | Who you're becoming (ideal life) |
| Tasks | Active project steps | Bridge between current and ideal |
| Responsibilities | Recurring chores/maintenance | What you're maintaining (current life) |
| Roles | Recurring commitments to people | Who you're showing up for (current life) |

---

## 3. The Wizard (Guided Onboarding)

### Step 1 — Purpose

**What**: The user defines their life's purpose in a single statement.

**UX**: Simple textarea with guided prompt.
- Prompt: "What is your life's purpose?"
- Placeholder: "e.g. To live with integrity, create joy for my family, and leave the world better than I found it..."
- Helper text: "Your purpose is the big-picture why behind everything you do."

### Step 2 — The Airport Test (Areas + Visions)

**What**: The user names their life areas AND writes their 5-year visions in a single guided narrative.

**Attribution**: Small muted text below the section heading:
> *Inspired by The Airport Test from Pat Flynn's Will It Fly?*

**UX**: The app walks the user through Flynn's Airport Test scenario, adapted to the puzzle theme.

**Narrative flow**:
1. Set the scene: "Imagine you've traveled 5 years into the future. You're at the airport and run into an old friend. They ask how life is going. You say: 'AMAZING! Life couldn't get any better.'"
2. First prompt: "Your friend says, 'Tell me more! What's the first thing that comes to mind?' What area of your life is amazing, and what does that look like?"
   - User writes freely → this becomes **Area 1 name + Vision text**
3. Follow-up prompt: "What else is going on that's so great?"
   - User writes → **Area 2 name + Vision text**
4. Repeat: "Keep going — what else?" until the user is done.
5. Each entry captures both a short area name (label) and the vision narrative.

**Key design notes**:
- Areas are user-named and free-form (Family, Career, Spiritual Life, Adventure — whatever resonates).
- No fixed number required, but the Airport Test naturally produces ~3-6 areas.
- Area names are immutable once created (existing rule preserved). To change a name, archive old and create new.
- The tone is conversational and journaling-style, not form-filling.

### Step 3 — Puzzle Piece Breakdown + Global Non-Negotiables

**What**: For each life area, the user applies the 5 puzzle pieces as a lens using static, human-written prompts (no AI). The first time each puzzle piece appears, the user also defines its global non-negotiable (boundary).

**Attribution**: Small muted text:
> *Identity framework inspired by James Clear's Atomic Habits. Boundaries inspired by Mike Michalowicz's The Pumpkin Plan.*

**UX flow**:

For **Area 1** (e.g., Family):
1. Show the vision the user wrote in Step 2.
2. Walk through each puzzle piece with static fill-in-the-blank prompts:
   - **Reason** lens: "Looking at your Family vision through the Reason lens — why does this matter to your identity? Complete this: 'I am someone who _______ when it comes to my principles and my family.'" → User writes identity statement.
     - First time Reason appears → also prompt: "What's your Reason non-negotiable? A boundary you never cross, in any area of life." → User writes global non-negotiable for Reason.
   - **Finance** lens: "What financial reality supports this Family vision? 'I am someone who _______ when it comes to money and my family.'" → Identity statement.
     - First time Finance appears → global Finance non-negotiable prompt.
   - **Fitness** lens → same pattern.
   - **Talent** lens → same pattern.
   - **Pleasure** lens → same pattern.

For **Area 2** (e.g., Career):
1. Show the vision.
2. Walk through each puzzle piece:
   - **Reason** lens: "Here's your Reason non-negotiable: 'I always tell the truth.' How does Reason shape your Career vision?" → User writes identity statement only (non-negotiable already set).
   - (Same for all 5 pieces — non-negotiable already established, just apply the lens.)

**Result**: By the end of Step 3, the user has:
- 5 global non-negotiables (one per puzzle piece)
- N identity statements per area (one per puzzle piece, per area) — all in DRAFT status

**No AI in onboarding.** All prompts are static, human-written, and hardcoded. The user does all the thinking. AI enters later, in the project phase only (see Section 5).

### Step 4 — Responsibilities & Roles

**Transition language**: "Your vision defines who you're becoming. But life also has things you're maintaining and people you're showing up for right now. Let's capture those so nothing falls through the cracks."

**Responsibilities section**:
- Show preset chore dropdown (25 items — see Section 15) with the ability to select multiple.
- User can also create custom responsibilities.
- For place-qualified chores (Bathroom, Bedroom, etc.), prompt to attach a Place or create one.
- Each responsibility requires a cadence (daily, weekly, biweekly, monthly, etc.) and optionally a specific day.
- Cadence picker uses the same specific-day UI pattern as identity statements, routines, and tasks.

**Roles section**:
- Prompt: "Who are the people you show up for regularly?"
- User creates role entries tied to a Person (from People table) or a group.
- Each role has a description, cadence, and optionally a specific day.
- Example: "Help Marcus with homework" → Person: Marcus, Cadence: Daily (weekdays)

---

## 4. Identity Lifecycle

Every identity statement follows a strict lifecycle:

```
DRAFT
  → User reviews: keep, edit, or remove
    → If kept → PROJECT
      → User builds Environment (People, Places, Things)
      → User creates Tasks to prepare environment
      → (Optional) AI suggests environment + tasks (see Section 5)
        → All tasks complete → App prompts graduation (hybrid trigger)
          → User confirms → ROUTINE
            → Appears on Daily Agenda
```

### Status Details

**DRAFT** (born in wizard Step 3)
- User-written identity statements via static guided prompts.
- User reviews each: keep (promote to PROJECT), edit, or delete.

**PROJECT** (active work phase)
- The identity needs environment preparation before it can become a daily practice.
- User defines: What People, Places, and Things need to be in place?
- User creates Tasks: specific action steps to get environment ready.
- **AI assist available**: User can tap "Ask AI for help" to get suggested environment items and tasks (see Section 5).
- Example: Identity "I am someone who cooks healthy meals for my family"
  - People: Wife, Kids
  - Places: Kitchen
  - Things: Meal prep containers, Instant Pot
  - Tasks: "Survey family on favorite meals," "Research 20 quick healthy recipes," "Buy meal prep containers," "Reorganize pantry," "Do a test week of 3 planned dinners"

**Graduation trigger (hybrid)**:
- When all tasks in the project are marked complete → app prompts: "Your environment is ready. Graduate this identity to a routine?"
- User confirms → status changes to ROUTINE.
- User can also manually trigger graduation if they decide the environment is ready before all tasks are technically complete.

**ROUTINE** (daily practice)
- Appears on the Daily Agenda.
- The identity statement is now a living practice, not a project.
- Cadence is set during or after graduation (daily, specific days, etc.).
- Cadence picker uses the same specific-day UI pattern throughout the app.

### Key Rule
**Tasks exist only inside projects.** There are no standalone tasks on the agenda. This is intentional — if something doesn't align with an identity that serves your ideal life, it doesn't belong on your task list. One-off life tasks that don't fit a vision go into Responsibilities or Roles.

---

## 5. AI Integration

### Scope — Single, Optional, Clearly Bounded

AI is used in **one place only**: suggesting environment items (People, Places, Things) and tasks for identity projects. It is not used in onboarding, vision writing, non-negotiables, or any other part of the app.

### How It Works

1. User has an identity statement in PROJECT status.
2. User taps "Ask AI for help" (optional — they can always build manually).
3. Server sends to LLM: the identity statement + area vision + puzzle piece context.
4. LLM returns structured suggestions:
   - Suggested People (with relationship context)
   - Suggested Places
   - Suggested Things
   - Suggested Tasks (ordered as action steps)
5. User reviews everything: keep, edit, or remove any item. Add their own.
6. Rate limit: one AI generation per project, with one regeneration allowed.

### Provider Strategy

- Use the cheapest capable model (GPT-4o-mini or Gemini Flash).
- Cost per call: ~$0.001–$0.005 (fractions of a penny).
- Typical user lifetime usage: 10-20 calls total (~$0.01–$0.10 per user lifetime).
- Provider-agnostic implementation: one function that takes a prompt and returns structured JSON. Swapping providers is a one-file change.

### Fallback — No AI Available

If AI is unavailable (provider down, API key removed, cost decision), the app remains fully functional:
- The "Ask AI for help" button is hidden or disabled.
- User builds environment and tasks manually.
- Static template fallbacks can be provided per puzzle piece (curated by the app creator):
  - "Common environment items for health-related identities: gym membership, workout clothes, meal prep tools..."
  - "Common tasks for finance-related identities: set up auto-savings, review monthly expenses, open dedicated account..."

### Privacy

- User vision statements and identity text are sent to a third-party API for AI suggestions.
- Most providers (OpenAI, Anthropic, Google) do not train on API data.
- Must be disclosed in privacy policy and terms of service.

### Cost Mitigation

| Risk | Mitigation |
|------|-----------|
| Users spam the AI button | Rate limit: 1 generation + 1 regeneration per project |
| Provider raises prices | Provider-agnostic code; swap with one-file change |
| Costs scale with users | At $0.001-$0.005/call and ~15 calls/user lifetime, 10,000 users = $150-$750 total |
| Provider goes down | Graceful degradation: button hidden, manual mode works |

---

## 6. People, Places & Things (Shared Environment)

### Design Principle
Environment entities are born in projects (manually or via AI suggestions) but live everywhere. Once created, they become reusable dropdown items across the entire app.

### People
- Created when building a project's environment.
- Example: "Marcus" created under a Family identity project.
- Reusable in: other projects, Roles ("Help Marcus with homework"), anywhere a person reference is needed.

### Places
- Created when building a project's environment.
- Example: "Master Bedroom" created under a home organization identity project.
- Reusable in: other projects, Responsibilities (place-qualified chores like "Bedroom — Master Bedroom").

### Things
- Created when building a project's environment.
- Example: "2019 Honda Accord" created under a transportation identity project.
- Reusable in: other projects, Responsibilities ("Auto — 2019 Honda Accord").

### Schema

```
environment_people
  - id
  - userId
  - name (e.g., "Marcus")
  - relationship (e.g., "Son") — optional
  - createdAt

environment_places
  - id
  - userId
  - name (e.g., "Master Bedroom")
  - type (e.g., "room", "vehicle", "location") — optional
  - createdAt

environment_things
  - id
  - userId
  - name (e.g., "2019 Honda Accord")
  - category (e.g., "vehicle", "equipment", "tool") — optional
  - createdAt
```

### Linking to Projects

```
project_environment
  - id
  - projectId (→ identity in PROJECT status)
  - entityType ("person" | "place" | "thing")
  - entityId (→ references the appropriate table)
```

---

## 7. Responsibilities

### Definition
Recurring chores and life maintenance tasks. These represent "what you're maintaining" — the current-life operational layer that exists regardless of your 5-year vision.

### Data Model

```
responsibilities
  - id
  - userId
  - name (from preset or custom, e.g., "Bathroom")
  - placeId (→ environment_places, optional)
  - thingId (→ environment_things, optional)
  - cadence ("daily" | "weekly" | "biweekly" | "monthly" | "custom")
  - dayOfWeek (for weekly/biweekly — e.g., "wednesday")
  - customCronExpr (for complex schedules — optional)
  - isPreset (boolean — distinguishes preset vs. user-created)
  - createdAt
```

### Display Label
- If placeId exists: "Bathroom — Master Bath"
- If thingId exists: "Auto — 2019 Honda Accord"
- Otherwise: just the name.

### Place Qualification Rules

**Always prompt for Place** (multi-instance — user likely has more than one):
- Bathroom, Bedroom, Auto, Office

**Optionally place-qualified** (usually one, but could be more):
- Kitchen, Living Room, Hallway/Foyer, Basement, Den, Yard, Decluttering/Organizing

**No place needed** (activity-based):
- Laundry (Wash, Dry, Fold, PutAway), Meal Prep/Planning, Grocery/Shopping, Trash/Recycling, Dishes, Pets, Plants/Garden, Mail/Paperwork, Errands, Residence, Misc

---

## 8. Roles

### Definition
Recurring commitments to specific people or groups. These represent "who you're showing up for" — relationship-oriented, not task-oriented.

### Data Model

```
roles
  - id
  - userId
  - name (e.g., "Help Marcus with homework")
  - description (optional detail)
  - cadence ("daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "custom")
  - dayOfWeek (optional)
  - createdAt

role_people
  - id
  - roleId (→ roles)
  - personId (→ environment_people)
```

### Key Design Notes
- A role can be tied to one person OR a group (multiple entries in role_people).
- Example single: "Help Marcus with homework" → Person: Marcus
- Example group: "Family dinner" → People: Marcus, Wife, Daughter
- People referenced here are the same People entities from the shared environment — created in projects, reused everywhere.

---

## 9. Daily Agenda

### Four Streams

The daily agenda shows all four streams for the current day:

| Stream | Source | Visual distinction | Example |
|--------|--------|--------------------|---------|
| **Routines** | Graduated identities (ROUTINE status) | Puzzle piece color | "Morning meditation" (purple/Reason) |
| **Tasks** | Active project steps (PROJECT status identities) | Project indicator | "Research meal prep containers" |
| **Responsibilities** | Recurring chores by cadence | Neutral/maintenance styling | "Bathroom — Master Bath" |
| **Roles** | Recurring people commitments by cadence | People indicator | "Help Marcus with homework" |

### Ordering
- **Default**: Chronological (if times are assigned to items).
- **Alternative views**: User can switch to grouped view (by stream), or other groupings.
- This is user-configurable.

### Where It Lives
See Section 10 (Morning Briefing) for the daily flow. The agenda is accessed after the briefing is processed.

---

## 10. Morning Briefing

### Concept
When the user opens the app each day, they see a brief "Here's what needs your attention" screen before proceeding to the daily agenda. This respects the "tie up loose ends" philosophy without locking the user out of the app.

### What appears in the Morning Briefing

| Item type | Description | Action |
|-----------|-------------|--------|
| **Draft identities** | Statements from the wizard awaiting review | Keep, edit, or remove → promote to PROJECT |
| **Graduation candidates** | Projects where all tasks are complete | Graduate to ROUTINE or keep as project |
| **Overdue tasks** | Project tasks past their due date | Reschedule, complete, or remove |
| **Stale projects** | Projects with no activity in X days | Revisit or archive |
| **Non-negotiable check-ins** | Periodic prompt to reflect on boundaries | Optional journaling |

### Flow
1. User opens app → Morning Briefing screen appears.
2. Outstanding items shown at top. User processes each (30 seconds to 2 minutes).
3. Items can be resolved or explicitly deferred ("I'll handle this later").
4. Once processed → user proceeds to daily agenda.
5. The rest of the app (Clarity, UnPuzzle, Weekly Review, Data) remains accessible from the nav at all times — the briefing is a soft gate, not a hard lock.

---

## 11. Non-Negotiables (Two-Layer Model)

> Terminology: "Non-negotiables" and "Boundaries" replace "Immutable Laws" in all user-facing UI. The database column/table can use `non_negotiables` or `boundaries`.

### Layer 1 — Global Non-Negotiables (per puzzle piece)

- Set during wizard Step 3, the first time each puzzle piece lens appears.
- One non-negotiable per piece, 5 total.
- Apply universally across all life areas.
- These are the spine — identity-level principles.

| Piece | Discovery prompt | Example |
|-------|-----------------|---------|
| Reason | "What principle do you refuse to violate, even when it costs you?" | "I always tell the truth, even when it's uncomfortable" |
| Finance | "What financial boundary do you never cross?" | "I never take on debt for consumption" |
| Fitness | "What physical standard is non-negotiable for you?" | "I never skip movement for 2 consecutive days" |
| Talent | "What standard do you hold for your growth?" | "I always finish what I commit to learning" |
| Pleasure | "What boundary protects your joy?" | "I never sacrifice rest for productivity" |

### Layer 2 — Area-Specific Non-Negotiables

- NOT part of onboarding — added post-onboarding on the Clarity page.
- Operationalize the global boundaries into specific contexts.
- Example: Global (Reason): "I always tell the truth" → Family-specific: "I never lie to my kids, even white lies to spare feelings."
- Discovery method: organic over time, prompted during Weekly Review ("Did anything happen this week that revealed a boundary you need to set in one of your areas?").

### Schema

```
non_negotiables
  - id
  - userId
  - puzzlePiece ("reason" | "finance" | "fitness" | "talent" | "pleasure")
  - statement (the boundary text)
  - areaId (NULL = global, populated = area-specific)
  - createdAt
  - updatedAt
```

---

## 12. Clarity Page (Post-Onboarding Home)

### Layout (top to bottom)

1. **Purpose banner** — tap-to-edit (already implemented)
2. **Life Area cards** — one per area, each containing:
   - Area name (immutable)
   - Vision text (tap-to-edit, already implemented)
   - Puzzle piece identity statements (showing status: draft / project / routine)
   - Area-specific non-negotiables section (expandable "Boundaries" section, tap-to-add, post-onboarding)
   - Snapshot history badge (already implemented)
   - Three-dot menu: Archive, Duplicate & Archive (already implemented)
3. **Add another area** (already implemented)

### Area-Specific Non-Negotiables UX
- Expandable "Boundaries" section on each area card.
- Tap to add a new area-specific non-negotiable.
- Each boundary optionally references which global non-negotiable it operationalizes.
- Not part of onboarding — surfaces naturally as the user lives with their visions.

---

## 13. UnPuzzle Hub Page

### Concept — The Complement to Clarity

The /unpuzzle page is the **vertical slice** view (by puzzle piece), while Clarity is the **horizontal slice** view (by life area).

- **Clarity asks**: "What does each area of my life look like?"
- **UnPuzzle asks**: "How is each piece of my framework showing up across my whole life?"

### Layout

The puzzle wheel remains the visual anchor. Each of the 5 pieces is tappable.

**Wheel view** (default):
- 5 puzzle pieces displayed as the wheel.
- Each piece shows aggregate status: how many identities are in draft / project / routine across all areas.
- Visual health indicator per piece (e.g., color intensity based on how many routines are active).

**Piece detail view** (tap a piece):
- **Global non-negotiable** at the top (the boundary for this piece).
- Below: every identity/routine/project that uses this lens, grouped by area.
  - Family → Reason identity: "I am someone who..." (status: ROUTINE ✓)
  - Career → Reason identity: "I am someone who..." (status: PROJECT — 3/5 tasks done)
  - Health → Reason identity: "I am someone who..." (status: DRAFT)
- This gives the user a cross-cutting view: "How am I doing with Reason across my whole life?"

---

## 14. Weekly Review

### Existing functionality preserved, with additions:

**New prompts**:
- "Did anything happen this week that revealed a boundary you need to set in one of your areas?" → Leads to area-specific non-negotiable creation.
- Alignment check: "Review your routines and projects — does everything still serve your vision?" → Michalowicz's weeding principle.
- Graduation check: "Any projects where the environment is ready? Consider graduating to a routine."

---

## 15. Preset Data

### Responsibility Presets (25 items)

| # | Name | Place-qualified |
|---|------|-----------------|
| 1 | Laundry-Wash | No |
| 2 | Laundry-Dry | No |
| 3 | Laundry-Fold | No |
| 4 | Laundry-PutAway | No |
| 5 | Kitchen | Optional |
| 6 | Meal Prep/Planning | No |
| 7 | Grocery/Shopping | No |
| 8 | Bathroom | Yes |
| 9 | Living Room | Optional |
| 10 | Bedroom | Yes |
| 11 | Hallway/Foyer | Optional |
| 12 | Office | Yes |
| 13 | Basement | Optional |
| 14 | Den | Optional |
| 15 | Auto | Yes |
| 16 | Yard | Optional |
| 17 | Residence | No |
| 18 | Trash/Recycling | No |
| 19 | Dishes | No |
| 20 | Pets | No |
| 21 | Plants/Garden | No |
| 22 | Mail/Paperwork | No |
| 23 | Errands | No |
| 24 | Decluttering/Organizing | Optional |
| 25 | Misc | No |

### Puzzle Piece Presets (unchanged)

| Key | Name | Color |
|-----|------|-------|
| reason | Reason | Purple |
| finance | Finance | Green |
| fitness | Fitness | Blue |
| talent | Talent | Yellow |
| pleasure | Pleasure | Red |

---

## 16. Attribution

### Approach — Inline + About Page

Credit is given in two non-distracting ways:

**1. Inline attribution** — Small, muted text below the section heading where each framework appears in the wizard. Shown once, then out of the way.

| Wizard step | Attribution text |
|-------------|-----------------|
| Step 2 (Airport Test) | *Inspired by The Airport Test from Pat Flynn's Will It Fly?* |
| Step 3 (Identity + Non-Negotiables) | *Identity framework inspired by James Clear's Atomic Habits. Boundaries inspired by Mike Michalowicz's The Pumpkin Plan.* |

**2. "Influences" section** — A dedicated section accessible from Settings or About, listing all three influences with book titles and a brief note on how each shaped the app.

---

## 17. Schema Changes Summary

### New Tables

| Table | Purpose |
|-------|---------|
| `environment_people` | Shared People entities (born in projects, reused in roles) |
| `environment_places` | Shared Places entities (born in projects, reused in responsibilities) |
| `environment_things` | Shared Things entities (born in projects, reused in responsibilities) |
| `project_environment` | Links projects to their environment entities |
| `responsibilities` | Recurring chores with cadence + optional place/thing |
| `roles` | Recurring people commitments with cadence |
| `role_people` | Links roles to people (supports groups) |
| `non_negotiables` | Both global (areaId=NULL) and area-specific boundaries |

### Modified Tables

| Table | Changes |
|-------|---------|
| `identities` | Add `status` column ("draft" \| "project" \| "routine"), add `areaId` (→ areas), add `puzzlePiece` (→ piece key) |
| `areas` | No longer tied to a fixed puzzle piece category — user-named freely. Remove `category` if it exists. |
| `purposes` | No changes (mission already removed) |

### Removed/Deprecated
- `mission` column on purposes — already removed (Option C, completed)
- Any fixed area-to-puzzle-piece mapping — areas are now user-defined
- `immutable_laws` table name → renamed to `non_negotiables`

---

## 18. Existing Rules (Preserved)

These decisions from prior sessions remain in effect:

- **Limited nav menu**: Dashboard → Clarity → UnPuzzle → Weekly Review → Data (intentional — no Inbox/Routine/Agenda additions to nav)
- **Back button**: Required on every page, using `window.history.back()` (not hardcoded paths)
- **Sidebar labels**: "Clarity" = Area Vision builder (/horizons), "UnPuzzle" = 5-piece puzzle wheel hub (/unpuzzle)
- **Puzzle piece colors**: purple=Reason, green=Finance, blue=Fitness, yellow=Talent, red=Pleasure — all keys LOWERCASE in DB
- **Dashboard first**: New users land on dashboard, not forced redirect to Clarity
- **Badge deep-linking**: ALL badges link to specific detail pages
- **Area names immutable**: To change a name, archive old and create new
- **Auth**: Admin and Users, email and password
- **Admin email**: tab@theesweetesttaboo.com
- **Tech stack**: React 18 + TypeScript + Tailwind CSS v4 + shadcn/ui + wouter v3 (hash routing) + TanStack Query + Express 5 + Drizzle ORM + better-sqlite3 + SQLite
- **Hosting**: Render Starter plan, 1GB disk at /opt/render/data

---

## Resolved Decisions Log

All open questions from v1 spec have been resolved:

| # | Question | Resolution |
|---|----------|------------|
| 1 | AI vs guided prompts for identity statements | Static guided prompts in onboarding (no AI). AI used only for project environment/task suggestions. |
| 2 | Daily Agenda ordering | Chronological by default, with option to view/group by stream or other dimensions. |
| 3 | Agenda as page vs dashboard | Morning Briefing pattern: user processes outstanding items first (soft gate), then proceeds to daily agenda. |
| 4 | Cadence UI | Specific-day picker, matching existing UI patterns for identity statements, routines, and tasks. |
| 5 | UnPuzzle hub evolution | Dual view: puzzle wheel as health dashboard (aggregate per piece) + piece detail view (cross-cutting: all identities using that lens, grouped by area, with global non-negotiable at top). Complement to Clarity's horizontal slice. |

---

*Last updated: April 19, 2026*
*Source conversations: April 12–19, 2026*
