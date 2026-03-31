import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Puzzle, ChevronRight, ChevronLeft, Plus, Trash2, Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import type { Area, Identity } from "@shared/schema";
import { RecurrenceBuilder } from "./planner";
import { TIME_OF_DAY_CATEGORIES } from "./habits";

// ============================================================
// TYPES
// ============================================================

interface PrincipleCard {
  statement: string;
  alwaysNever: string;
  testScenarios: string[];
  violationSignal: string;
  courseCorrect: string;
}

interface AnchorMoment {
  lifePiece: string;
  scene: string;
}

const ANCHOR_PIECES = [
  { key: "mindfulness", emoji: "\u{1F9E0}", label: "Mindfulness", prompt: "Describe a moment in your ideal day that proves mindfulness is in place" },
  { key: "finances", emoji: "\u{1F4B0}", label: "Finances", prompt: "Describe a moment that proves your finances support your ideal life" },
  { key: "fitness", emoji: "\u{1F4AA}", label: "Physical Fitness", prompt: "Describe a moment that proves your body is performing at its best" },
  { key: "career", emoji: "\u2728", label: "Career/Talents", prompt: "Describe a moment that proves your vocation supports your ideal life" },
  { key: "joys", emoji: "\u{1F389}", label: "Joys/Pleasures", prompt: "Describe a moment that proves you're rewarding yourself for being you" },
];

const CATEGORY_ORDER = ["UnPuzzle", "Chores", "Routines", "Roles & Responsibilities", "Getting Things Done", "Other"];

const PHASES = [
  { num: 1, title: "Purpose & Principles", subtitle: "The corner pieces and edge frame \u2014 the immutable laws everything else clicks into" },
  { num: 2, title: "Vision", subtitle: "Step into your completed puzzle \u2014 walk through an ordinary day in your ideal life" },
  { num: 3, title: "Responsibilities & Areas", subtitle: "The major sections and sub-assemblies \u2014 decide which parts of your life structure matter" },
  { num: 4, title: "Identity & Habits", subtitle: "The detailed, interlocking pieces \u2014 where the science meets the art" },
];

// ============================================================
// MAIN WIZARD PAGE
// ============================================================

