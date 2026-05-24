// SupportSection — Phase 5 PR #18b
//
// Reusable card for one of the five support sections on the Responsibility
// edit screen (People / Places / Things / Providers / Conditions). Rendered
// five times by responsibility-edit.tsx with different config props.
//
// Layout per spec §11:
//   ┌─────────────────────────────────────────────────────┐
//   │ <Header>                                            │
//   │ -<helper line>                                      │
//   │ [+ Add <singular>]   ← collapses into EnvPicker     │
//   │                                                     │
//   │ Linked items                                        │
//   │   <name>          [Critical ▾]    [×]               │
//   │   <name>          [Workaround ▾]  [×]               │
//   │                                                     │
//   │ ▸ What do these mean?                               │
//   └─────────────────────────────────────────────────────┘
//
// Marked-for-removal pattern matches PR #18a: clicking [×] adds the link to
// the parent's `markedForRemoval` set; the row goes muted + line-through with
// an Undo. Removal is flushed when the user taps Done.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EnvPicker, type SupportType } from "@/components/env-picker";
import {
  RelationshipDropdown,
  RELATIONSHIP_LABELS,
} from "@/components/relationship-dropdown";
import type { RelationshipType } from "@shared/schema";

// Server returns the junction row directly. Each table has slightly different
// FK column names (personId/placeId/thingId/providerId/conditionId) and we
// need to look up the env item's name from a separate query, so the link
// type must be parameterized.
interface JunctionRow {
  id: number;
  // Either responsibilityId (for resp junctions) or projectId (for project junctions).
  responsibilityId?: number;
  projectId?: number;
  relationshipType: RelationshipType;
  importance: string;
  // PR #53: ID of the critical support this workaround covers
  coversId?: number | null;
  // PR #53: Availability state of the support (state column in DB)
  state?: string | null;
  // Plus exactly one of: personId / placeId / thingId / providerId / conditionId
  // (typed loosely here; resolved per supportType below).
  [k: string]: unknown;
}

interface EnvItem {
  id: number;
  name: string;
  state?: string | null;
}

// Parent context for the section. PR #23 made this parent-agnostic so the
// same section drives both Responsibility and Project edit pages. Existing
// call sites that pass `responsibilityId` continue to work unchanged because
// `parentType` defaults to "responsibility" and `parentId` falls back to
// `responsibilityId`.
// PR #32 added "agendaTask" so the same component drives the agenda-task
// page-mode form with zero behavior changes for the other two parents.
type ParentType = "responsibility" | "project" | "agendaTask";

interface SupportSectionProps {
  /** @deprecated Pass parentType="responsibility" + parentId instead. */
  responsibilityId?: number;
  parentType?: ParentType;
  parentId?: number;
  supportType: SupportType;
  // Card heading, e.g. "People", "Places".
  title: string;
  // Italic helper line under the heading, e.g. "-who does this responsibility involve or depend on?".
  helperLine: string;
  // Singular noun for [+ Add X] button, e.g. "person", "place".
  addLabel: string;
  // Marked-for-removal helpers from useAutosaveDraft (parent page).
  markedForRemoval: Set<string>;
  markForRemoval: (key: string) => void;
  undoRemoval: (key: string) => void;
}

function parentBasePath(parentType: ParentType, parentId: number): string {
  switch (parentType) {
    case "project":    return `/api/projects/${parentId}`;
    case "agendaTask": return `/api/agenda-tasks/${parentId}`;
    case "responsibility":
    default:           return `/api/responsibilities/${parentId}`;
  }
}

function removalKeyPrefix(parentType: ParentType): string {
  // Marked-for-removal keys must be distinct per parent so the parent page's
  // flush regex (resp-edit uses /^resp-support:.../, proj-edit uses /^proj-support:.../,
  // agenda-task page uses /^agenda-support:.../) doesn't cross-fire.
  switch (parentType) {
    case "project":    return "proj-support";
    case "agendaTask": return "agenda-support";
    case "responsibility":
    default:           return "resp-support";
  }
}

