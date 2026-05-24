// use-drag-reschedule.ts
//
// Headless hook for drag-to-reschedule on the agenda time grid.
//
// Behaviour (Google Calendar parity):
//   - pointerdown on a chip starts a potential drag.
//   - If the pointer moves > DRAG_THRESHOLD_PX before pointerup, we enter
//     drag mode: the original chip fades and a ghost follows the pointer,
//     snapping to the nearest 30-minute slot.
//   - pointerup in drag mode fires onCommit({ id, newDate, newTime }).
//   - pointerup WITHOUT drag mode fires onTap(item) — preserves the existing
//     click-to-view behaviour.
//   - setPointerCapture keeps move events flowing when the pointer leaves
//     the column container.
//   - Works with both mouse and touch (pointer events unify both).
//
// Returns:
//   chipHandlers(item, startMin)  — spread onto each chip element.
//   columnHandlers                — spread onto the column container div.
//   dragState                     — { draggingId, ghostTopPx } for rendering.

import { useCallback, useRef, useState } from "react";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

const DRAG_THRESHOLD_PX = 5;
const SNAP_MINUTES = 30;

export type DragCommit = {
  item: AgendaWindowItem;
  newDate: string;   // YYYY-MM-DD
  newTime: string;   // HH:MM
};

export type DragState = {
  draggingId: number | null;
  ghostTopPx: number | null;
};

type Options = {
  columnRef: React.RefObject<HTMLDivElement | null>;
  hourHeightPx: number;
  columnDate: string; // YYYY-MM-DD — the date this column represents
  onTap: (item: AgendaWindowItem) => void;
  onCommit: (commit: DragCommit) => void;
};

function snapToSlot(totalMin: number): number {
  return Math.max(
    0,
    Math.min(23 * 60 + 30, Math.round(totalMin / SNAP_MINUTES) * SNAP_MINUTES),
  );
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function useDragReschedule({
  columnRef,
  hourHeightPx,
  columnDate,
  onTap,
  onCommit,
}: Options) {
  // Active drag session stored in a ref so pointer handlers always see the
  // latest value without stale closure issues.
  const session = useRef<{
    item: AgendaWindowItem;
    startMin: number;       // original start minute of the chip
    chipOffsetMin: number;  // where within the chip the pointer landed
    startY: number;         // pointer Y at drag start (for threshold)
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const [dragState, setDragState] = useState<DragState>({
    draggingId: null,
    ghostTopPx: null,
  });

  const resolveTopPx = useCallback(
    (clientY: number): number => {
      const col = columnRef.current;
      if (!col) return 0;
      const rect = col.getBoundingClientRect();
      return clientY - rect.top;
    },
    [columnRef],
  );

  const ghostTopForClientY = useCallback(
    (clientY: number, chipOffsetMin: number): number => {
      const col = columnRef.current;
      if (!col) return 0;
      const rect = col.getBoundingClientRect();
      const offsetY = clientY - rect.top;
      const rawMin = (offsetY / hourHeightPx) * 60 - chipOffsetMin;
      const snapped = snapToSlot(rawMin);
      return (snapped / 60) * hourHeightPx;
    },
    [columnRef, hourHeightPx],
  );

  // Called from each chip's onPointerDown.
  const onChipPointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLButtonElement>,
      item: AgendaWindowItem,
      startMin: number,
    ) => {
      // Only primary button / single touch.
      if (e.button !== 0 && e.pointerType === "mouse") return;

      e.stopPropagation(); // don't bubble to column slot-click handler

      const col = columnRef.current;
      if (!col) return;

      const rect = col.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const chipOffsetMin = (offsetY / hourHeightPx) * 60 - startMin;

      session.current = {
        item,
        startMin,
        chipOffsetMin: Math.max(0, chipOffsetMin),
        startY: e.clientY,
        dragging: false,
        pointerId: e.pointerId,
      };

      // Capture on the column so move/up events keep flowing globally.
      try {
        col.setPointerCapture(e.pointerId);
      } catch {
        // Safari may throw if the element isn't in a state to capture.
      }
    },
    [columnRef, hourHeightPx],
  );

  const onColumnPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;

      const dy = Math.abs(e.clientY - s.startY);

      if (!s.dragging) {
        if (dy < DRAG_THRESHOLD_PX) return;
        s.dragging = true;
      }

      const ghostTopPx = ghostTopForClientY(e.clientY, s.chipOffsetMin);
      setDragState({ draggingId: s.item.id, ghostTopPx });
    },
    [ghostTopForClientY],
  );

  const onColumnPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;

      const col = columnRef.current;
      try { col?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (!s.dragging) {
        // Treat as a tap — delegate to onTap.
        session.current = null;
        setDragState({ draggingId: null, ghostTopPx: null });
        onTap(s.item);
        return;
      }

      // Compute new start time from drop position.
      const col2 = columnRef.current;
      const rect = col2?.getBoundingClientRect();
      if (!rect) {
        session.current = null;
        setDragState({ draggingId: null, ghostTopPx: null });
        return;
      }
      const offsetY = e.clientY - rect.top;
      const rawMin = (offsetY / hourHeightPx) * 60 - s.chipOffsetMin;
      const newStartMin = snapToSlot(rawMin);

      session.current = null;
      setDragState({ draggingId: null, ghostTopPx: null });

      if (newStartMin === s.startMin) return; // no-op

      onCommit({
        item: s.item,
        newDate: columnDate,
        newTime: minToTime(newStartMin),
      });
    },
    [columnRef, columnDate, hourHeightPx, onTap, onCommit],
  );

  const onColumnPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;
      session.current = null;
      setDragState({ draggingId: null, ghostTopPx: null });
    },
    [],
  );

  const chipHandlers = useCallback(
    (item: AgendaWindowItem, startMin: number) => ({
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) =>
        onChipPointerDown(e, item, startMin),
    }),
    [onChipPointerDown],
  );

  const columnHandlers = {
    onPointerMove: onColumnPointerMove,
    onPointerUp: onColumnPointerUp,
    onPointerCancel: onColumnPointerCancel,
  };

  return { chipHandlers, columnHandlers, dragState };
}
