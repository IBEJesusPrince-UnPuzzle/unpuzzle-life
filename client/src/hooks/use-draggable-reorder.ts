// PR #29c — Hybrid extraction of the PR #27 drag-to-reorder state machine.
//
// This is the headless half of PR #27's drag UX. It owns:
//
//   - HTML5 drag (desktop / mouse): onDragStart, onDragOverRow, onDropRow,
//     onDragEnd
//   - Pointer-based long-press fallback for touch (iOS Safari doesn't fire
//     HTML5 drag on touch): onGripPointerDown / Move / Up / Cancel
//   - 250ms long-press timer to keep short taps from entering drag mode
//   - 8px scroll-vs-drag threshold so vertical scrolls cancel the long-press
//   - elementFromPoint hit-testing against [data-task-row="true"] +
//     [data-task-id="<id>"] rows
//   - setPointerCapture so move events keep flowing if the pointer leaves
//     the grip
//   - draggingId / dropTargetId state for row styling and drop indicators
//   - computeReorder pure helper (drop-above-target, returns null on no-op)
//
// It does NOT own:
//
//   - Row DOM (each caller renders its own rows with whatever badge/edit/
//     status UI it needs). Rows must expose [data-task-row="true"] +
//     [data-task-id="<id>"] so the touch fallback can hit-test them.
//   - Persistence. The caller passes onCommit(newOrder) and decides what to
//     do — PATCH /api/project-tasks/:id (project-tasks-card) or update
//     local state only (Add to Project preview).
//   - Items source. The caller passes the current item array; the hook
//     derives ids on the fly each time a reorder fires.
//
// Locked behavior (must match PR #27 byte-for-byte for the
// project-tasks-card surface):
//
//   - Mouse: HTML5 drag fires immediately on mousedown of the grip handle
//   - Touch / pen: long-press 250ms before drag mode engages; ≤8px Y-axis
//     movement before the timer fires cancels the press
//   - Drop semantics: drop above the target (insertIdx = toIdx when
//     fromIdx > toIdx; otherwise toIdx)
//   - No-op detection: a drop that yields the same order does nothing
//
// Used by:
//   - client/src/components/project-tasks-card.tsx (PR #27; onCommit
//     PATCHes /api/project-tasks/:id)
//   - client/src/pages/inbox-add-to-project.tsx (PR #29c; onCommit updates
//     local React state for the pre-save preview)

import { useCallback, useEffect, useRef, useState } from "react";

export interface DraggableItem {
  id: number;
}

export interface UseDraggableReorderOptions<T extends DraggableItem> {
  // Current visible items, in render order. Hook reads `id` only.
  items: T[];
  // Called when a drop produces a new order. Receives the full id sequence
  // after the move; caller decides how to persist (PATCH vs setState).
  // No-ops never invoke onCommit.
  onCommit: (newOrder: number[]) => void;
  // Disables drag entirely (e.g. when a row is in inline-edit mode and the
  // caller doesn't render a grip handle). Locked PR #27 behavior gates the
  // grip via JSX, so this is optional and defaults to false.
  disabled?: boolean;
}

export interface UseDraggableReorderResult {
  // State for row styling / drop indicators.
  draggingId: number | null;
  dropTargetId: number | null;

  // HTML5 drag handlers — wire onto the grip handle (onDragStart) and the
  // row (onDragOver, onDrop). onDragEnd cleans up cancelled drags.
  onDragStart: (e: React.DragEvent<HTMLElement>, taskId: number) => void;
  onDragOverRow: (e: React.DragEvent<HTMLElement>, taskId: number) => void;
  onDropRow: (e: React.DragEvent<HTMLElement>, taskId: number) => void;
  onDragEnd: () => void;

  // Pointer-based touch fallback — wire all four onto the grip handle.
  onGripPointerDown: (
    e: React.PointerEvent<HTMLButtonElement>,
    taskId: number,
  ) => void;
  onGripPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripPointerCancel: () => void;
}

