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
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, X } from "lucide-react";
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
  responsibilityId: number;
  relationshipType: RelationshipType;
  importance: string;
  // Plus exactly one of: personId / placeId / thingId / providerId / conditionId
  // (typed loosely here; resolved per supportType below).
  [k: string]: unknown;
}

interface EnvItem {
  id: number;
  name: string;
}

interface SupportSectionProps {
  responsibilityId: number;
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

export function SupportSection({
  responsibilityId,
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

  const { data: links = [] } = useQuery<JunctionRow[]>({
    queryKey: [`/api/responsibilities/${responsibilityId}/support/${supportType}`],
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
        };
      })
      .filter((x): x is {
        linkId: number;
        envId: number;
        name: string;
        relationshipType: RelationshipType;
      } => !!x)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [links, envItems, fkField]);

  const linkedEnvIds = linkedRows.map(r => r.envId);

  const updateRelationship = useMutation({
    mutationFn: async (input: { linkId: number; relationshipType: RelationshipType }) => {
      await apiRequest(
        "PATCH",
        `/api/responsibilities/${responsibilityId}/support/${supportType}/${input.linkId}`,
        { relationshipType: input.relationshipType },
      );
    },
    onMutate: async input => {
      // Optimistic update so the dropdown feels instant.
      const queryKey = [
        `/api/responsibilities/${responsibilityId}/support/${supportType}`,
      ];
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
    onError: (err: Error, _input, ctx) => {
      const queryKey = [
        `/api/responsibilities/${responsibilityId}/support/${supportType}`,
      ];
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast({
        variant: "destructive",
        title: "Couldn't update relationship",
        description: parseServerError(err, "Try again."),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/responsibilities/${responsibilityId}/support/${supportType}`],
      });
    },
  });

  function handleMarkRemove(linkId: number) {
    markForRemoval(`resp-support:${supportType}:${linkId}`);
  }
  function handleUndoRemove(linkId: number) {
    undoRemoval(`resp-support:${supportType}:${linkId}`);
  }

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
            responsibilityId={responsibilityId}
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
            const key = `resp-support:${supportType}:${row.linkId}`;
            const marked = markedForRemoval.has(key);
            return (
              <div
                key={row.linkId}
                className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded border ${
                  marked
                    ? "bg-muted text-muted-foreground"
                    : "bg-background"
                }`}
                data-testid={`row-resp-support-${supportType}-${row.linkId}`}
              >
                <span className={`flex-1 truncate ${marked ? "line-through" : ""}`}>
                  {row.name}
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
                      onClick={() => handleUndoRemove(row.linkId)}
                      data-testid={`button-undo-remove-support-${supportType}-${row.linkId}`}
                    >
                      Undo
                    </Button>
                  </>
                ) : (
                  <>
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
                  </>
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
