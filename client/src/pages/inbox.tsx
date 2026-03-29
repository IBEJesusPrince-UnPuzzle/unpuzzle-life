import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Inbox as InboxIcon, Plus, ArrowRight, Trash2, CheckCircle2,
  FolderOpen, Archive, Zap, Pencil, Check, X
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { InboxItem, Project, Area } from "@shared/schema";

export default function InboxPage() {
  const [newItem, setNewItem] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [processAs, setProcessAs] = useState<string>("");
  const [actionTitle, setActionTitle] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: items = [] } = useQuery<InboxItem[]>({ queryKey: ["/api/inbox"] });
  const { data: projectsList = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: areasList = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });

  const unprocessed = items.filter(i => !i.processed);
  const processed = items.filter(i => i.processed);

  const addItem = useMutation({
    mutationFn: (content: string) => apiRequest("POST", "/api/inbox", {
      content,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setNewItem("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const processItem = useMutation({
    mutationFn: async ({ id, processedAs }: { id: number; processedAs: string }) => {
      // If processing as action, create the action
      if (processedAs === "action" && actionTitle.trim()) {
        await apiRequest("POST", "/api/actions", {
          title: actionTitle.trim(),
          projectId: selectedProject ? Number(selectedProject) : null,
          createdAt: new Date().toISOString(),
        });
      }
      // If processing as project, create the project
      if (processedAs === "project") {
        const item = items.find(i => i.id === id);
        await apiRequest("POST", "/api/projects", {
          title: item?.content || "New Project",
          status: "active",
          createdAt: new Date().toISOString(),
        });
      }
      return apiRequest("PATCH", `/api/inbox/${id}`, { processed: 1, processedAs });
    },
    onSuccess: () => {
      setProcessingId(null);
      setProcessAs("");
      setActionTitle("");
      setSelectedProject("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
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

  const deleteItem = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/inbox/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture everything. Process into the right place.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {unprocessed.length} unprocessed
        </Badge>
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

      {/* Unprocessed Items */}
      {unprocessed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <InboxIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Inbox zero</p>
          <p className="text-xs mt-1">Your mind is clear. Capture anything new above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unprocessed.map((item) => (
            <Card key={item.id} className="group">
              <CardContent className="p-4 flex items-start gap-3">
                <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
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
                        onClick={() => updateItem.mutate({ id: item.id, content: editText.trim() })}
                        data-testid={`button-save-edit-${item.id}`}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
                        onClick={() => setEditingId(null)}
                        data-testid={`button-cancel-edit-${item.id}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm" data-testid={`inbox-item-${item.id}`}>{item.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(item.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
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
                  <Dialog open={processingId === item.id} onOpenChange={(open) => {
                    if (!open) { setProcessingId(null); setProcessAs(""); setActionTitle(""); }
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => { setProcessingId(item.id); setActionTitle(item.content); }}
                        data-testid={`button-process-${item.id}`}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Process
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-base">Process: {item.content}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">What is this?</label>
                          <Select value={processAs} onValueChange={setProcessAs}>
                            <SelectTrigger data-testid="select-process-type">
                              <SelectValue placeholder="Choose..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="action">Next Action (do it / delegate it)</SelectItem>
                              <SelectItem value="project">Project (multi-step outcome)</SelectItem>
                              <SelectItem value="someday">Someday / Maybe</SelectItem>
                              <SelectItem value="reference">Reference (file it)</SelectItem>
                              <SelectItem value="trash">Not actionable (trash)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {processAs === "action" && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium mb-1.5 block">Action title</label>
                              <Input
                                value={actionTitle}
                                onChange={(e) => setActionTitle(e.target.value)}
                                data-testid="input-action-title"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1.5 block">Link to project (optional)</label>
                              <Select value={selectedProject} onValueChange={setSelectedProject}>
                                <SelectTrigger>
                                  <SelectValue placeholder="No project" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No project</SelectItem>
                                  {projectsList.filter(p => p.status === "active").map(p => (
                                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        <Button
                          className="w-full"
                          disabled={!processAs}
                          onClick={() => processItem.mutate({ id: item.id, processedAs: processAs })}
                          data-testid="button-confirm-process"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Process
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-destructive"
                    onClick={() => deleteItem.mutate(item.id)}
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recently Processed */}
      {processed.length > 0 && (
        <div className="pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Recently processed
          </p>
          <div className="space-y-1">
            {processed.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Archive className="w-3 h-3" />
                <span className="truncate flex-1 line-through">{item.content}</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1">{item.processedAs}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
