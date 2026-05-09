// /projects/:id/edit — Phase 5 PR #23 (§10 Project v2 edit screen)
//
// Mirrors responsibility-edit.tsx (PR #18a–#19) using the same autosave + undo
// + marked-for-removal pattern. Sections (top → bottom):
//
//   - EditPageHeader (Back, "Edit project", info, Saved / Done / Undo / Redo / Revert)
//   - Title (autosaved)
//   - Project fields card (status, priority, trigger, outcomeDone,
//     nextAction, blockers, risksWatchouts, notes)
//   - Dates card (startDate, targetDate, endDate-when-done)
//   - Linked responsibility (single-select via /api/projects/:id/responsibilities)
//   - Related links (CRUD via /api/project-links)
//   - 5 Support sections (People / Places / Things / Providers / Conditions)
//     wired with parentType="project" (PR #23 made SupportSection / EnvPicker
//     parent-agnostic).
//   - Tasks placeholder ("Coming in PR #25")
//   - EditPageUndoBar at the bottom for marked-for-removal items
//
// Locked decisions:
//   - Workaround toggle DROPPED at user direction; the §9 disruption flow
//     ships in a separate PR.
//   - Title autosaves; everything else autosaves through the same draft via
//     a single PATCH /api/projects/:id with the dirty fields.
//   - endDate is only touched when status === 'done' (server enforces — see
//     validateProjectDates in routes.ts). When status leaves 'done' the UI
//     clears endDate so the next PATCH passes validation.
//   - Linked-responsibility: project↔responsibility supports many rows in the
//     schema, but the v2 spec UI surfaces the relationship as a single
//     primary linked responsibility. The picker therefore replaces the existing
//     primary link rather than appending. (Future PRs may surface multi-link.)

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
import { Plus, X, ExternalLink, ListTodo } from "lucide-react";
import { EditPageHeader } from "@/components/edit-page-header";
import { EditPageUndoBar } from "@/components/edit-page-undo-bar";
import { useAutosaveDraft } from "@/lib/use-autosave-draft";
import { SupportSection } from "@/components/support-section";
import type { SupportType } from "@/components/env-picker";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import type {
  Project,
  ProjectLink,
  ProjectResponsibility,
  Responsibility,
} from "@shared/schema";

