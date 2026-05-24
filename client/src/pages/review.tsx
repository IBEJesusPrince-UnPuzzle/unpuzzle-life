import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CheckCircle2, SkipForward, XCircle, CalendarClock,
  ChevronDown, ChevronRight, ExternalLink, CalendarDays, Info,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { Link } from "wouter";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import type { TaskCompletion } from "@shared/schema";
import { formatTimeLabel, timeToMinutes, toIsoDate } from "@/lib/agenda-utils";
import { cn } from "@/lib/utils";

// Completion status options for each agenda item
type CompletionStatus = "done" | "missed" | "skipped" | "rescheduled";
type RecurrenceScope = "this" | "following" | "all";

// Enriched item = agenda item + its current completion record (if any)
type ReviewItem = AgendaWindowItem & {
  completion: TaskCompletion | null;
};

function todayIso(): string {
  return toIsoDate(new Date());
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// Build the completion key payload for a given agenda item.
// For standalone/external rows we also store originalDate (the item's date)
// so getCompletionsForDate can find them by date in the review query.
function completionKey(item: AgendaWindowItem): { seriesId?: number; originalDate?: string; agendaTaskId?: number } {
  if (item.isVirtual && item.seriesId) {
    return { seriesId: item.seriesId, originalDate: item.startDate };
  }
  if (item.seriesId && item.originalDate) {
    return { seriesId: item.seriesId, originalDate: item.originalDate };
  }
  return { agendaTaskId: item.id, originalDate: item.startDate };
}

// Match an item to its completion record
function findCompletion(item: AgendaWindowItem, completions: TaskCompletion[]): TaskCompletion | null {
  const key = completionKey(item);
  if (key.seriesId != null) {
    return completions.find(c => c.seriesId === key.seriesId && c.originalDate === key.originalDate) ?? null;
  }
  return completions.find(c => c.agendaTaskId === key.agendaTaskId) ?? null;
}

const STATUS_CONFIG: Record<CompletionStatus, { label: string; icon: React.ElementType; className: string }> = {
  done:        { label: "Done",       icon: CheckCircle2,  className: "text-green-600 dark:text-green-400" },
  missed:      { label: "Missed",     icon: XCircle,       className: "text-destructive" },
  skipped:     { label: "Skipped",    icon: SkipForward,   className: "text-muted-foreground" },
  rescheduled: { label: "Rescheduled",icon: CalendarClock, className: "text-amber-600 dark:text-amber-400" },
};

function StatusBadge({ status }: { status: CompletionStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", cfg.className)}>
      <Icon className="w-3.5 h-3.5" /> {cfg.label}
    </span>
  );
}

function RescheduleSheet({ item, onClose, onConfirm }: {
  item: AgendaWindowItem | null;
  onClose: () => void;
  onConfirm: (newDate: string, newTime: string) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => {
    if (item) { setNewDate(item.startDate ?? ""); setNewTime(item.time ?? ""); }
  }, [item]);
  return (
    <Sheet open={item !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">Reschedule: {item?.title ?? ""}</SheetTitle>
        </SheetHeader>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarDays className="w-4 h-4 mr-2 shrink-0" />
                  {newDate || "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single"
                  selected={newDate ? new Date(newDate + "T12:00:00") : undefined}
                  onSelect={(d) => { if (d) { setNewDate(toIsoDate(d)); setCalOpen(false); } }}
                  initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>New time</Label>
            <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!newDate}
            onClick={() => { onConfirm(newDate, newTime); onClose(); }}>
            Confirm reschedule
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ScopeDialog({ open, isResponsibility, onConfirm, onClose }: {
  open: boolean;
  isResponsibility: boolean;
  onConfirm: (scope: RecurrenceScope) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<RecurrenceScope>("this");
  useEffect(() => { if (open) setScope("this"); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit recurring event</DialogTitle></DialogHeader>
        <div className="py-4">
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as RecurrenceScope)} className="gap-3">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="this" id="rs-this" />
              <Label htmlFor="rs-this" className="cursor-pointer font-normal">This event</Label>
            </div>
            {!isResponsibility && (
              <>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="following" id="rs-following" />
                  <Label htmlFor="rs-following" className="cursor-pointer font-normal">This and following events</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="all" id="rs-all" />
                  <Label htmlFor="rs-all" className="cursor-pointer font-normal">All events</Label>
                </div>
              </>
            )}
          </RadioGroup>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onConfirm(scope); onClose(); }}>Reschedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewPage() {
  const today = todayIso();
  const initialDate = (() => {
    const d = new URLSearchParams(window.location.search).get("d");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  })();
  const [date, setDate] = useState(initialDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["pending", "done", "external"]));

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(toIsoDate(d));
    setSelectedIds(new Set());
  }

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const swipeHandlers = useSwipeNav({
    onPrev: () => shiftDate(-1),
    onNext: () => shiftDate(1),
    disabled: pickerOpen,
  });
  const [rescheduleItem, setRescheduleItem] = useState<AgendaWindowItem | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{ item: AgendaWindowItem; newDate: string; newTime: string } | null>(null);

  // Fetch today's agenda items
  const { data: agendaItems = [], isLoading: agendaLoading } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", { from: date, to: date }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${date}&to=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Fetch completions for this date
  const { data: completions = [], isLoading: completionsLoading } = useQuery<TaskCompletion[]>({
    queryKey: ["/api/completions", date],
    queryFn: async () => {
      const r = await fetch(`/api/completions?date=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Mark single item
  const markMutation = useMutation({
    mutationFn: (payload: { item: AgendaWindowItem; status: CompletionStatus }) => {
      const key = completionKey(payload.item);
      return apiRequest("POST", "/api/completions", { ...key, status: payload.status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/completions", date] }),
  });

  // Undo completion
  const undoMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/completions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/completions", date] }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ item, newDate, newTime, scope }: {
      item: AgendaWindowItem; newDate: string; newTime: string; scope: RecurrenceScope;
    }) => {
      const isRecurring = !!(item.recurrenceRule || item.seriesId);
      const masterId = (item as any).masterId ?? item.id;
      const occurrenceDate = item.startDate;
      const payload: Record<string, unknown> = { startDate: newDate };
      if (newTime) payload.time = newTime;
      if (isRecurring) {
        if (scope === "this") {
          await apiRequest("POST", "/api/agenda-tasks", {
            ...payload, title: item.title, origin: "standalone",
            seriesId: masterId, originalDate: occurrenceDate, isOverride: 1,
          });
        } else if (scope === "all") {
          await apiRequest("PATCH", `/api/agenda-tasks/${masterId}`, payload);
        } else {
          const truncatedEnd = new Date(occurrenceDate + "T12:00:00");
          truncatedEnd.setDate(truncatedEnd.getDate() - 1);
          await apiRequest("PATCH", `/api/agenda-tasks/${masterId}`, { recurrenceEndDate: toIsoDate(truncatedEnd) });
          await apiRequest("POST", "/api/agenda-tasks", {
            ...payload, title: item.title, origin: (item as any).origin ?? "standalone",
            recurrenceRule: (item as any).recurrenceRule,
          });
        }
      } else {
        await apiRequest("PATCH", `/api/agenda-tasks/${item.id}`, payload);
      }
      await apiRequest("POST", "/api/completions", {
        agendaTaskId: item.id, originalDate: item.startDate, status: "rescheduled",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/completions", date] });
      setPendingReschedule(null);
    },
  });

  // Bulk mark
  const bulkMutation = useMutation({
    mutationFn: (payload: { items: AgendaWindowItem[]; status: CompletionStatus }) => {
      const items = payload.items.map(item => ({ ...completionKey(item), status: payload.status }));
      return apiRequest("POST", "/api/completions/bulk", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/completions", date] });
      setSelectedIds(new Set());
    },
  });

  // Merge all items (including external) with completions
  const reviewItems: ReviewItem[] = useMemo(() =>
    agendaItems
      .map(i => ({ ...i, completion: findCompletion(i, completions) })),
    [agendaItems, completions]
  );

  const isExternal = (i: AgendaWindowItem) => i.origin === "external" || (i as any).isExternal;
  const externalItems = reviewItems.filter(i => isExternal(i));
  const actionableItems = reviewItems.filter(i => !isExternal(i));
  const pending = actionableItems.filter(i => !i.completion);
  const completed = actionableItems.filter(i => i.completion);
  const doneCount = actionableItems.filter(i => i.completion?.status === "done").length;
  const total = actionableItems.length;

  function toggleSection(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function itemKey(item: AgendaWindowItem): string {
    if (isExternal(item)) return `ext${item.id}`;
    const k = completionKey(item);
    if (k.seriesId != null) return `s${k.seriesId}-${k.originalDate}`;
    return `t${k.agendaTaskId}`;
  }

  const selectedItems = pending.filter(i => selectedIds.has(itemKey(i)));
  const allPendingSelected = pending.length > 0 && pending.every(i => selectedIds.has(itemKey(i)));

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pending.map(itemKey)));
    }
  }

  const isLoading = agendaLoading || completionsLoading;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Daily Review</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(date)}</p>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {doneCount}/{total} done
            </Badge>
          )}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); setSelectedIds(new Set()); }}>
            ← Prev
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs flex-1"
            onClick={() => { setDate(today); setSelectedIds(new Set()); }}>
            {date === today ? "Today" : "Go to Today"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); setSelectedIds(new Set()); }}>
            Next →
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <CalendarDays className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={new Date(date + "T12:00:00")}
                onSelect={(d) => {
                  if (d) {
                    setDate(toIsoDate(d));
                    setSelectedIds(new Set());
                    setPickerOpen(false);
                  }
                }}
                initialFocus
              />
              <div className="border-t px-3 py-2">
                <Link
                  href={`/agenda/calendar-sources?from=${encodeURIComponent(`/review?d=${date}`)}`}
                  onClick={() => setPickerOpen(false)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Manage calendar sources
                </Link>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Body */}
      <div {...swipeHandlers} className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-6 text-center">Loading…</p>
        ) : reviewItems.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-6 text-center">No items scheduled for this day.</p>
        ) : (
          <>
            {/* Bulk action bar — shown when items are selected */}
            {selectedIds.size > 0 && (
              <div className="sticky top-0 z-10 bg-background border-b py-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                {(["done", "missed", "skipped"] as CompletionStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <Button key={s} variant="outline" size="sm" className="h-7 text-xs gap-1"
                      disabled={bulkMutation.isPending}
                      onClick={() => bulkMutation.mutate({ items: selectedItems, status: s })}>
                      <Icon className="w-3 h-3" /> Mark {cfg.label}
                    </Button>
                  );
                })}
                <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto"
                  onClick={() => setSelectedIds(new Set())}>
                  Cancel
                </Button>
              </div>
            )}

            {/* PENDING section */}
            {pending.length > 0 && (
              <div className="mt-4">
                <button
                  className="flex items-center gap-1.5 w-full text-left mb-2"
                  onClick={() => toggleSection("pending")}
                >
                  {expandedSections.has("pending") ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pending · {pending.length}
                  </span>
                  {pending.length > 1 && expandedSections.has("pending") && (
                    <button
                      className="ml-auto text-[10px] text-primary underline underline-offset-2"
                      onClick={e => { e.stopPropagation(); toggleSelectAll(); }}
                    >
                      {allPendingSelected ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </button>

                {expandedSections.has("pending") && (
                  <div className="space-y-1">
                    {pending.map(item => {
                      const key = itemKey(item);
                      const isSelected = selectedIds.has(key);
                      const startMin = timeToMinutes(item.time);
                      const timeLabel = item.isAllDay ? "All day" : (startMin != null ? formatTimeLabel(startMin) : "");
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                            isSelected ? "bg-primary/5 border-primary/20" : "border-transparent hover:bg-accent"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(key)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title ?? "Untitled"}</p>
                            {timeLabel && (
                              <p className="text-xs text-muted-foreground">{timeLabel}</p>
                            )}
                            {item.placeName && (
                              <p className="text-xs text-muted-foreground">in {item.placeName}</p>
                            )}
                          </div>
                          {/* Quick action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            {(["done", "missed", "skipped"] as CompletionStatus[]).map(s => {
                              const cfg = STATUS_CONFIG[s];
                              const Icon = cfg.icon;
                              return (
                                <button
                                  key={s}
                                  title={cfg.label}
                                  disabled={markMutation.isPending}
                                  onClick={() => markMutation.mutate({ item, status: s })}
                                  className={cn("p-1 rounded hover:bg-accent transition-colors", cfg.className)}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })}
                            <button
                              title="Rescheduled"
                              onClick={() => setRescheduleItem(item)}
                              className={cn("p-1 rounded hover:bg-accent transition-colors", STATUS_CONFIG.rescheduled.className)}
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* EXTERNAL CALENDAR section — action buttons + calendar link on rescheduled */}
            {externalItems.length > 0 && (
              <div className="mt-5">
                <button
                  className="flex items-center gap-1.5 w-full text-left mb-2"
                  onClick={() => toggleSection("external")}
                >
                  {expandedSections.has("external") ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Calendar Events · {externalItems.length}
                  </span>
                </button>

                {expandedSections.has("external") && (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2 px-3 py-2 mb-1 rounded-md bg-muted/40 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Synced from your calendar. Review badges carry over when you edit an event in place. If you delete and recreate an event, the badge won't carry over to the new one.</span>
                    </div>
                    {externalItems.map(item => {
                      const key = itemKey(item);
                      const startMin = timeToMinutes(item.time);
                      const endMin = timeToMinutes((item as any).endTime);
                      const timeLabel = item.isAllDay
                        ? "All day"
                        : startMin != null
                          ? endMin != null && endMin > startMin
                            ? `${formatTimeLabel(startMin)} – ${formatTimeLabel(endMin)}`
                            : formatTimeLabel(startMin)
                          : "";
                      const calUrl = (() => {
                        const uid = (item as any).uid as string | null | undefined;
                        const calendarUrl = (item as any).calendarUrl as string | null | undefined;
                        try {
                          if (uid?.endsWith("@google.com") && item.startDate) {
                            const [y, mo, d] = item.startDate.split("-");
                            return `https://calendar.google.com/calendar/u/0/r/day/${y}/${mo}/${d}`;
                          }
                          if (calendarUrl) return calendarUrl;
                        } catch { /* ignore */ }
                        return null;
                      })();
                      const logged = item.completion;
                      return (
                        <div key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-transparent">
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium truncate", logged?.status === "done" ? "line-through text-muted-foreground" : "")}>
                              {item.title ?? "Untitled"}
                            </p>
                            {timeLabel && <p className="text-xs text-muted-foreground">{timeLabel}</p>}
                            {(item as any).calendarName && (
                              <p className="text-xs text-muted-foreground">{(item as any).calendarName}</p>
                            )}
                            {/* Show calendar link when rescheduled */}
                            {logged?.status === "rescheduled" && calUrl && (
                              <a href={calUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-primary underline underline-offset-2 mt-0.5">
                                <ExternalLink className="w-3 h-3" /> Reschedule in calendar
                              </a>
                            )}
                          </div>
                          {!logged ? (
                            <div className="flex items-center gap-1 shrink-0">
                              {(["done", "missed", "skipped", "rescheduled"] as CompletionStatus[]).map(s => {
                                const cfg = STATUS_CONFIG[s];
                                const Icon = cfg.icon;
                                return (
                                  <button key={s} title={cfg.label}
                                    disabled={markMutation.isPending}
                                    onClick={() => markMutation.mutate({ item, status: s })}
                                    className={cn("p-1 rounded hover:bg-accent transition-colors", cfg.className)}>
                                    <Icon className="w-4 h-4" />
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={logged.status as CompletionStatus} />
                              <button title="Undo" disabled={undoMutation.isPending}
                                onClick={() => undoMutation.mutate(logged.id)}
                                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                                Undo
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* COMPLETED section */}
            {completed.length > 0 && (
              <div className="mt-5">
                <button
                  className="flex items-center gap-1.5 w-full text-left mb-2"
                  onClick={() => toggleSection("done")}
                >
                  {expandedSections.has("done") ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Logged · {completed.length}
                  </span>
                </button>

                {expandedSections.has("done") && (
                  <div className="space-y-1">
                    {completed.map(item => {
                      const key = itemKey(item);
                      const startMin = timeToMinutes(item.time);
                      const timeLabel = item.isAllDay ? "All day" : (startMin != null ? formatTimeLabel(startMin) : "");
                      return (
                        <div key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-transparent">
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm truncate", item.completion?.status === "done" ? "line-through text-muted-foreground" : "")}>
                              {item.title ?? "Untitled"}
                            </p>
                            {timeLabel && (
                              <p className="text-xs text-muted-foreground">{timeLabel}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.completion && <StatusBadge status={item.completion.status as CompletionStatus} />}
                            <button
                              title="Undo"
                              disabled={undoMutation.isPending}
                              onClick={() => item.completion && undoMutation.mutate(item.completion.id)}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              Undo
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mark all done shortcut at bottom when everything is pending */}
            {pending.length > 0 && completed.length === 0 && (
              <div className="mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full text-sm"
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate({ items: pending, status: "done" })}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark all as done
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <RescheduleSheet
        item={rescheduleItem}
        onClose={() => setRescheduleItem(null)}
        onConfirm={(newDate, newTime) => {
          if (!rescheduleItem) return;
          const isRecurring = !!(rescheduleItem.recurrenceRule || rescheduleItem.seriesId);
          if (isRecurring) {
            setPendingReschedule({ item: rescheduleItem, newDate, newTime });
          } else {
            rescheduleMutation.mutate({ item: rescheduleItem, newDate, newTime, scope: "this" });
          }
          setRescheduleItem(null);
        }}
      />
      <ScopeDialog
        open={pendingReschedule !== null}
        isResponsibility={pendingReschedule?.item.origin === "responsibility"}
        onClose={() => setPendingReschedule(null)}
        onConfirm={(scope) => {
          if (pendingReschedule) {
            rescheduleMutation.mutate({ ...pendingReschedule, scope });
          }
        }}
      />
    </div>
  );
}
