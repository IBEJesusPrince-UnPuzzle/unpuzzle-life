import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Plus, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import type { Project } from "@shared/schema";
import { SidebarMenuButton } from "@/components/sidebar-menu";

// PR #23 — Replaces the old single-line quick-add with a dialog that
// requires title + start_date + target_date (Date-handling.docx lock).
// On success, navigates to /projects/:id/edit so the user can fill in
// the rest of the v2 fields immediately.
export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const [searchText, setSearchText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const resetDialog = () => {
    setTitle("");
    setStartDate("");
    setTargetDate("");
  };

  const createProject = useMutation({
    mutationFn: (vars: { title: string; startDate: string; targetDate: string }) =>
      apiRequest("POST", "/api/projects", {
        title: vars.title,
        description: null,
        startDate: vars.startDate,
        targetDate: vars.targetDate,
        status: "active",
        createdAt: new Date().toISOString(),
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || "Failed to create project");
        }
        return r.json();
      }),
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      resetDialog();
      // Land on the edit page so the user can fill in the rest immediately.
      setLocation(`/projects/${project.id}/edit`);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't create project", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(targetDate) &&
    targetDate >= startDate;

  const filtered = useMemo(() => {
    const active = projects.filter(p => !p.archived);
    if (!searchText.trim()) return active;
    const q = searchText.toLowerCase();
    return active.filter(p => p.title.toLowerCase().includes(q));
  }, [projects, searchText]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SidebarMenuButton />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Outcomes you're working toward.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          data-testid="button-open-new-project-dialog"
        >
          <Plus className="w-4 h-4 mr-1" /> New project
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="text-sm pl-8 h-9"
          data-testid="input-search-projects"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No projects found</p>
            <p className="text-xs mt-1">
              {projects.length === 0
                ? "Tap New project to get started."
                : "Try adjusting your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(project => (
            <Link key={project.id} href={`/projects/${project.id}/edit`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-start gap-3">
                  <FolderOpen className="w-4 h-4 text-chart-5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{project.title}</p>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {project.description}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                      {project.startDate && <span>Start {project.startDate}</span>}
                      {project.targetDate && <span>Target {project.targetDate}</span>}
                      {project.status && <span className="capitalize">{project.status}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-new-project">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Give it a title and the dates that bound it. You can fill in everything else on the
              next screen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="np-title">Title</Label>
              <Input
                id="np-title"
                placeholder="What is this project?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                data-testid="input-new-project-title"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="np-start">Start date</Label>
                <Input
                  id="np-start"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  data-testid="input-new-project-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-target">Target date</Label>
                <Input
                  id="np-target"
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  data-testid="input-new-project-target"
                />
              </div>
            </div>
            {targetDate && startDate && targetDate < startDate && (
              <p className="text-xs text-destructive" data-testid="text-date-error">
                Target date must be on or after the start date.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-new-project"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canSubmit || createProject.isPending}
              onClick={() =>
                createProject.mutate({ title: title.trim(), startDate, targetDate })
              }
              data-testid="button-create-project"
            >
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
