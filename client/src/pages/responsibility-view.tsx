// /responsibilities/:id — §11a compact saved/read view — Phase 5 PR #18a
//
// Replaces the placeholder. Spec §11a layout:
//   Title (responsibility name)
//   Roles: Parent, Self
//   People     > Son A, Daughter
//   Places     > Car, School, Uber
//   Things     > Keys, Phone
//   Providers  > none
//   Conditions > Kids ready by 7:15
//   Expand support → opens /responsibilities/:id/edit
//
// Support sections render whatever is already in the junctions. PR #18b lands
// the actual editor for these sections; until then the compact view simply
// reflects existing data (e.g. seed rows linked via API).

import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, CheckSquare, Pencil, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import type {
  Responsibility, Role, ResponsibilityRole,
  EnvironmentPerson, EnvironmentPlace, EnvironmentThing,
  EnvironmentProvider, EnvironmentCondition,
} from "@shared/schema";

interface SupportRow {
  id: number;
  personId?: number;
  placeId?: number;
  thingId?: number;
  providerId?: number;
  conditionId?: number;
  relationshipType?: string;
  importance?: string;
}

export default function ResponsibilityViewPage({
  params,
}: {
  params: { id?: string };
}) {
  const [, setLocation] = useLocation();
  const idParam = params?.id;
  const id = idParam ? Number(idParam) : NaN;
  const validId = !!idParam && !isNaN(id);

  const { data: responsibilities = [], isLoading: respsLoading } = useQuery<
    Responsibility[]
  >({
    queryKey: ["/api/responsibilities"],
    enabled: validId,
  });
  const responsibility = responsibilities.find(r => r.id === id) ?? null;

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: validId,
  });
  const { data: respRoles = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: [`/api/responsibilities/${id}/roles`],
    enabled: validId,
  });

  const { data: people = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
    enabled: validId,
  });
  const { data: places = [] } = useQuery<EnvironmentPlace[]>({
    queryKey: ["/api/environment/places"],
    enabled: validId,
  });
  const { data: things = [] } = useQuery<EnvironmentThing[]>({
    queryKey: ["/api/environment/things"],
    enabled: validId,
  });
  const { data: providers = [] } = useQuery<EnvironmentProvider[]>({
    queryKey: ["/api/environment/providers"],
    enabled: validId,
  });
  const { data: conditions = [] } = useQuery<EnvironmentCondition[]>({
    queryKey: ["/api/environment/conditions"],
    enabled: validId,
  });

  const { data: peopleLinks = [] } = useQuery<SupportRow[]>({
    queryKey: [`/api/responsibilities/${id}/support/people`],
    enabled: validId,
  });
  const { data: placesLinks = [] } = useQuery<SupportRow[]>({
    queryKey: [`/api/responsibilities/${id}/support/places`],
    enabled: validId,
  });
  const { data: thingsLinks = [] } = useQuery<SupportRow[]>({
    queryKey: [`/api/responsibilities/${id}/support/things`],
    enabled: validId,
  });
  const { data: providersLinks = [] } = useQuery<SupportRow[]>({
    queryKey: [`/api/responsibilities/${id}/support/providers`],
    enabled: validId,
  });
  const { data: conditionsLinks = [] } = useQuery<SupportRow[]>({
    queryKey: [`/api/responsibilities/${id}/support/conditions`],
    enabled: validId,
  });

  if (!validId) return <NotFound />;
  if (!respsLoading && !responsibility) return <NotFound />;
  if (!responsibility) {
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

  // Resolve linked roles in display order: Self first, then alphabetical.
  const rolesById = new Map(roles.map(r => [r.id, r]));
  const linkedRoleNames = respRoles
    .map(rr => rolesById.get(rr.roleId)?.name)
    .filter((n): n is string => !!n)
    .sort((a, b) => {
      const aSelf = a.trim().toLowerCase() === "self";
      const bSelf = b.trim().toLowerCase() === "self";
      if (aSelf && !bSelf) return -1;
      if (!aSelf && bSelf) return 1;
      return a.localeCompare(b);
    });

  function resolveNames<T extends { id: number; name: string }>(
    links: SupportRow[],
    items: T[],
    fk: keyof SupportRow,
  ): string[] {
    const byId = new Map(items.map(i => [i.id, i]));
    return links
      .map(l => {
        const fkVal = l[fk] as number | undefined;
        return fkVal != null ? byId.get(fkVal)?.name : undefined;
      })
      .filter((n): n is string => !!n);
  }

  const peopleNames = resolveNames(peopleLinks, people, "personId");
  const placesNames = resolveNames(placesLinks, places, "placeId");
  const thingsNames = resolveNames(thingsLinks, things, "thingId");
  const providersNames = resolveNames(providersLinks, providers, "providerId");
  const conditionsNames = resolveNames(conditionsLinks, conditions, "conditionId");

  // Render a single support row as "Label > a, b, c" or "Label > none".
  function SupportLine({ label, items }: { label: string; items: string[] }) {
    return (
      <div className="flex items-baseline gap-2 text-sm py-1">
        <span className="w-[88px] shrink-0 text-xs text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">&gt;</span>
        <span className="flex-1">
          {items.length === 0 ? (
            <span className="text-muted-foreground italic">none</span>
          ) : (
            items.join(", ")
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      className="p-4 max-w-2xl mx-auto space-y-4"
      data-testid="page-responsibility-view"
    >
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-support"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <div className="flex items-start justify-between gap-2 mt-2">
          <div className="min-w-0">
            <h1
              className="text-xl font-semibold tracking-tight flex items-center gap-2"
              data-testid="text-responsibility-name"
            >
              <CheckSquare className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="truncate">{responsibility.name}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Roles:{" "}
              {linkedRoleNames.length === 0 ? (
                <span className="italic">none</span>
              ) : (
                <span data-testid="text-linked-roles">
                  {linkedRoleNames.join(", ")}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/responsibilities/${id}/edit`)}
            data-testid="button-edit-responsibility"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-0.5" data-testid="card-support-summary">
          <SupportLine label="People" items={peopleNames} />
          <SupportLine label="Places" items={placesNames} />
          <SupportLine label="Things" items={thingsNames} />
          <SupportLine label="Providers" items={providersNames} />
          <SupportLine label="Conditions" items={conditionsNames} />
        </CardContent>
      </Card>

      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between"
        onClick={() => setLocation(`/responsibilities/${id}/edit`)}
        data-testid="button-expand-support"
      >
        <span>Expand support</span>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