export function useDraggableReorder<T extends DraggableItem>(
  opts: UseDraggableReorderOptions<T>,
): UseDraggableReorderResult {
  const { items, onCommit, disabled = false } = opts;

  // The id of the row currently being dragged (null when not dragging).
  const [draggingId, setDraggingId] = useState<number | null>(null);
  // The id of the row currently being hovered over as a drop target.
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  // Touch path uses pointer events. We arm the long-press timer on
  // pointerdown and only enter drag mode if the user holds for 250ms.
  // This keeps short taps on the grip (which the row body handles edits
  // for) from accidentally entering drag mode, matching iOS Reminders.
  const longPressTimer = useRef<number | null>(null);
  const touchDragRef = useRef<{
    id: number;
    startY: number;
    rowEl: HTMLElement | null;
  } | null>(null);

  // Compute new id order after moving `fromId` to land on `toId`.
  // If `fromId` and `toId` are the same, returns null (no-op).
  // Drop-above-target semantics.
  const computeReorder = useCallback(
    (fromId: number, toId: number): number[] | null => {
      if (fromId === toId) return null;
      const ids = items.map((t) => t.id);
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return null;
      const next = ids.slice();
      next.splice(fromIdx, 1);
      // After splice, the target index shifts left by 1 if fromIdx < toIdx.
      const insertIdx = fromIdx < toIdx ? toIdx : toIdx;
      next.splice(insertIdx, 0, fromId);
      // No-op detection: if the resulting order matches the original, bail.
      if (next.every((id, i) => id === ids[i])) return null;
      return next;
    },
    [items],
  );

  // Apply a reorder by calling onCommit; the caller decides what to do
  // with the new order (PATCH or setState).
  const applyReorder = useCallback(
    (fromId: number, toId: number) => {
      const next = computeReorder(fromId, toId);
      if (!next) return;
      onCommit(next);
    },
    [computeReorder, onCommit],
  );

  // ----- HTML5 drag handlers (desktop / mouse) -----

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>, taskId: number) => {
      if (disabled) return;
      setDraggingId(taskId);
      e.dataTransfer.effectAllowed = "move";
      // Required by Firefox to actually start a drag.
      try {
        e.dataTransfer.setData("text/plain", String(taskId));
      } catch {
        // Some browsers throw on setData during drag; safe to ignore.
      }
    },
    [disabled],
  );

  const onDragOverRow = useCallback(
    (e: React.DragEvent<HTMLElement>, taskId: number) => {
      if (draggingId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTargetId !== taskId) setDropTargetId(taskId);
    },
    [draggingId, dropTargetId],
  );

  const onDropRow = useCallback(
    (e: React.DragEvent<HTMLElement>, taskId: number) => {
      if (draggingId === null) return;
      e.preventDefault();
      const fromId = draggingId;
      setDraggingId(null);
      setDropTargetId(null);
      applyReorder(fromId, taskId);
    },
    [draggingId, applyReorder],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  // ----- Pointer-based touch fallback -----

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, taskId: number) => {
      if (disabled) return;
      // Only handle touch / pen. Mouse uses HTML5 dragstart instead.
      if (e.pointerType === "mouse") return;
      const rowEl = (e.currentTarget.closest(
        '[data-task-row="true"]',
      ) as HTMLElement | null);
      touchDragRef.current = { id: taskId, startY: e.clientY, rowEl };
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
      }
      longPressTimer.current = window.setTimeout(() => {
        // Long-press fired — enter drag mode.
        if (touchDragRef.current?.id === taskId) {
          setDraggingId(taskId);
          // Capture pointer so we keep getting move events even if the
          // pointer leaves the grip element.
          try {
            (e.target as Element).setPointerCapture?.(e.pointerId);
          } catch {
            // Best-effort; fall through.
          }
        }
        longPressTimer.current = null;
      }, 250);
    },
    [disabled],
  );

  const onGripPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse") return;
      const ref = touchDragRef.current;
      if (!ref) return;
      // Cancel the long-press if the user moves more than 8px before the
      // timer fires — they probably meant to scroll, not drag.
      if (longPressTimer.current !== null) {
        if (Math.abs(e.clientY - ref.startY) > 8) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          touchDragRef.current = null;
        }
        return;
      }
      if (draggingId === null) return;
      e.preventDefault();
      // Hit-test which row the pointer is over.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = el?.closest('[data-task-row="true"]') as
        | HTMLElement
        | null;
      if (rowEl) {
        const idAttr = rowEl.getAttribute("data-task-id");
        if (idAttr) {
          const overId = Number(idAttr);
          if (Number.isFinite(overId) && overId !== dropTargetId) {
            setDropTargetId(overId);
          }
        }
      }
    },
    [draggingId, dropTargetId],
  );

  const onGripPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      const ref = touchDragRef.current;
      touchDragRef.current = null;
      if (draggingId !== null && dropTargetId !== null) {
        const fromId = draggingId;
        const toId = dropTargetId;
        setDraggingId(null);
        setDropTargetId(null);
        applyReorder(fromId, toId);
      } else {
        setDraggingId(null);
        setDropTargetId(null);
      }
      void ref;
    },
    [draggingId, dropTargetId, applyReorder],
  );

  const onGripPointerCancel = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchDragRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  // Cleanup any pending long-press timer if the component unmounts mid-press.
  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  return {
    draggingId,
    dropTargetId,
    onDragStart,
    onDragOverRow,
    onDropRow,
    onDragEnd,
    onGripPointerDown,
    onGripPointerMove,
    onGripPointerUp,
    onGripPointerCancel,
  };
}
