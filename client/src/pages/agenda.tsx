import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Check, Repeat2, CheckSquare, Shield, Users, Layers, List,
} from "lucide-react";
import { getPieceColor } from "@/lib/piece-colors";
import type { Identity, Area, PlannerTask, Responsibility, Role } from "@shared/schema";

type StreamType = "routine" | "task" | "responsibility" | "role";

interface AgendaItem {
  key: string;
  type: StreamType;
  label: string;
  subtitle?: string;
  puzzlePiece?: string | null;
  onToggle: () => void;
  done: boolean;
  pending: boolean;
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

const DOW_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isWeekday(dow: number) {
  return dow >= 1 && dow <= 5;
}

function frequencyMatchesToday(frequency: string | null | undefined, dow: number): boolean {
  if (!frequency) return false;
  const f = frequency.toLowerCase();
  if (f === "daily") return true;
  if (f === "weekdays") return isWeekday(dow);
  if (f === "weekend" || f === "weekends") return !isWeekday(dow);
  // "weekly:monday" or specific day name
  if (f.startsWith("weekly:")) {
    const day = f.split(":")[1];
    return day === DOW_NAMES[dow];
  }
  if (DOW_NAMES.includes(f)) return f === DOW_NAMES[dow];
  return false;
}

function cadenceMatchesToday(cadence: string | null | undefined, dayOfWeek: string | null | undefined, dow: number): boolean {
  if (!cadence) return false;
  const c = cadence.toLowerCase();
  if (c === "daily") return true;
  if (c === "weekdays") return isWeekday(dow);
  if (c === "weekend" || c === "weekends") return !isWeekday(dow);
  if (c === "weekly" || c === "biweekly" || c === "monthly") {
    if (!dayOfWeek) return false;
    return dayOfWeek.toLowerCase() === DOW_NAMES[dow];
  }
  return false;
}

const ROUTINE_COMPLETION_KEY_PREFIX = "agenda-routine-done-";
const RESP_COMPLETION_KEY_PREFIX = "agenda-resp-done-";
const ROLE_COMPLETION_KEY_PREFIX = "agenda-role-done-";

function useLocalCompletions(prefix: string, date: string) {
  const storageKey = `${prefix}${date}`;
  const [done, setDone] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(done)));
    } catch {
      // ignore quota errors
    }
  }, [done, storageKey]);

  const toggle = (id: number) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return { done, toggle };
}

