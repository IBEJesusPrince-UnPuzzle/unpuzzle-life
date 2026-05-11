// /projects/:id/edit — PR #25 (project edit screen restructure)
//
// Restructured per /home/user/workspace/pr25-project-edit-target.md.
//
// Layout (top → bottom):
//
//   - EditPageHeader (Back, "Edit project", info, Saved / Done / Undo / Redo / Revert)
//
//   - CollapsibleStickyHeader  (sits BELOW the toolbar, also sticky)
//       Always pinned: Name + Status + Priority + chevron toggle
//       Collapsible:   Dates + Next action + Progress
//
//   - Intro line (re-instated from §10, removed in PR #23)
//
//   - Bundle A (CollapsibleCard, default collapsed):
//       Trigger (dropdown) → Outcome done → Blockers → Risks watchouts → Notes
//       (Suggest stubs labeled "(coming soon)" under Blockers and Risks)
//
//   - Tasks (CollapsibleCard, default collapsed):
//       "+ Add task"  +  "Suggest tasks (coming soon)"
//       (no tasks yet — placeholder for full UI in later PR)
//       Nested Task dependencies sub-card with "Suggest task order (coming soon)"
//
//   - Bundle B (CollapsibleCard, default collapsed; inner accordion items also
//     default collapsed):
//       Linked responsibility → Related role → People → Places → Things →
//       Providers → Conditions → Workaround handling (placeholder) →
//       Related links
//
//   - MarkedForRemovalSection (renders only when count > 0; outside all
//     bundles; just above the bottom undo bar)
//
//   - EditPageUndoBar (existing component, unchanged)
//
// State persistence: all top-level + accordion open/closed flags persist to
// localStorage under key `project-edit:state:<projectId>` as a single JSON
// blob. First-visit fallback = all collapsed.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, ExternalLink } from "lucide-react";
import { EditPageHeader } from "@/components/edit-page-header";
import { EditPageUndoBar } from "@/components/edit-page-undo-bar";
import { CollapsibleStickyHeader } from "@/components/collapsible-sticky-header";
import { CollapsibleCard } from "@/components/collapsible-card";
import { MarkedForRemovalSection } from "@/components/marked-for-removal-section";
import {
  ProjectDeleteDialog,
  type ProjectDeleteSummary,
} from "@/components/project-delete-dialog";
import { ProjectTasksCard, taskRemovalKey } from "@/components/project-tasks-card";
import { TaskDependenciesSubCard } from "@/components/task-dependencies-sub-card";
import { ProjectProgressSubCard } from "@/components/project-progress-sub-card";
import { useAutosaveDraft } from "@/lib/use-autosave-draft";
import { SupportSection } from "@/components/support-section";
import type { SupportType } from "@/components/env-picker";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import type {
  Project,
  ProjectLink,
  ProjectResponsibility,
  ProjectTask,
  Responsibility,
  ResponsibilityRole,
  Role,
} from "@shared/schema";

// ============================================================
// Draft shape
// ============================================================
interface ProjectDraft {
  title: string;
  status: string;
  priority: string;
  trigger: string;
  outcomeDone: string;
  nextAction: string;
  blockers: string;
  risksWatchouts: string;
  notes: string;
  startDate: string;
  targetDate: string;
  endDate: string;
}

// PR #25 lock: Trigger is a fixed dropdown, not free text.
const TRIGGER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "missing_support", label: "Missing support" },
  { value: "repeated_friction", label: "Repeated friction" },
  { value: "major_life_change", label: "Major life change" },
  { value: "new_identity_shift", label: "New identity shift" },
];

// ----- helpers -----

