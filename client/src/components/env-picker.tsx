// EnvPicker — Phase 5 PR #18b
//
// Universal inline autocomplete picker for environment items (people, places,
// things, providers, conditions). Mirrors RolePicker (PR #18a):
//   - type a name → see fuzzy matches across the user's existing items
//   - tap a match to link it to the responsibility
//   - if no exact match, an "Add new …: 'X'" row appears that creates the
//     environment item AND links it in one user action.
//
// Parameterized by `supportType` so all five sections share one component.
// Server enforces the universal 4-option relationship rule (§3a); we send no
// importance value — the column stays at its server default and is dead
// weight scheduled for cleanup (see addendum §A7.1).

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type SupportType = "people" | "places" | "things" | "providers" | "conditions";

// Per-type configuration for endpoint, FK field, and labels.
const SUPPORT_CONFIG: Record<
  SupportType,
  {
    envEndpoint: string;
    fkField: string;
    singularLower: string;
    addNewVerb: string;
  }
> = {
  people: {
    envEndpoint: "/api/environment/people",
    fkField: "personId",
    singularLower: "person",
    addNewVerb: "Add new person",
  },
  places: {
    envEndpoint: "/api/environment/places",
    fkField: "placeId",
    singularLower: "place",
    addNewVerb: "Add new place",
  },
  things: {
    envEndpoint: "/api/environment/things",
    fkField: "thingId",
    singularLower: "thing",
    addNewVerb: "Add new thing",
  },
  providers: {
    envEndpoint: "/api/environment/providers",
    fkField: "providerId",
    singularLower: "provider",
    addNewVerb: "Add new provider",
  },
  conditions: {
    envEndpoint: "/api/environment/conditions",
    fkField: "conditionId",
    singularLower: "condition",
    addNewVerb: "Add new condition",
  },
};

// Minimal shape we need from environment rows: id + name. All five tables
// share these two columns so a single interface works.
interface EnvItem {
  id: number;
  name: string;
}

// Parent context for the picker. PR #23 made this parent-agnostic so the
// same picker drives both Responsibility and Project edit pages. Existing
// call sites that pass `responsibilityId` continue to work unchanged because
// `parentType` defaults to "responsibility" and `parentId` falls back to
// `responsibilityId`.
// PR #32 added "agendaTask" so the same picker drives all three parent
// surfaces (responsibility-edit, project-edit, agenda-task page-mode).
type ParentType = "responsibility" | "project" | "agendaTask";

interface EnvPickerProps {
  /** @deprecated Pass parentType="responsibility" + parentId instead. */
  responsibilityId?: number;
  parentType?: ParentType;
  parentId?: number;
  supportType: SupportType;
  // Env-item ids already linked to this parent (filtered out).
  excludeIds: number[];
  // Closes the picker.
  onClose: () => void;
  // Called after a successful add (existing or new).
  onAdded: () => void;
}

function parentBasePath(parentType: ParentType, parentId: number): string {
  switch (parentType) {
    case "project":    return `/api/projects/${parentId}`;
    case "agendaTask": return `/api/agenda-tasks/${parentId}`;
    case "responsibility":
    default:           return `/api/responsibilities/${parentId}`;
  }
}

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

export function EnvPicker({
  responsibilityId,
  parentType = "responsibility",
  parentId,
  supportType,
  excludeIds,
  onClose,
  onAdded,
}: EnvPickerProps) {
  const config = SUPPORT_CONFIG[supportType];
  // Resolve parent: explicit parentId wins, else fall back to responsibilityId.
  const resolvedParentId = parentId ?? responsibilityId ?? 0;
  const basePath = parentBasePath(parentType, resolvedParentId);
  const linksKey = `${basePath}/support/${supportType}`;
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: envItems = [] } = useQuery<EnvItem[]>({
    queryKey: [config.envEndpoint],
  });

  const trimmed = query.trim();
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const matches = useMemo(() => {
    const sortable = envItems
      .filter(item => !exclude.has(item.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!trimmed) return sortable;
    const lower = trimmed.toLowerCase();
    return sortable.filter(item => item.name.toLowerCase().includes(lower));
  }, [envItems, exclude, trimmed]);

  const hasExact = useMemo(() => {
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return envItems.some(item => item.name.trim().toLowerCase() === lower);
  }, [envItems, trimmed]);
  const showAddNew = trimmed.length > 0 && !hasExact;

  const linkSupport = useMutation({
    mutationFn: async (envId: number) => {
      await apiRequest(
        "POST",
        linksKey,
        { [config.fkField]: envId },
      );
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: `Couldn't add ${config.singularLower}`,
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const createAndLink = useMutation({
    mutationFn: async (name: string) => {
      // Server requires createdAt on environment inserts.
      const createdAt = new Date().toISOString();
      const res = await apiRequest("POST", config.envEndpoint, {
        name,
        createdAt,
      });
      const created = (await res.json()) as EnvItem;
      await apiRequest(
        "POST",
        linksKey,
        { [config.fkField]: created.id },
      );
      return created;
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: `Couldn't add ${config.singularLower}`,
        description: parseServerError(err, "Try again."),
      });
    },
  });

  async function handleAddExisting(envId: number) {
    await linkSupport.mutateAsync(envId);
    queryClient.invalidateQueries({
      queryKey: [linksKey],
    });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  async function handleAddNew() {
    if (!trimmed) return;
    await createAndLink.mutateAsync(trimmed);
    queryClient.invalidateQueries({ queryKey: [config.envEndpoint] });
    queryClient.invalidateQueries({
      queryKey: [linksKey],
    });
    setQuery("");
    onAdded();
    inputRef.current?.focus();
  }

  return (
    <div
      className="border rounded-md bg-card p-3 space-y-2"
      data-testid={`env-picker-${supportType}`}
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Type a ${config.singularLower}…`}
          className="text-sm h-9"
          data-testid={`input-env-picker-${supportType}`}
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
          data-testid={`button-close-env-picker-${supportType}`}
          aria-label="Close picker"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {matches.length === 0 && !showAddNew && (
          <p className="text-xs text-muted-foreground py-2 px-1">
            No matches. Keep typing to add a new {config.singularLower}.
          </p>
        )}
        {matches.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pt-1">
              Matches
            </p>
            {matches.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAddExisting(item.id)}
                disabled={linkSupport.isPending}
                className="w-full flex items-center gap-2 text-sm px-2 py-2 rounded hover:bg-muted/50 text-left disabled:opacity-50"
                data-testid={`button-add-existing-${supportType}-${item.id}`}
              >
                <span className="flex-1 truncate">{item.name}</span>
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
              data-testid={`button-add-new-${supportType}`}
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">
                {config.addNewVerb}: &ldquo;{trimmed}&rdquo;
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
