import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FolderOpen, Users, MapPin, Package, Plus, Clock, CheckCircle2,
  Repeat, Archive,
} from "lucide-react";
import { useState } from "react";
import type { Habit, Identity, Area, RoutineItem, PlannerTask } from "@shared/schema";
import { formatRecurrence } from "./planner";

interface HabitProjectDetails {
  habitId: number;
  habit: Habit;
  identity: Identity | null;
  area: Area | null;
  areas: Area[];
  title: string;
  tag: string;
  routineItems: RoutineItem[];
  plannerTasks: PlannerTask[];
}

// Task categories for project environment setup
const TASK_CATEGORIES = [
  { key: "people", label: "People", icon: Users, description: "Who supports this habit?" },
  { key: "places", label: "Places", icon: MapPin, description: "Where does this happen?" },
  { key: "things", label: "Things", icon: Package, description: "What do you need?" },
];

export default function ProjectDetailPage({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery<HabitProjectDetails>({
    queryKey: ["/api/habit-projects", id],
    queryFn: () => apiRequest("GET", `/api/habit-projects/${id}`).then(r => r.json()),
    enabled: !!id && id > 0,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-destructive">Failed to load project: {(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const { habit, identity, area, title, tag, routineItems, plannerTasks } = data;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        {tag && (
          <Badge variant="outline" className="text-[10px] mb-1">{tag}</Badge>
        )}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>
        {area && (
          <p className="text-[11px] text-muted-foreground mt-1">
            In the area of <span className="font-medium text-foreground">{area.name}</span>
          </p>
        )}
      </div>

      {/* Habit Details Card */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Habit Chain</p>
          {identity && (
            <p className="text-sm">
              <span className="text-muted-foreground">I am the type of person who</span>{" "}
              <span className="font-medium">{identity.statement}</span>
            </p>
          )}
          {habit.cue && (
            <p className="text-sm">
              <span className="text-muted-foreground">When</span>{" "}
              <span className="font-medium">{habit.cue}</span>
            </p>
          )}
          {habit.craving && (
            <p className="text-sm">
              <span className="text-muted-foreground">Because</span>{" "}
              <span className="font-medium">{habit.craving}</span>
            </p>
          )}
          {habit.reward && (
            <p className="text-sm">
              <span className="text-muted-foreground">Rewarded by</span>{" "}
              <span className="font-medium">{habit.reward}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              <Repeat className="w-2.5 h-2.5 mr-0.5" />
              {formatRecurrence(habit.frequency)}
            </Badge>
            {routineItems.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-violet-600 dark:text-violet-400 border-violet-500/30">
                {routineItems.length} routine{routineItems.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* People / Places / Things */}
      {TASK_CATEGORIES.map(cat => (
        <TaskCategorySection
          key={cat.key}
          category={cat.key}
          label={cat.label}
          icon={cat.icon}
          description={cat.description}
          habitId={id}
        />
      ))}

      {/* Related Planner Tasks */}
      {plannerTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Scheduled Tasks ({plannerTasks.length})
          </p>
          {plannerTasks.slice(0, 5).map(t => (
            <Card key={t.id} className={t.status === "done" ? "opacity-50" : ""}>
              <CardContent className="p-3 flex items-center gap-2">
                {t.status === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${t.status === "done" ? "line-through" : ""}`}>{t.goal}</p>
                  <p className="text-[10px] text-muted-foreground">{t.date}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TASK CATEGORY SECTION (People / Places / Things)
// ============================================================

function TaskCategorySection({ category, label, icon: Icon, description, habitId }: {
  category: string; label: string; icon: typeof Users; description: string; habitId: number;
}) {
  const [newItem, setNewItem] = useState("");

  // Store tasks in planner_tasks with a special sourceType
  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "project", habitId, category],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?habitId=${habitId}&sourceType=project_${category}`).then(r => r.json()),
    retry: 2,
  });

  const addTask = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date: new Date().toISOString().split("T")[0],
      goal: newItem,
      habitId,
      sourceType: `project_${category}`,
      status: "planned",
      isDraft: 0,
    }),
    onSuccess: () => {
      setNewItem("");
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, category] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: status === "done" ? "planned" : "done" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, category] });
    },
  });

  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-medium">{label}</h2>
        <span className="text-[10px] text-muted-foreground">{description}</span>
      </div>

      {/* Add item */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) addTask.mutate(); }}
        className="flex gap-2"
      >
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Add ${label.toLowerCase()} item...`}
          className="flex-1 text-sm h-8"
        />
        <Button type="submit" size="sm" className="h-8" disabled={!newItem.trim()}>
          <Plus className="w-3 h-3" />
        </Button>
      </form>

      {/* Pending items */}
      {pending.map(t => (
        <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors">
          <button
            onClick={() => toggleTask.mutate({ id: t.id, status: t.status })}
            className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 shrink-0"
          />
          <span className="text-sm flex-1">{t.goal}</span>
        </div>
      ))}

      {/* Done items */}
      {done.map(t => (
        <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50">
          <button
            onClick={() => toggleTask.mutate({ id: t.id, status: t.status })}
            className="w-4 h-4 rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center"
          >
            <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />
          </button>
          <span className="text-sm flex-1 line-through">{t.goal}</span>
        </div>
      ))}

      {tasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2">No items yet</p>
      )}
    </div>
  );
}
