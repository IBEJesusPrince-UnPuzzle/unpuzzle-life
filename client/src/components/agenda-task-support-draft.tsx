// AgendaTaskSupportDraft — PR #32
//
// Local-state version of SupportSection used only when an agenda task has
// not been persisted yet (create flow, including the inbox Do It Later
// page-mode form). Renders the same 5-category Support card UX as
// /responsibilities/:id/edit and /projects/:id/edit, but instead of writing
// to /api/agenda-tasks/:id/support/:type immediately, accumulates picks in
// a parent-owned draft state. The agenda-task modal flushes that draft
// after the agenda_task POST returns the new id (two-phase save, locked
// in pr29c-do-it-later-hybrid-ascii §"Save semantics" lines 215–217).
//
// Why a separate component: SupportSection's data flow is API-driven
// (useQuery on /api/<parent>/:id/support/:type). For create-flow the
// parent id doesn't exist yet, so we cannot reuse the same hooks. The
// component IS visually identical and reuses the EnvPicker primitive
// for the typeahead+create-new behavior.
//
// Once the agenda_task is saved (becomes editing.id), the parent swaps
// this component out for SupportSection (which talks to the live API).

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, X } from "lucide-react";
import type { SupportType } from "@/components/env-picker";
import { SupportSection } from "@/components/support-section";
import { RELATIONSHIP_LABELS } from "@/components/relationship-dropdown";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type SupportDraft = Record<SupportType, number[]>;

export const emptySupportDraft: SupportDraft = {
  people: [],
  places: [],
  things: [],
  providers: [],
  conditions: [],
};

interface EnvItem {
  id: number;
  name: string;
}

const ENV_ENDPOINT: Record<SupportType, string> = {
  people: "/api/environment/people",
  places: "/api/environment/places",
  things: "/api/environment/things",
  providers: "/api/environment/providers",
  conditions: "/api/environment/conditions",
};

const SINGULAR: Record<SupportType, string> = {
  people: "person",
  places: "place",
  things: "thing",
  providers: "provider",
  conditions: "condition",
};

const SECTIONS: Array<{
  type: SupportType;
  title: string;
  addLabel: string;
  helperLine: string;
}> = [
  {
    type: "people",
    title: "People",
    addLabel: "person",
    helperLine: "-who does this task involve or depend on?",
  },
  {
    type: "places",
    title: "Places",
    addLabel: "place",
    helperLine: "-where does this task happen?",
  },
  {
    type: "things",
    title: "Things",
    addLabel: "thing",
    helperLine: "-what objects or items does this task need?",
  },
  {
    type: "providers",
    title: "Providers",
    addLabel: "provider",
    helperLine: "-what services or vendors does this task rely on?",
  },
  {
    type: "conditions",
    title: "Conditions",
    addLabel: "condition",
    helperLine: "-what preconditions must be true for this task?",
  },
];

interface AgendaTaskSupportDraftProps {
  draft: SupportDraft;
  setDraft: (next: SupportDraft) => void;
}

export function AgendaTaskSupportDraft({
  draft,
  setDraft,
}: AgendaTaskSupportDraftProps) {
  return (
    <div className="space-y-3" data-testid="agenda-task-support-draft">
      {SECTIONS.map(section => (
        <DraftSection
          key={section.type}
          supportType={section.type}
          title={section.title}
          addLabel={section.addLabel}
          helperLine={section.helperLine}
          selectedIds={draft[section.type]}
          onChange={nextIds =>
            setDraft({ ...draft, [section.type]: nextIds })
          }
        />
      ))}
    </div>
  );
}

// AgendaTaskSupportLive — PR #32
//
// Renders all 5 SupportSection cards for an existing agenda task (edit
// flow). Wraps the locked SupportSection component verbatim and appends a
// muted "Get suggestions (coming soon)" link below each one so the visuals
// stay consistent with AgendaTaskSupportDraft above.
//
// markedForRemoval / markForRemoval / undoRemoval are passed through to
// SupportSection so deletes work like they do on responsibility-edit and
// project-edit (deferred until parent calls flush).
interface AgendaTaskSupportLiveProps {
  agendaTaskId: number;
  markedForRemoval: Set<string>;
  markForRemoval: (key: string) => void;
  undoRemoval: (key: string) => void;
}

export function AgendaTaskSupportLive({
  agendaTaskId,
  markedForRemoval,
  markForRemoval,
  undoRemoval,
}: AgendaTaskSupportLiveProps) {
  const { toast } = useToast();
  function fireSuggestionsToast() {
    toast({
      title: "Coming soon",
      description:
        "Smart suggestions for this category will arrive in a follow-up.",
    });
  }
  return (
    <div className="space-y-3" data-testid="agenda-task-support-live">
      {SECTIONS.map(section => (
        <div key={section.type} className="space-y-1">
          <SupportSection
            parentType="agendaTask"
            parentId={agendaTaskId}
            supportType={section.type}
            title={section.title}
            helperLine={section.helperLine}
            addLabel={section.addLabel}
            markedForRemoval={markedForRemoval}
            markForRemoval={markForRemoval}
            undoRemoval={undoRemoval}
          />
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline block px-4"
            onClick={fireSuggestionsToast}
            data-testid={`link-get-suggestions-live-${section.type}`}
          >
            Get suggestions (coming soon)
          </button>
        </div>
      ))}
    </div>
  );
}

