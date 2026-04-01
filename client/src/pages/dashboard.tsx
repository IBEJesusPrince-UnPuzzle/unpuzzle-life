import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Fingerprint, Inbox as InboxIcon, Repeat2, FolderOpen, Plus,
} from "lucide-react";
import { useState } from "react";
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

export default function Dashboard() {
  const today = getToday();
  const [quickCapture, setQuickCapture] = useState("");
  const [captureAreaId, setCaptureAreaId] = useState<string>("");

  const { data: stats, isLoading: statsLoading } = useQuery<{
    identityVotePercent: number;
    pendingActionsCount: number;
    missedTasksCount: number;
    inboxCount: number;
    pendingActions: number;
    completedToday: number;
    activeProjects: number;
    totalActiveIdentities: number;
  }>({ queryKey: ["/api/stats"] });

  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

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
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-greeting">
          {getGreeting()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
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
            <Link href="/horizons">
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

      {/* Embedded Agenda */}
      <div className="-mx-6 -mb-6">
        <SorterView areas={areas} onAreaClick={(id) => setLocation(`/planner`)} />
      </div>
    </div>
  );
}
