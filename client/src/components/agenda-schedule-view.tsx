// =============================================================================
// AgendaScheduleView — PR #40
// =============================================================================
// Google-Calendar-style Schedule view. Mobile-first, vertical scrollable list.
//
// Locked spec: /home/user/workspace/schedule-view-spec.md
// Cross-cutting parity decisions live in Google-schedule-parity.docx (the
// 27-row audit), surfaced into the spec.
//
// Structure (Google parity, with named UnPuzzle divergences):
//   - Events grouped by day. Empty days skipped entirely (no row at all).
//   - Within a day, all-day events first, then timed events ordered by start.
//   - Left date gutter shows day-of-week abbr stacked above day number; only
//     rendered once per day (aligned with the day's first event). Today's
//     number sits inside a filled colored circle.
//   - Between weeks, a small gray text label like "May 17 – 23" sits as a
//     divider before that week's first day group.
//   - "Now" indicator: thin line + dot between today's last past and first
//     future event. If all past, line below last. If all future, line above
//     first. No events today → no line.
//   - Top bar month label tracks scroll (this view publishes the visible
//     anchor day to the parent via onVisibleDateChange).
//   - Infinite scroll forward + backward in 14-day chunks via /api/agenda.
//   - On first load, anchor on today: today's first event sits near the top;
//     if no events today, today's day-header sits near the top.
//
// Event row (chip) — UnPuzzle 4-row layout, divergent from Google's 2-3:
//   1. Title (bold, truncate)
//   2. "as <first role> +N more" (omit when no roles)
//   3. "<start time> – <end time> · <duration>" (omit when all-day)
//   4. "in <first place> +N more" (omit when no place; preposition "in")
//
//   Multi-day events render one chip per spanned day, with "(Day N/M)"
//   appended to the title. On the final day the time row becomes
//   "Until <end time>". On non-final days the time row shows the daily
//   range (or "All day" when the event is all-day).
//
//   Project task variant: row 2 becomes two stacked sublines —
//   "to <project>" then "for <first responsibility> +N more" — to match
//   the locked agenda-grid-chip-layout-spec.
//
// Visual style: solid-fill background on Schedule chips (deliberate
// divergence from grid views which keep soft tint). Title text on solid
// fill uses white or black based on background luminance.
//
// Tap → onSelect(item). Edit, scope, and outcome flows stay inside the
// existing view popup; Schedule introduces no new tap interactions.
// =============================================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  toIsoDate,
  fromIsoDate,
  addDays,
  formatTimeLabel,
  formatDurationLabel,
  formatRangeLabel,
  weekRange,
  timeToMinutes,
} from "@/lib/agenda-utils";
import { findColor, pickContrastingText } from "@/lib/agenda-colors";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";
import { ExternalEventDetailSheet } from "@/components/external-event-detail-sheet";

// 14-day window per fetch in either direction. The spec lists this as the
// default fetch chunk; could be tuned later.
const WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Scroll container resolution.
//
// The app's scrollable surface is `<main className="overflow-auto">` (see
// App.tsx), NOT `window`. PR #41 fix — the original PR #40 code scrolled
// `window`, which silently no-ops on the real layout, so the Today button
// only changed the day and never moved the time view.
//
// Both helpers mirror the pattern in collapsible-sticky-header.tsx: walk up
// from a child node until we find an element whose computed overflow makes
// it a scroll container; fall back to `window` if none found.
// ---------------------------------------------------------------------------
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

/** Get current scrollTop of the resolved container. */
function containerScrollTop(scroller: HTMLElement | Window): number {
  return scroller === window
    ? window.scrollY
    : (scroller as HTMLElement).scrollTop;
}

/** Get total scroll height of the resolved container. */
function containerScrollHeight(scroller: HTMLElement | Window): number {
  return scroller === window
    ? document.documentElement.scrollHeight
    : (scroller as HTMLElement).scrollHeight;
}

/** Scroll target element so its top lands `offset` px below the scroller's
 *  viewport top. Works for both the element and window cases. */