function nullable(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function toDraft(project: Project | null): ProjectDraft {
  return {
    title: project?.title ?? "",
    status: project?.status ?? "",
    priority: project?.priority ?? "",
    trigger: project?.trigger ?? "",
    outcomeDone: project?.outcomeDone ?? "",
    nextAction: project?.nextAction ?? "",
    blockers: project?.blockers ?? "",
    risksWatchouts: project?.risksWatchouts ?? "",
    notes: project?.notes ?? "",
    startDate: project?.startDate ?? "",
    targetDate: project?.targetDate ?? "",
    endDate: project?.endDate ?? "",
  };
}

function toPatchBody(d: ProjectDraft) {
  const isDone = d.status === "done";
  return {
    title: d.title.trim() || "(untitled)",
    status: nullable(d.status),
    priority: nullable(d.priority),
    trigger: nullable(d.trigger),
    outcomeDone: nullable(d.outcomeDone),
    nextAction: nullable(d.nextAction),
    blockers: nullable(d.blockers),
    risksWatchouts: nullable(d.risksWatchouts),
    notes: nullable(d.notes),
    startDate: nullable(d.startDate),
    targetDate: nullable(d.targetDate),
    endDate: isDone ? nullable(d.endDate) : null,
  };
}

// ============================================================
// localStorage-backed collapse state
// ============================================================
//
// Single JSON blob keyed by project id. First visit = everything collapsed.
// All accordion item flags live under `accordion`.

interface CollapseState {
  bundleA: boolean;
  tasks: boolean;
  bundleB: boolean;
  accordion: {
    linkedResp: boolean;
    relatedRole: boolean;
    people: boolean;
    places: boolean;
    things: boolean;
    providers: boolean;
    conditions: boolean;
    workaround: boolean;
    relatedLinks: boolean;
  };
}

const DEFAULT_COLLAPSE_STATE: CollapseState = {
  bundleA: false,
  tasks: false,
  bundleB: false,
  accordion: {
    linkedResp: false,
    relatedRole: false,
    people: false,
    places: false,
    things: false,
    providers: false,
    conditions: false,
    workaround: false,
    relatedLinks: false,
  },
};

function collapseStorageKey(projectId: number): string {
  return `project-edit:state:${projectId}`;
}

function readCollapseState(projectId: number): CollapseState {
  if (typeof window === "undefined") return DEFAULT_COLLAPSE_STATE;
  try {
    const raw = window.localStorage.getItem(collapseStorageKey(projectId));
    if (!raw) return DEFAULT_COLLAPSE_STATE;
    const parsed = JSON.parse(raw) as Partial<CollapseState>;
    return {
      ...DEFAULT_COLLAPSE_STATE,
      ...parsed,
      accordion: {
        ...DEFAULT_COLLAPSE_STATE.accordion,
        ...(parsed.accordion ?? {}),
      },
    };
  } catch {
    return DEFAULT_COLLAPSE_STATE;
  }
}

function writeCollapseState(projectId: number, state: CollapseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      collapseStorageKey(projectId),
      JSON.stringify(state),
    );
  } catch {
    /* quota; ignore */
  }
}

