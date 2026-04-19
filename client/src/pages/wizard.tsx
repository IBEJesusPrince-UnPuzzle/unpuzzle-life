import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Puzzle, ChevronRight, ChevronLeft, Sparkles, Plus, Trash2, Pencil,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type {
  Area, Purpose, Identity, NonNegotiable, Responsibility, Role,
  EnvironmentPerson, EnvironmentPlace,
} from "@shared/schema";
import { PIECE_COLORS, type PieceKey } from "@/lib/piece-colors";

// ============================================================
// CONSTANTS
// ============================================================

const PHASES = [
  { num: 1, title: "Purpose", subtitle: "The big-picture why behind everything you do" },
  { num: 2, title: "The Airport Test", subtitle: "Imagine life 5 years from now \u2014 what's amazing?" },
  { num: 3, title: "Who You're Becoming", subtitle: "Identity statements and non-negotiables per puzzle piece" },
  { num: 4, title: "Responsibilities & Roles", subtitle: "The maintenance and the people you show up for" },
];

const PIECE_KEYS: PieceKey[] = ["reason", "finance", "fitness", "talent", "pleasure"];

const IDENTITY_PROMPTS: Record<PieceKey, (area: string) => string> = {
  reason: (a) => `Looking at your ${a} vision through the Reason lens \u2014 why does this matter to your identity? Complete this: "I am someone who _______ when it comes to my principles and my ${a}."`,
  finance: (a) => `What financial reality supports this ${a} vision? "I am someone who _______ when it comes to money and my ${a}."`,
  fitness: (a) => `How does your physical self support this ${a} vision? "I am someone who _______ when it comes to health/fitness and my ${a}."`,
  talent: (a) => `What skills or growth support this ${a} vision? "I am someone who _______ when it comes to growth/skill and my ${a}."`,
  pleasure: (a) => `What joy and fulfillment come from this ${a} vision? "I am someone who _______ when it comes to enjoyment and my ${a}."`,
};

const NON_NEGOTIABLE_PROMPTS: Record<PieceKey, string> = {
  reason: "What principle do you refuse to violate, even when it costs you?",
  finance: "What financial boundary do you never cross?",
  fitness: "What physical standard is non-negotiable for you?",
  talent: "What standard do you hold for your growth?",
  pleasure: "What boundary protects your joy?",
};

const PRESET_CHORES = [
  "Laundry-Wash", "Laundry-Dry", "Laundry-Fold", "Laundry-PutAway",
  "Kitchen", "Meal Prep/Planning", "Grocery/Shopping", "Bathroom",
  "Living Room", "Bedroom", "Hallway/Foyer", "Office", "Basement", "Den",
  "Auto", "Yard", "Residence", "Trash/Recycling", "Dishes", "Pets",
  "Plants/Garden", "Mail/Paperwork", "Errands", "Decluttering/Organizing", "Misc",
];

// Chores where a place qualifier is always prompted
const ALWAYS_PLACE_QUALIFIED = new Set(["Bathroom", "Bedroom", "Auto", "Office"]);
// Chores where a place qualifier is optional
const OPTIONAL_PLACE_QUALIFIED = new Set([
  "Kitchen", "Living Room", "Hallway/Foyer", "Basement", "Den", "Yard", "Decluttering/Organizing",
]);

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ============================================================
// MAIN WIZARD PAGE
// ============================================================

