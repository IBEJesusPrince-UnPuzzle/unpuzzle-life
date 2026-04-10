// TIME_OF_DAY_CATEGORIES — shared constant used by wizard.tsx and horizons.tsx
// Now delegates to the format-aware getTimeOfDayRanges from time-format.ts
import { getTimeOfDayRanges } from "@/lib/time-format";

// Default export for backwards compatibility (12h format)
export const TIME_OF_DAY_CATEGORIES = getTimeOfDayRanges("12h");

// Format-aware version
export function getTimeOfDayCategoriesForFormat(format: "12h" | "24h") {
  return getTimeOfDayRanges(format);
}
