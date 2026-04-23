import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WizardDraftPromptProps {
  open: boolean;
  onPickItUp: () => void;
  onStartFresh: () => void;
}

export function WizardDraftPrompt({ open, onPickItUp, onStartFresh }: WizardDraftPromptProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent data-testid="wizard-draft-prompt">
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome back</AlertDialogTitle>
          <AlertDialogDescription>
            We held onto what you were writing. Pick it up, or start fresh?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStartFresh} data-testid="start-fresh">
            Start fresh
          </AlertDialogCancel>
          <AlertDialogAction onClick={onPickItUp} data-testid="pick-it-up">
            Pick it up
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
