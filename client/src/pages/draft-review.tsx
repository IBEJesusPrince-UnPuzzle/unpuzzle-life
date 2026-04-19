import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Trash2, Pencil, Save, X, Sparkles } from "lucide-react";
import { getPieceColor } from "@/lib/piece-colors";
import type { Identity, Area } from "@shared/schema";

export default function DraftReviewPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const { data: identities = [], isLoading } = useQuery<Identity[]>({
    queryKey: ["/api/identities"],
  });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const drafts = identities.filter(i => i.status === "draft" && i.active);

  const draftsByArea = drafts.reduce<Record<number, Identity[]>>((acc, d) => {
    (acc[d.areaId] ||= []).push(d);
    return acc;
  }, {});

  const keepMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/identities/${id}/status`, { status: "project" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      toast({ title: "Kept", description: "Moved to projects." });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, statement }: { id: number; statement: string }) =>
      apiRequest("PATCH", `/api/identities/${id}`, { statement }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      setEditingId(null);
      setEditText("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/identities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      toast({ title: "Removed", description: "Identity deleted." });
    },
  });

  const startEdit = (id: number, current: string) => {
    setEditingId(id);
    setEditText(current);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

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
            Review draft identities
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Keep the ones that feel true. Edit or remove the rest.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No draft identities to review.</p>
            <Link href="/">
              <Button size="sm">Back to dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(draftsByArea).map(([areaIdStr, items]) => {
            const areaId = Number(areaIdStr);
            const area = areas.find(a => a.id === areaId);
            return (
              <div key={areaId} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {area?.name || "Unassigned"}
                </h2>
                <div className="space-y-3">
                  {items.map(identity => {
                    const color = getPieceColor(identity.puzzlePiece);
                    const isEditing = editingId === identity.id;
                    return (
                      <Card key={identity.id} className={`border-l-4 ${color.border}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <Badge
                              variant="outline"
                              className={`${color.bg} ${color.text} ${color.border} shrink-0`}
                            >
                              {color.label || identity.puzzlePiece}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <Textarea
                                  value={editText}
                                  onChange={e => setEditText(e.target.value)}
                                  className="text-sm"
                                  rows={2}
                                  data-testid={`textarea-edit-${identity.id}`}
                                />
                              ) : (
                                <p className="text-sm font-medium leading-relaxed">
                                  {identity.statement}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    editMutation.mutate({ id: identity.id, statement: editText.trim() })
                                  }
                                  disabled={!editText.trim() || editMutation.isPending}
                                  data-testid={`button-save-${identity.id}`}
                                >
                                  <Save className="w-3 h-3 mr-1" /> Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                                  <X className="w-3 h-3 mr-1" /> Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => keepMutation.mutate(identity.id)}
                                  disabled={keepMutation.isPending}
                                  className="bg-green-600 hover:bg-green-700"
                                  data-testid={`button-keep-${identity.id}`}
                                >
                                  <Check className="w-3 h-3 mr-1" /> Keep
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEdit(identity.id, identity.statement)}
                                  data-testid={`button-edit-${identity.id}`}
                                >
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeMutation.mutate(identity.id)}
                                  disabled={removeMutation.isPending}
                                  className="text-destructive hover:bg-destructive/10"
                                  data-testid={`button-remove-${identity.id}`}
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setLocation("/")}
              data-testid="button-done"
            >
              All done reviewing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
