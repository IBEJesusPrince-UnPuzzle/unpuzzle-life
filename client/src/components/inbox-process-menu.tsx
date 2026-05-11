// PR #29b — Phase 8 inbox processing menu (bottom-sheet).
//
// Six buttons in the verbatim locked order from session b2f73166 turn 30:
//   Do It Now / Do It Later / Add to Project / File It / Wonder It / Trash It
//
// Q7 (locked 2026-05-10): Do It Now = mark complete (no downstream record).
// Q1 (locked 2026-05-10): Wonder It = move to /someday.
// Trash It here reuses POST /api/inbox/:id/process action=trash_it (which
// itself delegates to soft-delete) so all six paths share one orchestrator.
//
// Do It Later routes to a dedicated page built in PR #29c. PR #29e folded
// the former "Add to Project" path into the Do It Later screen as a
// collapsible section below Notes, so the menu now lists five buttons +
// the destructive Trash It action.
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import type { InboxItem } from "@shared/schema";

type ConfirmKind = "do_it_now" | "wonder_it" | "trash_it" | null;

export interface InboxProcessMenuProps {
  item: InboxItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InboxProcessMenu({ item, open, onOpenChange }: InboxProcessMenuProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  const processMut = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => {
      const r = await apiRequest("POST", `/api/inbox/${id}/process`, { action });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/trashed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/someday"] });
      const labels: Record<string, string> = {
        do_it_now: "Marked complete",
        wonder_it: "Moved to Someday",
        trash_it: "Trashed",
      };
      toast({ title: labels[vars.action] ?? "Processed" });
      setConfirmKind(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't process", description: err.message, variant: "destructive" });
    },
  });

  if (!item) return null;

  const triggerConfirm = (kind: ConfirmKind) => {
    setConfirmKind(kind);
  };

  const runConfirmed = () => {
    if (!confirmKind || !item) return;
    processMut.mutate({ id: item.id, action: confirmKind });
  };

  const goDoItLater = () => {
    onOpenChange(false);
    navigate(`/inbox/process/${item.id}/do-it-later`);
  };
  const goFileIt = () => {
    onOpenChange(false);
    navigate(`/inbox/process/${item.id}/file-it`);
  };

  // Confirm copy mirrors the locked ASCII (b2f73166 turn 29) where each
  // unchanged path ("Do It Now", "Wonder It", "Trash It") gets a small
  // confirmation step before the action runs.
  const confirmCopy: Record<Exclude<ConfirmKind, null>, { title: string; body: string; action: string }> = {
    do_it_now: {
      title: "Do it now",
      body: "Mark this item complete. It will move to Recently processed without creating a task or note.",
      action: "Mark complete",
    },
    wonder_it: {
      title: "Wonder it",
      body: "Move this item to Someday. You can move it back to the Inbox later if you decide to act on it.",
      action: "Move to Someday",
    },
    trash_it: {
      title: "Trash this item",
      body: "Soft-delete this item. You can restore it within 7 days from Recently trashed.",
      action: "Trash it",
    },
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-xl" data-testid="sheet-process-menu">
          <SheetHeader className="text-left">
            <SheetTitle>Process this item</SheetTitle>
            <SheetDescription className="line-clamp-3 break-words">
              {item.content}
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-2 py-4">
            <Button
              variant="default"
              className="justify-start h-11"
              onClick={() => triggerConfirm("do_it_now")}
              data-testid="button-process-do-it-now"
            >
              Do It Now
            </Button>
            <Button
              variant="secondary"
              className="justify-start h-11"
              onClick={goDoItLater}
              data-testid="button-process-do-it-later"
            >
              Do It Later
            </Button>
            <Button
              variant="secondary"
              className="justify-start h-11"
              onClick={goFileIt}
              data-testid="button-process-file-it"
            >
              File It
            </Button>
            <Button
              variant="secondary"
              className="justify-start h-11"
              onClick={() => triggerConfirm("wonder_it")}
              data-testid="button-process-wonder-it"
            >
              Wonder It
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-11 text-destructive hover:text-destructive"
              onClick={() => triggerConfirm("trash_it")}
              data-testid="button-process-trash-it"
            >
              Trash It
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
            data-testid="button-process-cancel"
          >
            Cancel
          </Button>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmKind !== null}
        onOpenChange={(o) => { if (!o) setConfirmKind(null); }}
      >
        <AlertDialogContent>
          {confirmKind && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmCopy[confirmKind].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmCopy[confirmKind].body}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-confirm-cancel">Back</AlertDialogCancel>
                <AlertDialogAction
                  onClick={runConfirmed}
                  disabled={processMut.isPending}
                  data-testid={`button-confirm-${confirmKind}`}
                >
                  {confirmCopy[confirmKind].action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
