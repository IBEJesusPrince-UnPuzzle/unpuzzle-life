// PR #33 — /support/:type — parameterized Support Makeup list page.
//
// One file, five routes (people / places / things / providers / conditions).
// Replaces the "enabled = false" stub in client/src/pages/support.tsx so
// tapping a Support Makeup row finally lands somewhere.
//
// Three behaviors live on this page:
//   1. List of every env entry of the chosen type, with a per-row count of
//      how many parents (responsibilities + projects + agenda tasks)
//      currently reference it. Fed by GET /api/environment/:type/link-counts.
//   2. Add: [+] button POSTs a new entry to /api/environment/:type with
//      name = "New <singular>". User immediately taps it to rename.
//   3. Tap row → edit sheet (rename + Used-by rollup + Delete button).
//      Delete is gated behind SupportEntryDeleteDialog's typed-DELETE
//      cascade — see component header for the locked semantics.
//
// Per-type config (label, icon, helper line, singular) is centralized in
// TYPE_CONFIG below; the rest of the page is type-agnostic.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Redirect } from "wouter";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin,
  Package,
  Briefcase,
  CloudSun,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import { useToast } from "@/hooks/use-toast";
import {
  SupportEntryDeleteDialog,
  type SupportEntryDeleteSummary,
  type SupportType,
} from "@/components/support-entry-delete-dialog";

// Shape of any env entry — all 5 tables share { id, userId, name, state, ... }.
// We only read id + name here, so the loose shape is enough.
type EnvEntry = { id: number; name: string };

type LinkSummary = {
  responsibilities: { count: number; items: { id: number; name: string }[] };
  projects: { count: number; items: { id: number; name: string }[] };
  agendaTasks: { count: number; items: { id: number; name: string }[] };
};

const TYPE_CONFIG: Record<
  SupportType,
  {
    label: string; // page heading: "People"
    singular: string; // edit-sheet title: "person"
    helper: string; // subhead under the heading
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string; // tailwind text-* token for the icon
  }
> = {
  people: {
    label: "People",
    singular: "person",
    helper: "Anyone who shows up across your life",
    icon: Users,
    iconColor: "text-chart-3",
  },
  places: {
    label: "Places",
    singular: "place",
    helper: "Where things happen",
    icon: MapPin,
    iconColor: "text-chart-2",
  },
  things: {
    label: "Things",
    singular: "thing",
    helper: "Objects, tools, anything you reach for",
    icon: Package,
    iconColor: "text-chart-1",
  },
  providers: {
    label: "Providers",
    singular: "provider",
    helper: "Services and businesses you rely on",
    icon: Briefcase,
    iconColor: "text-chart-4",
  },
  conditions: {
    label: "Conditions",
    singular: "condition",
    helper: "States of the world that affect what you do",
    icon: CloudSun,
    iconColor: "text-chart-5",
  },
};

function isSupportType(s: string | undefined): s is SupportType {
  return (
    s === "people" ||
    s === "places" ||
    s === "things" ||
    s === "providers" ||
    s === "conditions"
  );
}

interface RouteProps {
  params: { type?: string };
}

export default function SupportTypeListPage({ params }: RouteProps) {
  const rawType = params?.type;
  if (!isSupportType(rawType)) {
    // Unknown /support/:type segment — bounce back to the Support dashboard.
    return <Redirect to="/support" />;
  }
  return <SupportTypeListInner supportType={rawType} />;
}