export default function WizardPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState(1);

  // Pre-load wizard state
  const { data: wizardState } = useQuery<{ currentPhase: number; completed: number }>({
    queryKey: ["/api/wizard-state"],
  });

  useEffect(() => {
    if (wizardState?.currentPhase && wizardState.currentPhase >= 1 && wizardState.currentPhase <= 4) {
      setPhase(wizardState.currentPhase);
    }
  }, [wizardState?.currentPhase]);

  const saveWizardPhase = useMutation({
    mutationFn: (p: number) => apiRequest("PATCH", "/api/wizard-state", { currentPhase: p }),
  });

  const completeWizard = useMutation({
    mutationFn: () => apiRequest("POST", "/api/wizard/complete"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wizard-state"] });
      navigate("/");
    },
  });

  // Step-level validity — set by each step so Next can gate
  const [canAdvance, setCanAdvance] = useState(false);
  // Async handler set by step to run on Next (returns true to advance).
  // Wrapped in object to avoid useState's function-updater interpretation.
  const [onNextHolder, setOnNextHolder] = useState<{ fn: (() => Promise<boolean>) | null }>({ fn: null });
  const setOnNext = (fn: (() => Promise<boolean>) | null) => setOnNextHolder({ fn });

  const { toast } = useToast();

  const goNext = async () => {
    try {
      if (onNextHolder.fn) {
        const ok = await onNextHolder.fn();
        if (!ok) return;
      }
      if (phase < 4) {
        const next = phase + 1;
        setPhase(next);
        saveWizardPhase.mutate(next);
      }
    } catch (err: any) {
      console.error("Wizard goNext error:", err);
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: err?.message?.replace(/^\d+:\s*/, "") || "Please try again.",
      });
    }
  };

  const goBack = () => {
    if (phase > 1) {
      const prev = phase - 1;
      setPhase(prev);
      saveWizardPhase.mutate(prev);
    }
  };

  const current = PHASES[phase - 1];

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
          {current.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {current.subtitle}
        </p>
        {phase === 1 && (
          <Link href="/import" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2 transition-colors">
            or import existing data →
          </Link>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 max-w-2xl mx-auto w-full">
        {phase === 1 && (
          <Step1Purpose
            setCanAdvance={setCanAdvance}
            setOnNext={setOnNext}
          />
        )}
        {phase === 2 && (
          <Step2AirportTest
            setCanAdvance={setCanAdvance}
            setOnNext={setOnNext}
          />
        )}
        {phase === 3 && (
          <Step3PuzzleBreakdown
            setCanAdvance={setCanAdvance}
            setOnNext={setOnNext}
          />
        )}
        {phase === 4 && (
          <Step4Responsibilities
            setCanAdvance={setCanAdvance}
            setOnNext={setOnNext}
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
              disabled={!canAdvance}
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

// Hook signature for each step
interface StepProps {
  setCanAdvance: (v: boolean) => void;
  setOnNext: (fn: (() => Promise<boolean>) | null) => void;
}

// ============================================================
// STEP 1: PURPOSE
// ============================================================

function Step1Purpose({ setCanAdvance, setOnNext }: StepProps) {
  const { data: purposes = [] } = useQuery<Purpose[]>({ queryKey: ["/api/purposes"] });
  const existing = purposes[0];
  const [statement, setStatement] = useState("");

  useEffect(() => {
    if (existing?.statement) setStatement(existing.statement);
  }, [existing?.id]);

  // Use refs to avoid stale closures in the onNext callback
  const statementRef = useRef(statement);
  statementRef.current = statement;
  const existingRef = useRef(existing);
  existingRef.current = existing;

  useEffect(() => {
    setCanAdvance(statement.trim().length > 0);
    setOnNext(async () => {
      const s = statementRef.current.trim();
      if (!s) return false;
      const ex = existingRef.current;
      const body = { statement: s, createdAt: new Date().toISOString() };
      if (ex) {
        await apiRequest("PATCH", `/api/purposes/${ex.id}`, { statement: s });
      } else {
        await apiRequest("POST", "/api/purposes", body);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      return true;
    });
    return () => setOnNext(null);
  }, [statement, existing?.id]);

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-semibold text-foreground mb-2 block">
          What is your life's purpose?
        </label>
        <Textarea
          value={statement}
          onChange={e => setStatement(e.target.value)}
          placeholder="e.g. To live with integrity, create joy for my family, and leave the world better than I found it..."
          className="min-h-[140px] text-sm"
          data-testid="input-purpose"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Your purpose is the big-picture why behind everything you do. Boundaries and non-negotiables
          come later, one puzzle piece at a time.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// STEP 2: AIRPORT TEST (Areas + Visions)
// ============================================================

function Step2AirportTest({ setCanAdvance, setOnNext }: StepProps) {
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const [name, setName] = useState("");
  const [visionText, setVisionText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const createArea = useMutation({
    mutationFn: (body: { name: string; visionText: string; sortOrder: number }) =>
      apiRequest("POST", "/api/areas", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  const updateArea = useMutation({
    mutationFn: ({ id, visionText }: { id: number; visionText: string }) =>
      apiRequest("PATCH", `/api/areas/${id}`, { visionText }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  const deleteArea = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/areas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  const activeAreas = useMemo(() => areas.filter(a => !a.archived), [areas]);

  useEffect(() => {
    setCanAdvance(activeAreas.length >= 1);
    setOnNext(async () => activeAreas.length >= 1);
    return () => setOnNext(null);
  }, [activeAreas.length]);

  const handleAdd = async () => {
    if (!name.trim() || !visionText.trim()) return;
    if (editingId != null) {
      await updateArea.mutateAsync({ id: editingId, visionText: visionText.trim() });
      setEditingId(null);
    } else {
      await createArea.mutateAsync({
        name: name.trim(),
        visionText: visionText.trim(),
        sortOrder: activeAreas.length,
      });
    }
    setName("");
    setVisionText("");
  };

  const startEdit = (area: Area) => {
    setEditingId(area.id);
    setName(area.name);
    setVisionText(area.visionText || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setVisionText("");
  };

  const prompt = activeAreas.length === 0
    ? "Your friend says, 'Tell me more! What's the first thing that comes to mind?' What area of your life is amazing, and what does that look like?"
    : "What else is going on that's so great? Keep going — what else?";

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground italic">
        Inspired by The Airport Test from Pat Flynn's <em>Will It Fly?</em>
      </p>

      {/* Scene-setting card */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed">
            Imagine you've traveled 5 years into the future. You're at the airport and run into an old
            friend. They ask how life is going. You say: <em>"AMAZING! Life couldn't get any better."</em>
          </p>
        </CardContent>
      </Card>

      {/* Existing areas */}
      {activeAreas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Your amazing areas
          </h4>
          {activeAreas.map(area => (
            <Card key={area.id} className="border-amber-500/20">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{area.name}</p>
                    {area.visionText && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                        {area.visionText}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(area)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteArea.mutate(area.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Entry form */}
      <Card className="border-amber-500/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm leading-relaxed">{prompt}</p>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Area name
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Family"
              disabled={editingId != null}
            />
            {editingId != null && (
              <p className="text-[10px] text-muted-foreground mt-1">Area names can't be renamed.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              5-year vision
            </label>
            <Textarea
              value={visionText}
              onChange={e => setVisionText(e.target.value)}
              placeholder="What does 'amazing' look like here? Paint the picture..."
              className="min-h-[100px] text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleAdd}
              disabled={!name.trim() || !visionText.trim() || createArea.isPending || updateArea.isPending}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              {editingId != null ? "Save changes" : "Add this area"}
            </Button>
            {editingId != null && (
              <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// STEP 3: PUZZLE PIECE BREAKDOWN + GLOBAL NON-NEGOTIABLES
// ============================================================

function Step3PuzzleBreakdown({ setCanAdvance, setOnNext }: StepProps) {
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: nonNegotiables = [] } = useQuery<NonNegotiable[]>({ queryKey: ["/api/non-negotiables"] });

  const activeAreas = useMemo(
    () => areas.filter(a => !a.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [areas],
  );

  const [areaIdx, setAreaIdx] = useState(0);
  const [pieceIdx, setPieceIdx] = useState(0);
  const [identityText, setIdentityText] = useState("");
  const [nonNegotiableText, setNonNegotiableText] = useState("");

  const currentArea = activeAreas[areaIdx];
  const currentPiece = PIECE_KEYS[pieceIdx];

  // Global non-negotiable map (puzzlePiece => statement)
  const globalNN = useMemo(() => {
    const map: Record<string, NonNegotiable> = {};
    for (const n of nonNegotiables) {
      if (n.areaId == null && !map[n.puzzlePiece]) map[n.puzzlePiece] = n;
    }
    return map;
  }, [nonNegotiables]);

  // Identity map: key = `${areaId}:${piece}`
  const identityMap = useMemo(() => {
    const map: Record<string, Identity> = {};
    for (const i of identities) {
      map[`${i.areaId}:${i.puzzlePiece}`] = i;
    }
    return map;
  }, [identities]);

  const existingIdentity = currentArea
    ? identityMap[`${currentArea.id}:${currentPiece}`]
    : undefined;

  const firstTimeForPiece = areaIdx === 0;
  const existingGlobalNN = globalNN[currentPiece];

  // Pre-fill fields from existing data
  useEffect(() => {
    setIdentityText(existingIdentity?.statement || "");
    setNonNegotiableText(
      firstTimeForPiece ? (existingGlobalNN?.statement || "") : "",
    );
  }, [areaIdx, pieceIdx, existingIdentity?.id, existingGlobalNN?.id]);

  const createIdentity = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/identities", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/identities"] }),
  });

  const updateIdentity = useMutation({
    mutationFn: ({ id, statement }: { id: number; statement: string }) =>
      apiRequest("PATCH", `/api/identities/${id}`, { statement }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/identities"] }),
  });

  const createNonNegotiable = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/non-negotiables", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/non-negotiables"] }),
  });

  const updateNonNegotiable = useMutation({
    mutationFn: ({ id, statement }: { id: number; statement: string }) =>
      apiRequest("PATCH", `/api/non-negotiables/${id}`, { statement }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/non-negotiables"] }),
  });

  const isLastArea = areaIdx === activeAreas.length - 1;
  const isLastPiece = pieceIdx === PIECE_KEYS.length - 1;

  const canSaveCurrent = identityText.trim().length > 0 &&
    (!firstTimeForPiece || nonNegotiableText.trim().length > 0);

  const saveCurrent = async () => {
    if (!currentArea || !canSaveCurrent) return false;

    // Save non-negotiable (first area only)
    if (firstTimeForPiece) {
      if (existingGlobalNN) {
        if (existingGlobalNN.statement !== nonNegotiableText.trim()) {
          await updateNonNegotiable.mutateAsync({
            id: existingGlobalNN.id,
            statement: nonNegotiableText.trim(),
          });
        }
      } else {
        await createNonNegotiable.mutateAsync({
          puzzlePiece: currentPiece,
          statement: nonNegotiableText.trim(),
          areaId: null,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Save identity
    if (existingIdentity) {
      if (existingIdentity.statement !== identityText.trim()) {
        await updateIdentity.mutateAsync({
          id: existingIdentity.id,
          statement: identityText.trim(),
        });
      }
    } else {
      await createIdentity.mutateAsync({
        statement: identityText.trim(),
        areaId: currentArea.id,
        puzzlePiece: currentPiece,
        status: "draft",
        cue: "",
        craving: "",
        response: "",
        reward: "",
        frequency: "daily",
        timeOfDay: "",
        location: "",
        createdAt: new Date().toISOString(),
      });
    }
    return true;
  };

  const advanceNext = async () => {
    const ok = await saveCurrent();
    if (!ok) return;
    if (!isLastPiece) {
      setPieceIdx(pieceIdx + 1);
    } else if (!isLastArea) {
      setAreaIdx(areaIdx + 1);
      setPieceIdx(0);
    }
  };

  const goBackStep = () => {
    if (pieceIdx > 0) {
      setPieceIdx(pieceIdx - 1);
    } else if (areaIdx > 0) {
      setAreaIdx(areaIdx - 1);
      setPieceIdx(PIECE_KEYS.length - 1);
    }
  };

  const isStepComplete = isLastArea && isLastPiece;

  // Wire global Next button: only advance phase when all areas × pieces done
  useEffect(() => {
    setCanAdvance(isStepComplete ? canSaveCurrent : false);
    setOnNext(async () => {
      if (!isStepComplete) return false;
      return await saveCurrent();
    });
    return () => setOnNext(null);
  }, [isStepComplete, canSaveCurrent, identityText, nonNegotiableText,
      areaIdx, pieceIdx, currentArea?.id, existingIdentity?.id, existingGlobalNN?.id]);

  if (!currentArea) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You need at least one area from Step 2 to continue. Go back and add an area.
        </p>
      </div>
    );
  }

  const pieceColor = PIECE_COLORS[currentPiece];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground italic">
        Identity framework inspired by James Clear's <em>Atomic Habits</em>. Boundaries inspired by
        Mike Michalowicz's <em>The Pumpkin Plan</em>.
      </p>

      {/* Progress indicator */}
      <div className="text-xs text-muted-foreground text-center">
        Area {areaIdx + 1} of {activeAreas.length} · Piece {pieceIdx + 1} of 5
      </div>

      {/* Area context */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">
            {currentArea.name}
          </p>
          {currentArea.visionText && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {currentArea.visionText}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Piece indicator */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${pieceColor.border} ${pieceColor.bg}`}>
        <Puzzle className={`w-4 h-4 ${pieceColor.text}`} />
        <span className={`text-sm font-semibold ${pieceColor.text}`}>{pieceColor.label}</span>
      </div>

      {/* Non-negotiable prompt (first time this piece appears — Area 1) */}
      {firstTimeForPiece ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              {pieceColor.label} non-negotiable (global)
            </label>
            <p className="text-sm">{NON_NEGOTIABLE_PROMPTS[currentPiece]}</p>
            <Textarea
              value={nonNegotiableText}
              onChange={e => setNonNegotiableText(e.target.value)}
              placeholder="This one's for life — not just this area."
              className="min-h-[80px] text-sm"
            />
          </CardContent>
        </Card>
      ) : existingGlobalNN ? (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Your {pieceColor.label} non-negotiable
            </p>
            <p className="text-sm italic">"{existingGlobalNN.statement}"</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Identity prompt */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Identity statement
          </label>
          <p className="text-sm leading-relaxed">{IDENTITY_PROMPTS[currentPiece](currentArea.name)}</p>
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground shrink-0 pt-2">I am someone who</span>
            <Textarea
              value={identityText}
              onChange={e => setIdentityText(e.target.value)}
              placeholder="..."
              className="min-h-[80px] text-sm flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Inner nav */}
      <div className="flex gap-2">
        {(areaIdx > 0 || pieceIdx > 0) && (
          <Button variant="outline" onClick={goBackStep} className="flex-1">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous piece
          </Button>
        )}
        {!isStepComplete && (
          <Button
            onClick={advanceNext}
            disabled={!canSaveCurrent}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isLastPiece ? "Next area" : "Next piece"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      {isStepComplete && (
        <p className="text-xs text-center text-muted-foreground">
          Last piece, last area. Click Next below to continue.
        </p>
      )}
    </div>
  );
}

// ============================================================
// STEP 4: RESPONSIBILITIES & ROLES
// ============================================================

function Step4Responsibilities({ setCanAdvance, setOnNext }: StepProps) {
  useEffect(() => {
    setCanAdvance(true);
    setOnNext(null);
  }, []);

  return (
    <div className="space-y-6">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed">
            Your vision defines who you're becoming. But life also has things you're maintaining and
            people you're showing up for right now. Let's capture those so nothing falls through the
            cracks.
          </p>
        </CardContent>
      </Card>

      <ResponsibilitiesSection />
      <RolesSection />
    </div>
  );
}

// -------------- Responsibilities --------------

function ResponsibilitiesSection() {
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({ queryKey: ["/api/responsibilities"] });
  const { data: places = [] } = useQuery<EnvironmentPlace[]>({ queryKey: ["/api/environment/places"] });

  const [customName, setCustomName] = useState("");

  const createResponsibility = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/responsibilities", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] }),
  });

  const deleteResponsibility = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/responsibilities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] }),
  });

  const createPlace = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/environment/places", {
        name, type: "room", createdAt: new Date().toISOString(),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/environment/places"] }),
  });

  const isSelected = (name: string) => responsibilities.some(r => r.name === name);

  const handleAddPreset = async (name: string, placeId: number | null, cadence: string, dayOfWeek: string | null) => {
    await createResponsibility.mutateAsync({
      name,
      placeId,
      thingId: null,
      cadence,
      dayOfWeek,
      isPreset: 1,
      createdAt: new Date().toISOString(),
    });
  };

  const handleAddCustom = async (name: string, placeId: number | null, cadence: string, dayOfWeek: string | null) => {
    await createResponsibility.mutateAsync({
      name,
      placeId,
      thingId: null,
      cadence,
      dayOfWeek,
      isPreset: 0,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Responsibilities</h2>
      <p className="text-xs text-muted-foreground">
        Check the chores and maintenance tasks that are part of your life. Add custom ones as needed.
      </p>

      <div className="space-y-2">
        {PRESET_CHORES.map(chore => {
          const existing = responsibilities.find(r => r.name === chore);
          return (
            <PresetChoreRow
              key={chore}
              name={chore}
              existing={existing}
              places={places}
              onAdd={handleAddPreset}
              onRemove={() => existing && deleteResponsibility.mutate(existing.id)}
              onCreatePlace={async (name) => {
                const place = await createPlace.mutateAsync(name);
                return place.id;
              }}
            />
          );
        })}
      </div>

      {/* Custom */}
      <div className="pt-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Custom responsibilities
        </h3>
        {responsibilities.filter(r => !r.isPreset).map(r => (
          <div key={r.id} className="flex items-center justify-between p-2 border rounded-md mb-1">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {r.cadence}{r.dayOfWeek ? ` · ${r.dayOfWeek}` : ""}
              </p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteResponsibility.mutate(r.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <CustomResponsibilityForm
          places={places}
          onAdd={handleAddCustom}
          onCreatePlace={async (name) => {
            const place = await createPlace.mutateAsync(name);
            return place.id;
          }}
        />
      </div>
    </section>
  );
}

function PresetChoreRow({
  name, existing, places, onAdd, onRemove, onCreatePlace,
}: {
  name: string;
  existing?: Responsibility;
  places: EnvironmentPlace[];
  onAdd: (name: string, placeId: number | null, cadence: string, dayOfWeek: string | null) => Promise<void>;
  onRemove: () => void;
  onCreatePlace: (name: string) => Promise<number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [placeId, setPlaceId] = useState<string>("");
  const [newPlaceName, setNewPlaceName] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");

  const alwaysPlace = ALWAYS_PLACE_QUALIFIED.has(name);
  const optionalPlace = OPTIONAL_PLACE_QUALIFIED.has(name);
  const showsPlace = alwaysPlace || optionalPlace;

  const handleToggle = async (checked: boolean) => {
    if (existing) {
      onRemove();
      setExpanded(false);
      return;
    }
    if (checked) {
      setExpanded(true);
    }
  };

  const handleConfirm = async () => {
    let finalPlaceId: number | null = null;
    if (alwaysPlace && !placeId && !newPlaceName.trim()) return;
    if (placeId === "__new__" && newPlaceName.trim()) {
      finalPlaceId = await onCreatePlace(newPlaceName.trim());
    } else if (placeId && placeId !== "__new__") {
      finalPlaceId = Number(placeId);
    }
    const dow = (cadence === "weekly" || cadence === "biweekly") ? (dayOfWeek || null) : null;
    await onAdd(name, finalPlaceId, cadence, dow);
    setExpanded(false);
    setPlaceId("");
    setNewPlaceName("");
  };

  return (
    <div className="border rounded-md p-2">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={!!existing}
          onCheckedChange={(v) => handleToggle(!!v)}
        />
        <span className="text-sm flex-1">{name}</span>
        {existing && (
          <span className="text-[10px] text-muted-foreground">
            {existing.cadence}{existing.dayOfWeek ? ` · ${existing.dayOfWeek}` : ""}
          </span>
        )}
      </div>

      {expanded && !existing && (
        <div className="mt-2 space-y-2 pl-6">
          {showsPlace && (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Place {alwaysPlace ? "(required)" : "(optional)"}
              </label>
              <Select value={placeId} onValueChange={setPlaceId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a place..." />
                </SelectTrigger>
                <SelectContent>
                  {places.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create new place</SelectItem>
                </SelectContent>
              </Select>
              {placeId === "__new__" && (
                <Input
                  value={newPlaceName}
                  onChange={e => setNewPlaceName(e.target.value)}
                  placeholder="New place name"
                  className="mt-2 h-9 text-sm"
                />
              )}
            </div>
          )}

          <CadencePicker cadence={cadence} setCadence={setCadence} dayOfWeek={dayOfWeek} setDayOfWeek={setDayOfWeek} />

          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirm} className="bg-amber-600 hover:bg-amber-700 text-white">
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomResponsibilityForm({
  places, onAdd, onCreatePlace,
}: {
  places: EnvironmentPlace[];
  onAdd: (name: string, placeId: number | null, cadence: string, dayOfWeek: string | null) => Promise<void>;
  onCreatePlace: (name: string) => Promise<number>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [placeId, setPlaceId] = useState<string>("");
  const [newPlaceName, setNewPlaceName] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
        <Plus className="w-4 h-4 mr-1" /> Add custom responsibility
      </Button>
    );
  }

  const handleAdd = async () => {
    if (!name.trim()) return;
    let finalPlaceId: number | null = null;
    if (placeId === "__new__" && newPlaceName.trim()) {
      finalPlaceId = await onCreatePlace(newPlaceName.trim());
    } else if (placeId && placeId !== "__new__") {
      finalPlaceId = Number(placeId);
    }
    const dow = (cadence === "weekly" || cadence === "biweekly") ? (dayOfWeek || null) : null;
    await onAdd(name.trim(), finalPlaceId, cadence, dow);
    setName("");
    setPlaceId("");
    setNewPlaceName("");
    setCadence("weekly");
    setDayOfWeek("");
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Responsibility name"
          className="h-9 text-sm"
        />
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Place (optional)
          </label>
          <Select value={placeId} onValueChange={setPlaceId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="No place..." />
            </SelectTrigger>
            <SelectContent>
              {places.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
              <SelectItem value="__new__">+ Create new place</SelectItem>
            </SelectContent>
          </Select>
          {placeId === "__new__" && (
            <Input
              value={newPlaceName}
              onChange={e => setNewPlaceName(e.target.value)}
              placeholder="New place name"
              className="mt-2 h-9 text-sm"
            />
          )}
        </div>
        <CadencePicker cadence={cadence} setCadence={setCadence} dayOfWeek={dayOfWeek} setDayOfWeek={setDayOfWeek} />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAdd} disabled={!name.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
            Add
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CadencePicker({
  cadence, setCadence, dayOfWeek, setDayOfWeek, withWeekdays = false,
}: {
  cadence: string;
  setCadence: (v: string) => void;
  dayOfWeek: string;
  setDayOfWeek: (v: string) => void;
  withWeekdays?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
          Cadence
        </label>
        <Select value={cadence} onValueChange={setCadence}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            {withWeekdays && <SelectItem value="weekdays">Weekdays</SelectItem>}
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Biweekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(cadence === "weekly" || cadence === "biweekly") && (
        <div className="flex-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Day
          </label>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_WEEK.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// -------------- Roles --------------

function RolesSection() {
  const { data: roles = [] } = useQuery<(Role & { people?: any[] })[]>({ queryKey: ["/api/roles"] });
  const { data: people = [] } = useQuery<EnvironmentPerson[]>({ queryKey: ["/api/environment/people"] });

  const createRole = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/roles", body).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/roles"] }),
  });

  const addRolePerson = useMutation({
    mutationFn: ({ roleId, personId }: { roleId: number; personId: number }) =>
      apiRequest("POST", `/api/roles/${roleId}/people`, { personId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/roles"] }),
  });

  const deleteRole = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/roles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/roles"] }),
  });

  const createPerson = useMutation({
    mutationFn: (body: { name: string; relationship: string }) =>
      apiRequest("POST", "/api/environment/people", {
        ...body, createdAt: new Date().toISOString(),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/environment/people"] }),
  });

  return (
    <section className="space-y-3 pt-4 border-t">
      <h2 className="text-sm font-semibold text-foreground">Roles</h2>
      <p className="text-xs text-muted-foreground">
        Who are the people you show up for regularly?
      </p>

      {roles.map(role => (
        <div key={role.id} className="flex items-center justify-between p-2 border rounded-md">
          <div className="min-w-0">
            <p className="text-sm font-medium">{role.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {role.cadence}{role.dayOfWeek ? ` · ${role.dayOfWeek}` : ""}
              {role.people && role.people.length > 0
                ? ` · ${role.people.map((p: any) => p.name || "").filter(Boolean).join(", ")}`
                : ""}
            </p>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteRole.mutate(role.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      <RoleCreator
        people={people}
        onCreate={async ({ name, description, cadence, dayOfWeek, personId, newPersonName, newPersonRelationship }) => {
          const role = await createRole.mutateAsync({
            name, description, cadence, dayOfWeek,
            createdAt: new Date().toISOString(),
          });
          let finalPersonId = personId;
          if (!finalPersonId && newPersonName?.trim()) {
            const person = await createPerson.mutateAsync({
              name: newPersonName.trim(),
              relationship: newPersonRelationship || "",
            });
            finalPersonId = person.id;
          }
          if (finalPersonId) {
            await addRolePerson.mutateAsync({ roleId: role.id, personId: finalPersonId });
          }
        }}
      />
    </section>
  );
}

function RoleCreator({
  people, onCreate,
}: {
  people: EnvironmentPerson[];
  onCreate: (args: {
    name: string;
    description: string;
    cadence: string;
    dayOfWeek: string | null;
    personId: number | null;
    newPersonName?: string;
    newPersonRelationship?: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personId, setPersonId] = useState<string>("");
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRelationship, setNewPersonRelationship] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
        <Plus className="w-4 h-4 mr-1" /> Add role
      </Button>
    );
  }

  const handleCreate = async () => {
    if (!name.trim()) return;
    const dow = (cadence === "weekly" || cadence === "biweekly") ? (dayOfWeek || null) : null;
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      cadence,
      dayOfWeek: dow,
      personId: personId && personId !== "__new__" ? Number(personId) : null,
      newPersonName: personId === "__new__" ? newPersonName : undefined,
      newPersonRelationship: personId === "__new__" ? newPersonRelationship : undefined,
    });
    setName("");
    setDescription("");
    setPersonId("");
    setNewPersonName("");
    setNewPersonRelationship("");
    setCadence("weekly");
    setDayOfWeek("");
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Role name (e.g. Help Marcus with homework)"
          className="h-9 text-sm"
        />
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="min-h-[60px] text-sm"
        />
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Person
          </label>
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select a person..." />
            </SelectTrigger>
            <SelectContent>
              {people.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}{p.relationship ? ` (${p.relationship})` : ""}
                </SelectItem>
              ))}
              <SelectItem value="__new__">+ Create new person</SelectItem>
            </SelectContent>
          </Select>
          {personId === "__new__" && (
            <div className="mt-2 space-y-2">
              <Input
                value={newPersonName}
                onChange={e => setNewPersonName(e.target.value)}
                placeholder="Person name"
                className="h-9 text-sm"
              />
              <Input
                value={newPersonRelationship}
                onChange={e => setNewPersonRelationship(e.target.value)}
                placeholder="Relationship (optional)"
                className="h-9 text-sm"
              />
            </div>
          )}
        </div>
        <CadencePicker
          cadence={cadence}
          setCadence={setCadence}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          withWeekdays
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleCreate} disabled={!name.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
            Add role
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
