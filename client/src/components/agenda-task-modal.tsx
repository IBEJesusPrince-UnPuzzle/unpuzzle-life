// =============================================================================
// AgendaTaskModal — Phase 3a (§22a)
// =============================================================================
// One modal handles three flows:
//
//   1. CREATE (standalone)     — opened by the Agenda + Task button.
//                                 POST /api/agenda-tasks with origin="standalone"
//                                 and the user-typed title.
//
//   2. EDIT (real row)         — opened by tapping a real (non-virtual)
//                                 agenda card. PATCH /api/agenda-tasks/:id.
//
//   3. EDIT (virtual instance) — opened by tapping a virtual recurring
//                                 instance. We do NOT mutate the master row;
//                                 instead we POST a brand-new row that carries
//                                 seriesId + originalDate + isOverride=1, which
//                                 the §22a window-merge will use to replace
//                                 that single occurrence (Phase 2 logic).
//
// Standalone-only is the locked Phase 3a +Task scope (§18 + §22a). Linking
// new rows to a responsibility / project_task happens in Phase 5 when those
// edit UIs ship.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { DEFAULT_AGENDA_COLOR_HEX } from "@/lib/agenda-colors";
import type { AgendaTask } from "@shared/schema";

// The window endpoint enriches AgendaTask with these virtual-instance fields.
export type AgendaWindowItem = AgendaTask & {
  isVirtual?: boolean;
  masterId?: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-fill the create form with this date (Day view's current day).
  defaultDate: string; // YYYY-MM-DD
  // When set, modal is in edit mode. Otherwise it's create mode.
  editing?: AgendaWindowItem | null;
};

// Convert minutes to a friendly value/unit pair for the duration input.
function parseDuration(min: number | null | undefined): {
  value: string;
  unit: "min" | "hr";
} {
  if (!min || min <= 0) return { value: "30", unit: "min" };
  if (min % 60 === 0) return { value: String(min / 60), unit: "hr" };
  return { value: String(min), unit: "min" };
}

function durationToMinutes(value: string, unit: "min" | "hr"): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "hr" ? Math.round(n * 60) : Math.round(n);
}

