// CollapsibleStickyHeader — PR #25 (project edit restructure)
//
// Sticky two-tier block that sits underneath EditPageHeader on the project
// edit page.
//
// Always-pinned rows:
//   1. Name (text input) + Status (compact tag-styled dropdown) +
//      Priority (compact tag-styled dropdown) + manual chevron toggle
//   2. (collapsed only) Peek line: "Next action: —"
//
// Collapsible block (auto-collapses on scroll, auto-expands at top):
//   1. Dates row     — Start / Target / End (the End cell only renders when
//                      status === "done")
//   2. Next action   — read-only display, "(auto-filled once you add tasks)"
//                      until tasks ship in a later PR
//   3. Progress      — read-only display, "0 / 0 tasks complete · Last
//                      touched today · Stalled? —"
//
// Behavior locked in /home/user/workspace/pr25-project-edit-target.md:
//   - Auto-collapse when scrollY > AUTO_COLLAPSE_THRESHOLD
//   - Auto-expand when scrollY <= AUTO_EXPAND_THRESHOLD
//   - Manual chevron toggle takes precedence; manual override is cleared on
//     the next scroll event (so auto-behavior resumes seamlessly).
//   - Sticky offset stacks beneath EditPageHeader. The parent supplies a CSS
//     custom property (--edit-header-h) that we read here so the block sits
//     flush below.
//
// Presentational. Owns only its expand/collapse state. Status / Priority /
// Name / Date values are still owned by the parent's draft.

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CollapsibleStickyHeaderProps {
  // ---------- Name (text) ----------
  title: string;
  onTitleChange: (v: string) => void;

  // ---------- Status / Priority (compact dropdowns) ----------
  status: string;
  priority: string;
  onStatusChange: (v: string) => void;
  onPriorityChange: (v: string) => void;

  // ---------- Dates ----------
  startDate: string; // YYYY-MM-DD or ""
  targetDate: string;
  endDate: string; // only meaningful when status === "done"
  onStartChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onEndChange: (v: string) => void;

  // ---------- Sticky stacking ----------
  // Offset (pixels) below the page-level EditPageHeader. The parent measures
  // EditPageHeader's height and passes it; we use this for `top: <px>`.
  topOffsetPx: number;

  // ---------- Validation ----------
  dateError: string | null;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// Scroll thresholds tuned for mobile. The hysteresis (collapse > expand)
// prevents jitter when the user hovers just at the boundary.
const AUTO_COLLAPSE_THRESHOLD = 32;
const AUTO_EXPAND_THRESHOLD = 8;

export function CollapsibleStickyHeader({
  title,
  onTitleChange,
  status,
  priority,
  onStatusChange,
  onPriorityChange,
  startDate,
  targetDate,
  endDate,
  onStartChange,
  onTargetChange,
  onEndChange,
  topOffsetPx,
  dateError,
}: CollapsibleStickyHeaderProps) {
  // expanded === null means "auto" (follow scroll). expanded === true/false
  // means user has manually overridden via the chevron; the next scroll
  // event clears the override.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [autoExpanded, setAutoExpanded] = useState(true);
  // The manual override is cleared on the next *user* scroll event after
  // a brief grace window. The grace window matters because clicking the
  // chevron causes the button to receive focus, which can fire one or two
  // synthetic scroll events (browser-driven scroll-into-view bounces).
  // Without the grace window the override would clear immediately and the
  // user would see no visual change from their click.
  const overrideActiveRef = useRef(false);
  const overrideUntilRef = useRef(0);
  const OVERRIDE_GRACE_MS = 250;
  // The actual scroll container we listen to. The app uses an inner
  // <main className="overflow-auto"> as the scroll surface (not window),
  // so we walk up from our own DOM node to find the nearest ancestor
  // whose computed overflow makes it a scroll container.
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    let node: HTMLElement | null = rootRef.current.parentElement;
    let target: HTMLElement | Window = window;
    while (node) {
      const cs = getComputedStyle(node);
      if (
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll" ||
        cs.overflow === "auto" ||
        cs.overflow === "scroll"
      ) {
        target = node;
        break;
      }
      node = node.parentElement;
    }

    function getY() {
      if (target === window) return window.scrollY;
      return (target as HTMLElement).scrollTop;
    }
    function onScroll() {
      const y = getY();
      if (overrideActiveRef.current) {
        if (performance.now() >= overrideUntilRef.current) {
          overrideActiveRef.current = false;
          setExpanded(null);
        }
      }
      if (y > AUTO_COLLAPSE_THRESHOLD) {
        setAutoExpanded(false);
      } else if (y <= AUTO_EXPAND_THRESHOLD) {
        setAutoExpanded(true);
      }
    }
    target.addEventListener("scroll", onScroll, { passive: true });
    // Sync initial state in case the page is loaded mid-scroll.
    onScroll();
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  const isExpanded = expanded === null ? autoExpanded : expanded;

  function toggleManual() {
    setExpanded(prev => {
      const next = !(prev === null ? autoExpanded : prev);
      overrideActiveRef.current = true;
      // Open a grace window during which incidental focus-driven scroll
      // events (caused by the click itself) are ignored. The next *real*
      // scroll past this window clears the override.
      overrideUntilRef.current = performance.now() + OVERRIDE_GRACE_MS;
      return next;
    });
  }

  return (
    <div
      ref={rootRef}
      className="sticky z-20 bg-background border-b"
      style={{ top: `${topOffsetPx}px` }}
      data-testid="project-sticky-header"
      data-expanded={isExpanded ? "true" : "false"}
    >
      {/* Always-pinned row: Name + Status + Priority + chevron. */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Project name"
          maxLength={200}
          className="flex-1 text-sm h-9"
          data-testid="input-project-title"
          aria-label="Project name"
        />
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger
            className="h-7 text-[11px] px-2 w-[88px] rounded-full bg-muted border-transparent"
            data-testid="select-project-status"
            aria-label="Status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => (
              <SelectItem
                key={o.value}
                value={o.value}
                data-testid={`option-status-${o.value}`}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={onPriorityChange}>
          <SelectTrigger
            className="h-7 text-[11px] px-2 w-[80px] rounded-full bg-muted border-transparent"
            data-testid="select-project-priority"
            aria-label="Priority"
          >
            <SelectValue placeholder="Pri" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map(o => (
              <SelectItem
                key={o.value}
                value={o.value}
                data-testid={`option-priority-${o.value}`}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={toggleManual}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover-elevate active-elevate-2"
          data-testid="button-sticky-toggle"
          aria-label={isExpanded ? "Collapse header" : "Expand header"}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Peek line — only when collapsed, mirrors §10 mock. */}
      {!isExpanded && (
        <div
          className="px-3 pb-2 text-[11px] text-muted-foreground"
          data-testid="text-sticky-peek"
        >
          Next action: —
        </div>
      )}

      {/* Collapsible block. */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3" data-testid="sticky-collapsible">
          {/* Dates row. */}
          <div className={`grid gap-2 ${status === "done" ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="space-y-1">
              <label
                htmlFor="proj-start"
                className="block text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Start
              </label>
              <Input
                id="proj-start"
                type="date"
                value={startDate}
                onChange={e => onStartChange(e.target.value)}
                className="text-xs h-8"
                data-testid="input-project-start-date"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="proj-target"
                className="block text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Target
              </label>
              <Input
                id="proj-target"
                type="date"
                value={targetDate}
                onChange={e => onTargetChange(e.target.value)}
                className="text-xs h-8"
                data-testid="input-project-target-date"
              />
            </div>
            {status === "done" && (
              <div className="space-y-1">
                <label
                  htmlFor="proj-end"
                  className="block text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  End
                </label>
                <Input
                  id="proj-end"
                  type="date"
                  value={endDate}
                  onChange={e => onEndChange(e.target.value)}
                  className="text-xs h-8"
                  data-testid="input-project-end-date"
                />
              </div>
            )}
          </div>

          {dateError && (
            <p
              className="text-[11px] text-destructive"
              data-testid="text-project-date-error"
            >
              {dateError}
            </p>
          )}

          {/* Next action — read-only placeholder until tasks ship. */}
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Next action
            </div>
            <div
              className="text-xs text-muted-foreground"
              data-testid="text-next-action-placeholder"
            >
              — (auto-filled once you add tasks)
            </div>
          </div>

          {/* Progress — read-only placeholder until tasks ship. */}
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Progress
            </div>
            <div
              className="text-xs text-muted-foreground"
              data-testid="text-progress-placeholder"
            >
              0 / 0 tasks complete · Last touched today · Stalled? —
            </div>
            <div className="text-[11px] italic text-muted-foreground -mt-0.5">
              (auto-filled once you add tasks)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
