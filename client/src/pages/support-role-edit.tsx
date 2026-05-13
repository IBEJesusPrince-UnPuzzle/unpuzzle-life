// /support/roles/new and /support/roles/:id/edit — Phase 5 PR #17b
//
// Single component for both create and edit per addendum §A4. Layout is
// LOCKED: name → description → people → read-only responsibilities → danger
// zone. Reuses EditPageHeader + EditPageUndoBar + useAutosaveDraft from
// PR #16.
//
// Behavior summary (addendum §A4.1, §A4.2):
//   - 600ms debounced autosave on name and description.
//   - People list adds/removes are immediate (not debounced).
//     Removed people land in marks-for-removal, shown in the bottom undo
//     bar. Cleared on Done; remaining marked rows are deleted then.
//   - Responsibilities listed read-only here (edit on the responsibility
//     itself in PR #18).
//   - Self role: delete button hidden (server also enforces).
//   - Duplicate role names blocked server-side (409 → toast with message).
//   - On /new: no autosave until name is non-empty. First save POSTs and
//     the URL replaces with /support/roles/:id/edit so it's stable.
//   - Cadence/dayOfWeek hidden from UI per addendum §A7.1 — server defaults
//     on create and ignores on PATCH.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, User as UserIcon, X, AlertCircle } from "lucide-react";
import { EditPageHeader } from "@/components/edit-page-header";
import { EditPageUndoBar } from "@/components/edit-page-undo-bar";
import { useAutosaveDraft } from "@/lib/use-autosave-draft";
import { PeoplePicker } from "@/components/people-picker";
import { RoleDeleteModal } from "@/components/role-delete-modal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import type {
  Role, Responsibility, ResponsibilityRole, EnvironmentPerson,
} from "@shared/schema";

type RoleWithPeople = Role & {
  people: { id: number; personId: number; roleId: number }[];
};

// Apologies for the long file — this screen handles two flows (create +
// edit) and three nested editors (name/desc, people, responsibilities-readonly,
// danger zone). Splitting felt premature for v1.

interface RoleDraft {
  name: string;
  description: string;
}

// Server error bodies look like `409: {"error":"..."}` after our throw helper
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

