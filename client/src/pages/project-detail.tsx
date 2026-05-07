import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Project } from "@shared/schema";

interface ProjectDetailPageProps {
  id: number;
}

export default function ProjectDetailPage({ id }: ProjectDetailPageProps) {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const project = projects.find(p => p.id === id);

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Link href="/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to projects
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Project not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href="/projects">
        <Button variant="ghost" size="sm" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to projects
        </Button>
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
        {project.description && (
          <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
        )}
      </div>

      <Card>
        <CardContent className="p-6 space-y-3 text-sm">
          <p className="text-muted-foreground">
            The full project detail surface (environment, support, milestones)
            is being rebuilt as part of v8 Phase 5. This is a minimal placeholder
            view showing the project record.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium">{project.archived ? "Archived" : "Active"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="font-medium">
                {project.createdAt
                  ? new Date(project.createdAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
