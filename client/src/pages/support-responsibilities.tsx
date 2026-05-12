// /support/responsibilities — full Responsibilities list.
//
// Mirrors /support/roles. Tapping a row opens /responsibilities/:id
// (the existing locked view page). [+] navigates to /responsibilities/new.
//
// Each row shows:
//   • Title
//   • Linked role count + (if scheduled) schedule summary, joined by " · "
//
// The schedule summary comes from the responsibility's recurrenceRule which
// the server keeps in sync with the master agenda_tasks row, so we can
// render it straight off the /api/responsibilities payload — no per-row
// follow-up fetch.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useMemo } from "react";
import type { Responsibility, ResponsibilityRole } from "@shared/schema";

/**
 * Stringify an RRULE into a short human-friendly cadence (e.g. "Daily",
 * "Weekly · Mon, Wed, Fri", "Monthly"). Returns null when the rule is
 * empty or unparseable enough to bother showing.
 */
function formatScheduleSummary(rule: string | null | undefined): string | null {
  if (!rule) return null;
  const freqMatch = rule.match(/FREQ=([A-Z]+)/i);
  if (!freqMatch) return "Repeats";
  const freq = freqMatch[1].toUpperCase();
  if (freq === "WEEKLY") {
    const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/i);
    if (byDayMatch) {
      const map: Record<string, string> = {
        MO: "Mon",
        TU: "Tue",
        WE: "Wed",
        TH: "Thu",
        FR: "Fri",
        SA: "Sat",
        SU: "Sun",
      };
      const days = byDayMatch[1]
        .split(",")
        .map((d) => map[d.trim().toUpperCase()])
        .filter(Boolean);
      if (days.length) return `Weekly · ${days.join(", ")}`;
    }
    return "Weekly";
  }
  switch (freq) {
    case "DAILY":
      return "Daily";
    case "MONTHLY":
      return "Monthly";
    case "YEARLY":
      return "Yearly";
    default:
      return "Repeats";
  }
}

export default function SupportResponsibilitiesPage() {
  const [, setLocation] = useLocation();

  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
  });
  const { data: respRoleLinks = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: ["/api/responsibility-roles"],
  });

  // responsibilityId → number of linked roles
  const roleCountByResp = useMemo(() => {
    const counts = new Map<number, number>();
    for (const link of respRoleLinks) {
      counts.set(link.responsibilityId, (counts.get(link.responsibilityId) ?? 0) + 1);
    }
    return counts;
  }, [respRoleLinks]);

  // Stable name-asc sort, locale-aware so accented names land where users expect.
  const sortedResponsibilities = useMemo(
    () =>
      [...responsibilities].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [responsibilities],
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 pb-24">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-support"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-chart-1" />
              Responsibilities
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              The recurring things you keep on the rails
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation("/responsibilities/new")}
            className="h-9 w-9 p-0 shrink-0"
            data-testid="button-add-responsibility"
            aria-label="Add responsibility"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {sortedResponsibilities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No responsibilities yet</p>
            <p className="text-xs mt-1">Tap [+] to add one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedResponsibilities.map(resp => {
            const roleCount = roleCountByResp.get(resp.id) ?? 0;
            const scheduleLabel = formatScheduleSummary(resp.recurrenceRule);
            const parts: string[] = [];
            parts.push(`${roleCount} ${roleCount === 1 ? "role" : "roles"}`);
            if (scheduleLabel) parts.push(scheduleLabel);
            return (
              <Link
                key={resp.id}
                href={`/responsibilities/${resp.id}`}
                data-testid={`row-responsibility-${resp.id}`}
              >
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckSquare className="w-4 h-4 text-chart-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{resp.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {parts.join(" · ")}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
