// useAutosaveDraft — Phase 5 (§10, §11)
//
// Generic hook for the v8 autosave-with-undo pattern used on Project v2 edit
// (§10) and Responsibility edit (§11). Owns:
//   - the current draft value (T)
//   - an undo stack of prior T snapshots
//   - a redo stack
//   - a "saved baseline" used by Revert draft + by the "Saved just now" pill
//   - a marks-for-removal queue (string keys) used by the bottom undo bar
//   - a debounced save callback the parent provides
//
// Snapshots are full deep copies of T. The Phase 5 edit values are small
// (a handful of fields plus a few short arrays of junction rows), so this is
// far simpler than a patch-diff model and easy to reason about.
//
// The hook is deliberately UI-free. The header component reads `state.savedAt,
// canUndo, canRedo, isDirty` and calls `undo / redo / revert / done`. Pages
// call `setDraft(...)` whenever a field changes and `markForRemoval(key) /
// undoRemoval(key)` for the in-place "marked for removal" pattern.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 600;

export interface UseAutosaveDraftOptions<T> {
  // The server-of-truth value, fetched by the page. Whenever this changes
  // (initial load, refetch after save), the hook resets its baseline.
  value: T;
  // Called with the current draft after the debounce window. Should perform
  // the PATCH and resolve when the server has accepted the write.
  save: (next: T) => Promise<void>;
  // Optional. Defaults to 600ms.
  debounceMs?: number;
  // Optional. If provided, used to compare two T values for equality so we
  // don't push redundant undo snapshots. Default uses JSON.stringify.
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutosaveDraftState<T> {
  draft: T;
  setDraft: (next: T) => void;
  // Undo / redo over field-level changes the user has made since load.
  canUndo: boolean;
  canRedo: boolean;
  // True when draft differs from the session-start snapshot. Drives whether
  // "Revert draft" is enabled.
  canRevert: boolean;
  undo: () => void;
  redo: () => void;
  // Revert draft = restore the value the user saw when the editor opened
  // (session-start snapshot). Erases the entire session's edits, autosaved
  // or not. Use to abandon a whole editing session in one click.
  revert: () => void;
  // "Done" is the user's signal that this editing session is finished. The
  // hook flushes any pending debounce and resolves once the save completes.
  done: () => Promise<void>;
  // True while a debounce is pending or a PATCH is in flight.
  isSaving: boolean;
  // ISO timestamp of the last successful save, or null if never saved this
  // session. The header uses this to render "Saved just now / Saved Xm ago".
  savedAt: string | null;
  // True when draft differs from the last saved baseline.
  isDirty: boolean;
  // Marks-for-removal queue. Keys are arbitrary strings the page picks
  // (e.g. `linkedRole:42` or `task:7`). The bottom undo bar shows count.
  markedForRemoval: Set<string>;
  markForRemoval: (key: string) => void;
  undoRemoval: (key: string) => void;
  clearRemovals: () => void;
  removalCount: number;
}

function deepClone<T>(v: T): T {
  // structuredClone is available in all browsers we target plus Node 17+.
  // Falls back to JSON for primitives / plain objects on older runtimes.
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

function defaultEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useAutosaveDraft<T>(
  opts: UseAutosaveDraftOptions<T>,
): AutosaveDraftState<T> {
  const { value, save, debounceMs = DEFAULT_DEBOUNCE_MS } = opts;
  const isEqual = opts.isEqual ?? defaultEqual;

  // The "saved baseline" — last value the server confirmed. Resets when the
  // parent's `value` prop changes (initial load or refetch).
  const [baseline, setBaseline] = useState<T>(() => deepClone(value));
  // Session-start snapshot. Captured on mount (and on any subsequent reset
  // triggered by the parent's `value` prop genuinely changing). Used by
  // `revert` to restore the state the user saw when the editor opened.
  // Per spec §10 / §11 "Revert draft": rolls back the entire editing
  // session, not just the latest autosave.
  const [sessionStart, setSessionStart] = useState<T>(() => deepClone(value));
  const [draft, setDraftState] = useState<T>(() => deepClone(value));
  const [undoStack, setUndoStack] = useState<T[]>([]);
  const [redoStack, setRedoStack] = useState<T[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<string>>(
    () => new Set(),
  );

  // When the parent's value prop changes (e.g. a refetch from elsewhere),
  // reset everything. Skip the reset when the incoming value matches either
  // the current baseline OR the last snapshot we saved — those are our own
  // saves round-tripping through the parent’s state and clearing undo/redo
  // on each save would defeat the entire autosave UX.
  const baselineRef = useRef<T>(baseline);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);
  useEffect(() => {
    if (isEqual(value, baselineRef.current)) return;
    if (
      lastSavedSnapshotRef.current != null &&
      isEqual(value, lastSavedSnapshotRef.current)
    ) {
      return;
    }
    const cloned = deepClone(value);
    setBaseline(cloned);
    setSessionStart(cloned);
    setDraftState(cloned);
    setUndoStack([]);
    setRedoStack([]);
    setMarkedForRemoval(new Set());
  }, [value, isEqual]);

  // Debounced save. The latest draft is captured via ref so the timer
  // always sees the freshest value, not a stale closure.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last snapshot the hook itself successfully saved. Used by the reset
  // effect below to recognize "this incoming value prop is the result of
  // our own save round-tripping through the parent’s state" and avoid
  // wiping out the undo/redo stacks when the parent re-renders.
  const lastSavedSnapshotRef = useRef<T | null>(null);

  const flushSave = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const snapshot = deepClone(draftRef.current);
    if (isEqual(snapshot, baseline)) {
      // Nothing to save.
      return;
    }
    setIsSaving(true);
    try {
      await saveRef.current(snapshot);
      lastSavedSnapshotRef.current = snapshot;
      setBaseline(snapshot);
      setSavedAt(new Date().toISOString());
    } finally {
      setIsSaving(false);
    }
  }, [baseline, isEqual]);

