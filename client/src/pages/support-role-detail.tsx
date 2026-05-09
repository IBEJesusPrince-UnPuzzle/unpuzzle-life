import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Users, Pencil, CheckSquare, ChevronRight, User,
} from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";
import NotFound from "@/pages/not-found";
import type {
  Role, Responsibility, ResponsibilityRole, EnvironmentPerson,
} from "@shared/schema";

type RoleWithPeople = Role & { people: { id: number; personId: number }[] };

/**
 * /support/roles/:id — Role detail (§5 inside-Role view).
 *
 * Read-only in PR #17. Edit page (`/support/roles/:id/edit`) lands in PR #17b.
 *
 * Layout matches the §5 verbatim mockup with these implementation additions
 * (locked by addendum A3):
 *   - Header: Back chevron + role name + [Edit] button
 *   - Responsibilities listed with "Linked roles: X, Y" labels (hidden when
 *     only one role is linked, per §5 rule).
 *   - "People supporting this role" subsection below responsibilities.
 *   - Each responsibility taps through to /responsibilities/:id (placeholder
 *     until PR #18).
 */
export default function SupportRoleDetailPage({
  params,
}: {
  params: { id?: string };
}) {
  const id = Number(params?.id);
  const validId = !!id && !isNaN(id);

  const { data: roles = [] } = useQuery<RoleWithPeople[]>({
    queryKey: ["/api/roles"],
    enabled: validId,
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"],
    enabled: validId,
  });
  const { data: respRoleLinks = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: ["/api/responsibility-roles"],
    enabled: validId,
  });
  const { data: people = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"],
    enabled: validId,
  });

  const role = roles.find(r => r.id === id);

  // Responsibilities linked to THIS role.
  const respsForRole = useMemo(() => {
    if (!validId) return [];
    const respIdsForThisRole = new Set(
      respRoleLinks.filter(l => l.roleId === id).map(l => l.responsibilityId),
    );
    return responsibilities.filter(r => respIdsForThisRole.has(r.id));
  }, [responsibilities, respRoleLinks, id, validId]);

  // For each responsibility, compute its full list of linked role names
  // (so we can label "Linked roles: X, Y" per §5).
  const linkedRolesByResponsibility = useMemo(() => {
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

  // People supporting this role
  const supportingPeople = useMemo(() => {
    if (!role) return [];
    const peopleById = new Map(people.map(p => [p.id, p]));
    return (role.people ?? [])
      .map(rp => peopleById.get(rp.personId))
      .filter((p): p is EnvironmentPerson => !!p);
  }, [role, people]);

  if (!validId) return <NotFound />;
  if (!role) {
    // Loading or actually missing — give the user a graceful in-between.
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link
          href="/support"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-support"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Loading role…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 pb-24">
      {/* Header (back, title, edit) */}
      <div>
        <Link
          href="/support/roles"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-roles"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to roles
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Role
            </p>
            <h1
              className="text-xl font-semibold tracking-tight flex items-center gap-2 mt-0.5"
              data-testid="text-role-name"
            >
              <Users className="w-5 h-5 text-chart-3" />
              {role.name}
            </h1>
            {role.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {role.description}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            asChild
            className="shrink-0"
            data-testid="button-edit-role"
          >
            <Link href={`/support/roles/${id}/edit`}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {/* Responsibilities */}
      <section data-testid="section-role-responsibilities">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Responsibilities ({respsForRole.length})
        </p>
        {respsForRole.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-xs text-muted-foreground">
              No responsibilities linked yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {respsForRole.map(resp => {
                const linked = linkedRolesByResponsibility.get(resp.id) ?? [];
                const showLinkedRoles = linked.length > 1; // §5 rule
                return (
                  <Link
                    key={resp.id}
                    href={`/responsibilities/${resp.id}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50"
                    data-testid={`row-responsibility-${resp.id}`}
                  >
                    <CheckSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{resp.name}</p>
                      {showLinkedRoles && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Linked roles: {linked.join(", ")}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* People supporting this role */}
      <section data-testid="section-role-people">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          People supporting this role ({supportingPeople.length})
        </p>
        {supportingPeople.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-xs text-muted-foreground">
              No people linked yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {supportingPeople.map(person => (
                <div
                  key={person.id}
                  className="flex items-center gap-3 px-4 py-3"
                  data-testid={`row-role-person-${person.id}`}
                >
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm">{person.name}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
