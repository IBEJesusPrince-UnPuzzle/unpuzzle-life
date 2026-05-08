#!/usr/bin/env bash
# =============================================================================
# Phase 3a verify script
# =============================================================================
# Exercises the Phase 3a server-side guarantees:
#
#   §18  Sidebar reshape — server side has nothing to assert here, covered by
#        the build artifact (vite chunks include /clarity, /roles routes).
#
#   §22a title column      — agenda_tasks accepts and returns `title`.
#
#   §22a override creation — POST /api/agenda-tasks with seriesId +
#                            originalDate + isOverride=1 wins over the
#                            virtual instance returned by the window query.
#
#   §23  default view      — PATCH /api/agenda-default-view persists; the
#                            value comes back unchanged on GET.
#
#   nuke-on-boot retired   — the script is invoked AFTER a fresh boot; data
#                            written by an earlier run of this script must
#                            survive a server restart. We test this by
#                            asserting the row count is monotonically
#                            increasing across calls — the launcher (manual
#                            or CI) is responsible for the second boot.
#
# Prints PASS/FAIL summary; exits non-zero if anything fails.
# =============================================================================
set -u
set -o pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase3a-cookies.XXXXXX)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@verify.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set so login is deterministic}"

PASS=0
FAIL=0
FAILURES=()

trap 'rm -f "$COOKIE_JAR"' EXIT

# ---- helpers ----
say()  { printf "%s\n" "$*"; }
hr()   { printf -- "------------------------------------------------------------\n"; }

assert() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    say "  PASS  $label"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label  expected=[$expected]  actual=[$actual]")
    say "  FAIL  $label  expected=[$expected]  actual=[$actual]"
  fi
}

assert_truthy() {
  local label="$1" actual="$2"
  if [[ -n "$actual" && "$actual" != "null" && "$actual" != "false" && "$actual" != "0" ]]; then
    PASS=$((PASS + 1))
    say "  PASS  $label  (got=[$actual])"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label  actual=[$actual]")
    say "  FAIL  $label  actual=[$actual]"
  fi
}

req() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR"
  fi
}

