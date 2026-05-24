// PR #49 — Responsibility delete confirmation dialog.
//
// The server endpoint at DELETE /api/responsibilities/:id has existed since
// PR #19 but no UI ever called it. This dialog ships the missing piece.
//
// Scope: simpler than ProjectDeleteDialog because responsibilities don't have
// a PRESERVE mode. A responsibility IS the source of its master agenda_tasks
// row (origin='responsibility'); there's no wrapper-vs-content split like
// projects have. So one path: type DELETE, confirm, cascade everything.
//
// Server cascade (storage.ts deleteResponsibility, in one transaction):
//   - responsibility_role          (role linkage)
//   - responsibility_people        (People support)
//   - responsibility_places        (Places support)
//   - responsibility_things        (Things support)
//   - responsibility_providers     (Providers support)
//   - responsibility_conditions    (Conditions support)
//   - project_responsibility       (project linkage)
//   - agenda_tasks where origin='responsibility' AND originId=id
//   - responsibilities row itself

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { parseServerError } from "@/lib/parse-server-error";
import { useToast } from "@/hooks/use-toast";

interface Props {
  responsibilityId: number;
  responsibilityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function ResponsibilityDeleteDialog({
  responsibilityId,
  responsibilityName,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");

  // Reset the typed magic word every time the dialog opens. Avoids stale
  // input across multiple delete attempts on the same page mount.
  useEffect(() => {
    if (open) {
      setTyped("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "DELETE",
        `/api/responsibilities/${responsibilityId}`,
      );
    },
    onSuccess: () => {
      // Invalidate every cache the deleted responsibility touches. The
      // master agenda_tasks row is gone, so the agenda window queries need
      // to refetch. Role count caches re-derive on the next /api/roles read.
      queryClient.invalidateQueries({ queryKey: ["/api/responsibilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda", "v2"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      onDeleted();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't delete responsibility",
        description: parseServerError(err, "Try again."),
      });
    },
  });

  const canConfirm = !mutation.isPending && typed === "DELETE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-responsibility-delete"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-responsibility-delete-title">
            Delete &quot;{responsibilityName}&quot;?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p data-testid="text-responsibility-delete-body">
            This removes the responsibility, every linked role, every support
            row (People, Places, Things, Providers, Conditions), every project
            link, and every agenda chip this responsibility was creating.
          </p>

          <div className="space-y-1.5">
            <Label
              htmlFor="resp-del-confirm"
              className="text-xs"
            >
              Type DELETE to confirm:
            </Label>
            <Input
              id="resp-del-confirm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
              data-testid="input-responsibility-delete-confirm"
            />
          </div>

          <p
            className="text-xs text-muted-foreground"
            data-testid="text-responsibility-delete-helper"
          >
            This cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-responsibility-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => mutation.mutate()}
            data-testid="button-responsibility-delete-confirm"
          >
            {mutation.isPending ? "Deleting..." : "Delete responsibility"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