const TYPE_META: Record<StreamType, { label: string; icon: any; badge: string }> = {
  routine: {
    label: "Routine",
    icon: Repeat2,
    badge: "bg-primary/10 text-primary border-primary/30",
  },
  task: {
    label: "Task",
    icon: CheckSquare,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  responsibility: {
    label: "Responsibility",
    icon: Shield,
    badge: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
  },
  role: {
    label: "Role",
    icon: Users,
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
};

export default function AgendaPage() {
  const today = getToday();
  const todayDate = new Date(today + "T12:00:00");
  const dow = todayDate.getDay();
  const [viewMode, setViewMode] = useState<"mixed" | "grouped">("mixed");

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: todaysTasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", today],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?date=${today}`).then(r => r.json()),
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
  });
  const { data: roles = [] } = useQuery<Role[]>({ queryKey: ["/api/roles"] });

  const routineCompletions = useLocalCompletions(ROUTINE_COMPLETION_KEY_PREFIX, today);
  const respCompletions = useLocalCompletions(RESP_COMPLETION_KEY_PREFIX, today);
  const roleCompletions = useLocalCompletions(ROLE_COMPLETION_KEY_PREFIX, today);

  const completeTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", today] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  // Build items
  const routineItems: AgendaItem[] = identities
    .filter(i => i.active && i.status === "routine" && frequencyMatchesToday(i.frequency, dow))
    .map(i => {
      const area = areas.find(a => a.id === i.areaId);
      const done = routineCompletions.done.has(i.id);
      return {
        key: `routine-${i.id}`,
        type: "routine" as const,
        label: i.statement,
        subtitle: area?.name,
        puzzlePiece: i.puzzlePiece,
        onToggle: () => routineCompletions.toggle(i.id),
        done,
        pending: false,
      };
    });

  const taskItems: AgendaItem[] = todaysTasks
    .filter(t => t.projectId != null && t.isDraft !== 1)
    .map(t => {
      const area = t.areaId ? areas.find(a => a.id === t.areaId) : undefined;
      const identity = t.identityId ? identities.find(i => i.id === t.identityId) : undefined;
      const done = t.status === "done";
      return {
        key: `task-${t.id}`,
        type: "task" as const,
        label: t.task,
        subtitle: identity?.statement || area?.name,
        puzzlePiece: identity?.puzzlePiece,
        onToggle: () => completeTaskMutation.mutate({ id: t.id, status: done ? "planned" : "done" }),
        done,
        pending: completeTaskMutation.isPending,
      };
    });

  const respItems: AgendaItem[] = responsibilities
    .filter(r => cadenceMatchesToday(r.cadence, r.dayOfWeek, dow))
    .map(r => {
      const done = respCompletions.done.has(r.id);
      return {
        key: `resp-${r.id}`,
        type: "responsibility" as const,
        label: r.name,
        subtitle: r.cadence,
        onToggle: () => respCompletions.toggle(r.id),
        done,
        pending: false,
      };
    });

  const roleItems: AgendaItem[] = roles
    .filter(r => cadenceMatchesToday(r.cadence, r.dayOfWeek, dow))
    .map(r => {
      const done = roleCompletions.done.has(r.id);
      return {
        key: `role-${r.id}`,
        type: "role" as const,
        label: r.name,
        subtitle: r.description || r.cadence,
        onToggle: () => roleCompletions.toggle(r.id),
        done,
        pending: false,
      };
    });

  const allItems = [...routineItems, ...taskItems, ...respItems, ...roleItems];
  const totalDone = allItems.filter(i => i.done).length;

  const renderItem = (item: AgendaItem) => {
    const meta = TYPE_META[item.type];
    const color = getPieceColor(item.puzzlePiece);
    const Icon = meta.icon;
    return (
      <div
        key={item.key}
        className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
          item.done ? "bg-muted/40 opacity-70" : "bg-card"
        }`}
        data-testid={`agenda-item-${item.key}`}
      >
        <button
          onClick={item.onToggle}
          disabled={item.pending}
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            item.done
              ? "bg-green-500 border-green-500 text-white"
              : "border-muted-foreground/40 hover:border-primary"
          }`}
          data-testid={`checkbox-${item.key}`}
        >
          {item.done && <Check className="w-3 h-3" />}
        </button>
        {item.type === "routine" && item.puzzlePiece && (
          <span
            className="w-3 h-3 rounded-full shrink-0 mt-1.5"
            style={{ backgroundColor: color.accent }}
            title={color.label}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${item.done ? "line-through" : ""}`}>
              {item.label}
            </p>
            <Badge variant="outline" className={`text-[10px] ${meta.badge}`}>
              <Icon className="w-2.5 h-2.5 mr-0.5" />
              {meta.label}
            </Badge>
          </div>
          {item.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.subtitle}</p>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (title: string, items: AgendaItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2" key={title}>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title} ({items.length})
        </h2>
        <div className="space-y-2">{items.map(renderItem)}</div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Today's Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todayDate.toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Progress</p>
          <p className="text-sm font-semibold tabular-nums">
            {totalDone}/{allItems.length}
          </p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={viewMode === "mixed" ? "default" : "outline"}
          onClick={() => setViewMode("mixed")}
          data-testid="button-view-mixed"
        >
          <List className="w-3 h-3 mr-1" /> Mixed
        </Button>
        <Button
          size="sm"
          variant={viewMode === "grouped" ? "default" : "outline"}
          onClick={() => setViewMode("grouped")}
          data-testid="button-view-grouped"
        >
          <Layers className="w-3 h-3 mr-1" /> Grouped by type
        </Button>
      </div>

      {allItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nothing scheduled for today. Enjoy the space.
          </CardContent>
        </Card>
      ) : viewMode === "mixed" ? (
        <div className="space-y-2">{allItems.map(renderItem)}</div>
      ) : (
        <div className="space-y-5">
          {renderGroup("Routines", routineItems)}
          {renderGroup("Tasks", taskItems)}
          {renderGroup("Responsibilities", respItems)}
          {renderGroup("Roles", roleItems)}
        </div>
      )}
    </div>
  );
}