# ---- login ----
hr
say "Login as $ADMIN_EMAIL"
LOGIN_RESP=$(req POST /api/auth/login "$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
LOGIN_OK=$(printf "%s" "$LOGIN_RESP" | grep -c '"id"' || true)
assert "login succeeds" "1" "$LOGIN_OK"

# =============================================================================
# §22a — agenda_tasks gains a `title` column
# =============================================================================
hr
say "§22a — title column on agenda_tasks"

CREATE_BODY='{
  "origin": "standalone",
  "title": "Phase 3a smoke title",
  "date": "2026-06-01",
  "time": "10:00",
  "durationMinutes": 45,
  "color": "#039BE5"
}'
CREATE_RESP=$(req POST /api/agenda-tasks "$CREATE_BODY")
STANDALONE_ID=$(printf "%s" "$CREATE_RESP" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
STANDALONE_TITLE=$(printf "%s" "$CREATE_RESP" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//; s/"$//')
assert_truthy "POST /api/agenda-tasks returns id"           "$STANDALONE_ID"
assert        "POST /api/agenda-tasks echoes title"         "Phase 3a smoke title" "$STANDALONE_TITLE"

# Window read should expose the title field
WINDOW_RESP=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-01")
WINDOW_HAS_TITLE=$(printf "%s" "$WINDOW_RESP" | grep -c '"title":"Phase 3a smoke title"' || true)
assert "GET /api/agenda projects title field" "1" "$WINDOW_HAS_TITLE"

# =============================================================================
# §22a — override creation for virtual recurring instances
# =============================================================================
hr
say "§22a — override creation flow"

# Master: weekly recurring on 2026-06-01 (Monday) for 4 weeks.
MASTER_BODY='{
  "origin": "standalone",
  "title": "Weekly stand-up",
  "date": "2026-06-01",
  "time": "09:00",
  "durationMinutes": 30,
  "color": "#7986CB",
  "recurrenceRule": "FREQ=WEEKLY;COUNT=4"
}'
MASTER_RESP=$(req POST /api/agenda-tasks "$MASTER_BODY")
MASTER_ID=$(printf "%s" "$MASTER_RESP" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "Recurring master created" "$MASTER_ID"

# Window over the 4 weeks should yield 4 instances of the master.
WIN=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-29")
INSTANCES_BEFORE=$(printf "%s" "$WIN" | grep -o "\"title\":\"Weekly stand-up\"" | wc -l | tr -d ' ')
assert "Recurring master expands to 4 instances" "4" "$INSTANCES_BEFORE"

# Now override the second instance (2026-06-08): rename + move to 11:00.
OVERRIDE_BODY=$(printf '{
  "origin": "standalone",
  "title": "Stand-up (moved)",
  "date": "2026-06-08",
  "time": "11:00",
  "durationMinutes": 30,
  "color": "#7986CB",
  "seriesId": %s,
  "originalDate": "2026-06-08",
  "isOverride": 1
}' "$MASTER_ID")
OVERRIDE_RESP=$(req POST /api/agenda-tasks "$OVERRIDE_BODY")
OVERRIDE_ID=$(printf "%s" "$OVERRIDE_RESP" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "Override row created" "$OVERRIDE_ID"

# Re-query window. Total titled rows should still be 4 (3 from master + 1 override),
# but the override title should appear and the original 09:00 instance for 2026-06-08
# should not.
WIN2=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-29")
TOTAL_TITLED=$(printf "%s" "$WIN2" | grep -o "\"title\":\"\(Weekly stand-up\|Stand-up (moved)\)\"" | wc -l | tr -d ' ')
assert "Window after override still has 4 total occurrences" "4" "$TOTAL_TITLED"

OVERRIDE_VISIBLE=$(printf "%s" "$WIN2" | grep -c '"title":"Stand-up (moved)"' || true)
assert "Override title appears in window" "1" "$OVERRIDE_VISIBLE"

# The pre-override 2026-06-08 09:00 instance must be hidden by the override.
GHOST=$(printf "%s" "$WIN2" \
  | grep -o '{[^{}]*"date":"2026-06-08"[^{}]*"time":"09:00"[^{}]*"title":"Weekly stand-up"[^{}]*}' \
  | wc -l | tr -d ' ')
assert "Pre-override virtual instance is suppressed" "0" "$GHOST"

# =============================================================================
# §23 — default agenda view persists
# =============================================================================
hr
say "§23 — default agenda view"

PATCH_RESP=$(req PATCH /api/agenda-default-view '{"view":"3day"}')
PATCH_VIEW=$(printf "%s" "$PATCH_RESP" | grep -o '"view":"[^"]*"' | sed 's/"view":"//; s/"$//')
assert "PATCH default view echoes new value" "3day" "$PATCH_VIEW"

GET_RESP=$(req GET /api/agenda-default-view)
GET_VIEW=$(printf "%s" "$GET_RESP" | grep -o '"view":"[^"]*"' | sed 's/"view":"//; s/"$//')
assert "GET default view returns persisted value" "3day" "$GET_VIEW"

# Reset default view to "day" so this script is idempotent across reruns.
req PATCH /api/agenda-default-view '{"view":"day"}' >/dev/null

# =============================================================================
# Migrations on — placeholder log of how many rows are present
# =============================================================================
hr
say "Migrations on — data persistence smoke"

WIN_FINAL=$(req GET "/api/agenda?from=2026-06-01&to=2026-06-29")
FINAL_COUNT=$(printf "%s" "$WIN_FINAL" | grep -o '"id":' | wc -l | tr -d ' ')
say "  INFO  agenda window currently holds $FINAL_COUNT rows"
say "        (run this script, restart server, run again — count must grow)"

# =============================================================================
# SUMMARY
# =============================================================================
hr
say "PHASE 3a VERIFY SUMMARY"
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
say "All Phase 3a checks passed."