interface DraftSectionProps {
  supportType: SupportType;
  title: string;
  addLabel: string;
  helperLine: string;
  selectedIds: number[];
  onChange: (next: number[]) => void;
}

function DraftSection({
  supportType,
  title,
  addLabel,
  helperLine,
  selectedIds,
  onChange,
}: DraftSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { toast } = useToast();

  const { data: envItems = [] } = useQuery<EnvItem[]>({
    queryKey: [ENV_ENDPOINT[supportType]],
  });

  const linkedRows = useMemo(() => {
    const byId = new Map(envItems.map(e => [e.id, e]));
    return selectedIds
      .map(id => byId.get(id))
      .filter((e): e is EnvItem => !!e)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [envItems, selectedIds]);

  function handleAdd(envId: number) {
    if (selectedIds.includes(envId)) return;
    onChange([...selectedIds, envId]);
  }

  function handleRemove(envId: number) {
    onChange(selectedIds.filter(id => id !== envId));
  }

  function handleGetSuggestions() {
    toast({
      title: "Coming soon",
      description: "Smart suggestions for this category will arrive in a follow-up.",
    });
  }

  return (
    <Card data-testid={`card-agenda-support-${supportType}`}>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <Label className="text-xs">{title}</Label>
          <p className="text-[11px] italic text-muted-foreground -mt-0.5">
            {helperLine}
          </p>
        </div>

        {pickerOpen ? (
          <DraftPicker
            supportType={supportType}
            excludeIds={selectedIds}
            envItems={envItems}
            onClose={() => setPickerOpen(false)}
            onAdded={id => handleAdd(id)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-sm"
            onClick={() => setPickerOpen(true)}
            data-testid={`button-open-agenda-picker-${supportType}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add {addLabel}
          </Button>
        )}

        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline block"
          onClick={handleGetSuggestions}
          data-testid={`link-get-suggestions-${supportType}`}
        >
          Get suggestions (coming soon)
        </button>

        <div className="space-y-1.5">
          <Label className="text-xs pt-1">Linked {title.toLowerCase()}</Label>
          {linkedRows.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              None linked yet.
            </p>
          )}
          {linkedRows.map(row => (
            <div
              key={row.id}
              className="flex items-center gap-2 text-sm py-1.5 px-2 rounded border bg-background"
              data-testid={`row-agenda-draft-${supportType}-${row.id}`}
            >
              <span className="flex-1 truncate">{row.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleRemove(row.id)}
                data-testid={`button-remove-draft-${supportType}-${row.id}`}
                aria-label={`Remove ${row.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Accordion explainer — same copy as SupportSection so users see the
            same explanation everywhere supports are linked. */}
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
                {" — must be in place; without it the task breaks."}
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

interface DraftPickerProps {
  supportType: SupportType;
  excludeIds: number[];
  envItems: EnvItem[];
  onClose: () => void;
  onAdded: (envId: number) => void;
}

function DraftPicker({
  supportType,
  excludeIds,
  envItems,
  onClose,
  onAdded,
}: DraftPickerProps) {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const singular = SINGULAR[supportType];

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

  const createEnv = useMutation({
    mutationFn: async (name: string) => {
      const createdAt = new Date().toISOString();
      const res = await apiRequest("POST", ENV_ENDPOINT[supportType], {
        name,
        createdAt,
      });
      return (await res.json()) as EnvItem;
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: `Couldn't add ${singular}`,
        description: err.message ?? "Try again.",
      });
    },
  });

  function handleAddExisting(envId: number) {
    onAdded(envId);
    setQuery("");
  }

  async function handleAddNew() {
    if (!trimmed) return;
    const created = await createEnv.mutateAsync(trimmed);
    queryClient.invalidateQueries({ queryKey: [ENV_ENDPOINT[supportType]] });
    onAdded(created.id);
    setQuery("");
  }

  return (
    <div
      className="border rounded-md bg-card p-3 space-y-2"
      data-testid={`agenda-draft-picker-${supportType}`}
    >
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Type a ${singular}…`}
          className="text-sm h-9"
          data-testid={`input-agenda-draft-picker-${supportType}`}
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length > 0) {
                handleAddExisting(matches[0].id);
              } else if (showAddNew) {
                void handleAddNew();
              }
            }
          }}
          autoFocus
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-9 w-9 shrink-0"
          data-testid={`button-close-agenda-draft-picker-${supportType}`}
          aria-label="Close picker"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {matches.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {matches.map(item => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left text-sm py-1.5 px-2 rounded hover:bg-accent"
              onClick={() => handleAddExisting(item.id)}
              data-testid={`button-pick-existing-${supportType}-${item.id}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {showAddNew && (
        <button
          type="button"
          className="w-full text-left text-sm py-1.5 px-2 rounded border border-dashed hover:bg-accent disabled:opacity-50"
          disabled={createEnv.isPending}
          onClick={() => void handleAddNew()}
          data-testid={`button-pick-new-${supportType}`}
        >
          <Plus className="w-3.5 h-3.5 inline mr-1.5" />
          {createEnv.isPending
            ? `Adding…`
            : `Add new ${singular}: "${trimmed}"`}
        </button>
      )}

      {!matches.length && !showAddNew && (
        <p className="text-xs text-muted-foreground italic px-2">
          Type to search or create a {singular}.
        </p>
      )}
    </div>
  );
}
