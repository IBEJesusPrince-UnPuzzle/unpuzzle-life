// /responsibilities/new and /responsibilities/:id/edit — Phase 5 PR #18a
//
// Slice 1 of §11 (the Responsibility edit screen):
//   - Header (EditPageHeader: Back, Edit responsibility, info, Saved/Done)
//   - Role multi-add + Linked Roles list (with Pleasure-keeps-Self enforcement)
//   - Responsibility name (600ms debounced autosave)
//   - Bottom undo bar
//
// What lands later:
//   - PR #18b: 5 support sections (People/Places/Things/Providers/Conditions)
//     with universal 4-option relationship dropdown + accordion explainers.
//   - PR #18c: Color picker + scope dialog, recurrence editor.
//
// Behavior summary:
//   - 600ms debounced autosave on name (mirrors role edit screen).
//   - Role adds/removes are immediate (not debounced).
//   - Removed role links land in marks-for-removal, shown in the bottom undo
//     bar. Cleared on Done; remaining marked rows are deleted then.
//   - Pleasure-keeps-Self: server enforces. UI hides the [×] on the Self row
//     when the responsibility is named exactly "UnPuzzle Pleasure", and shows
//     a small notice line. If somehow attempted, server 409 surfaces as toast.
//   - On /new: no autosave until name is non-empty. First save POSTs and the
//     URL replaces with /responsibilities/:id/edit so it's stable.
//   - Cadence/dayOfWeek not exposed here — recurrenceRule (PR #18c) replaces
//     them at the responsibility level.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Users as UsersIcon, X, Lock } from "lucide-react";
import { EditPageHeader } from "@/components/edit-page-header";
import { EditPageUndoBar } from "@/components/edit-page-undo-bar";
import { useAutosaveDraft } from "@/lib/use-autosave-draft";
import { RolePicker } from "@/components/role-picker";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import type { Role, Responsibility, ResponsibilityRole } from "@shared/schema";

