# Clarity Portal — Design Doc

This document specifies the ritual, voice, and wizard flow for the Clarity Portal. It is the source of truth for the re-entry ritual thresholds, the wizard phases, and the locked voice elements.

---

## 1. Re-entry Ritual — Graded Thresholds

The re-entry ritual is no longer a single binary (show / don't show). It is a 4-tier graded system tuned to how long the user has been away and whether this is a new browser session.

### Thresholds

| Away for… | Treatment |
|---|---|
| < 2 min | No ritual. Silent resume. |
| 2–30 min | Mini ritual (~3s). Two lines: "Welcome back." + "You were here: {piece}" |
| 30 min – 4 hr | Full ritual. Piece gradient fade-in, "Welcome back. Step in." + "You were here: {piece}" with a 1.5s breath. |
| New session OR > 4 hr | Full ritual + session cue: "Welcome back. Step in." + "You were here {timeAgo}: {piece}" (e.g., "yesterday evening", "Tuesday") |

### Why graded — research basis

- **~23 minutes to regain full focus after an interruption** (Gloria Mark, UC Irvine). The 2–30 min tier straddles this window — short enough that a heavy ritual would feel patronizing, long enough that a silent resume would drop the user back into cold context. A mini ritual marks the re-entry without interrupting flow. ([source](https://addyo.substack.com/p/it-takes-23-mins-to-recover-after))
- **82% of interrupted work is resumed the same day.** This justifies the new-session distinction rather than a pure time-based cutoff: crossing a session boundary (tab closed, browser quit) is a stronger signal of cognitive reset than elapsed minutes alone. ([same source](https://addyo.substack.com/p/it-takes-23-mins-to-recover-after))
- **Attention residue is stronger for complex tasks.** Clarity work is high-stakes and identity-adjacent, so residue from the prior session is meaningful — the full ritual's 1.5s breath is a deliberate clearing gesture. ([Brandon White summary](https://brandoncwhite.com/productivity/how-long-it-takes-to-get-back-to-your-work-after-being-interrupted-the-research-is-surprising/))
- **Resumption lag scales with interruption duration.** Longer gaps produce disproportionately longer re-orientation times, which supports the 30 min and 4 hr step-ups rather than a linear ramp. ([Frontiers in Psychology](https://pmc.ncbi.nlm.nih.gov/articles/PMC8247645/))
- **"Ready-to-resume" interventions reduce attention residue.** Explicitly naming where the user was ("You were here: {piece}") is the ready-to-resume cue — it short-circuits the search for context. ([U Minnesota 2018](https://experts.umn.edu/en/publications/tasks-interrupted-how-anticipating-time-pressure-on-resumption-of/))

### Implementation note

Combined approach using `sessionStorage` (cleared when the tab/browser closes) + `localStorage` timestamp. On entry:

- If `sessionStorage.clarityActiveThisSession` is missing → **new session** → full ritual + session cue
- Else compute `now - localStorage.lastClarityExit` and pick the tier from the table above
- Set `sessionStorage.clarityActiveThisSession = true` on entry
- Update `localStorage.lastClarityExit` on exit

~15 lines of code total. No server round-trip required — the decision is made client-side at mount.

---

## 2. Wizard Phase 1 — Purpose

Entry prompt, shown before any input fields:

> *"Before we begin, let's take a deep breath."*

This primes the user for the visualization phase that follows and sets the tempo of the portal — slow, deliberate, interior.

---

## 3. Wizard Phase 2 — Airport Test (Visualization)

**Important clarification — this is the Visualization phase, not the Lens phase.** Previous drafts of this doc conflated the two by attaching per-Lens prompts (Reason/Finance/Fitness/Talent/Pleasure/Family/Custom) to the Airport Test. That was wrong. Those per-Lens prompts are removed and replaced with the structure below.

To be unambiguous:

- The **Airport Test** is one holistic moment. A **good friend** — not a stranger in an airport lounge — leans in and asks about the user's amazing life.
- The user names **their own areas** in their own words (e.g., Family, Travel, Business, Health). They are not picking from a menu.
- The **Lenses** (Reason, Finance, Fitness, Talent, Pleasure, + custom) are the fixed dimensions the app uses to organize and track life. The Lens phase comes **after** visualization and is applied to the picture the user has already painted. The Lenses structure the work; they do not structure the dream.

### Opening prompt (shown once at the start of Phase 2)

> "Close your eyes for a moment. A good friend — someone who truly wants the best for you — leans in and asks: 'Tell me about your amazing life. What does it look like?'
>
> Paint the picture. Name an area of your life, then tell them how amazing it is. Add another. And another. Use your own words."

### Per-area micro-prompts

- **Area 1 — Name field:** "What's the first area of your amazing life?" *(placeholder: e.g., Family, Travel, Business, Health…)*
- **Area 1 — Detail field:** "Tell your friend how amazing {areaName} is. What do they see? What do you feel?"
- **Area 2+ — Name field:** "What's another area of your amazing life?"
- **Area 2+ — Detail field:** "And {areaName}? Paint that picture too."

### Continue / finish cue

> "Add another area, or when the picture feels complete, step forward."

### Notes on the voice choices

- **"Close your eyes for a moment"** nods to Joseph Murphy's sleepy-drowsy state — dropping the rational guard so the user paints from the subconscious rather than from a to-do list.
- **"Your own words"** is an explicit signal that this is NOT the Lens phase. The user is not categorizing; they are naming.
- **Per-area detail reuses `{areaName}`** so the prompt feels personal — it echoes back the word the user just typed.
- **"Step forward"** is the phase-exit verb, chosen to rhyme with **"Step in."** from the re-entry ritual. Same voice, consistent across the portal.

---

## 4. Locked elements (verified — no changes)

The following are confirmed locked. They are listed here so future edits do not accidentally reopen them.

- **Ritual text voice:** "Welcome back." / "Step in." / "You were here: {X}"
- **10-second auto-advance timer** on ritual screens
- **Piece colors:**
  - Reason = purple
  - Finance = green
  - Fitness = blue
  - Talent = yellow
  - Pleasure = red
- **"Seen. Saved."** affirmation on save
- **/horizons overview:** keep existing card grid (no changes)
