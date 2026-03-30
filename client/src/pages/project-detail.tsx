import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderOpen, CheckCircle2, FileText, Plus, ListTodo, Archive,
} from "lucide-react";
import { useState } from "react";
import type { Project, Action, InboxItem, Area } from "@shared/schema";

interface ProjectDetails {
  project: Project;
  actions: Action[];
  references: InboxItem[];
  areas: Area[];
}

export default function ProjectDetailPage({ id }: { id: number }) {
  const { data, isLoading } = useQuery<ProjectDetails>({
    queryKey: ["/api/projects", id, "details"],
    queryFn: () => apiRequest("GET", `/api/projects/${id}/details`).then(r => r.json()),
  });

  const [newAction, setNewAction] = useState("");

  const addAction = useMutation({
    mutationFn: () => apiRequest("POST", "/api/actions", {
      title: newAction,
      projectId: id,
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
      completed: 1,
      completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
    },
  });

  const uncompleteAction = useMutation({
    mutationFn: (actionId: number) => apiRequest("PATCH", `/api/actions/${actionId}`, {
      completed: 0,
      completedAt: null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "details"] });
    },
  });

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

  const { project, actions, references, areas } = data;
  const area = areas.find(a => a.id === project.areaId);
  const goalArea = project.goalId ? null : null; // future: link to goal
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
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {area.name}
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
            <Card key={action.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => completeAction.mutate(action.id)}
                  data-testid={`action-check-${action.id}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{action.title}</p>
                  {action.context && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-0.5">
                      {action.context}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* References */}
      {references.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-1">
            <FileText className="w-4 h-4" /> References ({references.length})
          </h2>
          {references.map(ref => {
            const refArea = areas.find(a => a.id === ref.referenceAreaId);
            return (
              <Card key={ref.id}>
                <CardContent className="p-3">
                  <p className="text-sm">{ref.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-muted-foreground">
                      Filed {new Date(ref.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric"
                      })}
                    </p>
                    {refArea && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {refArea.name}
                      </span>
                    )}
                  </div>
                  {ref.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{ref.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
                <p className="text-sm line-through text-muted-foreground">{action.title}</p>
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
