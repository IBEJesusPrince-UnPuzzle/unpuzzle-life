import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sparkles, ArrowLeft, Zap, FolderOpen, Archive, Trash2,
} from "lucide-react";
import { useState } from "react";
import type { InboxItem, Project, Area } from "@shared/schema";

export default function SomedayPage() {
  const { data: items = [] } = useQuery<InboxItem[]>({ queryKey: ["/api/inbox"] });
  const { data: projectsList = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: areasList = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const somedayItems = items.filter(i => i.processed && i.processedAs === "someday");
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Someday / Maybe
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ideas and possibilities you're not ready to act on yet.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {somedayItems.length} items
        </Badge>
      </div>

      {somedayItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No someday items</p>
            <p className="text-xs mt-1">Items filed as "Wonder It" from your inbox will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {somedayItems.map((item) => (
            <Card key={item.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{item.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Added {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 shrink-0"
                    onClick={() => setReprocessingId(reprocessingId === item.id ? null : item.id)}
                  >
                    Re-process
                  </Button>
                </div>

                {reprocessingId === item.id && (
                  <ReprocessActions
                    item={item}
                    projects={projectsList}
                    areas={areasList}
                    onDone={() => setReprocessingId(null)}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ReprocessActions({ item, projects, areas, onDone }: {
  item: InboxItem; projects: Project[]; areas: Area[]; onDone: () => void;
}) {
  const [action, setAction] = useState<"" | "task" | "project" | "reference" | "trash">("");
  const [taskName, setTaskName] = useState(item.content);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [context, setContext] = useState("");
  const [energy, setEnergy] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>(item.areaId ? String(item.areaId) : "");

  const doItNow = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      await apiRequest("POST", "/api/planner-tasks", {
        date: today,
        task: taskName,
        status: "done",
        areaId: item.areaId || null,
      });
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processedAs: "quick_task" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      onDone();
    },
  });

  const scheduleTask = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/planner-tasks", {
        date,
        task: taskName,
        status: "planned",
        areaId: areaId && areaId !== "none" ? Number(areaId) : item.areaId || null,
        context: context && context !== "none" ? context : null,
        energy: energy && energy !== "none" ? energy : null,
      });
      const newTask = await res.json();
      await apiRequest("PATCH", `/api/inbox/${item.id}`, {
        processedAs: "task",
        linkedPlannerTaskId: newTask.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      onDone();
    },
  });

  const addToProject = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/planner-tasks", {
        date: new Date().toISOString().split("T")[0],
        task: taskName,
        status: "planned",
        projectId: Number(selectedProjectId),
        areaId: item.areaId || null,
      });
      await apiRequest("PATCH", `/api/inbox/${item.id}`, { processedAs: "project" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
      onDone();
    },
  });

  const fileIt = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/inbox/${item.id}`, {
      processedAs: "reference",
      referenceProjectId: selectedProjectId && selectedProjectId !== "none" ? Number(selectedProjectId) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      onDone();
    },
  });

  const trashIt = useMutation({
    mutationFn: () => apiRequest("POST", `/api/inbox/${item.id}/soft-delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
      onDone();
    },
  });

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <p className="text-xs text-muted-foreground">Convert this item:</p>
      <div className="flex flex-wrap gap-1.5">
        <Button variant={action === "task" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setAction("task")}>
          <Zap className="w-3 h-3 mr-1" /> Do It Later
        </Button>
        <Button variant={action === "project" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setAction("project")}>
          <FolderOpen className="w-3 h-3 mr-1" /> Add To Project
        </Button>
        <Button variant={action === "reference" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setAction("reference")}>
          <Archive className="w-3 h-3 mr-1" /> File It
        </Button>
        <Button variant={action === "trash" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setAction("trash")}>
          <Trash2 className="w-3 h-3 mr-1" /> Trash
        </Button>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => doItNow.mutate()}>
          <Zap className="w-3 h-3 mr-1" /> Do It Now
        </Button>
      </div>

      {action === "task" && (
        <div className="space-y-2">
          <Input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="Task" className="text-sm h-8" />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="h-8 px-2 text-sm border rounded-md bg-card text-foreground" />
            <Select value={context} onValueChange={setContext}>
              <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Context" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any</SelectItem>
                <SelectItem value="@home">@home</SelectItem>
                <SelectItem value="@work">@work</SelectItem>
                <SelectItem value="@phone">@phone</SelectItem>
                <SelectItem value="@computer">@computer</SelectItem>
                <SelectItem value="@errands">@errands</SelectItem>
              </SelectContent>
            </Select>
            <Select value={energy} onValueChange={setEnergy}>
              <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Energy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full h-8" disabled={!taskName.trim()} onClick={() => scheduleTask.mutate()}>
            Schedule Task
          </Button>
        </div>
      )}

      {action === "project" && (
        <div className="space-y-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.filter(p => !p.archived).map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="w-full h-8" disabled={!selectedProjectId} onClick={() => addToProject.mutate()}>
            Add To Project
          </Button>
        </div>
      )}

      {action === "reference" && (
        <div className="space-y-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="text-sm h-8"><SelectValue placeholder="File to project (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.filter(p => !p.archived).map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="w-full h-8" onClick={() => fileIt.mutate()}>
            File As Reference
          </Button>
        </div>
      )}

      {action === "trash" && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-2">Move to trash? You can restore within 7 days.</p>
          <Button variant="destructive" size="sm" className="h-8" onClick={() => trashIt.mutate()}>
            <Trash2 className="w-3 h-3 mr-1" /> Confirm Trash
          </Button>
        </div>
      )}
    </div>
  );
}
