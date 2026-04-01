import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
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
  Inbox as InboxIcon, Plus, ArrowRight, Trash2, Zap, Pencil, Check, X,
  FolderOpen, Archive, Sparkles, ArrowLeft, Undo2,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { InboxItem, Project, Area } from "@shared/schema";

type ProcessStep = "choose" | "doIt" | "addToProject" | "fileIt" | "wonderIt" | "trashIt";

export default function InboxPage() {
  const [newItem, setNewItem] = useState("");
  const [captureAreaId, setCaptureAreaId] = useState<string>("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const { data: items = [] } = useQuery<InboxItem[]>({ queryKey: ["/api/inbox"] });
  const { data: trashedItems = [] } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox/trashed"],
    queryFn: () => apiRequest("GET", "/api/inbox/trashed").then(r => r.json()),
  });
  const { data: projectsList = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: areasList = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const unprocessed = items.filter(i => !i.processed);
  const processed = items.filter(i => i.processed);

  const addItem = useMutation({
    mutationFn: ({ content, areaId }: { content: string; areaId: number | null }) =>
      apiRequest("POST", "/api/inbox", {
        content,
        areaId,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setNewItem("");
      setCaptureAreaId("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest("PATCH", `/api/inbox/${id}`, { content }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  const restoreItem = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/inbox/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-center mb-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture everything. Process into the right place.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {unprocessed.length} unprocessed
        </Badge>
      </div>

      {/* Capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newItem.trim() && captureAreaId) {
            addItem.mutate({
              content: newItem.trim(),
              areaId: captureAreaId && captureAreaId !== "none" ? Number(captureAreaId) : null,
            });
          }
        }}
        className="flex flex-col sm:flex-row gap-2 sm:items-end"
      >
        <Input
          placeholder="What's on your mind? Brain dump here..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="flex-1"
          data-testid="input-inbox-capture"
        />
        <div className="flex gap-2">
          <Select value={captureAreaId} onValueChange={setCaptureAreaId}>
            <SelectTrigger className="text-sm w-40">
              <SelectValue placeholder="Related Area..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No area</SelectItem>
              {areasList.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!newItem.trim() || !captureAreaId} data-testid="button-inbox-add">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </form>

      {/* Unprocessed Items */}
      {unprocessed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <InboxIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Inbox zero</p>
          <p className="text-xs mt-1">Your mind is clear. Capture anything new above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unprocessed.map((item) => (
            <Card key={item.id} className="group">
              <CardContent className="p-4 flex items-start gap-3">
                <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && editText.trim()) updateItem.mutate({ id: item.id, content: editText.trim() });
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="text-sm h-8"
                        data-testid={`input-edit-${item.id}`}
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-primary"
                        disabled={!editText.trim()}
                        onClick={() => updateItem.mutate({ id: item.id, content: editText.trim() })}
                        data-testid={`button-save-edit-${item.id}`}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
                        onClick={() => setEditingId(null)}
                        data-testid={`button-cancel-edit-${item.id}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm" data-testid={`inbox-item-${item.id}`}>{item.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                          })}
                        </p>
                        {item.areaId && (() => {
                          const area = areasList.find(a => a.id === item.areaId);
                          return area ? (
                            <span className="text-[10px] text-muted-foreground">
                              In the area of <span className="font-medium text-foreground">{area.name}</span>
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-1 ${editingId === item.id ? "invisible" : ""}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => { setEditingId(item.id); setEditText(item.content); }}
                    data-testid={`button-edit-${item.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Dialog open={processingId === item.id} onOpenChange={(open) => {
                    if (!open) setProcessingId(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setProcessingId(item.id)}
                        data-testid={`button-process-${item.id}`}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Process
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                      <ProcessWizard
                        item={item}
                        projects={projectsList}
                        areas={areasList}
                        onDone={() => setProcessingId(null)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recently Processed */}
      {processed.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Recently processed
          </p>
          <div className="space-y-1">
            {processed.slice(0, 5).map((item) => {
              const itemArea = areasList.find(a => a.id === item.areaId);
              return (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Archive className="w-3 h-3" />
                  <span className="truncate flex-1 line-through">{item.content}</span>
                  {itemArea && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      In the area of <span className="font-medium">{itemArea.name}</span>
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">{item.processedAs}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently Trashed */}
      {trashedItems.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Recently Trashed (7-day recovery)
          </p>
          <div className="space-y-1">
            {trashedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground group">
                <Trash2 className="w-3 h-3" />
                <span className="truncate flex-1 line-through">{item.content}</span>
                <span className="text-[10px]">
                  {item.deletedAt && new Date(item.deletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs opacity-0 group-hover:opacity-100"
                  onClick={() => restoreItem.mutate(item.id)}
                  data-testid={`button-restore-${item.id}`}
                >
                  <Undo2 className="w-3 h-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PROCESS WIZARD
// ============================================================
function ProcessWizard({ item, projects, areas, onDone }: {
  item: InboxItem;
  projects: Project[];
  areas: Area[];
  onDone: () => void;
}) {
  const [step, setStep] = useState<ProcessStep>("choose");

  return (
    <div>
      <DialogHeader>
        <DialogTitle className="text-base">
          Process: {item.content}
        </DialogTitle>
      </DialogHeader>

      <div className="pt-3">
        {step === "choose" && (
          <ChooseStep onSelect={setStep} />
        )}
        {step === "doIt" && (
          <DoItStep item={item} areas={areas} onBack={() => setStep("choose")} onDone={onDone} />
        )}
        {step === "addToProject" && (
          <AddToProjectStep item={item} projects={projects} onBack={() => setStep("choose")} onDone={onDone} />
        )}
        {step === "fileIt" && (
          <FileItStep item={item} areas={areas} projects={projects} onBack={() => setStep("choose")} onDone={onDone} />
        )}
        {step === "wonderIt" && (
          <WonderItStep item={item} onBack={() => setStep("choose")} onDone={onDone} />
        )}
        {step === "trashIt" && (
          <TrashItStep item={item} onBack={() => setStep("choose")} onDone={onDone} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP 1: CHOOSE
// ============================================================
function ChooseStep({ onSelect }: { onSelect: (step: ProcessStep) => void }) {
  const options: { step: ProcessStep; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    {
      step: "doIt",
      label: "Do It",
      desc: "Task takes less than 5 minutes",
      icon: <Zap className="w-5 h-5" />,
      color: "hover:border-amber-500/50 hover:bg-amber-500/5",
    },
    {
      step: "addToProject",
      label: "Add To Projects",
      desc: "Multi-step outcome",
      icon: <FolderOpen className="w-5 h-5" />,
      color: "hover:border-blue-500/50 hover:bg-blue-500/5",
    },
    {
      step: "fileIt",
      label: "File It",
      desc: "Reference for later",
      icon: <Archive className="w-5 h-5" />,
      color: "hover:border-emerald-500/50 hover:bg-emerald-500/5",
    },
    {
      step: "wonderIt",
      label: "Wonder It",
      desc: "Someday / maybe",
      icon: <Sparkles className="w-5 h-5" />,
      color: "hover:border-purple-500/50 hover:bg-purple-500/5",
    },
    {
      step: "trashIt",
      label: "Trash It",
      desc: "Not actionable",
      icon: <Trash2 className="w-5 h-5" />,
      color: "hover:border-red-500/50 hover:bg-red-500/5",
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">What is this?</p>
      {options.map((opt) => (
        <button
          key={opt.step}
          onClick={() => onSelect(opt.step)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${opt.color}`}
          data-testid={`process-option-${opt.step}`}
        >
          <div className="shrink-0 text-muted-foreground">{opt.icon}</div>
          <div>
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-xs text-muted-foreground">{opt.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// DO IT — Create a planner task
// ============================================================
function DoItStep({ item, areas, onBack, onDone }: {
  item: InboxItem; areas: Area[]; onBack: () => void; onDone: () => void;
}) {
  const [goal, setGoal] = useState(item.content);
  const [areaId, setAreaId] = useState<string>(item.areaId ? String(item.areaId) : "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/planner-tasks", {
        date,
        areaId: areaId && areaId !== "none" ? Number(areaId) : null,
        goal,
        startTime: startTime || null,
        endTime: endTime || null,
        hours: null,
        status: "planned",
        recurrence: null,
      });
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processed: 1, processedAs: "task" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onDone();
    },
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to choices
      </button>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">What</label>
          <Input value={goal} onChange={e => setGoal(e.target.value)} placeholder="What needs to be done?" className="text-sm" data-testid="input-doit-goal" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded-md bg-card text-foreground" />
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded-md bg-card text-foreground" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">End Time</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded-md bg-card text-foreground" />
          </div>
        </div>

        <Button className="w-full" disabled={!goal.trim()} onClick={() => create.mutate()} data-testid="button-doit-save">
          <Zap className="w-4 h-4 mr-1" /> Create Task & Process
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// ADD TO PROJECTS
// ============================================================
function AddToProjectStep({ item, projects, onBack, onDone }: {
  item: InboxItem; projects: Project[]; onBack: () => void; onDone: () => void;
}) {
  const [subStep, setSubStep] = useState<"list" | "createNew">("list");
  const [newProjectTitle, setNewProjectTitle] = useState(item.content);
  const activeProjects = projects.filter(p => p.status === "active");

  const addToExisting = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest("POST", "/api/actions", {
        title: item.content,
        projectId,
        areaId: item.areaId || null,
        createdAt: new Date().toISOString(),
      });
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processed: 1, processedAs: "project" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onDone();
    },
  });

  const createNew = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/projects", {
        title: newProjectTitle,
        areaId: item.areaId || null,
        status: "active",
        createdAt: new Date().toISOString(),
      });
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processed: 1, processedAs: "project" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onDone();
    },
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to choices
      </button>

      {subStep === "list" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Add to an existing project or create a new one:</p>
          {activeProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => addToExisting.mutate(p.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-left"
              data-testid={`select-project-${p.id}`}
            >
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{p.title}</span>
            </button>
          ))}
          <Button variant="outline" className="w-full border-dashed" onClick={() => setSubStep("createNew")}>
            <Plus className="w-4 h-4 mr-1" /> Create New Project
          </Button>
        </div>
      )}

      {subStep === "createNew" && (
        <div className="space-y-3">
          <button onClick={() => setSubStep("list")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to project list
          </button>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Project title</label>
            <Input value={newProjectTitle} onChange={e => setNewProjectTitle(e.target.value)} data-testid="input-new-project" />
          </div>
          <Button className="w-full" disabled={!newProjectTitle.trim()} onClick={() => createNew.mutate()} data-testid="button-create-project">
            <FolderOpen className="w-4 h-4 mr-1" /> Create Project & Process
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FILE IT
// ============================================================
function FileItStep({ item, areas, projects, onBack, onDone }: {
  item: InboxItem; areas: Area[]; projects: Project[]; onBack: () => void; onDone: () => void;
}) {
  const [areaId, setAreaId] = useState<string>(item.areaId ? String(item.areaId) : "");
  const [projectId, setProjectId] = useState<string>("");

  const file = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/inbox/${item.id}`, {
      processed: 1,
      processedAs: "reference",
      referenceAreaId: areaId && areaId !== "none" ? Number(areaId) : null,
      referenceProjectId: projectId && projectId !== "none" ? Number(projectId) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onDone();
    },
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to choices
      </button>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">File this item for future reference:</p>
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
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">Project (optional)</label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="No project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.filter(p => p.status === "active").map(p =>
                <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full" onClick={() => file.mutate()} data-testid="button-file-save">
          <Archive className="w-4 h-4 mr-1" /> File & Process
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// WONDER IT — Someday/Maybe
// ============================================================
function WonderItStep({ item, onBack, onDone }: {
  item: InboxItem; onBack: () => void; onDone: () => void;
}) {
  const [done, setDone] = useState(false);

  const wonder = useMutation({
    mutationFn: async () => {
      // Get or create the Someday/Maybe project
      const res = await apiRequest("GET", "/api/someday-project");
      const project = await res.json();
      // Add as action under that project
      await apiRequest("POST", "/api/actions", {
        title: item.content,
        projectId: project.id,
        areaId: item.areaId || null,
        createdAt: new Date().toISOString(),
      });
      // Mark inbox item processed
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processed: 1, processedAs: "someday" });
    },
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setTimeout(onDone, 1200);
    },
  });

  if (done) {
    return (
      <div className="py-8 text-center space-y-2">
        <Sparkles className="w-8 h-8 mx-auto text-purple-500" />
        <p className="text-sm font-medium">Filed to Someday/Maybe</p>
        <p className="text-xs text-muted-foreground">You can revisit this anytime from your projects.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to choices
      </button>

      <div className="py-4 text-center space-y-3">
        <Sparkles className="w-8 h-8 mx-auto text-purple-500/50" />
        <p className="text-sm">
          This will file <strong>"{item.content}"</strong> to your <strong>Someday/Maybe</strong> project.
        </p>
        <p className="text-xs text-muted-foreground">You can revisit and re-process it anytime.</p>
        <Button className="w-full" onClick={() => wonder.mutate()} data-testid="button-wonder-confirm">
          <Sparkles className="w-4 h-4 mr-1" /> Wonder It
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// TRASH IT — Soft delete
// ============================================================
function TrashItStep({ item, onBack, onDone }: {
  item: InboxItem; onBack: () => void; onDone: () => void;
}) {
  const [done, setDone] = useState(false);

  const trash = useMutation({
    mutationFn: () => apiRequest("POST", `/api/inbox/${item.id}/soft-delete`),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setTimeout(onDone, 1200);
    },
  });

  if (done) {
    return (
      <div className="py-8 text-center space-y-2">
        <Trash2 className="w-8 h-8 mx-auto text-red-500" />
        <p className="text-sm font-medium">Trashed</p>
        <p className="text-xs text-muted-foreground">You can restore it within 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to choices
      </button>

      <div className="py-4 text-center space-y-3">
        <Trash2 className="w-8 h-8 mx-auto text-red-500/50" />
        <p className="text-sm">
          Trash <strong>"{item.content}"</strong>?
        </p>
        <p className="text-xs text-muted-foreground">It will stay in your trash for 7 days before permanent deletion.</p>
        <Button variant="destructive" className="w-full" onClick={() => trash.mutate()} data-testid="button-trash-confirm">
          <Trash2 className="w-4 h-4 mr-1" /> Trash It
        </Button>
      </div>
    </div>
  );
}
