# Phase 2: Wizard Rewrite — Implementation Instructions

## Overview
Rewrite `client/src/pages/wizard.tsx` to implement a 4-step guided onboarding flow per the v2 spec (`docs/v2-spec.md`). The wizard state table already tracks `currentPhase` (1-4). The backend routes and tables from Phase 1 are in place.

## CRITICAL RULES
- Back button on every sub-page uses `window.history.back()` (NOT hardcoded paths)
- Puzzle piece keys are ALWAYS lowercase: reason, finance, fitness, talent, pleasure
- Puzzle piece colors: purple=reason, green=finance, blue=fitness, yellow=talent, red=pleasure (use the EXISTING `client/src/lib/piece-colors.ts` for color mapping)
- Area names are immutable once created
- ALL API calls use the EXISTING `apiRequest` helper from `@/lib/queryClient`
- Use EXISTING shadcn/ui components in `client/src/components/ui/`
- Keep the wizard as a self-contained page at `/wizard` route
- The wizard uses the existing `wizardState` table — `currentPhase` should go 1-4 now (was 1-3)
- Update `server/routes.ts` PATCH `/api/wizard-state` if needed to allow phase 4
- Must update `server/storage.ts` `wizardState` CREATE TABLE to allow `currentPhase` up to 4

## Step 1 — Purpose
**Route**: Phase 1 of wizard

**UX**:
- Simple textarea with guided prompt
- Prompt label: "What is your life's purpose?"
- Placeholder: "e.g. To live with integrity, create joy for my family, and leave the world better than I found it..."
- Helper text below: "Your purpose is the big-picture why behind everything you do."
- "Next" button saves purpose via `POST /api/purposes` and advances to Step 2

**Behavior**:
- If user already has a purpose (from prior wizard attempt), pre-fill it
- "Next" is disabled if textarea is empty
- Existing Phase1Purpose component can be adapted

## Step 2 — The Airport Test (Areas + Visions)
**Route**: Phase 2 of wizard

**Attribution**: Small muted text below section heading:
> *Inspired by The Airport Test from Pat Flynn's Will It Fly?*

**Narrative flow**:
1. Scene-setting card at top (not dismissable, always visible):
   "Imagine you've traveled 5 years into the future. You're at the airport and run into an old friend. They ask how life is going. You say: 'AMAZING! Life couldn't get any better.'"

2. First prompt: "Your friend says, 'Tell me more! What's the first thing that comes to mind?' What area of your life is amazing, and what does that look like?"
   - Input: area name (short label, e.g. "Family") 
   - Input: vision textarea (longer narrative)
   - "Add this area" button creates the area with vision via `POST /api/areas` (include `visionText` in the body)

3. After first area added, show follow-up prompt: "What else is going on that's so great?"
   - Same input pattern: area name + vision text
   - Each saved area shows as a card below

4. Continue: "Keep going — what else?" — repeat until user clicks "I'm done" or "Next"

5. Show all created areas as cards (area name + vision preview)
   - User can edit/delete before proceeding
   - Minimum 1 area required to proceed

**Key design notes**:
- Tone is conversational and journaling-style, NOT form-filling
- Each area entry gets BOTH a name and a vision narrative
- Areas saved via `POST /api/areas` with `{ name, visionText, sortOrder }`
- "Next" advances to Step 3

## Step 3 — Puzzle Piece Breakdown + Global Non-Negotiables
**Route**: Phase 3 of wizard

**Attribution**: Small muted text:
> *Identity framework inspired by James Clear's Atomic Habits. Boundaries inspired by Mike Michalowicz's The Pumpkin Plan.*

**UX Flow**:

Process each area from Step 2, one at a time. For each area:

1. Show the area name and vision text at the top as context
2. Walk through EACH of the 5 puzzle pieces with fill-in-the-blank prompts:

**For each puzzle piece (in order: reason, finance, fitness, talent, pleasure)**:

a. Show the piece name with its color indicator
b. Show the identity prompt specific to this piece+area:
   - Reason: "Looking at your [Area] vision through the Reason lens — why does this matter to your identity? Complete this: 'I am someone who _______ when it comes to my principles and my [Area].'"
   - Finance: "What financial reality supports this [Area] vision? 'I am someone who _______ when it comes to money and my [Area].'"
   - Fitness: "How does your physical self support this [Area] vision? 'I am someone who _______ when it comes to health/fitness and my [Area].'"
   - Talent: "What skills or growth support this [Area] vision? 'I am someone who _______ when it comes to growth/skill and my [Area].'"
   - Pleasure: "What joy and fulfillment come from this [Area] vision? 'I am someone who _______ when it comes to enjoyment and my [Area].'"

c. User types the identity statement (just the blank part, UI prepends "I am someone who")
d. Save via `POST /api/identities` with:
   ```json
   {
     "statement": "<user text>",
     "areaId": <area.id>,
     "puzzlePiece": "<piece key lowercase>",
     "status": "draft",
     "cue": "",
     "craving": "",
     "response": "",
     "reward": "",
     "frequency": "daily",
     "timeOfDay": "",
     "location": "",
     "createdAt": "<ISO string>"
   }
   ```
   Note: cue, craving, response, reward, timeOfDay, location are required by the schema but not used in onboarding — send empty strings.

