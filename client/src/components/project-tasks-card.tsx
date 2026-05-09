// ProjectTasksCard — PR #26 (project tasks UI per §10)
//
// Replaces the Tasks placeholder shipped in PR #25 with the real Tasks UI:
//
//   - "Add task" button (creates an empty row in inline-edit mode)
//   - "Suggest tasks" stub (UI placeholder; backend lands in Phase 8 §12)
//   - Task rows: checkbox + title + [×] mark-for-removal
//       - Tap row title → inline edit (Save / Cancel)
//       - Checkbox toggles status: 'open' ↔ 'done'
//       - Done rows render with line-through styling
//       - Marked rows DO NOT render here — they live in MarkedForRemovalSection
//         (single source of truth, matches PR #25 rule for support rows)
//
// Server contract is already in place from PR #21:
//   GET    /api/project-tasks?projectId=N      — list tasks for a project
//   POST   /api/project-tasks                  — { projectId, title, status, sortOrder, createdAt }
//   PATCH  /api/project-tasks/:id              — { title? status? sortOrder? }
//   DELETE /api/project-tasks/:id              — flushed on Done from markedForRemoval
//
// Marked-for-removal key shape:
//   `proj-task:<taskId>`
// Matches the existing `proj-support:<type>:<linkId>` pattern.
//
// All 'open' ↔ 'done' status writes go through PATCH and React Query
// invalidates the task list query. Inline edits do the same.
//
// This component is presentational + queries — it owns no draft state.
// Marked-for-removal state lives in the project-edit draft hook; we read
// it via `markedForRemoval` and call `markForRemoval` / `undoRemoval`.

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import type { ProjectTask } from "@shared/schema";

export interface ProjectTasksCardProps {
  projectId: number;
  // Marked-for-removal integration (from useAutosaveDraft on the parent page).
  markedForRemoval: Set<string>;
  markForRemoval: (key: string) => void;
}

export function taskRemovalKey(taskId: number): string {
  return `proj-task:${taskId}`;
}

// Sort tasks by sortOrder ASC (NULLs last), then by id ASC.
// Mirrors the §10 numbered-list ordering rule.
function sortTasks(rows: ProjectTask[]): ProjectTask[] {
  return [...rows].sort((a, b) => {
    const aHas = typeof a.sortOrder === "number";
    const bHas = typeof b.sortOrder === "number";
    if (aHas && bHas) {
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    } else if (aHas) {
      return -1;
    } else if (bHas) {
      return 1;
    }
    return a.id - b.id;
  });
}