// ============================================================
// Linked-responsibility mini-component (Bundle B accordion item)
// ============================================================
function LinkedResponsibilityBody({
  projectId,
  onLinkedRespChange,
}: {
  projectId: number;
  onLinkedRespChange: (resp: Responsibility | null) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: links = [] } = useQuery<ProjectResponsibility[]>({
    queryKey: [`/api/projects/${projectId}/responsibilities`],
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
  });

  const respById = useMemo(
    () => new Map(responsibilities.map(r => [r.id, r])),
    [responsibilities],
  );

  const primaryLink = useMemo(() => {
    if (links.length === 0) return null;
    return links.find(l => l.isPrimary === 1) ?? links[0];
  }, [links]);

  const linkedResp = primaryLink
    ? respById.get(primaryLink.responsibilityId) ?? null
    : null;

  // Push the linked responsibility upward so the Related-role accordion item
  // and the Bundle B subline can both consume it.
  useEffect(() => {
    onLinkedRespChange(linkedResp);
  }, [linkedResp, onLinkedRespChange]);

  const link = useMutation({
    mutationFn: async (responsibilityId: number) => {
      if (primaryLink) {
        await apiRequest(
          "DELETE",
          `/api/projects/${projectId}/responsibilities/${primaryLink.id}`,
        );
      }
      await apiRequest("POST", `/api/projects/${projectId}/responsibilities`, {
        responsibilityId,
        isPrimary: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/responsibilities`],
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't link responsibility",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const unlink = useMutation({
    mutationFn: async () => {
      if (!primaryLink) return;
      await apiRequest(
        "DELETE",
        `/api/projects/${projectId}/responsibilities/${primaryLink.id}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/responsibilities`],
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't unlink responsibility",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-[11px] italic text-muted-foreground -mt-0.5">
        -which ongoing responsibility is this project helping?
      </p>
      <Select
        value={linkedResp ? String(linkedResp.id) : ""}
        onValueChange={value => {
          if (!value) {
            unlink.mutate();
          } else {
            link.mutate(Number(value));
          }
        }}
      >
        <SelectTrigger
          className="text-sm h-9"
          data-testid="select-linked-responsibility"
        >
          <SelectValue placeholder="Pick a responsibility (optional)" />
        </SelectTrigger>
        <SelectContent>
          {responsibilities.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
              No responsibilities yet.
            </div>
          )}
          {responsibilities.map(r => (
            <SelectItem
              key={r.id}
              value={String(r.id)}
              data-testid={`option-linked-responsibility-${r.id}`}
            >
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {linkedResp && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => unlink.mutate()}
          data-testid="button-unlink-responsibility"
        >
          <X className="w-3 h-3 mr-1" />
          Unlink
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Related role (Bundle B accordion item) — read-only display
// ============================================================
function RelatedRoleBody({
  linkedResp,
}: {
  linkedResp: Responsibility | null;
}) {
  const { data: respRoles = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: [`/api/responsibilities/${linkedResp?.id ?? 0}/roles`],
    enabled: !!linkedResp,
  });
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: !!linkedResp,
  });

  const linkedRoleNames = useMemo(() => {
    if (!linkedResp) return [];
    const byId = new Map(roles.map(r => [r.id, r.name]));
    return respRoles
      .map(rr => byId.get(rr.roleId))
      .filter((n): n is string => !!n)
      .sort();
  }, [linkedResp, respRoles, roles]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] italic text-muted-foreground -mt-0.5">
        -this is pulled from the linked responsibility
      </p>
      {!linkedResp ? (
        <p className="text-xs text-muted-foreground italic" data-testid="text-related-role-empty">
          Link a responsibility to see its role here.
        </p>
      ) : linkedRoleNames.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No role linked to that responsibility yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5" data-testid="list-related-roles">
          {linkedRoleNames.map(name => (
            <span
              key={name}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              data-testid={`tag-related-role-${name}`}
            >
              {name}
              <span className="ml-1 text-[10px] opacity-60">(read-only)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Related links (Bundle B accordion item)
// ============================================================
function RelatedLinksBody({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");

  const { data: links = [] } = useQuery<ProjectLink[]>({
    queryKey: [`/api/project-links?projectId=${projectId}`],
  });

  const addLink = useMutation({
    mutationFn: async (input: { label: string; url: string }) => {
      await apiRequest("POST", "/api/project-links", {
        projectId,
        label: input.label,
        url: input.url,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/project-links?projectId=${projectId}`],
      });
      setLabelDraft("");
      setUrlDraft("");
      setAdding(false);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't add link",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const deleteLink = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-links/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/project-links?projectId=${projectId}`],
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't remove link",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const canSubmitLink =
    labelDraft.trim().length > 0 && urlDraft.trim().length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] italic text-muted-foreground -mt-0.5">
        -add anything directly useful to completing this project
      </p>

      {adding ? (
        <div className="space-y-2 border rounded-md p-2 bg-card">
          <Input
            value={labelDraft}
            onChange={e => setLabelDraft(e.target.value)}
            placeholder="Label"
            className="text-sm h-9"
            data-testid="input-new-link-label"
            autoFocus
          />
          <Input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            placeholder="https://…"
            className="text-sm h-9"
            data-testid="input-new-link-url"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setAdding(false);
                setLabelDraft("");
                setUrlDraft("");
              }}
              data-testid="button-cancel-add-link"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!canSubmitLink || addLink.isPending}
              onClick={() =>
                addLink.mutate({
                  label: labelDraft.trim(),
                  url: urlDraft.trim(),
                })
              }
              data-testid="button-confirm-add-link"
            >
              Add link
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 text-sm"
          onClick={() => setAdding(true)}
          data-testid="button-open-add-link"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add link
        </Button>
      )}

      <div className="space-y-1.5">
        {links.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No links yet.</p>
        )}
        {links.map(link => (
          <div
            key={link.id}
            className="flex items-center gap-2 text-sm py-1.5 px-2 rounded border bg-background"
            data-testid={`row-project-link-${link.id}`}
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate underline-offset-2 hover:underline"
              data-testid={`anchor-project-link-${link.id}`}
            >
              {link.label}
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => deleteLink.mutate(link.id)}
              data-testid={`button-remove-project-link-${link.id}`}
              aria-label={`Remove ${link.label}`}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main page
// ============================================================
export default function ProjectEditPage({
  params,
}: {
  params: { id?: string };
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // PR #29h — destructive delete dialog open state.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const idParam = params?.id;
  const id = Number(idParam);
  const validId = !!idParam && !isNaN(id);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: validId,
  });
  const project = useMemo(
    () => projects.find(p => p.id === id) ?? null,
    [projects, id],
  );

  const serverDraft = useMemo(() => toDraft(project), [project]);

  const draftState = useAutosaveDraft<ProjectDraft>({
    value: serverDraft,
    save: async (next: ProjectDraft) => {
      if (!validId) return;
      const body = toPatchBody(next);
      try {
        await apiRequest("PATCH", `/api/projects/${id}`, body);
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      } catch (err) {
        const msg = parseServerError(err as Error, "Couldn't save");
        toast({ variant: "destructive", title: "Couldn't save", description: msg });
        throw err;
      }
    },
    debounceMs: 600,
  });

  const {
    draft, setDraft, canUndo, canRedo, canRevert,
    undo, redo, revert, done, isSaving, savedAt, isDirty,
    markedForRemoval, markForRemoval, undoRemoval, clearRemovals, removalCount,
  } = draftState;

  // ----- Mutation that flushes marked-for-removal items on Done -----
  const removeSupportLink = useMutation({
    mutationFn: async (input: { supportType: SupportType; linkId: number }) => {
      await apiRequest(
        "DELETE",
        `/api/projects/${id}/support/${input.supportType}/${input.linkId}`,
      );
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't remove support",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  // ----- Mutation that flushes marked-for-removal tasks on Done (PR #26) -----
  const removeProjectTask = useMutation({
    mutationFn: async (taskId: number) => {
      await apiRequest("DELETE", `/api/project-tasks/${taskId}`);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't remove task",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  async function handleDone() {
    await done();
    const ops: Promise<unknown>[] = [];
    const supportTypesTouched = new Set<SupportType>();
    let tasksTouched = false;
    markedForRemoval.forEach(key => {
      const supportM = key.match(
        /^proj-support:(people|places|things|providers|conditions):(\d+)$/,
      );
      if (supportM) {
        const supportType = supportM[1] as SupportType;
        const linkId = Number(supportM[2]);
        supportTypesTouched.add(supportType);
        ops.push(removeSupportLink.mutateAsync({ supportType, linkId }));
        return;
      }
      const taskM = key.match(/^proj-task:(\d+)$/);
      if (taskM) {
        const taskId = Number(taskM[1]);
        tasksTouched = true;
        ops.push(removeProjectTask.mutateAsync(taskId));
      }
    });
    if (ops.length > 0) {
      try {
        await Promise.all(ops);
      } catch {
        /* toasts already shown */
      }
      for (const st of Array.from(supportTypesTouched)) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/projects/${id}/support/${st}`],
        });
      }
      if (tasksTouched) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/project-tasks?projectId=${id}`],
        });
      }
    }
    clearRemovals();
    setLocation("/projects");
  }

  // Status / endDate coupling.
  const prevStatusRef = useRef(draft.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "done" && draft.status !== "done" && draft.endDate !== "") {
      setDraft({ ...draft, endDate: "" });
    }
    prevStatusRef.current = draft.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.status]);

  // ----- Sticky offset measurement -----
  // EditPageHeader is itself `sticky top-0` with no forwarded ref. Wrapping
  // it in a non-sticky parent breaks its sticky behavior (the wrapper would
  // become its containing block). Instead, find its rendered DOM node by
  // its existing data-testid after mount and measure that.
  // We re-run when `project` becomes available because the early-return
  // loading branch doesn't render EditPageHeader on first render.
  const [headerHeight, setHeaderHeight] = useState(0);
  const projectLoaded = !!project;
  useEffect(() => {
    if (!projectLoaded) return;
    const el = document.querySelector<HTMLElement>(
      '[data-testid="edit-page-header"]',
    );
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setHeaderHeight(Math.ceil(e.contentRect.height));
      }
    });
    ro.observe(el);
    setHeaderHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [projectLoaded]);

  // ----- Collapse state (localStorage-backed) -----
  // Reads on mount once we know the project id; writes on every change.
  const [collapse, setCollapse] = useState<CollapseState>(DEFAULT_COLLAPSE_STATE);
  const [collapseHydrated, setCollapseHydrated] = useState(false);
  useEffect(() => {
    if (!validId) return;
    setCollapse(readCollapseState(id));
    setCollapseHydrated(true);
  }, [id, validId]);
  useEffect(() => {
    if (!collapseHydrated || !validId) return;
    writeCollapseState(id, collapse);
  }, [collapse, collapseHydrated, id, validId]);

  function setCardOpen(card: "bundleA" | "tasks" | "bundleB", open: boolean) {
    setCollapse(s => ({ ...s, [card]: open }));
  }
  function setAccordionOpen(key: keyof CollapseState["accordion"], open: boolean) {
    setCollapse(s => ({ ...s, accordion: { ...s.accordion, [key]: open } }));
  }

  // ----- Linked-responsibility lifted state for Bundle B subline + Related role -----
  const [linkedResp, setLinkedResp] = useState<Responsibility | null>(null);

  // ----- Project links count (for Bundle B subline) -----
  const { data: projectLinks = [] } = useQuery<ProjectLink[]>({
    queryKey: [`/api/project-links?projectId=${id}`],
    enabled: validId,
  });

  // ----- Support link counts (for Bundle B subline) -----
  // Re-uses the same queries SupportSection mounts; React Query dedupes.
  const supportTotal = useSupportLinkCount(id);

  // ----- Project tasks (PR #26) -----
  // Single parent-level query; child components (ProjectTasksCard,
  // TaskDependenciesSubCard, ProjectProgressSubCard) use the same key, and
  // React Query dedupes the network call.
  // Drives:
  //   1. tasksSubline ("X / Y · M marked" or "No tasks yet")
  //   2. CollapsibleStickyHeader peek + expanded Next action / Progress lines
  //   3. handleDone() flush of proj-task:<id> deletes
  const { data: projectTasks = [] } = useQuery<ProjectTask[]>({
    queryKey: [`/api/project-tasks?projectId=${id}`],
    enabled: validId,
  });

  // ----- Tasks-derived values (PR #26) -----
  // These hooks must run on every render in the same order, so they live
  // ABOVE the loading / not-found early-returns. The downstream consts
  // (taskTotal, isStalled, tasksSubline) are plain values and live below.
  // Sort: sortOrder ASC NULLs last, then id ASC — mirrors the rule used
  // inside ProjectTasksCard / TaskDependenciesSubCard so the "Next action"
  // title here matches the first row the user sees in the list.
  const sortedTasks = useMemo(() => {
    const all = projectTasks.slice();
    return all.sort((a, b) => {
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
  }, [projectTasks]);
  const visibleTasks = useMemo(
    () => sortedTasks.filter(t => !markedForRemoval.has(taskRemovalKey(t.id))),
    [sortedTasks, markedForRemoval],
  );

  // ------------------------------------------------------------
  // Loading / not-found gating
  // ------------------------------------------------------------
  if (!validId) return <NotFound />;
  if (projects.length > 0 && !project) return <NotFound />;
  if (!project) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Loading project…
          </CardContent>
        </Card>
      </div>
    );
  }

  const dateError = (() => {
    if (
      draft.startDate !== "" && draft.targetDate !== "" &&
      draft.targetDate < draft.startDate
    ) {
      return "Target date must be on or after start date.";
    }
    if (draft.status === "done" && draft.endDate === "") {
      return "End date is required when status is Done.";
    }
    if (
      draft.status === "done" && draft.endDate !== "" &&
      draft.startDate !== "" && draft.endDate < draft.startDate
    ) {
      return "End date must be on or after start date.";
    }
    return null;
  })();

  // ----- Tasks-derived plain values (PR #26) -----
  // sortedTasks / visibleTasks were memoized above the early-return; the
  // following are pure derivations safe to evaluate after that gate.
  const taskTotal = visibleTasks.length;
  const taskDone = visibleTasks.filter(t => t.status === "done").length;
  const markedTaskCount = sortedTasks.length - visibleTasks.length;
  const nextActionTitle =
    visibleTasks.find(t => t.status === "open")?.title ?? null;
  // "Last touched" sources: project.lastTouchedAt (if PATCHed by autosave
  // path) falls back to project.createdAt. Tasks have no per-row updatedAt.
  const projectLastTouched =
    project?.lastTouchedAt ?? project?.createdAt ?? null;
  // Stalled = no touch for >14 days (user-locked 2026-05-09).
  const STALLED_DAY_THRESHOLD = 14;
  const isStalled = (() => {
    if (!projectLastTouched || taskTotal === 0) return false;
    const ts = Date.parse(projectLastTouched);
    if (Number.isNaN(ts)) return false;
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    return days > STALLED_DAY_THRESHOLD;
  })();

  // ----- Sublines for collapsed cards -----
  const bundleASubline = "5 fields";
  const tasksSubline = (() => {
    if (taskTotal === 0 && markedTaskCount === 0) return "No tasks yet";
    const base = `${taskDone} / ${taskTotal}`;
    return markedTaskCount > 0 ? `${base} · ${markedTaskCount} marked` : base;
  })();
  const bundleBSubline = (() => {
    const parts: string[] = [];
    if (linkedResp) parts.push(`Linked: ${linkedResp.name}`);
    if (supportTotal > 0) parts.push(`${supportTotal} supports`);
    if (projectLinks.length > 0) parts.push(`${projectLinks.length} links`);
    return parts.length > 0 ? parts.join(" · ") : "Not linked yet";
  })();

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-project-edit">
      <EditPageHeader
        backHref="/projects"
        title="Edit project"
        infoContent={
          <div className="space-y-1 text-xs">
            <p className="font-medium">Editing a project</p>
            <p>
              Projects are outcomes you're working toward. Link the
              responsibility this project advances, set a Trigger / Outcome /
              Blockers / Risks / Notes, and attach the supports the project
              depends on.
            </p>
            <p>
              Most fields autosave after a short pause. Marked-for-removal
              rows are flushed when you tap Done.
            </p>
          </div>
        }
        savedAt={savedAt}
        isSaving={isSaving}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        canRevert={canRevert}
        onUndo={undo}
        onRedo={redo}
        onRevert={revert}
        onDone={handleDone}
      />

      <CollapsibleStickyHeader
        title={draft.title}
        onTitleChange={v => setDraft({ ...draft, title: v })}
        status={draft.status}
        priority={draft.priority}
        onStatusChange={v => setDraft({ ...draft, status: v })}
        onPriorityChange={v => setDraft({ ...draft, priority: v })}
        startDate={draft.startDate}
        targetDate={draft.targetDate}
        endDate={draft.endDate}
        onStartChange={v => setDraft({ ...draft, startDate: v })}
        onTargetChange={v => setDraft({ ...draft, targetDate: v })}
        onEndChange={v => setDraft({ ...draft, endDate: v })}
        topOffsetPx={headerHeight}
        dateError={dateError}
        nextActionTitle={nextActionTitle}
        doneTaskCount={taskDone}
        totalTaskCount={taskTotal}
        projectUpdatedAt={projectLastTouched}
        isStalled={isStalled}
      />

      <div className="flex-1 p-3 space-y-4 max-w-xl mx-auto w-full pb-24">
        {/* Intro line — reinstated per PR #25 lock. */}
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="text-project-intro"
        >
          Projects hold temporary change work. Link the responsibility and
          support this project affects.
        </p>

        {/* ============================================================
            BUNDLE A — Trigger / Outcome / Blockers / Risks / Notes
            ============================================================ */}
        <CollapsibleCard
          title="Trigger / Outcome / Blockers / Risks / Notes"
          subline={bundleASubline}
          open={collapse.bundleA}
          onToggle={() => setCardOpen("bundleA", !collapse.bundleA)}
          testId="card-bundle-a"
        >
          {/* Trigger — DROPDOWN per PR #25 lock (was free text in PR #23). */}
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="proj-trigger">
              Trigger
            </Label>
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -what kicked this project off?
            </p>
            <Select
              value={draft.trigger}
              onValueChange={v => setDraft({ ...draft, trigger: v })}
            >
              <SelectTrigger
                id="proj-trigger"
                className="text-sm h-9"
                data-testid="select-project-trigger"
              >
                <SelectValue placeholder="Pick…" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(o => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    data-testid={`option-trigger-${o.value}`}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="proj-outcome">
              Outcome done
            </Label>
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -what does finished look like?
            </p>
            <Textarea
              id="proj-outcome"
              value={draft.outcomeDone}
              onChange={e => setDraft({ ...draft, outcomeDone: e.target.value })}
              placeholder="How will you know this project is finished?"
              className="text-sm min-h-20"
              data-testid="textarea-project-outcome"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="proj-blockers">
              Blockers
            </Label>
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -what is currently preventing progress?
            </p>
            <Textarea
              id="proj-blockers"
              value={draft.blockers}
              onChange={e => setDraft({ ...draft, blockers: e.target.value })}
              placeholder="What's in the way?"
              className="text-sm min-h-16"
              data-testid="textarea-project-blockers"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled
              data-testid="button-suggest-blockers"
            >
              Suggest possible blockers (coming soon)
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="proj-risks">
              Risks watchouts
            </Label>
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -what could create problems if this project slips?
            </p>
            <Textarea
              id="proj-risks"
              value={draft.risksWatchouts}
              onChange={e => setDraft({ ...draft, risksWatchouts: e.target.value })}
              placeholder="Things that could derail this"
              className="text-sm min-h-16"
              data-testid="textarea-project-risks"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled
              data-testid="button-suggest-risks"
            >
              Suggest what to watch for (coming soon)
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="proj-notes">
              Notes
            </Label>
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -keep only project-specific notes here
            </p>
            <Textarea
              id="proj-notes"
              value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Anything else worth keeping with this project"
              className="text-sm min-h-20"
              data-testid="textarea-project-notes"
            />
          </div>
        </CollapsibleCard>

        {/* ============================================================
            TASKS — PR #26
            • ProjectTasksCard       — list / add / toggle / inline edit /
                                       per-row mark-for-removal
            • TaskDependenciesSubCard — numbered (1) 2) 3)…) view following
                                       sortOrder, with stub buttons for
                                       Suggest task order / Edit links
            • ProjectProgressSubCard  — X / Y tasks complete · Last touched
                                       · Stalled? (14-day rule)
            ============================================================ */}
        <CollapsibleCard
          title="Tasks"
          subline={tasksSubline}
          open={collapse.tasks}
          onToggle={() => setCardOpen("tasks", !collapse.tasks)}
          testId="card-tasks"
        >
          <ProjectTasksCard
            projectId={id}
            markedForRemoval={markedForRemoval}
            markForRemoval={markForRemoval}
          />

          <TaskDependenciesSubCard
            projectId={id}
            markedForRemoval={markedForRemoval}
          />

          <ProjectProgressSubCard
            projectId={id}
            projectUpdatedAt={projectLastTouched}
            markedForRemoval={markedForRemoval}
          />
        </CollapsibleCard>

        {/* ============================================================
            BUNDLE B — Relationships & Supports (accordion)
            ============================================================ */}
        <CollapsibleCard
          title="Relationships & Supports"
          subline={bundleBSubline}
          open={collapse.bundleB}
          onToggle={() => setCardOpen("bundleB", !collapse.bundleB)}
          testId="card-bundle-b"
        >
          <CollapsibleCard
            title="Linked responsibility"
            open={collapse.accordion.linkedResp}
            onToggle={() =>
              setAccordionOpen("linkedResp", !collapse.accordion.linkedResp)
            }
            testId="accordion-linked-responsibility"
            variant="inner"
          >
            <LinkedResponsibilityBody
              projectId={id}
              onLinkedRespChange={setLinkedResp}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Related role"
            open={collapse.accordion.relatedRole}
            onToggle={() =>
              setAccordionOpen("relatedRole", !collapse.accordion.relatedRole)
            }
            testId="accordion-related-role"
            variant="inner"
          >
            <RelatedRoleBody linkedResp={linkedResp} />
          </CollapsibleCard>

          <CollapsibleCard
            title="People"
            open={collapse.accordion.people}
            onToggle={() => setAccordionOpen("people", !collapse.accordion.people)}
            testId="accordion-people"
            variant="inner"
          >
            <SupportSection
              parentType="project"
              parentId={id}
              supportType="people"
              title="People"
              helperLine="-who does this project involve or depend on?"
              addLabel="person"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Places"
            open={collapse.accordion.places}
            onToggle={() => setAccordionOpen("places", !collapse.accordion.places)}
            testId="accordion-places"
            variant="inner"
          >
            <SupportSection
              parentType="project"
              parentId={id}
              supportType="places"
              title="Places"
              helperLine="-where does work on this project happen?"
              addLabel="place"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Things"
            open={collapse.accordion.things}
            onToggle={() => setAccordionOpen("things", !collapse.accordion.things)}
            testId="accordion-things"
            variant="inner"
          >
            <SupportSection
              parentType="project"
              parentId={id}
              supportType="things"
              title="Things"
              helperLine="-what do you need to have, carry, or use?"
              addLabel="thing"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Providers"
            open={collapse.accordion.providers}
            onToggle={() =>
              setAccordionOpen("providers", !collapse.accordion.providers)
            }
            testId="accordion-providers"
            variant="inner"
          >
            <SupportSection
              parentType="project"
              parentId={id}
              supportType="providers"
              title="Providers"
              helperLine="-who supplies or maintains part of this support?"
              addLabel="provider"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Conditions"
            open={collapse.accordion.conditions}
            onToggle={() =>
              setAccordionOpen("conditions", !collapse.accordion.conditions)
            }
            testId="accordion-conditions"
            variant="inner"
          >
            <SupportSection
              parentType="project"
              parentId={id}
              supportType="conditions"
              title="Conditions"
              helperLine="-what must be true before this can move forward?"
              addLabel="condition"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Workaround handling"
            open={collapse.accordion.workaround}
            onToggle={() =>
              setAccordionOpen("workaround", !collapse.accordion.workaround)
            }
            testId="accordion-workaround"
            variant="inner"
          >
            <p className="text-[11px] italic text-muted-foreground -mt-0.5">
              -only when a Workaround support exists
            </p>
            <p
              className="text-xs text-muted-foreground italic"
              data-testid="text-workaround-placeholder"
            >
              Deferred per PR #23 lock — full UI ships in a later PR.
            </p>
          </CollapsibleCard>

          <CollapsibleCard
            title="Related links"
            open={collapse.accordion.relatedLinks}
            onToggle={() =>
              setAccordionOpen("relatedLinks", !collapse.accordion.relatedLinks)
            }
            testId="accordion-related-links"
            variant="inner"
          >
            <RelatedLinksBody projectId={id} />
          </CollapsibleCard>
        </CollapsibleCard>

        {/* Marked-for-removal section — outside all bundles, only renders
            when count > 0. Single source of truth for marked items. */}
        <MarkedForRemovalSection
          parentType="project"
          parentId={id}
          markedForRemoval={markedForRemoval}
          undoRemoval={undoRemoval}
        />

        {/* PR #29h — Danger zone. Sits below everything else; only renders
            when we have a real persisted project to delete. */}
        {project ? (
          <div
            className="mt-6 border-t pt-4"
            data-testid="section-danger-zone"
          >
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Danger zone
            </div>
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              data-testid="button-project-delete"
            >
              Delete project
            </Button>
          </div>
        ) : null}
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />

      {/* PR #29h — confirmation dialog. Mounted when we have a project so
          the dialog has a stable id and title to display. */}
      {project ? (
        <ProjectDeleteDialog
          projectId={project.id}
          projectTitle={project.title}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onDeleted={(summary: ProjectDeleteSummary) => {
            // Toast copy depends on the cascade shape.
            if (summary.mode === "preserve") {
              const n = summary.agendaTasksPreserved;
              toast({
                title: "Project deleted",
                description:
                  n > 0
                    ? `${n} agenda task${n === 1 ? "" : "s"} kept as standalone.`
                    : "No linked agenda tasks needed preserving.",
              });
            } else {
              const n = summary.agendaTasksDeleted;
              toast({
                title:
                  n > 0
                    ? `Project and ${n} linked task${n === 1 ? "" : "s"} deleted`
                    : "Project deleted",
              });
            }
            setLocation("/projects");
          }}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

// Counts total support links across all five categories for a given project.
// Re-uses the same query keys SupportSection mounts; React Query dedupes,
// so this is essentially free.
function useSupportLinkCount(projectId: number): number {
  const people = useQuery<unknown[]>({
    queryKey: [`/api/projects/${projectId}/support/people`],
  });
  const places = useQuery<unknown[]>({
    queryKey: [`/api/projects/${projectId}/support/places`],
  });
  const things = useQuery<unknown[]>({
    queryKey: [`/api/projects/${projectId}/support/things`],
  });
  const providers = useQuery<unknown[]>({
    queryKey: [`/api/projects/${projectId}/support/providers`],
  });
  const conditions = useQuery<unknown[]>({
    queryKey: [`/api/projects/${projectId}/support/conditions`],
  });
  return (
    (people.data?.length ?? 0) +
    (places.data?.length ?? 0) +
    (things.data?.length ?? 0) +
    (providers.data?.length ?? 0) +
    (conditions.data?.length ?? 0)
  );
}
