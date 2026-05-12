// §20 LOCKED: chip color is set at the scheduling entry point and persists
// per-instance for project tasks / standalone tasks, per-responsibility for
// recurring responsibilities. Decision (Phase 3a): ship Google Calendar's
// 11-color palette so chip vocabulary lines up with the spec ASCII
// references ("banana", "peacock", "purple", etc.).

export type AgendaColor = {
  /** stable internal id, stored on the row */
  id: string;
  /** human label shown in the picker */
  label: string;
  /** hex value persisted in agenda_tasks.color / responsibilities.color */
  hex: string;
  /** soft tint hex used for Day-view card backgrounds and Month tap-day overlay rows */
  softHex: string;
};

export const AGENDA_PALETTE: AgendaColor[] = [
  { id: "tomato",    label: "Tomato",    hex: "#D50000", softHex: "#F8D7D7" },
  { id: "flamingo",  label: "Flamingo",  hex: "#E67C73", softHex: "#FADCD9" },
  { id: "tangerine", label: "Tangerine", hex: "#F4511E", softHex: "#FBD8C9" },
  { id: "banana",    label: "Banana",    hex: "#F6BF26", softHex: "#FCEDC2" },
  { id: "sage",      label: "Sage",      hex: "#33B679", softHex: "#CFEBD7" },
  { id: "basil",     label: "Basil",     hex: "#0B8043", softHex: "#C7E1CB" },
  { id: "peacock",   label: "Peacock",   hex: "#039BE5", softHex: "#C7E5F4" },
  { id: "blueberry", label: "Blueberry", hex: "#3F51B5", softHex: "#D2D6EC" },
  { id: "lavender",  label: "Lavender",  hex: "#7986CB", softHex: "#DDE0EE" },
  { id: "grape",     label: "Grape",     hex: "#8E24AA", softHex: "#E2CEE9" },
  { id: "graphite",  label: "Graphite",  hex: "#616161", softHex: "#D7D7D7" },
];

export const DEFAULT_AGENDA_COLOR_HEX = "#039BE5"; // Peacock

/** Find palette entry by hex; falls back to graphite on miss. */
export function findColor(hex?: string | null): AgendaColor {
  if (!hex) return AGENDA_PALETTE[AGENDA_PALETTE.length - 1];
  const lower = hex.toLowerCase();
  return (
    AGENDA_PALETTE.find((c) => c.hex.toLowerCase() === lower) ??
    AGENDA_PALETTE[AGENDA_PALETTE.length - 1]
  );
}

/**
 * PR #41 — picks a foreground color (near-black or near-white) that has
 * enough contrast against the given hex background. Used by every chip
 * surface that now ships with solid-fill backgrounds (Day / 3-Day / Week
 * timed chips, Month tiny chips, all-day band, month-day-overlay rows,
 * Schedule chips).
 *
 * Heuristic: perceptual luminance, threshold 0.65. Banana lands above
 * the line and gets dark text; every other palette entry gets white.
 * Matches Google Calendar's behavior on the same palette.
 */
export function pickContrastingText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.65 ? "#1f1f1f" : "#ffffff";
}