export default function WizardPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState(1);

  // Phase 1 state
  const [purposeStatement, setPurposeStatement] = useState("");
  const [principles, setPrinciples] = useState<PrincipleCard[]>([{
    statement: "", alwaysNever: "", testScenarios: ["", "", ""], violationSignal: "", courseCorrect: "",
  }]);

  // Phase 2 state
  const [visionTitle, setVisionTitle] = useState("");
  const [visionJournal, setVisionJournal] = useState("");
  const [anchorMoments, setAnchorMoments] = useState<AnchorMoment[]>(
    ANCHOR_PIECES.map(p => ({ lifePiece: p.key, scene: "" }))
  );

  // Phase 4 state
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [identityText, setIdentityText] = useState("");
  const [habitCue, setHabitCue] = useState("");
  const [habitTimeOfDay, setHabitTimeOfDay] = useState("");
  const [habitRecurrence, setHabitRecurrence] = useState<string | null>(JSON.stringify({ type: "daily", interval: 1 }));
  const [habitBecause, setHabitBecause] = useState("");
  const [habitReward, setHabitReward] = useState("");

  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: identitiesData = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });

  // Save wizard phase progress
  const saveWizardPhase = useMutation({
    mutationFn: (p: number) => apiRequest("PATCH", "/api/wizard-state", { currentPhase: p }),
  });

  // Phase 1: save purpose
  const savePurpose = useMutation({
    mutationFn: () => apiRequest("POST", "/api/purposes", {
      statement: purposeStatement,
      principles: JSON.stringify(principles.filter(p => p.statement.trim())),
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/purposes"] }),
  });

  // Phase 2: save vision
  const saveVision = useMutation({
    mutationFn: () => apiRequest("POST", "/api/visions", {
      title: visionTitle,
      description: visionJournal,
      status: "active",
      createdAt: new Date().toISOString(),
      anchorMoments: JSON.stringify(anchorMoments.filter(a => a.scene.trim())),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/visions"] }),
  });

  // Phase 3: toggle area archived
  const toggleArea = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: number }) =>
      apiRequest("PATCH", `/api/areas/${id}`, { archived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  // Phase 4: create identity
  const createIdentity = useMutation({
    mutationFn: (data: { statement: string; areaId: number }) =>
      apiRequest("POST", "/api/identities", {
        ...data,
        visionId: null,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/identities"] }),
  });

  // Phase 4: create habit
  const createHabit = useMutation({
    mutationFn: (data: { name: string; identityId: number; areaId: number | null; cue: string; timeOfDay: string; recurrence: string; craving: string; reward: string }) =>
      apiRequest("POST", "/api/habits", {
        name: data.name,
        identityId: data.identityId,
        areaId: data.areaId,
        cue: data.cue || null,
        craving: data.craving || null,
        response: data.name,
        reward: data.reward || null,
        frequency: data.recurrence || JSON.stringify({ type: "daily", interval: 1 }),
        timeOfDay: data.timeOfDay || null,
        targetCount: 1,
        active: 1,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      setHabitCue(""); setHabitTimeOfDay(""); setHabitBecause(""); setHabitReward("");
      setHabitRecurrence(JSON.stringify({ type: "daily", interval: 1 }));
    },
  });

  // Complete wizard
  const completeWizard = useMutation({
    mutationFn: () => apiRequest("POST", "/api/wizard/complete"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wizard-state"] });
      navigate("/");
    },
  });

  const goNext = async () => {
    if (phase === 1 && purposeStatement.trim()) {
      await savePurpose.mutateAsync();
    }
    if (phase === 2 && visionTitle.trim()) {
      await saveVision.mutateAsync();
    }
    if (phase < 4) {
      const next = phase + 1;
      setPhase(next);
      saveWizardPhase.mutate(next);
    }
  };

  const goBack = () => {
    if (phase > 1) {
      const prev = phase - 1;
      setPhase(prev);
      saveWizardPhase.mutate(prev);
    }
  };

  const canAdvance = () => {
    if (phase === 1) return purposeStatement.trim().length > 0;
    if (phase === 2) return visionTitle.trim().length > 0;
    return true;
  };

  // Group areas by category
  const groupedAreas = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    areas.forEach(a => {
      const cat = a.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    return groups;
  }, [areas]);

  // Active areas (for phase 4)
  const activeAreas = useMemo(() => areas.filter(a => !a.archived), [areas]);
  const activeGroupedAreas = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    activeAreas.forEach(a => {
      const cat = a.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    return groups;
  }, [activeAreas]);

  // Identities for the selected area
  const areaIdentities = useMemo(() =>
    identitiesData.filter(i => i.areaId === selectedAreaId),
    [identitiesData, selectedAreaId]
  );

  const currentPhase = PHASES[phase - 1];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="bg-card border-b px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1">
            {PHASES.map((p, i) => (
              <div key={p.num} className="flex items-center flex-1">
                <button
                  onClick={() => { if (p.num <= phase) setPhase(p.num); }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    p.num === phase
                      ? "bg-amber-500 text-white shadow-md scale-110"
                      : p.num < phase
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Puzzle className="w-3.5 h-3.5" />
                </button>
                {i < PHASES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${
                    p.num < phase ? "bg-amber-500/40" : "bg-muted"
                  }`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Phase {phase} of 4
          </p>
        </div>
      </div>

      {/* Phase header */}
      <div className="px-4 pt-6 pb-4 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold tracking-tight text-amber-800 dark:text-amber-400">
          {currentPhase.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {currentPhase.subtitle}
        </p>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 max-w-2xl mx-auto w-full">
        {phase === 1 && (
          <Phase1Purpose
            purposeStatement={purposeStatement}
            setPurposeStatement={setPurposeStatement}
            principles={principles}
            setPrinciples={setPrinciples}
          />
        )}
        {phase === 2 && (
          <Phase2Vision
            visionTitle={visionTitle}
            setVisionTitle={setVisionTitle}
            visionJournal={visionJournal}
            setVisionJournal={setVisionJournal}
            anchorMoments={anchorMoments}
            setAnchorMoments={setAnchorMoments}
          />
        )}
        {phase === 3 && (
          <Phase3Areas
            groupedAreas={groupedAreas}
            onToggle={(id, archived) => toggleArea.mutate({ id, archived })}
          />
        )}
        {phase === 4 && (
          <Phase4Habits
            activeGroupedAreas={activeGroupedAreas}
            selectedAreaId={selectedAreaId}
            setSelectedAreaId={setSelectedAreaId}
            identityText={identityText}
            setIdentityText={setIdentityText}
            areaIdentities={areaIdentities}
            onCreateIdentity={async (stmt, areaId) => {
              await createIdentity.mutateAsync({ statement: stmt, areaId });
              setIdentityText("");
            }}
            habitCue={habitCue}
            setHabitCue={setHabitCue}
            habitTimeOfDay={habitTimeOfDay}
            setHabitTimeOfDay={setHabitTimeOfDay}
            habitRecurrence={habitRecurrence}
            setHabitRecurrence={setHabitRecurrence}
            habitBecause={habitBecause}
            setHabitBecause={setHabitBecause}
            habitReward={habitReward}
            setHabitReward={setHabitReward}
            onCreateHabit={async (identityId, areaId) => {
              if (!identityText.trim() && areaIdentities.length === 0) return;
              const identity = areaIdentities[areaIdentities.length - 1];
              if (!identity) return;
              await createHabit.mutateAsync({
                name: identity.statement,
                identityId: identity.id,
                areaId,
                cue: habitCue,
                timeOfDay: habitTimeOfDay,
                recurrence: habitRecurrence || JSON.stringify({ type: "daily", interval: 1 }),
                craving: habitBecause,
                reward: habitReward,
              });
            }}
          />
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t px-4 py-4 z-20">
        <div className="max-w-2xl mx-auto flex gap-3">
          {phase > 1 && (
            <Button variant="outline" onClick={goBack} className="flex-1 h-12">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {phase < 4 ? (
            <Button
              onClick={goNext}
              disabled={!canAdvance()}
              className="flex-1 h-12 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => completeWizard.mutate()}
              disabled={completeWizard.isPending}
              className="flex-1 h-12 bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {completeWizard.isPending ? "Building..." : "Complete Puzzle"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PHASE 1: PURPOSE & PRINCIPLES
// ============================================================

function Phase1Purpose({
  purposeStatement, setPurposeStatement,
  principles, setPrinciples,
}: {
  purposeStatement: string; setPurposeStatement: (v: string) => void;
  principles: PrincipleCard[]; setPrinciples: (v: PrincipleCard[]) => void;
}) {
  const addPrinciple = () => {
    setPrinciples([...principles, {
      statement: "", alwaysNever: "", testScenarios: ["", "", ""], violationSignal: "", courseCorrect: "",
    }]);
  };

  const removePrinciple = (idx: number) => {
    setPrinciples(principles.filter((_, i) => i !== idx));
  };

  const updatePrinciple = (idx: number, field: keyof PrincipleCard, value: string | string[]) => {
    const next = [...principles];
    (next[idx] as any)[field] = value;
    setPrinciples(next);
  };

  const updateScenario = (pIdx: number, sIdx: number, value: string) => {
    const next = [...principles];
    next[pIdx].testScenarios[sIdx] = value;
    setPrinciples(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-semibold text-foreground mb-2 block">
          What is your life's purpose?
        </label>
        <Textarea
          value={purposeStatement}
          onChange={e => setPurposeStatement(e.target.value)}
          placeholder="e.g. To live with integrity, create joy for my family, and leave the world better than I found it..."
          className="min-h-[120px] text-sm"
          data-testid="input-purpose"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Principles</h3>
          <Button variant="outline" size="sm" onClick={addPrinciple} className="h-7 text-xs gap-1">
            <Plus className="w-3 h-3" /> Add Principle
          </Button>
        </div>

        {principles.map((p, idx) => (
          <Card key={idx} className="border-amber-500/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">
                  #{idx + 1}
                </span>
                {principles.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                    onClick={() => removePrinciple(idx)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Principle</label>
                <Input
                  value={p.statement}
                  onChange={e => updatePrinciple(idx, "statement", e.target.value)}
                  placeholder="e.g. Integrity above convenience"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  This means I always / I never...
                </label>
                <Input
                  value={p.alwaysNever}
                  onChange={e => updatePrinciple(idx, "alwaysNever", e.target.value)}
                  placeholder="e.g. I always tell the truth, even when it's uncomfortable"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Test scenarios</label>
                {["When I'm stressed...", "When I'm with family...", "When I'm at work..."].map((ph, sIdx) => (
                  <Input
                    key={sIdx}
                    value={p.testScenarios[sIdx] || ""}
                    onChange={e => updateScenario(idx, sIdx, e.target.value)}
                    placeholder={ph}
                    className="text-sm"
                  />
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Violation signal
                </label>
                <Input
                  value={p.violationSignal}
                  onChange={e => updatePrinciple(idx, "violationSignal", e.target.value)}
                  placeholder="How will you know you're breaking this?"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Course-correct move
                </label>
                <Input
                  value={p.courseCorrect}
                  onChange={e => updatePrinciple(idx, "courseCorrect", e.target.value)}
                  placeholder="How do you get back on track that same day?"
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PHASE 2: VISION
// ============================================================

function Phase2Vision({
  visionTitle, setVisionTitle,
  visionJournal, setVisionJournal,
  anchorMoments, setAnchorMoments,
}: {
  visionTitle: string; setVisionTitle: (v: string) => void;
  visionJournal: string; setVisionJournal: (v: string) => void;
  anchorMoments: AnchorMoment[]; setAnchorMoments: (v: AnchorMoment[]) => void;
}) {
  const updateMoment = (idx: number, scene: string) => {
    const next = [...anchorMoments];
    next[idx] = { ...next[idx], scene };
    setAnchorMoments(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-semibold text-foreground mb-2 block">
          Give your ideal life a name
        </label>
        <Input
          value={visionTitle}
          onChange={e => setVisionTitle(e.target.value)}
          placeholder="e.g. The Abundant Life, My Masterpiece, The Good Life"
          className="text-sm"
          data-testid="input-vision-title"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-foreground mb-2 block">
          Day-in-the-Life Journal
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Describe a full day in your ideal life, governed by your principles. What do you see, hear, and feel?
        </p>
        <Textarea
          value={visionJournal}
          onChange={e => setVisionJournal(e.target.value)}
          placeholder="I wake up at 5:30am in a home filled with natural light..."
          className="min-h-[160px] text-sm"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">5 Anchor Moments</h3>
        <p className="text-xs text-muted-foreground -mt-2">
          Paint a micro-scene for each life piece in your ideal day.
        </p>

        {ANCHOR_PIECES.map((piece, idx) => (
          <Card key={piece.key} className="border-amber-500/20">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{piece.emoji}</span>
                <span className="text-sm font-semibold">{piece.label}</span>
              </div>
              <Textarea
                value={anchorMoments[idx]?.scene || ""}
                onChange={e => updateMoment(idx, e.target.value)}
                placeholder={piece.prompt}
                className="min-h-[80px] text-sm"
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PHASE 3: CATEGORIES & AREAS
// ============================================================

function Phase3Areas({
  groupedAreas,
  onToggle,
}: {
  groupedAreas: Record<string, Area[]>;
  onToggle: (id: number, archived: number) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Archive any areas your ideal life doesn't use. You can always bring them back later.
      </p>

      {CATEGORY_ORDER.map(cat => {
        const catAreas = groupedAreas[cat];
        if (!catAreas || catAreas.length === 0) return null;
        const activeCount = catAreas.filter(a => !a.archived).length;

        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{cat}</h3>
              <span className="text-xs text-muted-foreground">
                {activeCount}/{catAreas.length} active
              </span>
            </div>
            <div className="space-y-1">
              {catAreas.map(area => (
                <div
                  key={area.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                    area.archived ? "opacity-50 bg-muted/30" : "bg-card border"
                  }`}
                >
                  <span className={`text-sm ${area.archived ? "line-through text-muted-foreground" : ""}`}>
                    {area.name}
                  </span>
                  <Switch
                    checked={!area.archived}
                    onCheckedChange={(checked) => onToggle(area.id, checked ? 0 : 1)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// PHASE 4: IDENTITY & HABITS
// ============================================================

function Phase4Habits({
  activeGroupedAreas,
  selectedAreaId, setSelectedAreaId,
  identityText, setIdentityText,
  areaIdentities,
  onCreateIdentity,
  habitCue, setHabitCue,
  habitTimeOfDay, setHabitTimeOfDay,
  habitRecurrence, setHabitRecurrence,
  habitBecause, setHabitBecause,
  habitReward, setHabitReward,
  onCreateHabit,
}: {
  activeGroupedAreas: Record<string, Area[]>;
  selectedAreaId: number | null; setSelectedAreaId: (v: number | null) => void;
  identityText: string; setIdentityText: (v: string) => void;
  areaIdentities: Identity[];
  onCreateIdentity: (stmt: string, areaId: number) => Promise<void>;
  habitCue: string; setHabitCue: (v: string) => void;
  habitTimeOfDay: string; setHabitTimeOfDay: (v: string) => void;
  habitRecurrence: string | null; setHabitRecurrence: (v: string | null) => void;
  habitBecause: string; setHabitBecause: (v: string) => void;
  habitReward: string; setHabitReward: (v: string) => void;
  onCreateHabit: (identityId: number, areaId: number | null) => Promise<void>;
}) {
  const [addingHabitForIdentity, setAddingHabitForIdentity] = useState<Identity | null>(null);
  const [habitName, setHabitName] = useState("");

  const selectedArea = useMemo(() => {
    for (const areas of Object.values(activeGroupedAreas)) {
      const found = areas.find(a => a.id === selectedAreaId);
      if (found) return found;
    }
    return null;
  }, [activeGroupedAreas, selectedAreaId]);

  const handleCreateHabit = async (identity: Identity) => {
    if (!habitName.trim()) return;
    await apiRequest("POST", "/api/habits", {
      name: habitName,
      identityId: identity.id,
      areaId: selectedAreaId,
      cue: habitCue || null,
      craving: habitBecause || null,
      response: habitName,
      reward: habitReward || null,
      frequency: habitRecurrence || JSON.stringify({ type: "daily", interval: 1 }),
      timeOfDay: habitTimeOfDay || null,
      targetCount: 1,
      active: 1,
      createdAt: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
    setHabitName("");
    setHabitCue(""); setHabitTimeOfDay(""); setHabitBecause(""); setHabitReward("");
    setHabitRecurrence(JSON.stringify({ type: "daily", interval: 1 }));
    setAddingHabitForIdentity(null);
  };

  if (!selectedAreaId) {
    // Area selection grid
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Select an area to create identity statements and habits for it.
        </p>

        {CATEGORY_ORDER.map(cat => {
          const catAreas = activeGroupedAreas[cat];
          if (!catAreas || catAreas.length === 0) return null;

          return (
            <div key={cat}>
              <h3 className="text-sm font-semibold mb-2">{cat}</h3>
              <div className="grid grid-cols-2 gap-2">
                {catAreas.map(area => (
                  <button
                    key={area.id}
                    onClick={() => setSelectedAreaId(area.id)}
                    className="p-3 rounded-lg border bg-card text-left hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors"
                  >
                    <p className="text-sm font-medium">{area.name}</p>
                    {area.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{area.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Area detail: identity + habit creation
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedAreaId(null); setAddingHabitForIdentity(null); }}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h3 className="text-sm font-semibold">{selectedArea?.name}</h3>
          <p className="text-[10px] text-muted-foreground">{selectedArea?.category}</p>
        </div>
      </div>

      {/* Identity statements for this area */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Identity Statements
        </h4>

        {areaIdentities.map(id => (
          <Card key={id.id} className="border-amber-500/20">
            <CardContent className="p-3">
              <p className="text-sm">
                <span className="text-muted-foreground">In {selectedArea?.name}, I am the type of person who...</span>{" "}
                <span className="font-medium">{id.statement}</span>
              </p>
              {!addingHabitForIdentity && (
                <Button variant="outline" size="sm" className="mt-2 h-7 text-xs gap-1"
                  onClick={() => setAddingHabitForIdentity(id)}>
                  <Plus className="w-3 h-3" /> Add Habit
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Add identity form */}
        <div className="flex gap-2">
          <Input
            value={identityText}
            onChange={e => setIdentityText(e.target.value)}
            placeholder="e.g. day-to-day activity in this area of your ideal life"
            className="text-sm flex-1"
            data-testid="input-identity"
          />
          <Button
            size="sm"
            disabled={!identityText.trim() || !selectedAreaId}
            onClick={() => onCreateIdentity(identityText, selectedAreaId)}
            className="h-9 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Habit creation form (micro-fiction flow) */}
      {addingHabitForIdentity && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                New Habit for: {addingHabitForIdentity.statement}
              </h4>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                onClick={() => setAddingHabitForIdentity(null)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Habit action</p>
              <Input
                value={habitName}
                onChange={e => setHabitName(e.target.value)}
                placeholder="e.g. do 20 pushups, read 10 pages"
                className="text-sm"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">...when... (cue)</p>
              <Input
                value={habitCue}
                onChange={e => setHabitCue(e.target.value)}
                placeholder="e.g. triggering/reminding action"
                className="text-sm"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">...in the...</p>
              <Select value={habitTimeOfDay} onValueChange={setHabitTimeOfDay}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select time of day" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OF_DAY_CATEGORIES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <RecurrenceBuilder
              value={habitRecurrence}
              onChange={setHabitRecurrence}
              requireRecurrence
            />

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">...because...</p>
              <Input
                value={habitBecause}
                onChange={e => setHabitBecause(e.target.value)}
                placeholder="e.g. what's attractive about it? why crave it?"
                className="text-sm"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">...I'll be rewarded by...</p>
              <Input
                value={habitReward}
                onChange={e => setHabitReward(e.target.value)}
                placeholder="e.g. describe how it satisfies you"
                className="text-sm"
              />
            </div>

            <Button
              className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!habitName.trim()}
              onClick={() => handleCreateHabit(addingHabitForIdentity)}
            >
              Create Habit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
