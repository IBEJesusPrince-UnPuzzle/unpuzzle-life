import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Target, Plus, Trash2, CheckCircle2,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Identity, Habit, HabitLog, Area } from "@shared/schema";
import { RecurrenceBuilder, formatRecurrence } from "./planner";

export const TIME_OF_DAY_CATEGORIES = [
  { value: "early_morning", label: "Early Morning", range: "12:00 AM – 5:59 AM" },
  { value: "morning", label: "Morning", range: "6:00 AM – 8:59 AM" },
  { value: "late_morning", label: "Late Morning", range: "9:00 AM – 11:59 AM" },
  { value: "afternoon", label: "Afternoon", range: "12:00 PM – 2:59 PM" },
  { value: "late_afternoon", label: "Late Afternoon", range: "3:00 PM – 5:59 PM" },
  { value: "evening", label: "Evening", range: "6:00 PM – 11:59 PM" },
  { value: "waking_hours", label: "Waking Hours", range: "8:00 AM – 7:59 PM" },
];

const CATEGORY_ORDER = ["UnPuzzle", "Chores", "Routines", "Life", "Getting Things Done"];

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export default function HabitsPage() {
  const today = getToday();

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: habits = [] } = useQuery<Habit[]>({ queryKey: ["/api/habits"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: todayLogs = [] } = useQuery<HabitLog[]>({
    queryKey: ["/api/habit-logs", today],
    queryFn: () => apiRequest("GET", `/api/habit-logs?date=${today}`).then(r => r.json()),
  });

  const activeHabits = habits.filter(h => h.active);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Identity & Habits</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          "Every action you take is a vote for the type of person you wish to become."
        </p>
      </div>

      {/* Habit Tracker */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Habit Systems</h2>
          <Badge variant="secondary" className="text-xs">
            {todayLogs.length}/{activeHabits.length} today
          </Badge>
        </div>

        {activeHabits.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No habits yet</p>
              <p className="text-xs mt-1">Build your identity-driven habit systems below.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeHabits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} todayLogs={todayLogs} identities={identities} areas={areas} today={today} />
            ))}
          </div>
        )}

        <NewHabitForm areas={areas} identities={identities} />
      </div>
    </div>
  );
}

