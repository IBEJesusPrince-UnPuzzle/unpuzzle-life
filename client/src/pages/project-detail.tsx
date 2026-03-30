import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen, CheckCircle2, FileText, Plus, ListTodo, Archive,
  CalendarDays, Clock, Pencil, Trash2, X, Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Project, Action, InboxItem, Area } from "@shared/schema";

interface ProjectDetails {
  project: Project;
  actions: Action[];
  references: InboxItem[];
  areas: Area[];
}

export default function ProjectDetailPage({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery<ProjectDetails>({
    queryKey: ["/api/projects", id, "details"],
    queryFn: () => apiRequest("GET", `/api/projects/${id}/details`).then(r => r.json()),
    enabled: !!id && id > 0,
    retry: 2,
  });

  const [newAction, setNewAction] = useState("");

  const addAction = useMutation({
    mutationFn: () => apiRequest("POST", "/api/actions", {
      title: newAction,
      projectId: id,
      areaId: data?.project.areaId || null,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setNewAction("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
    },
  });

  const completeAction = useMutation({
    mutationFn: (actionId: number) => apiRequest("PATCH", `/api/actions/${actionId}`, {
      completed: 1, completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "details"] });
    },
  });

  const uncompleteAction = useMutation({
    mutationFn: (actionId: number) => apiRequest("PATCH", `/api/actions/${actionId}`, {
      completed: 0, completedAt: null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "details"] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {error ? (
          <p className="text-sm text-destructive">Failed to load project: {(error as Error).message}</p>
        ) : (
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-48" />
            <div className="h-32 bg-muted rounded" />
          </div>
        )}
      </div>
    );
  }

  const { project, actions, references, areas } = data;
  const area = areas.find(a => a.id === project.areaId);
  const pendingActions = actions.filter(a => !a.completed);
  const completedActions = actions.filter(a => a.completed);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={project.status === "active" ? "default" : "secondary"} className="text-xs">
            {project.status}
          </Badge>
          {area && (
            <span className="text-[11px] text-muted-foreground">
              In the area of <span className="font-medium text-foreground">{area.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{pendingActions.length}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{completedActions.length}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{references.length}</p>
            <p className="text-[10px] text-muted-foreground">References</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Action */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newAction.trim()) addAction.mutate();
        }}
        className="flex gap-2"
      >
        <Input
          value={newAction}
          onChange={(e) => setNewAction(e.target.value)}
          placeholder="Add a new action item..."
          className="flex-1 text-sm"
          data-testid="input-new-action"
        />
        <Button type="submit" size="sm" disabled={!newAction.trim()}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </form>

      {/* Pending Actions */}
      {pendingActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-1">
            <ListTodo className="w-4 h-4" /> Actions ({pendingActions.length})
          </h2>
          {pendingActions.map(action => (
            <ActionCard
              key={action.id}
              action={action}
              projectId={id}
              projectAreaId={project.areaId}
              areas={areas}
              onComplete={() => completeAction.mutate(action.id)}
            />
          ))}
        </div>
      )}

      {/* References */}
      {references.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-1">
            <FileText className="w-4 h-4" /> References ({references.length})
          </h2>
          {references.map(ref => (
            <ReferenceCard key={ref.id} item={ref} areas={areas} />
          ))}
        </div>
      )}

      {/* Completed Actions */}
      {completedActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Completed ({completedActions.length})
          </h2>
          {completedActions.map(action => (
            <Card key={action.id} className="opacity-60">
              <CardContent className="p-3 flex items-center gap-3">
                <Checkbox
                  checked={true}
                  onCheckedChange={() => uncompleteAction.mutate(action.id)}
                />
                <p className="text-sm line-through text-muted-foreground flex-1">{action.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {actions.length === 0 && references.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Archive className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No items yet</p>
            <p className="text-xs mt-1">Add actions above, or process inbox items to this project.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ACTION CARD with edit + send to agenda
// ============================================================

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_LIST = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function to24h(h12: number, min: string, period: string): string {
  let h = h12;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

function QuickTimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const parsed = (() => {
    if (!value) return { h12: "9", min: "00", period: "AM" };
    const [h, m] = value.split(":").map(Number);
    return {
      h12: String(h === 0 ? 12 : h > 12 ? h - 12 : h),
      min: (Math.round(m / 5) * 5 % 60).toString().padStart(2, "0"),
      period: h >= 12 ? "PM" : "AM",
    };
  })();
  const [hour, setHour] = useState(parsed.h12);
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
          <SelectTrigger className="text-sm h-9 px-1.5 w-[46px]"><SelectValue placeholder="Hr" /></SelectTrigger>
          <SelectContent>{HOURS_12.map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={minute} onValueChange={v => update(hour, v, period)}>
          <SelectTrigger className="text-sm h-9 px-1.5 w-[46px]"><SelectValue placeholder="Min" /></SelectTrigger>
          <SelectContent>{MINUTES_LIST.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={period} onValueChange={v => update(hour, minute, v)}>
          <SelectTrigger className="text-sm h-9 px-1.5 w-[50px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ActionCard({ action, projectId, projectAreaId, areas, onComplete }: {
  action: Action; projectId: number; projectAreaId: number | null; areas: Area[]; onComplete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(action.title);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [areaId, setAreaId] = useState<string>(projectAreaId ? String(projectAreaId) : "none");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const actionArea = areas.find(a => a.id === (action.areaId || projectAreaId));

  const hours = useMemo(() => {
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = (eh * 60 + em - sh * 60 - sm) / 60;
    return diff > 0 ? diff.toFixed(2) : "";
  }, [startTime, endTime]);

  const dateOptions = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return { value: ds, label: `${label} (${ds})` };
    })
  , []);

  const updateAction = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/actions/${action.id}`, { title: editTitle }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "details"] });
    },
  });

  const deleteAction = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/actions/${action.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "details"] });
    },
  });

  const createTask = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date,
      areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      goal: action.title,
      startTime: startTime || null,
      endTime: endTime || null,
      hours: hours || null,
      status: "planned",
      recurrence: null,
      habitId: null,
      isDraft: 0,
      sourceType: "manual",
    }),
    onSuccess: () => {
      setScheduleOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <>
      <Card>
        <CardContent className="p-3">
          {/* Area line */}
          {actionArea && (
            <p className="text-[11px] text-muted-foreground mb-0.5">
              In the area of <span className="font-medium text-foreground">{actionArea.name}</span>
            </p>
          )}
          <div className="flex items-center gap-3">
            <Checkbox checked={false} onCheckedChange={onComplete} data-testid={`action-check-${action.id}`} />
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && editTitle.trim()) updateAction.mutate();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    className="text-sm h-8"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary shrink-0"
                    onClick={() => updateAction.mutate()} disabled={!editTitle.trim()}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"
                    onClick={() => { setEditing(false); setEditTitle(action.title); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm">{action.title}</p>
              )}
              {action.context && !editing && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-0.5">{action.context}</Badge>
              )}
            </div>
            {!editing && (
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit"
                  onClick={() => { setEditing(true); setEditTitle(action.title); }}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary" title="Send to Agenda"
                  onClick={() => setScheduleOpen(true)}>
                  <CalendarDays className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="Delete"
                  onClick={() => deleteAction.mutate()}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> Send to Agenda
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1 truncate">"{action.title}"</p>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Date</label>
                <Select value={date} onValueChange={setDate}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dateOptions.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Area</label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No area</SelectItem>
                    {areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              <QuickTimePicker label="Start" value={startTime} onChange={setStartTime} />
              <QuickTimePicker label="End" value={endTime} onChange={setEndTime} />
              {hours && (
                <div className="flex-shrink-0">
                  <label className="text-xs font-medium mb-1 block text-muted-foreground">Duration</label>
                  <div className="h-9 px-2 text-sm border rounded-md bg-muted/50 flex items-center text-muted-foreground min-w-[48px]">
                    {parseFloat(hours).toFixed(1)}h
                  </div>
                </div>
              )}
            </div>
            <Button className="w-full"
              disabled={!startTime || !endTime || !areaId || areaId === "none" || createTask.isPending}
              onClick={() => createTask.mutate()}>
              {createTask.isPending ? "Creating..." : "Add to Agenda"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// REFERENCE CARD with edit
// ============================================================

function ReferenceCard({ item, areas }: { item: InboxItem; areas: Area[] }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const refArea = areas.find(a => a.id === (item.referenceAreaId || item.areaId));

  const updateRef = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/inbox/${item.id}`, { content: editContent }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries();
    },
  });

  const deleteRef = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/inbox/${item.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return (
    <Card>
      <CardContent className="p-3">
        {/* Area line */}
        {refArea && (
          <p className="text-[11px] text-muted-foreground mb-0.5">
            In the area of <span className="font-medium text-foreground">{refArea.name}</span>
          </p>
        )}
        <div className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && editContent.trim()) updateRef.mutate();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="text-sm h-8"
                />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary shrink-0"
                  onClick={() => updateRef.mutate()} disabled={!editContent.trim()}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"
                  onClick={() => { setEditing(false); setEditContent(item.content); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm">{item.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Filed {new Date(item.createdAt).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                  })}
                </p>
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>
                )}
              </>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit"
                onClick={() => { setEditing(true); setEditContent(item.content); }}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="Delete"
                onClick={() => deleteRef.mutate()}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
