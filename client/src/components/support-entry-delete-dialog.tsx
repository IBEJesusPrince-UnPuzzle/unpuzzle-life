// PR #33 — Support entry (env) delete confirmation dialog.
//
// Single destructive path: typing DELETE (case-sensitive) cascades the
// env entry plus every junction row across all 3 parents (responsibilities,
// projects, agenda tasks). No radio, no PRESERVE variant — every linked
// parent loses the link, full stop.
//
// Pattern mirrors project-delete-dialog.tsx:
//   - Lazy useQuery on the link-summary endpoint, gated on `open`
//   - typed === "DELETE" gates the destructive Button
//   - Summary toast surfaced via the onDeleted callback
//
// When the entry has zero linked rows, the summary line is hidden (just
// "This cannot be undone." remains). The typed-DELETE gate stays — the
// case-sensitive confirm IS the safety, not the count.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import { useToast } from "@/hooks/use-toast";

export type SupportType =
  | "people"
  | "places"
  | "things"
  | "providers"
  | "conditions";

export type SupportEntryDeleteSummary = {
  responsibilities: number;
  projects: number;
  agendaTasks: number;
  envDeleted: number;
};

// Singular display word for each support type. Used in dialog title and
// the destructive button label ("Delete person", "Delete place", ...).
const SINGULAR: Record<SupportType, string> = {
  people: "person",
  places: "place",
  things: "thing",
  providers: "provider",
  conditions: "condition",
};

interface Props {
  supportType: SupportType;
  entryId: number;
  entryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (summary: SupportEntryDeleteSummary) => void;
}

// Matches the GET /api/environment/:type/:id/link-summary response. The
// edit sheet uses the full object (counts + items list for the "Used by"
// rollup); this dialog only needs the counts.
type LinkSummary = {
  responsibilities: { count: number; items: { id: number; name: string }[] };
  projects: { count: number; items: { id: number; name: string }[] };
  agendaTasks: { count: number; items: { id: number; name: string }[] };
};

export function SupportEntryDeleteDialog({
  supportType,
  entryId,
  entryName,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");

  // Reset typed state each time the dialog opens — prevents the second
  // delete attempt from inheriting the first attempt's confirm input.
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  // Lazy pre-flight count — only fires while open.
  const summaryQuery = useQuery<LinkSummary>({
    queryKey: [`/api/environment/${supportType}/${entryId}/link-summary`],
    enabled: open,
  });
  const summary = summaryQuery.data;
  const totalLinks = summary
    ? summary.responsibilities.count +
      summary.projects.count +
      summary.agendaTasks.count
    : 0;
  const hasLinks = totalLinks > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/environment/${supportType}/${entryId}?cascade=true`,
      );
      const json = (await res.json()) as {
        ok: boolean;
        summary: SupportEntryDeleteSummary;
      };
      return json.summary;
    },
    onSuccess: (result) => {
      // Invalidate everything that could have shown this entry or its links.
      queryClient.invalidateQueries({
        queryKey: [`/api/environment/${supportType}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-tasks"] });
      onOpenChange(false);
      onDeleted(result);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: `Couldn't delete ${SINGULAR[supportType]}`,
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const canConfirm =
    !mutation.isPending && !summaryQuery.isLoading && typed === "DELETE";

  // Build the human summary line: "1 responsibility, 1 project, and 1 agenda
  // task" / "2 responsibilities and 1 project" / etc. Only includes the
  // parents with non-zero counts.
  const summaryLine = (() => {
    if (!summary || !hasLinks) return null;
    const parts: string[] = [];
    const r = summary.responsibilities.count;
    const p = summary.projects.count;
    const a = summary.agendaTasks.count;
    if (r > 0) parts.push(`${r} ${r === 1 ? "responsibility" : "responsibilities"}`);
    if (p > 0) parts.push(`${p} ${p === 1 ? "project" : "projects"}`);
    if (a > 0) parts.push(`${a} ${a === 1 ? "agenda task" : "agenda tasks"}`);
    // Oxford-comma join.
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  })();

  const singular = SINGULAR[supportType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-support-entry-delete"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-support-entry-delete-title">
            Delete &quot;{entryName}&quot;?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {summaryQuery.isLoading ? (
            <div
              className="flex items-center gap-2 text-muted-foreground"
              data-testid="state-support-entry-delete-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking links...</span>
            </div>
          ) : hasLinks ? (
            <p data-testid="text-support-entry-link-summary">
              This {singular} is linked to {summaryLine}. Deleting will also
              remove {totalLinks === 1 ? "that link" : "all of those links"}.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="support-entry-delete-confirm" className="text-xs">
              Type DELETE to confirm:
            </Label>
            <Input
              id="support-entry-delete-confirm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
              data-testid="input-support-entry-delete-confirm"
            />
          </div>

          <p
            className="text-xs text-muted-foreground"
            data-testid="text-support-entry-delete-helper"
          >
            This cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-support-entry-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => mutation.mutate()}
            data-testid="button-support-entry-delete-confirm"
          >
            {mutation.isPending ? "Deleting..." : `Delete ${singular}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
