import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Fingerprint, CheckCircle2, Clock, AlertTriangle, ArrowRight,
  Target, Zap, ChevronDown, ChevronRight, ArrowLeft,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface VoteTask {
  id: number;
  goal: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
}

interface IdentityBreakdown {
  identityId: number;
  identityStatement: string;
  cue: string | null;
  areaName: string | null;
  hasRoutine: boolean;
  done: number;
  total: number;
  percent: number | null;
  upcomingTasks: VoteTask[];
  pastTasks: VoteTask[];
}

interface VoteDetails {
  overallPercent: number;
  totalDone: number;
  totalAll: number;
  breakdown: IdentityBreakdown[];
  identitiesWithoutRoutine: {
    identityId: number;
    identityStatement: string;
  }[];
}

function formatTime12h(time24: string | undefined) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date().toISOString().split("T")[0];
  if (dateStr === today) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function IdentityVotePage() {
  const { data, isLoading } = useQuery<VoteDetails>({
    queryKey: ["/api/identity-vote-details"],
    queryFn: () => apiRequest("GET", "/api/identity-vote-details").then(r => r.json()),
  });

  const markDone = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: "done" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identity-vote-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const { overallPercent, totalDone, totalAll, breakdown, identitiesWithoutRoutine } = data;
  const contributing = breakdown.filter(b => b.total > 0);
  const noTasks = breakdown.filter(b => b.total === 0 && b.hasRoutine);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Back button — centered pill */}
      <div className="flex justify-center mb-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-primary" />
          Identity Vote
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every completed task tied to your identity is a vote for the person you're becoming.
        </p>
      </div>

      {/* Overall Score */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold tabular-nums">{overallPercent}%</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {totalDone} of {totalAll} identity-linked tasks completed
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Tasks are counted when their scheduled end time has passed. Complete upcoming tasks to raise your vote.
              </p>
              {totalAll === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No identity-linked tasks found yet. Create identities with areas and schedule routines.
                </p>
              )}
              {/* Progress bar */}
              {totalAll > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium mb-2">How Identity Vote is calculated</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>You create an <span className="font-medium text-foreground">Identity</span> ("I'm the type of person who will...") in an area</li>
            <li>That identity generates a <span className="font-medium text-foreground">Routine</span>, which creates scheduled tasks</li>
            <li>Each task whose end time has passed counts as a <span className="font-medium text-foreground">vote</span> — completed = vote for your identity, missed = vote against</li>
          </ol>
        </CardContent>
      </Card>

      {/* Contributing Identities */}
      {contributing.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Identities Contributing to Your Vote</h2>
          {contributing.map(b => (
            <IdentityBreakdownCard key={b.identityId} identity={b} onMarkDone={(id) => markDone.mutate(id)} />
          ))}
        </div>
      )}

      {/* Identities with routines but no past tasks yet */}
      {noTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Identities With Routines (No Past Tasks Yet)</h2>
          {noTasks.map(b => (
            <Card key={b.identityId} className="opacity-70">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      "I'm the type of person who will {b.identityStatement}"
                    </p>
                    {b.cue && (
                      <p className="text-[11px] text-muted-foreground">
                        when {b.cue}
                      </p>
                    )}
                    {b.areaName && <Badge variant="outline" className="text-[10px] h-4 px-1 mt-1">{b.areaName}</Badge>}
                  </div>
                </div>
                {b.upcomingTasks.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {b.upcomingTasks.length} upcoming task{b.upcomingTasks.length > 1 ? "s" : ""} scheduled
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Identities without routines — can't contribute */}
      {identitiesWithoutRoutine.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Identities Missing Routines
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">
            These identities have no routine, so they can't generate tasks or votes.
          </p>
          {identitiesWithoutRoutine.map(i => (
            <Card key={i.identityId} className="border-amber-500/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    "I'm the type of person who will {i.identityStatement}"
                  </p>
                </div>
                <Link href="/routine">
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                    Add Routine <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function IdentityBreakdownCard({ identity, onMarkDone }: { identity: IdentityBreakdown; onMarkDone: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const percent = identity.percent ?? 0;
  const barColor = percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-destructive";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold tabular-nums ${
            percent >= 80 ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" :
            percent >= 50 ? "border-amber-500 text-amber-600 dark:text-amber-400" :
            "border-destructive text-destructive"
          }`}>
            {percent}%
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              "I'm the type of person who will {identity.identityStatement}"
            </p>
            {identity.cue && (
              <p className="text-[11px] text-muted-foreground">triggered {identity.cue}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {identity.areaName && <Badge variant="outline" className="text-[10px] h-4 px-1">{identity.areaName}</Badge>}
              <span className="text-[11px] text-muted-foreground">
                {identity.done}/{identity.total} completed
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${percent}%` }} />
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground/50">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-3">
            {/* Upcoming tasks — actionable */}
            {identity.upcomingTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-2">
                  <Zap className="w-3 h-3" />
                  Complete these to increase your vote
                </p>
                <div className="space-y-1.5">
                  {identity.upcomingTasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkDone(t.id); }}
                        className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 flex items-center justify-center shrink-0 transition-colors"
                      >
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{t.goal}</p>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDateShort(t.date)}
                          {t.startTime && ` ${formatTime12h(t.startTime)}`}
                          {t.endTime && ` – ${formatTime12h(t.endTime)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent past tasks — history */}
            {identity.pastTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent votes</p>
                <div className="space-y-1">
                  {identity.pastTasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      {t.status === "done" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <span className={`flex-1 truncate ${t.status === "done" ? "text-muted-foreground" : "text-destructive"}`}>
                        {t.goal}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDateShort(t.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {identity.upcomingTasks.length === 0 && identity.pastTasks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No tasks to show.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
