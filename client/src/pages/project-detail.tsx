import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen, Users, MapPin, Package, Plus, Clock, CheckCircle2,
  Repeat, Archive, Sparkles, Trash2, ArrowLeft, Fingerprint, Repeat2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Identity, Area, RoutineItem, PlannerTask } from "@shared/schema";
import { formatRecurrence } from "./planner";
import { getPieceColor } from "@/lib/piece-colors";

const PIECE_DESCRIPTORS: Record<string, string> = {
  reason:   "Purpose, beliefs & principles",
  finance:  "Money, assets & abundance",
  fitness:  "Health, energy & longevity",
  talent:   "Skills, work & contribution",
  pleasure: "Joy, relationships & play",
};

interface IdentityProjectDetails {
  identityId: number;
  identity: Identity;
  area: Area | null;
  areas: Area[];
  title: string;
  tag: string;
  routineItems: RoutineItem[];
  plannerTasks: PlannerTask[];
}

// ============================================================
// CONTACT METHOD OPTIONS — grouped
// ============================================================
const CONTACT_METHOD_GROUPS = [
  {
    label: "Call",
    options: [
      { value: "receive_video_call", label: "receive a video call from" },
      { value: "video_call", label: "video call" },
      { value: "receive_phone_call", label: "receive a phone call from" },
      { value: "call", label: "call" },
    ],
  },
  {
    label: "Text",
    options: [
      { value: "receive_text", label: "receive a text from" },
      { value: "text", label: "text" },
    ],
  },
  {
    label: "Message",
    options: [
      { value: "receive_message", label: "receive a message from" },
      { value: "message", label: "message" },
    ],
  },
  {
    label: "Email",
    options: [
      { value: "receive_email", label: "receive an email from" },
      { value: "email", label: "email" },
    ],
  },
  {
    label: "Meet",
    options: [
      { value: "welcome_location", label: "welcome, to my location," },
      { value: "travel_meet", label: "travel to meet" },
    ],
  },
];

// Flat lookup for display
const ALL_CONTACT_METHODS: Record<string, string> = {};
CONTACT_METHOD_GROUPS.forEach(g => g.options.forEach(o => { ALL_CONTACT_METHODS[o.value] = o.label; }));

// ============================================================
// TRAVEL METHOD OPTIONS — grouped
// ============================================================
const TRAVEL_METHOD_GROUPS = [
  {
    label: null, // no group header for simple options
    options: [
      { value: "walk", label: "walk" },
      { value: "drive", label: "drive" },
      { value: "fly", label: "fly" },
    ],
  },
  {
    label: "Cycle",
    options: [
      { value: "bicycle", label: "bicycle" },
      { value: "motorcycle", label: "motorcycle" },
    ],
  },
  {
    label: "Ride",
    options: [
      { value: "ride_bus", label: "ride a bus" },
      { value: "ride_subway", label: "ride a subway" },
      { value: "ride_train", label: "ride a train" },
    ],
  },
];

const ALL_TRAVEL_METHODS: Record<string, string> = {};
TRAVEL_METHOD_GROUPS.forEach(g => g.options.forEach(o => { ALL_TRAVEL_METHODS[o.value] = o.label; }));

// ============================================================
// READY STATUS OPTIONS
// ============================================================
const READY_STATUS_OPTIONS = [
  { value: "ready", label: "ready" },
  { value: "not_ready", label: "not ready" },
];

// ============================================================
// PROJECT DETAIL PAGE
// ============================================================