function SupportTypeListInner({ supportType }: { supportType: SupportType }) {
  const cfg = TYPE_CONFIG[supportType];
  const Icon = cfg.icon;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Edit sheet state. entryId === null means closed.
  const [editEntryId, setEditEntryId] = useState<number | null>(null);

  // List of entries.
  const entriesEndpoint = `/api/environment/${supportType}`;
  const { data: entries = [] } = useQuery<EnvEntry[]>({
    queryKey: [entriesEndpoint],
  });

  // Bulk link counts — single round trip for the whole list.
  const { data: linkCounts = [] } = useQuery<{ id: number; count: number }[]>({
    queryKey: [`/api/environment/${supportType}/link-counts`],
  });
  const countById = useMemo(() => {
    const m = new Map<number, number>();
    for (const row of linkCounts) m.set(row.id, row.count);
    return m;
  }, [linkCounts]);

  // Sort: name asc, locale-aware so accented names land where users expect.
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [entries],
  );

  const createEntry = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", entriesEndpoint, {
        name: `New ${cfg.singular}`,
      });
      return (await res.json()) as EnvEntry;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [entriesEndpoint] });
      queryClient.invalidateQueries({
        queryKey: [`/api/environment/${supportType}/link-counts`],
      });
      // Open the edit sheet immediately so the user can rename the placeholder.
      setEditEntryId(created.id);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: `Couldn't add ${cfg.singular}`,
        description: parseServerError(err, "Try again."),
      });
    },
  });

  return (
    <>
      <div className="p-6 max-w-3xl mx-auto space-y-6 pb-24">
        <div>
          <Link
            href="/support"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="link-back-to-support"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <div className="flex items-start justify-between gap-3 mt-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                {cfg.label}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {cfg.helper}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createEntry.mutate()}
              disabled={createEntry.isPending}
              className="h-9 w-9 p-0 shrink-0"
              data-testid={`button-add-${supportType}`}
              aria-label={`Add ${cfg.singular}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {sortedEntries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Icon className={`w-10 h-10 mx-auto mb-3 opacity-30 ${cfg.iconColor}`} />
              <p className="text-sm font-medium">No {cfg.label.toLowerCase()} yet</p>
              <p className="text-xs mt-1">Tap [+] to add one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map(entry => {
              const count = countById.get(entry.id) ?? 0;
              return (
                <Card
                  key={entry.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setEditEntryId(entry.id)}
                  data-testid={`row-${supportType}-${entry.id}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${cfg.iconColor} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {count === 0
                          ? "Not used yet"
                          : `Used in ${count} ${count === 1 ? "place" : "places"}`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editEntryId !== null && (
        <SupportEntryEditSheet
          supportType={supportType}
          entryId={editEntryId}
          // Cache entry name from the list so the sheet has something to show
          // while its own queries warm up. The sheet re-fetches authoritatively.
          initialName={
            sortedEntries.find(e => e.id === editEntryId)?.name ?? ""
          }
          onClose={() => setEditEntryId(null)}
        />
      )}
    </>
  );
}

// ============================================================
// Edit sheet — rename + Used-by rollup + Delete button
// ============================================================
//
// Slides up from the bottom on mobile, sides in on desktop (default Sheet
// behavior). Save is a manual button — debounced auto-save felt wrong for
// a single rename field on a slide-up sheet (no place to surface "saved"
// state inline cleanly). Cancel closes without writing.

