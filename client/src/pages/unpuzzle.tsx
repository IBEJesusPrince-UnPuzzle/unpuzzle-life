import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Puzzle, ChevronLeft, Plus, Brain, ChevronDown, ChevronUp, Star,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import type { Area, Identity, Belief, AntiHabit, ImmutableLaw } from "@shared/schema";

// ============================================================
// CONSTANTS
// ============================================================

type PuzzlePiece = "reason" | "finance" | "fitness" | "talent" | "pleasure";

const PUZZLE_PIECES: { name: PuzzlePiece; label: string; color: string; descriptor: string }[] = [
  { name: "reason", label: "Reason", color: "#7C3AED", descriptor: "Purpose, beliefs & principles" },
  { name: "finance", label: "Finance", color: "#16A34A", descriptor: "Money, assets & abundance" },
  { name: "fitness", label: "Fitness", color: "#2563EB", descriptor: "Health, energy & longevity" },
  { name: "talent", label: "Talent", color: "#CA8A04", descriptor: "Skills, work & contribution" },
  { name: "pleasure", label: "Pleasure", color: "#DC2626", descriptor: "Joy, relationships & play" },
];

const TIME_OF_DAY_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "midday", label: "Midday" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "any_time", label: "Any time" },
];

// ============================================================
// PUZZLE WHEEL SVG
// ============================================================

