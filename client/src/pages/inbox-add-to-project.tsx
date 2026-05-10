// PR #29c — Add to Project page (Phase 8 inbox processing).
//
// Locked sources:
//   - workspace/inbox-processing-plan.md (Q3 drag locked 2026-05-10:
//     "Extract PR #27 drag into shared <DraggableTaskList>"; Q4 prefill locked:
//     "Use existing inbox_items.referenceProjectId column only"; Q7 add to
//     project drag UX locked: "Pre-save draggable preview with [new] badge".)
//   - PR #29c drag extraction: client/src/hooks/use-draggable-reorder.ts.
//
// UX (locked):
//   - Project dropdown — prefilled from inbox_items.referenceProjectId when set
//   - Task name input (defaults to inbox item content)
//   - Optional notes input
//   - Draggable preview list of EXISTING project tasks + a single bottom row
//     for the new task carrying a "[new]" badge. Reorder is in-memory only;
//     the chosen position is what we send as sortOrder on Save.
//   - Existing rows are draggable; the new row is also draggable (the whole
//     point of the preview is for the user to drop it into the desired slot).
//
// Server contract (PR #29a, MERGED #36):
//   POST /api/inbox/:id/process { action: "add_to_project",
//                                 payload: { projectId, taskName,
//                                            sortOrder?, notes? } }
//   - sortOrder optional; server auto-computes max+1 when omitted.
//   - We send the exact index from the dragged preview so the new row lands
//     where the user dropped it.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, GripVertical, Plus } from "lucide-react";
import { parseServerError } from "@/lib/parse-server-error";
import { useDraggableReorder } from "@/hooks/use-draggable-reorder";
import type { InboxItem, Project, ProjectTask } from "@shared/schema";

// Sentinel id used in the preview list to mark the not-yet-created task. We
// pick a number that can never collide with a real ProjectTask.id (those
// start at 1 and are positive). useDraggableReorder is generic over
// DraggableItem which only requires { id: number }, so this works.
const NEW_TASK_ID = -1;

interface PreviewRow {
  id: number;          // real ProjectTask.id, or NEW_TASK_ID
  title: string;       // display label
  isNew: boolean;      // true for the bottom-of-list new row
}

