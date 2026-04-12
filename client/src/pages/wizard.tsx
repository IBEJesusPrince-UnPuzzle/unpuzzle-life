import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Puzzle, ChevronRight, ChevronLeft, Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import type { Area, Identity } from "@shared/schema";
import { IdentityForm } from "./unpuzzle";

const CATEGORY_ORDER = ["UnPuzzle", "Chores", "Routines", "Roles", "Getting Things Done", "Other"];

const PHASES = [
  { num: 1, title: "Purpose", subtitle: "The corner pieces and edge frame \u2014 the foundation everything else clicks into" },
  { num: 2, title: "Responsibilities & Areas", subtitle: "The major sections and sub-assemblies \u2014 decide which parts of your life structure matter" },
  { num: 3, title: "Identity", subtitle: "The detailed, interlocking pieces \u2014 where the science meets the art" },
];

// ============================================================
// MAIN WIZARD PAGE
// ============================================================

export default function WizardPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState(1);

  // Phase 1 state
  const [purposeStatement, setPurposeStatement] = useState("");

  // Phase 3 state (identity) — managed by IdentityForm component

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
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/purposes"] }),
  });

  // Phase 2: toggle area archived
  const toggleArea = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: number }) =>
      apiRequest("PATCH", `/api/areas/${id}`, { archived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
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
    if (phase < 3) {
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
    return true;
  };

  // Group areas by responsibility
  const groupedAreas = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    areas.forEach(a => {
      const cat = a.puzzlePiece || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    return groups;
  }, [areas]);

  // Active areas (for phase 3 identity form)
  const activeAreas = useMemo(() => areas.filter(a => !a.archived), [areas]);

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
            Phase {phase} of 3
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
        <Link href="/import" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2 transition-colors">
          or import existing data →
        </Link>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 max-w-2xl mx-auto w-full">
        {phase === 1 && (
          <Phase1Purpose
            purposeStatement={purposeStatement}
            setPurposeStatement={setPurposeStatement}
          />
        )}
        {phase === 2 && (
          <Phase3Areas
            groupedAreas={groupedAreas}
            onToggle={(id, archived) => toggleArea.mutate({ id, archived })}
          />
        )}
        {phase === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Build identity statements for your life areas. Choose a puzzle piece, then describe who you're becoming.
            </p>
            {/* Existing identities */}
            {identitiesData.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Created Identities
                </h4>
                {identitiesData.map(id => (
                  <Card key={id.id} className="border-amber-500/20">
                    <CardContent className="p-3">
                      <p className="text-sm">
                        <span className="text-muted-foreground">I am the type of person who</span>{" "}
                        <span className="font-medium">{id.statement}</span>
                      </p>
                      {id.puzzlePiece && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{id.puzzlePiece} piece</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-4">
                  New Identity
                </h4>
                <IdentityForm
                  showPieceSelector
                  areas={activeAreas}
                />
              </CardContent>
            </Card>
          </div>
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
          {phase < 3 ? (
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
// PHASE 1: PURPOSE
// ============================================================

function Phase1Purpose({
  purposeStatement, setPurposeStatement,
}: {
  purposeStatement: string; setPurposeStatement: (v: string) => void;
}) {
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
        <p className="text-xs text-muted-foreground mt-2">
          Your purpose is the big-picture why behind everything you do. Boundaries and non-negotiables live in Immutable Laws under each puzzle piece.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// PHASE 2: RESPONSIBILITIES & AREAS
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