export default function ProjectDetailPage({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery<IdentityProjectDetails>({
    queryKey: ["/api/identity-projects", id],
    queryFn: () => apiRequest("GET", `/api/identity-projects/${id}`).then(r => r.json()),
    enabled: !!id && id > 0,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-destructive">Failed to load project: {(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const { identity, area, routineItems, plannerTasks } = data;
  const pieceColor = getPieceColor(identity.puzzlePiece);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="p-6 space-y-6">
      {/* Back button */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Header — colored left border accent */}
      <div
        className="pl-4 border-l-4"
        style={identity.puzzlePiece ? { borderLeftColor: pieceColor.accent } : {}}
      >
        {/* Puzzle piece + area breadcrumb */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {identity.puzzlePiece && (
            <Link href="/unpuzzle">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer ${pieceColor.bg} ${pieceColor.text}`}>
                {pieceColor.label || identity.puzzlePiece}
              </span>
            </Link>
          )}
          {area && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <Link href="/horizons">
                <span className="text-[10px] text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors">{area.name}</span>
              </Link>
            </>
          )}
        </div>

        {/* Identity statement */}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold tracking-tight">
            {identity.statement}
          </h1>
        </div>

        {/* Badge row */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Identity badge — links to UnPuzzle page */}
          <Link href="/unpuzzle">
            <Badge
              variant="outline"
              className={`text-[10px] h-5 px-1.5 gap-1 cursor-pointer transition-colors ${pieceColor.text} ${pieceColor.border} hover:${pieceColor.bg}`}
            >
              <Fingerprint className="w-3 h-3" /> Identity
            </Badge>
          </Link>

          {/* Daily Agenda badge — links to /planner */}
          <Link href="/planner">
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-primary/10 transition-colors text-primary border-primary/20">
              <Clock className="w-3 h-3" /> Daily Agenda
            </Badge>
          </Link>
        </div>
      </div>

      {/* Identity Details Card */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Identity Chain</p>
          {identity.puzzlePiece && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5">
                <Link href="/unpuzzle">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer ${pieceColor.bg} ${pieceColor.text}`}>
                    {pieceColor.label || identity.puzzlePiece}
                  </span>
                </Link>
                {area && (
                  <>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <Link href="/horizons">
                      <span className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">{area.name}</span>
                    </Link>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{PIECE_DESCRIPTORS[identity.puzzlePiece?.toLowerCase()] || ""}</p>
            </div>
          )}
          <p className="text-sm">
            <span className="text-muted-foreground">I'm the type of person who will</span>{" "}
            <span className="font-medium">{identity.statement}</span>
          </p>
          {identity.cue && (
            <p className="text-sm">
              <span className="text-muted-foreground">Triggered</span>{" "}
              <span className="font-medium">{identity.cue}</span>
            </p>
          )}
          {identity.timeOfDay && (
            <p className="text-sm">
              <span className="text-muted-foreground">In the</span>{" "}
              <span className="font-medium">{identity.timeOfDay}</span>
            </p>
          )}
          {identity.location && (
            <p className="text-sm">
              <span className="text-muted-foreground">Taking place at</span>{" "}
              <span className="font-medium">{identity.location}</span>
            </p>
          )}
          {identity.craving && (
            <p className="text-sm">
              <span className="text-muted-foreground">Because I</span>{" "}
              <span className="font-medium">{identity.craving}</span>
            </p>
          )}
          {identity.reward && (
            <p className="text-sm">
              <span className="text-muted-foreground">So this makes sure I'll have</span>{" "}
              <span className="font-medium">{identity.reward}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              <Repeat className="w-2.5 h-2.5 mr-0.5" />
              {formatRecurrence(identity.frequency)}
            </Badge>
            {routineItems.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-violet-600 dark:text-violet-400 border-violet-500/30">
                {routineItems.length} routine{routineItems.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* People Section */}
      <PeopleSection habitId={id} />

      {/* Places Section */}
      <PlacesSection habitId={id} />

      {/* Things Section */}
      <ThingsSection habitId={id} />

      {/* Related Planner Tasks */}
      {plannerTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Scheduled Tasks ({plannerTasks.length})
          </p>
          {plannerTasks.slice(0, 5).map(t => (
            <Card key={t.id} className={t.status === "done" ? "opacity-50" : ""}>
              <CardContent className="p-3 flex items-center gap-2">
                {t.status === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${t.status === "done" ? "line-through" : ""}`}>{t.goal}</p>
                  <p className="text-[10px] text-muted-foreground">{t.date}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

// ============================================================
// PEOPLE SECTION
// ============================================================

interface PersonData {
  name: string;
  contactMethod: string;
  contactInfo: string;
  notes: string;
}

export function parsePerson(goal: string): PersonData | null {
  try {
    const p = JSON.parse(goal);
    if (p && typeof p.name === "string") return p as PersonData;
  } catch { /* not JSON, legacy item */ }
  return null;
}

export function formatPersonDisplay(p: PersonData): string {
  const method = ALL_CONTACT_METHODS[p.contactMethod] || p.contactMethod;
  return `I will ${method} ${p.name}${p.contactInfo ? ` via ${p.contactInfo}` : ""}`;
}

export function formatPersonAgenda(p: PersonData): { line1: string; line2: string } {
  const method = ALL_CONTACT_METHODS[p.contactMethod] || p.contactMethod;
  return {
    line1: `${method} ${p.name}${p.contactInfo ? ` via ${p.contactInfo}` : ""}`,
    line2: p.notes ? `Why this person: ${p.notes}` : "",
  };
}

function PeopleSection({ habitId }: { habitId: number }) {
  const [name, setName] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");

  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "project", habitId, "people"],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?habitId=${habitId}&sourceType=project_people`).then(r => r.json()),
    retry: 2,
  });

  const addPerson = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date: new Date().toISOString().split("T")[0],
      goal: JSON.stringify({ name, contactMethod, contactInfo, notes }),
      habitId,
      sourceType: "project_people",
      status: "planned",
      isDraft: 0,
    }),
    onSuccess: () => {
      setName(""); setContactMethod(""); setContactInfo(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] });
    },
  });

  const deletePerson = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planner-tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] }),
  });

  const convertToTask = useMutation({
    mutationFn: (person: PlannerTask) => {
      const p = parsePerson(person.goal);
      const taskGoal = p ? person.goal : person.goal; // keep JSON for agenda rendering
      return apiRequest("POST", "/api/planner-tasks", {
        date: new Date().toISOString().split("T")[0],
        goal: taskGoal,
        habitId,
        sourceType: "project_people",
        status: "planned",
        isDraft: 1,
        areaId: person.areaId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: status === "done" ? "planned" : "done" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "people"] }),
  });

  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">People</h2>
        </div>
        <p className="text-[10px] text-muted-foreground ml-6">
          Who supports this identity and how will you connect?
        </p>
      </div>

      {/* Add person form */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person's name"
            className="text-sm h-8"
          />
          <div>
            <p className="text-[11px] text-muted-foreground mb-1 ml-0.5">I will...</p>
            <Select value={contactMethod} onValueChange={setContactMethod}>
              <SelectTrigger className="text-sm h-8">
                <SelectValue placeholder="Contact method" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_METHOD_GROUPS.map(group => [
                  <SelectItem key={`hdr-${group.label}`} value={`__hdr_${group.label}`} disabled className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border-b border-primary/10">
                    {group.label}
                  </SelectItem>,
                  ...group.options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  )),
                ])}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="Phone, email, handle, location..."
            className="text-sm h-8"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this person? (optional)"
            className="text-sm h-8"
          />
          <Button
            size="sm"
            className="h-8 w-full"
            disabled={!name.trim()}
            onClick={() => addPerson.mutate()}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Person
          </Button>
        </CardContent>
      </Card>

      {/* Pending people */}
      {pending.map(t => {
        const person = parsePerson(t.goal);
        const display = person ? formatPersonDisplay(person) : t.goal;
        return (
          <div key={t.id} className="flex items-start gap-2 px-2 py-2 rounded hover:bg-accent transition-colors group">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 shrink-0 mt-0.5"
            />
            <span className="text-sm flex-1">{display}</span>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => convertToTask.mutate(t)}
                className="text-primary/60 hover:text-primary transition-colors p-0.5"
                title="Turn into a task"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deletePerson.mutate(t.id)}
                className="text-destructive/60 hover:text-destructive transition-colors p-0.5"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Done people */}
      {done.map(t => {
        const person = parsePerson(t.goal);
        const display = person ? formatPersonDisplay(person) : t.goal;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />
            </button>
            <span className="text-sm flex-1 line-through">{display}</span>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2">No people added yet</p>
      )}
    </div>
  );
}

