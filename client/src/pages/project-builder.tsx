import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, X, Users, MapPin, Package, ListChecks,
  Sparkles, GraduationCap, Check,
} from "lucide-react";
import { getPieceColor } from "@/lib/piece-colors";
import type {
  Identity, Area, Project, EnvironmentPerson, EnvironmentPlace,
  EnvironmentThing, ProjectEnvironment, PlannerTask,
} from "@shared/schema";

type EntityType = "person" | "place" | "thing";

interface ProjectBuilderProps {
  id: string;
}

export default function ProjectBuilderPage({ id }: ProjectBuilderProps) {
  const identityId = Number(id);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [showGradPrompt, setShowGradPrompt] = useState(false);
  const [cadence, setCadence] = useState("daily");

  // Core data
  const { data: identities = [], isLoading: loadingIdentities } = useQuery<Identity[]>({
    queryKey: ["/api/identities"],
  });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: allProjects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const identity = identities.find(i => i.id === identityId);
  const area = identity ? areas.find(a => a.id === identity.areaId) : null;
  const pieceColor = getPieceColor(identity?.puzzlePiece);

  // Find or auto-create the project for this identity
  const existingProject = allProjects.find(p => p.identityId === identityId);

  const createProjectMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/projects", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  useEffect(() => {
    if (identity && identity.status === "project" && !existingProject && !createProjectMutation.isPending) {
      createProjectMutation.mutate({
        title: identity.statement,
        identityId: identity.id,
        areaId: identity.areaId,
        puzzlePiece: identity.puzzlePiece,
        createdAt: new Date().toISOString(),
      });
    }
  }, [identity, existingProject]);

  const projectId = existingProject?.id;

  // Environment data
  const { data: allPeople = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
  });
  const { data: allPlaces = [] } = useQuery<EnvironmentPlace[]>({
    queryKey: ["/api/environment/places"],
  });
  const { data: allThings = [] } = useQuery<EnvironmentThing[]>({
    queryKey: ["/api/environment/things"],
  });

  const { data: linkedEnv = [] } = useQuery<ProjectEnvironment[]>({
    queryKey: [`/api/projects/${projectId}/environment`],
    enabled: !!projectId,
  });

  const { data: allTasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks"],
  });

  const projectTasks = useMemo(
    () => allTasks.filter(t => t.projectId === projectId),
    [allTasks, projectId]
  );

  const doneCount = projectTasks.filter(t => t.status === "done").length;
  const allTasksDone = projectTasks.length > 0 && doneCount === projectTasks.length;

  // ---- Mutations ----
  const linkEntity = useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: EntityType; entityId: number }) =>
      apiRequest("POST", `/api/projects/${projectId}/environment`, { entityType, entityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/environment`] });
    },
  });

  const unlinkEntity = useMutation({
    mutationFn: (linkId: number) =>
      apiRequest("DELETE", `/api/projects/${projectId}/environment/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/environment`] });
    },
  });

  const createPerson = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/environment/people", { name, createdAt: new Date().toISOString() }).then(r => r.json()),
    onSuccess: (newPerson: EnvironmentPerson) => {
      queryClient.invalidateQueries({ queryKey: ["/api/environment/people"] });
      if (projectId) linkEntity.mutate({ entityType: "person", entityId: newPerson.id });
    },
  });

  const createPlace = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/environment/places", { name, createdAt: new Date().toISOString() }).then(r => r.json()),
    onSuccess: (newPlace: EnvironmentPlace) => {
      queryClient.invalidateQueries({ queryKey: ["/api/environment/places"] });
      if (projectId) linkEntity.mutate({ entityType: "place", entityId: newPlace.id });
    },
  });

  const createThing = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/environment/things", { name, createdAt: new Date().toISOString() }).then(r => r.json()),
    onSuccess: (newThing: EnvironmentThing) => {
      queryClient.invalidateQueries({ queryKey: ["/api/environment/things"] });
      if (projectId) linkEntity.mutate({ entityType: "thing", entityId: newThing.id });
    },
  });

  const createTask = useMutation({
    mutationFn: (data: { task: string; date?: string }) =>
      apiRequest("POST", "/api/planner-tasks", {
        task: data.task,
        date: data.date || new Date().toISOString().split("T")[0],
        projectId,
        identityId,
        areaId: identity?.areaId,
        status: "planned",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      setNewTaskText("");
      setNewTaskDate("");
    },
  });

  const toggleTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const graduateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/identities/${identityId}`, { frequency: cadence });
      await apiRequest("PATCH", `/api/identities/${identityId}/status`, { status: "routine" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      toast({ title: "Graduated!", description: "This identity is now a routine." });
      setLocation("/");
    },
  });

  // ---- Render guards ----
  if (loadingIdentities) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!identity) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Card><CardContent className="p-6">Identity not found.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge
              variant="outline"
              className={`${pieceColor.bg} ${pieceColor.text} ${pieceColor.border}`}
            >
              {pieceColor.label || identity.puzzlePiece}
            </Badge>
            {area && (
              <span className="text-xs text-muted-foreground">{area.name}</span>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-tight leading-tight">
            {identity.statement}
          </h1>
        </div>
      </div>

      {/* AI assist stub */}
      <Button
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        onClick={() => toast({ title: "AI assist coming soon", description: "Manual flow works today." })}
        data-testid="button-ai-assist"
      >
        <Sparkles className="w-4 h-4 mr-1.5" />
        Ask AI for help
      </Button>

      {/* Environment — People */}
      <EnvironmentSection
        title="People"
        icon={<Users className="w-4 h-4" />}
        entityType="person"
        allEntities={allPeople}
        linkedEnv={linkedEnv}
        onLink={(entityId) => linkEntity.mutate({ entityType: "person", entityId })}
        onUnlink={(linkId) => unlinkEntity.mutate(linkId)}
        onCreate={(name) => createPerson.mutate(name)}
        disabled={!projectId}
      />

      {/* Environment — Places */}
      <EnvironmentSection
        title="Places"
        icon={<MapPin className="w-4 h-4" />}
        entityType="place"
        allEntities={allPlaces}
        linkedEnv={linkedEnv}
        onLink={(entityId) => linkEntity.mutate({ entityType: "place", entityId })}
        onUnlink={(linkId) => unlinkEntity.mutate(linkId)}
        onCreate={(name) => createPlace.mutate(name)}
        disabled={!projectId}
      />

      {/* Environment — Things */}
      <EnvironmentSection
        title="Things"
        icon={<Package className="w-4 h-4" />}
        entityType="thing"
        allEntities={allThings}
        linkedEnv={linkedEnv}
        onLink={(entityId) => linkEntity.mutate({ entityType: "thing", entityId })}
        onUnlink={(linkId) => unlinkEntity.mutate(linkId)}
        onCreate={(name) => createThing.mutate(name)}
        disabled={!projectId}
      />

      {/* Tasks */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            <h2 className="text-sm font-semibold">Tasks</h2>
            {projectTasks.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {doneCount}/{projectTasks.length} done
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTaskText.trim() || !projectId) return;
              createTask.mutate({ task: newTaskText.trim(), date: newTaskDate || undefined });
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <Input
              placeholder="Add a task…"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              className="flex-1"
              data-testid="input-new-task"
            />
            <Input
              type="date"
              value={newTaskDate}
              onChange={(e) => setNewTaskDate(e.target.value)}
              className="sm:w-40"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!newTaskText.trim() || !projectId || createTask.isPending}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </form>

          {projectTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-1">No tasks yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {projectTasks.map(task => {
                const done = task.status === "done";
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card"
                  >
                    <Checkbox
                      checked={done}
                      onCheckedChange={(checked) =>
                        toggleTask.mutate({
                          id: task.id,
                          status: checked ? "done" : "planned",
                        })
                      }
                      data-testid={`checkbox-task-${task.id}`}
                    />
                    <span className={`text-sm flex-1 ${done ? "line-through text-muted-foreground" : ""}`}>
                      {task.task}
                    </span>
                    {task.date && (
                      <span className="text-[10px] text-muted-foreground">{task.date}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Graduation prompt */}
      {(allTasksDone || showGradPrompt) && (
        <Card className="border-green-500/30 bg-green-500/[0.03]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <GraduationCap className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {allTasksDone
                    ? "Your environment is ready. Graduate to routine?"
                    : "Graduate now?"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose a cadence and this identity becomes a daily routine.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger className="sm:w-48" data-testid="select-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekend">Weekends</SelectItem>
                  <SelectItem value="weekly:monday">Mondays</SelectItem>
                  <SelectItem value="weekly:tuesday">Tuesdays</SelectItem>
                  <SelectItem value="weekly:wednesday">Wednesdays</SelectItem>
                  <SelectItem value="weekly:thursday">Thursdays</SelectItem>
                  <SelectItem value="weekly:friday">Fridays</SelectItem>
                  <SelectItem value="weekly:saturday">Saturdays</SelectItem>
                  <SelectItem value="weekly:sunday">Sundays</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => graduateMutation.mutate()}
                disabled={graduateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-graduate-confirm"
              >
                <Check className="w-4 h-4 mr-1" /> Graduate to routine
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!allTasksDone && !showGradPrompt && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowGradPrompt(true)}
          data-testid="button-graduate-now"
        >
          <GraduationCap className="w-4 h-4 mr-1.5" /> Graduate now
        </Button>
      )}
    </div>
  );
}

// -------- Environment Section Subcomponent --------
interface EnvironmentSectionProps {
  title: string;
  icon: React.ReactNode;
  entityType: EntityType;
  allEntities: Array<{ id: number; name: string }>;
  linkedEnv: ProjectEnvironment[];
  onLink: (entityId: number) => void;
  onUnlink: (linkId: number) => void;
  onCreate: (name: string) => void;
  disabled?: boolean;
}

function EnvironmentSection({
  title, icon, entityType, allEntities, linkedEnv, onLink, onUnlink, onCreate, disabled,
}: EnvironmentSectionProps) {
  const [selectValue, setSelectValue] = useState("");
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const linkedForThisType = linkedEnv.filter(l => l.entityType === entityType);
  const linkedIds = new Set(linkedForThisType.map(l => l.entityId));
  const available = allEntities.filter(e => !linkedIds.has(e.id));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>

        {linkedForThisType.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {linkedForThisType.map(link => {
              const entity = allEntities.find(e => e.id === link.entityId);
              return (
                <Badge
                  key={link.id}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {entity?.name || `#${link.entityId}`}
                  <button
                    onClick={() => onUnlink(link.id)}
                    className="hover:bg-muted rounded p-0.5"
                    aria-label="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        {!showCreate ? (
          <div className="flex gap-2">
            <Select
              value={selectValue}
              onValueChange={(v) => {
                setSelectValue("");
                if (v) onLink(Number(v));
              }}
              disabled={disabled || available.length === 0}
            >
              <SelectTrigger className="flex-1" data-testid={`select-${entityType}`}>
                <SelectValue placeholder={
                  available.length === 0
                    ? `No more ${title.toLowerCase()} to add`
                    : `Add ${title.toLowerCase().slice(0, -1)}…`
                } />
              </SelectTrigger>
              <SelectContent>
                {available.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate(true)}
              disabled={disabled}
              data-testid={`button-new-${entityType}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) {
                onCreate(newName.trim());
                setNewName("");
                setShowCreate(false);
              }
            }}
            className="flex gap-2"
          >
            <Input
              autoFocus
              placeholder={`New ${title.toLowerCase().slice(0, -1)} name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid={`input-new-${entityType}`}
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || disabled}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setShowCreate(false); setNewName(""); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
