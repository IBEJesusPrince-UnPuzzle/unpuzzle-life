// RolePicker — Phase 5 PR #18a
//
// Inline autocomplete picker used on the Responsibility edit screen (§11).
// Mirrors the PeoplePicker pattern: type a name → see fuzzy matches across
// the user's existing roles → tap a match to add. If no exact match, an
// "Add new role: 'X'" row appears that creates the role on the fly AND
// links it to the responsibility in one user action.
//
// Caller controls open/closed state so it can collapse the widget back into
// a `[+ Add role]` button.
//
// excludeRoleIds: ids already linked to this responsibility — filtered out
// of matches so the user can't double-link.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Users as UsersIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@shared/schema";

interface RolePickerProps {
  // The responsibility we're adding roles to. Required; only shown after the
  // responsibility row exists.
  responsibilityId: number;
  // Roles already linked (filtered out of matches).
  excludeRoleIds: number[];
  // Closes the picker.
  onClose: () => void;
  // Called after a successful add (existing or new).
  onAdded: () => void;
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

export function RolePicker({
  responsibilityId,
  excludeRoleIds,
  onClose,
  onAdded,
}: RolePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const trimmed = query.trim();
  const exclude = useMemo(() => new Set(excludeRoleIds), [excludeRoleIds]);

  const matches = useMemo(() => {
    const sortable = roles
      .filter(r => !exclude.has(r.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!trimmed) return sortable;
    const lower = trimmed.toLowerCase();
    return sortable.filter(r => r.name.toLowerCase().includes(lower));
  }, [roles, exclude, trimmed]);

  const hasExact = useMemo(() => {
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return roles.some(r => r.name.trim().toLowerCase() === lower);
  }, [roles, trimmed]);
  const showAddNew = trimmed.length > 0 && !hasExact;

  const linkRole = useMutation({
    mutationFn: async (roleId: number) => {
      await apiRequest("POST", `/api/responsibilities/${responsibilityId}/roles`, { roleId });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't add role",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const createAndLink = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/roles", { name });
      const role = (await res.json()) as Role;
      await apiRequest("POST", `/api/responsibilities/${responsibilityId}/roles`, {
        roleId: role.id,
      });
      return role;
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't add role",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  async function handleAddExisting(roleId: number) {
    await linkRole.mutateAsync(roleId);
    queryClient.invalidateQueries({ queryKey: [`/api/responsibilities/${responsibilityId}/roles`] });
    queryClient.invalidateQueries({ queryKey: ["/api/responsibility-roles"] });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  async function handleAddNew() {
    if (!trimmed) return;
    await createAndLink.mutateAsync(trimmed);
    queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    queryClient.invalidateQueries({ queryKey: [`/api/responsibilities/${responsibilityId}/roles`] });
    queryClient.invalidateQueries({ queryKey: ["/api/responsibility-roles"] });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  return (
    <div
      className="border rounded-md bg-card p-3 space-y-2"
      data-testid="role-picker"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a role…"
          className="text-sm h-9"
          data-testid="input-role-picker"
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length > 0) {
                void handleAddExisting(matches[0].id);
              } else if (showAddNew) {
                void handleAddNew();
              }
            }
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-9 w-9 shrink-0"
          data-testid="button-close-role-picker"
          aria-label="Close picker"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {matches.length === 0 && !showAddNew && (
          <p className="text-xs text-muted-foreground py-2 px-1">
            No roles match. Keep typing to add a new role.
          </p>
        )}
        {matches.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pt-1">
              Matches
            </p>
            {matches.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleAddExisting(r.id)}
                disabled={linkRole.isPending}
                className="w-full flex items-center gap-2 text-sm px-2 py-2 rounded hover:bg-muted/50 text-left disabled:opacity-50"
                data-testid={`button-add-existing-role-${r.id}`}
              >
                <UsersIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}

        {showAddNew && (
          <div className="space-y-0.5 pt-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              Or
            </p>
            <button
              type="button"
              onClick={handleAddNew}
              disabled={createAndLink.isPending}
              className="w-full flex items-center gap-2 text-sm px-2 py-2 rounded border border-dashed hover:bg-muted/50 text-left disabled:opacity-50"
              data-testid="button-add-new-role"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">
                Add new role: &ldquo;{trimmed}&rdquo;
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
