import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, RefreshCw, CalendarDays, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ExternalCalendar = {
  id: number;
  name: string;
  url: string;
  color: string;
  lastSyncedAt: string | null;
  createdAt: string;
};

const PALETTE = [
  "#4285F4", // Google blue
  "#EA4335", // red
  "#FBBC04", // yellow
  "#34A853", // green
  "#9C27B0", // purple
  "#FF5722", // deep orange
  "#00BCD4", // cyan
  "#795548", // brown
];

export default function AgendaCalendarSourcesPage() {
  const [, navigate] = useLocation();
  const backTo = new URLSearchParams(window.location.search).get("from") || "/agenda";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PALETTE[0]);

  const { data: calendars = [], isLoading } = useQuery<ExternalCalendar[]>({
    queryKey: ["/api/external-calendars"],
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/external-calendars", { name, url, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/external-calendars"] });
      setName("");
      setUrl("");
      setColor(PALETTE[0]);
      toast({ title: "Calendar added", description: "Click Sync to import events." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/external-calendars/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/external-calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color: string }) =>
      apiRequest("PATCH", `/api/external-calendars/${id}`, { name, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/external-calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
      setEditingId(null);
      toast({ title: "Calendar updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (cal: ExternalCalendar) => {
    setEditingId(cal.id);
    setEditName(cal.name);
    setEditColor(cal.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor(PALETTE[0]);
  };

  const saveEdit = (id: number) => {
    if (!editName.trim()) return;
    updateMutation.mutate({ id, name: editName.trim(), color: editColor });
  };

  const syncCalendar = async (id: number) => {
    setSyncingId(id);
    try {
      const r = await fetch(`/api/external-calendars/${id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Sync failed");
      qc.invalidateQueries({ queryKey: ["/api/external-calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
      toast({ title: "Synced", description: `${body.synced} events imported.` });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Calendar Sources</h1>
          <p className="text-sm text-muted-foreground">
            Paste a private iCal URL from Google, Outlook, or Apple Calendar to import events.
          </p>
        </div>
      </div>

      {/* Add form */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">Add a calendar</h2>
        <div className="space-y-2">
          <Label htmlFor="cal-name">Name</Label>
          <Input
            id="cal-name"
            placeholder="e.g. My Google Calendar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cal-url">iCal / ICS URL</Label>
          <Input
            id="cal-url"
            placeholder="https://calendar.google.com/calendar/ical/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                className="w-6 h-6 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "white" : "transparent",
                  outline: color === c ? `2px solid ${c}` : "none",
                  transform: color === c ? "scale(1.2)" : "scale(1)",
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!name.trim() || !url.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Calendar
        </Button>
      </div>

      {/* Calendar list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center">Loading…</p>
      ) : calendars.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No calendars added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calendars.map((cal) => (
            <div key={cal.id} className="border rounded-lg p-4">
              {editingId === cal.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-name-${cal.id}`}>Name</Label>
                    <Input
                      id={`edit-name-${cal.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Calendar name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2 flex-wrap">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          className="w-6 h-6 rounded-full border-2 transition-transform"
                          style={{
                            backgroundColor: c,
                            borderColor: editColor === c ? "white" : "transparent",
                            outline: editColor === c ? `2px solid ${c}` : "none",
                            transform: editColor === c ? "scale(1.2)" : "scale(1)",
                          }}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelEdit}
                      disabled={updateMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveEdit(cal.id)}
                      disabled={!editName.trim() || updateMutation.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{cal.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{cal.url}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last synced: {formatDate(cal.lastSyncedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => syncCalendar(cal.id)}
                      disabled={syncingId === cal.id}
                      title="Sync now"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncingId === cal.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => startEdit(cal)}
                      title="Edit name and color"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(cal.id)}
                      title="Remove calendar"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 border rounded p-3 bg-muted/30">
        <p className="font-medium">How to find your iCal URL:</p>
        <p><strong>Google:</strong> Calendar settings → Integrate calendar → Secret address in iCal format</p>
        <p><strong>Outlook:</strong> Settings → View all Outlook settings → Calendar → Shared calendars → Publish → ICS link</p>
        <p><strong>Apple:</strong> iCloud.com → Calendar → Share → Public Calendar → copy the webcal:// link (change to https://)</p>
      </div>
    </div>
  );
}
