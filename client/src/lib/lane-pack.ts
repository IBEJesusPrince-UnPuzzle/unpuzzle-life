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
// Open question (deferred): Google's "expand" trick (later events fill
// gaps left by earlier ones) is not implemented — width is uniform per
// cluster. This is the cleaner default and matches the spec's "like
// Google Calendar" without overspecifying.

export type Timed = {
  id: number;
  startMin: number; // minutes since 00:00
  endMin: number;   // minutes since 00:00 (exclusive)
};

export type Packed<T extends Timed> = T & {
  lane: number;
  laneCount: number;
};

export function packLanes<T extends Timed>(items: T[]): Packed<T>[] {
  if (items.length === 0) return [];

  // 1. Sort by start asc, then by length desc.
  const sorted = [...items].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - b.startMin - (a.endMin - a.startMin)
  );

  // 2. Greedy lane assignment. lanes[i] = endMin of last event placed in lane i.
  const lanes: number[] = [];
  const lane = new Map<number, number>(); // itemId -> lane index

  for (const it of sorted) {
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= it.startMin) {
        lanes[i] = it.endMin;
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      lanes.push(it.endMin);
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
    if (currentCluster === -1 || it.startMin >= currentClusterEnd) {
      // Close out previous cluster.
      if (currentCluster !== -1) {
        clusterLaneCount.set(currentCluster, currentClusterMaxLane + 1);
      }
      // Start a new cluster.
      currentCluster = clusterCounter++;
      currentClusterEnd = it.endMin;
      currentClusterMaxLane = lane.get(it.id) ?? 0;
    } else {
      // Extend the current cluster.
      currentClusterEnd = Math.max(currentClusterEnd, it.endMin);
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