e. **FIRST TIME each piece appears** (only during Area 1): Also prompt for the global non-negotiable:
   - Reason: "What principle do you refuse to violate, even when it costs you?"
   - Finance: "What financial boundary do you never cross?"
   - Fitness: "What physical standard is non-negotiable for you?"
   - Talent: "What standard do you hold for your growth?"
   - Pleasure: "What boundary protects your joy?"
   
   Save via `POST /api/non-negotiables` with:
   ```json
   {
     "puzzlePiece": "<piece key>",
     "statement": "<user text>",
     "areaId": null,
     "createdAt": "<ISO string>"
   }
   ```
   Note: `areaId` should be sent as `null` for global non-negotiables. The backend route accepts `areaId` as nullable.

f. For subsequent areas (Area 2+): Show the already-set global non-negotiable as context:
   "Here's your [Piece] non-negotiable: '[statement]'. How does [Piece] shape your [Area] vision?"
   Then just the identity statement prompt (no non-negotiable prompt).

**Navigation within Step 3**:
- Process one piece at a time within one area
- "Next piece" moves to next puzzle piece
- After all 5 pieces for an area → "Next area" moves to next area
- After all areas → "Next" advances to Step 4
- Progress indicator showing: Area X of Y, Piece Z of 5

## Step 4 — Responsibilities & Roles
**Route**: Phase 4 of wizard

**Transition text at top**:
"Your vision defines who you're becoming. But life also has things you're maintaining and people you're showing up for right now. Let's capture those so nothing falls through the cracks."

### Responsibilities Section

**Preset chore dropdown** (25 items — show as a multi-select checklist):
```
Laundry-Wash, Laundry-Dry, Laundry-Fold, Laundry-PutAway,
Kitchen, Meal Prep/Planning, Grocery/Shopping, Bathroom,
Living Room, Bedroom, Hallway/Foyer, Office, Basement, Den,
Auto, Yard, Residence, Trash/Recycling, Dishes, Pets,
Plants/Garden, Mail/Paperwork, Errands, Decluttering/Organizing, Misc
```

- User checks presets they want
- "Add custom" button for user-created responsibilities
- For place-qualified chores (Bathroom, Bedroom, Auto, Office — ALWAYS prompt; Kitchen, Living Room, Hallway/Foyer, Basement, Den, Yard, Decluttering/Organizing — OPTIONALLY prompt), show a Place input:
  - Combobox: existing places from `GET /api/environment/places` + "Create new" option
  - If creating new: inline input for place name
  - Save place via `POST /api/environment/places` with `{ name, type: "room", createdAt }`
- Each responsibility needs a cadence picker: daily, weekly, biweekly, monthly
  - If weekly/biweekly: also pick a day of week
- Save each via `POST /api/responsibilities` with `{ name, placeId, cadence, dayOfWeek, isPreset, createdAt }`

### Roles Section

**Prompt**: "Who are the people you show up for regularly?"

- User creates role entries:
  - Role name/description (e.g., "Help Marcus with homework")
  - Person picker: combobox from `GET /api/environment/people` + "Create new"
    - New person: inline input for name + optional relationship
    - Save via `POST /api/environment/people` with `{ name, relationship, createdAt }`
  - Cadence picker: daily, weekdays, weekly, biweekly, monthly
  - Optional day of week
- Save role via `POST /api/roles` with `{ name, description, cadence, dayOfWeek, createdAt }`
- Link person via `POST /api/roles/:id/people` with `{ personId }`

### Completion
- "Complete Puzzle" button at bottom
- Calls `POST /api/wizard/complete`
- Navigates to dashboard

## Technical Notes

### Wizard State
- The wizard already has a `wizardState` table with `currentPhase` and `completed`
- `PATCH /api/wizard-state` saves progress
- `POST /api/wizard/complete` marks as done
- Pre-load existing data when returning to a step (purposes, areas, identities, etc.)

### Component Structure
Replace the current wizard.tsx entirely. Suggested structure:
```
WizardPage (main, manages phase state)
  ├── WizardProgressBar (4 steps)
  ├── Step1Purpose
  ├── Step2AirportTest
  │     ├── AirportSceneCard
  │     └── AreaEntryForm (repeatable)
  ├── Step3PuzzleBreakdown
  │     ├── AreaPieceWalker (iterates areas × pieces)
  │     ├── IdentityPrompt
  │     └── NonNegotiablePrompt (first-time only)
  └── Step4ResponsibilitiesRoles
        ├── ResponsibilitySelector
        │     ├── PresetChecklist
        │     ├── CadencePicker
        │     └── PlaceCombobox
        └── RoleCreator
              ├── PersonCombobox
              └── CadencePicker
```

### Styling
- Keep the amber/gold wizard theme from current implementation
- Use puzzle piece colors (from `piece-colors.ts`) for Step 3 piece indicators
- Conversational, warm tone — this is a guided journey, not a form
- Mobile-first, max-w-2xl centered content
- Bottom-fixed navigation bar with Back/Next buttons (existing pattern)

### Import Link
Keep the existing "or import existing data →" link on Step 1 that points to /import route.
