import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Clock, MapPin, CheckCircle2, ChevronDown, ChevronRight,
  Sparkles, ArrowRight, Eye, Zap, Heart, Trophy, FileEdit, Check, Trash2
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import type { RoutineItem, RoutineLog, Area } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getTimePhase(time: string): { label: string; icon: typeof Clock; color: string } {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 6) return { label: "Early Morning", icon: Sparkles, color: "text-violet-500 dark:text-violet-400" };
  if (hour < 9) return { label: "Morning", icon: Zap, color: "text-amber-500 dark:text-amber-400" };
  if (hour < 12) return { label: "Late Morning", icon: Eye, color: "text-primary" };
  if (hour < 15) return { label: "Afternoon", icon: Heart, color: "text-emerald-500 dark:text-emerald-400" };
  if (hour < 18) return { label: "Late Afternoon", icon: ArrowRight, color: "text-blue-500 dark:text-blue-400" };
  return { label: "Evening", icon: Trophy, color: "text-indigo-500 dark:text-indigo-400" };
}

// Group items by time phase — drafts sorted first within each phase
function groupByPhase(items: RoutineItem[]): { phase: string; icon: typeof Clock; color: string; items: RoutineItem[] }[] {
  const groups: Map<string, { icon: typeof Clock; color: string; items: RoutineItem[] }> = new Map();
  items.forEach(item => {
    const { label, icon, color } = getTimePhase(item.time);
    if (!groups.has(label)) groups.set(label, { icon, color, items: [] });
    groups.get(label)!.items.push(item);
  });
  // Sort each group: drafts first, then by time
  return Array.from(groups.entries()).map(([phase, data]) => {
    data.items.sort((a, b) => {
      const aDraft = (a as any).isDraft === 1 ? 0 : 1;
      const bDraft = (b as any).isDraft === 1 ? 0 : 1;
      if (aDraft !== bDraft) return aDraft - bDraft;
      return a.time.localeCompare(b.time);
    });
    return { phase, ...data };
  });
}

// Calculate current time position
function getCurrentProgress(items: RoutineItem[]): number {
  if (items.length === 0) return -1;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  
  for (let i = items.length - 1; i >= 0; i--) {
    const [h, m] = items[i].time.split(":");
    const itemMins = parseInt(h) * 60 + parseInt(m);
    if (nowMins >= itemMins) return i;
  }
  return -1;
}

