import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus, Search } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import type { Project } from "@shared/schema";

export default function ProjectsPage() {
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const [searchText, setSearchText] = useState("");
  const [newName, setNewName] = useState("");

  const createProject = useMutation({
    mutationFn: (title: string) =>
      apiRequest("POST", "/api/projects", {
        title,
        description: null,
        createdAt: new Date().toISOString(),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setNewName("");
    },
  });

  const filtered = useMemo(() => {
    const active = projects.filter(p => !p.archived);
    if (!searchText.trim()) return active;
    const q = searchText.toLowerCase();
    return active.filter(p => p.title.toLowerCase().includes(q));
  }, [projects, searchText]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-chart-5" />
          Projects
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Outcomes you're working toward.
        </p>
      </div>

      {/* Quick add */}
      <div className="flex gap-2">
        <Input
          placeholder="New project name..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newName.trim()) {
              createProject.mutate(newName.trim());
            }
          }}
          className="text-sm h-9"
          data-testid="input-new-project"
        />
        <Button
          size="sm"
          onClick={() => newName.trim() && createProject.mutate(newName.trim())}
          disabled={!newName.trim() || createProject.isPending}
          data-testid="button-create-project"
        >
          <Plus className="w-4 h-4 mr-1" /> Add
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
                ? "Add your first project above."
                : "Try adjusting your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(project => (
            <Link key={project.id} href={`/projects/${project.id}`}>
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
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
