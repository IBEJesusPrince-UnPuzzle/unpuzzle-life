import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, ArrowLeft, Fingerprint, Repeat2 } from "lucide-react";
import { Link } from "wouter";
import type { Identity, Area } from "@shared/schema";
import { getPieceColor } from "@/lib/piece-colors";

export default function ProjectsPage() {
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const projectIdentities = identities.filter(i => i.active && i.areaId != null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
            <p className="text-xs mt-1">Projects are derived from active identities linked to an area. Add identities in Clarity.</p>
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
            const pieceColor = getPieceColor((identity as any).puzzlePiece);

            return (
              <Link key={identity.id} href={`/projects/${identity.id}`}>
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  style={(identity as any).puzzlePiece ? { borderLeftColor: pieceColor.accent, borderLeftWidth: "4px" } : {}}
                >
                  <CardContent className="p-4 space-y-1.5">
                    {(identity as any).puzzlePiece && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${pieceColor.bg} ${pieceColor.text}`}>
                          {pieceColor.label}
                        </span>
                      </div>
                    )}
                    {area && (
                      <p className="text-[11px] text-muted-foreground">
                        In the area of <span className="font-medium text-foreground">{areaLabel}</span>...
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      I'm the type of person who will...<span className="font-medium text-foreground">{identity.statement}</span>
                    </p>
                    <div className="flex items-start gap-2">
                      <FolderOpen className="w-4 h-4 text-chart-5 mt-0.5 shrink-0" />
                      <p className="font-medium text-sm hover:text-primary transition-colors">
                        {identity.cue ? `triggered...${identity.cue}` : identity.statement}
                      </p>
                    </div>
                    {identity.timeOfDay && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 mt-1">
                        {identity.timeOfDay}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Link href="/unpuzzle" onClick={(e) => e.stopPropagation()}>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-violet-500/10 transition-colors text-violet-600 dark:text-violet-400 border-violet-500/30">
                          <Fingerprint className="w-3 h-3" /> Identity
                        </Badge>
                      </Link>
                      <Link href={`/routine/${identity.id}`} onClick={(e) => e.stopPropagation()}>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-violet-500/10 transition-colors text-violet-600 dark:text-violet-400 border-violet-500/30">
                          <Repeat2 className="w-3 h-3" /> Routine
                        </Badge>
                      </Link>
                    </div>
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
