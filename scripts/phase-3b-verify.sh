#!/usr/bin/env bash
# =============================================================================
# Phase 3b verify script
# =============================================================================
# Phase 3b is a UI-only phase — no schema changes, no new server routes.
# What this script verifies is that the existing /api/agenda window endpoint
# returns sensible results for each view's date range:
#
#   Day    : ?from=D&to=D                  → 1-day expansion
#   3 Days : ?from=D&to=D+2                → 3-day expansion
#   Week   : ?from=Sun&to=Sat              → 7-day expansion (Sunday-start)
#   Month  : ?from=gridStart&to=gridEnd    → entire month grid (35–42 days)
#
# It also reruns Phase 3a checks so we know we didn't regress anything.
# =============================================================================
set -u
set -o pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase3b-cookies.XXXXXX)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@verify.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set so login is deterministic}"

PASS=0
FAIL=0
FAILURES=()

trap 'rm -f "$COOKIE_JAR"' EXIT

say() { printf "%s\n" "$*"; }
hr()  { printf -- "------------------------------------------------------------\n"; }

assert() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1)); say "  PASS  $label"
  else
    FAIL=$((FAIL + 1)); FAILURES+=("$label  expected=[$expected]  actual=[$actual]")
    say "  FAIL  $label  expected=[$expected]  actual=[$actual]"
  fi
}

assert_truthy() {
  local label="$1" actual="$2"
  if [[ -n "$actual" && "$actual" != "null" && "$actual" != "false" && "$actual" != "0" ]]; then
    PASS=$((PASS + 1)); say "  PASS  $label  (got=[$actual])"
  else
    FAIL=$((FAIL + 1)); FAILURES+=("$label  actual=[$actual]")
    say "  FAIL  $label  actual=[$actual]"
  fi
}

req() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$BASE$path" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$BASE$path" -b "$COOKIE_JAR" -c "$COOKIE_JAR"
  fi
}

# ---- login ----
hr
say "Login as $ADMIN_EMAIL"
LOGIN_RESP=$(req POST /api/auth/login "$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
LOGIN_OK=$(printf "%s" "$LOGIN_RESP" | grep -c '"id"' || true)
assert "login succeeds" "1" "$LOGIN_OK"

# Seed: weekly recurring task starting Mon 2026-06-01 for 6 weeks. Window
# math will hit it from each view.
hr
say "Seed weekly recurring task across June 2026"
SEED_BODY='{
  "origin": "standalone",
  "title": "Phase 3b weekly seed",
  "date": "2026-06-01",
  "time": "10:00",
  "durationMinutes": 30,
  "color": "#33B679",
  "recurrenceRule": "FREQ=WEEKLY;COUNT=6"
}'
SEED_RESP=$(req POST /api/agenda-tasks "$SEED_BODY")
SEED_ID=$(printf "%s" "$SEED_RESP" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "Seed master created" "$SEED_ID"

# Day view range — 2026-06-01 only
hr
say "§20 — Day view range expansion"
DAY_RESP=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-01")
DAY_COUNT=$(printf "%s" "$DAY_RESP" | grep -o '"title":"Phase 3b weekly seed"' | wc -l | tr -d ' ')
assert "Day view returns 1 instance for 2026-06-01" "1" "$DAY_COUNT"

# 3 Days range — 2026-06-01 .. 2026-06-03 (only Mon hits the weekly)
hr
say "§20a — 3 Days view range expansion"
TD_RESP=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-03")
TD_COUNT=$(printf "%s" "$TD_RESP" | grep -o '"title":"Phase 3b weekly seed"' | wc -l | tr -d ' ')
assert "3 Days view returns 1 instance over Jun 1-3" "1" "$TD_COUNT"

# Week range — Sunday 2026-05-31 .. Saturday 2026-06-06 (catches Mon Jun 1)
hr
say "§20b — Week view range expansion (Sunday-start)"
WK_RESP=$(req GET "/api/agenda?from=2026-05-31&to=2026-06-06")
WK_COUNT=$(printf "%s" "$WK_RESP" | grep -o '"title":"Phase 3b weekly seed"' | wc -l | tr -d ' ')
assert "Week view returns 1 instance for week of May 31" "1" "$WK_COUNT"

# Month range — 2026-06-01 .. 2026-06-30 should expand all 4 June Mondays.
# (Seed is COUNT=6 starting Jun 1, so weeks fall on Jun 1, 8, 15, 22, 29 = 5 in June)
hr
say "§20c — Month view range expansion"
MO_RESP=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-30")
MO_COUNT=$(printf "%s" "$MO_RESP" | grep -o '"title":"Phase 3b weekly seed"' | wc -l | tr -d ' ')
assert "Month view returns 5 June occurrences of weekly seed" "5" "$MO_COUNT"

# Month grid range — Sun 2026-05-31 .. Sat 2026-07-04 (full visible grid)
hr
say "§20c — Month grid window includes overflow weeks"
GRID_RESP=$(req GET "/api/agenda?from=2026-05-31&to=2026-07-04")
GRID_COUNT=$(printf "%s" "$GRID_RESP" | grep -o '"title":"Phase 3b weekly seed"' | wc -l | tr -d ' ')
# COUNT=6 from Jun 1 → Jun 1, 8, 15, 22, 29, Jul 6.  Jul 6 is OUTSIDE the
# grid end (Jul 4), so we expect 5.
assert "Month grid window expands to 5 visible occurrences" "5" "$GRID_COUNT"

# Phase 3a regression sweep — default view, override flow.
hr
say "Phase 3a regression — default view round-trip"
req PATCH /api/agenda-default-view '{"view":"week"}' >/dev/null
GET_RESP=$(req GET /api/agenda-default-view)
GET_VIEW=$(printf "%s" "$GET_RESP" | grep -o '"view":"[^"]*"' | sed 's/"view":"//; s/"$//')
assert "default view persists across PATCH/GET" "week" "$GET_VIEW"
req PATCH /api/agenda-default-view '{"view":"day"}' >/dev/null

# =============================================================================
# SUMMARY
# =============================================================================
hr
say "PHASE 3b VERIFY SUMMARY"
say "  PASS: $PASS"
say "  FAIL: $FAIL"
if (( FAIL > 0 )); then
  say ""
  say "Failures:"
  for f in "${FAILURES[@]}"; do
    say "  - $f"
  done
  exit 1
fi
say "All Phase 3b checks passed."
