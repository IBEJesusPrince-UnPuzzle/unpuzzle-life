// =============================================================================
// AgendaTaskViewModal — Phase 3c (PR #13)
// =============================================================================
// Google-style view-first sheet that opens when a user taps a calendar event
// chip or span bar. Replaces the previous "tap → straight into edit" flow.
//
// Locked scope (PR #13):
//   * Color swatch + bold title
//   * Date / time line for single-day timed events
//   * Date range line for multi-day all-day events
//   * "Repeats <freq>" line, only when recurrenceRule is set
//   * Top bar: X (top-left, dismiss) + pencil (top-right, → existing edit modal)
//
// Deferred for later releases (Google has them; we do not yet):
//   * 3-dot menu (Delete / Duplicate / Copy to)
//   * Reminders config
//   * Availability
//   * Calendar account row
//   * Guests / RSVP / invite links
//
// Edit transition (Google parity): tapping the pencil DISMISSES the view sheet
// and opens the existing edit modal as a fresh dialog. Pressing X on the edit
// modal returns the user to the calendar grid, not back to view.
//
// Implementation note: this file uses Radix primitives directly (rather than
// the shared `Dialog` wrapper) so it can ship a full bottom-sheet layout with
// a custom top-bar (X left, pencil right) without modifying the shared
// component used by every other modal in the app.
// =============================================================================

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import {
  formatTimeLabel,
  fromIsoDate,
} from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "./agenda-task-modal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AgendaWindowItem | null;
  // Pencil handler — parent dismisses the view sheet and opens the existing
  // edit modal with the same item.
  onEdit: (item: AgendaWindowItem) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Friendly long-form date, e.g. "Monday, May 4". */
function formatLongDate(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build the date / time line shown under the title.
 *
 *   single-day timed   →  "Monday, May 4 · 9:00 – 10:00 AM"
 *   single-day all-day →  "Monday, May 4"
 *   multi-day all-day  →  "Monday, May 4 – Friday, May 8"
 *
 * Multi-day timed rows are not produced by the schema (timed events are
 * single-day only), so we don't need a code path for them.
 */
function formatWhen(item: AgendaWindowItem): string {
  const startLong = formatLongDate(item.date);

  // Multi-day all-day — only when endDate is present and after date.
  if (
    item.isAllDay &&
    item.endDate &&
    item.endDate !== item.date
  ) {
    return `${startLong} \u2013 ${formatLongDate(item.endDate)}`;
  }

  // Single-day all-day.
  if (item.isAllDay) {
    return startLong;
  }

  // Timed.
  if (item.time) {
    const [hh, mm] = item.time.split(":").map(Number);
    const startMin = hh * 60 + mm;
    const endMin = startMin + (item.durationMinutes ?? 0);
    const start = formatTimeLabel(startMin);
    const end = formatTimeLabel(endMin);
    return `${startLong} \u00b7 ${start} \u2013 ${end}`;
  }

  return startLong;
}

/**
 * Pull a friendly recurrence label from an iCal-style RRULE string.
 *   FREQ=DAILY    → "Repeats daily"
 *   FREQ=WEEKLY   → "Repeats weekly"
 *   FREQ=MONTHLY  → "Repeats monthly"
 *   FREQ=YEARLY   → "Repeats yearly"
 * Anything we can't parse falls back to a generic label.
 */
function formatRecurrence(rule: string | null | undefined): string | null {
  if (!rule) return null;
  const m = rule.match(/FREQ=([A-Z]+)/i);
  if (!m) return "Repeats";
  const freq = m[1].toUpperCase();
  switch (freq) {
    case "DAILY":
      return "Repeats daily";
    case "WEEKLY":
      return "Repeats weekly";
    case "MONTHLY":
      return "Repeats monthly";
    case "YEARLY":
      return "Repeats yearly";
    default:
      return "Repeats";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgendaTaskViewModal({
  open,
  onOpenChange,
  item,
  onEdit,
}: Props) {
  if (!item) return null;

  // Honor the row's stored hex directly so the view-modal swatch matches
  // the chip color the user actually saw in the grid (no palette mapping).
  const swatchHex = item.color || DEFAULT_AGENDA_COLOR_HEX;
  const titleText = item.title?.trim() || "(untitled)";
  const whenLine = formatWhen(item);
  const recurrenceLine = formatRecurrence(item.recurrenceRule);

  function handleEdit() {
    if (!item) return;
    // Close the view sheet first so the edit modal opens cleanly on top of
    // the calendar (Google parity — clean swap, no stacked sheets).
    onOpenChange(false);
    onEdit(item);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          data-testid="agenda-view-modal"
          // Full bottom-sheet on mobile; centered card on >= sm screens.
          // On mobile the sheet pins to the bottom and fills 85vh; on sm+
          // it floats centered with a max-height.
          className={cn(
            "fixed z-50 bg-background border shadow-lg",
            // Mobile: pinned bottom, full width, 85vh tall, top-only rounded
            "left-0 right-0 bottom-0 h-[85vh]",
            "rounded-t-2xl",
            // sm+: centered card
            "sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:right-auto",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md sm:h-auto sm:max-h-[85vh]",
            "sm:rounded-2xl",
            // Slide-up animation on mobile, fade+zoom on desktop
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
            "duration-200",
            // Layout
            "flex flex-col",
          )}
        >
          {/* Top bar: X (left) · pencil (right). */}
          <div className="flex items-center justify-between p-2 shrink-0">
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                data-testid="button-view-close"
                className="h-9 w-9"
              >
                <X className="w-5 h-5" />
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              aria-label="Edit"
              data-testid="button-view-edit"
              className="h-9 w-9"
            >
              <Pencil className="w-5 h-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="px-5 pb-6 flex-1 overflow-y-auto">
            {/* Title row: color swatch + bold title */}
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-5 h-5 rounded-sm shrink-0 mt-2"
                style={{ backgroundColor: swatchHex }}
                aria-hidden="true"
              />
              <DialogPrimitive.Title
                className="text-2xl font-semibold leading-tight break-words"
                data-testid="text-view-title"
              >
                {titleText}
              </DialogPrimitive.Title>
            </div>

            {/* Date / time line */}
            <div
              className="text-sm text-foreground ml-8"
              data-testid="text-view-when"
            >
              {whenLine}
            </div>

            {/* Recurrence line — only when set */}
            {recurrenceLine && (
              <div
                className="text-sm text-muted-foreground ml-8 mt-1"
                data-testid="text-view-recurrence"
              >
                {recurrenceLine}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
