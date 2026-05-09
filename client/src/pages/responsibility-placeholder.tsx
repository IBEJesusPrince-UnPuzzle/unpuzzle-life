import { Link } from "wouter";
import { ChevronLeft, CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Placeholder for `/responsibilities/:id`.
 *
 * Wired in PR #17 so role-detail tap targets work. Replaced by the real
 * §11 / §11a edit + saved-view pages in PR #18.
 */
export default function ResponsibilityPlaceholderPage({
  params,
}: {
  params: { id?: string };
}) {
  const id = params?.id;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-support"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <h1 className="text-xl font-semibold tracking-tight mt-2 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-muted-foreground" />
          Responsibility
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          ID {id}
        </p>
      </div>

      <Card>
        <CardContent className="p-8 text-center space-y-2">
          <p className="text-sm font-medium">Coming in PR #18</p>
          <p className="text-xs text-muted-foreground">
            The full responsibility edit screen (§11) and compact saved
            view (§11a) land in the next PR.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
