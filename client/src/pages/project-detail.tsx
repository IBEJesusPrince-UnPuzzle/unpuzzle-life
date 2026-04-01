import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen, Users, MapPin, Package, Plus, Clock, CheckCircle2,
  Repeat, Archive, Sparkles, Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Identity, Area, RoutineItem, PlannerTask } from "@shared/schema";
import { formatRecurrence } from "./planner";

interface IdentityProjectDetails {
  identityId: number;
  identity: Identity;
  area: Area | null;
  areas: Area[];
  title: string;
  tag: string;
  routineItems: RoutineItem[];
  plannerTasks: PlannerTask[];
}

const CONTACT_METHODS = [
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In Person" },
  { value: "social", label: "Social Media" },
  { value: "other", label: "Other" },
];

// Only Places and Things use the generic section now
const GENERIC_CATEGORIES = [
  { key: "places", label: "Places", icon: MapPin, description: "Where would you go to support this habit and what tasks will ensure you always reach them?" },
  { key: "things", label: "Things", icon: Package, description: "What things do you need to support this habit and what tasks will ensure you always have them?" },
];

export default function ProjectDetailPage({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery<IdentityProjectDetails>({
    queryKey: ["/api/identity-projects", id],
    queryFn: () => apiRequest("GET", `/api/identity-projects/${id}`).then(r => r.json()),
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

  const { identity, area, routineItems, plannerTasks } = data;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        {area && (
          <p className="text-[11px] text-muted-foreground mb-1">
            In the area of <span className="font-medium text-foreground">
              {area.category === "UnPuzzle" ? `${area.category} ${area.name}` : `${area.name} ${area.category || ""}`}
            </span>
          </p>
        )}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            {identity.statement}{identity.cue ? ` when ${identity.cue}` : ""}
          </h1>
        </div>
      </div>

      {/* Identity Details Card */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Identity Chain</p>
          <p className="text-sm">
            <span className="text-muted-foreground">I am the type of person who</span>{" "}
            <span className="font-medium">{identity.statement}</span>
          </p>
          {identity.cue && (
            <p className="text-sm">
              <span className="text-muted-foreground">When</span>{" "}
              <span className="font-medium">{identity.cue}</span>
            </p>
          )}
          {identity.craving && (
            <p className="text-sm">
              <span className="text-muted-foreground">Because</span>{" "}
              <span className="font-medium">{identity.craving}</span>
            </p>
          )}
          {identity.reward && (
            <p className="text-sm">
              <span className="text-muted-foreground">Rewarded by</span>{" "}
              <span className="font-medium">{identity.reward}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              <Repeat className="w-2.5 h-2.5 mr-0.5" />
              {formatRecurrence(identity.frequency)}
            </Badge>
            {routineItems.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-violet-600 dark:text-violet-400 border-violet-500/30">
                {routineItems.length} routine{routineItems.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* People — specialized section */}
      <PeopleSection habitId={id} />

      {/* Places / Things — generic sections */}
      {GENERIC_CATEGORIES.map(cat => (
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
// PEOPLE SECTION — Specialized with contact details
// ============================================================

interface PersonData {
  name: string;
  contactMethod: string;
  contactInfo: string;
  notes: string;
}

function parsePerson(goal: string): PersonData | null {
  try {
    const p = JSON.parse(goal);
    if (p && typeof p.name === "string") return p as PersonData;
  } catch { /* not JSON, legacy item */ }
  return null;
}

function formatPersonDisplay(p: PersonData): string {
  const method = CONTACT_METHODS.find(m => m.value === p.contactMethod)?.label || p.contactMethod;
  const parts = [`I will connect w/ ${p.name}`];
  if (p.contactMethod) parts.push(`via ${method}`);
  if (p.contactInfo) parts.push(p.contactInfo);
  if (p.notes) parts.push(p.notes);
  return parts.join(" ");
}

function PeopleSection({ habitId }: { habitId: number }) {
  const [name, setName] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");

  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "project", habitId, "people"],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?habitId=${habitId}&sourceType=project_people`).then(r => r.json()),
    retry: 2,
  });

  const addPerson = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date: new Date().toISOString().split("T")[0],
      goal: JSON.stringify({ name, contactMethod, contactInfo, notes }),
      habitId,
      sourceType: "project_people",
      status: "planned",
      isDraft: 0,
    }),
    onSuccess: () => {
      setName(""); setContactMethod(""); setContactInfo(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] });
    },
  });

  const deletePerson = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planner-tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] }),
  });

  const convertToTask = useMutation({
    mutationFn: (person: PlannerTask) => {
      const p = parsePerson(person.goal);
      const taskGoal = p ? formatPersonDisplay(p) : person.goal;
      return apiRequest("POST", "/api/planner-tasks", {
        date: new Date().toISOString().split("T")[0],
        goal: taskGoal,
        habitId,
        sourceType: "project_people",
        status: "planned",
        isDraft: 1,
        areaId: person.areaId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: status === "done" ? "planned" : "done" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] }),
  });

  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-medium">People</h2>
        <span className="text-[10px] text-muted-foreground">Who supports this habit and what do you need to do to ensure it always reaches you?</span>
      </div>

      {/* Add person form */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person's name"
            className="text-sm h-8"
          />
          <div className="flex gap-2">
            <Select value={contactMethod} onValueChange={setContactMethod}>
              <SelectTrigger className="text-sm h-8 flex-1">
                <SelectValue placeholder="Contact method" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Phone, email, handle..."
              className="text-sm h-8 flex-1"
            />
          </div>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="text-sm h-8"
          />
          <Button
            size="sm"
            className="h-8 w-full"
            disabled={!name.trim()}
            onClick={() => addPerson.mutate()}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Person
          </Button>
        </CardContent>
      </Card>

      {/* Pending people */}
      {pending.map(t => {
        const person = parsePerson(t.goal);
        const display = person ? formatPersonDisplay(person) : t.goal;
        return (
          <div key={t.id} className="flex items-start gap-2 px-2 py-2 rounded hover:bg-accent transition-colors group">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 shrink-0 mt-0.5"
            />
            <span className="text-sm flex-1">{display}</span>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => convertToTask.mutate(t)}
                className="text-primary/60 hover:text-primary transition-colors p-0.5"
                title="Turn into a task"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deletePerson.mutate(t.id)}
                className="text-destructive/60 hover:text-destructive transition-colors p-0.5"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Done people */}
      {done.map(t => {
        const person = parsePerson(t.goal);
        const display = person ? formatPersonDisplay(person) : t.goal;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />
            </button>
            <span className="text-sm flex-1 line-through">{display}</span>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2">No people added yet</p>
      )}
    </div>
  );
}

// ============================================================
// TASK CATEGORY SECTION (Places / Things)
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
