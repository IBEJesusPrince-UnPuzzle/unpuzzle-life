import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function AgendaPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Calendar surface — coming in Phase 2/3.
        </p>
      </div>

      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Calendar className="w-10 h-10 mx-auto text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            The agenda is being rebuilt as part of the v8 calendar surface.
            Day, 3-Day, Week, and Month views with the recurrence engine
            arrive in upcoming phases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
