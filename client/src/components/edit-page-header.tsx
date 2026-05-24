// EditPageHeader — Phase 5 (§10, §11)
//
// Sticky two-row header used by the autosave edit pages:
//   Row 1:  ← Back        Edit <thing>     [i]
//   Row 2:  Saved just now   [Undo] [Redo] [Revert draft] [Done]
//
// The component is presentational. It does not own state; it reads state from
// useAutosaveDraft via props and forwards button clicks. The "Saved just now"
// pill is a derived label computed from `savedAt + isSaving + isDirty`.

import { ArrowLeft, Info } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEffect, useState } from "react";

export interface EditPageHeaderProps {
  // Where the back button goes. Should be a wouter-compatible path.
  backHref: string;
  // Right-of-arrow page title, e.g. "Edit project" or "Edit responsibility".
  title: string;
  // Optional name of the item being edited (shown below title, no truncation).
  subtitle?: string;
  // Optional helper content shown when the user taps the [i] icon.
  // Pass null to omit the info button entirely.
  infoContent?: React.ReactNode;
  // Saved-state inputs from useAutosaveDraft.
  savedAt: string | null;
  isSaving: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  // True when draft differs from session-start. Used to enable Revert draft.
  canRevert: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRevert: () => void;
  onDone: () => void;
}

function formatSavedLabel(
  savedAt: string | null,
  isSaving: boolean,
  isDirty: boolean,
  now: number,
): string {
  if (isSaving) return "Saving…";
  if (savedAt == null) {
    return isDirty ? "Unsaved changes" : "No changes yet";
  }
  const diffSec = Math.max(0, Math.floor((now - new Date(savedAt).getTime()) / 1000));
  if (diffSec < 5) return "Saved just now";
  if (diffSec < 60) return `Saved ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Saved ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `Saved ${diffHr}h ago`;
}

export function EditPageHeader({
  backHref,
  title,
  subtitle,
  infoContent,
  savedAt,
  isSaving,
  isDirty,
  canUndo,
  canRedo,
  canRevert,
  onUndo,
  onRedo,
  onRevert,
  onDone,
}: EditPageHeaderProps) {
  // Tick every 15s so "Saved Xm ago" stays fresh without per-second churn.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const savedLabel = formatSavedLabel(savedAt, isSaving, isDirty, now);

  return (
    <div
      className="sticky top-0 z-30 bg-background border-b"
      data-testid="edit-page-header"
    >
      {/* Row 1 — back, title, info */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Link href={backHref}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="sr-only">Back</span>
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1
            className="text-sm font-semibold tracking-tight"
            data-testid="text-edit-title"
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground whitespace-normal leading-tight mt-0.5" data-testid="text-edit-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        {infoContent != null ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                data-testid="button-info"
                aria-label="More info"
              >
                <Info className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="w-72 text-xs leading-relaxed"
              data-testid="popover-info"
            >
              {infoContent}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {/* Row 2 — saved pill, action buttons */}
      <div className="flex items-center gap-1 px-3 pb-2">
        <span
          className="text-[11px] text-muted-foreground flex-1 truncate"
          data-testid="text-saved-status"
          aria-live="polite"
        >
          {savedLabel}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!canUndo}
          onClick={onUndo}
          data-testid="button-undo"
        >
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!canRedo}
          onClick={onRedo}
          data-testid="button-redo"
        >
          Redo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!canRevert}
          onClick={onRevert}
          data-testid="button-revert"
        >
          Revert draft
        </Button>
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={onDone}
          data-testid="button-done"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