function scrollElementToTop(
  scroller: HTMLElement | Window,
  target: HTMLElement,
  offset: number,
  behavior: ScrollBehavior,
): void {
  if (scroller === window) {
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - offset), behavior });
  } else {
    const container = scroller as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, top - offset), behavior });
  }
}

/** Add `dy` px to the resolved container's current scroll position. */
function scrollContainerBy(scroller: HTMLElement | Window, dy: number): void {
  if (scroller === window) {
    window.scrollBy(0, dy);
  } else {
    (scroller as HTMLElement).scrollTop += dy;
  }
}

type Props = {
  /** Anchor date — used on first mount to position scroll on today
   *  (the agenda page always passes today's ISO when this view is active
   *  but we honor whatever the URL state hands us). */
  date: string;
  onSelect: (item: AgendaWindowItem) => void;
  /** Registration slot: parent stores the provided fn and calls it on Today tap. */
  onScrollToToday?: (fn: () => void) => void;
  /** Publishes the iso date of the day-group currently pinned at the top
   *  of the viewport so the page header can display the right month label. */
  onVisibleDateChange?: (iso: string | null) => void;
};

// ---------------------------------------------------------------------------
// Per-day-chip type. The window endpoint returns one row per master; this
// view expands multi-day events into one chip per spanned day so the
// rendering pipeline becomes a flat "list of (day, chip)" tuples.
// ---------------------------------------------------------------------------
interface DayChip {
  /** Stable react key. */
  key: string;
  /** YYYY-MM-DD — the day this chip is anchored to. */
  day: string;
  /** Sort key within the day. All-day events use -1 (sort first); timed
   *  events use minutes-since-midnight. */
  sortKey: number;
  /** Underlying item. */
  item: AgendaWindowItem;
  /** Multi-day metadata — when spans > 1 day. */
  dayIndex?: number; // 1-based
  dayTotal?: number; // total number of days the event spans
  /** True when this chip represents the final day of a multi-day event. */
  isFinalDay?: boolean;
}

// ---------------------------------------------------------------------------
// Expand the items returned by /api/agenda into per-day chips. Multi-day
// events become N chips; single-day events become 1. Ordering within a
// day is computed downstream by sortKey.
// ---------------------------------------------------------------------------
function expandToDayChips(items: AgendaWindowItem[]): DayChip[] {
  const chips: DayChip[] = [];
  for (const it of items) {
    const start = it.startDate;
    const end =
      it.isAllDay === 1 && it.endDate && it.endDate > start ? it.endDate : start;

    if (start === end) {
      // Single-day event (timed or all-day, doesn't matter).
      chips.push({
        key: `${it.id}-${start}`,
        day: start,
        sortKey: it.isAllDay === 1 ? -1 : timeToMinutes(it.time) ?? 0,
        item: it,
      });
      continue;
    }

    // Multi-day span. All-day-only path (timed multi-day isn't a thing
    // in the current schema — multi-day implies isAllDay=1).
    const startDate = fromIsoDate(start);
    const endDate = fromIsoDate(end);
    const spanDays =
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

    for (let i = 0; i < spanDays; i++) {
      const day = addDays(start, i);
      chips.push({
        key: `${it.id}-${day}`,
        day,
        sortKey: it.isAllDay === 1 ? -1 : timeToMinutes(it.time) ?? 0,
        item: it,
        dayIndex: i + 1,
        dayTotal: spanDays,
        isFinalDay: i === spanDays - 1,
      });
    }
  }
  return chips;
}

// ---------------------------------------------------------------------------
// Group chips by day, drop empty days. Within each day sort by sortKey.
// ---------------------------------------------------------------------------
interface DayGroup {
  day: string; // YYYY-MM-DD
  chips: DayChip[];
}

function groupByDay(chips: DayChip[]): DayGroup[] {
  const map = new Map<string, DayChip[]>();
  for (const c of chips) {
    if (!map.has(c.day)) map.set(c.day, []);
    map.get(c.day)!.push(c);
  }
  const groups: DayGroup[] = [];
  map.forEach((list: DayChip[], day: string) => {
    list.sort((a, b) => a.sortKey - b.sortKey);
    groups.push({ day, chips: list });
  });
  groups.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return groups;
}

