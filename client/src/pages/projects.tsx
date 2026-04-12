import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FolderOpen, ArrowLeft, Fingerprint, Repeat2, Search } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import type { Identity, Area } from "@shared/schema";
import { getPieceColor } from "@/lib/piece-colors";

export default function ProjectsPage() {
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const [searchText, setSearchText] = useState("");
  const [filterPiece, setFilterPiece] = useState("");
  const [filterAreaId, setFilterAreaId] = useState("");

  const projectIdentities = useMemo(() => {
    let filtered = identities.filter(i => i.active && i.areaId != null);

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(i => i.statement.toLowerCase().includes(q));
    }

    if (filterPiece && filterPiece !== "all") {
      filtered = filtered.filter(i => i.puzzlePiece === filterPiece);
    }

    if (filterAreaId && filterAreaId !== "all") {
      filtered = filtered.filter(i => i.areaId === Number(filterAreaId));
    }

    return filtered;
  }, [identities, searchText, filterPiece, filterAreaId]);

  const activeAreas = useMemo(() => areas.filter(a => !a.archived), [areas]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="text-sm pl-8 h-9"
          />
        </div>
        <Select value={filterPiece} onValueChange={setFilterPiece}>
          <SelectTrigger className="text-sm w-40 h-9">
            <SelectValue placeholder="All pieces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pieces</SelectItem>
            <SelectItem value="reason">Reason</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="fitness">Fitness</SelectItem>
            <SelectItem value="talent">Talent</SelectItem>
            <SelectItem value="pleasure">Pleasure</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAreaId} onValueChange={setFilterAreaId}>
          <SelectTrigger className="text-sm w-40 h-9">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {activeAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projectIdentities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No projects found</p>
            <p className="text-xs mt-1">
              {identities.length === 0
                ? "Projects are derived from active identities linked to an area. Add identities in Clarity."
                : "Try adjusting your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projectIdentities.map((identity) => {
            const area = areas.find(a => a.id === identity.areaId);
            const areaLabel = area?.name || "";
            const pieceColor = getPieceColor(identity.puzzlePiece);

            return (
              <Link key={identity.id} href={`/projects/${identity.id}`}>
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  style={identity.puzzlePiece ? { borderLeftColor: pieceColor.accent, borderLeftWidth: "4px" } : {}}
                >
                  <CardContent className="p-4 space-y-1.5">
                    {identity.puzzlePiece && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Link href="/unpuzzle" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer ${pieceColor.bg} ${pieceColor.text}`}>
                            {pieceColor.label}
                          </span>
                        </Link>
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