export default function SupportRoleEditPage({
  params,
}: {
  params: { id?: string };
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Mode is determined by params.id. /new → undefined → create. After first
  // save we used to navigate to /support/roles/:id/edit to give the URL
  // stability, but that wouter setLocation forced wouter to unmount this
  // component and mount a fresh one — dropping input focus and dismissing
  // the keyboard mid-typing (PR #46 reproduction video, 5/12/26).
  //
  // Replacement (PR #46): once the POST succeeds, stash the new id in a
  // ref and use it as the effective id for all subsequent PATCH calls.
  // The URL stays /new until the user hits Done. handleDone() routes to
  // the read-only detail page using the stashed id when present.
  const idParam = params?.id;
  const isCreateUrl = !idParam;
  const createdIdRef = useRef<number | null>(null);
  // Force a re-render after first create so derived state (queries gated
  // on `id`, isCreate, etc.) picks up the new id.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const effectiveId = createdId ?? (isCreateUrl ? null : Number(idParam));
  const isCreate = effectiveId == null;
  const id = effectiveId;
  const validId = isCreate ? true : !!id && !isNaN(id as number);

  const { data: roles = [] } = useQuery<RoleWithPeople[]>({
    queryKey: ["/api/roles"],
    enabled: validId,
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
    enabled: !isCreate && validId,
  });
  const { data: respRoleLinks = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: ["/api/responsibility-roles"],
    enabled: !isCreate && validId,
  });
  const { data: allPeople = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
    enabled: validId,
  });

  const role = isCreate ? null : roles.find(r => r.id === id);
  const isSelfRole = !!role && role.name.trim().toLowerCase() === "self";

  // ============================================================
  // Draft state (name + description) wired through useAutosaveDraft
  // ============================================================

  // Server value for the autosave hook. On /new, we use an empty draft
  // until first save; the hook only fires save() when the draft != value.
  const serverDraft: RoleDraft = useMemo(
    () => ({ name: role?.name ?? "", description: role?.description ?? "" }),
    [role?.name, role?.description],
  );

  const draftState = useAutosaveDraft<RoleDraft>({
    value: serverDraft,
    save: async (next: RoleDraft) => {
      const trimmedName = next.name.trim();
      // Don't fire create on empty name. Don't fire PATCH on edit either —
      // server would reject. Hook will retry on next change.
      if (!trimmedName) return;
      // PR #46 — First create: POST, stash id locally, stay mounted. NO
      // setLocation, NO invalidateQueries during typing. The /support and
      // /support/roles list pages will refetch when the user navigates
      // away via Done.
      if (isCreate) {
        try {
          const res = await apiRequest("POST", "/api/roles", {
            name: trimmedName,
            description: next.description?.trim() || null,
          });
          const created = (await res.json()) as Role;
          createdIdRef.current = created.id;
          setCreatedId(created.id);
        } catch (err) {
          const msg = parseServerError(err as Error, "Couldn't create role");
          toast({ variant: "destructive", title: "Couldn't save", description: msg });
          throw err;
        }
        return;
      }
      // Edit path: PATCH name + description. PR #46 — removed the per-save
      // invalidateQueries(["/api/roles"]). Forcing a refetch on every
      // keystroke-debounce cycle was causing the autosave hook's value
      // prop to churn, which (combined with normalization differences in
      // the server echo) was forcing a draft reset and re-rendering the
      // focused input — the visible flash and caret jump in the recording.
      // The list pages refetch on remount via their own useQuery hooks.
      try {
        await apiRequest("PATCH", `/api/roles/${id}`, {
          name: trimmedName,
          description: next.description?.trim() || null,
        });
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

  // ============================================================
  // People management (immediate, not debounced)
  // ============================================================
  const [pickerOpen, setPickerOpen] = useState(false);

  // role.people is a list of role_people rows. Resolve to EnvironmentPerson
  // objects for display.
  const linkedPeople = useMemo(() => {
    if (!role) return [] as Array<{ rolePeopleId: number; person: EnvironmentPerson }>;
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    return (role.people ?? [])
      .map(rp => {
        const person = peopleById.get(rp.personId);
        return person ? { rolePeopleId: rp.id, person } : null;
      })
      .filter((x): x is { rolePeopleId: number; person: EnvironmentPerson } => !!x);
  }, [role, allPeople]);

  const removePerson = useMutation({
    mutationFn: async (rolePeopleId: number) => {
      await apiRequest("DELETE", `/api/roles/${id}/people/${rolePeopleId}`);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't remove person",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  // Marks-for-removal pattern: tap [×] marks (UI-only); on Done flush the
  // server deletes for any still-marked rows.
  function handleMarkRemovePerson(rolePeopleId: number) {
    markForRemoval(`role-person:${rolePeopleId}`);
  }
  function handleUndoRemovePerson(rolePeopleId: number) {
    undoRemoval(`role-person:${rolePeopleId}`);
  }

  async function handleDone() {
    // Flush any pending name/description debounce.
    await done();
    // Delete people that are still marked for removal.
    if (!isCreate) {
      const ops: Promise<unknown>[] = [];
      markedForRemoval.forEach(key => {
        const m = key.match(/^role-person:(\d+)$/);
        if (m) {
          ops.push(removePerson.mutateAsync(Number(m[1])));
        }
      });
      if (ops.length > 0) {
        try {
          await Promise.all(ops);
        } catch {
          // toasts already shown in onError
        }
      }
      clearRemovals();
    }
    // PR #46 — Single invalidation on exit. Previously this fired on every
    // autosave keystroke, churning the autosave hook's value prop and
    // flashing the focused input. Now the list pages get fresh data once,
    // here, before we navigate away.
    await queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    // Navigate to the read-only detail. If the user landed on /new and
    // typed a name, we created the row but never moved the URL. Use the
    // stashed id from createdIdRef to land on the right detail page. If
    // they hit Done without typing (no create fired), go to /support.
    if (isCreateUrl && createdIdRef.current == null) {
      setLocation("/support");
    } else {
      const targetId = createdIdRef.current ?? id;
      setLocation(`/support/roles/${targetId}`);
    }
  }

  // ============================================================
  // Linked responsibilities (read-only on this screen)
  // ============================================================
  const respsForRole = useMemo(() => {
    if (isCreate || !id) return [] as Responsibility[];
    const respIds = new Set(
      respRoleLinks.filter(l => l.roleId === id).map(l => l.responsibilityId),
    );
    return responsibilities.filter(r => respIds.has(r.id));
  }, [responsibilities, respRoleLinks, id, isCreate]);

  // ============================================================
  // Delete role
  // ============================================================
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteRole = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiRequest("DELETE", `/api/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/responsibility-roles"] });
      toast({ title: "Role deleted" });
      setLocation("/support");
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't delete",
        description: parseServerError(err, "Try again."),
      });
      setDeleteOpen(false);
    },
  });

  // ============================================================
  // Loading / not-found gating
  // ============================================================
  // Avoid flashing NotFound while /api/roles is still resolving on edit.
  const rolesLoaded = roles.length > 0 || isCreate;
  useEffect(() => {
    // No-op; placeholder for future side effects (e.g. focus name input on
    // /new). useAutosaveDraft handles its own initial state.
  }, []);

  if (!validId) return <NotFound />;
  if (!isCreate && rolesLoaded && !role) return <NotFound />;
  if (!isCreate && !role) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Loading role…
          </CardContent>
        </Card>
      </div>
    );
  }

  const headerTitle = isCreate ? "New role" : "Edit role";
  const backHref = isCreate ? "/support" : `/support/roles/${id}`;

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-role-edit">
      <EditPageHeader
        backHref={backHref}
        title={headerTitle}
        infoContent={
          <div className="space-y-1 text-xs">
            <p className="font-medium">Editing a role</p>
            <p>
              Changes to name and description autosave after a short pause.
              Adds/removes of people save immediately. Marked-for-removal
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

      <div className="flex-1 p-3 space-y-4 max-w-xl mx-auto w-full pb-24">
        {/* Name + description */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="role-name">
                Role name
              </Label>
              <Input
                id="role-name"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="Parent"
                maxLength={60}
                className="text-sm h-9"
                data-testid="input-role-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="role-description">
                Description (optional)
              </Label>
              <Textarea
                id="role-description"
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                placeholder="What this role means to you"
                maxLength={500}
                rows={3}
                className="text-sm"
                data-testid="input-role-description"
              />
            </div>
          </CardContent>
        </Card>

        {/* People supporting this role */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs">People supporting this role</Label>

            {/* On /new we don't have a role id yet, so people management is
                disabled with a hint. */}
            {isCreate ? (
              <p className="text-xs text-muted-foreground italic">
                Save the role first (start typing a name above), then come
                back to add people.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {linkedPeople.length === 0 && !pickerOpen && (
                    <p className="text-xs text-muted-foreground italic">
                      No people linked yet.
                    </p>
                  )}
                  {linkedPeople.map(({ rolePeopleId, person }) => {
                    const key = `role-person:${rolePeopleId}`;
                    const marked = markedForRemoval.has(key);
                    return (
                      <div
                        key={rolePeopleId}
                        className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded border ${
                          marked
                            ? "bg-muted text-muted-foreground"
                            : "bg-background"
                        }`}
                        data-testid={`row-role-person-${rolePeopleId}`}
                      >
                        <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className={`flex-1 truncate ${marked ? "line-through" : ""}`}>
                          {person.name}
                        </span>
                        {marked ? (
                          <>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              marked
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleUndoRemovePerson(rolePeopleId)}
                              data-testid={`button-undo-remove-person-${rolePeopleId}`}
                            >
                              Undo
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleMarkRemovePerson(rolePeopleId)}
                            data-testid={`button-remove-person-${rolePeopleId}`}
                            aria-label={`Remove ${person.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {pickerOpen ? (
                  <PeoplePicker
                    roleId={id as number}
                    excludePersonIds={linkedPeople.map(lp => lp.person.id)}
                    onClose={() => setPickerOpen(false)}
                    onAdded={() => {
                      // Picker stays open so user can add multiple in a row.
                    }}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-sm"
                    onClick={() => setPickerOpen(true)}
                    data-testid="button-open-people-picker"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add person
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Responsibilities (read-only) */}
        {!isCreate && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs">Responsibilities</Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                Read-only here. Edit on the responsibility itself.
              </p>
              {respsForRole.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pt-1">
                  No responsibilities linked.
                </p>
              ) : (
                <ul className="space-y-1 pt-1" data-testid="list-role-responsibilities">
                  {respsForRole.map(r => (
                    <li
                      key={r.id}
                      className="text-sm py-1 px-2 rounded bg-muted/30"
                      data-testid={`row-role-responsibility-${r.id}`}
                    >
                      {r.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Danger zone — hidden on /new (no id yet) and on Self */}
        {!isCreate && !isSelfRole && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-destructive">Danger zone</Label>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setDeleteOpen(true)}
                data-testid="button-delete-role"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete role
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Self protection notice (replaces danger zone for Self) */}
        {!isCreate && isSelfRole && (
          <Card className="border-muted">
            <CardContent className="p-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Self cannot be deleted. It&apos;s the default role for every
                person and anchors responsibilities you do alone.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />

      <RoleDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        roleName={role?.name ?? ""}
        responsibilityCount={respsForRole.length}
        peopleCount={linkedPeople.length}
        onConfirm={() => deleteRole.mutate()}
        isDeleting={deleteRole.isPending}
      />
    </div>
  );
}
