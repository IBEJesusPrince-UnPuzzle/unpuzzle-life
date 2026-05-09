// TaskDependenciesSubCard — PR #26
//
// Nested sub-card inside the Tasks card on /projects/:id/edit.
//
// §10 lock (lines 789-794):
//   "Task dependencies still use a numbered list (1, 2, 3, 4) instead of
//    'X depends on Y' sentences. Edit links button stays."
//
// What ships in PR #26:
//   - Numbered list reflecting current task order (sortOrder ASC, NULLs
//     last, then id ASC — same rule the Tasks card uses).
//   - Marked-for-removal tasks are excluded so the list always matches
//     what's visible above.
//   - "Suggest task order" stub (UI placeholder; backend lands in §12).
//   - "Edit links" stub (full dependency-graph editor lands in a later
//     Phase 5 PR; see v8-path-a-spec-patch.md).
//
// Numbering is purely derived state — there's no separate sort_order for
// dependencies. When drag-to-reorder ships (also roadmapped), the list
// will simply re-number on its own.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ProjectTask } from "@shared/schema";
import { taskRemovalKey } from "@/components/project-tasks-card";

export interface TaskDependenciesSubCardProps {
  projectId: number;
  markedForRemoval: Set<string>;
}

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

export function TaskDependenciesSubCard({
  projectId,
  markedForRemoval,
}: TaskDependenciesSubCardProps) {
  const tasksQuery = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${projectId}`],
  });

  const numbered = useMemo(() => {
    const all = tasksQuery.data ?? [];
    const visible = all.filter(
      t => !markedForRemoval.has(taskRemovalKey(t.id)),
    );
    return sortTasks(visible);
  }, [tasksQuery.data, markedForRemoval]);

  return (
    <div
      className="border rounded-md p-3 space-y-2 bg-background"
      data-testid="card-task-dependencies"
    >
      <div className="space-y-0.5">
        <Label className="text-xs">Task dependencies</Label>
        <p className="text-[11px] italic text-muted-foreground -mt-0.5">
          -show the order tasks should be completed in
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          disabled
          data-testid="button-suggest-task-order"
        >
          Suggest task order (coming soon)
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          disabled
          data-testid="button-edit-task-links"
        >
          Edit links (coming soon)
        </Button>
      </div>

      {numbered.length === 0 ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="text-task-dependencies-empty"
        >
          No tasks yet.
        </p>
      ) : (
        <ol
          className="text-sm space-y-1"
          data-testid="list-task-dependencies"
        >
          {numbered.map((task, idx) => (
            <li
              key={task.id}
              className={
                "flex items-baseline gap-2 " +
                (task.status === "done"
                  ? "text-muted-foreground line-through"
                  : "")
              }
              data-testid={`task-dependency-row-${task.id}`}
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                {idx + 1})
              </span>
              <span className="flex-1 leading-tight">{task.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
