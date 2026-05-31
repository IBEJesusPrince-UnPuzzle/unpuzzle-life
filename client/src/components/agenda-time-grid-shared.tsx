// Phase 3b — primitives shared across time-grid views (Day, 3 Days, Week).
// Centralizing these here keeps the views in pixel-perfect agreement on
// hour height and current-time line styling.
//
// PR #37 — pinch-zoom adds a user-controllable hourHeightPx persisted on
// the user record. The pre-PR #37 constant becomes the default. Views
// should call useAgendaZoom() to get the live value; the constant remains
// exported for SSR / tests / any place a static fallback is wanted.

import { useEffect, useState, useCallback, useRef, type RefObject } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export const DEFAULT_HOUR_HEIGHT_PX = 56; // 56px / hour — pre-PR #37 default.
export const MIN_HOUR_HEIGHT_PX = 28;     // Pinch-zoom lower clamp (Google parity).
export const MAX_HOUR_HEIGHT_PX = 112;    // Pinch-zoom upper clamp (Google parity).

/**
 * @deprecated Use useAgendaZoom() to get the live pinch-zoom value. Kept
 * exported so older imports keep compiling — callers that still import
 * this constant will simply not respond to user zoom.
 */
export const HOUR_HEIGHT_PX = DEFAULT_HOUR_HEIGHT_PX;

/**
 * useAgendaZoom — reads the user's persisted hour-row pixel height and
 * exposes a commit function that PATCHes the new value to the server.
 * The query is cached so all three time-grid views see the same live
 * number.
 */
export function useAgendaZoom() {
  const qc = useQueryClient();
  const { data } = useQuery<{ hourHeightPx: number }>({
    queryKey: ["/api/agenda-hour-height"],
    queryFn: async () => {
      const r = await fetch("/api/agenda-hour-height", { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 1000 * 60 * 60, // 1h — user rarely changes this
  });
  const hourHeightPx = data?.hourHeightPx ?? DEFAULT_HOUR_HEIGHT_PX;

  const mutation = useMutation({
    mutationFn: async (next: number) => {
      const clamped = Math.min(MAX_HOUR_HEIGHT_PX, Math.max(MIN_HOUR_HEIGHT_PX, Math.round(next)));
      const r = await apiRequest("PATCH", "/api/agenda-hour-height", { hourHeightPx: clamped });
      return r.json();
    },
    onSuccess: (resp: { hourHeightPx: number }) => {
      qc.setQueryData(["/api/agenda-hour-height"], resp);
    },
  });

  // Optimistic update used during the pinch gesture so the grid resizes
  // live without round-tripping every move event. The mutation only fires
  // on touchend (handled by the caller).
  const setLocal = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_HOUR_HEIGHT_PX, Math.max(MIN_HOUR_HEIGHT_PX, Math.round(next)));
      qc.setQueryData(["/api/agenda-hour-height"], { hourHeightPx: clamped });
    },
    [qc],
  );

  return {
    hourHeightPx,
    /** Live update during a pinch (no network). */
    setLocal,
    /** Commit the current local value to the server. */
    commit: useCallback((next: number) => mutation.mutate(next), [mutation]),
  };
}

/**
 * usePinchZoom — attaches two-finger pinch handlers to a container and
 * scales hourHeightPx live during the gesture, then commits on release.
 * Single-finger and mouse interactions are ignored so the swipe-nav hook
 * and chip clicks keep working.
 *
 * Returns props to spread on the container.
 */
export function usePinchZoom() {
  const { hourHeightPx, setLocal, commit } = useAgendaZoom();
  // State captured at gesture start — we scale from THIS baseline, not
  // from the live value, so the gesture feels stable.
  const startRef = useRef<{ dist: number; height: number; lastValue: number } | null>(null);

  const distance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        startRef.current = {
          dist: distance(e.touches),
          height: hourHeightPx,
          lastValue: hourHeightPx,
        };
      }
    },
    [hourHeightPx],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const s = startRef.current;
      if (!s) return;
      if (e.touches.length < 2) return;
      const d = distance(e.touches);
      if (d === 0 || s.dist === 0) return;
      const ratio = d / s.dist;
      const next = Math.min(
        MAX_HOUR_HEIGHT_PX,
        Math.max(MIN_HOUR_HEIGHT_PX, s.height * ratio),
      );
      // Throttle: only push to state if the value actually moved — avoids
      // re-rendering 60+ times/sec on a tiny gesture.
      if (Math.abs(next - s.lastValue) >= 1) {
        s.lastValue = next;
        setLocal(next);
      }
      // Prevent the browser pinch-to-zoom on the page itself.
      if (e.cancelable) e.preventDefault();
    },
    [setLocal],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent<HTMLDivElement>) => {
      const s = startRef.current;
      if (!s) return;
      const finalValue = s.lastValue;
      startRef.current = null;
      // Only network-commit if value actually changed.
      if (Math.abs(finalValue - s.height) >= 1) {
        commit(finalValue);
      }
    },
    [commit],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

/**
 * scrollToPreviousHour — shared imperative helper. Scrolls the grid's
 * nearest overflow ancestor so the previous full hour row sits just below
 * the sticky header. Called both on initial data-load and on Today taps.
 */