// ============================================================
// HABIT ROW
// ============================================================
export function HabitRow({ habit, todayLogs, identities, areas, today }: {
  habit: Habit; todayLogs: HabitLog[]; identities: Identity[]; areas: Area[]; today: string;
}) {
  const log = todayLogs.find(l => l.habitId === habit.id);
  const isDone = !!log;
  const identity = identities.find(i => i.id === habit.identityId);
  const area = areas.find(a => a.id === habit.areaId);
  const timeOfDay = TIME_OF_DAY_CATEGORIES.find(t => t.value === habit.timeOfDay);
  const [editOpen, setEditOpen] = useState(false);

  const logHabit = useMutation({
    mutationFn: () => apiRequest("POST", "/api/habit-logs", { habitId: habit.id, date: today, count: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habit-logs", today] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const removeLog = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/habit-logs/${log!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habit-logs", today] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const deleteHabit = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/habits/${habit.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <>
      <Card className="group" role="button" onClick={() => setEditOpen(true)} data-testid={`habit-card-${habit.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); isDone ? removeLog.mutate() : logHabit.mutate(); }}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                isDone
                  ? "border-primary bg-primary scale-110"
                  : "border-muted-foreground/30 hover:border-primary/50"
              }`}
              data-testid={`habit-check-${habit.id}`}
            >
              {isDone && <CheckCircle2 className="w-4 h-4 text-primary-foreground" />}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                  {habit.name}
                </p>
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {formatRecurrence(habit.frequency)}
                </Badge>
                {timeOfDay && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-orange-600 dark:text-orange-400 border-orange-500/30">
                    {timeOfDay.label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {area && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {area.name}
                  </span>
                )}
                {identity && (
                  <p className="text-[11px] text-muted-foreground">
                    Identity: {identity.statement}
                  </p>
                )}
              </div>
              {habit.craving && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5 italic">
                  because {habit.craving}
                </p>
              )}
            </div>

            <Button variant="ghost" size="sm" className="text-destructive h-7 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); deleteHabit.mutate(); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditHabitDialog habit={habit} areas={areas} identities={identities} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ============================================================
// NEW HABIT FORM — Identity Sentence Builder
// ============================================================
export function NewHabitForm({ areas, identities }: { areas: Area[]; identities: Identity[] }) {
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState<string>("");
  const [action, setAction] = useState("");
  const [identityId, setIdentityId] = useState<number | null>(null);
  const [cue, setCue] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<string>("");
  const [recurrenceJson, setRecurrenceJson] = useState<string | null>(JSON.stringify({ type: "daily", interval: 1 }));
  const [because, setBecause] = useState("");
  const [reward, setReward] = useState("");

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
    mutationFn: () => apiRequest("POST", "/api/habits", {
      name: action,
      areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      timeOfDay: timeOfDay || null,
      craving: because || null,
      reward: reward || null,
      response: action,
      cue: cue || null,
      identityId: identityId,
      frequency: recurrenceJson || JSON.stringify({ type: "daily", interval: 1 }),
      targetCount: 1,
      active: 1,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setAction(""); setAreaId(""); setTimeOfDay(""); setCue(""); setBecause(""); setReward("");
      setIdentityId(null);
      setRecurrenceJson(JSON.stringify({ type: "daily", interval: 1 }));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks/drafts"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-dashed" data-testid="button-new-habit">
          <Plus className="w-4 h-4 mr-1" /> New Habit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Build Your Habit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* "In the..." */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">In the area of...</p>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger data-testid="select-habit-area">
                <SelectValue placeholder="Select an area" />
              </SelectTrigger>
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

          {/* "...I am the type of person who..." */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I am the type of person who...</p>
            <Select value={action} onValueChange={(val) => {
              setAction(val);
              const match = identities.find(i => i.statement === val);
              setIdentityId(match?.id ?? null);
            }}>
              <SelectTrigger data-testid="select-habit-identity">
                <SelectValue placeholder="Select an identity statement" />
              </SelectTrigger>
              <SelectContent>
                {identities.map(id => (
                  <SelectItem key={id.id} value={id.statement}>
                    {id.statement}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* "...when..." (cue) */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...when...</p>
            <Input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              placeholder='e.g. triggering/reminding action'
              data-testid="input-habit-cue"
            />
          </div>

          {/* "...in the..." */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...in the...</p>
            <Select value={timeOfDay} onValueChange={setTimeOfDay}>
              <SelectTrigger data-testid="select-habit-time">
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

          {/* Recurrence */}
          <RecurrenceBuilder
            value={recurrenceJson}
            onChange={setRecurrenceJson}
            requireRecurrence
          />

          {/* "...because..." */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...because...</p>
            <Input
              value={because}
              onChange={(e) => setBecause(e.target.value)}
              placeholder="e.g. it's delicious, I have fun, I don't like the feeling of being rushed"
            />
          </div>

          {/* "...I'll be rewarded by..." */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I'll be rewarded by...</p>
            <Input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. making my tummy smile, resetting my nervous system, having beautiful memories"
            />
          </div>

          <Button
            className="w-full"
            disabled={!action.trim()}
            onClick={() => create.mutate()}
            data-testid="button-save-habit"
          >
            Create Habit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// EDIT HABIT DIALOG
// ============================================================
export function EditHabitDialog({ habit, areas, identities, open, onOpenChange }: {
  habit: Habit; areas: Area[]; identities: Identity[]; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const [areaId, setAreaId] = useState(habit.areaId ? String(habit.areaId) : "");
  const [action, setAction] = useState(habit.name);
  const [identityId, setIdentityId] = useState<number | null>(habit.identityId ?? null);
  const [cue, setCue] = useState(habit.cue || "");
  const [timeOfDay, setTimeOfDay] = useState(habit.timeOfDay || "");
  const [recurrenceJson, setRecurrenceJson] = useState<string | null>(habit.frequency);
  const [because, setBecause] = useState(habit.craving || "");
  const [reward, setReward] = useState(habit.reward || "");

  // Reset form when dialog reopens
  const resetForm = () => {
    setAreaId(habit.areaId ? String(habit.areaId) : "");
    setAction(habit.name);
    setIdentityId(habit.identityId ?? null);
    setCue(habit.cue || "");
    setTimeOfDay(habit.timeOfDay || "");
    setRecurrenceJson(habit.frequency);
    setBecause(habit.craving || "");
    setReward(habit.reward || "");
  };

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
    mutationFn: async () => {
      const data = {
        name: action,
        areaId: areaId && areaId !== "none" ? Number(areaId) : null,
        timeOfDay: timeOfDay || null,
        craving: because || null,
        reward: reward || null,
        response: action,
        cue: cue || null,
        identityId: identityId,
        frequency: recurrenceJson || JSON.stringify({ type: "daily", interval: 1 }),
      };
      const res = await apiRequest("PATCH", `/api/habits/${habit.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routine-items"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Habit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">In the area of...</p>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger data-testid="edit-habit-area">
                <SelectValue placeholder="Select an area" />
              </SelectTrigger>
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

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I am the type of person who...</p>
            <Select value={action} onValueChange={(val) => {
              setAction(val);
              const match = identities.find(i => i.statement === val);
              setIdentityId(match?.id ?? null);
            }}>
              <SelectTrigger data-testid="edit-habit-name">
                <SelectValue placeholder="Select an identity statement" />
              </SelectTrigger>
              <SelectContent>
                {identities.map(id => (
                  <SelectItem key={id.id} value={id.statement}>
                    {id.statement}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* "...when..." (cue) */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...when...</p>
            <Input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              placeholder='e.g. triggering/reminding action'
              data-testid="edit-habit-cue"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...in the...</p>
            <Select value={timeOfDay} onValueChange={setTimeOfDay}>
              <SelectTrigger data-testid="edit-habit-time">
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
              placeholder="e.g. it's delicious, I have fun"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">...I'll be rewarded by...</p>
            <Input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. making my tummy smile"
            />
          </div>

          <Button
            className="w-full"
            disabled={!action.trim() || update.isPending}
            onClick={() => update.mutate()}
            data-testid="button-update-habit"
          >
            {update.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