interface RespDraft {
  name: string;
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

const PLEASURE_NAME = "UnPuzzle Pleasure";

export default function ResponsibilityEditPage({
  params,
}: {
  params: { id?: string };
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const idParam = params?.id;
  const isCreate = !idParam;
  const id = isCreate ? null : Number(idParam);
  const validId = isCreate ? true : !!id && !isNaN(id as number);

  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
    enabled: validId,
  });
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: validId,
  });
  const { data: respRoles = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: [`/api/responsibilities/${id}/roles`],
    enabled: !isCreate && validId,
  });

  const responsibility = isCreate
    ? null
    : responsibilities.find(r => r.id === id) ?? null;

  // Lock the Pleasure rule by exact name (case-sensitive) per spec §5.
  const isPleasure = !!responsibility && responsibility.name === PLEASURE_NAME;

  // ============================================================
  // Draft state (name only) wired through useAutosaveDraft
  // ============================================================
  const serverDraft: RespDraft = useMemo(
    () => ({ name: responsibility?.name ?? "" }),
    [responsibility?.name],
  );

  const draftState = useAutosaveDraft<RespDraft>({
    value: serverDraft,
    save: async (next: RespDraft) => {
      const trimmedName = next.name.trim();
      if (!trimmedName) return;
      if (isCreate) {
        try {
          const res = await apiRequest("POST", "/api/responsibilities", {
            name: trimmedName,
          });
          const created = (await res.json()) as Responsibility;
          queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
          // Stable URL after first save.
          setLocation(`/responsibilities/${created.id}/edit`, { replace: true });
        } catch (err) {
          const msg = parseServerError(err as Error, "Couldn't create responsibility");
          toast({ variant: "destructive", title: "Couldn't save", description: msg });
          throw err;
        }
        return;
      }
      try {
        await apiRequest("PATCH", `/api/responsibilities/${id}`, {
          name: trimmedName,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
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
  // Linked roles
  // ============================================================
  const [pickerOpen, setPickerOpen] = useState(false);

  const linkedRoles = useMemo(() => {
    const rolesById = new Map(roles.map(r => [r.id, r]));
    return respRoles
      .map(rr => {
        const role = rolesById.get(rr.roleId);
        return role ? { linkId: rr.id, role } : null;
      })
      .filter((x): x is { linkId: number; role: Role } => !!x)
      // Self first, then alphabetical, so the protected row is consistently
      // placed.
      .sort((a, b) => {
        const aSelf = a.role.name.trim().toLowerCase() === "self";
        const bSelf = b.role.name.trim().toLowerCase() === "self";
        if (aSelf && !bSelf) return -1;
        if (!aSelf && bSelf) return 1;
        return a.role.name.localeCompare(b.role.name);
      });
  }, [respRoles, roles]);

  const removeRoleLink = useMutation({
    mutationFn: async (linkId: number) => {
      await apiRequest("DELETE", `/api/responsibilities/${id}/roles/${linkId}`);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't remove role",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  function handleMarkRemoveRole(linkId: number) {
    markForRemoval(`resp-role:${linkId}`);
  }
  function handleUndoRemoveRole(linkId: number) {
    undoRemoval(`resp-role:${linkId}`);
  }

  async function handleDone() {
    // Flush pending name autosave.
    await done();
    if (!isCreate) {
      const ops: Promise<unknown>[] = [];
      markedForRemoval.forEach(key => {
        const m = key.match(/^resp-role:(\d+)$/);
        if (m) {
          ops.push(removeRoleLink.mutateAsync(Number(m[1])));
        }
      });
      if (ops.length > 0) {
        try {
          await Promise.all(ops);
        } catch {
          // toasts already shown in onError
        }
        await queryClient.invalidateQueries({
          queryKey: [`/api/responsibilities/${id}/roles`],
        });
        await queryClient.invalidateQueries({ queryKey: ["/api/responsibility-roles"] });
      }
      clearRemovals();
    }
    if (isCreate) {
      setLocation("/support");
    } else {
      // §11a compact saved view.
      setLocation(`/responsibilities/${id}`);
    }
  }

  // ============================================================
  // Loading / not-found gating
  // ============================================================
  const respsLoaded = responsibilities.length > 0 || isCreate;
  useEffect(() => {
    // No-op; placeholder for future side effects.
  }, []);

  if (!validId) return <NotFound />;
  if (!isCreate && respsLoaded && !responsibility) return <NotFound />;
  if (!isCreate && !responsibility) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Loading responsibility…
          </CardContent>
        </Card>
      </div>
    );
  }

  const headerTitle = isCreate ? "New responsibility" : "Edit responsibility";
  const backHref = isCreate ? "/support" : `/responsibilities/${id}`;
  const linkedRoleIds = linkedRoles.map(lr => lr.role.id);

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-responsibility-edit">
      <EditPageHeader
        backHref={backHref}
        title={headerTitle}
        infoContent={
          <div className="space-y-1 text-xs">
            <p className="font-medium">Editing a responsibility</p>
            <p>
              Responsibilities are ongoing things you keep showing up for.
              Add the support this responsibility depends on. Items added
              here can be reused later.
            </p>
            <p>
              Name autosaves after a short pause. Adds and removes of roles
              save immediately; marked-for-removal rows are flushed when you
              tap Done.
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
        {/* Role multi-add + Linked Roles (§11) */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Role</Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -which role does this responsibility belong to?
              </p>
            </div>

            {isCreate ? (
              <p className="text-xs text-muted-foreground italic">
                Save the responsibility first (start typing a name below),
                then come back to link roles.
              </p>
            ) : (
              <>
                {pickerOpen ? (
                  <RolePicker
                    responsibilityId={id as number}
                    excludeRoleIds={linkedRoleIds}
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
                    data-testid="button-open-role-picker"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add role
                  </Button>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs pt-1">Linked roles</Label>
                  {linkedRoles.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No roles linked yet.
                    </p>
                  )}
                  {linkedRoles.map(({ linkId, role }) => {
                    const key = `resp-role:${linkId}`;
                    const marked = markedForRemoval.has(key);
                    const isSelf = role.name.trim().toLowerCase() === "self";
                    // Pleasure-keeps-Self: hide remove on the Self row when
                    // this responsibility is named exactly "UnPuzzle Pleasure".
                    const protectedRow = isPleasure && isSelf;
                    return (
                      <div
                        key={linkId}
                        className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded border ${
                          marked
                            ? "bg-muted text-muted-foreground"
                            : "bg-background"
                        }`}
                        data-testid={`row-resp-role-${linkId}`}
                      >
                        <UsersIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className={`flex-1 truncate ${marked ? "line-through" : ""}`}>
                          {role.name}
                        </span>
                        {protectedRow ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"
                            data-testid={`badge-pleasure-self-${linkId}`}
                          >
                            <Lock className="w-3 h-3" />
                            stays linked
                          </span>
                        ) : marked ? (
                          <>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              marked
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleUndoRemoveRole(linkId)}
                              data-testid={`button-undo-remove-role-${linkId}`}
                            >
                              Undo
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleMarkRemoveRole(linkId)}
                            data-testid={`button-remove-role-${linkId}`}
                            aria-label={`Remove ${role.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {isPleasure && (
                    <p className="text-[11px] italic text-muted-foreground pt-0.5">
                      Self stays linked to UnPuzzle Pleasure so it remains
                      personally protected.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Responsibility name */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-0.5">
              <Label className="text-xs" htmlFor="resp-name">
                Responsibility
              </Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -name the ongoing duty, not a one-time task
              </p>
            </div>
            <Input
              id="resp-name"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="School drop-off"
              maxLength={120}
              className="text-sm h-9"
              data-testid="input-responsibility-name"
            />
          </CardContent>
        </Card>

        {/* Placeholder note for future PRs (#18b/#18c) */}
        {!isCreate && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-1">
              <Label className="text-xs text-muted-foreground">
                Coming next
              </Label>
              <p className="text-xs text-muted-foreground">
                Support sections (People, Places, Things, Providers,
                Conditions), color, and recurrence land in the next two PRs.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />
    </div>
  );
}
