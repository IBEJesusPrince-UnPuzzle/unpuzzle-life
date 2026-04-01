import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, Eye, Target, FolderOpen, Plus, Trash2,
  Fingerprint, ArrowRight, Pencil, X, ArrowLeft, Repeat2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Purpose, Vision, Area, Identity } from "@shared/schema";
import { RecurrenceBuilder, formatRecurrence } from "./planner";
import { TIME_OF_DAY_CATEGORIES } from "./habits";

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
  const initialTab = (() => {
    const hash = window.location.hash || "";
    const match = hash.match(/[?&]tab=([^&]*)/);
    return match ? match[1] : "purpose";
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: purposes = [] } = useQuery<Purpose[]>({ queryKey: ["/api/purposes"] });
  const { data: visions = [] } = useQuery<Vision[]>({ queryKey: ["/api/visions"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-center mb-3">
        <a href="#/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </a>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Horizons of Focus</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          From your life's purpose down to today's next action.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="purpose" className="text-xs" data-testid="tab-purpose">Purpose</TabsTrigger>
          <TabsTrigger value="areas" className="text-xs" data-testid="tab-areas">Responsibility</TabsTrigger>
          <TabsTrigger value="identity" className="text-xs" data-testid="tab-identity">Identity</TabsTrigger>
        </TabsList>

        <TabsContent value="purpose" className="mt-4">
          <PurposeSection purposes={purposes} />
          <div className="border-t my-6" />
          <VisionSection visions={visions} />
        </TabsContent>

        <TabsContent value="areas" className="mt-4">
          <AreaSection areas={areas} />
        </TabsContent>

        <TabsContent value="identity" className="mt-4">
          <IdentitySection identities={identities} areas={areas} />
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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatement, setEditStatement] = useState("");
  const [editPrinciples, setEditPrinciples] = useState("");

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

  const updatePurpose = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Purpose> }) =>
      apiRequest("PATCH", `/api/purposes/${id}`, data),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
    },
  });

  const deletePurpose = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/purposes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/purposes"] }),
  });

  function startEdit(p: Purpose) {
    const princ = p.principles ? JSON.parse(p.principles) : [];
    setEditingId(p.id);
    setEditStatement(p.statement);
    setEditPrinciples(princ.join("\n"));
  }

  function saveEdit(id: number) {
    updatePurpose.mutate({
      id,
      data: {
        statement: editStatement,
        principles: JSON.stringify(editPrinciples.split("\n").filter(Boolean)),
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={5} label="Purpose & Principles" />
        <span className="text-xs text-muted-foreground">Why do I exist? What do I stand for?</span>
      </div>

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

      {purposes.map((p) => {
        const princ = p.principles ? JSON.parse(p.principles) : [];
        if (editingId === p.id) {
          return (
            <Card key={p.id}>
              <CardContent className="p-5 space-y-3">
                <Input
                  value={editStatement}
                  onChange={(e) => setEditStatement(e.target.value)}
                  placeholder="My life's purpose is..."
                />
                <Textarea
                  value={editPrinciples}
                  onChange={(e) => setEditPrinciples(e.target.value)}
                  placeholder="Core principles (one per line)..."
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(p.id)} disabled={!editStatement.trim()}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }
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
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(p)} data-testid={`edit-purpose-${p.id}`}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive h-7"
                    onClick={() => deletePurpose.mutate(p.id)} data-testid={`delete-purpose-${p.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTimeframe, setEditTimeframe] = useState("");

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

  const updateVision = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Vision> }) =>
      apiRequest("PATCH", `/api/visions/${id}`, data),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/visions"] });
    },
  });

  const deleteVision = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/visions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/visions"] }),
  });

  function startEdit(v: Vision) {
    setEditingId(v.id);
    setEditTitle(v.title);
    setEditDesc(v.description || "");
    setEditTimeframe(v.timeframe || "");
  }

  function saveEdit(id: number) {
    updateVision.mutate({
      id,
      data: {
        title: editTitle,
        description: editDesc || null,
        timeframe: editTimeframe || null,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={4} label="Vision" />
        <span className="text-xs text-muted-foreground">What does my ideal life look like in 3-5 years?</span>
      </div>

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

      {visions.map((v) => {
        if (editingId === v.id) {
          return (
            <Card key={v.id}>
              <CardContent className="p-4 space-y-3">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="3-5 year vision..."
                />
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Describe this vision in detail..."
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2 items-center">
                  <Input
                    value={editTimeframe}
                    onChange={(e) => setEditTimeframe(e.target.value)}
                    placeholder="Timeframe (e.g. 2029)"
                    className="w-40"
                  />
                  <Button size="sm" onClick={() => saveEdit(v.id)} disabled={!editTitle.trim()}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(v)} data-testid={`edit-vision-${v.id}`}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive h-7"
                  onClick={() => deleteVision.mutate(v.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// AREAS
// ============================================================
function AreaSection({ areas }: { areas: Area[] }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState<string>("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/areas", {
      name, description: desc || null, category: category || null, sortOrder: areas.length,
    }),
    onSuccess: () => {
      setName(""); setDesc(""); setCategory("");
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
    },
  });

  const updateArea = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Area> }) =>
      apiRequest("PATCH", `/api/areas/${id}`, data),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
    },
  });

  const deleteArea = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/areas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  function startEdit(a: Area) {
    setEditingId(a.id);
    setEditName(a.name);
    setEditDesc(a.description || "");
    setEditCategory(a.category || "");
  }

  function saveEdit(id: number) {
    updateArea.mutate({
      id,
      data: { name: editName, description: editDesc || null, category: editCategory || null },
    });
  }

  const AREA_CATEGORY_ORDER = ["UnPuzzle", "Chores", "Routines", "Roles", "Getting Things Done", "Other"];

  const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    "UnPuzzle": "The 5 core life puzzle pieces — mindfulness, fitness, career, finances, and joy",
    "Chores": "Recurring household tasks that keep your environment running",
    "Routines": "Time-blocked rituals that structure your day",
    "Roles": "The people and roles you show up for every day",
    "Getting Things Done": "Context-based action lists for executing tasks",
    "Other": "Uncategorized areas",
  };

  const groupedAreas = AREA_CATEGORY_ORDER.reduce<Record<string, Area[]>>((acc, cat) => {
    const catAreas = areas.filter(a => (a.category || "Other") === cat);
    if (catAreas.length > 0) acc[cat] = catAreas;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HorizonBadge level={2} label="Responsibilities of Focus" />
        <span className="text-xs text-muted-foreground">What responsibilities do I maintain?</span>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Select responsibility..." /></SelectTrigger>
            <SelectContent>
              {AREA_CATEGORY_ORDER.filter(c => c !== "Other").map(c => (
                <SelectItem key={c} value={c}>
                  <span className="font-medium">{c}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{CATEGORY_DESCRIPTIONS[c]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Area name (e.g. Health, Finances, Career...)" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-area" />
          <Input placeholder="Brief description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button size="sm" onClick={() => create.mutate()} disabled={!name.trim() || !category} data-testid="button-add-area">
            <Plus className="w-3 h-3 mr-1" /> Add Area
          </Button>
        </CardContent>
      </Card>

      {AREA_CATEGORY_ORDER.map(cat => {
        const catAreas = groupedAreas[cat];
        if (!catAreas || catAreas.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{cat}</h3>
                <span className="text-[10px] text-muted-foreground">{catAreas.length} area{catAreas.length !== 1 ? "s" : ""}</span>
              </div>
              {CATEGORY_DESCRIPTIONS[cat] && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{CATEGORY_DESCRIPTIONS[cat]}</p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {catAreas.map((a) => {
                if (editingId === a.id) {
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-4 space-y-2">
                        <Select value={editCategory} onValueChange={setEditCategory}>
                          <SelectTrigger className="text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
                          <SelectContent>
                            {AREA_CATEGORY_ORDER.filter(c => c !== "Other").map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Area name" />
                        <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description (optional)" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(a.id)} disabled={!editName.trim()}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <Card key={a.id}>
                    <CardContent className="p-3 flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{a.name}</p>
                        {a.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 ml-2">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(a)} data-testid={`edit-area-${a.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive h-6 w-6 p-0" onClick={() => deleteArea.mutate(a.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// IDENTITY (unified — identity absorbs all habit fields)
// ============================================================
function IdentitySection({ identities, areas }: { identities: Identity[]; areas: Area[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [areaId, setAreaId] = useState<string>("");
  const [statement, setStatement] = useState("");
  const [cue, setCue] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<string>("");
  const [recurrence, setRecurrence] = useState<string | null>(JSON.stringify({ type: "daily", interval: 1 }));
  const [craving, setCraving] = useState("");
  const [reward, setReward] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAreaId, setEditAreaId] = useState<string>("");
  const [editStatement, setEditStatement] = useState("");
  const [editCue, setEditCue] = useState("");
  const [editTimeOfDay, setEditTimeOfDay] = useState<string>("");
  const [editRecurrence, setEditRecurrence] = useState<string | null>(null);
  const [editCraving, setEditCraving] = useState("");
  const [editReward, setEditReward] = useState("");

  const activeIdentities = identities.filter(i => i.active);

  const AREA_CATEGORIES = ["UnPuzzle", "Chores", "Routines", "Roles", "Getting Things Done"];

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/identities", {
      statement,
      areaId: areaId && !areaId.startsWith("__") ? Number(areaId) : null,
      visionId: null,
      cue: cue || null,
      craving: craving || null,
      response: statement,
      reward: reward || null,
      frequency: recurrence || JSON.stringify({ type: "daily", interval: 1 }),
      targetCount: 1,
      active: 1,
      timeOfDay: timeOfDay || null,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setStatement(""); setAreaId(""); setCue(""); setTimeOfDay(""); setCraving(""); setReward("");
      setRecurrence(JSON.stringify({ type: "daily", interval: 1 }));
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
    },
  });

  const updateIdentity = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Identity> }) =>
      apiRequest("PATCH", `/api/identities/${id}`, data),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
    },
  });

  const deleteIdentity = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/identities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/identities"] }),
  });

  function startEdit(id: Identity) {
    setEditingId(id.id);
    setEditStatement(id.statement);
    setEditAreaId(id.areaId ? String(id.areaId) : "");
    setEditCue(id.cue || "");
    setEditTimeOfDay(id.timeOfDay || "");
    setEditRecurrence(id.frequency || null);
    setEditCraving(id.craving || "");
    setEditReward(id.reward || "");
  }

  function saveEdit(id: number) {
    updateIdentity.mutate({
      id,
      data: {
        statement: editStatement,
        areaId: editAreaId && !editAreaId.startsWith("__") ? Number(editAreaId) : null,
        cue: editCue || null,
        craving: editCraving || null,
        reward: editReward || null,
        frequency: editRecurrence || JSON.stringify({ type: "daily", interval: 1 }),
        timeOfDay: editTimeOfDay || null,
      },
    });
  }

  function AreaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="text-sm" data-testid="select-identity-area">
          <SelectValue placeholder="Select area (required)" />
        </SelectTrigger>
        <SelectContent>
          {AREA_CATEGORIES.map(cat => {
            const catAreas = areas.filter(a => (a.category || "Other") === cat);
            if (catAreas.length === 0) return null;
            return [
              <SelectItem key={`hdr-${cat}`} value={`__hdr_${cat}`} disabled className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border-b border-primary/10">
                {cat}
              </SelectItem>,
              ...catAreas.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              )),
            ];
          })}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Identity & Habits</span>
          <span className="text-xs text-muted-foreground">"I am the type of person who..."</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {activeIdentities.length} active
        </Badge>
      </div>

      {/* Build Your Identity Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" data-testid="button-add-identity">
            <Plus className="w-3 h-3 mr-1" /> Build Your Identity
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Build Your Identity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium">In the area of... *</label>
              <AreaSelect value={areaId} onChange={setAreaId} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">I'm the type of person who... *</label>
              <Input
                placeholder="e.g. exercises every morning"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                className="text-sm mt-1"
                data-testid="input-identity"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">when...</label>
              <Input
                placeholder="e.g. my alarm goes off at 6am"
                value={cue}
                onChange={(e) => setCue(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">in the...</label>
              <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                <SelectTrigger className="text-sm mt-1">
                  <SelectValue placeholder="Select time of day" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OF_DAY_CATEGORIES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label} <span className="text-[10px] text-muted-foreground ml-1">({t.range})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Recurrence</label>
              <div className="mt-1">
                <RecurrenceBuilder value={recurrence} onChange={setRecurrence} requireRecurrence />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">because...</label>
              <Input
                placeholder="e.g. what's attractive about it? why crave it?"
                value={craving}
                onChange={(e) => setCraving(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">I'll be rewarded by...</label>
              <Input
                placeholder="e.g. describe how it satisfies you"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => create.mutate()}
              disabled={!statement.trim() || !areaId || areaId.startsWith("__")}
            >
              Create Identity
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Identity Cards */}
      {activeIdentities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No identities yet</p>
            <p className="text-xs mt-1">Build your identity-driven systems above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeIdentities.map((id) => {
            const area = areas.find(a => a.id === id.areaId);
            if (editingId === id.id) {
              return (
                <Card key={id.id} className="bg-primary/[0.03]">
                  <CardContent className="p-4 space-y-3">
                    <AreaSelect value={editAreaId} onChange={setEditAreaId} />
                    <div>
                      <span className="text-xs text-muted-foreground">I'm the type of person who...</span>
                      <Input value={editStatement} onChange={(e) => setEditStatement(e.target.value)} className="text-sm mt-1" />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">when...</span>
                      <Input value={editCue} onChange={(e) => setEditCue(e.target.value)} className="text-sm mt-1" />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">in the...</span>
                      <Select value={editTimeOfDay} onValueChange={setEditTimeOfDay}>
                        <SelectTrigger className="text-sm mt-1"><SelectValue placeholder="Time of day" /></SelectTrigger>
                        <SelectContent>
                          {TIME_OF_DAY_CATEGORIES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Recurrence</span>
                      <div className="mt-1"><RecurrenceBuilder value={editRecurrence} onChange={setEditRecurrence} requireRecurrence /></div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">because...</span>
                      <Input value={editCraving} onChange={(e) => setEditCraving(e.target.value)} className="text-sm mt-1" />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">I'll be rewarded by...</span>
                      <Input value={editReward} onChange={(e) => setEditReward(e.target.value)} className="text-sm mt-1" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(id.id)} disabled={!editStatement.trim()}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <Card key={id.id} className="bg-primary/[0.03]">
                <CardContent className="p-3 flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    {area && (
                      <p className="text-[11px] text-muted-foreground mb-0.5">
                        In the area of <span className="font-medium text-foreground">{area.name}</span>
                      </p>
                    )}
                    <p className="text-sm font-medium" data-testid={`identity-${id.id}`}>
                      I'm the type of person who {id.statement}
                    </p>
                    {id.cue && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        when <span className="font-medium text-foreground">{id.cue}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {id.timeOfDay && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {TIME_OF_DAY_CATEGORIES.find(t => t.value === id.timeOfDay)?.label || id.timeOfDay}
                        </Badge>
                      )}
                      {id.frequency && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {formatRecurrence(id.frequency)}
                        </Badge>
                      )}
                      {id.craving && (
                        <span className="text-[10px] text-muted-foreground">because: {id.craving}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <a href={`#/projects/${id.id}`}>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-chart-5/10 transition-colors text-chart-5 border-chart-5/30">
                          <FolderOpen className="w-3 h-3" /> Project
                        </Badge>
                      </a>
                      <a href={`#/routine?id=${id.id}`}>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-violet-500/10 transition-colors text-violet-600 dark:text-violet-400 border-violet-500/30">
                          <Repeat2 className="w-3 h-3" /> Routine
                        </Badge>
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(id)} data-testid={`edit-identity-${id.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive h-6 w-6 p-0"
                      onClick={() => deleteIdentity.mutate(id.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Link to Routine */}
      <div className="pt-2">
        <a href="#/routine">
          <span className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
            Manage your routine <ArrowRight className="w-3 h-3" />
          </span>
        </a>
      </div>
    </div>
  );
}

