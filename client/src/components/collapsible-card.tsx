// CollapsibleCard — PR #25 (project edit restructure)
//
// Wrapper card with a header row that toggles its body open/closed.
//
// Header layout (always shown):
//   [chevron]  Title           Subline (collapsed only)
//
// Behavior:
//   - Open/closed is *controlled* by the parent via `open` + `onToggle`.
//     Persistence (localStorage) lives in the parent so we don't have to
//     plumb the projectId in here.
//   - When open, `children` render in a CardContent body.
//   - When closed, the body is fully unmounted (mirrors the §10 mock —
//     truly collapsed, not just hidden).
//   - `subline` is a small muted line beside the title, only visible when
//     the card is collapsed (so the user gets a hint of what's inside
//     without expanding).
//
// Used for both Bundle A, Tasks, Bundle B (top-level cards) and for the
// inner accordion items inside Bundle B (variant="inner").

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface CollapsibleCardProps {
  title: string;
  subline?: string;
  open: boolean;
  onToggle: () => void;
  testId?: string;
  // "outer" = Card-styled, used for the three top-level bundles.
  // "inner" = bare bordered row, used for accordion items inside Bundle B
  //           where wrapping each row in another Card looks heavy.
  variant?: "outer" | "inner";
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  subline,
  open,
  onToggle,
  testId,
  variant = "outer",
  children,
}: CollapsibleCardProps) {
  // Header markup is identical between variants; only the chrome around
  // the body differs.
  const header = (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover-elevate active-elevate-2 rounded"
      data-testid={testId ? `${testId}-toggle` : undefined}
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
      )}
      <span className="text-sm font-medium flex-1 truncate">{title}</span>
      {!open && subline && (
        <span
          className="text-[11px] text-muted-foreground truncate max-w-[55%]"
          data-testid={testId ? `${testId}-subline` : undefined}
        >
          {subline}
        </span>
      )}
    </button>
  );

  if (variant === "inner") {
    return (
      <div
        className="border rounded-md bg-background"
        data-testid={testId}
        data-open={open ? "true" : "false"}
      >
        {header}
        {open && <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>}
      </div>
    );
  }

  return (
    <Card data-testid={testId} data-open={open ? "true" : "false"}>
      {header}
      {open && (
        <CardContent className="p-4 pt-2 space-y-3">{children}</CardContent>
      )}
    </Card>
  );
}