export function ProjectTasksCard({
  projectId,
  markedForRemoval,
  markForRemoval,
}: ProjectTasksCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tasksQuery = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${projectId}`],
  });

  // The visible (non-marked) tasks, sorted.
  const visibleTasks = useMemo(() => {
    const all = tasksQuery.data ?? [];
    const filtered = all.filter(
      t => !markedForRemoval.has(taskRemovalKey(t.id)),
    );
    return sortTasks(filtered);
  }, [tasksQuery.data, markedForRemoval]);

  // Local UI state: which task ids are currently in inline-edit mode, and
  // the working title for each. We keep the working title outside the row
  // component so the row stays a controlled React element.
  const [editing, setEditing] = useState<Record<number, string>>({});
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function startEditing(task: ProjectTask) {
    setEditing(prev => ({ ...prev, [task.id]: task.title }));
  }
  function cancelEditing(taskId: number) {
    setEditing(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }
  function setEditingTitle(taskId: number, value: string) {
    setEditing(prev => ({ ...prev, [taskId]: value }));
  }

  // Auto-focus the input when a task enters edit mode.
  useEffect(() => {
    Object.keys(editing).forEach(idStr => {
      const id = Number(idStr);
      const el = inputRefs.current[id];
      if (el && document.activeElement !== el) {
        el.focus();
        el.select();
      }
    });
  }, [editing]);

  // ----- Mutations -----

  const createTask = useMutation({
    mutationFn: async (input: { title: string; sortOrder: number | null }) => {
      const res = await apiRequest("POST", "/api/project-tasks", {
        projectId,
        title: input.title,
        status: "open",
        sortOrder: input.sortOrder,
        createdAt: new Date().toISOString(),
      });
      return (await res.json()) as ProjectTask;
    },
    onSuccess: created => {
      void queryClient.invalidateQueries({
        queryKey: [`/api/project-tasks?projectId=${projectId}`],
      });
      // Drop straight into edit mode for the new row so the user can name it.
      // (The empty-title shortcut: createTask is only called from "Add task"
      //  when the user clicks the button — we POST with title "New task" so
      //  the server validation passes, then immediately let the user rename.)
      setEditing(prev => ({ ...prev, [created.id]: created.title }));
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't add task",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (input: {
      id: number;
      patch: Partial<Pick<ProjectTask, "title" | "status" | "sortOrder">>;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/project-tasks/${input.id}`,
        input.patch,
      );
      return (await res.json()) as ProjectTask;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [`/api/project-tasks?projectId=${projectId}`],
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't update task",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  // ----- Handlers -----

  function handleAddTask() {
    // Compute next sortOrder = max(current) + 1, defaulting to 0 if empty.
    const all = tasksQuery.data ?? [];
    const maxOrder = all.reduce((acc, t) => {
      if (typeof t.sortOrder === "number" && t.sortOrder > acc) return t.sortOrder;
      return acc;
    }, -1);
    createTask.mutate({ title: "New task", sortOrder: maxOrder + 1 });
  }

  function handleToggleStatus(task: ProjectTask) {
    const next = task.status === "done" ? "open" : "done";
    updateTask.mutate({ id: task.id, patch: { status: next } });
  }

  function handleSaveEdit(task: ProjectTask) {
    const working = editing[task.id];
    if (working === undefined) return;
    const trimmed = working.trim();
    if (trimmed.length === 0) {
      // Empty titles are not allowed by the server schema (notNull).
      // Cancel out instead of erroring.
      cancelEditing(task.id);
      return;
    }
    if (trimmed !== task.title) {
      updateTask.mutate({ id: task.id, patch: { title: trimmed } });
    }
    cancelEditing(task.id);
  }

  function handleMarkForRemoval(task: ProjectTask) {
    markForRemoval(taskRemovalKey(task.id));
    cancelEditing(task.id);
  }

  // ----- Render -----

  const isLoading = tasksQuery.isLoading;

  return (
    <div className="space-y-3" data-testid="card-project-tasks-body">
      <div className="space-y-0.5">
        <Label className="text-xs">Project tasks</Label>
        <p className="text-[11px] italic text-muted-foreground -mt-0.5">
          -add the tasks required to finish this project
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleAddTask}
          disabled={createTask.isPending}
          data-testid="button-add-task"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add task
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled
          data-testid="button-suggest-tasks"
        >
          Suggest tasks (coming soon)
        </Button>
      </div>

      {/* Task list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground" data-testid="text-tasks-loading">
          Loading tasks…
        </p>
      ) : visibleTasks.length === 0 ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="text-tasks-empty"
        >
          No tasks yet — add one to get started.
        </p>
      ) : (
        <div className="space-y-1.5" data-testid="list-project-tasks">
          {visibleTasks.map(task => {
            const isEditing = editing[task.id] !== undefined;
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded border bg-background"
                data-testid={`row-project-task-${task.id}`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={isDone}
                  onCheckedChange={() => handleToggleStatus(task)}
                  disabled={isEditing}
                  aria-label={isDone ? "Mark as open" : "Mark as done"}
                  data-testid={`checkbox-project-task-${task.id}`}
                />
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <Input
                      ref={(el) => { inputRefs.current[task.id] = el; }}
                      value={editing[task.id]}
                      onChange={e => setEditingTitle(task.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveEdit(task);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditing(task.id);
                        }
                      }}
                      className="h-7 text-sm"
                      data-testid={`input-project-task-${task.id}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => handleSaveEdit(task)}
                        data-testid={`button-save-task-${task.id}`}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => cancelEditing(task.id)}
                        data-testid={`button-cancel-task-${task.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={
                      "flex-1 text-left text-sm leading-tight cursor-text " +
                      (isDone ? "line-through text-muted-foreground" : "")
                    }
                    onClick={() => startEditing(task)}
                    data-testid={`button-edit-task-${task.id}`}
                  >
                    {task.title}
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => handleMarkForRemoval(task)}
                  aria-label={`Remove ${task.title}`}
                  data-testid={`button-remove-project-task-${task.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
