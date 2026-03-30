import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, Fingerprint, Clock, AlertTriangle, Inbox as InboxIcon,
  Target, Plus, ArrowRight
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Action, Habit, HabitLog, Area } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const today = getToday();
  const [quickCapture, setQuickCapture] = useState("");
  const [captureAreaId, setCaptureAreaId] = useState<string>("");

  const { data: stats, isLoading: statsLoading } = useQuery<{
    identityVotePercent: number;
    pendingActionsCount: number;
    missedTasksCount: number;
    inboxCount: number;
    // keep old ones for compatibility
    pendingActions: number;
    completedToday: number;
    activeProjects: number;
    habitsCompletedToday: number;
    totalActiveHabits: number;
  }>({ queryKey: ["/api/stats"] });

  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const { data: actions = [] } = useQuery<Action[]>({ queryKey: ["/api/actions"] });
  const { data: habits = [] } = useQuery<Habit[]>({ queryKey: ["/api/habits"] });
  const { data: todayLogs = [] } = useQuery<HabitLog[]>({
    queryKey: ["/api/habit-logs", today],
    queryFn: () => apiRequest("GET", `/api/habit-logs?date=${today}`).then(r => r.json()),
  });

  const pendingActions = actions.filter(a => !a.completed).slice(0, 8);
  const activeHabits = habits.filter(h => h.active);

  const completeAction = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/actions/${id}`, {
      completed: 1,
      completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const logHabit = useMutation({
    mutationFn: (habitId: number) => apiRequest("POST", "/api/habit-logs", {
      habitId, date: today, count: 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habit-logs", today] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const removeHabitLog = useMutation({
    mutationFn: (logId: number) => apiRequest("DELETE", `/api/habit-logs/${logId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habit-logs", today] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const captureToInbox = useMutation({
    mutationFn: ({ content, areaId }: { content: string; areaId: number | null }) =>
      apiRequest("POST", "/api/inbox", {
        content,
        areaId,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setQuickCapture("");
      setCaptureAreaId("");
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const habitsDone = todayLogs.length;
  const habitsTotal = activeHabits.length;
  const habitPercent = habitsTotal > 0 ? Math.round((habitsDone / habitsTotal) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-greeting">
          {getGreeting()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Quick Capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (quickCapture.trim() && captureAreaId) {
            captureToInbox.mutate({
              content: quickCapture.trim(),
              areaId: captureAreaId && captureAreaId !== "none" ? Number(captureAreaId) : null,
            });
          }
        }}
        className="flex flex-col sm:flex-row gap-2 sm:items-end"
      >
        <Input
          placeholder="What's on your mind? Brain dump here..."
          value={quickCapture}
          onChange={(e) => setQuickCapture(e.target.value)}
          className="flex-1"
          data-testid="input-quick-capture"
        />
        <div className="flex gap-2">
          <Select value={captureAreaId} onValueChange={setCaptureAreaId}>
            <SelectTrigger className="text-sm w-40">
              <SelectValue placeholder="Related Area..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No area</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={!quickCapture.trim() || !captureAreaId} data-testid="button-capture">
            <Plus className="w-4 h-4 mr-1" /> Capture
          </Button>
        </div>
      </form>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Link href="/horizons">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Fingerprint className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.identityVotePercent || 0}%</p>
                    <p className="text-xs text-muted-foreground">Identity Vote</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/routine">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-chart-4/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-chart-4" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.pendingActionsCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Pending Actions</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/planner">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.missedTasksCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Missed Tasks</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/inbox">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-chart-5/10 flex items-center justify-center">
                    <InboxIcon className="w-4 h-4 text-chart-5" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.inboxCount || 0}</p>
                    <p className="text-xs text-muted-foreground">In Inbox</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* Two columns: Today's Habits + Next Actions */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Today's Habits */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Today's Habits</CardTitle>
            <Link href="/horizons">
              <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-all-habits">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {activeHabits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No habits yet</p>
                <Link href="/horizons">
                  <Button variant="outline" size="sm" className="mt-3 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Create your first habit
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {activeHabits.map((habit) => {
                  const log = todayLogs.find(l => l.habitId === habit.id);
                  const isDone = !!log;
                  return (
                    <button
                      key={habit.id}
                      onClick={() => isDone ? removeHabitLog.mutate(log!.id) : logHabit.mutate(habit.id)}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left transition-colors ${
                        isDone ? "bg-primary/5" : "hover:bg-accent"
                      }`}
                      data-testid={`habit-toggle-${habit.id}`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isDone ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {isDone && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className={`text-sm flex-1 ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {habit.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Actions */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Next Actions</CardTitle>
            <Link href="/horizons">
              <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-all-actions">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingActions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">All caught up</p>
              </div>
            ) : (
              <div className="space-y-1">
                {pendingActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      checked={!!action.completed}
                      onCheckedChange={() => completeAction.mutate(action.id)}
                      data-testid={`action-check-${action.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{action.title}</p>
                      {action.context && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5 h-4 px-1">
                          {action.context}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
