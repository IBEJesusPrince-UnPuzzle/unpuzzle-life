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
  CheckCircle2, Inbox, FolderOpen, Plus, ArrowLeft
} from "lucide-react";
import { useState, useMemo } from "react";
import type { WeeklyReview, InboxItem, Project, Habit } from "@shared/schema";

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
  const { data: habits = [] } = useQuery<Habit[]>({ queryKey: ["/api/habits"] });

  const currentReview = reviews.find(r => r.weekOf === monday);
  const unprocessedInbox = inboxItems.filter(i => !i.processed).length;
  const activeProjects = projects.filter(p => p.status === "active");

  const [wins, setWins] = useState("");
  const [lessons, setLessons] = useState("");
  const [focus, setFocus] = useState("");
  const [inboxCleared, setInboxCleared] = useState(false);
  const [projectsReviewed, setProjectsReviewed] = useState(false);
  const [habitsReviewed, setHabitsReviewed] = useState(false);

  const checklist = [
    { label: "Clear inbox to zero", done: inboxCleared || (currentReview?.inboxCleared === 1), setter: setInboxCleared, icon: Inbox, detail: `${unprocessedInbox} items remaining` },
    { label: "Review all active projects", done: projectsReviewed || (currentReview?.projectsReviewed === 1), setter: setProjectsReviewed, icon: FolderOpen, detail: `${activeProjects.length} active projects` },
    { label: "Review habit systems", done: habitsReviewed || (currentReview?.habitsReviewed === 1), setter: setHabitsReviewed, icon: TargetIcon, detail: `${habits.filter(h => h.active).length} active habits` },
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
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-center mb-3">
        <a href="#/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </a>
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
              </div>
            ))}
          </div>
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