function sortExisting(rows: ProjectTask[]): ProjectTask[] {
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

export default function InboxAddToProjectPage() {
  const [, params] = useRoute<{ id?: string }>("/inbox/process/:id/add-to-project");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const itemId = Number(params?.id);
  const validId = Number.isFinite(itemId) && itemId > 0;

  // Inbox item — used to prefill the task name and to read referenceProjectId.
  const { data: inboxItem, isLoading: loadingItem, error: itemError } =
    useQuery<InboxItem>({
      queryKey: [`/api/inbox/${itemId}`],
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/inbox/${itemId}`);
        return r.json();
      },
      enabled: validId,
    });

  // All projects (for the picker).
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Form state.
  const [projectId, setProjectId] = useState<number | null>(null);
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");

  // Local order override for the preview (in-memory only — Save is what
  // commits the position). null = use natural ordering from the query.
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null);

  // Seed initial form state once the inbox item arrives.
  useEffect(() => {
    if (!inboxItem) return;
    setTaskName(inboxItem.content ?? "");
    // Q4 (locked): prefill project from inbox_items.referenceProjectId.
    if (inboxItem.referenceProjectId && projectId === null) {
      setProjectId(inboxItem.referenceProjectId);
    }
  }, [inboxItem, projectId]);

  // Existing project tasks for the selected project. Disabled until a
  // project is picked so we don't fire an empty-projectId request.
  const projectTasksEnabled = projectId !== null;
  const { data: existingTasks = [], isLoading: loadingTasks } = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${projectId ?? 0}`],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/project-tasks?projectId=${projectId}`,
      );
      return r.json();
    },
    enabled: projectTasksEnabled,
  });

  // When project changes, drop the order override so the preview shows the
  // natural order of the new project's tasks.
  useEffect(() => {
    setOrderOverride(null);
  }, [projectId]);

  // Build the preview rows: sorted existing tasks + new row at the bottom,
  // then apply any local order override.
  const previewRows: PreviewRow[] = useMemo(() => {
    const sorted = sortExisting(existingTasks);
    const base: PreviewRow[] = [
      ...sorted.map(t => ({ id: t.id, title: t.title, isNew: false })),
      // The new row is appended last by default per locked spec.
      { id: NEW_TASK_ID, title: taskName.trim() || "(new task)", isNew: true },
    ];
    if (!orderOverride) return base;
    // Apply the override. Any rows not in the override (e.g. concurrent
    // server-side adds) get appended in their natural order.
    const byId = new Map(base.map(r => [r.id, r]));
    const ordered: PreviewRow[] = [];
    orderOverride.forEach(id => {
      const r = byId.get(id);
      if (r) {
        ordered.push(r);
        byId.delete(id);
      }
    });
    base.forEach(r => {
      if (byId.has(r.id)) ordered.push(r);
    });
    return ordered;
  }, [existingTasks, taskName, orderOverride]);

  // Drag-to-reorder via the shared hook. onCommit updates local state only;
  // no PATCH fires until Save (and Save only POSTs the new row's sortOrder).
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
  } = useDraggableReorder<PreviewRow>({
    items: previewRows,
    onCommit: (next) => setOrderOverride(next),
  });

  // The sortOrder we send on Save = index of the new row in the preview.
  const newRowIndex = useMemo(() => {
    const idx = previewRows.findIndex(r => r.id === NEW_TASK_ID);
    return idx >= 0 ? idx : previewRows.length - 1;
  }, [previewRows]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (projectId === null) throw new Error("Pick a project first.");
      const trimmed = taskName.trim();
      if (!trimmed) throw new Error("Task name is required.");
      const r = await apiRequest("POST", `/api/inbox/${itemId}/process`, {
        action: "add_to_project",
        payload: {
          projectId,
          taskName: trimmed,
          sortOrder: newRowIndex,
          notes: notes.trim() || undefined,
        },
      });
      return r.json();
    },
    onSuccess: () => {
      // Re-pull both the inbox (item now processed) and the project's task
      // list (a new task was inserted). Then route back to the inbox.
      void queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      void queryClient.invalidateQueries({
        queryKey: [`/api/project-tasks?projectId=${projectId}`],
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] });
      toast({ title: "Added to project" });
      navigate("/inbox");
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Couldn't add to project",
        description: parseServerError(err as Error, "Try again."),
      });
    },
  });

  useEffect(() => {
    document.title = "Add to Project — UnPuzzle";
  }, []);

  // ----- Render -----

  if (!validId) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-add-to-project-invalid">
        <p className="text-sm text-destructive">Invalid inbox item.</p>
        <Button variant="ghost" onClick={() => navigate("/inbox")}>Back to Inbox</Button>
      </div>
    );
  }

  if (loadingItem) {
    return (
      <div className="p-6 max-w-md mx-auto" data-testid="page-add-to-project-loading">
        <p className="text-sm text-muted-foreground">Loading item…</p>
      </div>
    );
  }

  if (itemError || !inboxItem) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-add-to-project-error">
        <p className="text-sm text-destructive">Couldn't load inbox item.</p>
        <Button variant="ghost" onClick={() => navigate("/inbox")}>Back to Inbox</Button>
      </div>
    );
  }

  if (inboxItem.processed) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-add-to-project-already-processed">
        <p className="text-sm text-muted-foreground">
          This item has already been processed.
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/inbox")}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  const canSave = projectId !== null && taskName.trim().length > 0 && !saveMut.isPending;

  return (
    <div
      className="mx-auto w-full max-w-md px-4 py-4 sm:py-6"
      data-testid="page-add-to-project"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/inbox")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h1 className="text-base font-semibold" data-testid="text-page-title">
          Add to Project
        </h1>
        <span className="w-12" aria-hidden />
      </div>

      <div className="space-y-4 py-2">
        {/* Project picker */}
        <div className="space-y-1.5">
          <Label htmlFor="project-select">Project</Label>
          <Select
            value={projectId === null ? "" : String(projectId)}
            onValueChange={(v) => setProjectId(v ? Number(v) : null)}
          >
            <SelectTrigger
              id="project-select"
              data-testid="select-project"
            >
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem
                  key={p.id}
                  value={String(p.id)}
                  data-testid={`option-project-${p.id}`}
                >
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Task name */}
        <div className="space-y-1.5">
          <Label htmlFor="task-name">Task name</Label>
          <Input
            id="task-name"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="What is this task?"
            data-testid="input-task-name"
          />
        </div>

        {/* Optional notes */}
        <div className="space-y-1.5">
          <Label htmlFor="task-notes">Notes</Label>
          <Textarea
            id="task-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            data-testid="textarea-task-notes"
          />
        </div>

        {/* Draggable preview list */}
        <div className="space-y-1.5">
          <Label>Order in project</Label>
          {projectId === null ? (
            <p className="text-xs text-muted-foreground">
              Choose a project to preview the order.
            </p>
          ) : loadingTasks ? (
            <p className="text-xs text-muted-foreground">Loading tasks…</p>
          ) : (
            <ul
              className="space-y-1.5"
              data-testid="list-preview-tasks"
            >
              {previewRows.map(row => {
                const isDragging = draggingId === row.id;
                const isDropTarget = dropTargetId === row.id && draggingId !== null && draggingId !== row.id;
                return (
                  <li
                    key={row.id}
                    data-task-row="true"
                    data-task-id={row.id}
                    data-testid={`preview-row-${row.isNew ? "new" : row.id}`}
                    onDragOver={(e) => onDragOverRow(e, row.id)}
                    onDrop={(e) => onDropRow(e, row.id)}
                    className={[
                      "flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm",
                      isDragging ? "opacity-50" : "",
                      isDropTarget ? "border-primary" : "border-border",
                    ].filter(Boolean).join(" ")}
                  >
                    <button
                      type="button"
                      // Grip handle — initiates HTML5 drag (desktop) and the
                      // pointer-based long-press fallback (touch). Same UX as
                      // the project-edit page (PR #27).
                      draggable
                      onDragStart={(e) => onDragStart(e, row.id)}
                      onDragEnd={onDragEnd}
                      onPointerDown={(e) => onGripPointerDown(e, row.id)}
                      onPointerMove={onGripPointerMove}
                      onPointerUp={onGripPointerUp}
                      onPointerCancel={onGripPointerCancel}
                      aria-label="Drag to reorder"
                      data-testid={`grip-preview-${row.isNew ? "new" : row.id}`}
                      className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </button>
                    <span className="flex-1 truncate">{row.title}</span>
                    {row.isNew && (
                      <span
                        // [new] badge per locked ASCII. Distinct color so the
                        // user can see exactly where the new row lands.
                        className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                        data-testid="badge-new"
                      >
                        new
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => navigate("/inbox")}
          data-testid="button-cancel"
        >
          Cancel
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!canSave}
          data-testid="button-save"
        >
          {saveMut.isPending ? "Saving…" : (
            <>
              <Plus className="w-4 h-4 mr-1" />
              Add to project
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
