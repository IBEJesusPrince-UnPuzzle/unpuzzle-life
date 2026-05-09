import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus, Earth, AlertTriangle, ChevronRight, Users,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { SupportAddSheet } from "@/components/support-add-sheet";
import type {
  Responsibility, Role, EnvironmentPerson,
  EnvironmentPlace, EnvironmentThing,
  EnvironmentProvider, EnvironmentCondition,
  ResponsibilityRole,
} from "@shared/schema";

type RoleWithPeople = Role & { people: { id: number; personId: number }[] };

/**
 * /support — Support landing dashboard.
 *
 * Locked by addendum v8-addendum-support-module.md (May 8, 2026), §A2.
 *
 * Sections, top-to-bottom:
 *   1. Header (title + subtitle + [+])
 *   2. Needs attention (conditional)
 *   3. Roles (horizontal scroll, 4 visible + add tile)
 *   4. Responsibilities (recent 3, with linked-role labels per §5)
 *   5. Support makeup (5 fixed counts: people/places/things/providers/conditions)
 */
export default function SupportPage() {
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const { data: roles = [] } = useQuery<RoleWithPeople[]>({
    queryKey: ["/api/roles"],
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
  });
  const { data: respRoleLinks = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: ["/api/responsibility-roles"],
  });
  const { data: people = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
  });
  const { data: places = [] } = useQuery<EnvironmentPlace[]>({
    queryKey: ["/api/environment/places"],
  });
  const { data: things = [] } = useQuery<EnvironmentThing[]>({
    queryKey: ["/api/environment/things"],
  });
  const { data: providers = [] } = useQuery<EnvironmentProvider[]>({
    queryKey: ["/api/environment/providers"],
  });
  const { data: conditions = [] } = useQuery<EnvironmentCondition[]>({
    queryKey: ["/api/environment/conditions"],
  });

  // Build a map: responsibilityId -> role names (for the §5 "Linked roles: X, Y" label)
  const rolesByResponsibility = useMemo(() => {
    const roleNameById = new Map(roles.map(r => [r.id, r.name]));
    const map = new Map<number, string[]>();
    for (const link of respRoleLinks) {
      const name = roleNameById.get(link.roleId);
      if (!name) continue;
      const list = map.get(link.responsibilityId) ?? [];
      list.push(name);
      map.set(link.responsibilityId, list);
    }
    return map;
  }, [respRoleLinks, roles]);

  // Recent 3 responsibilities (sort by createdAt DESC; we don't have updated_at yet)
  const recentResponsibilities = useMemo(() => {
    const sorted = [...responsibilities].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
    return sorted.slice(0, 3);
  }, [responsibilities]);

  // Needs-attention computations (addendum A2.1)
  const needsAttention = useMemo(() => {
    const items: { kind: "missing-support" | "unavailable-condition"; text: string }[] = [];

    // 1. Responsibilities with zero linked support across all 5 categories.
    //    Cheap proxy: a responsibility appears in `respRoleLinks` (at least one role)
    //    but NOT in any of the five environment-junction tables. We don't have
    //    those junctions on the dashboard fetch, so for v1 we surface this by
    //    counting responsibilities without ANY linked role as a different alert.
    //    Full "missing support" check lives in PR #18 once the responsibility
    //    edit page lands and we add the bulk junctions endpoint.
    const respIdsWithRoles = new Set(respRoleLinks.map(l => l.responsibilityId));
    const respMissingRole = responsibilities.filter(r => !respIdsWithRoles.has(r.id));
    if (respMissingRole.length > 0) {
      items.push({
        kind: "missing-support",
        text: `${respMissingRole.length} responsibilit${
          respMissingRole.length === 1 ? "y is" : "ies are"
        } not linked to any role`,
      });
    }

    // 2. Conditions whose state is "unavailable".
    //    The schema uses `state` (not `availability_status`); valid states
    //    include "unavailable" via SUPPORT_STATES. Treat any condition not
    //    in "available" as a heads-up; precise wording uses "unavailable".
    const unavailableConditions = conditions.filter(
      (c: any) => c.state === "unavailable"
    );
    if (unavailableConditions.length > 0) {
      items.push({
        kind: "unavailable-condition",
        text: `${unavailableConditions.length} condition${
          unavailableConditions.length === 1 ? " is" : "s are"
        } currently unavailable`,
      });
    }

    return items;
  }, [responsibilities, respRoleLinks, conditions]);

  return (
    <>
      <div className="p-6 max-w-3xl mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Earth className="w-5 h-5 text-chart-3" />
              Support
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your system of current
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddSheetOpen(true)}
            className="h-9 w-9 p-0 shrink-0"
            data-testid="button-support-add"
            aria-label="Add to support"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Needs attention (conditional) */}
        {needsAttention.length > 0 && (
          <Card
            className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50"
            data-testid="section-needs-attention"
          >
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                Needs attention
              </p>
              {needsAttention.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{item.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Roles section */}
        <section data-testid="section-roles">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Roles ({roles.length})
            </p>
            <Link
              href="/support/roles"
              className="text-xs text-foreground hover:underline"
              data-testid="link-roles-view-all"
            >
              View all
            </Link>
          </div>
          {roles.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-xs text-muted-foreground">
                No roles yet. Tap [+] to add one.
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {roles.slice(0, 6).map(role => (
                <Link
                  key={role.id}
                  href={`/support/roles/${role.id}`}
                  className="shrink-0"
                  data-testid={`chip-role-${role.id}`}
                >
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="px-3 py-2.5 flex items-center gap-2 min-w-[100px]">
                      <Users className="w-3.5 h-3.5 text-chart-3 shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">
                        {role.name}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              <button
                onClick={() => setAddSheetOpen(true)}
                className="shrink-0"
                data-testid="chip-add-role"
                aria-label="Add new role"
              >
                <Card className="cursor-pointer hover:shadow-md transition-shadow border-dashed">
                  <CardContent className="px-3 py-2.5 flex items-center justify-center min-w-[60px]">
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            </div>
          )}
        </section>

        {/* Responsibilities section */}
        <section data-testid="section-responsibilities">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Responsibilities ({responsibilities.length})
            </p>
            {responsibilities.length > 0 && (
              <Link
                href="/support/responsibilities"
                className="text-xs text-foreground hover:underline"
                data-testid="link-responsibilities-view-all"
              >
                View all
              </Link>
            )}
          </div>
          {responsibilities.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-xs text-muted-foreground">
                No responsibilities yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {recentResponsibilities.map(resp => {
                  const linkedRoles = rolesByResponsibility.get(resp.id) ?? [];
                  return (
                    <Link
                      key={resp.id}
                      href={`/responsibilities/${resp.id}`}
                      className="block px-4 py-3 hover:bg-muted/50"
                      data-testid={`row-responsibility-${resp.id}`}
                    >
                      <p className="text-sm font-medium">{resp.name}</p>
                      {linkedRoles.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {linkedRoles.join(", ")}
                        </p>
                      )}
                    </Link>
                  );
                })}
                {responsibilities.length > 3 && (
                  <Link
                    href="/support/responsibilities"
                    className="block px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/50"
                    data-testid="row-responsibilities-more"
                  >
                    {responsibilities.length - 3} more…
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Support makeup section */}
        <section data-testid="section-support-makeup">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Support makeup
          </p>
          <Card>
            <CardContent className="p-0 divide-y">
              <SupportMakeupRow label="People"     count={people.length}     to="/support/people" />
              <SupportMakeupRow label="Places"     count={places.length}     to="/support/places" />
              <SupportMakeupRow label="Things"     count={things.length}     to="/support/things" />
              <SupportMakeupRow label="Providers"  count={providers.length}  to="/support/providers" />
              <SupportMakeupRow label="Conditions" count={conditions.length} to="/support/conditions" />
            </CardContent>
          </Card>
        </section>
      </div>

      <SupportAddSheet open={addSheetOpen} onOpenChange={setAddSheetOpen} />
    </>
  );
}

function SupportMakeupRow({
  label, count, to,
}: {
  label: string;
  count: number;
  to: string;
}) {
  // Until PR #22 builds the flat list pages, these rows render disabled
  // (no Link wrapper). Visual chevron is dimmed to match.
  const enabled = false;
  const content = (
    <div
      className={
        "flex items-center justify-between px-4 py-3" +
        (enabled ? " hover:bg-muted/50" : " cursor-default")
      }
      data-testid={`row-makeup-${label.toLowerCase()}`}
    >
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">{count}</span>
        <ChevronRight
          className={
            "w-4 h-4 " + (enabled ? "text-muted-foreground" : "text-muted-foreground/30")
          }
        />
      </div>
    </div>
  );
  return enabled ? <Link href={to}>{content}</Link> : content;
}
