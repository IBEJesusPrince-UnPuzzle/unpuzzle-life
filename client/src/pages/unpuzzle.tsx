import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Puzzle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { PIECE_COLORS, type PieceKey } from "@/lib/piece-colors";
import type { Area, Identity, NonNegotiable, PlannerTask, Project } from "@shared/schema";

const PUZZLE_PIECES: { name: PieceKey; label: string; color: string; descriptor: string }[] = [
  { name: "reason", label: "Reason", color: PIECE_COLORS.reason.accent, descriptor: "Emotions, beliefs & behavior" },
  { name: "finance", label: "Finance", color: PIECE_COLORS.finance.accent, descriptor: "Income, expenses & planning" },
  { name: "fitness", label: "Fitness", color: PIECE_COLORS.fitness.accent, descriptor: "Bodily systems & physical environment" },
  { name: "talent", label: "Talent", color: PIECE_COLORS.talent.accent, descriptor: "Abilities, skills & vocation" },
  { name: "pleasure", label: "Pleasure", color: PIECE_COLORS.pleasure.accent, descriptor: "Desires, satisfactions & enjoyments" },
];

type StatusCounts = { draft: number; project: number; routine: number };

function opacityForStatus(counts: StatusCounts): number {
  const total = counts.draft + counts.project + counts.routine;
  if (total === 0) return 0.35;
  const routineRatio = counts.routine / total;
  const draftRatio = counts.draft / total;
  if (routineRatio >= 0.67) return 1.0;
  if (draftRatio >= 0.67) return 0.45;
  return 0.75;
}

