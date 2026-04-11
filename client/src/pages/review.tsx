import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RotateCcw, Trophy, Lightbulb, Target as TargetIcon,
  CheckCircle2, Inbox, FolderOpen, Plus, ArrowLeft, Puzzle
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import type { WeeklyReview, InboxItem, Project, Identity } from "@shared/schema";
import { getPieceColor } from "@/lib/piece-colors";

const PIECES = [
  { key: "reason",   label: "Reason",   descriptor: "Purpose & beliefs" },
  { key: "finance",  label: "Finance",  descriptor: "Money & abundance" },
  { key: "fitness",  label: "Fitness",  descriptor: "Health & energy" },
  { key: "talent",   label: "Talent",   descriptor: "Work & contribution" },
  { key: "pleasure", label: "Pleasure", descriptor: "Joy & relationships" },
] as const;

function PieceRatingRow({ piece, value, onChange }: {
  piece: { key: string; label: string; descriptor: string };
  value: number;
  onChange: (v: number) => void;
}) {
  const color = getPieceColor(piece.key);
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0">
        <span className={`text-xs font-semibold ${color.text}`}>{piece.label}</span>
        <p className="text-[9px] text-muted-foreground leading-tight">{piece.descriptor}</p>
      </div>
      <div className="flex items-center gap-1 flex-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n === value ? 0 : n)}
            className={`flex-1 h-7 rounded text-xs font-medium transition-all border ${
              n <= value
                ? `${color.bg} ${color.text} ${color.border}`
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
        {value > 0 ? value : "–"}
      </span>
    </div>
  );
}

function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function ReviewPage() {
  const monday = getMonday();
  const { data: reviews = [] } = useQuery<WeeklyReview[]>({ queryKey: ["/api/weekly-reviews"] });
  const { data: inboxItems = [] } = useQuery<InboxItem[]>({ queryKey: ["/api/inbox"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });

  const currentReview = reviews.find(r => r.weekOf === monday);
  const unprocessedInbox = inboxItems.filter(i => !i.processed).length;
  const activeProjects = projects.filter(p => p.status === "active");

  const [wins, setWins] = useState("");
  const [lessons, setLessons] = useState("");
  const [focus, setFocus] = useState("");
  const [inboxCleared, setInboxCleared] = useState(false);
  const [projectsReviewed, setProjectsReviewed] = useState(false);
  const [habitsReviewed, setHabitsReviewed] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (currentReview?.puzzlePieceRatings) {
      try {
        setRatings(JSON.parse(currentReview.puzzlePieceRatings));
      } catch {}
    }
  }, [currentReview]);

  const checklist = [
    { label: "Clear inbox to zero", done: inboxCleared || (currentReview?.inboxCleared === 1), setter: setInboxCleared, icon: Inbox, detail: unprocessedInbox > 0 ? `${unprocessedInbox} items remaining` : "All clear", linkHref: "/inbox", linkLabel: `Inbox${unprocessedInbox > 0 ? ` (${unprocessedInbox})` : ""}` },
    { label: "Review all active projects", done: projectsReviewed || (currentReview?.projectsReviewed === 1), setter: setProjectsReviewed, icon: FolderOpen, detail: `${activeProjects.length} active projects`, linkHref: "/projects", linkLabel: `Projects (${activeProjects.length})` },
    { label: "Review routine systems", done: habitsReviewed || (currentReview?.habitsReviewed === 1), setter: setHabitsReviewed, icon: TargetIcon, detail: `${identities.filter(i => i.active).length} active identities`, linkHref: "/routine", linkLabel: `Routines (${identities.filter(i => i.active).length})` },
  ];

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;
  const progressPercent = Math.round((checklistDone / checklistTotal) * 100);

  const saveReview = useMutation({
    mutationFn: () => {
      const data = {
        weekOf: monday,
        wins: JSON.stringify(wins.split("\n").filter(Boolean)),
        lessons: JSON.stringify(lessons.split("\n").filter(Boolean)),
        nextWeekFocus: JSON.stringify(focus.split("\n").filter(Boolean)),
        inboxCleared: inboxCleared ? 1 : 0,
        projectsReviewed: projectsReviewed ? 1 : 0,
        habitsReviewed: habitsReviewed ? 1 : 0,
        puzzlePieceRatings: Object.keys(ratings).length > 0 ? JSON.stringify(ratings) : null,
        createdAt: new Date().toISOString(),
      };
      if (currentReview) {
        return apiRequest("PATCH", `/api/weekly-reviews/${currentReview.id}`, data);
      }
      return apiRequest("POST", "/api/weekly-reviews", data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/weekly-reviews"] }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Weekly Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Week of {new Date(monday + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {currentReview && (
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Saved
          </Badge>
        )}
      </div>

      {/* GTD Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" /> Review Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground">{checklistDone} of {checklistTotal} complete</p>

          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${item.done ? "bg-primary/5" : "hover:bg-accent"}`}
              >
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(v) => item.setter(!!v)}
                  data-testid={`review-check-${i}`}
                />
                <item.icon className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>
                    {item.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                </div>
                {item.linkHref && (
                  <Link href={item.linkHref} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto cursor-pointer hover:bg-primary/10 transition-colors">
                      {item.linkLabel}
                    </Badge>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Puzzle Piece Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-primary" /> Puzzle Piece Health
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            How did each piece of your life feel this week? (1 = struggling, 5 = thriving)
          </p>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {PIECES.map(piece => (
            <PieceRatingRow
              key={piece.key}
              piece={piece}
              value={ratings[piece.key] || 0}
              onChange={(v) => setRatings(prev => ({ ...prev, [piece.key]: v }))}
            />
          ))}
        </CardContent>
      </Card>

      {/* Wins */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="w-4 h-4 text-chart-1" /> Wins This Week
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Textarea
            placeholder="What went well? What breakthroughs happened? (one per line)"
            value={wins || (currentReview?.wins ? JSON.parse(currentReview.wins).join("\n") : "")}
            onChange={(e) => setWins(e.target.value)}
            rows={4}
            className="text-sm"
            data-testid="input-wins"
          />
        </CardContent>
      </Card>

      {/* Lessons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-chart-4" /> Lessons & Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Textarea
            placeholder="What did you learn? What would you do differently? (one per line)"
            value={lessons || (currentReview?.lessons ? JSON.parse(currentReview.lessons).join("\n") : "")}
            onChange={(e) => setLessons(e.target.value)}
            rows={4}
            className="text-sm"
            data-testid="input-lessons"
          />
        </CardContent>
      </Card>

      {/* Next Week Focus */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TargetIcon className="w-4 h-4 text-chart-2" /> Next Week Focus
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Textarea
            placeholder="Top 3 priorities for next week (one per line)"
            value={focus || (currentReview?.nextWeekFocus ? JSON.parse(currentReview.nextWeekFocus).join("\n") : "")}
            onChange={(e) => setFocus(e.target.value)}
            rows={3}
            className="text-sm"
            data-testid="input-focus"
          />
        </CardContent>
      </Card>

      <Button className="w-full" onClick={() => saveReview.mutate()} data-testid="button-save-review">
        <CheckCircle2 className="w-4 h-4 mr-1" /> Save Review
      </Button>

      {/* Past Reviews */}
      {reviews.filter(r => r.weekOf !== monday).length > 0 && (
        <div className="pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Past Reviews</p>
          {reviews.filter(r => r.weekOf !== monday).slice(0, 4).map((r) => {
            const w = r.wins ? JSON.parse(r.wins) : [];
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Week of {new Date(r.weekOf + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  {w.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {w.slice(0, 3).map((win: string, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <Trophy className="w-3 h-3 mt-0.5 text-chart-1 shrink-0" /> {win}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