export default function RoutinePage() {
  const today = getToday();
  
  const { data: items = [] } = useQuery<RoutineItem[]>({
    queryKey: ["/api/routine-items"],
  });
  const { data: logs = [] } = useQuery<RoutineLog[]>({
    queryKey: ["/api/routine-logs", today],
    queryFn: () => apiRequest("GET", `/api/routine-logs?date=${today}`).then(r => r.json()),
  });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const activeItems = items.filter(i => i.active);
  const nonDraftItems = activeItems.filter(i => !(i as any).isDraft);
  const completedIds = useMemo(() => new Set(logs.map(l => l.routineItemId)), [logs]);
  const completedCount = nonDraftItems.filter(i => completedIds.has(i.id)).length;
  const currentIdx = getCurrentProgress(nonDraftItems);
  const phases = useMemo(() => groupByPhase(activeItems), [activeItems]);
  const draftCount = activeItems.filter(i => (i as any).isDraft === 1).length;

  // Total day duration
  const totalMinutes = activeItems.reduce((sum, i) => sum + i.durationMinutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;

  const progressPct = nonDraftItems.length > 0 ? Math.round((completedCount / nonDraftItems.length) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Daily Routine</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your 24-hour habit stack — the route to your horizons.
        </p>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums">{completedCount}</span>
              <span className="text-sm text-muted-foreground">/ {nonDraftItems.length} blocks</span>
              {draftCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] h-4 px-1.5">
                  {draftCount} draft{draftCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="text-right">
              <span className="text-sm font-medium">{progressPct}%</span>
              <span className="text-xs text-muted-foreground ml-1">complete</span>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {activeItems[0] && formatTime(activeItems[0].time)}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalHours}h {totalMins > 0 ? `${totalMins}m` : ""} total
            </span>
            <span className="text-xs text-muted-foreground">
              {activeItems.length > 0 && (() => {
                const last = activeItems[activeItems.length - 1];
                const [h, m] = last.time.split(":");
                const endMins = parseInt(h) * 60 + parseInt(m) + last.durationMinutes;
                return formatTime(`${Math.floor(endMins / 60).toString().padStart(2, "0")}:${(endMins % 60).toString().padStart(2, "0")}`);
              })()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Timeline grouped by phase */}
      {(() => {
        // Build flat display-order list so "After..." shows the correct previous item's reward
        const flatDisplayOrder: RoutineItem[] = phases.flatMap(g => g.items);
        return phases.map((group) => (
          <PhaseGroup
            key={group.phase}
            phase={group.phase}
            PhaseIcon={group.icon}
            color={group.color}
            items={group.items}
            completedIds={completedIds}
            logs={logs}
            today={today}
            currentIdx={currentIdx}
            allItems={activeItems}
            flatDisplayOrder={flatDisplayOrder}
            areas={areas}
          />
        ));
      })()}
    </div>
  );
}

// ============================================================
// PHASE GROUP
// ============================================================
function PhaseGroup({
  phase, PhaseIcon, color, items, completedIds, logs, today, currentIdx, allItems, flatDisplayOrder, areas,
}: {
  phase: string;
  PhaseIcon: typeof Clock;
  color: string;
  items: RoutineItem[];
  completedIds: Set<number>;
  logs: RoutineLog[];
  today: string;
  currentIdx: number;
  allItems: RoutineItem[];
  flatDisplayOrder: RoutineItem[];
  areas: Area[];
}) {
  const phaseCompleted = items.filter(i => completedIds.has(i.id)).length;
  const allDone = phaseCompleted === items.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <PhaseIcon className={`w-4 h-4 ${color}`} />
        <h2 className="text-sm font-medium">{phase}</h2>
        <Badge variant={allDone ? "default" : "secondary"} className="text-[10px] h-4 px-1.5 ml-auto">
          {phaseCompleted}/{items.length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const globalIdx = allItems.findIndex(ai => ai.id === item.id);
          // Use flat display order for "After..." so it matches the visual sequence
          const displayIdx = flatDisplayOrder.findIndex(fi => fi.id === item.id);
          const prevItem = displayIdx > 0 ? flatDisplayOrder[displayIdx - 1] : null;
          return (
            <RoutineRow
              key={item.id}
              item={item}
              isDone={completedIds.has(item.id)}
              log={logs.find(l => l.routineItemId === item.id)}
              isCurrent={globalIdx === currentIdx}
              isPast={globalIdx < currentIdx}
              today={today}
              prevReward={prevItem ? prevItem.reward : null}
              areas={areas}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ROUTINE ROW
// ============================================================
function RoutineRow({ item, isDone, log, isCurrent, isPast, today, prevReward, areas }: {
  item: RoutineItem;
  isDone: boolean;
  log?: RoutineLog;
  isCurrent: boolean;
  isPast: boolean;
  today: string;
  prevReward: string | null;
  areas: Area[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const itemIsDraft = (item as any).isDraft === 1;

  // Draft publish state — hour/minute/ampm selects for reliability
  const [draftHour, setDraftHour] = useState("");
  const [draftMinute, setDraftMinute] = useState("00");
  const [draftAmPm, setDraftAmPm] = useState("AM");
  const [draftDuration, setDraftDuration] = useState(String(item.durationMinutes));
  const [draftLocation, setDraftLocation] = useState(item.location || "");

  const publishDraft = useMutation({
    mutationFn: () => {
      // Convert hour/minute/ampm to 24h HH:MM
      let h = parseInt(draftHour);
      if (draftAmPm === "PM" && h !== 12) h += 12;
      if (draftAmPm === "AM" && h === 12) h = 0;
      const time24 = `${String(h).padStart(2, "0")}:${draftMinute}`;
      return apiRequest("PATCH", `/api/routine-items/${item.id}`, {
        time: time24,
        durationMinutes: parseInt(draftDuration) || 10,
        location: draftLocation.trim(),
        isDraft: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-items"] });
    },
  });

  const deleteDraft = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/routine-items/${item.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-items"] });
    },
  });

  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/routine-logs", {
      routineItemId: item.id,
      date: today,
      completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-logs", today] });
    },
  });

  const unlogMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/routine-logs/${log!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-logs", today] });
    },
  });

  // Get first line of response for compact display
  const responseParts = item.response.split(" | ");
  const mainResponse = responseParts[0];

  const area = item.areaId ? areas.find(a => a.id === item.areaId) : null;

  return (
    <>
      <Card
        ref={rowRef}
        className={`transition-all group ${
          itemIsDraft
            ? "border-amber-500/30 bg-amber-500/[0.04]"
            : isCurrent ? "ring-1 ring-primary/40 bg-primary/[0.04]" : ""
        } ${isDone ? "opacity-60" : ""}`}
        data-testid={`routine-item-${item.id}`}
      >
        <CardContent className="p-0">
          {/* Main row */}
          <div className="flex items-center gap-2.5 p-3 sm:p-3.5">
            {/* Check circle — disabled for drafts */}
            {itemIsDraft ? (
              <div className="w-7 h-7 rounded-full border-2 border-amber-500/40 flex items-center justify-center shrink-0">
                <FileEdit className="w-3.5 h-3.5 text-amber-500" />
              </div>
            ) : (
              <button
                onClick={() => isDone ? unlogMutation.mutate() : logMutation.mutate()}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                  isDone
                    ? "border-primary bg-primary"
                    : isCurrent
                      ? "border-primary/60 hover:border-primary"
                      : "border-muted-foreground/25 hover:border-primary/40"
                }`}
                data-testid={`routine-check-${item.id}`}
              >
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
              </button>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0" onClick={() => itemIsDraft ? setExpanded(!expanded) : setDetailOpen(true)} role="button">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                  {mainResponse}
                </p>
                {itemIsDraft && (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] h-4 px-1.5 shrink-0">
                    Draft
                  </Badge>
                )}
              </div>
              {itemIsDraft ? (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Set an exact time to add to your routine
                </p>
              ) : (
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatTime(item.time)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDuration(item.durationMinutes)}
                  </span>
                  {item.location && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate max-w-[120px] sm:max-w-[180px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {item.location}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Expand indicator */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground/50 hover:text-muted-foreground p-1 shrink-0"
              data-testid={`routine-expand-${item.id}`}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Expanded: habit stack chain */}
          {expanded && (
            <div className="px-3.5 pb-3.5 pt-0 border-t border-border/50">
              <div className="grid grid-cols-1 gap-2 mt-2.5">
                {prevReward && (
                  <div className="flex items-start gap-2 text-xs">
                    <ArrowRight className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-primary/70">After...</span>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{prevReward}</p>
                    </div>
                  </div>
                )}
                {item.cue && (
                  <div className="flex items-start gap-2 text-xs">
                    <Eye className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-amber-600 dark:text-amber-400">I'll...</span>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{item.cue}</p>
                    </div>
                  </div>
                )}
                {item.craving && (
                  <div className="flex items-start gap-2 text-xs">
                    <Heart className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-rose-600 dark:text-rose-400">and because...</span>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{item.craving}</p>
                    </div>
                  </div>
                )}
                {item.response && (
                  <div className="flex items-start gap-2 text-xs">
                    <Zap className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">I will...</span>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{item.response}</p>
                    </div>
                  </div>
                )}
                {item.reward && (
                  <div className="flex items-start gap-2 text-xs">
                    <Trophy className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-primary">and I'll be rewarded by...</span>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{item.reward}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Draft publish form */}
              {itemIsDraft && (
                <DraftPublishForm
                  item={item}
                  draftHour={draftHour}
                  setDraftHour={setDraftHour}
                  draftMinute={draftMinute}
                  setDraftMinute={setDraftMinute}
                  draftAmPm={draftAmPm}
                  setDraftAmPm={setDraftAmPm}
                  draftDuration={draftDuration}
                  setDraftDuration={setDraftDuration}
                  draftLocation={draftLocation}
                  setDraftLocation={setDraftLocation}
                  onPublish={() => publishDraft.mutate()}
                  onDelete={() => deleteDraft.mutate()}
                  isPending={publishDraft.isPending}
                  canPublish={draftHour !== "" && draftLocation.trim() !== ""}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog for published routine items */}
      {!itemIsDraft && (
        <EditRoutineDialog
          item={item}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </>
  );
}

// ============================================================
// EDIT ROUTINE DIALOG (time, duration, location)
// ============================================================
function EditRoutineDialog({ item, open, onOpenChange }: {
  item: RoutineItem; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  // Parse current time into 12h format
  const parseTime = () => {
    const [h, m] = item.time.split(":");
    const hour24 = parseInt(h);
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    // Round minute to nearest 5 for the Select options
    const minNum = parseInt(m);
    const rounded = Math.round(minNum / 5) * 5;
    const minute = String(rounded >= 60 ? 55 : rounded).padStart(2, "0");
    return { hour: String(hour12), minute, ampm };
  };
  const parsed = parseTime();

  const [editHour, setEditHour] = useState(parsed.hour);
  const [editMinute, setEditMinute] = useState(parsed.minute);
  const [editAmPm, setEditAmPm] = useState(parsed.ampm);
  const [editDuration, setEditDuration] = useState(String(item.durationMinutes));
  const [editLocation, setEditLocation] = useState(item.location || "");

  const resetForm = () => {
    const p = parseTime();
    setEditHour(p.hour);
    setEditMinute(p.minute);
    setEditAmPm(p.ampm);
    setEditDuration(String(item.durationMinutes));
    setEditLocation(item.location || "");
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
  const durationPresets = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180];
  const durationOptions = durationPresets.includes(item.durationMinutes)
    ? durationPresets
    : [...durationPresets, item.durationMinutes].sort((a, b) => a - b);

  const updateRoutine = useMutation({
    mutationFn: () => {
      let h = parseInt(editHour);
      if (editAmPm === "PM" && h !== 12) h += 12;
      if (editAmPm === "AM" && h === 12) h = 0;
      const time24 = `${String(h).padStart(2, "0")}:${editMinute}`;
      return apiRequest("PATCH", `/api/routine-items/${item.id}`, {
        time: time24,
        durationMinutes: parseInt(editDuration) || 10,
        location: editLocation.trim() || null,
      });
    },
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/routine-items"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Routine Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground truncate">{item.response}</p>

          {/* Time */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Time</label>
            <div className="flex items-center gap-1.5">
              <Select value={editHour} onValueChange={setEditHour}>
                <SelectTrigger className="h-8 text-xs w-[70px]" data-testid={`edit-hour-${item.id}`}>
                  <SelectValue placeholder="Hr" />
                </SelectTrigger>
                <SelectContent>
                  {hours.map(h => (
                    <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm font-medium text-muted-foreground">:</span>
              <Select value={editMinute} onValueChange={setEditMinute}>
                <SelectTrigger className="h-8 text-xs w-[70px]" data-testid={`edit-min-${item.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEditAmPm("AM")}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    editAmPm === "AM"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >AM</button>
                <button
                  type="button"
                  onClick={() => setEditAmPm("PM")}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    editAmPm === "PM"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >PM</button>
              </div>
            </div>
          </div>

          {/* Duration + Location */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Duration</label>
              <Select value={editDuration} onValueChange={setEditDuration}>
                <SelectTrigger className="h-8 text-xs" data-testid={`edit-duration-${item.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map(m => (
                    <SelectItem key={m} value={String(m)}>
                      {m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Location</label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. my office"
                className="h-8 text-xs"
                data-testid={`edit-location-${item.id}`}
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="sm"
            disabled={!editHour || updateRoutine.isPending}
            onClick={() => updateRoutine.mutate()}
            data-testid={`edit-save-${item.id}`}
          >
            {updateRoutine.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DRAFT PUBLISH FORM
// ============================================================
function DraftPublishForm({
  item, draftHour, setDraftHour, draftMinute, setDraftMinute,
  draftAmPm, setDraftAmPm, draftDuration, setDraftDuration,
  draftLocation, setDraftLocation, onPublish, onDelete, isPending, canPublish,
}: {
  item: RoutineItem;
  draftHour: string; setDraftHour: (v: string) => void;
  draftMinute: string; setDraftMinute: (v: string) => void;
  draftAmPm: string; setDraftAmPm: (v: string) => void;
  draftDuration: string; setDraftDuration: (v: string) => void;
  draftLocation: string; setDraftLocation: (v: string) => void;
  onPublish: () => void;
  onDelete: () => void;
  isPending: boolean;
  canPublish: boolean;
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
  const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  return (
    <div className="mt-3 pt-3 border-t border-amber-500/20">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2.5">Add to your routine</p>

      {/* Time: Hour / Minute / AM|PM */}
      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground mb-1 block">Time</label>
        <div className="flex items-center gap-1.5">
          <Select value={draftHour} onValueChange={setDraftHour}>
            <SelectTrigger className="h-8 text-xs w-[70px]" data-testid={`draft-hour-${item.id}`}>
              <SelectValue placeholder="Hr" />
            </SelectTrigger>
            <SelectContent>
              {hours.map(h => (
                <SelectItem key={h} value={String(h)}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm font-medium text-muted-foreground">:</span>
          <Select value={draftMinute} onValueChange={setDraftMinute}>
            <SelectTrigger className="h-8 text-xs w-[70px]" data-testid={`draft-min-${item.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {minutes.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setDraftAmPm("AM")}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                draftAmPm === "AM"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`draft-am-${item.id}`}
            >AM</button>
            <button
              type="button"
              onClick={() => setDraftAmPm("PM")}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                draftAmPm === "PM"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`draft-pm-${item.id}`}
            >PM</button>
          </div>
        </div>
      </div>

      {/* Duration + Location */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Duration</label>
          <Select value={draftDuration} onValueChange={setDraftDuration}>
            <SelectTrigger className="h-8 text-xs" data-testid={`draft-duration-${item.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180].map(m => (
                <SelectItem key={m} value={String(m)}>
                  {m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Location</label>
          <Input
            value={draftLocation}
            onChange={(e) => setDraftLocation(e.target.value)}
            placeholder="e.g. my office"
            className="h-8 text-xs"
            data-testid={`draft-location-${item.id}`}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs gap-1 flex-1"
          disabled={!canPublish || isPending}
          onClick={onPublish}
          data-testid={`draft-publish-${item.id}`}
        >
          <Check className="w-3 h-3" />
          Add to Routine
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          data-testid={`draft-delete-${item.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
