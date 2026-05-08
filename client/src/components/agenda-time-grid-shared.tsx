// Phase 3b — primitives shared across time-grid views (Day, 3 Days, Week).
// Centralizing these here keeps the views in pixel-perfect agreement on
// hour height and current-time line styling.

import { useEffect, useState } from "react";

export const HOUR_HEIGHT_PX = 56; // 56px / hour — same density Day uses.

/**
 * Red horizontal line + dot positioned at the current minute. Caller is
 * responsible for only mounting this on a "today" column. The line spans
 * the column's full width because it lives inside a relative-positioned
 * column container.
 */
export function CurrentTimeLine() {
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
      style={{ top: `${(nowMin / 60) * HOUR_HEIGHT_PX}px` }}
      data-testid="line-current-time"
    >
      <div className="relative">
        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  );
}
