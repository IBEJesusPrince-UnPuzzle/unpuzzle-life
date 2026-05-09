// =============================================================================
// duration.ts — Shared duration helpers (PR #19)
// =============================================================================
// Extracted from agenda-task-modal.tsx during PR #19 so the responsibility
// edit Schedule card can reuse the same parse/format rules without
// importing from a sibling component.
//
// parseDuration(min)        — minutes -> { value, unit } for the inline input
// durationToMinutes(v, u)   — input value/unit -> minutes (or null if invalid)
//
// Behavior is intentionally identical to the prior inline helpers; the
// modal now imports from here. Any future change must be made in one
// place so the agenda modal and the responsibility schedule card stay
// consistent.
// =============================================================================

export type DurationUnit = "min" | "hr";

// Convert minutes to a friendly value/unit pair for the duration input.
// Default is 30 min (matches the agenda task modal's create-default).
export function parseDuration(min: number | null | undefined): {
  value: string;
  unit: DurationUnit;
} {
  if (!min || min <= 0) return { value: "30", unit: "min" };
  if (min % 60 === 0) return { value: String(min / 60), unit: "hr" };
  return { value: String(min), unit: "min" };
}

export function durationToMinutes(value: string, unit: DurationUnit): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "hr" ? Math.round(n * 60) : Math.round(n);
}
