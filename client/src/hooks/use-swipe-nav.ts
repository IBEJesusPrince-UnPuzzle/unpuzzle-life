// Phase 3b — swipe-to-change-date hook used by all four Agenda views.
//
// Locked behavior (May 7, 2026):
//   - Day view swipes ±1 day, 3 Days swipes ±3 days, Week swipes ±7 days,
//     Month swipes ±1 month. Step is set by the calling view via `onPrev` / `onNext`.
//   - Horizontal-only: gesture must be more horizontal than vertical at start
//     so it never hijacks the vertical time-grid scroll.
//   - Swipe changes date only — does NOT change view, does NOT PATCH the
//     user's default-view preference.
//
// Defaults tuned to feel like Google Calendar mobile:
//   - 50 px minimum horizontal travel before commit
//   - 0.3 px/ms minimum velocity (a quick flick commits even at smaller travel)
//   - Movement that starts more vertical than horizontal is ignored entirely

import { useCallback, useRef } from "react";

export interface SwipeNavOptions {
  onPrev: () => void;
  onNext: () => void;
  /** Minimum horizontal travel in px to commit. Default 50. */
  minDistance?: number;
  /** Minimum velocity in px/ms to commit when below minDistance. Default 0.3. */
  minVelocity?: number;
  /** Disable swipe entirely (e.g. while a modal is open). Default false. */
  disabled?: boolean;
}

interface TouchState {
  startX: number;
  startY: number;
  startT: number;
  /** True once we've decided this is a horizontal gesture and committed. */
  isHorizontal: boolean | null;
}

/**
 * Returns props to spread on the root container of the view.
 * Uses pointer events so it works for touch + mouse drag (handy for desktop testing).
 */
export function useSwipeNav(opts: SwipeNavOptions) {
  const { onPrev, onNext, minDistance = 50, minVelocity = 0.3, disabled = false } = opts;
  const stateRef = useRef<TouchState | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      // Only single-finger / primary-button gestures
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startT: performance.now(),
        isHorizontal: null,
      };
    },
    [disabled],
  );

  // PR #37 — capture the pointer on the container so the swipe survives a
  // finger that drifts onto a child element mid-gesture (chips, hour cells).
  // Without setPointerCapture the OS may re-target pointermove to the child
  // and we lose the gesture entirely on mobile.
  const capturePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // Some browsers throw if the pointer is already captured elsewhere
        // (e.g. inside a Radix overlay). Safe to ignore — swipe still works.
      }
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = stateRef.current;
      if (!s) return;
      // First time we see meaningful movement, decide direction
      if (s.isHorizontal === null) {
        const dx = Math.abs(e.clientX - s.startX);
        const dy = Math.abs(e.clientY - s.startY);
        // 8px deadzone before deciding so a tap doesn't accidentally trigger
        if (dx < 8 && dy < 8) return;
        s.isHorizontal = dx > dy;
        // If vertical, abandon — let the time grid scroll naturally
        if (!s.isHorizontal) {
          stateRef.current = null;
        }
      }
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = stateRef.current;
      stateRef.current = null;
      if (!s || s.isHorizontal !== true) return;
      const dx = e.clientX - s.startX;
      const dt = Math.max(performance.now() - s.startT, 1);
      const velocity = Math.abs(dx) / dt;
      const passDistance = Math.abs(dx) >= minDistance;
      const passVelocity = velocity >= minVelocity && Math.abs(dx) >= 20;
      if (!passDistance && !passVelocity) return;
      // Swipe LEFT (negative dx) → next date.  Swipe RIGHT → previous date.
      if (dx < 0) onNext();
      else onPrev();
    },
    [onPrev, onNext, minDistance, minVelocity],
  );

  const onPointerCancel = useCallback(() => {
    stateRef.current = null;
  }, []);

  // PR #37 — combine pointerdown handlers so the host doesn't need to know
  // about pointer-capture plumbing. Container should also be styled with
  // touch-action: pan-y so mobile browsers delegate vertical scroll to the
  // platform but let our horizontal pointer events through.
  const onPointerDownCombined = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown(e);
      capturePointer(e);
    },
    [onPointerDown, capturePointer],
  );

  return {
    onPointerDown: onPointerDownCombined,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    style: { touchAction: "pan-y" as const },
  };
}
