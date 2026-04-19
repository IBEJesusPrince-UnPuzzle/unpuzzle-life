import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowRight, Sparkles, GraduationCap, AlertTriangle,
  FolderOpen, CheckCircle2, ChevronRight, CalendarClock, Check,
} from "lucide-react";
import { getPieceColor } from "@/lib/piece-colors";
import type { Identity, Area, PlannerTask } from "@shared/schema";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export default function MorningBriefingPage() {
  const [, setLocation] = useLocation();
  const today = getToday();

  const { data: identities = [], isLoading: idLoading } = useQuery<Identity[]>({
    queryKey: ["/api/identities"],
  });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: allTasks = [], isLoading: tLoading } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks"],
  });

  const activeIdentities = identities.filter(i => i.active);
  const drafts = activeIdentities.filter(i => i.status === "draft");
  const projectIdentities = activeIdentities.filter(i => i.status === "project");

  // Tasks grouped by identity
  const tasksByIdentity = allTasks.reduce<Record<number, PlannerTask[]>>((acc, t) => {
    if (t.identityId != null) {
      (acc[t.identityId] ||= []).push(t);
    }
    return acc;
  }, {});

  // Graduation candidates: project-status identities where all linked tasks are done (and there is at least one task)
  const graduationCandidates = projectIdentities.filter(i => {
    const ts = tasksByIdentity[i.id] || [];
    return ts.length > 0 && ts.every(t => t.status === "done");
  });

  // Overdue tasks: date < today AND status != done AND not draft
  const overdueTasks = allTasks.filter(t =>
    t.date < today && t.status !== "done" && t.isDraft !== 1
  );

  const completeTask = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: "done" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const rescheduleTask = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { date: today }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const isLoading = idLoading || tLoading;
  const totalItems = drafts.length + graduationCandidates.length + overdueTasks.length + projectIdentities.length;
  const allClear = !isLoading && totalItems === 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Here's what needs your attention
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(today + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : allClear ? (
        <Card className="border-green-500/30 bg-green-500/[0.04]">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto" />
            <div>
              <p className="text-lg font-semibold">All clear!</p>
              <p className="text-sm text-muted-foreground mt-1">Here's your day.</p>
            </div>
            <Button size="lg" onClick={() => setLocation("/agenda")} data-testid="button-go-agenda">
              Open Agenda <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Draft identities */}
          {drafts.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Draft identities</span>
                    <Badge variant="secondary">{drafts.length}</Badge>
                  </div>
                  <Link href="/drafts">
                    <Button size="sm" variant="outline" data-testid="button-review-drafts">
                      Review <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">
                  {drafts.length === 1 ? "One identity is" : `${drafts.length} identities are`} waiting for your decision.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Graduation candidates */}
          {graduationCandidates.length > 0 && (
            <Card className="border-green-500/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold">Ready to graduate</span>
                  <Badge variant="secondary">{graduationCandidates.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  All tasks complete — graduate these identities to routines.
                </p>
                <div className="space-y-2">
                  {graduationCandidates.map(i => {
                    const color = getPieceColor(i.puzzlePiece);
                    const area = areas.find(a => a.id === i.areaId);
                    return (
                      <Link key={i.id} href={`/projects/${i.id}/build`}>
                        <div className={`rounded-md border-l-4 ${color.border} bg-muted/30 p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/60 transition-colors`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{i.statement}</p>
                            <p className="text-xs text-muted-foreground">{area?.name}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <Card className="border-red-500/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-semibold">Overdue tasks</span>
                  <Badge variant="secondary">{overdueTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {overdueTasks.map(t => (
                    <div key={t.id} className="rounded-md border bg-muted/30 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{t.task}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] text-green-600 border-green-500/30 hover:bg-green-500/10"
                          onClick={() => completeTask.mutate(t.id)}
                          disabled={completeTask.isPending}
                          data-testid={`button-complete-${t.id}`}
                        >
                          <Check className="w-3 h-3 mr-1" /> Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => rescheduleTask.mutate(t.id)}
                          disabled={rescheduleTask.isPending}
                          data-testid={`button-reschedule-${t.id}`}
                        >
                          <CalendarClock className="w-3 h-3 mr-1" /> Move to today
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active projects */}
          {projectIdentities.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Active projects</span>
                  <Badge variant="secondary">{projectIdentities.length}</Badge>
                </div>
                <div className="space-y-2">
                  {projectIdentities.map(i => {
                    const color = getPieceColor(i.puzzlePiece);
                    const area = areas.find(a => a.id === i.areaId);
                    const ts = tasksByIdentity[i.id] || [];
                    const done = ts.filter(t => t.status === "done").length;
                    return (
                      <Link key={i.id} href={`/projects/${i.id}/build`}>
                        <div className={`rounded-md border-l-4 ${color.border} bg-muted/30 p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/60 transition-colors`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{i.statement}</p>
                            <p className="text-xs text-muted-foreground">
                              {area?.name}{ts.length > 0 ? ` · ${done}/${ts.length} tasks` : ""}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Proceed to agenda */}
          <div className="pt-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setLocation("/agenda")}
              data-testid="button-proceed-agenda"
            >
              Proceed to Agenda <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
