// MarkedForRemovalSection — PR #25 (project edit restructure)
//
// Locked behavior (pr25-project-edit-target.md, line 37–38):
//   - Renders OUTSIDE all bundles, just above the bottom undo-all bar.
//   - Renders only when count > 0.
//   - Header: "Marked for removal (N)".
//   - Each row: "<Category> · <label>"  with per-row [Undo] button.
//   - Undo restores the item to its original position in its bundle (the
//     bundle re-renders it because the markedForRemoval set drops the key).
//
// Single source of truth: marked items only show up here, never in the
// bundle (SupportSection now hides marked rows). This component is shared
// between project-edit and responsibility-edit pages — pass the appropriate
// parentType + parentId.
//
// Implementation:
//   - We read the same /api/<parent>/<id>/support/<type> queries that
//     SupportSection uses, so React Query dedupes them.
//   - We also read the corresponding /api/environment/<type> queries to
//     resolve the human label for each FK.
//   - We filter the marked set by the parent's prefix (proj-support vs
//     resp-support) so cross-page state never leaks.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type ParentType = "responsibility" | "project";
type SupportType = "people" | "places" | "things" | "providers" | "conditions";

interface JunctionRow {
  id: number;
  personId?: number;
  placeId?: number;
  thingId?: number;
  providerId?: number;
  conditionId?: number;
}

interface EnvItem {
  id: number;
  name: string;
}

const SUPPORT_TYPES: SupportType[] = [
  "people",
  "places",
  "things",
  "providers",
  "conditions",
];

const FK_FIELD: Record<SupportType, keyof JunctionRow> = {
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

const CATEGORY_LABEL: Record<SupportType, string> = {
  people: "People",
  places: "Places",
  things: "Things",
  providers: "Providers",
  conditions: "Conditions",
};

function parentBasePath(parentType: ParentType, parentId: number): string {
  return parentType === "project"
    ? `/api/projects/${parentId}`
    : `/api/responsibilities/${parentId}`;
}

function removalKeyPrefix(parentType: ParentType): string {
  return parentType === "project" ? "proj-support" : "resp-support";
}

export interface MarkedForRemovalSectionProps {
  parentType: ParentType;
  parentId: number;
  markedForRemoval: Set<string>;
  undoRemoval: (key: string) => void;
}

export function MarkedForRemovalSection({
  parentType,
  parentId,
  markedForRemoval,
  undoRemoval,
}: MarkedForRemovalSectionProps) {
  const basePath = parentBasePath(parentType, parentId);
  const keyPrefix = removalKeyPrefix(parentType);

  // Pull all five support-type link tables for this parent.
  // React Query dedupes — SupportSection runs the same queries.
  const peopleLinks = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/people`],
  });
  const placesLinks = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/places`],
  });
  const thingsLinks = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/things`],
  });
  const providersLinks = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/providers`],
  });
  const conditionsLinks = useQuery<JunctionRow[]>({
    queryKey: [`${basePath}/support/conditions`],
  });

  const peopleEnv = useQuery<EnvItem[]>({ queryKey: [ENV_ENDPOINT.people] });
  const placesEnv = useQuery<EnvItem[]>({ queryKey: [ENV_ENDPOINT.places] });
  const thingsEnv = useQuery<EnvItem[]>({ queryKey: [ENV_ENDPOINT.things] });
  const providersEnv = useQuery<EnvItem[]>({
    queryKey: [ENV_ENDPOINT.providers],
  });
  const conditionsEnv = useQuery<EnvItem[]>({
    queryKey: [ENV_ENDPOINT.conditions],
  });

  const linksByType: Record<SupportType, JunctionRow[]> = {
    people: peopleLinks.data ?? [],
    places: placesLinks.data ?? [],
    things: thingsLinks.data ?? [],
    providers: providersLinks.data ?? [],
    conditions: conditionsLinks.data ?? [],
  };
  const envByType: Record<SupportType, EnvItem[]> = {
    people: peopleEnv.data ?? [],
    places: placesEnv.data ?? [],
    things: thingsEnv.data ?? [],
    providers: providersEnv.data ?? [],
    conditions: conditionsEnv.data ?? [],
  };

  // Build the rows the user sees: one per marked key that we can resolve
  // back to a category + label. Keys we can't resolve (data still loading,
  // or item removed server-side already) are skipped silently — the parent
  // bundle would no longer be showing them anyway.
  const rows = useMemo(() => {
    const out: Array<{
      key: string;
      category: string;
      label: string;
    }> = [];
    markedForRemoval.forEach(key => {
      // Only handle this parent's keys. Other key shapes (future,
      // non-support) flow through unchanged.
      const m = key.match(
        new RegExp(`^${keyPrefix}:(people|places|things|providers|conditions):(\\d+)$`),
      );
      if (!m) return;
      const supportType = m[1] as SupportType;
      const linkId = Number(m[2]);
      const link = linksByType[supportType].find(l => l.id === linkId);
      if (!link) return;
      const fkField = FK_FIELD[supportType];
      const envId = link[fkField];
      if (typeof envId !== "number") return;
      const env = envByType[supportType].find(e => e.id === envId);
      if (!env) return;
      out.push({
        key,
        category: CATEGORY_LABEL[supportType],
        label: env.name,
      });
    });
    // Stable order: by category then label.
    out.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.label.localeCompare(b.label);
    });
    return out;
  }, [markedForRemoval, keyPrefix, linksByType, envByType]);

  if (rows.length === 0) return null;

  return (
    <div
      className="border rounded-md bg-muted/40 p-3 space-y-2"
      data-testid="section-marked-for-removal"
    >
      <div className="text-xs font-medium" data-testid="text-marked-for-removal-header">
        Marked for removal ({rows.length})
      </div>
      <div className="space-y-1.5">
        {rows.map(row => (
          <div
            key={row.key}
            className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-background border"
            data-testid={`row-marked-for-removal-${row.key}`}
          >
            <span className="flex-1 truncate text-muted-foreground">
              <span className="line-through">{row.category} · {row.label}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => undoRemoval(row.key)}
              data-testid={`button-undo-marked-${row.key}`}
            >
              Undo
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-exported for callers that want to also consume the count without
// rendering the section (e.g. for analytics).
export const MARKED_FOR_REMOVAL_SUPPORT_TYPES = SUPPORT_TYPES;