function SupportEntryEditSheet({
  supportType,
  entryId,
  initialName,
  onClose,
}: {
  supportType: SupportType;
  entryId: number;
  initialName: string;
  onClose: () => void;
}) {
  const cfg = TYPE_CONFIG[supportType];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(initialName);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Pull the link summary (counts + names) for the "Used by" rollup. Same
  // endpoint the delete dialog uses, so the cache is shared.
  const summaryQuery = useQuery<LinkSummary>({
    queryKey: [`/api/environment/${supportType}/${entryId}/link-summary`],
  });
  const summary = summaryQuery.data;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name can't be empty");
      await apiRequest("PATCH", `/api/environment/${supportType}/${entryId}`, {
        name: trimmed,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/environment/${supportType}`],
      });
      // The rollup endpoint embeds the entry's name on parent rows
      // indirectly, but the entry's own name doesn't affect counts; still
      // invalidate to keep cross-page caches honest.
      queryClient.invalidateQueries({
        queryKey: [`/api/environment/${supportType}/${entryId}/link-summary`],
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't save",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  function handleDeleted(s: SupportEntryDeleteSummary) {
    // Toast the cascade summary so the user knows exactly what unlinked.
    const total = s.responsibilities + s.projects + s.agendaTasks;
    const detailParts: string[] = [];
    if (s.responsibilities > 0) {
      detailParts.push(
        `${s.responsibilities} ${s.responsibilities === 1 ? "responsibility" : "responsibilities"}`,
      );
    }
    if (s.projects > 0) {
      detailParts.push(
        `${s.projects} ${s.projects === 1 ? "project" : "projects"}`,
      );
    }
    if (s.agendaTasks > 0) {
      detailParts.push(
        `${s.agendaTasks} ${s.agendaTasks === 1 ? "agenda task" : "agenda tasks"}`,
      );
    }
    const detail =
      total === 0
        ? `${cfg.label.slice(0, -1)} deleted.`
        : `${detailParts.join(", ")} unlinked.`;
    toast({
      title: `${name.trim() || initialName} deleted`,
      description: detail,
    });
    // Invalidate the list page's count query too — the cascade may have
    // touched other entries' counts indirectly (won't normally, but the
    // deleted entry's row needs to disappear from the list).
    queryClient.invalidateQueries({
      queryKey: [`/api/environment/${supportType}/link-counts`],
    });
    onClose();
  }

  const canSave =
    !saveMutation.isPending &&
    name.trim().length > 0 &&
    name.trim() !== initialName;

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          className="sm:max-w-md sm:mx-auto rounded-t-xl"
          data-testid="sheet-support-entry-edit"
        >
          <SheetHeader>
            <SheetTitle data-testid="text-support-entry-edit-title">
              Edit {cfg.singular}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 pt-4 pb-2">
            <div className="space-y-1.5">
              <Label htmlFor="support-entry-name" className="text-xs">
                Name
              </Label>
              <Input
                id="support-entry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={`${cfg.singular} name`}
                data-testid="input-support-entry-name"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Used by
              </p>

              {summaryQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Checking...</p>
              ) : summary ? (
                <UsedByRollup summary={summary} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Couldn't load links.
                </p>
              )}
            </div>

            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                data-testid="button-support-entry-delete"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saveMutation.isPending}
              data-testid="button-support-entry-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
              data-testid="button-support-entry-save"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <SupportEntryDeleteDialog
        supportType={supportType}
        entryId={entryId}
        entryName={name.trim() || initialName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
      />
    </>
  );
}

// Renders the three parent kinds. Each section only appears if that parent
// has linked rows — empty sections are hidden so the rollup collapses for
// brand-new entries.
function UsedByRollup({ summary }: { summary: LinkSummary }) {
  const total =
    summary.responsibilities.count +
    summary.projects.count +
    summary.agendaTasks.count;
  if (total === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="text-used-by-empty"
      >
        Not used yet.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm" data-testid="used-by-rollup">
      <ParentSection
        kind="responsibilities"
        label="Responsibilities"
        items={summary.responsibilities.items}
        count={summary.responsibilities.count}
        hrefFor={(id) => `/responsibilities/${id}/edit`}
      />
      <ParentSection
        kind="projects"
        label="Projects"
        items={summary.projects.items}
        count={summary.projects.count}
        hrefFor={(id) => `/projects/${id}`}
      />
      <ParentSection
        kind="agendaTasks"
        label="Agenda tasks"
        items={summary.agendaTasks.items}
        count={summary.agendaTasks.count}
        hrefFor={(id) => `/agenda/tasks/${id}/edit`}
      />
    </div>
  );
}

function ParentSection({
  kind,
  label,
  items,
  count,
  hrefFor,
}: {
  kind: string;
  label: string;
  items: { id: number; name: string }[];
  count: number;
  hrefFor: (id: number) => string;
}) {
  if (count === 0) return null;
  return (
    <div data-testid={`used-by-section-${kind}`}>
      <p className="text-xs font-medium text-muted-foreground">
        {label} ({count})
      </p>
      <ul className="mt-1 space-y-1">
        {items.map(item => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-2 text-sm"
            data-testid={`used-by-item-${kind}-${item.id}`}
          >
            <span className="truncate">• {item.name}</span>
            <Link
              href={hrefFor(item.id)}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
              data-testid={`link-used-by-${kind}-${item.id}`}
            >
              view
              <ChevronRight className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
