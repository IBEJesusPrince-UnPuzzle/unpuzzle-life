import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, CheckCircle2,
  X, SkipForward, ArrowLeft, Pencil, Trash2, History, Repeat, Repeat2,
  Eye, Heart, Zap, Trophy, Sparkles, FolderOpen, ChevronDown, ChevronUp,
  Users, MapPin, Package
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { PlannerTask, Area, RoutineItem, RoutineLog } from "@shared/schema";
import { EditRoutineDialog } from "./routine";
import { Link } from "wouter";

// Habit chain info for project tasks
interface HabitChain {
  habitId: number;
  habitName: string;
  habitCue: string | null;
  identityStatement: string | null;
  areaName: string | null;
  areaCategory: string | null;
  projectTitle: string;
  tag: string;
}

const PROJECT_CATEGORY_ICONS: Record<string, typeof Users> = {
  project_people: Users,
  project_places: MapPin,
  project_things: Package,
};

const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  project_people: "People",
  project_places: "Places",
  project_things: "Things",
};

// ============================================================
// HELPERS
// ============================================================

function getDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function getToday() {
  return getDateStr(new Date());
}

function getYesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return getDateStr(d);
}

function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return getDateStr(d);
}

function formatDateLabel(dateStr: string) {
  const today = getToday();
  const yesterday = getYesterday();
  const tomorrow = getTomorrow();
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  if (dateStr === tomorrow) return "Tomorrow";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getDayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function formatTime12h(time24: string) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function getTimePhase(time: string): string {
  if (!time) return "Unscheduled";
  const h = parseInt(time.split(":")[0]);
  if (h < 6) return "Early Morning";
  if (h < 9) return "Morning";
  if (h < 12) return "Late Morning";
  if (h < 15) return "Afternoon";
  if (h < 18) return "Late Afternoon";
  return "Evening";
}

const phaseColors: Record<string, string> = {
  "Early Morning": "text-indigo-500",
  "Morning": "text-amber-500",
  "Late Morning": "text-orange-500",
  "Afternoon": "text-emerald-500",
  "Late Afternoon": "text-cyan-500",
  "Evening": "text-violet-500",
  "Unscheduled": "text-muted-foreground",
};

// Recurrence is stored as JSON: {type,interval,days?,weekOfMonth?,dayOfWeek?,dayOfMonth?}
// Legacy strings ("daily","weekdays","weekend","weekly:day","monthly") are also supported for display
export interface RecurrencePattern {
  type: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  interval: number; // every N days/weeks/months/quarters/years
  days?: string[]; // for weekly: ["monday","friday"]
  weekOfMonth?: number; // 1-5 (5=last) for "3rd Friday" style
  dayOfWeek?: string; // for monthly weekday pattern
  dayOfMonth?: number; // for monthly date pattern
}

export function parseRecurrence(rec: string | null): RecurrencePattern | null {
  if (!rec) return null;
  try {
    const parsed = JSON.parse(rec);
    if (parsed.type) return parsed as RecurrencePattern;
  } catch {}
  // Legacy string formats
  if (rec === "daily") return { type: "daily", interval: 1 };
  if (rec === "weekdays") return { type: "weekly", interval: 1, days: ["monday","tuesday","wednesday","thursday","friday"] };
  if (rec === "weekend") return { type: "weekly", interval: 1, days: ["saturday","sunday"] };
  if (rec.startsWith("weekly:")) return { type: "weekly", interval: 1, days: [rec.split(":")[1]] };
  if (rec === "monthly") return { type: "monthly", interval: 1, dayOfMonth: 1 };
  return null;
}

export function formatRecurrence(rec: string | null): string {
  if (!rec) return "";
  const p = parseRecurrence(rec);
  if (!p) return rec;
  const DAYS_SHORT: Record<string, string> = { monday:"Mon",tuesday:"Tue",wednesday:"Wed",thursday:"Thu",friday:"Fri",saturday:"Sat",sunday:"Sun" };
  const ORD = ["","1st","2nd","3rd","4th","Last"];
  if (p.type === "daily") {
    return p.interval === 1 ? "Daily" : `Every ${p.interval} days`;
  }
  if (p.type === "weekly") {
    const dayStr = (p.days || []).map(d => DAYS_SHORT[d] || d).join(", ");
    if (p.interval === 1 && p.days?.length === 5 && !p.days.includes("saturday") && !p.days.includes("sunday")) return "Weekdays";
    if (p.interval === 1 && p.days?.length === 2 && p.days.includes("saturday") && p.days.includes("sunday")) return "Weekends";
    if (p.interval === 1) return `Weekly (${dayStr})`;
    return `Every ${p.interval} wks (${dayStr})`;
  }
  if (p.type === "monthly") {
    if (p.weekOfMonth && p.dayOfWeek) {
      const ordinal = ORD[p.weekOfMonth] || `${p.weekOfMonth}th`;
      return p.interval === 1
        ? `${ordinal} ${DAYS_SHORT[p.dayOfWeek] || p.dayOfWeek}`
        : `${ordinal} ${DAYS_SHORT[p.dayOfWeek]} / ${p.interval} mo`;
    }
    if (p.dayOfMonth) {
      return p.interval === 1 ? `Monthly (day ${p.dayOfMonth})` : `Every ${p.interval} mo (day ${p.dayOfMonth})`;
    }
    return p.interval === 1 ? "Monthly" : `Every ${p.interval} months`;
  }
  if (p.type === "quarterly") {
    return p.interval === 1 ? "Quarterly" : `Every ${p.interval} quarters`;
  }
  if (p.type === "yearly") {
    return p.interval === 1 ? "Yearly" : `Every ${p.interval} years`;
  }
  return rec;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

// Time picker helpers
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function to24h(h12: number, min: string, period: string): string {
  let h = h12;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

function from24h(time24: string): { h12: number; min: string; period: string } {
  if (!time24) return { h12: 12, min: "00", period: "AM" };
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  // Round minutes to nearest 5
  const rounded = Math.round(m / 5) * 5;
  return { h12, min: (rounded % 60).toString().padStart(2, "0"), period };
}

function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const parsed = from24h(value);
  const [hour, setHour] = useState(String(parsed.h12));
  const [minute, setMinute] = useState(parsed.min);
  const [period, setPeriod] = useState(parsed.period);

  const update = (h: string, m: string, p: string) => {
    setHour(h); setMinute(m); setPeriod(p);
    if (h && m && p) onChange(to24h(Number(h), m, p));
  };

  return (
    <div>
      <label className="text-xs font-medium mb-1 block text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <Select value={hour} onValueChange={v => update(v, minute, period)}>
          <SelectTrigger className="text-sm h-9 px-1.5 w-[46px]" data-testid={`time-${label.toLowerCase()}-hour`}>
            <SelectValue placeholder="Hr" />
          </SelectTrigger>
          <SelectContent>
            {HOURS_12.map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={minute} onValueChange={v => update(hour, v, period)}>
          <SelectTrigger className="text-sm h-9 px-1.5 w-[46px]" data-testid={`time-${label.toLowerCase()}-min`}>
            <SelectValue placeholder="Min" />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={v => update(hour, minute, v)}>
          <SelectTrigger className="text-sm h-9 px-1.5 w-[50px]" data-testid={`time-${label.toLowerCase()}-period`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const CATEGORY_ORDER = ["UnPuzzle", "Chores", "Routines", "Roles", "Getting Things Done"];
const CATEGORY_COLORS: Record<string, string> = {
  "UnPuzzle": "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  "Chores": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "Routines": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Roles": "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  "Getting Things Done": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

// ============================================================
// MAIN PAGE
// ============================================================

export default function PlannerPage() {
  const [view, setView] = useState<"sorter" | "area">("sorter");
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);

  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  if (view === "area" && selectedAreaId) {
    return (
      <AreaDetailView
        areaId={selectedAreaId}
        areas={areas}
        onBack={() => { setView("sorter"); setSelectedAreaId(null); }}
      />
    );
  }

  return (
    <SorterView
      areas={areas}
      onAreaClick={(id) => { setSelectedAreaId(id); setView("area"); }}
    />
  );
}

// ============================================================
// SORTER VIEW — Daily chronological timeline
// ============================================================

export function SorterView({ areas, onAreaClick }: { areas: Area[]; onAreaClick: (id: number) => void }) {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: tasks = [], isSuccess } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", selectedDate],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?date=${selectedDate}`).then(r => r.json()),
  });

  // Fetch routine items and logs for merging into the timeline
  const { data: routineItems = [] } = useQuery<RoutineItem[]>({ queryKey: ["/api/routine-items"] });
  const { data: routineLogs = [] } = useQuery<RoutineLog[]>({
    queryKey: ["/api/routine-logs", selectedDate],
    queryFn: () => apiRequest("GET", `/api/routine-logs?date=${selectedDate}`).then(r => r.json()),
  });

  // Auto-generate recurring tasks when navigating to a new date
  const [generatedDates, setGeneratedDates] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isSuccess || generatedDates.has(selectedDate)) return;
    setGeneratedDates(prev => new Set(prev).add(selectedDate));
    apiRequest("POST", "/api/planner-tasks/generate-recurring", {
      startDate: selectedDate,
      endDate: selectedDate,
    }).then(r => r.json()).then((result: { created: number }) => {
      if (result.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", selectedDate] });
      }
    }).catch(() => {});
  }, [selectedDate, isSuccess]);

  // Quick date buttons
  const today = getToday();
  const yesterday = getYesterday();
  const tomorrow = getTomorrow();

  const navigateDay = (offset: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(getDateStr(d));
  };

  // Group tasks by time phase
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [tasks]);

  // Active non-draft routine items grouped by time phase (drafts stay on Routine page)
  const activeRoutineItems = useMemo(() => routineItems.filter(r => r.active && !(r as any).isDraft), [routineItems]);

  // Group routine items by their time phase
  const routineByPhase = useMemo(() => {
    const groups: Record<string, RoutineItem[]> = {};
    activeRoutineItems.forEach(r => {
      const phase = getTimePhase(r.time);
      if (!groups[phase]) groups[phase] = [];
      groups[phase].push(r);
    });
    return groups;
  }, [activeRoutineItems]);

  // Routine log completion set
  const routineCompletionSet = useMemo(() => {
    return new Set(routineLogs.map(l => l.routineItemId));
  }, [routineLogs]);

  const phaseGroups = useMemo(() => {
    const groups: Record<string, PlannerTask[]> = {};
    sortedTasks.forEach(t => {
      const phase = getTimePhase(t.startTime || "");
      if (!groups[phase]) groups[phase] = [];
      groups[phase].push(t);
    });
    return groups;
  }, [sortedTasks]);

  // Merge all phases from both tasks and routine items
  const allPhases = useMemo(() => {
    const phaseOrder = ["Early Morning", "Morning", "Late Morning", "Afternoon", "Late Afternoon", "Evening", "Unscheduled"];
    const phases = new Set([...Object.keys(phaseGroups), ...Object.keys(routineByPhase)]);
    return phaseOrder.filter(p => phases.has(p));
  }, [phaseGroups, routineByPhase]);

  // Stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const totalHours = tasks.reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Daily Agenda</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Plan, track, and review your tasks across all areas of life.
        </p>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border rounded-lg p-1">
          <Button variant="ghost" size="sm" className="h-7 px-2"
            onClick={() => navigateDay(-1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex gap-1">
            {[
              { label: "Y", date: yesterday, full: "Yesterday" },
              { label: "T", date: today, full: "Today" },
              { label: "Tm", date: tomorrow, full: "Tomorrow" },
            ].map(({ label, date, full }) => (
              <Button key={date} variant={selectedDate === date ? "default" : "ghost"}
                size="sm" className="h-7 px-2.5 text-xs" title={full}
                onClick={() => setSelectedDate(date)}>
                {label}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2"
            onClick={() => navigateDay(1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs" data-testid="date-picker">
            <SelectValue>{formatDateLabel(selectedDate)} ({selectedDate})</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 14 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i - 3);
              const ds = getDateStr(d);
              return <SelectItem key={ds} value={ds}>{formatDateLabel(ds)} ({ds})</SelectItem>;
            })}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button variant="outline" size="sm" className="h-7 gap-1"
          onClick={() => setShowAddDialog(true)}>
          <Plus className="w-3 h-3" /> Task
        </Button>
      </div>

      {/* Day header + stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{formatDateLabel(selectedDate)}</h2>
          <p className="text-xs text-muted-foreground">{getDayOfWeek(selectedDate)}, {selectedDate}</p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{doneTasks}/{totalTasks} done</span>
          <span>{totalHours.toFixed(1)}h planned</span>
        </div>
      </div>

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
          />
        </div>
      )}

      {/* Timeline */}
      {totalTasks === 0 && allPhases.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No tasks planned</p>
            <p className="text-xs mt-1">Add tasks for this day to build your plan.</p>
            <Button variant="outline" size="sm" className="mt-3"
              onClick={() => setShowAddDialog(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add first task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allPhases.map(phase => {
            const phaseTasks = phaseGroups[phase] || [];
            const phaseRoutine = routineByPhase[phase] || [];
            if (phaseTasks.length === 0 && phaseRoutine.length === 0) return null;
            return (
              <div key={phase}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className={`w-3.5 h-3.5 ${phaseColors[phase] || "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${phaseColors[phase] || "text-muted-foreground"}`}>
                    {phase}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-1.5 ml-5">
                  {phaseTasks.map(task => (
                    <TaskCard key={task.id} task={task} areas={areas} onAreaClick={onAreaClick} />
                  ))}
                  {phaseRoutine.map(item => (
                    <RoutineItemCard
                      key={`routine-${item.id}`}
                      item={item}
                      areas={areas}
                      isComplete={routineCompletionSet.has(item.id)}
                      date={selectedDate}
                      logId={routineLogs.find(l => l.routineItemId === item.id)?.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        areas={areas}
        defaultDate={selectedDate}
      />
    </div>
  );
}

// ============================================================
// TASK CARD
// ============================================================

function EditTaskDialog({ task, areas, open, onOpenChange }: {
  task: PlannerTask; areas: Area[]; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [goal, setGoal] = useState(task.goal);
  const [areaId, setAreaId] = useState<string>(task.areaId ? String(task.areaId) : "none");
  const [startTime, setStartTime] = useState(task.startTime || "");
  const [endTime, setEndTime] = useState(task.endTime || "");
  const [date, setDate] = useState(task.date);
  const [resultText, setResultText] = useState(task.result || "");
  const [recurrenceJson, setRecurrenceJson] = useState<string | null>(task.recurrence || null);

  // Reset form when dialog opens with new task
  useEffect(() => {
    if (open) {
      setGoal(task.goal);
      setAreaId(task.areaId ? String(task.areaId) : "none");
      setStartTime(task.startTime || "");
      setEndTime(task.endTime || "");
      setDate(task.date);
      setResultText(task.result || "");
      setRecurrenceJson(task.recurrence || null);
    }
  }, [open, task]);

  const hours = useMemo(() => {
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = (eh * 60 + em - sh * 60 - sm) / 60;
    return diff > 0 ? diff.toFixed(2) : "";
  }, [startTime, endTime]);

  const groupedAreas = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    areas.forEach(a => {
      const cat = a.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    return groups;
  }, [areas]);

  const update = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/planner-tasks/${task.id}`, {
      goal,
      areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      startTime: startTime || null,
      endTime: endTime || null,
      hours: hours || null,
      date,
      result: resultText || null,
      recurrence: recurrenceJson,
    }),
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", task.date] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", date] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">What</label>
            <Input value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="What needs to be done?" className="text-sm" data-testid="edit-task-goal" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-md bg-card text-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Area</label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No area</SelectItem>
                  {CATEGORY_ORDER.map(cat => {
                    const catAreas = groupedAreas[cat];
                    if (!catAreas) return null;
                    return catAreas.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        <span className="text-xs text-muted-foreground mr-1">{cat.substring(0, 3)}.</span>
                        {a.name}
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <TimePicker label="Start" value={startTime} onChange={setStartTime} />
            <TimePicker label="End" value={endTime} onChange={setEndTime} />
            <div className="flex-shrink-0">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Hours</label>
              <div className="h-9 px-2 text-sm border rounded-md bg-muted/50 flex items-center text-muted-foreground min-w-[48px]">
                {hours ? `${parseFloat(hours).toFixed(1)}h` : "Auto"}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Result / Notes</label>
            <Input value={resultText} onChange={e => setResultText(e.target.value)}
              placeholder="How did it go?" className="text-sm" />
          </div>
          <RecurrenceBuilder value={recurrenceJson} onChange={setRecurrenceJson} />
          <Button className="w-full" disabled={!goal.trim() || !areaId || areaId === "none" || !startTime || !endTime} onClick={() => update.mutate()}
            data-testid="button-update-task">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({ task, areas, onAreaClick }: { task: PlannerTask; areas: Area[]; onAreaClick: (id: number) => void }) {
  const area = areas.find(a => a.id === task.areaId);
  const isDone = task.status === "done";
  const isSkipped = task.status === "skipped";
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [chainExpanded, setChainExpanded] = useState(false);

  // Detect project task
  const isProjectTask = task.sourceType?.startsWith("project_") && task.habitId;
  const ProjectCatIcon = isProjectTask ? PROJECT_CATEGORY_ICONS[task.sourceType!] || FolderOpen : null;
  const projectCatLabel = isProjectTask ? PROJECT_CATEGORY_LABELS[task.sourceType!] || "Project" : null;

  // Fetch habit chain for project tasks (only when needed)
  const { data: chain } = useQuery<HabitChain>({
    queryKey: ["/api/habit-chain", task.habitId],
    queryFn: () => apiRequest("GET", `/api/habit-chain/${task.habitId}`).then(r => r.json()),
    enabled: !!isProjectTask,
    staleTime: 60000,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/planner-tasks/${task.id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", task.date] }),
  });

  const deleteTask = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/planner-tasks/${task.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", task.date] }),
  });

  // Use chain area info for project tasks, fallback to task area
  const displayAreaName = isProjectTask && chain?.areaName ? chain.areaName : area?.name;

  return (
    <>
    <EditTaskDialog task={task} areas={areas} open={editOpen} onOpenChange={setEditOpen} />
    <Card
      className={`group transition-all ${isProjectTask ? "border-l-4 border-l-chart-5/60" : ""} ${isDone ? "opacity-60" : isSkipped ? "opacity-40" : ""}`}
      data-testid={`task-${task.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          {/* Status toggle */}
          <button
            onClick={() => updateStatus.mutate(isDone ? "planned" : "done")}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${
              isDone
                ? "border-primary bg-primary"
                : "border-muted-foreground/30 hover:border-primary/50"
            }`}
          >
            {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
          </button>

          <div className="flex-1 min-w-0">
            {/* Project badge row */}
            {isProjectTask && chain && (
              <div className="mb-1">
                <Link href={`/projects/${task.habitId}`}>
                  <div className="flex items-center gap-1 cursor-pointer group/proj">
                    <FolderOpen className="w-3 h-3 text-chart-5 shrink-0" />
                    <span className="text-[10px] font-medium text-chart-5 group-hover/proj:underline truncate">
                      {chain.projectTitle}
                    </span>
                  </div>
                </Link>
              </div>
            )}

            <div className="cursor-pointer" onClick={() => setEditOpen(true)}>
              {/* Line 1: In the area of... */}
              {displayAreaName && (
                <p className="text-[11px] text-muted-foreground">
                  In the area of <span className="font-medium text-foreground">{displayAreaName}</span> I will...
                </p>
              )}
              {/* Line 2: Task name */}
              <p className={`text-sm font-medium leading-snug ${isDone ? "line-through" : ""}`}>
                {task.goal}
              </p>
              {/* Line 3: Time + Duration + Flags */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {task.startTime && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatTime12h(task.startTime)}
                    {task.endTime && ` – ${formatTime12h(task.endTime)}`}
                  </span>
                )}
                {task.hours && parseFloat(task.hours) > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {parseFloat(task.hours).toFixed(task.hours.includes(".") ? 1 : 0)}h
                  </Badge>
                )}
                {isProjectTask && ProjectCatIcon ? (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-chart-5 border-chart-5/30 flex items-center gap-0.5">
                    <ProjectCatIcon className="w-2.5 h-2.5" />
                    {projectCatLabel}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    Task
                  </Badge>
                )}
                {task.recurrence && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center gap-0.5">
                    <Repeat className="w-2.5 h-2.5" />
                    {formatRecurrence(task.recurrence)}
                  </span>
                )}
              </div>
              {task.result && (
                <p className="text-[11px] text-muted-foreground mt-1 italic">Result: {task.result}</p>
              )}
            </div>

            {/* Expandable project chain */}
            {isProjectTask && chain && (
              <button
                onClick={(e) => { e.stopPropagation(); setChainExpanded(!chainExpanded); }}
                className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {chainExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>Project chain</span>
              </button>
            )}
            {chainExpanded && chain && (
              <div className="mt-1.5 ml-1 pl-2.5 border-l-2 border-chart-5/20 space-y-1">
                {chain.areaName && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Area:</span>{" "}
                    In the area of <span className="font-medium text-foreground">{chain.areaName}</span>
                    {chain.areaCategory && <span className="text-muted-foreground"> ({chain.areaCategory})</span>}
                  </p>
                )}
                {chain.identityStatement && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Identity:</span>{" "}
                    I am the type of person who <span className="font-medium text-foreground">{chain.identityStatement}</span>
                  </p>
                )}
                {chain.habitCue && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Habit:</span>{" "}
                    When <span className="font-medium text-foreground">{chain.habitCue}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit task"
              onClick={() => setEditOpen(true)} data-testid={`edit-task-${task.id}`}>
              <Pencil className="w-3 h-3" />
            </Button>
            {!isDone && !isSkipped && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" title="Skip"
                onClick={() => updateStatus.mutate("skipped")}>
                <SkipForward className="w-3 h-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="Delete"
              onClick={() => deleteTask.mutate()}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Make this a habit — only for non-project tasks */}
          {!isProjectTask && (
            <button
              onClick={() => setConvertOpen(true)}
              className="shrink-0 mt-0.5 text-primary/60 hover:text-primary transition-colors"
              title="Make this a habit"
              data-testid={`task-to-habit-${task.id}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </CardContent>

      <ConvertToHabitDialog
        task={task}
        area={area}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
    </Card>
    </>
  );
}

// ============================================================
// ROUTINE ITEM CARD — Merged routine display in Daily Agenda
// ============================================================

function RoutineItemCard({ item, areas, isComplete, date, logId }: {
  item: RoutineItem; areas: Area[]; isComplete: boolean; date: string; logId?: number;
}) {
  const area = areas.find(a => a.id === item.areaId);
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const logCompletion = useMutation({
    mutationFn: () => apiRequest("POST", "/api/routine-logs", {
      routineItemId: item.id,
      date,
      completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-logs", date] });
    },
  });

  const removeLog = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/routine-logs/${logId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routine-logs", date] });
    },
  });

  return (
    <>
    <Card className={`group transition-all border-l-4 border-l-violet-500/50 ${isComplete ? "opacity-60" : ""}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <button
            onClick={() => isComplete && logId ? removeLog.mutate() : logCompletion.mutate()}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${
              isComplete
                ? "border-violet-500 bg-violet-500"
                : "border-muted-foreground/30 hover:border-violet-500/50"
            }`}
          >
            {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
          </button>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            {/* Line 1: In the area of... */}
            {area && (
              <p className="text-[11px] text-muted-foreground">
                In the area of <span className="font-medium text-foreground">{area.name}</span> I will...
              </p>
            )}
            {/* Line 2: Routine response */}
            <p className={`text-sm font-medium leading-snug ${isComplete ? "line-through" : ""}`}>
              {item.response}
            </p>
            {/* Line 3: Time + Duration + Routine flag */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatTime12h(item.time)}
                {item.durationMinutes > 0 && (() => {
                  const endH = parseInt(item.time.split(":")[0]);
                  const endM = parseInt(item.time.split(":")[1]) + item.durationMinutes;
                  const endTime = `${Math.floor((endH * 60 + endM) / 60).toString().padStart(2, "0")}:${((endH * 60 + endM) % 60).toString().padStart(2, "0")}`;
                  return ` \u2013 ${formatTime12h(endTime)}`;
                })()}
              </span>
              {item.durationMinutes > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {item.durationMinutes >= 60 ? `${(item.durationMinutes / 60).toFixed(1)}h` : `${item.durationMinutes}m`}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-violet-600 dark:text-violet-400 border-violet-500/30">
                Routine
              </Badge>
            </div>
            {/* Expanded view */}
            {expanded && (
              <div className="mt-2 space-y-1 text-[11px]">
                {item.cue && (
                  <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Eye className="w-3 h-3 shrink-0" /> I'll {item.cue}
                  </p>
                )}
                {item.craving && (
                  <p className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <Heart className="w-3 h-3 shrink-0" /> and because {item.craving}
                  </p>
                )}
                <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Zap className="w-3 h-3 shrink-0" /> I will {item.response}
                </p>
                {item.reward && (
                  <p className="flex items-center gap-1 text-primary">
                    <Trophy className="w-3 h-3 shrink-0" /> and I'll be rewarded by {item.reward}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Edit button */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit routine"
              onClick={() => setEditOpen(true)} data-testid={`edit-routine-${item.id}`}>
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <EditRoutineDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ============================================================
// ADD TASK DIALOG
// ============================================================

// ============================================================
// RECURRENCE BUILDER — Outlook-style
// ============================================================

export function RecurrenceBuilder({ value, onChange, requireRecurrence }: { value: string | null; onChange: (v: string | null) => void; requireRecurrence?: boolean }) {
  const existing = parseRecurrence(value);
  const defaultType = requireRecurrence ? "daily" : "none";
  const [recType, setRecType] = useState<"none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly">(existing?.type || defaultType);
  const [interval, setInterval] = useState(existing?.interval || 1);
  const [weeklyDays, setWeeklyDays] = useState<string[]>(existing?.days || ["monday"]);
  const [monthMode, setMonthMode] = useState<"date" | "weekday">(existing?.weekOfMonth ? "weekday" : "date");
  const [dayOfMonth, setDayOfMonth] = useState(existing?.dayOfMonth || 1);
  const [weekOfMonth, setWeekOfMonth] = useState(existing?.weekOfMonth || 1);
  const [dayOfWeek, setDayOfWeek] = useState(existing?.dayOfWeek || "friday");

  const emitChange = (type: string, intv: number, wDays: string[], mMode: string, dom: number, wom: number, dow: string) => {
    if (type === "none") { onChange(null); return; }
    let pattern: RecurrencePattern;
    if (type === "daily") {
      pattern = { type: "daily", interval: intv };
    } else if (type === "weekly") {
      pattern = { type: "weekly", interval: intv, days: wDays.length > 0 ? wDays : ["monday"] };
    } else if (type === "quarterly") {
      pattern = { type: "quarterly", interval: intv };
    } else if (type === "yearly") {
      pattern = { type: "yearly", interval: intv };
    } else {
      if (mMode === "weekday") {
        pattern = { type: "monthly", interval: intv, weekOfMonth: wom, dayOfWeek: dow };
      } else {
        pattern = { type: "monthly", interval: intv, dayOfMonth: dom };
      }
    }
    onChange(JSON.stringify(pattern));
  };

  const toggleDay = (day: string) => {
    const next = weeklyDays.includes(day) ? weeklyDays.filter(d => d !== day) : [...weeklyDays, day];
    setWeeklyDays(next);
    emitChange(recType, interval, next, monthMode, dayOfMonth, weekOfMonth, dayOfWeek);
  };

  const ORDINALS = [{ v: 1, l: "1st" }, { v: 2, l: "2nd" }, { v: 3, l: "3rd" }, { v: 4, l: "4th" }, { v: 5, l: "Last" }];
  const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium mb-1 block text-muted-foreground flex items-center gap-1">
        <Repeat2 className="w-3 h-3" /> Repeat
      </label>

      {/* Pattern type selector */}
      <div className="flex gap-1 flex-wrap">
        {(requireRecurrence
          ? (["daily", "weekly", "monthly", "quarterly", "yearly"] as const)
          : (["none", "daily", "weekly", "monthly", "quarterly", "yearly"] as const)
        ).map(t => (
          <Button key={t} variant={recType === t ? "default" : "outline"} size="sm"
            className="h-7 text-xs px-2.5 flex-1"
            onClick={() => {
              setRecType(t);
              emitChange(t, interval, weeklyDays, monthMode, dayOfMonth, weekOfMonth, dayOfWeek);
            }}>
            {t === "none" ? "None" : t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {recType !== "none" && (
        <div className="space-y-2 pl-1">
          {/* Interval: every N */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Every</span>
            <Select value={String(interval)} onValueChange={v => {
              const n = Number(v); setInterval(n);
              emitChange(recType, n, weeklyDays, monthMode, dayOfMonth, weekOfMonth, dayOfWeek);
            }}>
              <SelectTrigger className="text-sm h-7 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5,6,8,10,12].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {recType === "daily" ? (interval === 1 ? "day" : "days") : recType === "weekly" ? (interval === 1 ? "week" : "weeks") : recType === "quarterly" ? (interval === 1 ? "quarter" : "quarters") : recType === "yearly" ? (interval === 1 ? "year" : "years") : (interval === 1 ? "month" : "months")}
            </span>
          </div>

          {/* Weekly: day toggles */}
          {recType === "weekly" && (
            <div className="flex gap-1 flex-wrap">
              {DAYS_OF_WEEK.map(d => (
                <Button key={d.value} variant={weeklyDays.includes(d.value) ? "default" : "outline"}
                  size="sm" className="h-7 w-9 text-xs px-0"
                  onClick={() => toggleDay(d.value)}>
                  {d.label.charAt(0)}
                </Button>
              ))}
            </div>
          )}

          {/* Monthly: date or weekday pattern */}
          {recType === "monthly" && (
            <div className="space-y-2">
              <div className="flex gap-1">
                <Button variant={monthMode === "date" ? "default" : "outline"} size="sm" className="h-7 text-xs flex-1"
                  onClick={() => { setMonthMode("date"); emitChange("monthly", interval, weeklyDays, "date", dayOfMonth, weekOfMonth, dayOfWeek); }}>
                  Day of month
                </Button>
                <Button variant={monthMode === "weekday" ? "default" : "outline"} size="sm" className="h-7 text-xs flex-1"
                  onClick={() => { setMonthMode("weekday"); emitChange("monthly", interval, weeklyDays, "weekday", dayOfMonth, weekOfMonth, dayOfWeek); }}>
                  Weekday pattern
                </Button>
              </div>

              {monthMode === "date" ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">On day</span>
                  <Select value={String(dayOfMonth)} onValueChange={v => {
                    const n = Number(v); setDayOfMonth(n);
                    emitChange("monthly", interval, weeklyDays, "date", n, weekOfMonth, dayOfWeek);
                  }}>
                    <SelectTrigger className="text-sm h-7 w-16"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {MONTH_DAYS.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">The</span>
                  <Select value={String(weekOfMonth)} onValueChange={v => {
                    const n = Number(v); setWeekOfMonth(n);
                    emitChange("monthly", interval, weeklyDays, "weekday", dayOfMonth, n, dayOfWeek);
                  }}>
                    <SelectTrigger className="text-sm h-7 w-[70px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORDINALS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={dayOfWeek} onValueChange={v => {
                    setDayOfWeek(v);
                    emitChange("monthly", interval, weeklyDays, "weekday", dayOfMonth, weekOfMonth, v);
                  }}>
                    <SelectTrigger className="text-sm h-7 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADD TASK DIALOG
// ============================================================

function AddTaskDialog({ open, onOpenChange, areas, defaultDate, defaultAreaId }: {
  open: boolean; onOpenChange: (open: boolean) => void; areas: Area[]; defaultDate: string; defaultAreaId?: number | null;
}) {
  const [goal, setGoal] = useState("");
  const [areaId, setAreaId] = useState<string>(defaultAreaId ? String(defaultAreaId) : "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [recurrenceJson, setRecurrenceJson] = useState<string | null>(null);

  // Reset areaId when dialog opens with a new defaultAreaId
  const [prevDefaultArea, setPrevDefaultArea] = useState(defaultAreaId);
  if (defaultAreaId !== prevDefaultArea) {
    setPrevDefaultArea(defaultAreaId);
    if (defaultAreaId) setAreaId(String(defaultAreaId));
  }

  // Auto-calc hours
  const hours = useMemo(() => {
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = (eh * 60 + em - sh * 60 - sm) / 60;
    return diff > 0 ? diff.toFixed(2) : "";
  }, [startTime, endTime]);

  // Group areas by category
  const groupedAreas = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    areas.forEach(a => {
      const cat = a.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    return groups;
  }, [areas]);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date,
      areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      goal,
      startTime: startTime || null,
      endTime: endTime || null,
      hours: hours || null,
      status: "planned",
      recurrence: recurrenceJson,
    }),
    onSuccess: () => {
      setGoal(""); setAreaId(defaultAreaId ? String(defaultAreaId) : ""); setStartTime(""); setEndTime(""); setRecurrenceJson(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", date] });
      if (defaultAreaId) {
        queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "area", defaultAreaId] });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">What</label>
            <Input value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="What needs to be done?" className="text-sm" data-testid="input-task-goal" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-md bg-card text-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Area</label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No area</SelectItem>
                  {CATEGORY_ORDER.map(cat => {
                    const catAreas = groupedAreas[cat];
                    if (!catAreas) return null;
                    return catAreas.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        <span className="text-xs text-muted-foreground mr-1">{cat.substring(0, 3)}.</span>
                        {a.name}
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Time pickers — select-based, not native input */}
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <TimePicker label="Start" value={startTime} onChange={setStartTime} />
            <TimePicker label="End" value={endTime} onChange={setEndTime} />
            <div className="flex-shrink-0">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Hours</label>
              <div className="h-9 px-2 text-sm border rounded-md bg-muted/50 flex items-center text-muted-foreground min-w-[48px]">
                {hours ? `${parseFloat(hours).toFixed(1)}h` : "Auto"}
              </div>
            </div>
          </div>

          {/* Recurrence builder */}
          <RecurrenceBuilder value={recurrenceJson} onChange={setRecurrenceJson} />

          <Button className="w-full" disabled={!goal.trim() || !areaId || areaId === "none" || !startTime || !endTime} onClick={() => create.mutate()}
            data-testid="button-save-task">
            Add Task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// AREA DETAIL VIEW — Per-area history + planning
// ============================================================

function AreaDetailView({ areaId, areas, onBack }: { areaId: number; areas: Area[]; onBack: () => void }) {
  const area = areas.find(a => a.id === areaId);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "area", areaId],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?areaId=${areaId}`).then(r => r.json()),
  });

  // Group by date
  const dateGroups = useMemo(() => {
    const groups: Record<string, PlannerTask[]> = {};
    tasks.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    // Sort dates descending
    const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    return sorted;
  }, [tasks]);

  // Stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const totalHours = tasks.reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "area", areaId] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planner-tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "area", areaId] }),
  });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{area?.name || "Area"}</h1>
          {area?.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{area.description}</p>
          )}
        </div>
        {area?.category && (
          <Badge className={`text-[10px] ${CATEGORY_COLORS[area.category] || ""}`}>
            {area.category}
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <History className="w-3 h-3" /> {totalTasks} entries
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> {doneTasks} done
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {totalHours.toFixed(1)}h total
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-6 text-xs gap-1"
          onClick={() => setShowAddDialog(true)}>
          <Plus className="w-3 h-3" /> Plan
        </Button>
      </div>

      {/* Task history by date */}
      {dateGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs mt-1">Plan tasks for this area to start building your history.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dateGroups.map(([date, dateTasks]) => {
            const sortedDayTasks = [...dateTasks].sort((a, b) =>
              (a.startTime || "99:99").localeCompare(b.startTime || "99:99")
            );
            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold">{formatDateLabel(date)}</span>
                  <span className="text-[10px] text-muted-foreground">{getDayOfWeek(date)}</span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">
                    {dateTasks.filter(t => t.status === "done").length}/{dateTasks.length}
                  </span>
                </div>
                <div className="space-y-1 ml-2">
                  {sortedDayTasks.map(task => {
                    const isDone = task.status === "done";
                    return (
                      <div key={task.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-md group hover:bg-muted/50 ${isDone ? "opacity-60" : ""}`}>
                        <button
                          onClick={() => updateStatus.mutate({ id: task.id, status: isDone ? "planned" : "done" })}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isDone ? "border-primary bg-primary" : "border-muted-foreground/30 hover:border-primary/50"
                          }`}
                        >
                          {isDone && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${isDone ? "line-through" : ""}`}>{task.goal}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {task.startTime && (
                              <span>{formatTime12h(task.startTime)}{task.endTime ? ` – ${formatTime12h(task.endTime)}` : ""}</span>
                            )}
                            {task.hours && <span>{parseFloat(task.hours).toFixed(1)}h</span>}
                            {task.recurrence && (
                              <span className="flex items-center gap-0.5 text-violet-600 dark:text-violet-400">
                                <Repeat className="w-2.5 h-2.5" />
                                {formatRecurrence(task.recurrence)}
                              </span>
                            )}
                            {task.result && <span className="italic">→ {task.result}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm"
                          className="h-5 w-5 p-0 text-destructive opacity-0 group-hover:opacity-100"
                          onClick={() => deleteTask.mutate(task.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Dialog for this area */}
      {showAddDialog && (
        <AddTaskDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          areas={areas}
          defaultDate={getToday()}
          defaultAreaId={areaId}
        />
      )}
    </div>
  );
}

// ============================================================
// CONVERT TASK TO HABIT DIALOG
// ============================================================
const TIME_OF_DAY_CATEGORIES = [
  { value: "early_morning", label: "Early Morning", range: "12:00 AM – 5:59 AM" },
  { value: "morning", label: "Morning", range: "6:00 AM – 8:59 AM" },
  { value: "late_morning", label: "Late Morning", range: "9:00 AM – 11:59 AM" },
  { value: "afternoon", label: "Afternoon", range: "12:00 PM – 2:59 PM" },
  { value: "late_afternoon", label: "Late Afternoon", range: "3:00 PM – 5:59 PM" },
  { value: "evening", label: "Evening", range: "6:00 PM – 11:59 PM" },
  { value: "waking_hours", label: "Waking Hours", range: "8:00 AM – 7:59 PM" },
];

function timeToCategory(time: string | null): string {
  if (!time) return "";
  const h = parseInt(time.split(":")[0]);
  if (h < 6) return "early_morning";
  if (h < 9) return "morning";
  if (h < 12) return "late_morning";
  if (h < 15) return "afternoon";
  if (h < 18) return "late_afternoon";
  return "evening";
}

function ConvertToHabitDialog({ task, area, open, onOpenChange }: {
  task: PlannerTask; area?: Area; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const [action, setAction] = useState(task.goal);
  const [timeOfDay, setTimeOfDay] = useState(timeToCategory(task.startTime));
  const [recurrenceJson, setRecurrenceJson] = useState<string | null>(
    task.recurrence || JSON.stringify({ type: "daily", interval: 1 })
  );
  const [cue, setCue] = useState("");
  const [because, setBecause] = useState("");
  const [reward, setReward] = useState("");

  const resetForm = () => {
    setAction(task.goal);
    setTimeOfDay(timeToCategory(task.startTime));
    setRecurrenceJson(task.recurrence || JSON.stringify({ type: "daily", interval: 1 }));
    setCue("");
    setBecause("");
    setReward("");
  };

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/habits", {
      name: action,
      areaId: task.areaId || null,
      timeOfDay: timeOfDay || null,
      craving: because || null,
      reward: reward || null,
      response: action,
      cue: cue || null,
      identityId: null,
      frequency: recurrenceJson || JSON.stringify({ type: "daily", interval: 1 }),
      targetCount: 1,
      active: 1,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routine-items"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Make This a Habit
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          This will create a habit and a draft routine item you can schedule.
        </p>
        <div className="space-y-4 pt-1">
          {area && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">In the area of...</p>
              <div className="text-sm px-3 py-2 rounded-md border bg-muted/50">{area.name}</div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I am the type of person who...</p>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. day-to-day activity in this area of your ideal life"
              data-testid="convert-habit-name"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...when...</p>
            <Input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              placeholder="e.g. triggering/reminding action"
              data-testid="convert-habit-cue"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...in the...</p>
            <Select value={timeOfDay} onValueChange={setTimeOfDay}>
              <SelectTrigger data-testid="convert-habit-time">
                <SelectValue placeholder="Select time of day" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OF_DAY_CATEGORIES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} <span className="text-xs text-muted-foreground ml-1">({t.range})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <RecurrenceBuilder
            value={recurrenceJson}
            onChange={setRecurrenceJson}
            requireRecurrence
          />

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...because...</p>
            <Input
              value={because}
              onChange={(e) => setBecause(e.target.value)}
              placeholder="e.g. what's attractive about it? why crave it?"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I'll be rewarded by...</p>
            <Input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. describe how it satisfies you"
            />
          </div>

          <Button
            className="w-full"
            disabled={!action.trim() || create.isPending}
            onClick={() => create.mutate()}
            data-testid="button-convert-habit"
          >
            {create.isPending ? "Creating..." : "Create Habit & Draft Routine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
