import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Compass, Plus, Pencil, Trash2, X, ArrowLeft, Archive,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Area } from "@shared/schema";

type ClarityView =
  | { type: "board" }
  | { type: "writer"; areaId: number; isNew?: boolean };

// ============================================================
// INLINE AREA CREATE
// ============================================================
function InlineAreaCreate({
  onCreated,
  onCancel,
  areas,
}: {
  onCreated: (area: Area) => void;
  onCancel: () => void;
  areas: Area[];
}) {
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/areas", {
        name,
        sortOrder: areas.length,
      }),
    onSuccess: async (res: Response) => {
      const newArea = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      onCreated(newArea);
    },
  });

  return (
    <div className="space-y-3 mt-6 max-w-sm mx-auto">
      <Input
        placeholder="Name this area of your life..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) create.mutate();
        }}
      />
      <p className="text-xs text-muted-foreground">
        e.g. Family, Health, Finances, Career, Faith, Marriage...
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
        >
          Add Area
        </Button>
        <button
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AREA VISION CARD
// ============================================================
function AreaVisionCard({
  area,
  onClick,
  onEdit,
  onDelete,
  onArchive,
}: {
  area: Area;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <p className="text-base font-semibold">{area.name}</p>
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onArchive}
              className="p-1 text-muted-foreground hover:text-amber-500 transition-colors"
              title={area.archived ? "Unarchive" : "Archive"}
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onEdit}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 text-xs"
                  onClick={onDelete}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setConfirmDelete(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7 w-7 p-0"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        {area.visionText && (
          <div className="relative mt-2">
            <p className="text-sm text-muted-foreground line-clamp-4">
              {area.visionText}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// VISION BOARD (State 2 / Empty State 1)
// ============================================================
function VisionBoard({
  areas,
  onOpenWriter,
}: {
  areas: Area[];
  onOpenWriter: (areaId: number, isNew?: boolean) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const visibleAreas = areas.filter(a => showArchived ? a.archived : !a.archived);
  const areasWithVision = visibleAreas.filter((a) => a.visionText);
  const areasWithoutVision = visibleAreas.filter((a) => !a.visionText);
  const isEmpty = areasWithVision.length === 0;

  const deleteArea = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/areas/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  const archiveArea = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: number }) =>
      apiRequest("PATCH", `/api/areas/${id}`, { archived: archived ? 0 : 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/areas"] }),
  });

  // Empty state (State 1)
  if (isEmpty && !showAddForm && areasWithoutVision.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto h-full flex flex-col">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 -mt-16">
          <Compass className="w-16 h-16 text-muted-foreground/30" />
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Visit your future.
            </h1>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Five years from now, you bump into a close friend at the airport.
              They ask how life is going. You can't stop smiling as you tell
              them everything that's happened. What does that conversation sound
              like?
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Start by naming the main areas of your life. Then we'll visit each
              one.
            </p>
          </div>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add your first area
          </Button>
          {showAddForm && (
            <InlineAreaCreate
              areas={areas}
              onCreated={(area) => {
                setShowAddForm(false);
                onOpenWriter(area.id, true);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // Empty state with add form visible
  if (isEmpty && showAddForm && areasWithoutVision.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto h-full flex flex-col">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 -mt-16">
          <Compass className="w-16 h-16 text-muted-foreground/30" />
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Visit your future.
            </h1>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Five years from now, you bump into a close friend at the airport.
              They ask how life is going. You can't stop smiling as you tell
              them everything that's happened. What does that conversation sound
              like?
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Start by naming the main areas of your life. Then we'll visit each
              one.
            </p>
          </div>
          <InlineAreaCreate
            areas={areas}
            onCreated={(area) => {
              setShowAddForm(false);
              onOpenWriter(area.id, true);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      </div>
    );
  }

  // Vision board (State 2) — also shown when there are stub areas but no visions
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="mb-6">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clarity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your foundation. Every identity, project, and routine traces back to
          here.
        </p>
      </div>

      {/* Area vision cards */}
      <div className="space-y-4">
        {areasWithVision.map((area) => (
          <div key={area.id} className={area.archived ? "opacity-50" : ""}>
            <AreaVisionCard
              area={area}
              onClick={() => onOpenWriter(area.id)}
              onEdit={() => onOpenWriter(area.id)}
              onDelete={() => deleteArea.mutate(area.id)}
              onArchive={() => archiveArea.mutate({ id: area.id, archived: area.archived ?? 0 })}
            />
          </div>
        ))}
      </div>

      {/* Stub cards for areas without vision */}
      {areasWithoutVision.length > 0 && (
        <div className="space-y-3">
          {areasWithoutVision.map((area) => (
            <Card
              key={area.id}
              className="border-dashed cursor-pointer hover:shadow-sm transition-shadow bg-muted/20"
              onClick={() => onOpenWriter(area.id)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  {area.name}
                </p>
                <span className="text-xs text-muted-foreground">
                  Add your vision →
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add another area */}
      {showAddForm ? (
        <InlineAreaCreate
          areas={areas}
          onCreated={(area) => {
            setShowAddForm(false);
            onOpenWriter(area.id, true);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <Button
          variant="ghost"
          className="w-full border-dashed border"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add another area
        </Button>
      )}

      {areas.some(a => a.archived) && (
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-2"
        >
          <Archive className="w-3 h-3" />
          {showArchived ? "Hide archived" : `Show archived (${areas.filter(a => a.archived).length})`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// VISION WRITER (State 3)
// ============================================================
function VisionWriter({
  area,
  onBack,
}: {
  area: Area;
  onBack: () => void;
}) {
  const [visionText, setVisionText] = useState(area.visionText || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Autofocus the textarea
    textareaRef.current?.focus();
  }, []);

  const saveVision = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/areas/${area.id}`, {
        visionText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      toast({ title: "Vision saved." });
      onBack();
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Button
          onClick={() => saveVision.mutate()}
          disabled={saveVision.isPending}
        >
          Save vision
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">In the area of...</p>
          <Badge variant="secondary" className="text-sm">
            {area.name}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Five years from now, your close friend asks how your{" "}
          <span className="font-medium text-foreground">{area.name}</span> life
          is going. You can't stop smiling. Tell them everything — write it as
          if it's already happened.
        </p>

        <Textarea
          ref={textareaRef}
          value={visionText}
          onChange={(e) => setVisionText(e.target.value)}
          placeholder={`My ${area.name} is...`}
          className="w-full min-h-[300px] text-base leading-relaxed resize-none border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
        />
      </div>
    </div>
  );
}

// ============================================================
// CLARITY PAGE — main export
// ============================================================
export default function HorizonsPage() {
  const [view, setView] = useState<ClarityView>({ type: "board" });
  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["/api/areas"],
  });

  if (view.type === "writer") {
    const area = areas.find((a) => a.id === view.areaId);
    if (!area) {
      // Area not found (maybe still loading), fall back to board
      return (
        <VisionBoard
          areas={areas}
          onOpenWriter={(areaId, isNew) =>
            setView({ type: "writer", areaId, isNew })
          }
        />
      );
    }
    return (
      <VisionWriter
        area={area}
        onBack={() => setView({ type: "board" })}
      />
    );
  }

  return (
    <VisionBoard
      areas={areas}
      onOpenWriter={(areaId, isNew) =>
        setView({ type: "writer", areaId, isNew })
      }
    />
  );
}