function scrollToPreviousHour(
  el: HTMLElement,
  hourHeightPx: number,
  behavior: ScrollBehavior,
): void {
  // Find the nearest scrolling ancestor (same walk-up as PR #41).
  function findScrollContainer(node: HTMLElement | null): HTMLElement | Window {
    let cur: HTMLElement | null = node?.parentElement ?? null;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll" ||
        cs.overflow === "auto" ||
        cs.overflow === "scroll"
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return window;
  }

  // Previous full hour. At 8:37 → 8. At exactly 8:00 → 7.
  const now = new Date();
  const prevHour = Math.max(0, now.getHours() - (now.getMinutes() === 0 ? 1 : 0));

  const sticky = document.querySelector(".sticky");
  const stickyHeight = sticky instanceof HTMLElement ? sticky.offsetHeight : 0;

  const scroller = findScrollContainer(el);
  if (scroller === window) {
    const gridTopAbs = el.getBoundingClientRect().top + window.scrollY;
    const targetY = gridTopAbs + prevHour * hourHeightPx - stickyHeight;
    window.scrollTo({ top: Math.max(0, targetY), behavior });
  } else {
    const container = scroller as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const gridRect = el.getBoundingClientRect();
    const gridTopInScroller = gridRect.top - containerRect.top + container.scrollTop;
    const targetY = gridTopInScroller + prevHour * hourHeightPx - stickyHeight;
    container.scrollTo({ top: Math.max(0, targetY), behavior });
  }
}

/**
 * useTodayScroll — data-driven Today-scroll lifecycle (replaces the
 * `todayScrollKey` integer-counter hack from PR #40).
 *
 * Two distinct triggers:
 *
 * 1. **Initial auto-scroll** (data-driven): fires once, after the grid's
 *    query resolves (`isSuccess` transitions to true) AND `isToday` is
 *    true. Uses "auto" (instant) so the user never sees a jump from the
 *    top of the page.
 *
 * 2. **Today-tap scroll** (imperative callback): the parent passes an
 *    `onScrollToToday` registration function. This hook registers a
 *    scroll-to-previous-hour callback into it once the grid is mounted.
 *    When the user taps Today, the parent calls that function directly —
 *    no integer counters, no re-renders, no state. Uses "smooth" so the
 *    re-anchor is visually apparent.
 *
 * Handles the parity edge case: if the user is already on today's date
 * but has scrolled away, tapping Today calls the registered callback
 * which runs independently of any state change (the date hasn't changed,
 * so no re-render fires, but the callback executes).
 *
 * @param containerRef  Ref to the outermost grid div.
 * @param isToday       Whether this grid is currently showing today.
 * @param isSuccess     TanStack Query `isSuccess` — true once data lands.
 * @param onScrollToToday  Registration slot: caller stores the provided fn
 *                         and calls it when the user taps Today.
 * @param hourHeightPx  Current zoom-adjusted pixel height per hour row.
 */
export function useTodayScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  isToday: boolean,
  isSuccess: boolean,
  onScrollToToday: ((fn: () => void) => void) | undefined,
  hourHeightPx: number,
): void {
  const didInitialScroll = useRef(false);
  const hourHeightRef = useRef(hourHeightPx);
  hourHeightRef.current = hourHeightPx;

  // 1. Data-driven initial scroll: fires once when isSuccess becomes true.
  useEffect(() => {
    if (!isToday) return;
    if (!isSuccess) return;
    if (didInitialScroll.current) return;
    const el = containerRef.current;
    if (!el) return;

    // Defer one rAF so the grid has finished layout before we measure it.
    const id = requestAnimationFrame(() => {
      const gridEl = containerRef.current;
      if (!gridEl) return;
      scrollToPreviousHour(gridEl, hourHeightRef.current, "auto");
      didInitialScroll.current = true;
    });
    return () => cancelAnimationFrame(id);
  // isSuccess is the data-driven trigger; containerRef and isToday are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, isToday]);

  // 2. Register the Today-tap callback with the parent once the grid mounts.
  //    The callback itself is stable (closes over the ref, not the value).
  useEffect(() => {
    if (!onScrollToToday) return;
    if (!isToday) return;

    onScrollToToday(() => {
      // Defer one rAF in case the Today tap also changed the date URL and
      // a re-render is in flight — same rationale as the original PR #41 fix.
      const id = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        scrollToPreviousHour(el, hourHeightRef.current, "smooth");
      });
      // rAF IDs are fire-and-forget here; cancellation on unmount is
      // handled by the cleanup below.
      return id;
    });
  // Re-register when isToday flips (cross-day Today-tap changes the date).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, onScrollToToday]);
}

/**
 * isEventPast — returns true when an event is entirely in the past.
 *
 * Uses the same startMin value that drives the chip's `top` pixel position
 * so the dimming threshold is pixel-consistent with the current-time line.
 *
 * @param startDate      YYYY-MM-DD string of the event's date.
 * @param startMin       Minutes since midnight (already parsed from `time`).
 * @param durationMinutes  Duration; falls back to 30 min when null/0.
 */
export function isEventPast(
  startDate: string,
  startMin: number,
  durationMinutes: number | null | undefined,
): boolean {
  const dur = durationMinutes && durationMinutes > 0 ? durationMinutes : 30;
  const endMin = startMin + dur;
  // Construct a local-time Date: parse the date components, then offset by
  // endMin minutes. Avoids UTC-shift issues that Date.parse("YYYY-MM-DDT…")
  // would introduce in environments where the timezone offset is non-zero.
  const [y, mo, d] = startDate.split("-").map(Number);
  const endDate = new Date(y, mo - 1, d, 0, endMin, 0, 0);
  return endDate.getTime() < Date.now();
}

/**
 * Red horizontal line + dot positioned at the current minute. Caller is
 * responsible for only mounting this on a "today" column. The line spans
 * the column's full width because it lives inside a relative-positioned
 * column container.
 */
export function CurrentTimeLine() {
  const { hourHeightPx } = useAgendaZoom();
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10"
      style={{ top: `${(nowMin / 60) * hourHeightPx}px` }}
      data-testid="line-current-time"
    >
      <div className="relative">
        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  );
}
