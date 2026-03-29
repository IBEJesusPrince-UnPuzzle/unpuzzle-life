import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, Eye, Target, FolderOpen, Plus, Trash2, CheckCircle2,
  Fingerprint, CalendarDays, ArrowRight
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Purpose, Vision, Goal, Area, Project, Identity } from "@shared/schema";

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
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Horizons of Focus</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          From your life's purpose down to today's next action.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="purpose" className="text-xs" data-testid="tab-purpose">Purpose</TabsTrigger>
          <TabsTrigger value="vision" className="text-xs" data-testid="tab-vision">Vision</TabsTrigger>
          <TabsTrigger value="areas" className="text-xs" data-testid="tab-areas">Areas</TabsTrigger>
          <TabsTrigger value="identity" className="text-xs" data-testid="tab-identity">Identity</TabsTrigger>
          <TabsTrigger value="goals" className="text-xs" data-testid="tab-goals">Goals</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs" data-testid="tab-projects">Projects</TabsTrigger>
          <TabsTrigger value="agenda" className="text-xs" data-testid="tab-agenda">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="purpose" className="mt-4">
          <PurposeSection purposes={purposes} />
        </TabsContent>

        <TabsContent value="vision" className="mt-4">
          <VisionSection visions={visions} />
        </TabsContent>

        <TabsContent value="areas" className="mt-4">
          <AreaSection areas={areas} />
        </TabsContent>

        <TabsContent value="identity" className="mt-4">
          <IdentitySection identities={identities} areas={areas} />
        </TabsContent>

        <TabsContent value="goals" className="mt-4">
          <GoalSection goals={goals} visions={visions} />
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <ProjectSection projects={projects} areas={areas} goals={goals} />
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaSection />
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
// IDENTITY (moved from habits page)
// ============================================================
function IdentitySection({ identities, areas }: { identities: Identity[]; areas: Area[] }) {
  const [statement, setStatement] = useState("");
  const [areaId, setAreaId] = useState<string>("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/identities", {
      statement,
      areaId: areaId && areaId !== "none" ? Number(areaId) : null,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setStatement(""); setAreaId("");
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
    },
  });

  const deleteIdentity = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/identities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/identities"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Fingerprint className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Identity Statements</span>
        <span className="text-xs text-muted-foreground">"I am the type of person who..."</span>
      </div>

      {identities.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {identities.map((id) => (
            <Card key={id.id} className="bg-primary/[0.03]">
              <CardContent className="p-3 flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium" data-testid={`identity-${id.id}`}>
                    "I am the type of person who {id.statement}"
                  </p>
                  {id.areaId && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 mt-1.5">
                      {areas.find(a => a.id === id.areaId)?.name}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-destructive h-6 w-6 p-0"
                  onClick={() => deleteIdentity.mutate(id.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">I am the type of person who...</p>
            <Input
              placeholder="exercises every day, reads before bed..."
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className="text-sm"
              data-testid="input-identity"
            />
          </div>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No area</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => create.mutate()} disabled={!statement.trim()} data-testid="button-add-identity">
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
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
// PROJECTS
// ============================================================
function ProjectSection({ projects, areas, goals }: { projects: Project[]; areas: Area[]; goals: Goal[] }) {
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");

  const active = projects.filter(p => p.status === "active");
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
// AGENDA (links to Daily Agenda page)
// ============================================================
function AgendaSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Daily Agenda</span>
        <span className="text-xs text-muted-foreground">Your daily plan and task tracker.</span>
      </div>

      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CalendarDays className="w-10 h-10 mx-auto text-primary/40" />
          <p className="text-sm text-muted-foreground">
            Plan your day, track tasks across all areas, and review what you've accomplished.
          </p>
          <Link href="/planner">
            <Button variant="outline" className="gap-2">
              Open Daily Agenda <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
