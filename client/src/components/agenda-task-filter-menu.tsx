// =============================================================================
// AgendaTaskFilterMenu — PR #30b (Google parity: show/hide task types)
// =============================================================================
// Gear icon in the agenda header that opens a popover with three checkboxes
// matching the three agenda_tasks.origin values:
//   ☑ Responsibilities  → showResponsibility
//   ☑ Project tasks     → showProjectTask
//   ☑ Standalone tasks  → showStandalone
//
// State lives on the preferences row (per-user, server-persisted) so the
// selection follows the user across devices — same model Google Calendar
// uses for its calendar-visibility checkboxes.
//
// The /api/agenda endpoint already filters server-side by these flags, so
// flipping a box invalidates the agenda query and the next paint shows the
// filtered result.
// =============================================================================

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Prefs = {
  showResponsibility: boolean;
  showProjectTask: boolean;
  showStandalone: boolean;
};

type ExternalCalendar = {
  id: number;
  name: string;
  url: string;
  color: string;
  visible: number;
};

export function AgendaTaskFilterMenu() {
  const qc = useQueryClient();
  const { data } = useQuery<Prefs & Record<string, unknown>>({
    queryKey: ["/api/preferences"],
  });

  const { data: calendars } = useQuery<ExternalCalendar[]>({
    queryKey: ["/api/external-calendars"],
  });

  // Local mirror so toggles feel instant while the PUT round-trips.
  const [local, setLocal] = useState<Prefs>({
    showResponsibility: true,
    showProjectTask: true,
    showStandalone: true,
  });
  useEffect(() => {
    if (data) {
      setLocal({
        showResponsibility: !!data.showResponsibility,
        showProjectTask: !!data.showProjectTask,
        showStandalone: !!data.showStandalone,
      });
    }
  }, [data?.showResponsibility, data?.showProjectTask, data?.showStandalone]);

  const mutation = useMutation({
    mutationFn: async (next: Partial<Prefs>) => {
      const r = await apiRequest("PUT", "/api/preferences", next);
      return r.json();
    },
    onSuccess: () => {
      // Invalidate prefs so the gear reflects the latest server state,
      // AND invalidate every agenda window query so the visible rows are
      // re-fetched with the new server-side filter.
      qc.invalidateQueries({ queryKey: ["/api/preferences"] });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
    },
  });

  const calendarMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: number; visible: number }) => {
      const r = await apiRequest("PATCH", `/api/external-calendars/${id}`, { visible });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/external-calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
    },
  });

  function toggle(key: keyof Prefs) {
    const next = { ...local, [key]: !local[key] };
    setLocal(next);
    mutation.mutate({ [key]: next[key] } as Partial<Prefs>);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          data-testid="button-task-filter"
          aria-label="Show or hide task types"
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Show task types
        </div>
        <div className="space-y-2">
          <label
            className="flex items-center gap-2 text-sm cursor-pointer select-none"
            data-testid="label-filter-responsibility"
          >
            <Checkbox
              checked={local.showResponsibility}
              onCheckedChange={() => toggle("showResponsibility")}
              data-testid="checkbox-filter-responsibility"
            />
            Responsibilities
          </label>
          <label
            className="flex items-center gap-2 text-sm cursor-pointer select-none"
            data-testid="label-filter-project"
          >
            <Checkbox
              checked={local.showProjectTask}
              onCheckedChange={() => toggle("showProjectTask")}
              data-testid="checkbox-filter-project"
            />
            Project tasks
          </label>
          <label
            className="flex items-center gap-2 text-sm cursor-pointer select-none"
            data-testid="label-filter-standalone"
          >
            <Checkbox
              checked={local.showStandalone}
              onCheckedChange={() => toggle("showStandalone")}
              data-testid="checkbox-filter-standalone"
            />
            Standalone tasks
          </label>
        </div>
        {calendars && calendars.length > 0 && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Calendar sources
            </div>
            <div className="space-y-2">
              {calendars.map((cal) => (
                <label
                  key={cal.id}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none"
                >
                  <Checkbox
                    checked={cal.visible === 1}
                    onCheckedChange={(checked) =>
                      calendarMutation.mutate({ id: cal.id, visible: checked ? 1 : 0 })
                    }
                  />
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cal.color }}
                    />
                    {cal.name}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
