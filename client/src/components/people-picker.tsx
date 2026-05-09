// PeoplePicker — Phase 5 PR #17b
//
// Inline autocomplete picker used on the Role edit screen (§A4 / §A4 in
// addendum). Two flows in one widget:
//   1) Type a name → see fuzzy matches across the user's existing people →
//      tap a match to add (POST /api/roles/:id/people).
//   2) If no exact match → "Add new person: \"X\"" row appears → tap creates
//      the person on the fly (POST /api/environment/people) AND links them
//      to the role in one user action (chained POSTs).
//
// On mount the picker focuses its input. Caller controls open/closed state
// so it can collapse the widget back into a `[+ Add person]` button.
//
// excludePersonIds: ids already linked to this role — filtered out of
// matches so the user can't double-link.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus, X, User as UserIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EnvironmentPerson } from "@shared/schema";

interface PeoplePickerProps {
  // The role we're adding to. Required; picker only shown on the edit screen
  // after the row exists.
  roleId: number;
  // People already linked to this role (so we filter them out of matches).
  excludePersonIds: number[];
  // Closes the picker (caller flips back to the [+ Add person] button).
  onClose: () => void;
  // Called after a successful add (existing or new). Caller refreshes the
  // role's people list.
  onAdded: () => void;
}

export function PeoplePicker({
  roleId,
  excludePersonIds,
  onClose,
  onAdded,
}: PeoplePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: people = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
  });

  const trimmed = query.trim();
  const exclude = useMemo(() => new Set(excludePersonIds), [excludePersonIds]);

  // Matches: substring (case-insensitive) over name. If query is empty we
  // still show all available people (alphabetical) so the user can browse.
  const matches = useMemo(() => {
    const sortable = people
      .filter(p => !exclude.has(p.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!trimmed) return sortable;
    const lower = trimmed.toLowerCase();
    return sortable.filter(p => p.name.toLowerCase().includes(lower));
  }, [people, exclude, trimmed]);

  // "Add new" row only when there's a non-empty query AND no exact-match
  // (case-insensitive). We don't want to suggest creating "Spouse" when
  // "Spouse" already exists.
  const hasExact = useMemo(() => {
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return people.some(p => p.name.trim().toLowerCase() === lower);
  }, [people, trimmed]);
  const showAddNew = trimmed.length > 0 && !hasExact;

  const linkPerson = useMutation({
    mutationFn: async (personId: number) => {
      await apiRequest("POST", `/api/roles/${roleId}/people`, { personId });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't add person", description: err.message });
    },
  });

  const createAndLink = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/environment/people", { name });
      const person = (await res.json()) as EnvironmentPerson;
      await apiRequest("POST", `/api/roles/${roleId}/people`, { personId: person.id });
      return person;
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't add person", description: err.message });
    },
  });

  async function handleAddExisting(personId: number) {
    await linkPerson.mutateAsync(personId);
    queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  async function handleAddNew() {
    if (!trimmed) return;
    await createAndLink.mutateAsync(trimmed);
    queryClient.invalidateQueries({ queryKey: ["/api/environment/people"] });
    queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  return (
    <div
      className="border rounded-md bg-card p-3 space-y-2"
      data-testid="people-picker"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a name…"
          className="text-sm h-9"
          data-testid="input-people-picker"
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
          data-testid="button-close-picker"
          aria-label="Close picker"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {matches.length === 0 && !showAddNew && (
          <p className="text-xs text-muted-foreground py-2 px-1">
            No people match. Keep typing to add a new person.
          </p>
        )}
        {matches.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pt-1">
              Matches
            </p>
            {matches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleAddExisting(p.id)}
                disabled={linkPerson.isPending}
                className="w-full flex items-center gap-2 text-sm px-2 py-2 rounded hover:bg-muted/50 text-left disabled:opacity-50"
                data-testid={`button-add-existing-${p.id}`}
              >
                <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
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
              data-testid="button-add-new-person"
            >
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">
                Add new person: &ldquo;{trimmed}&rdquo;
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
