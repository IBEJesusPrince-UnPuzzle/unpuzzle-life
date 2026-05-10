// PR #29b — File It page (Phase 8 inbox processing).
//
// Locked source: session b2f73166 turn 30 (verbatim ASCII at conversation.md
// :3438-3463). Plan: workspace/inbox-processing-plan.md Q2 (LOCKED 2026-05-10).
//
// Q2 (locked): filed_notes table, targetType expanded to 10 values to include
// agenda_task and project_task. The verbatim ASCII shows 4 radios
// (Role/Responsibility/Project/Support); Q2 added Task → 5 radios. Task and
// Support each reveal a sub-toggle to pick the concrete sub-type (the locked
// enum in shared/schema.ts holds the 10 final values).
//
// Server contract (PR #29a, MERGED #36):
//   POST /api/inbox/:id/process { action: "file_it",
//                                 payload: { targetType, targetId, note, tag? } }
// Returns 409 if already processed, 400 on bad targetType/missing fields.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import type {
  InboxItem, Role, Responsibility, Project, AgendaTask, ProjectTask,
  EnvironmentPerson, EnvironmentPlace, EnvironmentThing,
  EnvironmentProvider, EnvironmentCondition, FiledNoteTargetType,
} from "@shared/schema";

type TopRadio = "role" | "responsibility" | "project" | "task" | "support";
type TaskSub = "agenda_task" | "project_task";
type SupportSub =
  | "support_person" | "support_place" | "support_thing"
  | "support_provider" | "support_condition";

interface ItemOption {
  id: number;
  label: string;
}

