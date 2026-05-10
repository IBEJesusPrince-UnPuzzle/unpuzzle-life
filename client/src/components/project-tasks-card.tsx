// ProjectTasksCard — PR #26 (project tasks UI per §10)
// PR #27 — Drag-to-reorder support (grip handle + HTML5 drag + touch pointer fallback)
//
// Replaces the Tasks placeholder shipped in PR #25 with the real Tasks UI:
//
//   - "Add task" button (creates an empty row in inline-edit mode)
//   - "Suggest tasks" stub (UI placeholder; backend lands in Phase 8 §12)
//   - Task rows: grip + checkbox + title + [×] mark-for-removal
//       - Long-press grip → drag to reorder (touch + mouse)
//       - Tap row title → inline edit (Save / Cancel)
//       - Checkbox toggles status: 'open' ↔ 'done'
//       - Done rows render with line-through styling
//       - Marked rows DO NOT render here — they live in MarkedForRemovalSection
//         (single source of truth, matches PR #25 rule for support rows)
//
// Reorder semantics (PR #27):
//   - Grip is hidden when row is in inline-edit mode (drag disabled).
//   - Marked-for-removal rows aren't rendered here, so drag is naturally
//     unavailable for them.
//   - On drop, we PATCH sortOrder for every affected row (compact 0..n-1)
//     and invalidate the task list query. Optimistic local override holds
//     the new order until the server confirms.
//   - TaskDependenciesSubCard numbered list and the sticky Next-action peek
//     read the same query, so they auto-track the new order — no changes.
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

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import type { ProjectTask } from "@shared/schema";
import { useDraggableReorder } from "@/hooks/use-draggable-reorder";

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

  // Optimistic local override of the visible-task order. When a drag
  // completes, we set this to the new id sequence so the UI reorders
  // immediately while the server PATCH(es) are in flight. Once the query
  // refetch confirms, we clear the override (the server order matches).
  //
  // The override is just an array of task ids; we apply it on top of
  // tasksQuery.data so newly-arrived rows from a refetch still appear
  // in the right spot (anything not in the override falls through to the
  // normal sortTasks ordering at the tail).
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null);

  // The visible (non-marked) tasks, sorted. If an orderOverride is in
  // effect, it wins for any ids it covers; the rest fall through to the
  // default sortTasks order.
  const visibleTasks = useMemo(() => {
    const all = tasksQuery.data ?? [];
    const filtered = all.filter(
      t => !markedForRemoval.has(taskRemovalKey(t.id)),
    );
    if (!orderOverride || orderOverride.length === 0) {
      return sortTasks(filtered);
    }
    const byId = new Map(filtered.map(t => [t.id, t]));
    const ordered: ProjectTask[] = [];
    for (const id of orderOverride) {
      const t = byId.get(id);
      if (t) {
        ordered.push(t);
        byId.delete(id);
      }
    }
    // Tail: any tasks not in the override (e.g. newly created during drag)
    // fall back to the default sort.
    const tail = sortTasks(Array.from(byId.values()));
    return [...ordered, ...tail];
  }, [tasksQuery.data, markedForRemoval, orderOverride]);

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

  // ----- Drag state -----
  //
  // PR #29c — The headless drag state machine (PR #27 behavior preserved
  // byte-for-byte) is extracted into useDraggableReorder. The hook owns
  // draggingId / dropTargetId state, HTML5 drag handlers, the pointer
  // long-press fallback, the 250ms timer, the 8px scroll-vs-drag heuristic,
  // elementFromPoint hit-testing, and setPointerCapture. It does NOT own
  // persistence — that's project-specific (PATCH /api/project-tasks/:id)
  // and stays here as persistOrder, fed by the hook's onCommit callback.

  // Persist a new order: PATCH sortOrder for every row that changed,
  // then invalidate the query. Optimistic override is set immediately
  // before calling; we clear it after the invalidation completes.
  async function persistOrder(newOrder: number[]) {
    const all = tasksQuery.data ?? [];
    const byId = new Map(all.map(t => [t.id, t]));
    const patches: Array<Promise<unknown>> = [];
    newOrder.forEach((id, idx) => {
      const row = byId.get(id);
      if (!row) return;
      if (row.sortOrder !== idx) {
        patches.push(
          apiRequest("PATCH", `/api/project-tasks/${id}`, { sortOrder: idx }),
        );
      }
    });
    if (patches.length === 0) {
      setOrderOverride(null);
      return;
    }
    try {
      await Promise.all(patches);
      await queryClient.invalidateQueries({
        queryKey: [`/api/project-tasks?projectId=${projectId}`],
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't reorder tasks",
        description: parseServerError(err as Error, "Try again."),
      });
    } finally {
      setOrderOverride(null);
    }
  }

  // Drag state machine — hook-driven. onCommit fires once per non-no-op
  // drop with the new id order; we set the optimistic override and fire
  // the persist in the background, matching the pre-extraction sequence.
  const {
    draggingId,
    dropTargetId,
    onDragStart,
    onDragOverRow,
    onDropRow,
    onDragEnd,
    onGripPointerDown,
    onGripPointerMove,
    onGripPointerUp,
    onGripPointerCancel,
  } = useDraggableReorder<ProjectTask>({
    items: visibleTasks,
    onCommit: (next) => {
      setOrderOverride(next);
      void persistOrder(next);
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
            const isDragSource = draggingId === task.id;
            const isDropTarget =
              dropTargetId === task.id && draggingId !== null && draggingId !== task.id;
            return (
              <div
                key={task.id}
                data-task-row="true"
                data-task-id={task.id}
                className={
                  "flex items-start gap-2 py-1.5 px-2 rounded border bg-background " +
                  (isDragSource ? "opacity-50 " : "") +
                  (isDropTarget ? "border-t-2 border-t-primary " : "")
                }
                onDragOver={e => onDragOverRow(e, task.id)}
                onDrop={e => onDropRow(e, task.id)}
                data-testid={`row-project-task-${task.id}`}
              >
                {isEditing ? (
                  // No grip while editing — reorder is disabled per locked plan.
                  <span
                    className="w-3.5 mt-0.5 shrink-0"
                    aria-hidden="true"
                    data-testid={`grip-disabled-task-${task.id}`}
                  />
                ) : (
                  <button
                    type="button"
                    draggable
                    onDragStart={e => onDragStart(e, task.id)}
                    onDragEnd={onDragEnd}
                    onPointerDown={e => onGripPointerDown(e, task.id)}
                    onPointerMove={onGripPointerMove}
                    onPointerUp={onGripPointerUp}
                    onPointerCancel={onGripPointerCancel}
                    className={
                      "shrink-0 mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground " +
                      (isDragSource ? "cursor-grabbing" : "")
                    }
                    aria-label={`Reorder ${task.title}`}
                    data-testid={`grip-project-task-${task.id}`}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </button>
                )}
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
