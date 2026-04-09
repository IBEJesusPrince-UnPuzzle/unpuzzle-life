import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Fingerprint, Inbox as InboxIcon, Repeat2, FolderOpen, Plus, ArrowRight,
  FileEdit, ChevronRight, Shield, Check, X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import type { Area } from "@shared/schema";
import { SorterView } from "./planner";

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function LawCheckInRow({ law, log, isChecked, isKept, today }: {
  law: any; log: any; isChecked: boolean; isKept: boolean; today: string;
}) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const checkIn = useMutation({
    mutationFn: (data: { kept: boolean; note?: string; overrideReason?: string }) =>
      apiRequest("POST", "/api/immutable-law-logs/check-in", {
        lawId: law.id,
        kept: data.kept,
        note: data.note || null,
        wasOverride: data.overrideReason ? 1 : 0,
        overrideReason: data.overrideReason || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/immutable-law-logs/date", today] });
      setShowNote(false);
      setNote("");
    },
  });

  const LEVEL_BADGE: Record<number, { label: string; className: string }> = {
    1: { label: "Awareness", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    2: { label: "Friction",  className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
    3: { label: "Block",     className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  };
  const levelBadge = LEVEL_BADGE[law.enforcementLevel] ?? LEVEL_BADGE[1];

  return (
    <div className={`rounded-lg border p-2.5 transition-colors ${
      isChecked
        ? isKept ? "border-green-500/20 bg-green-500/[0.03]" : "border-red-500/20 bg-red-500/[0.03]"
        : "border-border"
    }`}>
      <div className="flex items-start gap-2">
        {isChecked ? (
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
            isKept ? "bg-green-500/20" : "bg-red-500/20"
          }`}>
            {isKept
              ? <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              : <X className="w-3 h-3 text-red-600 dark:text-red-400" />
            }
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium">{law.title}</span>
            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${levelBadge.className}`}>
              {levelBadge.label}
            </Badge>
            {law.isRedLine === 1 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" title="Red line" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{law.statement}</p>

          {!isChecked && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 text-green-600 border-green-500/30 hover:bg-green-500/10"
                onClick={() => checkIn.mutate({ kept: true })}
                disabled={checkIn.isPending}
              >
                {"\u2713"} Kept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 text-red-600 border-red-500/30 hover:bg-red-500/10"
                onClick={() => {
                  setShowNote(true);
                }}
                disabled={checkIn.isPending}
              >
                {"\u2717"} Broken
              </Button>
            </div>
          )}

          {showNote && (
            <div className="mt-2 space-y-1.5">
              {law.enforcementLevel === 3 && (
                <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                  This is a Block-level law. Provide a reason to override.
                </p>
              )}
              <Input
                className="h-7 text-xs"
                placeholder={law.enforcementLevel === 3 ? "Override reason (required)" : "What happened? (optional)"}
                value={law.enforcementLevel === 3 ? overrideReason : note}
                onChange={e => law.enforcementLevel === 3 ? setOverrideReason(e.target.value) : setNote(e.target.value)}
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => checkIn.mutate({
                    kept: false,
                    note: note || undefined,
                    overrideReason: law.enforcementLevel === 3 ? overrideReason : undefined,
                  })}
                  disabled={checkIn.isPending || (law.enforcementLevel === 3 && !overrideReason.trim())}
                >
                  Log it
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2"
                  onClick={() => { setShowNote(false); setNote(""); setOverrideReason(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const today = getToday();
  const [quickCapture, setQuickCapture] = useState("");
  const [captureAreaId, setCaptureAreaId] = useState<string>("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: dashboardData, isLoading: statsLoading } = useQuery<{
    stats: {
      identityVotePercent: number;
      pendingActionsCount: number;
      missedTasksCount: number;
      inboxCount: number;
      pendingActions: number;
      completedToday: number;
      activeProjects: number;
      totalActiveIdentities: number;
    };
    areas: Area[];
    todaysTasks: any[];
    routineItems: any[];
    routineLogs: any[];
    recurringCreated: number;
  }>({ queryKey: ["/api/dashboard-data"] });

  const { data: laws = [] } = useQuery<any[]>({ queryKey: ["/api/immutable-laws"] });
  const { data: lawLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/immutable-law-logs/date", today],
    queryFn: () => apiRequest("GET", `/api/immutable-law-logs/date/${today}`).then(r => r.json()),
  });

  const stats = dashboardData?.stats;
  const areas = dashboardData?.areas || [];
  const routineItems = dashboardData?.routineItems || [];
  const draftRoutineCount = routineItems.filter((i: any) => i.isDraft === 1 && i.active).length;

  const activeLaws = laws.filter((l: any) => l.active);
  const checkedInLawIds = new Set(lawLogs.map((log: any) => log.immutableLawId));
  const todayKept = lawLogs.filter((log: any) => log.kept === 1).length;
  const todayBroken = lawLogs.filter((log: any) => log.kept === 0).length;

  // Seed SorterView query caches from the combined endpoint to avoid duplicate fetches
  useEffect(() => {
    if (!dashboardData) return;
    queryClient.setQueryData(["/api/areas"], dashboardData.areas);
    queryClient.setQueryData(["/api/routine-items"], dashboardData.routineItems);
    queryClient.setQueryData(["/api/planner-tasks", today], dashboardData.todaysTasks);
    queryClient.setQueryData(["/api/routine-logs", today], dashboardData.routineLogs);
  }, [dashboardData]);

  const [, setLocation] = useLocation();

  const captureToInbox = useMutation({
    mutationFn: ({ content, areaId }: { content: string; areaId: number | null }) =>
      apiRequest("POST", "/api/inbox", {
        content,
        areaId,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setQuickCapture("");
      setCaptureAreaId("");
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-data"] });
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-greeting">
          {getGreeting()}, IBEJesus
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-bold">It's</span> {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>

      {/* Quick Capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (quickCapture.trim() && captureAreaId) {
            captureToInbox.mutate({
              content: quickCapture.trim(),
              areaId: captureAreaId && captureAreaId !== "none" ? Number(captureAreaId) : null,
            });
          }
        }}
        className="flex flex-col sm:flex-row gap-2 sm:items-end"
      >
        <Input
          placeholder="What's on your mind? Brain dump here..."
          value={quickCapture}
          onChange={(e) => setQuickCapture(e.target.value)}
          className="flex-1"
          data-testid="input-quick-capture"
        />
        <div className="flex gap-2">
          <Select value={captureAreaId} onValueChange={setCaptureAreaId}>
            <SelectTrigger className="text-sm w-40">
              <SelectValue placeholder="Related Area..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No area</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={!quickCapture.trim() || !captureAreaId} data-testid="button-capture">
            <Plus className="w-4 h-4 mr-1" /> Capture
          </Button>
        </div>
      </form>

      {/* Onboarding nudge — only when no area visions exist */}
      {areas.filter(a => a.visionText).length === 0 && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Start with Clarity</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Write your area visions — the foundation everything else builds from.
              </p>
            </div>
            <Link href="/horizons">
              <Button size="sm" variant="outline">
                Go to Clarity <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Draft routine nudge */}
      {draftRoutineCount > 0 && (
        <Link href="/routine">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-500/[0.08] transition-colors">
            <div className="flex items-center gap-2.5">
              <FileEdit className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {draftRoutineCount} routine{draftRoutineCount > 1 ? "s" : ""} waiting to be scheduled
                </p>
                <p className="text-xs text-muted-foreground">
                  Open Routines to set a time and lock them in
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </Link>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Link href="/identity-vote">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Fingerprint className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.identityVotePercent || 0}%</p>
                    <p className="text-xs text-muted-foreground">Identity Vote</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/inbox">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-chart-4/10 flex items-center justify-center">
                    <InboxIcon className="w-4 h-4 text-chart-4" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.inboxCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Inbox</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/routine">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-chart-5/10 flex items-center justify-center">
                    <Repeat2 className="w-4 h-4 text-chart-5" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.totalActiveIdentities || 0}</p>
                    <p className="text-xs text-muted-foreground">Routines</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/projects">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{stats?.activeProjects || 0}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* Immutable Laws Check-in */}
      {activeLaws.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Immutable Laws</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {todayKept > 0 && <span className="text-green-600 dark:text-green-400 font-medium">{"\u2713"} {todayKept} kept</span>}
                {todayBroken > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{"\u2717"} {todayBroken} broken</span>}
                {activeLaws.length > 0 && checkedInLawIds.size === activeLaws.length && (
                  <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 text-[10px]">All checked in</Badge>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {activeLaws.map((law: any) => {
                const log = lawLogs.find((l: any) => l.immutableLawId === law.id);
                const isChecked = !!log;
                const isKept = log?.kept === 1;
                return (
                  <LawCheckInRow key={law.id} law={law} log={log} isChecked={isChecked} isKept={isKept} today={today} />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Embedded Agenda */}
      <div className="-mx-6 -mb-6">
        <SorterView areas={areas} onAreaClick={(id) => setLocation(`/planner`)} embedded />
      </div>
    </div>
  );
}