export function AgendaTaskModal({
  open,
  onOpenChange,
  defaultDate,
  editing,
}: Props) {
  const { toast } = useToast();

  // Mode resolution. Virtual rows have isVirtual=true and a non-null masterId.
  const mode: "create" | "edit-real" | "edit-virtual" = useMemo(() => {
    if (!editing) return "create";
    if (editing.isVirtual) return "edit-virtual";
    return "edit-real";
  }, [editing]);

  // Form state.
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  // Phase 3c — multi-day all-day events. Empty string means "single-day"
  // (sent to the server as null). Only meaningful when isAllDay is true.
  const [endDate, setEndDate] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [time, setTime] = useState("09:00");
  const [durValue, setDurValue] = useState("30");
  const [durUnit, setDurUnit] = useState<"min" | "hr">("min");
  const [color, setColor] = useState(DEFAULT_AGENDA_COLOR_HEX);
  const [notes, setNotes] = useState("");

  // Reset/seed whenever the modal opens or the editing target changes.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title ?? "");
      setDate(editing.date);
      // Seed end-date from the row only when it differs from start (otherwise
      // leave blank so the UI shows "single-day" by default).
      const seedEnd = editing.endDate && editing.endDate !== editing.date ? editing.endDate : "";
      setEndDate(seedEnd);
      setIsAllDay(editing.isAllDay === 1);
      setTime(editing.time ?? "09:00");
      const dur = parseDuration(editing.durationMinutes);
      setDurValue(dur.value);
      setDurUnit(dur.unit);
      setColor(editing.color ?? DEFAULT_AGENDA_COLOR_HEX);
      setNotes(editing.notes ?? "");
    } else {
      setTitle("");
      setDate(defaultDate);
      setEndDate("");
      setIsAllDay(false);
      setTime("09:00");
      setDurValue("30");
      setDurUnit("min");
      setColor(DEFAULT_AGENDA_COLOR_HEX);
      setNotes("");
    }
  }, [open, editing, defaultDate]);

  function buildPayload() {
    const durationMinutes = isAllDay ? null : durationToMinutes(durValue, durUnit);
    // Phase 3c — endDate is only sent when isAllDay AND the user picked
    // an end > start. Otherwise it's null. The server enforces these rules
    // again as a defense in depth.
    const payloadEndDate =
      isAllDay && endDate && endDate > date ? endDate : null;
    return {
      title: title.trim() || null,
      date,
      endDate: payloadEndDate,
      isAllDay: isAllDay ? 1 : 0,
      time: isAllDay ? null : time,
      durationMinutes,
      color,
      notes: notes.trim() || null,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "edit-real" && editing) {
        const r = await apiRequest("PATCH", `/api/agenda-tasks/${editing.id}`, buildPayload());
        return r.json();
      }
      if (mode === "edit-virtual" && editing) {
        // Override creation: a NEW row, seriesId points back to the master,
        // originalDate stamps which instance is being replaced. The §22a
        // window query will hide the virtual occurrence whose date matches
        // an existing override row.
        const payload = {
          ...buildPayload(),
          origin: "standalone" as const,
          seriesId: editing.masterId ?? editing.id,
          originalDate: editing.date,
          isOverride: 1,
        };
        const r = await apiRequest("POST", "/api/agenda-tasks", payload);
        return r.json();
      }
      // Create
      const payload = {
        ...buildPayload(),
        origin: "standalone" as const,
      };
      const r = await apiRequest("POST", "/api/agenda-tasks", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({
        title: "Could not save",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editing || mode !== "edit-real") return;
      await apiRequest("DELETE", `/api/agenda-tasks/${editing.id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
    },
  });

  const titleText =
    mode === "create"
      ? "Add task"
      : mode === "edit-virtual"
        ? "Edit this occurrence"
        : "Edit task";

  // Phase 3c — disable Save if the user typed an end date that's earlier than
  // the start date. (Empty endDate means single-day and is always valid.)
  const endDateValid = !isAllDay || !endDate || endDate >= date;
  const canSave =
    title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && endDateValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-agenda-task">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="What is this task?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              data-testid="input-task-title"
            />
          </div>

          {/* Date (becomes "Start date" when all-day with multi-day support) */}
          <div className="space-y-1.5">
            <Label htmlFor="task-date">{isAllDay ? "Start date" : "Date"}</Label>
            <Input
              id="task-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-task-date"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-all-day"
              checked={isAllDay}
              onCheckedChange={(v) => setIsAllDay(v === true)}
              data-testid="checkbox-task-all-day"
            />
            <Label htmlFor="task-all-day" className="cursor-pointer">
              All-day
            </Label>
          </div>

          {/* End date — only when all-day. Empty means single-day. (Phase 3c) */}
          {isAllDay && (
            <div className="space-y-1.5">
              <Label htmlFor="task-end-date">
                End date <span className="text-muted-foreground text-xs">— leave blank for single day</span>
              </Label>
              <Input
                id="task-end-date"
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-task-end-date"
              />
              {!endDateValid && (
                <p className="text-xs text-destructive" data-testid="text-end-date-error">
                  End date must be on or after the start date.
                </p>
              )}
            </div>
          )}

          {/* Time + duration (hidden when all-day) */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-time">Start time</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  data-testid="input-task-time"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={durValue}
                    onChange={(e) => setDurValue(e.target.value)}
                    className="flex-1"
                    data-testid="input-task-duration-value"
                  />
                  <select
                    value={durUnit}
                    onChange={(e) => setDurUnit(e.target.value as "min" | "hr")}
                    className="rounded-md border border-input bg-background px-2 text-sm"
                    data-testid="select-task-duration-unit"
                  >
                    <option value="min">min</option>
                    <option value="hr">hr</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="textarea-task-notes"
            />
          </div>

          {mode === "edit-virtual" && (
            <p className="text-xs text-muted-foreground">
              Saving will only change this single occurrence. The recurring
              series stays intact.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
          {mode === "edit-real" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-task-delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-task-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              data-testid="button-task-save"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
