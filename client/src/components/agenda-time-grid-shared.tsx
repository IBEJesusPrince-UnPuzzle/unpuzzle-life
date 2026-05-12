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
 * useTodayScrollToPreviousHour — PR #40 (PR #41 fix).
 *
 * Watches a `todayScrollKey` counter; on every increment, if `isToday`
 * is true, scrolls the page so the previous full hour row in the time
 * grid sits near the top of the visible area (just below the sticky
 * header). Used by Day / 3-Day / Week views; Schedule has its own list
 * implementation.
 *
 * PR #41 fix — the page's actual scroll container is the app shell's
 * `<main className="overflow-auto">` (see App.tsx), NOT `window`. The
 * original PR #40 implementation called `window.scrollTo`, which is a
 * no-op against the real scroll container so Today only changed the
 * day and never moved the time view. We now walk up from the container
 * ref to find the nearest overflow:auto/scroll ancestor and scroll
 * that element. Pattern matches `collapsible-sticky-header.tsx`.
 *
 * Also fixes the cross-day Today-tap race: when the user taps Today
 * while looking at a different day, both `isToday` (via URL change)
 * AND `todayScrollKey` flip in the same render. The scroll must wait
 * for layout to settle so the grid's bounding rect is correct — we
 * defer to requestAnimationFrame.
 */
export function useTodayScrollToPreviousHour(
  containerRef: RefObject<HTMLDivElement | null>,
  isToday: boolean,
  todayScrollKey: number,
  hourHeightPx: number,
) {
  useEffect(() => {
    if (!isToday) return;
    if (todayScrollKey === 0) return; // initial render, not a Today tap
    const el = containerRef.current;
    if (!el) return;

    // Find the nearest scrolling ancestor. Falls back to window when
    // no element ancestor has overflow:auto/scroll.
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

    // Defer until layout settles — when the user taps Today on a
    // different day, the URL change kicks a re-render and the grid's
    // bounding rect on the previous frame is wrong. rAF gives the
    // browser one paint to lay out the new day.
    const id = requestAnimationFrame(() => {
      // Previous full hour. At 8:37 -> 8. At exactly 8:00 -> 7 (so the
      // 7–8 row sits at the top, matching Google's behavior of giving
      // the user a hint of what's just before now).
      const now = new Date();
      const prevHour = Math.max(
        0,
        now.getHours() - (now.getMinutes() === 0 ? 1 : 0),
      );
      const scroller = findScrollContainer(el);

      // Sticky header offset — read from the topmost `position: sticky`
      // element currently in the page. If none, default to 0.
      const sticky = document.querySelector(".sticky");
      const stickyHeight =
        sticky instanceof HTMLElement ? sticky.offsetHeight : 0;

      if (scroller === window) {
        const gridTopAbs = el.getBoundingClientRect().top + window.scrollY;
        const targetY = gridTopAbs + prevHour * hourHeightPx - stickyHeight;
        window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      } else {
        const container = scroller as HTMLElement;
        // Grid top relative to the scroller's content (= current scrollTop
        // + delta between their viewport tops).
        const containerRect = container.getBoundingClientRect();
        const gridRect = el.getBoundingClientRect();
        const gridTopInScroller =
          gridRect.top - containerRect.top + container.scrollTop;
        const targetY = gridTopInScroller + prevHour * hourHeightPx - stickyHeight;
        container.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [todayScrollKey, isToday, hourHeightPx, containerRef]);
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
