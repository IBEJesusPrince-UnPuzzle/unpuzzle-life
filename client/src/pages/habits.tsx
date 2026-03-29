import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Identity, Habit, HabitLog } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getLast7Days() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function getDayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" }).charAt(0);
}

export default function HabitsPage() {
  const today = getToday();
  const last7 = getLast7Days();

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: habits = [] } = useQuery<Habit[]>({ queryKey: ["/api/habits"] });
  const { data: todayLogs = [] } = useQuery<HabitLog[]>({
    queryKey: ["/api/habit-logs", today],
    queryFn: () => apiRequest("GET", `/api/habit-logs?date=${today}`).then(r => r.json()),
  });

  // Fetch logs for last 7 days for streaks
  const allLogs = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    todayLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = new Set();
      map[l.date].add(l.habitId);
    });
    return map;
  }, [todayLogs]);

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
              <p className="text-xs mt-1">Create identity statements first, then attach habits to them.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeHabits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} todayLogs={todayLogs} identities={identities} today={today} last7={last7} />
            ))}
          </div>
        )}

        <NewHabitForm identities={identities} />
      </div>
    </div>
  );
}

// ============================================================
// HABIT ROW
// ============================================================
function HabitRow({ habit, todayLogs, identities, today, last7 }: {
  habit: Habit; todayLogs: HabitLog[]; identities: Identity[]; today: string; last7: string[];
}) {
  const log = todayLogs.find(l => l.habitId === habit.id);
  const isDone = !!log;
  const identity = identities.find(i => i.id === habit.identityId);

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
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => isDone ? removeLog.mutate() : logHabit.mutate()}
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
            <div className="flex items-center gap-2">
              <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                {habit.name}
              </p>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {habit.frequency.startsWith("weekly:") 
                  ? `${habit.frequency.split(":")[1].charAt(0).toUpperCase()}${habit.frequency.split(":")[1].slice(1, 3)}`
                  : habit.frequency}
              </Badge>
            </div>
            {identity && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Identity: {identity.statement}
              </p>
            )}
            {habit.cue && (
              <p className="text-[11px] text-primary/70 mt-0.5">
                I'll {habit.cue} → I will {habit.response}
              </p>
            )}
          </div>

          <Button variant="ghost" size="sm" className="text-destructive h-7 opacity-0 group-hover:opacity-100"
            onClick={() => deleteHabit.mutate()}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// NEW HABIT FORM
// ============================================================
function NewHabitForm({ identities }: { identities: Identity[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState<string>("");
  const [cue, setCue] = useState("");
  const [response, setResponse] = useState("");
  const [reward, setReward] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [weeklyDay, setWeeklyDay] = useState("monday");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/habits", {
      name,
      identityId: identityId && identityId !== "none" ? Number(identityId) : null,
      cue: cue || null,
      response: response || null,
      reward: reward || null,
      frequency: frequency === "weekly" ? `weekly:${weeklyDay}` : frequency,
      targetCount: 1,
      active: 1,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setName(""); setIdentityId(""); setCue(""); setResponse(""); setReward("");
      setFrequency("daily"); setWeeklyDay("monday"); setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-dashed" data-testid="button-new-habit">
          <Plus className="w-4 h-4 mr-1" /> New Habit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">Create a Habit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Habit name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning run" data-testid="input-habit-name" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Linked identity</label>
            <Select value={identityId} onValueChange={setIdentityId}>
              <SelectTrigger><SelectValue placeholder="Which identity does this reinforce?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {identities.map(i => (
                  <SelectItem key={i.id} value={String(i.id)}>...who {i.statement}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Frequency</label>
            <div className="flex gap-2">
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className={frequency === "weekly" ? "flex-1" : ""}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekend">Weekend</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {frequency === "weekly" && (
                <Select value={weeklyDay} onValueChange={setWeeklyDay}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="tuesday">Tuesday</SelectItem>
                    <SelectItem value="wednesday">Wednesday</SelectItem>
                    <SelectItem value="thursday">Thursday</SelectItem>
                    <SelectItem value="friday">Friday</SelectItem>
                    <SelectItem value="saturday">Saturday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Habit Stack (optional)
            </p>
            <div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-1">Make it Obvious</p>
              <Input value={cue} onChange={(e) => setCue(e.target.value)}
                placeholder="I'll... (e.g. hear my alarm go off)" className="text-sm" />
            </div>
            <div>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-1">Make it Easy</p>
              <Input value={response} onChange={(e) => setResponse(e.target.value)}
                placeholder="I will... (e.g. put on my running shoes)" className="text-sm" />
            </div>
            <div>
              <p className="text-[10px] text-primary mb-1">Make it Satisfying</p>
              <Input value={reward} onChange={(e) => setReward(e.target.value)}
                placeholder="and I'll be rewarded by... (e.g. energy for the day)" className="text-sm" />
            </div>
          </div>

          <Button className="w-full" disabled={!name.trim()} onClick={() => create.mutate()} data-testid="button-save-habit">
            Create Habit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
