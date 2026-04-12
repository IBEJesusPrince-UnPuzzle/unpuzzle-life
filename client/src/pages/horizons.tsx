import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Compass, Plus, Pencil, ArrowLeft, MoreHorizontal, Clock, Archive, Copy, Check, X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePreferences } from "@/hooks/use-preferences";
import type { Area } from "@shared/schema";

type ClarityView =
  | { type: "board" }
  | { type: "writer"; areaId: number; isNew?: boolean };

// ============================================================
// HELPER: format ISO timestamp for display
// ============================================================
function formatSnapshotDate(iso: string, timeFormat: "12h" | "24h"): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  if (timeFormat === "24h") {
    return `${date} at ${h.toString().padStart(2, "0")}:${m}`;
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${date} at ${h12}:${m} ${ampm}`;
}

// ============================================================
// PURPOSE BANNER — tap to edit
// ============================================================
function PurposeBanner() {
  const { data: purposes = [] } = useQuery<any[]>({ queryKey: ["/api/purposes"] });
  const purpose = purposes[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const updatePurpose = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/purposes/${purpose.id}`, { statement: draft.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      setEditing(false);
    },
  });

  const createPurpose = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/purposes", {
        statement: draft.trim(),
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      setEditing(false);
    },
  });

  const handleSave = () => {
    if (!draft.trim()) return;
    if (purpose) {
      updatePurpose.mutate();
    } else {
      createPurpose.mutate();
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(purpose?.statement || "");
  };

  const startEditing = () => {
    setDraft(purpose?.statement || "");
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purpose</label>
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. To live with integrity, create joy for my family, and leave the world better than I found it..."
          className="min-h-[80px] text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") handleCancel();
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleSave}
            disabled={!draft.trim() || updatePurpose.isPending || createPurpose.isPending}
          >
            <Check className="w-3 h-3" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={handleCancel}
          >
            <X className="w-3 h-3" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Display mode
  if (!purpose) {
    return (
      <button
        onClick={startEditing}
        className="w-full rounded-lg border border-dashed border-primary/20 bg-muted/20 p-4 text-left group hover:bg-primary/[0.03] transition-colors"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Purpose</p>
        <p className="text-sm text-muted-foreground italic">
          Tap to define your life's purpose...
        </p>
      </button>
    );
  }

  return (
    <button
      onClick={startEditing}
      className="w-full rounded-lg border border-primary/10 bg-primary/[0.02] p-4 text-left group hover:bg-primary/[0.05] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Purpose</p>
          <p className="text-sm leading-relaxed">{purpose.statement}</p>
        </div>
        <Pencil className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0 mt-5" />
      </div>
    </button>
  );
}

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
// VISION EDITOR DIALOG
// ============================================================
function VisionEditorDialog({
  area,
  open,
  onOpenChange,
}: {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visionText, setVisionText] = useState(area.visionText || "");
  const [note, setNote] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setVisionText(area.visionText || "");
      setNote("");
    }
  }, [open, area.visionText]);

  const saveVision = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/areas/${area.id}/vision`, {
        vision: visionText,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: [`/api/areas/${area.id}/snapshots`] });
      toast({ title: "Vision updated. Snapshot saved." });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Vision</DialogTitle>
          <DialogDescription>
            Update the vision for <span className="font-medium text-foreground">{area.name}</span>. The area name cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Area</label>
            <div className="mt-1">
              <Badge variant="secondary" className="text-sm">{area.name}</Badge>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Vision / Description</label>
            <Textarea
              value={visionText}
              onChange={(e) => setVisionText(e.target.value)}
              placeholder={`My ${area.name} is...`}
              className="mt-1 min-h-[200px] resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Reason for change (optional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why the change? (optional)"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveVision.mutate()} disabled={saveVision.isPending}>
            Save vision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// ARCHIVE CONFIRMATION MODAL
// ============================================================
function ArchiveModal({
  area,
  open,
  onOpenChange,
}: {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();

  const { data: preview } = useQuery({
    queryKey: [`/api/areas/${area.id}/archive-preview`],
    queryFn: () => apiRequest("GET", `/api/areas/${area.id}/archive-preview`).then(r => r.json()),
    enabled: open,
  });

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/areas/${area.id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      toast({ title: `${area.name} has been archived.` });
      onOpenChange(false);
    },
  });

  const nameMatches = confirmText.trim() === area.name;
  const hasLinkedItems = preview && (
    preview.identities?.length > 0 || preview.projects?.length > 0 ||
    preview.habits?.length > 0 || preview.tasks?.length > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Archive {area.name}</DialogTitle>
          <DialogDescription>
            This will archive this area and all linked items. They will no longer appear in active views.
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="space-y-2 text-sm">
            {hasLinkedItems ? (
              <>
                <p className="font-medium">Archiving <span className="text-foreground">{area.name}</span> will also archive:</p>
                {preview.identities?.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">{preview.identities.length} {preview.identities.length === 1 ? "Identity" : "Identities"}:</span>{" "}
                    {preview.identities.map((i: any) => i.name).join(", ")}
                  </p>
                )}
                {preview.projects?.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">{preview.projects.length} {preview.projects.length === 1 ? "Project" : "Projects"}:</span>{" "}
                    {preview.projects.map((p: any) => p.name).join(", ")}
                  </p>
                )}
                {preview.habits?.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">{preview.habits.length} {preview.habits.length === 1 ? "Habit" : "Habits"}:</span>{" "}
                    {preview.habits.map((h: any) => h.name).join(", ")}
                  </p>
                )}
                {preview.tasks?.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">{preview.tasks.length} {preview.tasks.length === 1 ? "Task" : "Tasks"}:</span>{" "}
                    {preview.tasks.map((t: any) => t.name).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No linked items will be affected.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Type <span className="font-bold">{area.name}</span> to confirm</label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={area.name}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => archiveMutation.mutate()}
            disabled={!nameMatches || archiveMutation.isPending}
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DUPLICATE & ARCHIVE MODAL
// ============================================================
function DuplicateArchiveModal({
  area,
  areas,
  open,
  onOpenChange,
}: {
  area: Area;
  areas: Area[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [newName, setNewName] = useState(area.name);
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setNewName(area.name);
      setConfirmText("");
    }
  }, [open, area.name]);

  const duplicateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/areas/${area.id}/duplicate-and-archive`, { newName: newName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/identities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      toast({ title: `${area.name} archived. All linked items moved to '${newName.trim()}'.` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to duplicate and archive." });
    },
  });

  const nameMatches = confirmText.trim() === area.name;
  const nameCollision = areas.some(
    a => a.id !== area.id && a.name.toLowerCase() === newName.trim().toLowerCase()
  );
  const canSubmit = nameMatches && newName.trim().length > 0 && !nameCollision;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate & Archive</DialogTitle>
          <DialogDescription>
            This will create a new area and move all linked items (identities, habits, projects, tasks) to it.
            The original <span className="font-medium text-foreground">{area.name}</span> will be archived.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">New area name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New area name"
              className="mt-1"
            />
            {nameCollision && (
              <p className="text-xs text-destructive mt-1">An area with this name already exists.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Type <span className="font-bold">{area.name}</span> to confirm archiving the original</label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={area.name}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => duplicateMutation.mutate()}
            disabled={!canSubmit || duplicateMutation.isPending}
          >
            Duplicate & Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SNAPSHOT HISTORY TIMELINE
// ============================================================
function SnapshotTimeline({
  areaId,
  expanded,
  onToggle,
}: {
  areaId: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: prefs } = usePreferences();
  const timeFormat = (prefs?.timeFormat as "12h" | "24h") || "12h";

  const { data: snapshots = [] } = useQuery({
    queryKey: [`/api/areas/${areaId}/snapshots`],
    queryFn: () => apiRequest("GET", `/api/areas/${areaId}/snapshots`).then(r => r.json()),
    enabled: expanded,
  });

  if (!expanded || snapshots.length === 0) return null;

  return (
    <div className="mt-2 border rounded-lg bg-muted/30 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Vision History</p>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="space-y-3">
        {snapshots.map((snap: any) => (
          <div key={snap.id} className="border-l-2 border-muted-foreground/20 pl-3">
            <p className="text-xs text-muted-foreground">
              {formatSnapshotDate(snap.changedAt, timeFormat)}
            </p>
            <p className="text-sm mt-0.5">{snap.previousVision}</p>
            {snap.note && (
              <p className="text-xs text-muted-foreground italic mt-0.5">{snap.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// AREA VISION CARD (redesigned)
// ============================================================
function AreaVisionCard({
  area,
  areas,
  onClick,
}: {
  area: Area;
  areas: Area[];
  onClick: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Get snapshot count for badge
  const { data: snapshots = [] } = useQuery({
    queryKey: [`/api/areas/${area.id}/snapshots`],
    queryFn: () => apiRequest("GET", `/api/areas/${area.id}/snapshots`).then(r => r.json()),
  });

  const snapshotCount = snapshots.length;

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={onClick}
      >
        <CardContent className="p-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold">{area.name}</p>
              {/* History badge */}
              {snapshotCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryExpanded(!historyExpanded);
                  }}
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="View vision history"
                >
                  <Clock className="w-3 h-3" />
                  <span>{snapshotCount}</span>
                </button>
              )}
            </div>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pencil icon → vision editor */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setEditOpen(true)}
                title="Edit vision"
              >
                <Pencil className="w-3 h-3" />
              </Button>

              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Duplicate & Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setArchiveOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="w-3.5 h-3.5 mr-2" />
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

          {/* Inline snapshot timeline */}
          {historyExpanded && (
            <div onClick={(e) => e.stopPropagation()}>
              <SnapshotTimeline
                areaId={area.id}
                expanded={historyExpanded}
                onToggle={() => setHistoryExpanded(false)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <VisionEditorDialog area={area} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveModal area={area} open={archiveOpen} onOpenChange={setArchiveOpen} />
      <DuplicateArchiveModal area={area} areas={areas} open={duplicateOpen} onOpenChange={setDuplicateOpen} />
    </>
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
  const areasWithVision = areas.filter((a) => a.visionText);
  const areasWithoutVision = areas.filter((a) => !a.visionText);
  const isEmpty = areasWithVision.length === 0;

  // Empty state (State 1)
  if (isEmpty && !showAddForm && areasWithoutVision.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex flex-col">
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
      <div className="p-6 max-w-4xl mx-auto flex flex-col">
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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

      {/* Purpose banner — tap to edit */}
      <PurposeBanner />

      {/* Area vision cards */}
      <div className="space-y-4">
        {areasWithVision.map((area) => (
          <AreaVisionCard
            key={area.id}
            area={area}
            areas={areas}
            onClick={() => onOpenWriter(area.id)}
          />
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
                  Add your vision &rarr;
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
      apiRequest("PATCH", `/api/areas/${area.id}/vision`, {
        vision: visionText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: [`/api/areas/${area.id}/snapshots`] });
      toast({ title: "Vision saved." });
      onBack();
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col">
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
  // Sync view state to URL hash params for deep linking
  const [view, setViewState] = useState<ClarityView>(() => {
    const hash = window.location.hash;
    const searchIdx = hash.indexOf("?");
    if (searchIdx !== -1) {
      const params = new URLSearchParams(hash.slice(searchIdx));
      const areaId = params.get("areaId");
      if (areaId) return { type: "writer", areaId: Number(areaId) };
    }
    return { type: "board" };
  });

  const setView = (v: ClarityView) => {
    setViewState(v);
    const basePath = "#/horizons";
    if (v.type === "writer") {
      window.history.replaceState(null, "", `${basePath}?areaId=${v.areaId}`);
    } else {
      window.history.replaceState(null, "", basePath);
    }
  };

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