  const setDraft = useCallback(
    (next: T) => {
      setDraftState(prev => {
        if (isEqual(prev, next)) return prev;
        // Push the previous value onto undo, clear redo (new branch).
        setUndoStack(s => [...s, deepClone(prev)]);
        setRedoStack([]);
        return next;
      });
      // Restart debounce window.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setIsSaving(true);
      debounceTimerRef.current = setTimeout(() => {
        flushSave().catch(() => {
          // Surface errors via the parent's save callback rejection if needed.
          // The hook itself stays silent; pages can wrap save() with a toast.
          setIsSaving(false);
        });
      }, debounceMs);
    },
    [debounceMs, flushSave, isEqual],
  );

  const undo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack(r => [...r, deepClone(draftRef.current)]);
      setDraftState(deepClone(previous));
      // Trigger a debounced save of the restored state.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setIsSaving(true);
      debounceTimerRef.current = setTimeout(() => {
        flushSave().catch(() => setIsSaving(false));
      }, debounceMs);
      return stack.slice(0, -1);
    });
  }, [debounceMs, flushSave]);

  const redo = useCallback(() => {
    setRedoStack(stack => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setUndoStack(u => [...u, deepClone(draftRef.current)]);
      setDraftState(deepClone(next));
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setIsSaving(true);
      debounceTimerRef.current = setTimeout(() => {
        flushSave().catch(() => setIsSaving(false));
      }, debounceMs);
      return stack.slice(0, -1);
    });
  }, [debounceMs, flushSave]);

  const revert = useCallback(() => {
    // Restore the session-start snapshot — the value the user saw when the
    // editor opened. Erases the entire session's edits, autosaved or not.
    // Pushes current onto undo so the user can redo their way back if they
    // hit Revert by mistake.
    setUndoStack(s => [...s, deepClone(draftRef.current)]);
    setRedoStack([]);
    setDraftState(deepClone(sessionStart));
    setMarkedForRemoval(new Set());
    // Reverting changes the underlying draft back to session-start, which
    // differs from baseline — fire a save so the server reflects the rollback.
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setIsSaving(true);
    debounceTimerRef.current = setTimeout(() => {
      flushSave().catch(() => setIsSaving(false));
    }, debounceMs);
  }, [sessionStart, debounceMs, flushSave]);

  const done = useCallback(async () => {
    await flushSave();
  }, [flushSave]);

  const markForRemoval = useCallback((key: string) => {
    setMarkedForRemoval(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const undoRemoval = useCallback((key: string) => {
    setMarkedForRemoval(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearRemovals = useCallback(() => {
    setMarkedForRemoval(new Set());
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const isDirty = useMemo(
    () => !isEqual(draft, baseline),
    [draft, baseline, isEqual],
  );

  // True when the user has changed anything since the editor opened. Drives
  // whether "Revert draft" is enabled. Independent of `isDirty` because
  // autosave makes draft == baseline most of the time, but the session may
  // still differ from session start.
  const canRevert = useMemo(
    () => !isEqual(draft, sessionStart),
    [draft, sessionStart, isEqual],
  );

  return {
    draft,
    setDraft,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    canRevert,
    undo,
    redo,
    revert,
    done,
    isSaving,
    savedAt,
    isDirty,
    markedForRemoval,
    markForRemoval,
    undoRemoval,
    clearRemovals,
    removalCount: markedForRemoval.size,
  };
}
