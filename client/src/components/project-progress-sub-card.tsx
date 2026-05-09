// ProjectProgressSubCard — PR #26
//
// Nested sub-card inside the Tasks card on /projects/:id/edit.
// (User confirmed 2026-05-09: Progress lives nested inside Tasks card,
//  not as a peer card, since all three numbers are task-derived.)
//
// §10 lock (lines 803-806):
//   "Progress
//    -see how much of the project is complete
//    1 / 4 tasks complete
//    Last touched today
//    Stalled? No"
//
// Contents:
//   - "X / Y tasks complete" — done count over total visible (marked
//     tasks excluded so the numbers match the list above).
//   - "Last touched <relative>" — derived from project.updatedAt.
//   - "Stalled? Yes/No" — Yes when project.updatedAt is older than the
//     14-day threshold (user-locked 2026-05-09), else No.
//
// All values are derived; no state owned here.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import type { ProjectTask } from "@shared/schema";
import { taskRemovalKey } from "@/components/project-tasks-card";

// User-locked 2026-05-09: Stalled threshold is 14 days.
const STALLED_DAY_THRESHOLD = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ProjectProgressSubCardProps {
  projectId: number;
  // Project's updatedAt (ISO timestamp). Optional because some early
  // create paths may not have it set yet.
  projectUpdatedAt: string | null | undefined;
  markedForRemoval: Set<string>;
}

function relativeTouched(updatedAt: string | null | undefined): string {
  if (!updatedAt) return "—";
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return "—";
  const days = Math.floor((Date.now() - ts) / MS_PER_DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "last month";
  return `${Math.floor(days / 30)} months ago`;
}

function isStalled(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  const days = Math.floor((Date.now() - ts) / MS_PER_DAY);
  return days > STALLED_DAY_THRESHOLD;
}

export function ProjectProgressSubCard({
  projectId,
  projectUpdatedAt,
  markedForRemoval,
}: ProjectProgressSubCardProps) {
  const tasksQuery = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${projectId}`],
  });

  const counts = useMemo(() => {
    const all = tasksQuery.data ?? [];
    const visible = all.filter(
      t => !markedForRemoval.has(taskRemovalKey(t.id)),
    );
    const total = visible.length;
    const done = visible.filter(t => t.status === "done").length;
    return { total, done };
  }, [tasksQuery.data, markedForRemoval]);

  const touched = relativeTouched(projectUpdatedAt);
  const stalled = isStalled(projectUpdatedAt);

  return (
    <div
      className="border rounded-md p-3 space-y-2 bg-background"
      data-testid="card-project-progress"
    >
      <div className="space-y-0.5">
        <Label className="text-xs">Progress</Label>
        <p className="text-[11px] italic text-muted-foreground -mt-0.5">
          -see how much of the project is complete
        </p>
      </div>
      <div className="text-sm space-y-1">
        <div data-testid="text-progress-counts">
          {counts.done} / {counts.total} tasks complete
        </div>
        <div
          className="text-xs text-muted-foreground"
          data-testid="text-progress-touched"
        >
          Last touched {touched}
        </div>
        <div
          className="text-xs text-muted-foreground"
          data-testid="text-progress-stalled"
        >
          Stalled? {stalled ? "Yes" : "No"}
        </div>
      </div>
    </div>
  );
}