export default function InboxFileItPage() {
  const [, params] = useRoute<{ id?: string }>("/inbox/process/:id/file-it");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const itemId = Number(params?.id);

  // Inbox item — used for the "filing this item" header and to prefill nothing
  // else (note text is captured separately per locked ASCII).
  const { data: inboxItem, isLoading: loadingItem, error: itemError } =
    useQuery<InboxItem>({
      queryKey: [`/api/inbox/${itemId}`],
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/inbox/${itemId}`);
        return r.json();
      },
      enabled: Number.isFinite(itemId) && itemId > 0,
    });

  // Form state.
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [topRadio, setTopRadio] = useState<TopRadio>("responsibility");
  const [taskSub, setTaskSub] = useState<TaskSub>("agenda_task");
  const [supportSub, setSupportSub] = useState<SupportSub>("support_person");
  const [pickedId, setPickedId] = useState<string>(""); // string for Select

  // Reset picked id whenever the target type changes — different lists, different ids.
  useEffect(() => {
    setPickedId("");
  }, [topRadio, taskSub, supportSub]);

  // ---- Item lists per target type ----
  // Each list is enabled only when its branch is selected, so we don't pull
  // five tables on page load.
  const enabledRole = topRadio === "role";
  const enabledResp = topRadio === "responsibility";
  const enabledProj = topRadio === "project";
  const enabledAgendaTask = topRadio === "task" && taskSub === "agenda_task";
  const enabledProjectTask = topRadio === "task" && taskSub === "project_task";
  const enabledPerson = topRadio === "support" && supportSub === "support_person";
  const enabledPlace = topRadio === "support" && supportSub === "support_place";
  const enabledThing = topRadio === "support" && supportSub === "support_thing";
  const enabledProvider = topRadio === "support" && supportSub === "support_provider";
  const enabledCondition = topRadio === "support" && supportSub === "support_condition";

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"], enabled: enabledRole,
  });
  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ["/api/responsibilities"], enabled: enabledResp,
  });
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"], enabled: enabledProj,
  });

  // Agenda tasks: pull a 60-day window centered on today. Filter to standalone
  // tasks (those with a non-null title) — recurring/responsibility-origin
  // virtuals don't have stable IDs that File It can attach to.
  const agendaWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 30);
    const end = new Date(now);   end.setDate(now.getDate() + 30);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(start), to: fmt(end) };
  }, []);
  const { data: agendaTasksRaw = [] } = useQuery<Array<AgendaTask & { isVirtual: boolean; masterId: number }>>({
    queryKey: [`/api/agenda?from=${agendaWindow.from}&to=${agendaWindow.to}`],
    enabled: enabledAgendaTask,
  });
  const agendaTasks = useMemo(
    () => agendaTasksRaw.filter(t => !t.isVirtual && t.title && t.title.trim().length > 0),
    [agendaTasksRaw]
  );

  const { data: projectTasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/project-tasks"], enabled: enabledProjectTask,
  });

  const { data: people = [] } = useQuery<EnvironmentPerson[]>({
    queryKey: ["/api/environment/people"], enabled: enabledPerson,
  });
  const { data: places = [] } = useQuery<EnvironmentPlace[]>({
    queryKey: ["/api/environment/places"], enabled: enabledPlace,
  });
  const { data: things = [] } = useQuery<EnvironmentThing[]>({
    queryKey: ["/api/environment/things"], enabled: enabledThing,
  });
  const { data: providers = [] } = useQuery<EnvironmentProvider[]>({
    queryKey: ["/api/environment/providers"], enabled: enabledProvider,
  });
  const { data: conditions = [] } = useQuery<EnvironmentCondition[]>({
    queryKey: ["/api/environment/conditions"], enabled: enabledCondition,
  });

  // Map current selection → server targetType + options.
  const { targetType, options }: {
    targetType: FiledNoteTargetType;
    options: ItemOption[];
  } = useMemo(() => {
    if (topRadio === "role") {
      return { targetType: "role", options: roles.map(r => ({ id: r.id, label: r.name })) };
    }
    if (topRadio === "responsibility") {
      return { targetType: "responsibility", options: responsibilities.map(r => ({ id: r.id, label: r.name })) };
    }
    if (topRadio === "project") {
      return { targetType: "project", options: projects.map(p => ({ id: p.id, label: p.title })) };
    }
    if (topRadio === "task") {
      if (taskSub === "agenda_task") {
        return {
          targetType: "agenda_task",
          options: agendaTasks.map(t => ({
            id: t.id,
            label: `${t.title ?? "(untitled)"} — ${t.startDate}${t.time ? ` ${t.time}` : ""}`,
          })),
        };
      }
      // project_task
      const projTitle = (pid: number) => projects.find(p => p.id === pid)?.title;
      return {
        targetType: "project_task",
        options: projectTasks.map(t => ({
          id: t.id,
          label: projTitle(t.projectId) ? `${t.title} — ${projTitle(t.projectId)}` : t.title,
        })),
      };
    }
    // support
    if (supportSub === "support_person") {
      return { targetType: "support_person", options: people.map(p => ({ id: p.id, label: p.name })) };
    }
    if (supportSub === "support_place") {
      return { targetType: "support_place", options: places.map(p => ({ id: p.id, label: p.name })) };
    }
    if (supportSub === "support_thing") {
      return { targetType: "support_thing", options: things.map(t => ({ id: t.id, label: t.name })) };
    }
    if (supportSub === "support_provider") {
      return { targetType: "support_provider", options: providers.map(p => ({ id: p.id, label: p.name })) };
    }
    return { targetType: "support_condition", options: conditions.map(c => ({ id: c.id, label: c.name })) };
  }, [
    topRadio, taskSub, supportSub,
    roles, responsibilities, projects, agendaTasks, projectTasks,
    people, places, things, providers, conditions,
  ]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/inbox/${itemId}/process`, {
        action: "file_it",
        payload: {
          targetType,
          targetId: Number(pickedId),
          note: note.trim(),
          tag: tag.trim() || undefined,
        },
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filed-notes"] });
      toast({ title: "Note filed" });
      navigate("/inbox");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't file note", description: err.message, variant: "destructive" });
    },
  });

  const canSave =
    !!note.trim() &&
    !!pickedId &&
    !saveMut.isPending &&
    Number.isFinite(itemId);

  // ---- Render ----
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-destructive">Invalid inbox item.</p>
        <Button variant="ghost" onClick={() => navigate("/inbox")}>Back to Inbox</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header — mirrors ASCII "← Back ... File note" */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/inbox")}
          data-testid="button-file-it-back"
          className="-ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold tracking-tight ml-auto">File note</h1>
      </div>

      {loadingItem ? (
        <p className="text-sm text-muted-foreground">Loading item...</p>
      ) : itemError ? (
        <p className="text-sm text-destructive">Couldn't load inbox item.</p>
      ) : inboxItem?.processed ? (
        <p className="text-sm text-muted-foreground">
          This item has already been processed.{" "}
          <Button variant="ghost" size="sm" onClick={() => navigate("/inbox")}>
            Back to Inbox
          </Button>
        </p>
      ) : (
        <>
          {/* Source item context — filing FROM this inbox capture. */}
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Filing this item</p>
            <p className="break-words">{inboxItem?.content}</p>
          </div>

          {/* Note — what to keep */}
          <div className="space-y-2">
            <Label htmlFor="file-it-note">Note</Label>
            <p className="text-xs text-muted-foreground">What do you want to keep?</p>
            <Textarea
              id="file-it-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write the note you want to keep on this item..."
              rows={4}
              data-testid="textarea-file-it-note"
            />
          </div>

          {/* Attach to — top-level radio (5 options per locked Q2) */}
          <div className="space-y-2">
            <Label>Attach to</Label>
            <p className="text-xs text-muted-foreground">Choose where this note belongs.</p>
            <RadioGroup
              value={topRadio}
              onValueChange={(v) => setTopRadio(v as TopRadio)}
              className="grid gap-2"
            >
              {([
                ["role", "Role"],
                ["responsibility", "Responsibility"],
                ["project", "Project"],
                ["task", "Task"],
                ["support", "Support"],
              ] as const).map(([val, label]) => (
                <div className="flex items-center gap-2" key={val}>
                  <RadioGroupItem value={val} id={`top-${val}`} data-testid={`radio-top-${val}`} />
                  <Label htmlFor={`top-${val}`} className="cursor-pointer font-normal">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Task sub-toggle (only when topRadio = task) */}
          {topRadio === "task" && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label>Task type</Label>
              <RadioGroup
                value={taskSub}
                onValueChange={(v) => setTaskSub(v as TaskSub)}
                className="grid gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="agenda_task" id="task-agenda" data-testid="radio-task-agenda" />
                  <Label htmlFor="task-agenda" className="cursor-pointer font-normal">Agenda task</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="project_task" id="task-project" data-testid="radio-task-project" />
                  <Label htmlFor="task-project" className="cursor-pointer font-normal">Project task</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Support sub-toggle (only when topRadio = support) */}
          {topRadio === "support" && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label>Support type</Label>
              <RadioGroup
                value={supportSub}
                onValueChange={(v) => setSupportSub(v as SupportSub)}
                className="grid gap-2"
              >
                {([
                  ["support_person", "Person"],
                  ["support_place", "Place"],
                  ["support_thing", "Thing"],
                  ["support_provider", "Provider"],
                  ["support_condition", "Condition"],
                ] as const).map(([val, label]) => (
                  <div className="flex items-center gap-2" key={val}>
                    <RadioGroupItem value={val} id={`sup-${val}`} data-testid={`radio-sup-${val}`} />
                    <Label htmlFor={`sup-${val}`} className="cursor-pointer font-normal">{label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Item picker */}
          <div className="space-y-2">
            <Label htmlFor="file-it-item">Item</Label>
            <p className="text-xs text-muted-foreground">Choose the specific item to attach this note to.</p>
            <Select value={pickedId} onValueChange={setPickedId}>
              <SelectTrigger id="file-it-item" data-testid="select-file-it-item">
                <SelectValue placeholder={
                  options.length === 0 ? "No items in this category yet" : "Choose an item..."
                } />
              </SelectTrigger>
              <SelectContent>
                {options.map(opt => (
                  <SelectItem
                    key={opt.id}
                    value={String(opt.id)}
                    data-testid={`select-item-${opt.id}`}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional tag */}
          <div className="space-y-2">
            <Label htmlFor="file-it-tag">Optional tag</Label>
            <p className="text-xs text-muted-foreground">Use only if helpful.</p>
            <Input
              id="file-it-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Travel logistics"
              data-testid="input-file-it-tag"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => navigate("/inbox")}
              data-testid="button-file-it-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!canSave}
              data-testid="button-file-it-save"
            >
              {saveMut.isPending ? "Saving..." : "Save note"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