// ============================================================
// PLACES SECTION
// ============================================================

interface PlaceData {
  name: string;
  address: string;
  travelMethod: string;
  notes: string;
}

export function parsePlace(goal: string): PlaceData | null {
  try {
    const p = JSON.parse(goal);
    if (p && typeof p.name === "string" && "travelMethod" in p) return p as PlaceData;
  } catch { /* not JSON, legacy item */ }
  return null;
}

export function formatPlaceDisplay(p: PlaceData): string {
  const method = ALL_TRAVEL_METHODS[p.travelMethod] || p.travelMethod;
  return `I will ${method} to ${p.name}${p.address ? ` via ${p.address}` : ""}`;
}

export function formatPlaceAgenda(p: PlaceData): { line1: string; line2: string } {
  const method = ALL_TRAVEL_METHODS[p.travelMethod] || p.travelMethod;
  return {
    line1: `${method} to ${p.name}${p.address ? ` via ${p.address}` : ""}`,
    line2: p.notes ? `Why this place: ${p.notes}` : "",
  };
}

function PlacesSection({ habitId }: { habitId: number }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [travelMethod, setTravelMethod] = useState("");
  const [notes, setNotes] = useState("");

  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "project", habitId, "places"],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?habitId=${habitId}&sourceType=project_places`).then(r => r.json()),
    retry: 2,
  });

  const addPlace = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date: new Date().toISOString().split("T")[0],
      goal: JSON.stringify({ name, address, travelMethod, notes }),
      habitId,
      sourceType: "project_places",
      status: "planned",
      isDraft: 0,
    }),
    onSuccess: () => {
      setName(""); setAddress(""); setTravelMethod(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "places"] });
    },
  });

  const deletePlace = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planner-tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "places"] }),
  });

  const convertToTask = useMutation({
    mutationFn: (task: PlannerTask) => {
      return apiRequest("POST", "/api/planner-tasks", {
        date: new Date().toISOString().split("T")[0],
        goal: task.goal, // keep JSON for agenda rendering
        habitId,
        sourceType: "project_places",
        status: "planned",
        isDraft: 1,
        areaId: task.areaId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: status === "done" ? "planned" : "done" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "places"] }),
  });

  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">Places</h2>
        </div>
        <p className="text-[10px] text-muted-foreground ml-6">
          Where are the physical places that support this identity and how will you get there?
        </p>
      </div>

      {/* Add place form */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Place name"
            className="text-sm h-8"
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            className="text-sm h-8"
          />
          <div>
            <p className="text-[11px] text-muted-foreground mb-1 ml-0.5">I will...</p>
            <Select value={travelMethod} onValueChange={setTravelMethod}>
              <SelectTrigger className="text-sm h-8">
                <SelectValue placeholder="Travel method" />
              </SelectTrigger>
              <SelectContent>
                {TRAVEL_METHOD_GROUPS.map((group) => [
                  ...(group.label ? [
                    <SelectItem key={`hdr-${group.label}`} value={`__hdr_${group.label}`} disabled className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border-b border-primary/10">
                      {group.label}
                    </SelectItem>
                  ] : []),
                  ...group.options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  )),
                ])}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this place? (optional)"
            className="text-sm h-8"
          />
          <Button
            size="sm"
            className="h-8 w-full"
            disabled={!name.trim()}
            onClick={() => addPlace.mutate()}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Place
          </Button>
        </CardContent>
      </Card>

      {/* Pending places */}
      {pending.map(t => {
        const place = parsePlace(t.goal);
        const display = place ? formatPlaceDisplay(place) : t.goal;
        return (
          <div key={t.id} className="flex items-start gap-2 px-2 py-2 rounded hover:bg-accent transition-colors group">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 shrink-0 mt-0.5"
            />
            <span className="text-sm flex-1">{display}</span>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => convertToTask.mutate(t)}
                className="text-primary/60 hover:text-primary transition-colors p-0.5"
                title="Turn into a task"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deletePlace.mutate(t.id)}
                className="text-destructive/60 hover:text-destructive transition-colors p-0.5"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Done places */}
      {done.map(t => {
        const place = parsePlace(t.goal);
        const display = place ? formatPlaceDisplay(place) : t.goal;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />
            </button>
            <span className="text-sm flex-1 line-through">{display}</span>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2">No places added yet</p>
      )}
    </div>
  );
}

// ============================================================
// THINGS SECTION
// ============================================================

interface ThingData {
  name: string;
  purposeUse: string;
  use: string;
  readyUse: string;
}

export function parseThing(goal: string): ThingData | null {
  try {
    const p = JSON.parse(goal);
    if (p && typeof p.name === "string" && "purposeUse" in p) return p as ThingData;
  } catch { /* not JSON, legacy item */ }
  return null;
}

export function formatThingDisplay(p: ThingData): string {
  const ready = READY_STATUS_OPTIONS.find(o => o.value === p.readyUse)?.label || p.readyUse;
  return `I will ${p.use} to ${p.purposeUse} via ${p.name} | ${ready}`;
}

export function formatThingAgenda(p: ThingData): { line1: string; line2: string } {
  const ready = READY_STATUS_OPTIONS.find(o => o.value === p.readyUse)?.label || p.readyUse;
  return {
    line1: `${p.use} to ${p.purposeUse} via ${p.name}`,
    line2: `Ready Status: ${ready}`,
  };
}

function ThingsSection({ habitId }: { habitId: number }) {
  const [name, setName] = useState("");
  const [purposeUse, setPurposeUse] = useState("");
  const [use, setUse] = useState("");
  const [readyUse, setReadyUse] = useState("");

  const { data: tasks = [] } = useQuery<PlannerTask[]>({
    queryKey: ["/api/planner-tasks", "project", habitId, "things"],
    queryFn: () => apiRequest("GET", `/api/planner-tasks?habitId=${habitId}&sourceType=project_things`).then(r => r.json()),
    retry: 2,
  });

  const addThing = useMutation({
    mutationFn: () => apiRequest("POST", "/api/planner-tasks", {
      date: new Date().toISOString().split("T")[0],
      goal: JSON.stringify({ name, purposeUse, use, readyUse }),
      habitId,
      sourceType: "project_things",
      status: "planned",
      isDraft: 0,
    }),
    onSuccess: () => {
      setName(""); setPurposeUse(""); setUse(""); setReadyUse("");
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "things"] });
    },
  });

  const deleteThing = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planner-tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "things"] }),
  });

  const convertToTask = useMutation({
    mutationFn: (task: PlannerTask) => {
      return apiRequest("POST", "/api/planner-tasks", {
        date: new Date().toISOString().split("T")[0],
        goal: task.goal, // keep JSON for agenda rendering
        habitId,
        sourceType: "project_things",
        status: "planned",
        isDraft: 1,
        areaId: task.areaId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks"] });
    },
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/planner-tasks/${id}`, { status: status === "done" ? "planned" : "done" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/planner-tasks", "project", habitId, "things"] }),
  });

  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Package className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-medium">Things</h2>
        </div>
        <p className="text-[10px] text-muted-foreground ml-6">
          What things support this identity and how will you use them?
        </p>
      </div>

      {/* Add thing form */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thing name"
            className="text-sm h-8"
          />
          <div>
            <p className="text-[11px] text-muted-foreground mb-1 ml-0.5">The purpose is to...</p>
            <Input
              value={purposeUse}
              onChange={(e) => setPurposeUse(e.target.value)}
              placeholder="Purpose of this thing"
              className="text-sm h-8"
            />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1 ml-0.5">I will...</p>
            <Input
              value={use}
              onChange={(e) => setUse(e.target.value)}
              placeholder="How you'll use it"
              className="text-sm h-8"
            />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1 ml-0.5">Ready Status?</p>
            <Select value={readyUse} onValueChange={setReadyUse}>
              <SelectTrigger className="text-sm h-8">
                <SelectValue placeholder="Ready status" />
              </SelectTrigger>
              <SelectContent>
                {READY_STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-8 w-full"
            disabled={!name.trim()}
            onClick={() => addThing.mutate()}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Thing
          </Button>
        </CardContent>
      </Card>

      {/* Pending things */}
      {pending.map(t => {
        const thing = parseThing(t.goal);
        const display = thing ? formatThingDisplay(thing) : t.goal;
        return (
          <div key={t.id} className="flex items-start gap-2 px-2 py-2 rounded hover:bg-accent transition-colors group">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary/50 shrink-0 mt-0.5"
            />
            <span className="text-sm flex-1">{display}</span>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => convertToTask.mutate(t)}
                className="text-primary/60 hover:text-primary transition-colors p-0.5"
                title="Turn into a task"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deleteThing.mutate(t.id)}
                className="text-destructive/60 hover:text-destructive transition-colors p-0.5"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Done things */}
      {done.map(t => {
        const thing = parseThing(t.goal);
        const display = thing ? formatThingDisplay(thing) : t.goal;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50">
            <button
              onClick={() => toggleDone.mutate({ id: t.id, status: t.status })}
              className="w-4 h-4 rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />
            </button>
            <span className="text-sm flex-1 line-through">{display}</span>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2">No things added yet</p>
      )}
    </div>
  );
}