// ============================================================
// Draft shape
// ============================================================
//
// Mirrors the columns we expose for editing on §10. Strings are stored as
// "" instead of null so React inputs stay controlled; we convert "" → null
// at the API boundary inside the save callback.
interface ProjectDraft {
  title: string;
  status: string; // "" | "active" | "paused" | "done" | "cancelled"
  priority: string; // "" | "high" | "medium" | "low"
  trigger: string;
  outcomeDone: string;
  nextAction: string;
  blockers: string;
  risksWatchouts: string;
  notes: string;
  startDate: string; // YYYY-MM-DD
  targetDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD; only meaningful when status === 'done'
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// ----- helpers -----

// Server error bodies look like `409: {"error":"…"}` after the throw helper
// stringifies the status + body. Pull the message out so toasts read clean.
function parseServerError(err: Error, fallback: string): string {
  const msg = err.message ?? fallback;
  const m = msg.match(/^\d+:\s*(\{.*\})$/);
  if (!m) return msg || fallback;
  try {
    const body = JSON.parse(m[1]);
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // fall through
  }
  return fallback;
}

// "" / null / undefined → null; trims strings.
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

// Build the PATCH body. We always send the full editable surface (server
// stores nulls fine and treats undefined keys as no-op). endDate gets
// special handling: server rejects endDate when status !== 'done', so we
// force null whenever status is anything other than 'done'.
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
// Linked responsibility section
// ============================================================
//
// The schema supports multiple linked responsibilities per project, but
// §10 surfaces a single \"linked responsibility\" — the project's primary
// owning responsibility. This UI lets the user pick or change that one.
function LinkedResponsibilityCard({
  projectId,
}: {
  projectId: number;
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

  // Pick the primary if there is one, else the first existing link, else none.
  const primaryLink = useMemo(() => {
    if (links.length === 0) return null;
    return links.find(l => l.isPrimary === 1) ?? links[0];
  }, [links]);

  const link = useMutation({
    mutationFn: async (responsibilityId: number) => {
      // Replace the existing primary link, if any, then create the new one as
      // primary. This keeps the schema's many-to-many flexibility while
      // surfacing a single-select UX.
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

  const linkedResp = primaryLink ? respById.get(primaryLink.responsibilityId) ?? null : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <Label className="text-xs">Linked responsibility</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            -which ongoing responsibility does this project advance?
          </p>
        </div>
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
      </CardContent>
    </Card>
  );
}

// ============================================================
// Related links section (§10 \"Add link\" rows)
// ============================================================
function RelatedLinksCard({ projectId }: { projectId: number }) {
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <Label className="text-xs">Related links</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            -docs, references, anything you keep coming back to
          </p>
        </div>

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
            <p className="text-xs text-muted-foreground italic">
              No links yet.
            </p>
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
      </CardContent>
    </Card>
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

  // Server-of-truth draft snapshot for the autosave hook.
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

  // Mutation that flushes marked-for-removal items on Done. Project edit page
  // currently only stages support links for removal (links + linked-resp use
  // immediate mutations). Mirrors the responsibility-edit handler.
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

  async function handleDone() {
    await done();
    const ops: Promise<unknown>[] = [];
    const supportTypesTouched = new Set<SupportType>();
    markedForRemoval.forEach(key => {
      const supportM = key.match(
        /^proj-support:(people|places|things|providers|conditions):(\d+)$/,
      );
      if (supportM) {
        const supportType = supportM[1] as SupportType;
        const linkId = Number(supportM[2]);
        supportTypesTouched.add(supportType);
        ops.push(removeSupportLink.mutateAsync({ supportType, linkId }));
      }
    });
    if (ops.length > 0) {
      try {
        await Promise.all(ops);
      } catch {
        // toasts already shown
      }
      for (const st of Array.from(supportTypesTouched)) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/projects/${id}/support/${st}`],
        });
      }
    }
    clearRemovals();
    setLocation("/projects");
  }

  // ------------------------------------------------------------
  // Status / endDate coupling: when the user moves status off 'done',
  // clear the endDate so the next autosave doesn't get rejected by the
  // server's validateProjectDates rule. We do this in a layout effect-ish
  // pattern: only clear when the change is actually a transition away
  // from 'done', and only if there is currently a non-empty endDate.
  // ------------------------------------------------------------
  const prevStatusRef = useRef(draft.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "done" && draft.status !== "done" && draft.endDate !== "") {
      setDraft({ ...draft, endDate: "" });
    }
    prevStatusRef.current = draft.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.status]);

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

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-project-edit">
      <EditPageHeader
        backHref="/projects"
        title="Edit project"
        infoContent={
          <div className="space-y-1 text-xs">
            <p className="font-medium">Editing a project</p>
            <p>
              Projects are outcomes you're working toward. Fill in the
              fields, link to the responsibility this project advances, and
              attach the People, Places, Things, Providers, and Conditions
              the project depends on.
            </p>
            <p>
              Most fields autosave after a short pause. Link adds and
              removes save immediately; marked-for-removal rows are flushed
              when you tap Done.
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

      <div className="flex-1 p-3 space-y-4 max-w-xl mx-auto w-full pb-24">
        {/* Title — autosaved, kept first since it's what's being edited. */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-0.5">
              <Label className="text-xs" htmlFor="proj-title">
                Project
              </Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -name the outcome you're working toward
              </p>
            </div>
            <Input
              id="proj-title"
              value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="What is this project?"
              maxLength={200}
              className="text-sm h-9"
              data-testid="input-project-title"
            />
          </CardContent>
        </Card>

        {/* Status / Priority / Trigger / Outcome / Next action / Blockers /
            Risks / Notes — all autosaved through the same draft. */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="proj-status">
                  Status
                </Label>
                <Select
                  value={draft.status}
                  onValueChange={v => setDraft({ ...draft, status: v })}
                >
                  <SelectTrigger
                    id="proj-status"
                    className="text-sm h-9"
                    data-testid="select-project-status"
                  >
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        data-testid={`option-status-${o.value}`}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="proj-priority">
                  Priority
                </Label>
                <Select
                  value={draft.priority}
                  onValueChange={v => setDraft({ ...draft, priority: v })}
                >
                  <SelectTrigger
                    id="proj-priority"
                    className="text-sm h-9"
                    data-testid="select-project-priority"
                  >
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(o => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        data-testid={`option-priority-${o.value}`}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="proj-trigger">
                Trigger
              </Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -what made this a project right now?
              </p>
              <Input
                id="proj-trigger"
                value={draft.trigger}
                onChange={e => setDraft({ ...draft, trigger: e.target.value })}
                placeholder="e.g. lease ends in 90 days"
                maxLength={300}
                className="text-sm h-9"
                data-testid="input-project-trigger"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="proj-outcome">
                Outcome / definition of done
              </Label>
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
              <Label className="text-xs" htmlFor="proj-next-action">
                Next action
              </Label>
              <Input
                id="proj-next-action"
                value={draft.nextAction}
                onChange={e => setDraft({ ...draft, nextAction: e.target.value })}
                placeholder="The single next concrete step"
                className="text-sm h-9"
                data-testid="input-project-next-action"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="proj-blockers">
                Blockers
              </Label>
              <Textarea
                id="proj-blockers"
                value={draft.blockers}
                onChange={e => setDraft({ ...draft, blockers: e.target.value })}
                placeholder="What's in the way?"
                className="text-sm min-h-16"
                data-testid="textarea-project-blockers"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="proj-risks">
                Risks &amp; watchouts
              </Label>
              <Textarea
                id="proj-risks"
                value={draft.risksWatchouts}
                onChange={e => setDraft({ ...draft, risksWatchouts: e.target.value })}
                placeholder="Things that could derail this"
                className="text-sm min-h-16"
                data-testid="textarea-project-risks"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="proj-notes">
                Notes
              </Label>
              <Textarea
                id="proj-notes"
                value={draft.notes}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Anything else worth keeping with this project"
                className="text-sm min-h-20"
                data-testid="textarea-project-notes"
              />
            </div>
          </CardContent>
        </Card>

        {/* Dates — startDate, targetDate, endDate (only when Done). */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Dates</Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -when this project starts, when it should finish, and when it actually did
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="proj-start">
                  Start date
                </Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={draft.startDate}
                  onChange={e => setDraft({ ...draft, startDate: e.target.value })}
                  className="text-sm h-9"
                  data-testid="input-project-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="proj-target">
                  Target date
                </Label>
                <Input
                  id="proj-target"
                  type="date"
                  value={draft.targetDate}
                  onChange={e => setDraft({ ...draft, targetDate: e.target.value })}
                  className="text-sm h-9"
                  data-testid="input-project-target-date"
                />
              </div>
            </div>
            {draft.status === "done" && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="proj-end">
                  End date
                </Label>
                <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                  -required when status is Done
                </p>
                <Input
                  id="proj-end"
                  type="date"
                  value={draft.endDate}
                  onChange={e => setDraft({ ...draft, endDate: e.target.value })}
                  className="text-sm h-9"
                  data-testid="input-project-end-date"
                />
              </div>
            )}
            {dateError && (
              <p className="text-xs text-destructive" data-testid="text-project-date-error">
                {dateError}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Linked responsibility — single-select */}
        <LinkedResponsibilityCard projectId={id} />

        {/* Related links — CRUD */}
        <RelatedLinksCard projectId={id} />

        {/* 5 Support sections — same component as resp-edit, parent-agnostic. */}
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

        {/* Tasks placeholder — full UI ships in PR #25. */}
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-1">
            <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <ListTodo className="w-3.5 h-3.5" />
              Tasks
            </Label>
            <p className="text-xs text-muted-foreground" data-testid="text-tasks-placeholder">
              Coming in PR #25.
            </p>
          </CardContent>
        </Card>
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />
    </div>
  );
}
