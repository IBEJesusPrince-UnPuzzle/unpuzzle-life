// RoleDeleteModal — Phase 5 PR #17b
//
// Confirmation modal for deleting a role from the Role edit screen.
// Body text matches addendum §A4.1 verbatim.
//
// Self protection is enforced both client-side (hide/disable the trigger)
// and server-side (DELETE /api/roles/:id returns 409 for "Self"). This
// component is dumb about Self — it just shows the dialog and wires the
// confirm button.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RoleDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleName: string;
  responsibilityCount: number;
  peopleCount: number;
  onConfirm: () => void;
  isDeleting?: boolean;
}

function plural(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural;
}

export function RoleDeleteModal({
  open,
  onOpenChange,
  roleName,
  responsibilityCount,
  peopleCount,
  onConfirm,
  isDeleting = false,
}: RoleDeleteModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-delete-role">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete role &ldquo;{roleName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-sm">
            <span className="block">
              This role has {responsibilityCount}{" "}
              {plural(responsibilityCount, "responsibility", "responsibilities")}{" "}
              and {peopleCount} {plural(peopleCount, "person", "people")}.
            </span>
            <span className="block">
              The role will be removed. Responsibilities linked to this role
              will keep their other linked roles. If a responsibility was only
              linked to this role, it will become unlinked (visible in
              &ldquo;responsibilities missing a role&rdquo; review).
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="button-confirm-delete"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting…" : "Delete role"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
