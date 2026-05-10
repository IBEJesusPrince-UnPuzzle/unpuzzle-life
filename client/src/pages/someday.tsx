// PR #29b — Someday list page (Phase 8 inbox processing).
//
// Q1 (locked 2026-05-10): minimal /someday list page — read-only rows with a
// "Move back to Inbox" button per row that flips processed=0 and clears
// processedAs. Empty state copy provided.
//
// Server contract (PR #29a, MERGED #36):
//   GET  /api/inbox/someday                       → InboxItem[]
//   POST /api/inbox/:id/restore-from-someday      → { item }
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Undo2 } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import type { InboxItem } from "@shared/schema";

export default function SomedayPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: prefs } = usePreferences();

  const { data: items = [], isLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox/someday"],
  });

  const restoreMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/inbox/${id}/restore-from-someday`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/someday"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      toast({ title: "Moved back to Inbox" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't restore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/inbox")}
          data-testid="button-someday-back"
          className="-ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Inbox
        </Button>
        <h1 className="text-xl font-semibold tracking-tight ml-auto">Someday</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Items you wondered about. Move any of them back to the Inbox to reconsider.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nothing on the someday list</p>
          <p className="text-xs mt-1">Use Wonder It on an inbox item to add it here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} data-testid={`someday-item-${item.id}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm break-words">{item.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Captured {new Date(item.createdAt).toLocaleDateString(
                      prefs?.timeFormat === "24h" ? "en-GB" : "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreMut.mutate(item.id)}
                  disabled={restoreMut.isPending}
                  data-testid={`button-someday-restore-${item.id}`}
                >
                  <Undo2 className="w-3 h-3 mr-1" /> Move back to Inbox
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
