// Lane-packing for Day view side-by-side overlap rendering, per §20a
// ("side-by-side overlaps like Google Calendar"). For a set of timed
// items on a single day, this returns each item annotated with its
// horizontal lane index and the total number of lanes its overlap
// cluster occupies. The renderer maps that to width = 1/lanes and
// left = lane / lanes.
//
// Algorithm (matches the standard Google Calendar approach):
//   1. Sort items by startMin asc, then endMin desc (so longer events
//      lock in lower lanes when they tie).
//   2. Walk the sorted list; maintain an array of lanes (each = endMin
//      of the last event placed in that lane). Place each event in the
//      lowest-indexed lane whose tail is <= the event's startMin (no
//      overlap), or open a new lane.
//   3. Group events into "overlap clusters" (transitive: any two events
//      that share time, directly or via a chain). Within a cluster,
//      every event renders at width = 1/clusterLaneCount and at left =
//      laneIndex / clusterLaneCount.
//
// PR #36 — Short-chip visual-overlap clustering (§20a clarification):
//   Cluster + lane math use `visualEndMin` (caller-supplied) when present
//   instead of `endMin`. visualEndMin = max(endMin, startMin +
//   minDurationForView) so a 10-min chip rendered at the 22px floor
//   correctly clusters with a 1h chip starting at the 10-min chip's true
//   end time. Renderer height calc is independent and still uses endMin
//   (already clamped to MIN_CHIP_HEIGHT_PX via Math.max in each view).
//   No marker on the inflated portion — Google parity. Chip body text
//   ("3:30 AM · 10m") is the source of truth for the user.
//
// Open question (deferred): Google's "expand" trick (later events fill
// gaps left by earlier ones) is not implemented — width is uniform per
// cluster. This is the cleaner default and matches the spec's "like
// Google Calendar" without overspecifying.

export type Timed = {
  id: number;
  startMin: number; // minutes since 00:00
  endMin: number;   // minutes since 00:00 (exclusive)
  visualEndMin?: number; // PR #36 — optional, defaults to endMin
};

export type Packed<T extends Timed> = T & {
  lane: number;
  laneCount: number;
};

export function packLanes<T extends Timed>(items: T[]): Packed<T>[] {
  if (items.length === 0) return [];

  // visualEnd resolver — PR #36. Default to endMin when caller didn't
  // pass visualEndMin so existing call sites (none today, but future)
  // keep their pre-PR #36 behavior.
  const visEnd = (it: T): number =>
    it.visualEndMin != null && it.visualEndMin > it.endMin
      ? it.visualEndMin
      : it.endMin;

  // 1. Sort by start asc, then by visual-length desc (longer chips lock
  //    into lower lanes when starts tie).
  const sorted = [...items].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      visEnd(b) - b.startMin - (visEnd(a) - a.startMin)
  );

  // 2. Greedy lane assignment. lanes[i] = visualEnd of last event placed
  //    in lane i. Using visualEnd here is what makes a short chip that's
  //    been inflated for readability still block the next chip from
  //    re-using its lane (Google parity).
  const lanes: number[] = [];
  const lane = new Map<number, number>(); // itemId -> lane index

  for (const it of sorted) {
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= it.startMin) {
        lanes[i] = visEnd(it);
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      lanes.push(visEnd(it));
      placed = lanes.length - 1;
    }
    lane.set(it.id, placed);
  }

  // 3. Cluster (transitive overlap) — within a cluster every item shares
  //    the same laneCount = max lane index used in cluster + 1.
  const clusterId = new Map<number, number>();
  const clusterLaneCount = new Map<number, number>();
  let clusterCounter = 0;
  let currentCluster = -1;
  let currentClusterEnd = -1;
  let currentClusterMaxLane = -1;

  for (const it of sorted) {
    // Cluster boundary uses visualEnd — short chips that have been
    // inflated to the min readable height correctly cluster with the
    // chips they visually overlap (PR #36).
    if (currentCluster === -1 || it.startMin >= currentClusterEnd) {
      // Close out previous cluster.
      if (currentCluster !== -1) {
        clusterLaneCount.set(currentCluster, currentClusterMaxLane + 1);
      }
      // Start a new cluster.
      currentCluster = clusterCounter++;
      currentClusterEnd = visEnd(it);
      currentClusterMaxLane = lane.get(it.id) ?? 0;
    } else {
      // Extend the current cluster.
      currentClusterEnd = Math.max(currentClusterEnd, visEnd(it));
      currentClusterMaxLane = Math.max(
        currentClusterMaxLane,
        lane.get(it.id) ?? 0
      );
    }
    clusterId.set(it.id, currentCluster);
  }
  if (currentCluster !== -1) {
    clusterLaneCount.set(currentCluster, currentClusterMaxLane + 1);
  }

  return sorted.map((it) => ({
    ...it,
    lane: lane.get(it.id) ?? 0,
    laneCount: clusterLaneCount.get(clusterId.get(it.id) ?? -1) ?? 1,
  }));
}