// ---------------------------------------------------------------------------
// Date gutter formatting. Day abbreviation + day number, stacked.
// ---------------------------------------------------------------------------
function dayAbbrev(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}
function dayNumber(iso: string): string {
  const d = fromIsoDate(iso);
  return String(d.getDate());
}

// ---------------------------------------------------------------------------
// Week boundary helper — returns the Sunday of the week containing iso.
// Used to detect "is this the first day of a new week → render the
// week-range label divider".
// ---------------------------------------------------------------------------
function weekStartOf(iso: string): string {
  return weekRange(iso).from;
}

// ---------------------------------------------------------------------------
// Chip subline list — matches grid chip spec for project tasks, simpler
// for responsibility / standalone. Returns array; caller renders each
// entry on its own row.
// ---------------------------------------------------------------------------
function getChipSublines(item: AgendaWindowItem): string[] {
  const roleNames = item.roleNames ?? [];
  const responsibilityNames = item.responsibilityNames ?? [];
  const projectName = item.projectName ?? null;

  switch (item.origin) {
    case "responsibility":
    case "standalone": {
      if (roleNames.length === 0) return [];
      const head = roleNames[0];
      const extra = roleNames.length - 1;
      return [extra > 0 ? `as ${head} +${extra} more` : `as ${head}`];
    }
    case "project": {
      const lines: string[] = [];
      if (projectName) lines.push(`to ${projectName}`);
      if (responsibilityNames.length > 0) {
        const head = responsibilityNames[0];
        const extra = responsibilityNames.length - 1;
        lines.push(extra > 0 ? `for ${head} +${extra} more` : `for ${head}`);
      }
      return lines;
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Place row text. Returns null when no place to display.
// ---------------------------------------------------------------------------
function getPlaceLine(item: AgendaWindowItem): string | null {
  const placeName = item.placeName ?? null;
  const placeCount = item.placeCount ?? (placeName ? 1 : 0);
  if (!placeName) return null;
  const extra = placeCount - 1;
  return extra > 0 ? `in ${placeName} +${extra} more` : `in ${placeName}`;
}

// ---------------------------------------------------------------------------
// Time row text. Encodes the multi-day variant rules.
// ---------------------------------------------------------------------------
function getTimeLine(chip: DayChip): string | null {
  const { item, dayIndex, dayTotal, isFinalDay } = chip;

  // Multi-day event.
  if (dayIndex && dayTotal && dayTotal > 1) {
    if (item.isAllDay === 1) {
      // Multi-day all-day events have no time row, only "All day"
      // visual. The spec says non-final days show "All day" / final
      // day shows "Until <end time>"; for all-day we treat the entire
      // span as all-day → no explicit time row.
      return null;
    }
    // Multi-day timed events — not currently produced by the schema,
    // but we render gracefully if they ever appear.
    const startMin = timeToMinutes(item.time) ?? 0;
    const dur = item.durationMinutes ?? 0;
    if (isFinalDay && dur > 0) {
      // "Until <end time>" — final day's end time.
      const endMin = startMin + dur;
      return `Until ${formatTimeLabel(endMin)}`;
    }
    const endMin = dur > 0 ? startMin + dur : startMin;
    return `${formatTimeLabel(startMin)} – ${formatTimeLabel(endMin)} · ${formatDurationLabel(dur)}`;
  }

  // Single-day event.
  if (item.isAllDay === 1) return null;
  const startMin = timeToMinutes(item.time) ?? 0;
  const dur = item.durationMinutes ?? 0;
  if (dur > 0) {
    const endMin = startMin + dur;
    return `${formatTimeLabel(startMin)} – ${formatTimeLabel(endMin)} · ${formatDurationLabel(dur)}`;
  }
  return formatTimeLabel(startMin);
}

// ---------------------------------------------------------------------------
// Title text, with "(Day N/M)" suffix for multi-day chips.
// ---------------------------------------------------------------------------
function getTitleText(chip: DayChip): string {
  const base = chip.item.title || "(untitled)";
  if (chip.dayIndex && chip.dayTotal && chip.dayTotal > 1) {
    return `${base} (Day ${chip.dayIndex}/${chip.dayTotal})`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Where to slot the "now" indicator inside today's chip list.
// Returns an integer index in [0..chips.length] meaning "insert before
// the chip at this index". Returns null when:
//   - the group isn't today, or
//   - today has no events.
// ---------------------------------------------------------------------------
function nowLineIndex(group: DayGroup, todayIso: string, nowMin: number): number | null {
  if (group.day !== todayIso) return null;
  if (group.chips.length === 0) return null;
  for (let i = 0; i < group.chips.length; i++) {
    const c = group.chips[i];
    if (c.item.isAllDay === 1) continue; // all-day chips never "contain" the now line
    const start = timeToMinutes(c.item.time) ?? 0;
    if (start >= nowMin) return i;
  }
  return group.chips.length; // all past → place below the last chip
}

// ===========================================================================
// Component
// ===========================================================================
export function AgendaScheduleView({
  date,
  onSelect,
  onScrollToToday,
  onVisibleDateChange,
}: Props) {
  const queryClient = useQueryClient();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  // Window state: we keep a sliding [from, to] inclusive range over which
  // we've fetched. Initial range centers on the anchor date with WINDOW_DAYS
  // padding on each side.
  const [range, setRange] = useState<{ from: string; to: string }>(() => ({
    from: addDays(date, -WINDOW_DAYS),
    to: addDays(date, WINDOW_DAYS),
  }));

  // Fetch items for the current window. Whenever the range expands we
  // re-query the whole window (TanStack's cache keys this off the dates).
  const { data: items = [], isFetching } = useQuery<AgendaWindowItem[]>({
    queryKey: ["/api/agenda", "v2", { from: range.from, to: range.to }],
    queryFn: async () => {
      const r = await fetch(`/api/agenda?from=${range.from}&to=${range.to}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Expand + group.
  const groups = useMemo(() => groupByDay(expandToDayChips(items)), [items]);

  // Track current time for the "now" indicator — re-derive every minute.
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // External event detail sheet state (read-only external calendar events).
  const [extViewing, setExtViewing] = useState<AgendaWindowItem | null>(null);
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // -------------------------------------------------------------------------
  // Scroll anchoring on first mount + Today-key bumps.
  //
  // The page's <main> handles scroll (we don't own a scrollable container).
  // We compute the target Y by finding the DOM node we want pinned near the
  // top of the viewport, then call window.scrollTo. Subtract the sticky
  // header height so the target lands below the header, not under it.
  // -------------------------------------------------------------------------
  const dayHeaderRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const didInitialScroll = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Helper: find the first timed chip for `dayIso`, or null when day-group
  // has only all-day events / no chips.
  const findFirstTimedChipKey = useCallback(
    (dayIso: string): string | null => {
      const group = groups.find((g) => g.day === dayIso);
      if (!group) return null;
      const c = group.chips.find((ch) => ch.item.isAllDay !== 1);
      return c ? c.key : null;
    },
    [groups],
  );

  // Helper: returns the offset of a sticky header (the page mounts a
  // sticky-top:0 element above us). Mirrors useTodayScrollToPreviousHour.
  const getStickyOffset = (): number => {
    const sticky = document.querySelector<HTMLElement>(".sticky");
    return sticky?.offsetHeight ?? 0;
  };

  // Run once on first non-empty group set: position today's first event
  // (or today's day-header) near the top of the viewport. rAF defers
  // until after the chips have laid out so getBoundingClientRect reports
  // the correct position.
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (groups.length === 0) return;

    const id = requestAnimationFrame(() => {
      const targetKey = findFirstTimedChipKey(todayIso);
      let targetEl: HTMLElement | null = null;
      if (targetKey) {
        targetEl = chipRefs.current.get(targetKey) ?? null;
      }
      if (!targetEl) {
        targetEl = dayHeaderRefs.current.get(todayIso) ?? null;
      }
      if (!targetEl) {
        // Today has no group (no events anywhere near today) — fall back
        // to whichever group sits closest after today, or the first group.
        const after = groups.find((g) => g.day >= todayIso);
        const fallbackDay = (after ?? groups[0]).day;
        targetEl = dayHeaderRefs.current.get(fallbackDay) ?? null;
      }
      if (!targetEl) return;

      const scroller = findScrollContainer(containerRef.current);
      const offset = getStickyOffset() + 8;
      scrollElementToTop(scroller, targetEl, offset, "auto");
      didInitialScroll.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [groups, todayIso, findFirstTimedChipKey]);

  // Register the Today-tap callback with the parent.
  // When onScrollToToday is provided and today's group is in the loaded range,
  // we register a function that scrolls today's first relevant chip into view.
  // No state, no re-renders — purely imperative, fires only when the user taps Today.
  useEffect(() => {
    if (!onScrollToToday) return;

    onScrollToToday(() => {
      if (groups.length === 0) return;
      const id = requestAnimationFrame(() => {
        const group = groups.find((g) => g.day === todayIso);
        let targetEl: HTMLElement | null = null;

        if (group) {
          const nowDate = new Date();
          const nowH = nowDate.getHours();
          const nowM = nowDate.getMinutes();
          const refH = nowM === 0 ? Math.max(0, nowH - 1) : nowH;
          const refMin = refH * 60;
          const found = group.chips.find((c) => {
            if (c.item.isAllDay === 1) return false;
            const s = timeToMinutes(c.item.time) ?? 0;
            return s >= refMin;
          });
          const lastTimed = [...group.chips]
            .reverse()
            .find((c) => c.item.isAllDay !== 1);
          const chipKey = (found ?? lastTimed)?.key ?? null;
          if (chipKey) targetEl = chipRefs.current.get(chipKey) ?? null;
          if (!targetEl) targetEl = dayHeaderRefs.current.get(todayIso) ?? null;
        } else {
          const after = groups.find((g) => g.day >= todayIso);
          const fallbackDay = (after ?? groups[0]).day;
          targetEl = dayHeaderRefs.current.get(fallbackDay) ?? null;
        }
        if (!targetEl) return;
        const scroller = findScrollContainer(containerRef.current);
        const offset = getStickyOffset() + 8;
        scrollElementToTop(scroller, targetEl, offset, "smooth");
      });
    });
  // Re-register when groups or onScrollToToday changes (groups captures todayIso via closure).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, onScrollToToday]);

  // -------------------------------------------------------------------------
  // Visible-day tracking — publishes the day whose header is currently the
  // top-most pinned in the viewport so the page header can show the right
  // month label.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!onVisibleDateChange) return;
    if (groups.length === 0) return;

    const onScroll = () => {
      const offset = getStickyOffset() + 12;
      let bestDay: string | null = null;
      let bestTop = -Infinity;
      // Walk groups; pick the one whose header is closest to (but not
      // past) the sticky bottom edge. Headers above the threshold but
      // closest to it win.
      for (const g of groups) {
        const el = dayHeaderRefs.current.get(g.day);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= offset && top > bestTop) {
          bestTop = top;
          bestDay = g.day;
        }
      }
      // Fall back to the first group when we're above everything.
      if (!bestDay) bestDay = groups[0].day;
      onVisibleDateChange(bestDay);
    };

    // The real scroll source is the app's <main>, not window. Resolve
    // once and listen on whichever element/window the walk-up returns.
    const scroller = findScrollContainer(containerRef.current);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [groups, onVisibleDateChange]);

  // -------------------------------------------------------------------------
  // Infinite scroll — expand the range when the user scrolls near the top
  // or bottom of the loaded list. We use IntersectionObserver on a pair
  // of sentinel divs (top + bottom of the rendered list).
  // -------------------------------------------------------------------------
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const expandingRef = useRef(false);
  const previousRangeRef = useRef<{ from: string; to: string } | null>(null);
  const scrollHeightBeforeRef = useRef<number | null>(null);
  const expansionDirectionRef = useRef<'forward' | 'backward' | null>(null);

  useEffect(() => {
    const topEl = topSentinelRef.current;
    const bottomEl = bottomSentinelRef.current;
    if (!topEl || !bottomEl) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (expandingRef.current) continue;

          if (e.target === topEl) {
            // Backward expansion: capture state before range change
            expandingRef.current = true;
            previousRangeRef.current = range;
            expansionDirectionRef.current = 'backward';
            const scroller = findScrollContainer(containerRef.current);
            scrollHeightBeforeRef.current = containerScrollHeight(scroller);
            setRange((r) => ({ from: addDays(r.from, -WINDOW_DAYS), to: r.to }));
          } else if (e.target === bottomEl) {
            // Forward expansion: capture state before range change
            expandingRef.current = true;
            previousRangeRef.current = range;
            expansionDirectionRef.current = 'forward';
            setRange((r) => ({ from: r.from, to: addDays(r.to, WINDOW_DAYS) }));
          }
        }
      },
      { rootMargin: "200px 0px 200px 0px" },
    );

    obs.observe(topEl);
    obs.observe(bottomEl);
    return () => obs.disconnect();
  }, [range]);

  // Synchronous scroll adjustment for backward expansion.
  // This runs before the browser paints, ensuring zero visual jump when
  // content is prepended to the top of the list.
  useLayoutEffect(() => {
    if (expansionDirectionRef.current !== 'backward') return;
    if (!scrollHeightBeforeRef.current) return;
    if (!previousRangeRef.current) return;

    const rangeChanged =
      previousRangeRef.current.from !== range.from ||
      previousRangeRef.current.to !== range.to;

    if (rangeChanged && items.length > 0) {
      const scroller = findScrollContainer(containerRef.current);
      const after = containerScrollHeight(scroller);
      const delta = after - scrollHeightBeforeRef.current;

      if (delta > 0) {
        // Adjust scrollTop by the exact delta to keep user's view stable
        scrollContainerBy(scroller, delta);
      }

      // Clear expansion state
      scrollHeightBeforeRef.current = null;
      expansionDirectionRef.current = null;
    }
  }, [items, range, items.length]);

  // Release expansion lock when data loading completes.
  // Tied directly to TanStack Query's isFetching lifecycle.
  // Prevents deadlock by releasing on fetch completion even if data is empty or errored.
  useEffect(() => {
    if (!expandingRef.current) return;
    if (!previousRangeRef.current) return;

    const rangeChanged =
      previousRangeRef.current.from !== range.from ||
      previousRangeRef.current.to !== range.to;

    // Release lock when query finishes fetching (handles success, error, or empty data)
    if (rangeChanged && !isFetching) {
      expandingRef.current = false;
      previousRangeRef.current = null;

      // For forward expansion, clear direction immediately (no scroll adjustment needed)
      if (expansionDirectionRef.current === 'forward') {
        expansionDirectionRef.current = null;
      }
    }
  }, [isFetching, range]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="px-4 pb-32"
      data-testid="agenda-schedule"
    >
      {/* Top sentinel for infinite-scroll backward. */}
      <div ref={topSentinelRef} aria-hidden className="h-1" />

      {groups.length === 0 ? (
        <div
          className="py-16 text-center text-sm text-muted-foreground"
          data-testid="schedule-empty"
        >
          No events in the next two weeks.
        </div>
      ) : (
        groups.map((group, gi) => {
          const prev = gi > 0 ? groups[gi - 1] : null;
          // Insert a week-range label divider when this group starts a
          // new week relative to the previous group.
          const showWeekLabel =
            !prev || weekStartOf(prev.day) !== weekStartOf(group.day);
          const wr = weekRange(group.day);
          const weekLabel = formatRangeLabel(wr.from, wr.to);

          const isToday = group.day === todayIso;
          const nowIdx = nowLineIndex(group, todayIso, nowMin);

          return (
            <div key={group.day} data-testid={`schedule-group-${group.day}`}>
              {showWeekLabel && (
                <div
                  className="pt-6 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground"
                  data-testid={`schedule-week-${wr.from}`}
                >
                  {weekLabel}
                </div>
              )}

              <div
                className="flex gap-3 py-2"
                ref={(el) => {
                  if (el) dayHeaderRefs.current.set(group.day, el);
                  else dayHeaderRefs.current.delete(group.day);
                }}
                data-testid={`schedule-day-${group.day}`}
              >
                {/* Left date gutter — labeled once per day, aligned with
                    the day's first chip. */}
                <div className="w-12 shrink-0 pt-1 text-center">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {dayAbbrev(group.day)}
                  </div>
                  <div
                    className={
                      "mt-0.5 text-base font-semibold " +
                      (isToday
                        ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : "text-foreground")
                    }
                    data-testid={
                      isToday
                        ? "schedule-today-circle"
                        : `schedule-daynum-${group.day}`
                    }
                  >
                    {dayNumber(group.day)}
                  </div>
                </div>

                {/* Right column — stacked event chips for the day. */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {group.chips.map((chip, ci) => {
                    const renderNowLine = nowIdx !== null && nowIdx === ci;
                    return (
                      <ScheduleChipFragment
                        key={chip.key}
                        chip={chip}
                        onSelect={onSelect}
                        onSelectExternal={setExtViewing}
                        chipRefs={chipRefs}
                        showNowLineBefore={renderNowLine}
                      />
                    );
                  })}
                  {/* Now-line after the last chip when all of today's
                      events are past. */}
                  {nowIdx !== null && nowIdx === group.chips.length && (
                    <NowLine />
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Bottom sentinel for infinite-scroll forward. */}
      <div ref={bottomSentinelRef} aria-hidden className="h-1" />

      {/* External event detail sheet (read-only). */}
      <ExternalEventDetailSheet item={extViewing} onClose={() => setExtViewing(null)} />
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function NowLine() {
  return (
    <div
      className="flex items-center gap-2 my-1"
      aria-hidden
      data-testid="schedule-now-line"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
      <div className="flex-1 h-px bg-red-500" />
    </div>
  );
}

interface ChipFragmentProps {
  chip: DayChip;
  onSelect: (item: AgendaWindowItem) => void;
  onSelectExternal: (item: AgendaWindowItem) => void;
  chipRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  showNowLineBefore: boolean;
}

function ScheduleChipFragment({
  chip,
  onSelect,
  onSelectExternal,
  chipRefs,
  showNowLineBefore,
}: ChipFragmentProps) {
  const { item } = chip;
  const c = findColor(item.color);
  const bg = c.hex;
  const fg = pickContrastingText(bg);
  const sublines = getChipSublines(item);
  const timeLine = getTimeLine(chip);
  const placeLine = getPlaceLine(item);
  const isExt = !!(item as any).isExternal;

  return (
    <>
      {showNowLineBefore && <NowLine />}
      <button
        type="button"
        onClick={() => isExt ? onSelectExternal(item) : onSelect(item)}
        ref={(el) => {
          if (el) chipRefs.current.set(chip.key, el);
          else chipRefs.current.delete(chip.key);
        }}
        className="block w-full text-left rounded-md px-2.5 py-1.5 hover:opacity-95 transition-opacity"
        style={{
          backgroundColor: bg,
          color: fg,
          opacity: isExt ? 0.82 : 1,
          backgroundImage: isExt ? "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.15) 4px,rgba(255,255,255,0.15) 6px)" : undefined,
        }}
        data-testid={`schedule-chip-${item.id}-${chip.day}`}
      >
        <div className="text-sm font-semibold truncate" data-testid="chip-title">
          {getTitleText(chip)}
        </div>
        {sublines.map((line, i) => (
          <div
            key={i}
            className="text-[11px] opacity-90 truncate"
            data-testid={`chip-subline-${i}`}
          >
            {line}
          </div>
        ))}
        {timeLine ? (
          <div
            className="text-[11px] opacity-90 truncate tabular-nums"
            data-testid="chip-time"
          >
            {timeLine}
          </div>
        ) : null}
        {placeLine ? (
          <div
            className="text-[11px] opacity-90 truncate"
            data-testid="chip-place"
          >
            {placeLine}
          </div>
        ) : null}
      </button>
    </>
  );
}
