import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { SupportAddSheet } from "@/components/support-add-sheet";
import type { Role, ResponsibilityRole } from "@shared/schema";

type RoleWithPeople = Role & { people: { id: number; personId: number }[] };

/**
 * /support/roles — full Roles list.
 *
 * Locked by addendum A2.3: stacked cards, each showing role name and
 * "N responsibilities · M people".
 */
export default function SupportRolesPage() {
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const { data: roles = [] } = useQuery<RoleWithPeople[]>({
    queryKey: ["/api/roles"],
  });
  const { data: respRoleLinks = [] } = useQuery<ResponsibilityRole[]>({
    queryKey: ["/api/responsibility-roles"],
  });

  // Map: roleId -> count of responsibilities linked to that role
  const respCountByRole = useMemo(() => {
    const counts = new Map<number, number>();
    for (const link of respRoleLinks) {
      counts.set(link.roleId, (counts.get(link.roleId) ?? 0) + 1);
    }
    return counts;
  }, [respRoleLinks]);

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
                <Users className="w-5 h-5 text-chart-3" />
                Roles
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                The hats you wear
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddSheetOpen(true)}
              className="h-9 w-9 p-0 shrink-0"
              data-testid="button-add-role"
              aria-label="Add role"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {roles.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No roles yet</p>
              <p className="text-xs mt-1">Tap [+] to add one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {roles.map(role => {
              const respCount = respCountByRole.get(role.id) ?? 0;
              const peopleCount = role.people?.length ?? 0;
              const parts: string[] = [];
              parts.push(`${respCount} responsibilit${respCount === 1 ? "y" : "ies"}`);
              parts.push(`${peopleCount} ${peopleCount === 1 ? "person" : "people"}`);
              return (
                <Link
                  key={role.id}
                  href={`/support/roles/${role.id}`}
                  data-testid={`row-role-${role.id}`}
                >
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Users className="w-4 h-4 text-chart-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{role.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {parts.join(" · ")}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <SupportAddSheet open={addSheetOpen} onOpenChange={setAddSheetOpen} />
    </>
  );
}