function PuzzleWheel({ onSelect }: { onSelect: (piece: PuzzlePiece) => void }) {
  const cx = 150, cy = 150, r = 110;
  const sliceAngle = (2 * Math.PI) / 5;
  const startOffset = -Math.PI / 2; // start from top

  const slices = PUZZLE_PIECES.map((piece, i) => {
    const startAngle = startOffset + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    // Text position at ~65% radius
    const textR = r * 0.65;
    const tx = cx + textR * Math.cos(midAngle);
    const ty = cy + textR * Math.sin(midAngle);

    // Nub on outer arc (small bump)
    const nubAngle = midAngle;
    const nubR = r + 8;
    const nubX = cx + nubR * Math.cos(nubAngle);
    const nubY = cy + nubR * Math.sin(nubAngle);

    const d = [
      `M ${cx} ${cy}`,
      `L ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${x2} ${y2}`,
      `Z`,
    ].join(" ");

    return { ...piece, d, tx, ty, nubX, nubY, startAngle, endAngle };
  });

  return (
    <div className="flex justify-center my-4">
      <svg
        viewBox="0 0 300 300"
        style={{ maxWidth: 280, width: "100%", margin: "0 auto" }}
      >
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
              stroke="white"
              strokeWidth="2"
              className="transition-opacity hover:opacity-80"
            />
            {/* Nub on outer arc */}
            <circle cx={s.nubX} cy={s.nubY} r={6} fill={s.color} stroke="white" strokeWidth="1.5" />
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
        {/* Center circle with brain icon */}
        <circle cx={cx} cy={cy} r={40} fill="white" stroke="#e5e7eb" strokeWidth="2" />
        <foreignObject x={cx - 14} y={cy - 14} width={28} height={28}>
          <div className="flex items-center justify-center w-full h-full">
            <Brain className="w-6 h-6 text-gray-600" />
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}

// ============================================================
// IDENTITY FORM (reusable — also used in wizard.tsx)
// ============================================================

export function IdentityForm({
  puzzlePiece,
  showPieceSelector,
  areas,
  onSuccess,
}: {
  puzzlePiece?: PuzzlePiece;
  showPieceSelector?: boolean;
  areas: Area[];
  onSuccess?: () => void;
}) {
  const [piece, setPiece] = useState<PuzzlePiece | "">(puzzlePiece || "");
  const [areaId, setAreaId] = useState<string>("");
  const [response, setResponse] = useState("");
  const [environmentType, setEnvironmentType] = useState<"person" | "place" | "thing" | "">("");

  // Person fields
  const [envPersonName, setEnvPersonName] = useState("");
  const [envPersonContactMethod, setEnvPersonContactMethod] = useState("");
  const [envPersonContactInfo, setEnvPersonContactInfo] = useState("");
  const [envPersonWhy, setEnvPersonWhy] = useState("");

  // Place fields
  const [envPlaceName, setEnvPlaceName] = useState("");
  const [envPlaceAddress, setEnvPlaceAddress] = useState("");
  const [envPlaceTravelMethod, setEnvPlaceTravelMethod] = useState("");
  const [envPlaceWhy, setEnvPlaceWhy] = useState("");

  // Thing fields
  const [envThingName, setEnvThingName] = useState("");
  const [envThingUsage, setEnvThingUsage] = useState("");
  const [envThingWhy, setEnvThingWhy] = useState("");

  const [cue, setCue] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [location, setLocation] = useState("");
  const [craving, setCraving] = useState("");
  const [reward, setReward] = useState("");

  const activePiece = puzzlePiece || (piece as PuzzlePiece);

  const filteredAreas = useMemo(() => {
    if (!activePiece) return areas;
    const matched = areas.filter(a => a.puzzlePiece === activePiece);
    return matched.length > 0 ? matched : areas;
  }, [areas, activePiece]);

  const createIdentity = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/identities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      // Reset form
      setResponse("");
      setEnvironmentType("");
      setEnvPersonName(""); setEnvPersonContactMethod(""); setEnvPersonContactInfo(""); setEnvPersonWhy("");
      setEnvPlaceName(""); setEnvPlaceAddress(""); setEnvPlaceTravelMethod(""); setEnvPlaceWhy("");
      setEnvThingName(""); setEnvThingUsage(""); setEnvThingWhy("");
      setCue(""); setTimeOfDay(""); setLocation(""); setCraving(""); setReward("");
      if (!puzzlePiece) setPiece("");
      setAreaId("");
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    if (!response.trim() || !activePiece) return;

    const data: Record<string, unknown> = {
      statement: response,
      areaId: areaId ? Number(areaId) : null,
      puzzlePiece: activePiece,
      cue: cue || null,
      timeOfDay: timeOfDay || null,
      location: location || null,
      craving: craving || null,
      reward: reward || null,
      environmentType: environmentType || null,
      envPersonName: envPersonName || null,
      envPersonContactMethod: envPersonContactMethod || null,
      envPersonContactInfo: envPersonContactInfo || null,
      envPersonWhy: envPersonWhy || null,
      envPlaceName: envPlaceName || null,
      envPlaceAddress: envPlaceAddress || null,
      envPlaceTravelMethod: envPlaceTravelMethod || null,
      envPlaceWhy: envPlaceWhy || null,
      envThingName: envThingName || null,
      envThingUsage: envThingUsage || null,
      envThingWhy: envThingWhy || null,
      frequency: JSON.stringify({ type: "daily", interval: 1 }),
      targetCount: 1,
      active: 1,
      createdAt: new Date().toISOString(),
    };

    createIdentity.mutate(data);
  };

  const pieceInfo = PUZZLE_PIECES.find(p => p.name === activePiece);

  return (
    <div className="space-y-4">
      {/* 1. Puzzle Piece */}
      {showPieceSelector ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Puzzle Piece</label>
          <div className="flex gap-1.5 flex-wrap">
            {PUZZLE_PIECES.map(p => (
              <button
                key={p.name}
                onClick={() => setPiece(p.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  piece === p.name
                    ? "text-white border-transparent"
                    : "bg-background text-foreground border-border hover:border-gray-400"
                }`}
                style={piece === p.name ? { backgroundColor: p.color } : {}}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : puzzlePiece && pieceInfo ? (
        <p className="text-sm font-medium" style={{ color: pieceInfo.color }}>
          For your {pieceInfo.label} piece
        </p>
      ) : null}

      {/* 2. Area */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">In the area of...</label>
        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Select an area" />
          </SelectTrigger>
          <SelectContent>
            {filteredAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 3. Response (identity statement) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          I'm the type of person who will...
        </label>
        <Input
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder="e.g. exercise before breakfast, read daily, track every dollar"
          className="text-sm"
        />
      </div>

      {/* 4. Environment */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          My environment for this identity...
        </label>
        <div className="flex gap-1.5">
          {(["person", "place", "thing"] as const).map(t => (
            <button
              key={t}
              onClick={() => setEnvironmentType(environmentType === t ? "" : t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                environmentType === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-accent"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {environmentType === "person" && (
          <div className="mt-3 space-y-2">
            <Input value={envPersonName} onChange={e => setEnvPersonName(e.target.value)} placeholder="Who is this person?" className="text-sm" />
            <Select value={envPersonContactMethod} onValueChange={setEnvPersonContactMethod}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Contact method" /></SelectTrigger>
              <SelectContent>
                {["Call", "Text", "Email", "In-person", "Video"].map(m => (
                  <SelectItem key={m} value={m.toLowerCase()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={envPersonContactInfo} onChange={e => setEnvPersonContactInfo(e.target.value)} placeholder="Phone / email / etc." className="text-sm" />
            <Input value={envPersonWhy} onChange={e => setEnvPersonWhy(e.target.value)} placeholder="Why does this person matter to this identity?" className="text-sm" />
          </div>
        )}

        {environmentType === "place" && (
          <div className="mt-3 space-y-2">
            <Input value={envPlaceName} onChange={e => setEnvPlaceName(e.target.value)} placeholder="What is this place called?" className="text-sm" />
            <Input value={envPlaceAddress} onChange={e => setEnvPlaceAddress(e.target.value)} placeholder="Address (optional)" className="text-sm" />
            <Select value={envPlaceTravelMethod} onValueChange={setEnvPlaceTravelMethod}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Travel method" /></SelectTrigger>
              <SelectContent>
                {["Drive", "Walk", "Transit", "Remote"].map(m => (
                  <SelectItem key={m} value={m.toLowerCase()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={envPlaceWhy} onChange={e => setEnvPlaceWhy(e.target.value)} placeholder="Why does this place matter?" className="text-sm" />
          </div>
        )}

        {environmentType === "thing" && (
          <div className="mt-3 space-y-2">
            <Input value={envThingName} onChange={e => setEnvThingName(e.target.value)} placeholder="What is this thing?" className="text-sm" />
            <Input value={envThingUsage} onChange={e => setEnvThingUsage(e.target.value)} placeholder="How will you use it?" className="text-sm" />
            <Input value={envThingWhy} onChange={e => setEnvThingWhy(e.target.value)} placeholder="Why does it matter?" className="text-sm" />
          </div>
        )}
      </div>

      {/* 5. Cue */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">...triggered...</label>
        <Input
          value={cue}
          onChange={e => setCue(e.target.value)}
          placeholder="before/after [event] e.g. before bed, after lunch, while commuting"
          className="text-sm"
        />
      </div>

      {/* 6. Time of Day */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">...in the...</label>
        <Select value={timeOfDay} onValueChange={setTimeOfDay}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Select time of day" />
          </SelectTrigger>
          <SelectContent>
            {TIME_OF_DAY_OPTIONS.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 7. Location */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Where will this take place?
        </label>
        <Input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="e.g. kitchen table, home gym, back porch, office desk"
          className="text-sm"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          The backdrop where this identity plays out day-to-day
        </p>
      </div>

      {/* 8. Craving */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">...because I...</label>
        <Input
          value={craving}
          onChange={e => setCraving(e.target.value)}
          placeholder="e.g. want more energy, crave financial peace, need to feel strong"
          className="text-sm"
        />
      </div>

      {/* 9. Reward */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          ...so this makes sure I'll have...
        </label>
        <Input
          value={reward}
          onChange={e => setReward(e.target.value)}
          placeholder="e.g. clean floors, balanced books, 10% body fat"
          className="text-sm"
        />
      </div>

      <Button
        className="w-full h-9"
        disabled={!response.trim() || !activePiece || createIdentity.isPending}
        onClick={handleSubmit}
      >
        {createIdentity.isPending ? "Creating..." : "Create Identity"}
      </Button>
    </div>
  );
}

// ============================================================
// PIECE DETAIL VIEW
// ============================================================

function PieceDetailView({
  piece,
  onBack,
}: {
  piece: PuzzlePiece;
  onBack: () => void;
}) {
  const pieceInfo = PUZZLE_PIECES.find(p => p.name === piece)!;

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: beliefsData = [] } = useQuery<Belief[]>({ queryKey: ["/api/beliefs"] });
  const { data: antiHabitsData = [] } = useQuery<AntiHabit[]>({ queryKey: ["/api/anti-habits"] });
  const { data: lawsData = [] } = useQuery<ImmutableLaw[]>({ queryKey: ["/api/immutable-laws"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const pieceIdentities = useMemo(() => identities.filter(i => i.puzzlePiece === piece), [identities, piece]);
  const pieceBeliefs = useMemo(() => beliefsData.filter(b => b.puzzlePiece === piece), [beliefsData, piece]);
  const pieceAntiHabits = useMemo(() => antiHabitsData.filter(a => a.puzzlePiece === piece), [antiHabitsData, piece]);
  const pieceLaws = useMemo(() => lawsData.filter(l => l.puzzlePiece === piece), [lawsData, piece]);

  const [showIdentityForm, setShowIdentityForm] = useState(false);
  const [showBeliefForm, setShowBeliefForm] = useState(false);
  const [showAntiHabitForm, setShowAntiHabitForm] = useState(false);
  const [showLawForm, setShowLawForm] = useState(false);

  const [showAllIdentities, setShowAllIdentities] = useState(false);
  const [showAllBeliefs, setShowAllBeliefs] = useState(false);
  const [showAllAntiHabits, setShowAllAntiHabits] = useState(false);
  const [showAllLaws, setShowAllLaws] = useState(false);

  const activeAreas = useMemo(() => areas.filter(a => !a.archived), [areas]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">
        {/* Back + header */}
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to wheel
        </button>

        <div className="rounded-lg p-1" style={{ backgroundColor: pieceInfo.color }}>
          <div className="bg-background rounded-md px-4 py-3">
            <h1 className="text-xl font-bold" style={{ color: pieceInfo.color }}>{pieceInfo.label}</h1>
            <p className="text-sm text-muted-foreground">{pieceInfo.descriptor}</p>
          </div>
        </div>

        {/* Identities section */}
        <Section
          title="Identities"
          count={pieceIdentities.length}
          showAll={showAllIdentities}
          onToggleShowAll={() => setShowAllIdentities(!showAllIdentities)}
        >
          {(showAllIdentities ? pieceIdentities : pieceIdentities.slice(0, 3)).map(id => (
            <Card key={id.id} className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
              <CardContent className="p-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">I'm the type of person who</span>{" "}
                  <span className="font-medium">{id.statement}</span>
                </p>
                {id.cue && <p className="text-[11px] text-muted-foreground mt-0.5">triggered {id.cue}</p>}
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowIdentityForm(!showIdentityForm)}>
            <Plus className="w-3.5 h-3.5" /> Add Identity
          </Button>
          {showIdentityForm && (
            <Card className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
              <CardContent className="p-4">
                <IdentityForm
                  puzzlePiece={piece}
                  areas={activeAreas}
                  onSuccess={() => setShowIdentityForm(false)}
                />
              </CardContent>
            </Card>
          )}
        </Section>

        {/* Beliefs section */}
        <Section
          title="Beliefs"
          count={pieceBeliefs.length}
          showAll={showAllBeliefs}
          onToggleShowAll={() => setShowAllBeliefs(!showAllBeliefs)}
        >
          {(showAllBeliefs ? pieceBeliefs : pieceBeliefs.slice(0, 3)).map(b => (
            <Card key={b.id} className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground line-through">{b.oldBelief}</p>
                <p className="text-sm font-medium mt-0.5">{b.newBelief}</p>
                {b.whyItMatters && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{b.whyItMatters}</p>}
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowBeliefForm(!showBeliefForm)}>
            <Plus className="w-3.5 h-3.5" /> Add Belief
          </Button>
          {showBeliefForm && (
            <BeliefForm piece={piece} areas={activeAreas} color={pieceInfo.color} onSuccess={() => setShowBeliefForm(false)} />
          )}
        </Section>

        {/* Anti-Habits section */}
        <Section
          title="Anti-Habits"
          count={pieceAntiHabits.length}
          showAll={showAllAntiHabits}
          onToggleShowAll={() => setShowAllAntiHabits(!showAllAntiHabits)}
        >
          {(showAllAntiHabits ? pieceAntiHabits : pieceAntiHabits.slice(0, 3)).map(a => (
            <Card key={a.id} className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
              <CardContent className="p-3">
                <p className="text-sm font-medium">{a.title}</p>
                {a.makeInvisible && <p className="text-[11px] text-muted-foreground mt-0.5">Remove cue: {a.makeInvisible}</p>}
                {a.makeDifficult && <p className="text-[11px] text-muted-foreground">Add friction: {a.makeDifficult}</p>}
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowAntiHabitForm(!showAntiHabitForm)}>
            <Plus className="w-3.5 h-3.5" /> Add Anti-Habit
          </Button>
          {showAntiHabitForm && (
            <AntiHabitForm piece={piece} color={pieceInfo.color} onSuccess={() => setShowAntiHabitForm(false)} />
          )}
        </Section>

        {/* Immutable Laws section */}
        <Section
          title="Immutable Laws"
          count={pieceLaws.length}
          showAll={showAllLaws}
          onToggleShowAll={() => setShowAllLaws(!showAllLaws)}
        >
          {(showAllLaws ? pieceLaws : pieceLaws.slice(0, 3)).map(law => {
            const LEVEL_BADGE: Record<number, { label: string; className: string }> = {
              1: { label: "Awareness", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
              2: { label: "Friction",  className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
              3: { label: "Block",     className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
            };
            const levelBadge = LEVEL_BADGE[law.enforcementLevel ?? 1] ?? LEVEL_BADGE[1];
            return (
              <Card key={law.id} className="border-l-4" style={{ borderLeftColor: pieceInfo.color }}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{law.title}</p>
                    <Badge variant="outline" className={`text-[9px] h-4 px-1 ${levelBadge.className}`}>
                      {levelBadge.label}
                    </Badge>
                    {law.isRedLine === 1 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" title="Red line" />
                    )}
                    {law.isPrimary === 1 && (
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{law.statement}</p>
                  {law.whyItMatters && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{law.whyItMatters}</p>}
                </CardContent>
              </Card>
            );
          })}
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowLawForm(!showLawForm)}>
            <Plus className="w-3.5 h-3.5" /> Add Law
          </Button>
          {showLawForm && (
            <LawForm piece={piece} color={pieceInfo.color} onSuccess={() => setShowLawForm(false)} />
          )}
        </Section>
      </div>
    </div>
  );
}

// ============================================================
// SECTION WRAPPER
// ============================================================

function Section({
  title,
  count,
  showAll,
  onToggleShowAll,
  children,
}: {
  title: string;
  count: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {count > 3 && (
          <button onClick={onToggleShowAll} className="text-xs text-primary flex items-center gap-0.5">
            {showAll ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show all ({count}) <ChevronDown className="w-3 h-3" /></>}
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ============================================================
// BELIEF FORM (inline)
// ============================================================

function BeliefForm({
  piece,
  areas,
  color,
  onSuccess,
}: {
  piece: PuzzlePiece;
  areas: Area[];
  color: string;
  onSuccess: () => void;
}) {
  const [oldBelief, setOldBelief] = useState("");
  const [newBelief, setNewBelief] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [areaId, setAreaId] = useState("");

  const filteredAreas = useMemo(() => {
    const matched = areas.filter(a => a.puzzlePiece === piece);
    return matched.length > 0 ? matched : areas;
  }, [areas, piece]);

  const createBelief = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/beliefs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/beliefs"] });
      setOldBelief(""); setNewBelief(""); setWhyItMatters(""); setAreaId("");
      onSuccess();
    },
  });

  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4 space-y-3">
        <Input value={oldBelief} onChange={e => setOldBelief(e.target.value)} placeholder="A belief I'm replacing..." className="text-sm" />
        <Input value={newBelief} onChange={e => setNewBelief(e.target.value)} placeholder="I now choose to believe..." className="text-sm" />
        <Textarea value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)} placeholder="Why this matters... (optional)" className="text-sm min-h-[60px]" />
        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="Area (optional)" /></SelectTrigger>
          <SelectContent>
            {filteredAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="w-full h-9"
          disabled={!oldBelief.trim() || !newBelief.trim() || createBelief.isPending}
          onClick={() => createBelief.mutate({
            puzzlePiece: piece,
            oldBelief,
            newBelief,
            whyItMatters: whyItMatters || null,
            areaId: areaId ? Number(areaId) : null,
            active: 1,
            createdAt: new Date().toISOString(),
          })}
        >
          {createBelief.isPending ? "Saving..." : "Save Belief"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// ANTI-HABIT FORM (inline)
// ============================================================

function AntiHabitForm({
  piece,
  color,
  onSuccess,
}: {
  piece: PuzzlePiece;
  color: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [whatToDoInstead, setWhatToDoInstead] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");

  const createAntiHabit = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/anti-habits", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anti-habits"] });
      setName(""); setTrigger(""); setWhatToDoInstead(""); setWhyItMatters("");
      onSuccess();
    },
  });

  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4 space-y-3">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="The habit I'm breaking..." className="text-sm" />
        <Input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="It usually happens when..." className="text-sm" />
        <Input value={whatToDoInstead} onChange={e => setWhatToDoInstead(e.target.value)} placeholder="Instead, I will..." className="text-sm" />
        <Input value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)} placeholder="Because... (optional)" className="text-sm" />
        <Button
          className="w-full h-9"
          disabled={!name.trim() || createAntiHabit.isPending}
          onClick={() => createAntiHabit.mutate({
            puzzlePiece: piece,
            title: name,
            makeInvisible: trigger || null,
            makeDifficult: whatToDoInstead || null,
            description: whyItMatters || null,
            active: 1,
            createdAt: new Date().toISOString(),
          })}
        >
          {createAntiHabit.isPending ? "Saving..." : "Save Anti-Habit"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// LAW FORM (inline)
// ============================================================

function LawForm({
  piece,
  color,
  onSuccess,
}: {
  piece: PuzzlePiece;
  color: string;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [enforcementLevel, setEnforcementLevel] = useState<1 | 2 | 3>(1);
  const [isRedLine, setIsRedLine] = useState(false);
  const [isPrimary, setIsPrimary] = useState(false);

  const createLaw = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/immutable-laws", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/immutable-laws"] });
      setTitle(""); setStatement(""); setWhyItMatters("");
      setEnforcementLevel(1); setIsRedLine(false); setIsPrimary(false);
      onSuccess();
    },
  });

  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4 space-y-3">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Name this law (short)" className="text-sm" />
        <Textarea value={statement} onChange={e => setStatement(e.target.value)} placeholder="e.g. I will not sacrifice sleep for productivity" className="text-sm min-h-[60px]" />
        <Input value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)} placeholder="Why this protects you (optional)" className="text-sm" />

        {/* Enforcement level toggle */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enforcement level</label>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map(level => {
              const labels: Record<number, string> = { 1: "1 · Awareness", 2: "2 · Friction", 3: "3 · Block" };
              const colors: Record<number, string> = {
                1: "bg-amber-500 text-white border-amber-500",
                2: "bg-orange-500 text-white border-orange-500",
                3: "bg-red-500 text-white border-red-500",
              };
              return (
                <button
                  key={level}
                  onClick={() => setEnforcementLevel(level)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    enforcementLevel === level
                      ? colors[level]
                      : "bg-background text-foreground border-border hover:bg-accent"
                  }`}
                >
                  {labels[level]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Checkboxes */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isRedLine} onChange={e => setIsRedLine(e.target.checked)} className="rounded" />
            This is a red line (hard boundary)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className="rounded" />
            Set as primary law for this piece
          </label>
        </div>

        <Button
          className="w-full h-9"
          disabled={!title.trim() || !statement.trim() || createLaw.isPending}
          onClick={() => createLaw.mutate({
            puzzlePiece: piece,
            title,
            statement,
            whyItMatters: whyItMatters || null,
            enforcementLevel: Number(enforcementLevel),
            isRedLine: isRedLine ? 1 : 0,
            isPrimary: isPrimary ? 1 : 0,
            linkedIdentityIds: null,
            triggerConditions: null,
            active: 1,
            createdAt: new Date().toISOString(),
          })}
        >
          {createLaw.isPending ? "Saving..." : "Save Law"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// MAIN UNPUZZLE PAGE
// ============================================================

type ViewState = { type: "hub" } | { type: "piece"; piece: PuzzlePiece };

export default function UnPuzzlePage() {
  const [view, setView] = useState<ViewState>({ type: "hub" });

  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: beliefs = [] } = useQuery<Belief[]>({ queryKey: ["/api/beliefs"] });
  const { data: antiHabits = [] } = useQuery<AntiHabit[]>({ queryKey: ["/api/anti-habits"] });
  const { data: laws = [] } = useQuery<ImmutableLaw[]>({ queryKey: ["/api/immutable-laws"] });

  if (view.type === "piece") {
    return <PieceDetailView piece={view.piece} onBack={() => setView({ type: "hub" })} />;
  }

  const getCounts = (pieceName: string) => ({
    identities: identities.filter(i => i.puzzlePiece === pieceName).length,
    beliefs: beliefs.filter(b => b.puzzlePiece === pieceName).length,
    antiHabits: antiHabits.filter(a => a.puzzlePiece === pieceName).length,
    laws: laws.filter(l => l.puzzlePiece === pieceName).length,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-primary" /> UnPuzzle
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your life, fully assembled. Build each piece with intention.
          </p>
        </div>

        {/* Puzzle Wheel */}
        <PuzzleWheel onSelect={(piece) => setView({ type: "piece", piece })} />

        {/* Piece Cards */}
        <div className="space-y-2">
          {PUZZLE_PIECES.map(p => {
            const counts = getCounts(p.name);
            return (
              <button
                key={p.name}
                onClick={() => setView({ type: "piece", piece: p.name })}
                className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors border-l-4"
                style={{ borderLeftColor: p.color }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.descriptor}</p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {counts.identities} identities &middot; {counts.beliefs} beliefs &middot; {counts.antiHabits} anti-habits &middot; {counts.laws} laws
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
