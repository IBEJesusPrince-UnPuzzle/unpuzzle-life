import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Inbox as InboxIcon, Plus, Trash2, Pencil, Check, X, Undo2, Archive,
  Sparkles, Sliders,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { InboxItem } from "@shared/schema";
import { usePreferences } from "@/hooks/use-preferences";
import { InboxProcessMenu } from "@/components/inbox-process-menu";

export default function InboxPage() {
  const { data: prefs } = usePreferences();
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // PR #29b — processing menu state.
  const [processItem, setProcessItem] = useState<InboxItem | null>(null);

  const { data: items = [] } = useQuery<InboxItem[]>({ queryKey: ["/api/inbox"] });
  const { data: trashedItems = [] } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox/trashed"],
    queryFn: () => apiRequest("GET", "/api/inbox/trashed").then(r => r.json()),
  });

  const unprocessed = items.filter(i => !i.processed);
  const processed = items.filter(i => i.processed);

  const addItem = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/inbox", {
        content,
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setNewItem("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest("PATCH", `/api/inbox/${id}`, { content }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  const trashItem = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/inbox/${id}/soft-delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
    },
  });

  const restoreItem = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/inbox/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture everything, then process when you're ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {unprocessed.length} unprocessed
          </Badge>
          {/* PR #29b Q3(a) — Someday entry on Inbox header. */}
          <Link
            href="/someday"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            data-testid="link-someday"
          >
            <Sparkles className="w-3 h-3" /> Someday
          </Link>
        </div>
      </div>

      {/* Capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newItem.trim()) addItem.mutate(newItem.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="What's on your mind? Brain dump here..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="flex-1"
          data-testid="input-inbox-capture"
        />
        <Button type="submit" disabled={!newItem.trim()} data-testid="button-inbox-add">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </form>

      {/* Unprocessed */}
      {unprocessed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <InboxIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Inbox zero</p>
          <p className="text-xs mt-1">Capture anything new above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unprocessed.map((item) => (
            <Card key={item.id} className="group">
              <CardContent className="p-4 flex items-start gap-3">
                <InboxIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && editText.trim()) updateItem.mutate({ id: item.id, content: editText.trim() });
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="text-sm h-8"
                        data-testid={`input-edit-${item.id}`}
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-primary"
                        disabled={!editText.trim()}
                        onClick={() => updateItem.mutate({ id: item.id, content: editText.trim() })}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
                        onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm" data-testid={`inbox-item-${item.id}`}>{item.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(item.createdAt).toLocaleDateString(prefs?.timeFormat === "24h" ? "en-GB" : "en-US", {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: prefs?.timeFormat !== "24h",
                        })}
                      </p>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-1 ${editingId === item.id ? "invisible" : ""}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => { setEditingId(item.id); setEditText(item.content); }}
                    data-testid={`button-edit-${item.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  {/* PR #29b — Process button opens the six-action menu.
                      Compact on narrow viewports so the row content doesn't
                      wrap to multiple lines: icon-only on mobile, label on
                      sm and up. */}
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs h-7 px-2 sm:px-3"
                    onClick={() => setProcessItem(item)}
                    data-testid={`button-process-${item.id}`}
                    aria-label="Process this item"
                  >
                    <Sliders className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Process</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-destructive"
                    onClick={() => trashItem.mutate(item.id)}
                    data-testid={`button-trash-${item.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recently processed (read-only — processing flow returns Phase 6) */}
      {processed.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Recently processed
          </p>
          <div className="space-y-1">
            {processed.slice(0, 10).map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Archive className="w-3 h-3" />
                <span className="truncate flex-1">{item.content}</span>
                {item.processedAs && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                    {item.processedAs}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PR #29b — Processing menu sheet (mounted at page level so it persists
          while the user picks an action; closes on action confirm or Cancel). */}
      <InboxProcessMenu
        item={processItem}
        open={processItem !== null}
        onOpenChange={(o) => { if (!o) setProcessItem(null); }}
      />

      {/* Recently trashed */}
      {trashedItems.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Recently trashed (7-day recovery)
          </p>
          <div className="space-y-1">
            {trashedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground group">
                <Trash2 className="w-3 h-3" />
                <span className="truncate flex-1 line-through">{item.content}</span>
                <span className="text-[10px]">
                  {item.deletedAt && new Date(item.deletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs opacity-0 group-hover:opacity-100"
                  onClick={() => restoreItem.mutate(item.id)}
                  data-testid={`button-restore-${item.id}`}
                >
                  <Undo2 className="w-3 h-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
