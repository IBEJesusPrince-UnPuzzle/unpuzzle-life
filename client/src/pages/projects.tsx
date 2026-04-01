import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { Identity, Area } from "@shared/schema";

export default function ProjectsPage() {
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const projectIdentities = identities.filter(i => i.active && i.areaId != null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-center mb-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-chart-5" />
          Projects
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Auto-generated from your identity chain.
        </p>
      </div>

      {projectIdentities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs mt-1">Projects are derived from active identities linked to an area. Add identities in Horizons.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projectIdentities.map((identity) => {
            const area = areas.find(a => a.id === identity.areaId);
            const category = area?.category || "";
            const areaName = area?.name || "";
            const areaLabel = category === "UnPuzzle"
              ? `${category} ${areaName}`
              : `${areaName} ${category}`;

            return (
              <Link key={identity.id} href={`/projects/${identity.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-1.5">
                    {area && (
                      <p className="text-[11px] text-muted-foreground">
                        In the area of <span className="font-medium text-foreground">{areaLabel}</span>...
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      I'm the type of person who...<span className="font-medium text-foreground">{identity.statement}</span>
                    </p>
                    <div className="flex items-start gap-2">
                      <FolderOpen className="w-4 h-4 text-chart-5 mt-0.5 shrink-0" />
                      <p className="font-medium text-sm hover:text-primary transition-colors">
                        {identity.cue ? `when...${identity.cue}` : identity.statement}
                      </p>
                    </div>
                    {identity.timeOfDay && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 mt-1">
                        {identity.timeOfDay}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
