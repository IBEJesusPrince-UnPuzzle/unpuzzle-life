// /responsibilities/new and /responsibilities/:id/edit — Phase 5 PR #18a + #18b
//
// Slice 1+2 of §11 (the Responsibility edit screen):
//   - Header (EditPageHeader: Back, Edit responsibility, info, Saved/Done)
//   - Responsibility name (600ms debounced autosave) — first, since it's
//     what's being edited
//   - Role multi-add + Linked Roles list (with Pleasure-keeps-Self enforcement)
//   - 5 Support sections (People/Places/Things/Providers/Conditions) with the
//     universal 4-option relationship dropdown (Path A labels: Critical /
//     Important / Helpful / Workaround) and an accordion explainer.
//   - Bottom undo bar
//
// What lands later:
//   - PR #18d: Per-instance + following-only scope semantics on PATCH
//     (currently the server stubs scope as "all").
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
import { SupportSection } from "@/components/support-section";
import { CalendarSettingsCard } from "@/components/calendar-settings-card";
import type { RecurrenceScope } from "@/components/recurrence-scope-dialog";
import type { SupportType } from "@/components/env-picker";
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

  // ============================================================
  // Calendar settings (color + recurrence) — PR #18c
  // ============================================================
  // Persist color + recurrenceRule via the same PATCH endpoint the name
  // autosave uses. We pass the user's chosen scope (this/following/all) as
  // an extra field so PR #18d can light up partial-update semantics later;
  // for now the server treats every save as scope="all".
  const saveCalendarSettings = useMutation({
    mutationFn: async (input: {
      color: string;
      recurrenceRule: string;
      scope: RecurrenceScope;
    }) => {
      if (!id) return;
      await apiRequest("PATCH", `/api/responsibilities/${id}`, {
        color: input.color,
        recurrenceRule: input.recurrenceRule,
        scope: input.scope,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't save calendar settings",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  // Support-link delete is one mutation per junction type. We dispatch the
  // matching DELETE based on the marked-for-removal key prefix below.
  const removeSupportLink = useMutation({
    mutationFn: async (input: { supportType: SupportType; linkId: number }) => {
      await apiRequest(
        "DELETE",
        `/api/responsibilities/${id}/support/${input.supportType}/${input.linkId}`,
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
    // Flush pending name autosave.
    await done();
    if (!isCreate) {
      const ops: Promise<unknown>[] = [];
      const supportTypesTouched = new Set<SupportType>();
      markedForRemoval.forEach(key => {
        const roleM = key.match(/^resp-role:(\d+)$/);
        if (roleM) {
          ops.push(removeRoleLink.mutateAsync(Number(roleM[1])));
          return;
        }
        const supportM = key.match(
          /^resp-support:(people|places|things|providers|conditions):(\d+)$/,
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
          // toasts already shown in onError
        }
        await queryClient.invalidateQueries({
          queryKey: [`/api/responsibilities/${id}/roles`],
        });
        await queryClient.invalidateQueries({ queryKey: ["/api/responsibility-roles"] });
        for (const st of Array.from(supportTypesTouched)) {
          await queryClient.invalidateQueries({
            queryKey: [`/api/responsibilities/${id}/support/${st}`],
          });
        }
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
        {/* Responsibility name — first, since it's what's being edited. */}
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
                Save the responsibility first (start typing a name above),
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

        {/* Calendar settings (§11, PR #18c) — only shown after the
            responsibility row exists, so we have an id to PATCH against. */}
        {!isCreate && responsibility && (
          <CalendarSettingsCard
            initial={{
              color: responsibility.color ?? null,
              recurrenceRule: responsibility.recurrenceRule ?? null,
            }}
            isExisting={true}
            onSave={(next) => saveCalendarSettings.mutate(next)}
          />
        )}

        {/* 5 Support sections (§11) — only shown after the responsibility row
            exists, since they all need an id to link against. */}
        {!isCreate && (
          <>
            <SupportSection
              responsibilityId={id as number}
              supportType="people"
              title="People"
              helperLine="-who does this responsibility involve or depend on?"
              addLabel="person"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
            <SupportSection
              responsibilityId={id as number}
              supportType="places"
              title="Places"
              helperLine="-where do you go to carry this out?"
              addLabel="place"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
            <SupportSection
              responsibilityId={id as number}
              supportType="things"
              title="Things"
              helperLine="-what do you need to have, carry, or use?"
              addLabel="thing"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
            <SupportSection
              responsibilityId={id as number}
              supportType="providers"
              title="Providers"
              helperLine="-who supplies or maintains part of this support?"
              addLabel="provider"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
            <SupportSection
              responsibilityId={id as number}
              supportType="conditions"
              title="Conditions"
              helperLine="-what must be true before this can happen smoothly?"
              addLabel="condition"
              markedForRemoval={markedForRemoval}
              markForRemoval={markForRemoval}
              undoRemoval={undoRemoval}
            />
          </>
        )}

        {isCreate && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-1">
              <Label className="text-xs text-muted-foreground">
                Support sections
              </Label>
              <p className="text-xs text-muted-foreground">
                Save the responsibility first (start typing a name above),
                then come back to add People, Places, Things, Providers, and
                Conditions.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />
    </div>
  );
}