const FK_FIELD: Record<SupportType, string> = {
  people: "personId",
  places: "placeId",
  things: "thingId",
  providers: "providerId",
  conditions: "conditionId",
};

const ENV_ENDPOINT: Record<SupportType, string> = {
  people: "/api/environment/people",
  places: "/api/environment/places",
  things: "/api/environment/things",
  providers: "/api/environment/providers",
  conditions: "/api/environment/conditions",
};

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

// PR #53: Dropdown to select a workaround for a broken Critical support
// Shows ALL Workaround supports across ALL categories (not just the current one)
interface WorkaroundDropdownProps {
  linkId: number;
  coversId?: number | null;
  supportType: SupportType;
  parentType: ParentType;
  parentId: number;
  updateCovers: ReturnType<typeof useMutation<any, Error, { linkId: number; coversId: number | null }>>;
}

function WorkaroundDropdown({ linkId, coversId, supportType, parentType, parentId, updateCovers }: WorkaroundDropdownProps) {
  const basePath = parentBasePath(parentType, parentId);
  
  // Fetch ALL support categories to find Workaround supports
  const { data: allPeople = [], isLoading: loadingPeople } = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/people`],
    enabled: parentId > 0,
    staleTime: 0,
  });
  const { data: allPlaces = [], isLoading: loadingPlaces } = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/places`],
    enabled: parentId > 0,
    staleTime: 0,
  });
  const { data: allThings = [], isLoading: loadingThings } = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/things`],
    enabled: parentId > 0,
    staleTime: 0,
  });
  const { data: allProviders = [], isLoading: loadingProviders } = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/providers`],
    enabled: parentId > 0,
    staleTime: 0,
  });
  const { data: allConditions = [], isLoading: loadingConditions } = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/conditions`],
    enabled: parentId > 0,
    staleTime: 0,
  });
  const isLoadingData = loadingPeople || loadingPlaces || loadingThings || loadingProviders || loadingConditions;

  // Get names for all environment items
  const { data: envPeople = [] } = useQuery<EnvItem[]>({ queryKey: ["/api/environment/people"] });
  const { data: envPlaces = [] } = useQuery<EnvItem[]>({ queryKey: ["/api/environment/places"] });
  const { data: envThings = [] } = useQuery<EnvItem[]>({ queryKey: ["/api/environment/things"] });
  const { data: envProviders = [] } = useQuery<EnvItem[]>({ queryKey: ["/api/environment/providers"] });
  const { data: envConditions = [] } = useQuery<EnvItem[]>({ queryKey: ["/api/environment/conditions"] });

  // Build list of all Workaround supports with their names and categories
  // PR #53: Use separate Maps per category to avoid ID collisions (e.g., Things ID 1 vs Places ID 1)
  const workaroundSupports = useMemo(() => {
    const peopleById = new Map(envPeople.map(e => [e.id, e]));
    const placesById = new Map(envPlaces.map(e => [e.id, e]));
    const thingsById = new Map(envThings.map(e => [e.id, e]));
    const providersById = new Map(envProviders.map(e => [e.id, e]));
    const conditionsById = new Map(envConditions.map(e => [e.id, e]));

    const items: Array<{ linkId: number; envId: number; name: string; category: string }> = [];
    
    const processRow = (row: JunctionRow, category: string, fkField: string, envMap: Map<number, EnvItem>) => {
      if (row.relationshipType === "temporary_workaround") {
        const envId = row[fkField] as number;
        const env = envMap.get(envId);
        if (env) {
          items.push({ linkId: row.id, envId, name: env.name, category });
        }
      }
    };

    allPeople.forEach(r => processRow(r, "People", "personId", peopleById));
    allPlaces.forEach(r => processRow(r, "Places", "placeId", placesById));
    allThings.forEach(r => processRow(r, "Things", "thingId", thingsById));
    allProviders.forEach(r => processRow(r, "Providers", "providerId", providersById));
    allConditions.forEach(r => processRow(r, "Conditions", "conditionId", conditionsById));

    // Sort by category then name
    return items.sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
    });
  }, [allPeople, allPlaces, allThings, allProviders, allConditions, envPeople, envPlaces, envThings, envProviders, envConditions]);

  return (
    <div className="flex items-center gap-2 pl-4 text-xs">
      <span className="text-muted-foreground">Workaround:</span>
      {isLoadingData ? (
        <span className="text-muted-foreground italic">Loading...</span>
      ) : workaroundSupports.length === 0 ? (
        <span className="text-muted-foreground italic">No workarounds available</span>
      ) : (
        <select
          value={coversId ?? ""}
          disabled={updateCovers.isPending}
          onChange={(e) => {
            const newCoversId = e.target.value ? Number(e.target.value) : null;
            if (newCoversId !== coversId) {
              updateCovers.mutate({ linkId, coversId: newCoversId });
            }
          }}
          className="flex-1 bg-transparent border rounded px-1 py-0.5 text-xs"
          data-testid={`select-workaround-${supportType}-${linkId}`}
        >
          <option value="">Select workaround...</option>
          {workaroundSupports.map(s => (
            <option key={s.envId} value={s.envId}>
              {s.name} ({s.category})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function SupportSection({
  responsibilityId,
  parentType = "responsibility",
  parentId,
  supportType,
  title,
  helperLine,
  addLabel,
  markedForRemoval,
  markForRemoval,
  undoRemoval,
}: SupportSectionProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const fkField = FK_FIELD[supportType];
  // Resolve parent: explicit parentId wins, else fall back to responsibilityId.
  const resolvedParentId = parentId ?? responsibilityId ?? 0;
  const basePath = parentBasePath(parentType, resolvedParentId);
  const linksKey = `${basePath}/support/${supportType}`;
  const keyPrefix = removalKeyPrefix(parentType);

  const { data: links = [] } = useQuery<JunctionRow[]>({
    queryKey: [linksKey],
  });
  const { data: envItems = [] } = useQuery<EnvItem[]>({
    queryKey: [ENV_ENDPOINT[supportType]],
  });

  const linkedRows = useMemo(() => {
    const byId = new Map(envItems.map(e => [e.id, e]));
    return links
      .map(link => {
        const envId = link[fkField] as number | undefined;
        if (typeof envId !== "number") return null;
        const env = byId.get(envId);
        if (!env) return null;
        return {
          linkId: link.id,
          envId: env.id,
          name: env.name,
          relationshipType: link.relationshipType,
          coversId: link.coversId,
          availabilityState: env.state,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      // PR #25 lock: marked-for-removal items DISAPPEAR from the bundle and
      // surface in MarkedForRemovalSection. Single source of truth.
      .filter(r => !markedForRemoval.has(`${keyPrefix}:${supportType}:${r.linkId}`))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [links, envItems, fkField, markedForRemoval, keyPrefix, supportType]);

  // Exclude env ids that have ANY existing junction row (marked or not), so
  // the picker can't add a duplicate while a row is in the removal pen.
  const linkedEnvIds = useMemo(() => {
    const out: number[] = [];
    for (const link of links) {
      const id = link[fkField] as number | undefined;
      if (typeof id === "number") out.push(id);
    }
    return out;
  }, [links, fkField]);

  const updateRelationship = useMutation({
    mutationFn: async (input: { linkId: number; relationshipType: RelationshipType }) => {
      await apiRequest(
        "PATCH",
        `${linksKey}/${input.linkId}`,
        { relationshipType: input.relationshipType },
      );
    },
    onMutate: async input => {
      // Optimistic update so the dropdown feels instant.
      const queryKey = [linksKey];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<JunctionRow[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<JunctionRow[]>(
          queryKey,
          previous.map(row =>
            row.id === input.linkId
              ? { ...row, relationshipType: input.relationshipType }
              : row,
          ),
        );
      }
      return { previous };
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't update relationship",
        description: err.message,
      });
    },
  });

  // PR #53: Mutation to update which broken support this workaround covers
  const updateCovers = useMutation({
    mutationFn: async (input: { linkId: number; coversId: number | null }) => {
      await apiRequest(
        "PATCH",
        `${linksKey}/${input.linkId}`,
        { coversId: input.coversId },
      );
    },
    onMutate: async input => {
      const queryKey = [linksKey];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<JunctionRow[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<JunctionRow[]>(
          queryKey,
          previous.map(row =>
            row.id === input.linkId
              ? { ...row, coversId: input.coversId }
              : row,
          ),
        );
      }
      return { previous };
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't update workaround link",
        description: err.message,
      });
    },
    onSettled: () => {
      // Invalidate agenda so Today card shows updated workaround status
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/week"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/day"] });
      // Also invalidate individual agenda task cards
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-tasks"] });
    },
  });

  // PR #53: Track which row is editing the unavailable reason
  const [editingReasonId, setEditingReasonId] = useState<number | null>(null);
  const [reasonInput, setReasonInput] = useState("");

  // PR #53: Mutation to toggle support availability state (Available/Unvailable)
  const updateSupportState = useMutation({
    mutationFn: async (input: { envId: number; state: "available" | "unavailable"; unavailableReason?: string | null }) => {
      await apiRequest(
        "PATCH",
        `/api/environment/${supportType}/${input.envId}/state`,
        { state: input.state, unavailableReason: input.unavailableReason },
      );
    },
    onMutate: async input => {
      const envQueryKey = `/api/environment/${supportType}`;
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [envQueryKey] });
      
      // Snapshot previous values
      const prevEnv = queryClient.getQueryData<EnvItem[]>([envQueryKey]);
      
      // Optimistically update environment items - this triggers linkedRows recalculation
      if (prevEnv) {
        queryClient.setQueryData(
          [envQueryKey],
          prevEnv.map(e => e.id === input.envId ? { ...e, state: input.state, unavailableReason: input.unavailableReason } : e)
        );
      }
      
      return { prevEnv, envQueryKey };
    },
    onError: (err: Error, input, context) => {
      // Rollback on error
      if (context?.prevEnv && context?.envQueryKey) {
        queryClient.setQueryData([context.envQueryKey], context.prevEnv);
      }
      toast({
        variant: "destructive",
        title: "Couldn't update support status",
        description: err.message,
      });
    },
    onSettled: () => {
      // Refetch to ensure server state
      queryClient.invalidateQueries({ queryKey: [`/api/environment/${supportType}`] });
    },
  });

  function handleMarkRemove(linkId: number) {
    markForRemoval(`${keyPrefix}:${supportType}:${linkId}`);
  }
  // PR #25: undo for marked rows lives in MarkedForRemovalSection, which
  // calls undoRemoval(key) directly. SupportSection no longer needs a
  // local undo handler; `undoRemoval` prop is kept on the interface for
  // backwards compatibility (other callers may still pass it).
  void undoRemoval;

  return (
    <Card data-testid={`card-support-${supportType}`}>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <Label className="text-xs">{title}</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            {helperLine}
          </p>
        </div>

        {pickerOpen ? (
          <EnvPicker
            parentType={parentType}
            parentId={resolvedParentId}
            supportType={supportType}
            excludeIds={linkedEnvIds}
            onClose={() => setPickerOpen(false)}
            onAdded={() => {
              // Picker stays open so user can add several in a row.
            }}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-sm"
            onClick={() => setPickerOpen(true)}
            data-testid={`button-open-env-picker-${supportType}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add {addLabel}
          </Button>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs pt-1">Linked {title.toLowerCase()}</Label>
          {linkedRows.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              None linked yet.
            </p>
          )}
          {linkedRows.map(row => {
            // PR #25: marked rows are filtered out of linkedRows entirely
            // (single source of truth = MarkedForRemovalSection). Anything
            // we reach here is a live, un-marked row.
            // Test ids stay parent-aware so existing resp-edit selectors keep working.
            const rowTestId =
              parentType === "project"
                ? `row-proj-support-${supportType}-${row.linkId}`
                : parentType === "agendaTask"
                  ? `row-agenda-support-${supportType}-${row.linkId}`
                  : `row-resp-support-${supportType}-${row.linkId}`;
            return (
              <div
                key={row.linkId}
                className="flex flex-col gap-1 text-sm py-1.5 px-2 rounded border bg-background"
                data-testid={rowTestId}
              >
                {/* PR #54: Name on its own line, controls on second line */}
                <div className="font-medium leading-tight">
                  {row.name}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* PR #53: Inline toggle for support availability */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {row.availabilityState === "unavailable" ? "Off" : "On"}
                    </span>
                    <Switch
                      checked={row.availabilityState !== "unavailable"}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Turning On (available) - no reason needed
                          updateSupportState.mutate({
                            envId: row.envId,
                            state: "available",
                            unavailableReason: null,
                          });
                        } else {
                          // Turning Off (unavailable) - show reason input
                          setEditingReasonId(row.envId);
                          setReasonInput("");
                        }
                      }}
                      disabled={updateSupportState.isPending || editingReasonId === row.envId}
                      className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-400"
                    />
                  </div>
                  {/* PR #53: Show availability status badge inline */}
                  {row.relationshipType === "primary" && row.availabilityState && row.availabilityState !== "available" && (
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap ${
                      row.availabilityState === "unavailable" 
                        ? "bg-red-100 text-red-700 border-red-200" 
                        : "bg-amber-100 text-amber-700 border-amber-200"
                    }`}>
                      {row.availabilityState === "unavailable" ? "⚠️ Unavailable" : row.availabilityState}
                    </span>
                  )}
                  <RelationshipDropdown
                    value={row.relationshipType}
                    disabled={updateRelationship.isPending}
                    onChange={next => {
                      if (next === row.relationshipType) return;
                      updateRelationship.mutate({
                        linkId: row.linkId,
                        relationshipType: next,
                      });
                    }}
                    testId={`select-relationship-${supportType}-${row.linkId}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleMarkRemove(row.linkId)}
                    data-testid={`button-remove-support-${supportType}-${row.linkId}`}
                    aria-label={`Remove ${row.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {/* PR #53: Show "Workaround" dropdown on Critical supports */}
                {row.relationshipType === "primary" && (
                  <WorkaroundDropdown
                    linkId={row.linkId}
                    coversId={row.coversId}
                    supportType={supportType}
                    parentType={parentType}
                    parentId={resolvedParentId}
                    updateCovers={updateCovers}
                  />
                )}
                {/* PR #53: Inline reason input when marking unavailable */}
                {editingReasonId === row.envId && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2 mt-1">
                    <div className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">
                      Why is this unavailable?
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="e.g., broken, on vacation..."
                        value={reasonInput}
                        onChange={(e) => setReasonInput(e.target.value)}
                        className="h-8 text-sm flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updateSupportState.mutate({
                              envId: row.envId,
                              state: "unavailable",
                              unavailableReason: reasonInput.trim() || null,
                            });
                            setEditingReasonId(null);
                          }
                          if (e.key === "Escape") {
                            setEditingReasonId(null);
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => {
                          updateSupportState.mutate({
                            envId: row.envId,
                            state: "unavailable",
                            unavailableReason: reasonInput.trim() || null,
                          });
                          setEditingReasonId(null);
                        }}
                        disabled={updateSupportState.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setEditingReasonId(null)}
                        disabled={updateSupportState.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Accordion explainer — collapses by default, opens on tap. */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem
            value="explainer"
            className="border-0"
            data-testid={`accordion-relationship-explainer-${supportType}`}
          >
            <AccordionTrigger className="text-[11px] text-muted-foreground py-1 hover:no-underline">
              What do these mean?
            </AccordionTrigger>
            <AccordionContent className="text-[11px] text-muted-foreground space-y-1 pt-1">
              <p>
                <span className="font-medium text-foreground">
                  {RELATIONSHIP_LABELS.primary}
                </span>
                {" — must be in place; without it the responsibility breaks."}
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {RELATIONSHIP_LABELS.secondary}
                </span>
                {" — adds resilience or backup; not required to start."}
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {RELATIONSHIP_LABELS.optional}
                </span>
                {" — nice to have; smooths the experience."}
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {RELATIONSHIP_LABELS.temporary_workaround}
                </span>
                {" — covers for a Critical that's currently broken."}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
