// AgendaChipContent — PR #39
//
// Renders the per-chip content (title, sublines, time+duration, place)
// for Day / 3-Day / Week views. The same component drives all three views
// so layout is structurally identical and only the surrounding chip
// dimensions differ (Day/3-Day/Week control width + height via the parent
// laning math).
//
// Locked structure (agenda-grid-chip-layout-spec):
//   Responsibility chip
//     ▇ Responsibility Name
//       as <role(s) comma-separated>
//       <time>  ·  <duration>
//       @ <place>
//
//   Standalone task chip
//     ▇ Task Name
//       as <role(s) comma-separated>     ← omitted when no role
//       <time>  ·  <duration>
//       @ <place>
//
//   Project task chip
//     ▇ Task Name
//       to <project>
//       for <responsibility(ies) comma-separated>
//       <time>  ·  <duration>
//       @ <place>
//
// Each line is a single CSS line (no wrapping) with text-overflow ellipsis,
// inside a chip that uses overflow:hidden. Whatever fits visually, fits —
// there's no JS-side line-priority hide order. Lines near the bottom get
// clipped by the chip's bounding box.
//
// Color: title uses the row's strong-tint color; sublines use a muted
// foreground so the title remains the visual anchor.

import { formatTimeLabel, formatDurationLabel } from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

/**
 * Density tier — affects font sizes, not the structural layout. The
 * structural layout (which lines render) is identical across all three.
 *   - "day"    : Day view, widest column, large-ish text
 *   - "3day"   : 3-Day, narrower column, slightly smaller
 *   - "week"   : Week, narrowest column, smallest
 */
export type ChipDensity = "day" | "3day" | "week";

interface ChipContentProps {
  item: AgendaWindowItem;
  /**
   * Visible start/end (minutes from midnight) for this occurrence. Used
   * to render the "time · duration" line in the chip. We accept these
   * rather than reading item.time directly because the lane-pack output
   * already computed inflated visual bounds; the calling view passes the
   * authoritative numbers.
   */
  startMin: number;
  endMin: number;
  /** Hex color for the chip title text (strong tint). */
  titleHex: string;
  density: ChipDensity;
}

/**
 * Returns the chip sublines for a given item, in the locked order. Each
 * entry is rendered on its own line; empty/null entries are skipped.
 */
function getChipSublines(item: AgendaWindowItem): string[] {
  const roleNames = item.roleNames ?? [];
  const responsibilityNames = item.responsibilityNames ?? [];
  const projectName = item.projectName ?? null;

  switch (item.origin) {
    case "responsibility": {
      // "as <role(s) comma-separated>"
      if (roleNames.length === 0) return [];
      return [`as ${roleNames.join(", ")}`];
    }
    case "project": {
      // "to <project>" then "for <responsibility(ies) comma-separated>"
      const lines: string[] = [];
      if (projectName) lines.push(`to ${projectName}`);
      if (responsibilityNames.length > 0) {
        lines.push(`for ${responsibilityNames.join(", ")}`);
      }
      return lines;
    }
    case "standalone": {
      // "as <role(s) comma-separated>", omitted when no role
      if (roleNames.length === 0) return [];
      return [`as ${roleNames.join(", ")}`];
    }
    default:
      return [];
  }
}

// Density-tier font sizes. Kept small numbers so even on Week (the
// tightest column) the title remains legible at the default zoom.
const densitySizes: Record<ChipDensity, { title: string; meta: string }> = {
  day: { title: "text-xs", meta: "text-[10px]" },
  "3day": { title: "text-[11px]", meta: "text-[9px]" },
  week: { title: "text-[10px]", meta: "text-[9px]" },
};

export function AgendaChipContent({
  item,
  startMin,
  endMin,
  titleHex,
  density,
}: ChipContentProps) {
  const sublines = getChipSublines(item);
  const placeName = item.placeName ?? null;
  const duration = Math.max(0, endMin - startMin);
  const sizes = densitySizes[density];

  return (
    <div className="px-2 py-1 leading-tight">
      <div
        className={`${sizes.title} font-semibold truncate`}
        style={{ color: titleHex }}
        data-testid="chip-title"
      >
        {item.title || "(untitled)"}
      </div>

      {sublines.map((line, i) => (
        <div
          key={i}
          className={`${sizes.meta} text-muted-foreground truncate mt-0.5`}
          data-testid={`chip-subline-${i}`}
        >
          {line}
        </div>
      ))}

      <div
        className={`${sizes.meta} text-muted-foreground tabular-nums truncate mt-0.5`}
        data-testid="chip-time"
      >
        {formatTimeLabel(startMin)}
        {duration > 0 ? ` · ${formatDurationLabel(duration)}` : ""}
      </div>

      {placeName ? (
        <div
          className={`${sizes.meta} text-muted-foreground truncate mt-0.5`}
          data-testid="chip-place"
        >
          @ {placeName}
        </div>
      ) : null}
    </div>
  );
}
