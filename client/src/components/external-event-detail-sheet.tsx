import { CalendarDays, MapPin, AlignLeft, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import { formatDateContextLabel, formatTimeLabel, timeToMinutes } from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

// Build the best possible link to view a specific event in its source calendar.
// Google's eid deep-linking is unreliable. Instead, we link to the calendar at
// the specific date of the event, so the user can at least see the event on that day.
function calendarEventUrl(
  uid: string | null | undefined,
  calendarUrl: string | null | undefined,
  startDate?: string
): string | null {
  try {
    // For Google Calendar events, link to the specific date
    if (uid?.endsWith("@google.com") && startDate) {
      // Parse YYYY-MM-DD and convert to YYYYMMDD format for Google Calendar date param
      const [year, month, day] = startDate.split("-");
      if (year && month && day) {
        // Use the /day/ view path which is more reliable than query params
        return `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;
      }
    }
    if (calendarUrl) {
      const u = new URL(calendarUrl);
      if (u.hostname.includes("google.com")) {
        return "https://calendar.google.com/calendar";
      }
      return calendarUrl;
    }
    return null;
  } catch {
    return calendarUrl ?? null;
  }
}

type Props = {
  item: AgendaWindowItem | null;
  onClose: () => void;
};

export function ExternalEventDetailSheet({ item, onClose }: Props) {
  const open = item !== null;

  const c = item ? findColor(item.color) : null;
  const fg = c ? pickContrastingText(c.hex) : "#fff";

  const startMin = item?.time ? timeToMinutes(item.time) ?? 0 : null;
  const endMin = (item as any)?.endTime ? timeToMinutes((item as any).endTime) ?? 0 : null;

  const timeLabel =
    startMin !== null
      ? endMin !== null && endMin > startMin
        ? `${formatTimeLabel(startMin)} – ${formatTimeLabel(endMin)}`
        : formatTimeLabel(startMin)
      : "All day";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-0">
        {item && c && (
          <>
            {/* Colour header band */}
            <div
              className="px-5 pt-5 pb-4"
              style={{ backgroundColor: c.hex }}
            >
              <SheetHeader>
                <SheetTitle
                  className="text-xl font-semibold leading-snug break-words"
                  style={{ color: fg }}
                >
                  {item.title || "(untitled)"}
                </SheetTitle>
              </SheetHeader>
              {(item as any).calendarName && (
                <p className="text-xs mt-1 opacity-80" style={{ color: fg }}>
                  {(item as any).calendarName}
                </p>
              )}
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3">
              {/* Date + time */}
              <div className="flex items-start gap-3">
                <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="text-sm">
                  <p>{formatDateContextLabel(item.startDate)}</p>
                  <p className="text-muted-foreground">{timeLabel}</p>
                </div>
              </div>

              {/* Location */}
              {(item as any).location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm">{(item as any).location}</p>
                </div>
              )}

              {/* Description */}
              {(item as any).description && (
                <div className="flex items-start gap-3">
                  <AlignLeft className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm whitespace-pre-wrap">{(item as any).description}</p>
                </div>
              )}

              {/* Read-only notice + source link */}
              <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground border-t">
                <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span>From external calendar — read only</span>
                  {calendarEventUrl(item.uid, item.calendarUrl, item.startDate) && (
                    <a
                      href={calendarEventUrl(item.uid, item.calendarUrl, item.startDate)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-0.5 underline text-primary"
                    >
                      {item.uid?.endsWith("@google.com")
                        ? "View in Google Calendar"
                        : "Open in source calendar"}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
