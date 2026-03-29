import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, Eye, Target, FolderOpen, Zap, Plus, Trash2, CheckCircle2,
  ChevronDown, ChevronRight, Pencil
} from "lucide-react";
import { useState } from "react";
import type { Purpose, Vision, Goal, Area, Project, Action } from "@shared/schema";

function HorizonBadge({ level, label }: { level: number; label: string }) {
  const colors: Record<number, string> = {
    5: "bg-chart-4/10 text-chart-4",
    4: "bg-chart-2/10 text-chart-2",
    3: "bg-chart-1/10 text-chart-1",
    2: "bg-chart-3/10 text-chart-3",
    1: "bg-chart-5/10 text-chart-5",
    0: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[level] || colors[0]}`}>
      H{level} · {label}
    </span>
  );
}

export default function HorizonsPage() {
  const [activeTab, setActiveTab] = useState("purpose");

  const { data: purposes = [] } = useQuery<Purpose[]>({ queryKey: ["/api/purposes"] });
  const { data: visions = [] } = useQuery<Vision[]>({ queryKey: ["/api/visions"] });
  const { data: goals = [] } = useQuery<Goal[]>({ queryKey: ["/api/goals"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: actions = [] } = useQuery<Action[]>({ queryKey: ["/api/actions"] });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Horizons of Focus</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          From your life's purpose down to today's next action.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="purpose" className="text-xs" data-testid="tab-purpose">Purpose</TabsTrigger>
          <TabsTrigger value="vision" className="text-xs" data-testid="tab-vision">Vision</TabsTrigger>
          <TabsTrigger value="goals" className="text-xs" data-testid="tab-goals">Goals</TabsTrigger>
          <TabsTrigger value="areas" className="text-xs" data-testid="tab-areas">Areas</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs" data-testid="tab-projects">Projects</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs" data-testid="tab-actions">Actions</TabsTrigger>
        </TabsList>

        {/* H5: Purpose */}
        <TabsContent value="purpose" className="mt-4">
          <PurposeSection purposes={purposes} />
        </TabsContent>

        {/* H4: Vision */}
        <TabsContent value="vision" className="mt-4">
          <VisionSection visions={visions} />
        </TabsContent>

        {/* H3: Goals */}
        <TabsContent value="goals" className="mt-4">
          <GoalSection goals={goals} visions={visions} />
        </TabsContent>

        {/* H2: Areas */}
        <TabsContent value="areas" className="mt-4">
          <AreaSection areas={areas} />
        </TabsContent>

        {/* H1: Projects */}
        <TabsContent value="projects" className="mt-4">
          <ProjectSection projects={projects} areas={areas} goals={goals} />
        </TabsContent>

        {/* H0: Actions */}
        <TabsContent value="actions" className="mt-4">
          <ActionSection actions={actions} projects={projects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// PURPOSE
// ============================================================
function PurposeSection({ purposes }: { purposes: Purpose[] }) {
  const [statement, setStatement] = useState("");
  const [principles, setPrinciples] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/purposes", {
      statement,
      principles: JSON.stringify(principles.split("\n").filter(Boolean)),
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setStatement("");
      setPrinciples("");
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
    },
  });

  const deletePurpose = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/purposes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/purposes"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={5} label="Purpose & Principles" />
        <span className="text-xs text-muted-foreground">Why do I exist? What do I stand for?</span>
      </div>

      {purposes.map((p) => {
        const princ = p.principles ? JSON.parse(p.principles) : [];
        return (
          <Card key={p.id}>
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium" data-testid={`purpose-${p.id}`}>{p.statement}</p>
                  {princ.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {princ.map((pr: string, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <Compass className="w-3 h-3 mt-1 shrink-0 text-primary" />
                          {pr}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-destructive h-7"
                  onClick={() => deletePurpose.mutate(p.id)} data-testid={`delete-purpose-${p.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input
            placeholder="My life's purpose is..."
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            data-testid="input-purpose"
          />
          <Textarea
            placeholder="Core principles (one per line)..."
            value={principles}
            onChange={(e) => setPrinciples(e.target.value)}
            rows={3}
            className="text-sm"
            data-testid="input-principles"
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={!statement.trim()} data-testid="button-add-purpose">
            <Plus className="w-3 h-3 mr-1" /> Add Purpose
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// VISION
// ============================================================
function VisionSection({ visions }: { visions: Vision[] }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [timeframe, setTimeframe] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/visions", {
      title, description: desc || null, timeframe: timeframe || null,
      status: "active", createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setTitle(""); setDesc(""); setTimeframe("");
      queryClient.invalidateQueries({ queryKey: ["/api/visions"] });
    },
  });

  const deleteVision = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/visions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/visions"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={4} label="Vision" />
        <span className="text-xs text-muted-foreground">What does my ideal life look like in 3-5 years?</span>
      </div>

      {visions.map((v) => (
        <Card key={v.id}>
          <CardContent className="p-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-chart-2" />
                <p className="font-medium text-sm" data-testid={`vision-${v.id}`}>{v.title}</p>
                {v.timeframe && <Badge variant="outline" className="text-[10px] h-4">{v.timeframe}</Badge>}
              </div>
              {v.description && <p className="text-sm text-muted-foreground mt-1 ml-6">{v.description}</p>}
            </div>
            <Button variant="ghost" size="sm" className="text-destructive h-7"
              onClick={() => deleteVision.mutate(v.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input placeholder="3-5 year vision..." value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-vision" />
          <Textarea placeholder="Describe this vision in detail..." value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="text-sm" />
          <div className="flex gap-2">
            <Input placeholder="Timeframe (e.g. 2029)" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-40" />
            <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim()} data-testid="button-add-vision">
              <Plus className="w-3 h-3 mr-1" /> Add Vision
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// GOALS
// ============================================================
function GoalSection({ goals, visions }: { goals: Goal[]; visions: Vision[] }) {
  const [title, setTitle] = useState("");
  const [visionId, setVisionId] = useState<string>("");
  const [targetDate, setTargetDate] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/goals", {
      title, visionId: visionId ? Number(visionId) : null,
      targetDate: targetDate || null, status: "active",
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setTitle(""); setVisionId(""); setTargetDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/goals"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={3} label="Goals" />
        <span className="text-xs text-muted-foreground">What do I want to achieve in 1-2 years?</span>
      </div>

      {goals.map((g) => (
        <Card key={g.id}>
          <CardContent className="p-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-chart-1" />
                <p className="font-medium text-sm">{g.title}</p>
                {g.targetDate && <Badge variant="outline" className="text-[10px] h-4">{g.targetDate}</Badge>}
              </div>
              {g.visionId && (
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Vision: {visions.find(v => v.id === g.visionId)?.title}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => deleteGoal.mutate(g.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input placeholder="1-2 year goal..." value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-goal" />
          <div className="flex gap-2">
            <Select value={visionId} onValueChange={setVisionId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Link to vision (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vision</SelectItem>
                {visions.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-40" />
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim()} data-testid="button-add-goal">
            <Plus className="w-3 h-3 mr-1" /> Add Goal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// AREAS
// ============================================================
function AreaSection({ areas }: { areas: Area[] }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/areas", {
      name, description: desc || null, sortOrder: areas.length,
    }),
    onSuccess: () => {
      setName(""); setDesc("");
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
    },
  });

  const deleteArea = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/areas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={2} label="Areas of Focus" />
        <span className="text-xs text-muted-foreground">What roles and responsibilities do I maintain?</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {areas.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex justify-between items-start">
              <div>
                <p className="font-medium text-sm">{a.name}</p>
                {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
              </div>
              <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => deleteArea.mutate(a.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input placeholder="Area name (e.g. Health, Finances, Career...)" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-area" />
          <Input placeholder="Brief description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button size="sm" onClick={() => create.mutate()} disabled={!name.trim()} data-testid="button-add-area">
            <Plus className="w-3 h-3 mr-1" /> Add Area
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PROJECTS
// ============================================================
function ProjectSection({ projects, areas, goals }: { projects: Project[]; areas: Area[]; goals: Goal[] }) {
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");

  const active = projects.filter(p => p.status === "active");
  const completed = projects.filter(p => p.status === "completed");
  const someday = projects.filter(p => p.status === "someday");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/projects", {
      title, areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      goalId: goalId && goalId !== "none" ? Number(goalId) : null,
      status: "active", createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setTitle(""); setAreaId(""); setGoalId("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/projects/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
  });

  const deleteProject = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
  });

  function ProjectCard({ p }: { p: Project }) {
    return (
      <Card key={p.id}>
        <CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-chart-5" />
                <p className="font-medium text-sm">{p.title}</p>
              </div>
              <div className="flex gap-1.5 mt-1.5 ml-6">
                {p.areaId && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {areas.find(a => a.id === p.areaId)?.name}
                  </Badge>
                )}
                {p.goalId && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    Goal: {goals.find(g => g.id === p.goalId)?.title}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {p.status === "active" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => updateStatus.mutate({ id: p.id, status: "completed" })}>
                  <CheckCircle2 className="w-3 h-3" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive h-7"
                onClick={() => deleteProject.mutate(p.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={1} label="Projects" />
        <span className="text-xs text-muted-foreground">Multi-step outcomes I'm committed to.</span>
      </div>

      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active ({active.length})</p>
          {active.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}

      {someday.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Someday / Maybe ({someday.length})</p>
          {someday.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input placeholder="New project..." value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-project" />
          <div className="flex gap-2">
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Area (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No area</SelectItem>
                {areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Goal (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No goal</SelectItem>
                {goals.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim()} data-testid="button-add-project">
            <Plus className="w-3 h-3 mr-1" /> Add Project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ACTIONS
// ============================================================
function ActionSection({ actions, projects }: { actions: Action[]; projects: Project[] }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [context, setContext] = useState<string>("");

  const pending = actions.filter(a => !a.completed);
  const done = actions.filter(a => a.completed);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/actions", {
      title, projectId: projectId && projectId !== "none" ? Number(projectId) : null,
      context: context || null, createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setTitle(""); setProjectId(""); setContext("");
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (a: Action) => apiRequest("PATCH", `/api/actions/${a.id}`, {
      completed: a.completed ? 0 : 1,
      completedAt: a.completed ? null : new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const deleteAction = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/actions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={0} label="Next Actions" />
        <span className="text-xs text-muted-foreground">The very next physical thing I can do.</span>
      </div>

      {pending.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors group">
          <Checkbox checked={false} onCheckedChange={() => toggle.mutate(a)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{a.title}</p>
            <div className="flex gap-1.5 mt-0.5">
              {a.context && <Badge variant="secondary" className="text-[10px] h-4 px-1">{a.context}</Badge>}
              {a.projectId && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {projects.find(p => p.id === a.projectId)?.title}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-destructive h-7 opacity-0 group-hover:opacity-100"
            onClick={() => deleteAction.mutate(a.id)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Input placeholder="Next action..." value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-action" />
          <div className="flex gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Project (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.filter(p => p.status === "active").map(p =>
                  <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select value={context} onValueChange={setContext}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Context" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No context</SelectItem>
                <SelectItem value="@home">@home</SelectItem>
                <SelectItem value="@work">@work</SelectItem>
                <SelectItem value="@phone">@phone</SelectItem>
                <SelectItem value="@computer">@computer</SelectItem>
                <SelectItem value="@errands">@errands</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim()} data-testid="button-add-action">
            <Plus className="w-3 h-3 mr-1" /> Add Action
          </Button>
        </CardContent>
      </Card>

      {done.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Completed ({done.length})</p>
          {done.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-muted-foreground">
              <Checkbox checked={true} onCheckedChange={() => toggle.mutate(a)} />
              <span className="text-sm line-through">{a.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
