import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useWizardDraft, formatArchiveTime, type ArchivedDraft,
} from "@/hooks/use-wizard-draft";

interface DraftFieldProps {
  userId: string | number | null | undefined;
  phase: number;
  fieldId: string;
  value: string;
  onChange: (v: string) => void;
  restoreReady: boolean;
  committedValue?: string;
  children: React.ReactNode;
}

// Wraps a text input/textarea, providing:
//  - debounced autosave to localStorage
//  - silent same-session restore
//  - "Restore an earlier version" link when archives exist
export function DraftField({
  userId, phase, fieldId, value, onChange, restoreReady, committedValue, children,
}: DraftFieldProps) {
  const { archives, restoreArchive, archiveCurrent } = useWizardDraft({
    userId, phase, fieldId, value, setValue: onChange, restoreReady, committedValue,
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<ArchivedDraft | null>(null);

  const handleSelect = (archive: ArchivedDraft) => {
    const hasUnsaved = value.length > 0
      && value !== (committedValue ?? "")
      && value !== archive.value;
    if (hasUnsaved) {
      setConfirmArchive(archive);
      return;
    }
    restoreArchive(archive);
    setPickerOpen(false);
  };

  const confirmReplace = () => {
    if (!confirmArchive) return;
    // Stash the current unsaved text so the user doesn't lose it.
    archiveCurrent(value);
    restoreArchive(confirmArchive);
    setConfirmArchive(null);
    setPickerOpen(false);
  };

  return (
    <>
      {children}
      {archives.length > 0 && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline mt-1"
          data-testid={`restore-earlier-${fieldId}`}
        >
          Restore an earlier version
        </button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Earlier versions</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {archives.map(a => (
              <button
                key={a.storageKey}
                type="button"
                onClick={() => handleSelect(a)}
                className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                data-testid={`archive-${fieldId}-${a.archivedAt}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {formatArchiveTime(a.archivedAt)}
                </p>
                <p className="text-sm whitespace-pre-wrap line-clamp-4">{a.value}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmArchive != null}
        onOpenChange={(o) => { if (!o) setConfirmArchive(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace unsaved text?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved text. Replace it with this earlier version?
              Your current text will be saved as another earlier version in case you want it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
