import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function RolesPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Roles</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Roles, responsibilities, and people — coming in Phase 5.
        </p>
      </div>

      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            The Roles surface (§5, §10, §11, §11a) lands in Phase 5.
            It will let you create and edit roles, assign people,
            and configure recurring responsibilities and their
            support requirements.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
