// use-drag-create.ts
//
// Headless hook for drag-to-create on the agenda time grid (Google parity).
//
// Behaviour:
//   - pointerdown on the empty column background (not on a chip — chips call
//     e.stopPropagation() on their own pointerdown) starts a potential create.
//   - If pointer moves > DRAG_THRESHOLD_PX vertically, we enter create mode:
//     a blue selection rect grows between the snap-rounded anchor and the
//     current pointer position.
//   - pointerup in drag mode → navigate to /agenda/tasks/new with the snapped
//     start time AND a duration derived from how far the user dragged.
//   - pointerup WITHOUT drag mode → same as a slot-tap (existing behaviour,
//     navigates with just the start time, no duration hint).
//   - setPointerCapture keeps move events flowing outside the column.
//   - Works with mouse and touch (pointer events).
//
// Returns:
//   columnHandlers   — spread onto the column container div (replaces onClick).
//   createGhost      — { topPx, heightPx } | null — render a selection rect
//                      when non-null.

import { useCallback, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 8;
const SNAP_MINUTES = 30;
const MIN_DRAG_DURATION_MIN = 30; // minimum created event length

function snapDown(totalMin: number): number {
  return Math.max(
    0,
    Math.min(23 * 60 + 30, Math.floor(totalMin / SNAP_MINUTES) * SNAP_MINUTES),
  );
}

function snapUp(totalMin: number): number {
  return Math.max(
    SNAP_MINUTES,
    Math.min(24 * 60, Math.ceil(totalMin / SNAP_MINUTES) * SNAP_MINUTES),
  );
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type CreateGhost = {
  topPx: number;
  heightPx: number;
  label: string; // e.g. "10:00 – 11:00"
};

type Options = {
  columnRef: React.RefObject<HTMLDivElement | null>;
  hourHeightPx: number;
  columnDate: string; // YYYY-MM-DD
  onNavigate: (url: string) => void;
};

export function useDragCreate({
  columnRef,
  hourHeightPx,
  columnDate,
  onNavigate,
}: Options) {
  const session = useRef<{
    anchorMin: number;    // snapped start minute where pointer first landed
    startY: number;       // pointer Y at mousedown
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const [createGhost, setCreateGhost] = useState<CreateGhost | null>(null);

  const offsetToMin = useCallback(
    (clientY: number): number => {
      const col = columnRef.current;
      if (!col) return 0;
      const rect = col.getBoundingClientRect();
      return Math.max(0, Math.min(24 * 60, (clientY - rect.top) / hourHeightPx * 60));
    },
    [columnRef, hourHeightPx],
  );

  const minToTopPx = useCallback(
    (min: number) => (min / 60) * hourHeightPx,
    [hourHeightPx],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Chips stop propagation on their own pointerdown — this only fires on
      // empty background clicks. But guard anyway.
      if (e.button !== 0 && e.pointerType === "mouse") return;

      const anchorRaw = offsetToMin(e.clientY);
      const anchorMin = snapDown(anchorRaw);

      session.current = {
        anchorMin,
        startY: e.clientY,
        dragging: false,
        pointerId: e.pointerId,
      };

      const col = columnRef.current;
      try { col?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    },
    [columnRef, offsetToMin],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;

      const dy = Math.abs(e.clientY - s.startY);
      if (!s.dragging) {
        if (dy < DRAG_THRESHOLD_PX) return;
        s.dragging = true;
      }

      const curRaw = offsetToMin(e.clientY);
      const isDraggingDown = e.clientY >= s.startY;

      let startMin: number;
      let endMin: number;

      if (isDraggingDown) {
        startMin = s.anchorMin;
        endMin = Math.max(s.anchorMin + MIN_DRAG_DURATION_MIN, snapUp(curRaw));
      } else {
        endMin = s.anchorMin + SNAP_MINUTES; // anchor is the bottom edge when dragging up
        startMin = Math.min(s.anchorMin, snapDown(curRaw));
      }

      endMin = Math.min(24 * 60, endMin);

      setCreateGhost({
        topPx: minToTopPx(startMin),
        heightPx: minToTopPx(endMin) - minToTopPx(startMin),
        label: `${minToTime(startMin)} – ${minToTime(endMin)}`,
      });
    },
    [offsetToMin, minToTopPx],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;

      const col = columnRef.current;
      try { col?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (!s.dragging) {
        // Pure tap — navigate with just start time (existing slot-tap behaviour).
        session.current = null;
        setCreateGhost(null);
        const tapMin = snapDown(offsetToMin(e.clientY));
        onNavigate(
          `/agenda/tasks/new?date=${encodeURIComponent(columnDate)}&time=${encodeURIComponent(minToTime(tapMin))}`,
        );
        return;
      }

      // Drag — compute final range.
      const curRaw = offsetToMin(e.clientY);
      const isDraggingDown = e.clientY >= s.startY;
      let startMin: number;
      let endMin: number;

      if (isDraggingDown) {
        startMin = s.anchorMin;
        endMin = Math.max(s.anchorMin + MIN_DRAG_DURATION_MIN, snapUp(curRaw));
      } else {
        endMin = s.anchorMin + SNAP_MINUTES;
        startMin = Math.min(s.anchorMin, snapDown(curRaw));
      }
      endMin = Math.min(24 * 60, endMin);
      const duration = endMin - startMin;

      session.current = null;
      setCreateGhost(null);

      onNavigate(
        `/agenda/tasks/new?date=${encodeURIComponent(columnDate)}&time=${encodeURIComponent(minToTime(startMin))}&duration=${duration}`,
      );
    },
    [columnRef, columnDate, offsetToMin, onNavigate],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;
      session.current = null;
      setCreateGhost(null);
    },
    [],
  );

  const columnHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };

  return { columnHandlers, createGhost };
}
