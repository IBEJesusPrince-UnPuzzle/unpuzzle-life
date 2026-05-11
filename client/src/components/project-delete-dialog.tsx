// PR #29h — Project delete confirmation dialog.
//
// Two paths, gated on the user typing a magic word that matches their
// chosen radio option:
//
//   DELETE   = cascade everything; linked agenda chips are hard-deleted
//   PRESERVE = cascade project chrome; linked agenda chips are flipped to
//              origin='standalone', originId=null so they keep living on
//              the agenda as standalone tasks.
//
// When the project has zero linked agenda chips, the radio is hidden and
// only DELETE is offered (PRESERVE makes no sense without chips to keep).
//
// Lazy pre-flight count comes from GET /api/projects/:id/linked-agenda-count
// fired when the dialog opens (gated). While loading, the body shows a
// spinner placeholder where the count line would render.
//
// On success the parent's onDeleted callback fires with the server's
// summary so the parent can route + toast accordingly. Errors are
// surfaced via toast inside the dialog.

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import { useToast } from "@/hooks/use-toast";

export type ProjectDeleteSummary = {
  mode: "delete" | "preserve";
  project: number;
  projectTasks: number;
  agendaTasksDeleted: number;
  agendaTasksPreserved: number;
  links: number;
  people: number;
  places: number;
  things: number;
  providers: number;
  conditions: number;
  responsibility: number;
  inboxNulled: number;
};

type Mode = "delete" | "preserve";

interface Props {
  projectId: number;
  projectTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (summary: ProjectDeleteSummary) => void;
}

export function ProjectDeleteDialog({
  projectId,
  projectTitle,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("delete");
  const [typed, setTyped] = useState("");

  // Reset state every time the dialog opens. Avoids stale mode/typed across
  // multiple delete attempts on the same page mount.
  useEffect(() => {
    if (open) {
      setMode("delete");
      setTyped("");
    }
  }, [open]);

  // Lazy count — only fires when the dialog is open.
  const countQuery = useQuery<{ count: number }>({
    queryKey: [`/api/projects/${projectId}/linked-agenda-count`],
    enabled: open,
  });
  const count = countQuery.data?.count ?? 0;
  const hasChips = count > 0;

  // When there are no chips, force mode to 'delete' (the only option).
  useEffect(() => {
    if (countQuery.isSuccess && !hasChips && mode !== "delete") {
      setMode("delete");
      setTyped("");
    }
  }, [countQuery.isSuccess, hasChips, mode]);

  const activeWord = mode === "delete" ? "DELETE" : "PRESERVE";

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/projects/${projectId}?mode=${mode}`,
      );
      const json = (await res.json()) as { ok: boolean; summary: ProjectDeleteSummary };
      return json.summary;
    },
    onSuccess: (summary) => {
      // Invalidate all caches the deleted project touches.
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-items"] });
      onOpenChange(false);
      onDeleted(summary);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't delete project",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const canConfirm =
    !mutation.isPending &&
    !countQuery.isLoading &&
    typed === activeWord;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-project-delete"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-project-delete-title">
            Delete &quot;{projectTitle}&quot;?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {countQuery.isLoading ? (
            <div
              className="flex items-center gap-2 text-muted-foreground"
              data-testid="state-project-delete-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking linked tasks...</span>
            </div>
          ) : hasChips ? (
            <>
              <p data-testid="text-linked-count">
                This project has {count} linked agenda task
                {count === 1 ? "" : "s"}. Choose what happens to{" "}
                {count === 1 ? "it" : "them"}:
              </p>
              <RadioGroup
                value={mode}
                onValueChange={(v: string) => {
                  setMode(v as Mode);
                  setTyped("");
                }}
                data-testid="radio-project-delete-mode"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    value="delete"
                    id="proj-del-mode-delete"
                    data-testid="radio-mode-delete"
                  />
                  <Label
                    htmlFor="proj-del-mode-delete"
                    className="text-sm font-normal leading-snug cursor-pointer"
                  >
                    Delete project and remove agenda tasks
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    value="preserve"
                    id="proj-del-mode-preserve"
                    data-testid="radio-mode-preserve"
                  />
                  <Label
                    htmlFor="proj-del-mode-preserve"
                    className="text-sm font-normal leading-snug cursor-pointer"
                  >
                    Delete project but keep agenda tasks
                  </Label>
                </div>
              </RadioGroup>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label
              htmlFor="proj-del-confirm"
              className="text-xs"
            >
              Type {activeWord} to confirm:
            </Label>
            <Input
              id="proj-del-confirm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={activeWord}
              data-testid="input-project-delete-confirm"
            />
          </div>

          {mode === "preserve" ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-preserve-helper"
            >
              Linked tasks will be converted to standalone agenda tasks.
              This cannot be undone.
            </p>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-delete-helper"
            >
              This cannot be undone.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-project-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => mutation.mutate()}
            data-testid="button-project-delete-confirm"
          >
            {mutation.isPending ? "Deleting..." : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