function PuzzleWheel({
  onSelect,
  countsByPiece,
}: {
  onSelect: (piece: PieceKey) => void;
  countsByPiece: Record<PieceKey, StatusCounts>;
}) {
  const cx = 150, cy = 150, r = 110;
  const sliceAngle = (2 * Math.PI) / 5;
  const startOffset = -Math.PI / 2;

  const slices = PUZZLE_PIECES.map((piece, i) => {
    const startAngle = startOffset + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const textR = r * 0.65;
    const tx = cx + textR * Math.cos(midAngle);
    const ty = cy + textR * Math.sin(midAngle);

    const nubR = r + 8;
    const nubX = cx + nubR * Math.cos(midAngle);
    const nubY = cy + nubR * Math.sin(midAngle);

    const d = [
      `M ${cx} ${cy}`,
      `L ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${x2} ${y2}`,
      `Z`,
    ].join(" ");

    const opacity = opacityForStatus(countsByPiece[piece.name]);

    return { ...piece, d, tx, ty, nubX, nubY, opacity };
  });

  return (
    <div className="flex justify-center my-4">
      <svg viewBox="0 0 300 300" style={{ maxWidth: 280, width: "100%", margin: "0 auto" }}>
        {slices.map((s) => (
          <g
            key={s.name}
            onClick={() => onSelect(s.name)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
          >
            <path
              d={s.d}
              fill={s.color}
              fillOpacity={s.opacity}
              stroke="white"
              strokeWidth="2"
              className="transition-opacity hover:opacity-90"
            />
            <circle cx={s.nubX} cy={s.nubY} r={6} fill={s.color} fillOpacity={s.opacity} stroke="white" strokeWidth="1.5" />
            <text
              x={s.tx}
              y={s.ty}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="13"
              fontWeight="bold"
              pointerEvents="none"
            >
              {s.label}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={40} fill="white" stroke="#e5e7eb" strokeWidth="2" />
        <defs>
          <clipPath id="centerClip">
            <circle cx={cx} cy={cy} r={35} />
          </clipPath>
        </defs>
        <image
          href="/unpuzzle-logo.png"
          x={cx - 35} y={cy - 35}
          width="70" height="70"
          clipPath="url(#centerClip)"
        />
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
    project: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    routine: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
  };
  const cls = styles[status] ?? styles.draft;
  return (
    <Badge variant="outline" className={`text-[10px] h-5 px-1.5 uppercase tracking-wide ${cls}`}>
      {status === "routine" && <Check className="w-2.5 h-2.5 mr-0.5" />}
      {status}
    </Badge>
  );
}

function GlobalNonNegotiableCard({ piece }: { piece: PieceKey }) {
  const { data: nonNegotiables = [] } = useQuery<NonNegotiable[]>({
    queryKey: ["/api/non-negotiables"],
  });

  const existing = useMemo(
    () => nonNegotiables.find(n => n.areaId == null && n.puzzlePiece === piece),
    [nonNegotiables, piece]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (isEditing) setText(existing?.statement ?? "");
  }, [isEditing, existing]);

  const pieceInfo = PUZZLE_PIECES.find(p => p.name === piece)!;

  const updateMutation = useMutation({
    mutationFn: (statement: string) =>
      existing
        ? apiRequest("PATCH", `/api/non-negotiables/${existing.id}`, { statement })
        : apiRequest("POST", "/api/non-negotiables", {
            puzzlePiece: piece,
            statement,
            areaId: null,
            createdAt: new Date().toISOString(),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-negotiables"] });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    if (!text.trim()) return;
    updateMutation.mutate(text.trim());
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
      <CardContent className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {pieceInfo.label} boundary
        </p>
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Your ${pieceInfo.label.toLowerCase()} non-negotiable...`}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!text.trim() || updateMutation.isPending}
                onClick={handleSave}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full text-left"
          >
            {existing ? (
              <p className="text-sm font-medium">{existing.statement}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Tap to add your {pieceInfo.label} boundary...
              </p>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function IdentityRow({
  identity,
  areaName,
  pieceColor,
  tasksForIdentity,
}: {
  identity: Identity;
  areaName: string;
  pieceColor: string;
  tasksForIdentity: PlannerTask[];
}) {
  const [, setLocation] = useLocation();
  const status = identity.status ?? "draft";

  const handleTap = () => {
    if (status === "draft") setLocation("/drafts");
    else if (status === "project") setLocation(`/projects/${identity.id}/build`);
  };

  const totalTasks = tasksForIdentity.length;
  const doneTasks = tasksForIdentity.filter(t => t.status === "done").length;

  return (
    <button
      onClick={handleTap}
      className="w-full text-left"
      disabled={status === "routine"}
    >
      <Card className="border-l-4 transition-colors hover:bg-accent/40" style={{ borderLeftColor: pieceColor }}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{areaName}</p>
              <p className="text-sm font-medium">
                <span className="text-muted-foreground">I am someone who </span>
                {identity.statement}
              </p>
              {status === "project" && totalTasks > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {doneTasks}/{totalTasks} tasks done
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBadge status={status} />
              {status !== "routine" && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function PieceDetailView({ piece, onBack }: { piece: PieceKey; onBack: () => void }) {
  const pieceInfo = PUZZLE_PIECES.find(p => p.name === piece)!;

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: plannerTasks = [] } = useQuery<PlannerTask[]>({ queryKey: ["/api/planner-tasks"] });

  const pieceIdentities = useMemo(
    () => identities.filter(i => i.puzzlePiece === piece),
    [identities, piece]
  );

  const identitiesByArea = useMemo(() => {
    const map = new Map<number, Identity[]>();
    for (const id of pieceIdentities) {
      const list = map.get(id.areaId) ?? [];
      list.push(id);
      map.set(id.areaId, list);
    }
    return map;
  }, [pieceIdentities]);

  const tasksByIdentityId = useMemo(() => {
    const map = new Map<number, PlannerTask[]>();
    for (const t of plannerTasks) {
      if (t.identityId == null) continue;
      const list = map.get(t.identityId) ?? [];
      list.push(t);
      map.set(t.identityId, list);
    }
    return map;
  }, [plannerTasks]);

  // Tasks linked via project → identity (fallback for project tasks tracked by projectId)
  const tasksByProjectId = useMemo(() => {
    const map = new Map<number, PlannerTask[]>();
    for (const t of plannerTasks) {
      if (t.projectId == null) continue;
      const list = map.get(t.projectId) ?? [];
      list.push(t);
      map.set(t.projectId, list);
    }
    return map;
  }, [plannerTasks]);

  const tasksForIdentity = (identityId: number): PlannerTask[] => {
    const direct = tasksByIdentityId.get(identityId) ?? [];
    const relatedProjects = projects.filter(p => p.identityId === identityId);
    const projectTasks = relatedProjects.flatMap(p => tasksByProjectId.get(p.id) ?? []);
    const merged = new Map<number, PlannerTask>();
    for (const t of [...direct, ...projectTasks]) merged.set(t.id, t);
    return Array.from(merged.values());
  };

  const orderedAreaIds = Array.from(identitiesByArea.keys()).sort((a, b) => {
    const idxA = areas.findIndex(ar => ar.id === a);
    const idxB = areas.findIndex(ar => ar.id === b);
    return idxA - idxB;
  });

  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to wheel
        </button>

        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: pieceInfo.color }}
            aria-hidden
          />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: pieceInfo.color }}>
              {pieceInfo.label}
            </h1>
            <p className="text-xs text-muted-foreground">{pieceInfo.descriptor}</p>
          </div>
        </div>

        <GlobalNonNegotiableCard piece={piece} />

        {orderedAreaIds.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No identities yet for {pieceInfo.label}. Create one from the wizard or Clarity page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orderedAreaIds.map(areaId => {
              const area = areas.find(a => a.id === areaId);
              const list = identitiesByArea.get(areaId) ?? [];
              if (!area) return null;
              return (
                <div key={areaId} className="space-y-2">
                  <h2 className="text-sm font-semibold text-foreground">{area.name}</h2>
                  <div className="space-y-2">
                    {list.map(id => (
                      <IdentityRow
                        key={id.id}
                        identity={id}
                        areaName={area.name}
                        pieceColor={pieceInfo.color}
                        tasksForIdentity={tasksForIdentity(id.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnPuzzlePage() {
  const [piece, setPiece] = useState<PieceKey | null>(null);

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });

  const countsByPiece = useMemo<Record<PieceKey, StatusCounts>>(() => {
    const init = (): StatusCounts => ({ draft: 0, project: 0, routine: 0 });
    const counts: Record<PieceKey, StatusCounts> = {
      reason: init(), finance: init(), fitness: init(), talent: init(), pleasure: init(),
    };
    for (const id of identities) {
      const key = (id.puzzlePiece as PieceKey | undefined);
      if (!key || !(key in counts)) continue;
      const status = (id.status ?? "draft") as keyof StatusCounts;
      if (status in counts[key]) counts[key][status]++;
    }
    return counts;
  }, [identities]);

  const handleSelectPiece = (p: PieceKey) => {
    setPiece(p);
  };

  const handleBack = () => {
    setPiece(null);
  };

  if (piece) {
    return <PieceDetailView piece={piece} onBack={handleBack} />;
  }

  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-primary" /> UnPuzzle
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your life, fully assembled. Tap a piece to see its identities.
          </p>
        </div>

        <PuzzleWheel onSelect={handleSelectPiece} countsByPiece={countsByPiece} />

        <div className="space-y-2">
          {PUZZLE_PIECES.map(p => {
            const c = countsByPiece[p.name];
            const total = c.draft + c.project + c.routine;
            return (
              <button
                key={p.name}
                onClick={() => handleSelectPiece(p.name)}
                className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors border-l-4"
                style={{ borderLeftColor: p.color }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.descriptor}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {total === 0 ? (
                    <span className="text-[11px] text-muted-foreground">No identities yet</span>
                  ) : (
                    <>
                      {c.draft > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30">
                          {c.draft} draft
                        </Badge>
                      )}
                      {c.project > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                          {c.project} project
                        </Badge>
                      )}
                      {c.routine > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                          {c.routine} routine
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
