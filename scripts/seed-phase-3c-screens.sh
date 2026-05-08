#!/usr/bin/env bash
# =============================================================================
# Seed agenda data for Phase 3c frontend screenshots.
# =============================================================================
# Anchor: Fri May 8, 2026.  Week range Sun May 3 .. Sat May 9.
#
# Seeds a mix of:
#   - Multi-day all-day events that span across columns (some clip on the
#     edges of the visible window)
#   - Single-day all-day events
#   - Timed events with realistic short titles to exercise vertical wrap
#   - One day with > 3 all-day events to exercise per-column "+N more"
# =============================================================================
set -euo pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase3c-seed.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

ADMIN_EMAIL="${ADMIN_EMAIL:-tab@theesweetesttaboo.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-verify-test-password}"

curl -sS -X POST "$BASE/api/auth/login" -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null

post() {
  curl -sS -X POST "$BASE/api/agenda-tasks" -b "$COOKIE_JAR" \
    -H "Content-Type: application/json" -d "$1" >/dev/null
}

# ---- multi-day all-day spans ----
# Teacher Appreciation Week — Mon May 4 .. Fri May 8 (5 days, fits in week)
post '{"origin":"standalone","title":"Teacher Appreciation Week","date":"2026-05-04","endDate":"2026-05-08","isAllDay":1,"color":"#3b82f6"}'

# Conference — Wed May 6 .. Mon May 11 (clips on right edge of week-of-May 3)
post '{"origin":"standalone","title":"DesignOps Conf","date":"2026-05-06","endDate":"2026-05-11","isAllDay":1,"color":"#16a34a"}'

# Family visit — Fri May 1 .. Tue May 5 (clips on left edge of week-of-May 3)
post '{"origin":"standalone","title":"Mom in town","date":"2026-05-01","endDate":"2026-05-05","isAllDay":1,"color":"#a855f7"}'

# Two single-day all-day events on same day to push that column to overflow
post '{"origin":"standalone","title":"School holiday","date":"2026-05-08","isAllDay":1,"color":"#f59e0b"}'
post '{"origin":"standalone","title":"Dentist","date":"2026-05-08","isAllDay":1,"color":"#ef4444"}'

# Single-day all-day on a different day
post '{"origin":"standalone","title":"Trash day","date":"2026-05-07","isAllDay":1,"color":"#64748b"}'

# ---- timed events on Friday May 8 (anchor day) for vertical-wrap test ----
post '{"origin":"standalone","title":"TK-Pic","date":"2026-05-08","time":"08:00","durationMinutes":30,"isAllDay":0,"color":"#3b82f6"}'
post '{"origin":"standalone","title":"Connect with Benn","date":"2026-05-08","time":"09:30","durationMinutes":45,"isAllDay":0,"color":"#16a34a"}'
post '{"origin":"standalone","title":"Wix Bill Due $34","date":"2026-05-08","time":"11:00","durationMinutes":30,"isAllDay":0,"color":"#ef4444"}'
post '{"origin":"standalone","title":"UnPuzzle standup","date":"2026-05-08","time":"13:00","durationMinutes":30,"isAllDay":0,"color":"#a855f7"}'
post '{"origin":"standalone","title":"Coffee with Sarah","date":"2026-05-08","time":"15:00","durationMinutes":60,"isAllDay":0,"color":"#f59e0b"}'

# ---- timed events on Wed May 6 / Thu May 7 / Sat May 9 ----
post '{"origin":"standalone","title":"Sprint planning","date":"2026-05-06","time":"10:00","durationMinutes":60,"isAllDay":0,"color":"#3b82f6"}'
post '{"origin":"standalone","title":"Kids pickup","date":"2026-05-07","time":"15:30","durationMinutes":30,"isAllDay":0,"color":"#a855f7"}'
post '{"origin":"standalone","title":"Yoga class","date":"2026-05-09","time":"08:00","durationMinutes":60,"isAllDay":0,"color":"#16a34a"}'

echo "seeded"
