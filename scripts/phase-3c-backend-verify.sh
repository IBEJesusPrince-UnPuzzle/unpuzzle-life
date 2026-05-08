#!/usr/bin/env bash
# =============================================================================
# Phase 3c backend verify script
# =============================================================================
# Phase 3c commit 1 adds an `end_date` column to agenda_tasks for multi-day
# all-day events. This script tests the backend surface only:
#
#   1. POST /api/agenda-tasks accepts endDate when isAllDay = 1
#   2. POST rejects endDate when isAllDay = 0
#   3. POST rejects endDate < date when isAllDay = 1
#   4. GET /api/agenda window includes a multi-day event whose start is
#      BEFORE the window but endDate falls inside it (overlap test)
#   5. GET /api/agenda window includes a multi-day event whose endDate is
#      AFTER the window but date is inside it
#   6. Recurring multi-day all-day master inherits its span on every occurrence
#   7. PATCH can set/clear endDate
# =============================================================================
set -u
set -o pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase3c-cookies.XXXXXX)"
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

req_status() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR"
  fi
}

# ---- login ----
hr
say "Login as $ADMIN_EMAIL"
LOGIN_RESP=$(req POST /api/auth/login "$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
LOGIN_OK=$(printf "%s" "$LOGIN_RESP" | grep -c '"id"' || true)
assert "login succeeds" "1" "$LOGIN_OK"

# ---- 1. POST accepts endDate when isAllDay = 1 ----
hr
say "1. POST accepts multi-day all-day event"
SEED1='{
  "origin": "standalone",
  "title": "Teacher Appreciation Week",
  "date": "2026-05-04",
  "endDate": "2026-05-08",
  "isAllDay": 1,
  "color": "#7AE7BF"
}'
RESP1=$(req POST /api/agenda-tasks "$SEED1")
ID1=$(printf "%s" "$RESP1" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "multi-day all-day event created" "$ID1"
END1=$(printf "%s" "$RESP1" | grep -o '"endDate":"[^"]*"' | head -1)
assert "endDate persisted as 2026-05-08" '"endDate":"2026-05-08"' "$END1"

# ---- 2. POST rejects endDate when isAllDay = 0 ----
hr
say "2. POST rejects endDate on a timed event"
SEED2='{
  "origin": "standalone",
  "title": "Bad timed event",
  "date": "2026-05-04",
  "endDate": "2026-05-05",
  "isAllDay": 0,
  "time": "09:00",
  "durationMinutes": 30,
  "color": "#A4BDFC"
}'
STATUS2=$(req_status POST /api/agenda-tasks "$SEED2")
assert "POST timed event with endDate is rejected (HTTP 400)" "400" "$STATUS2"

# ---- 3. POST rejects endDate < date when isAllDay = 1 ----
hr
say "3. POST rejects endDate earlier than start date"
SEED3='{
  "origin": "standalone",
  "title": "Backwards dates",
  "date": "2026-05-08",
  "endDate": "2026-05-04",
  "isAllDay": 1,
  "color": "#A4BDFC"
}'
STATUS3=$(req_status POST /api/agenda-tasks "$SEED3")
assert "POST endDate < date is rejected (HTTP 400)" "400" "$STATUS3"

# ---- 4. Window endpoint includes multi-day event whose start is BEFORE window ----
hr
say "4. Window includes multi-day event when only the END is in the window"
# Seeded above: 2026-05-04 to 2026-05-08. Query a window starting May 6.
WIN4_RESP=$(req GET "/api/agenda?from=2026-05-06&to=2026-05-10")
WIN4_COUNT=$(printf "%s" "$WIN4_RESP" | grep -o '"title":"Teacher Appreciation Week"' | wc -l | tr -d ' ')
assert "Multi-day event appears when only end overlaps window" "1" "$WIN4_COUNT"

# ---- 5. Window endpoint includes multi-day event whose endDate is AFTER window ----
hr
say "5. Window includes multi-day event when only the START is in the window"
WIN5_RESP=$(req GET "/api/agenda?from=2026-05-01&to=2026-05-05")
WIN5_COUNT=$(printf "%s" "$WIN5_RESP" | grep -o '"title":"Teacher Appreciation Week"' | wc -l | tr -d ' ')
assert "Multi-day event appears when only start overlaps window" "1" "$WIN5_COUNT"

# ---- 6. Recurring multi-day master inherits span on each occurrence ----
hr
say "6. Recurring multi-day master \u2014 each occurrence keeps its span"
SEED6='{
  "origin": "standalone",
  "title": "Yearly span",
  "date": "2026-07-04",
  "endDate": "2026-07-06",
  "isAllDay": 1,
  "color": "#33B679",
  "recurrenceRule": "FREQ=YEARLY;COUNT=3"
}'
RESP6=$(req POST /api/agenda-tasks "$SEED6")
ID6=$(printf "%s" "$RESP6" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "Recurring multi-day master created" "$ID6"
# Query an extremely wide window so we get all three occurrences.
WIN6_RESP=$(req GET "/api/agenda?from=2026-01-01&to=2028-12-31")
WIN6_COUNT=$(printf "%s" "$WIN6_RESP" | grep -o '"title":"Yearly span"' | wc -l | tr -d ' ')
assert "Recurring master expands to 3 occurrences across 3 years" "3" "$WIN6_COUNT"
# Year 2: Jul 4-6 2027 \u2014 verify the endDate carried with the occurrence.
WIN6Y2=$(req GET "/api/agenda?from=2027-07-01&to=2027-07-31")
END_2027=$(printf "%s" "$WIN6Y2" | grep -o '"endDate":"2027-07-06"' | wc -l | tr -d ' ')
assert "Year-2 occurrence inherits the 3-day span (endDate 2027-07-06)" "1" "$END_2027"
# Window the middle of the Year 2 occurrence \u2014 it must still appear.
WIN6Y2MID=$(req GET "/api/agenda?from=2027-07-05&to=2027-07-05")
WIN6Y2MID_COUNT=$(printf "%s" "$WIN6Y2MID" | grep -o '"title":"Yearly span"' | wc -l | tr -d ' ')
assert "Year-2 occurrence appears when only mid-day is in window" "1" "$WIN6Y2MID_COUNT"

# ---- 7. PATCH can set/clear endDate ----
hr
say "7. PATCH endDate flow on a single-day all-day event"
SEED7='{
  "origin": "standalone",
  "title": "Patch target",
  "date": "2026-09-10",
  "isAllDay": 1,
  "color": "#A4BDFC"
}'
RESP7=$(req POST /api/agenda-tasks "$SEED7")
ID7=$(printf "%s" "$RESP7" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
assert_truthy "Single-day all-day event created" "$ID7"
# Extend to 3 days
PATCH7A=$(req PATCH "/api/agenda-tasks/$ID7" '{"endDate":"2026-09-12","isAllDay":1,"date":"2026-09-10"}')
END7A=$(printf "%s" "$PATCH7A" | grep -o '"endDate":"2026-09-12"' | wc -l | tr -d ' ')
assert "PATCH sets endDate" "1" "$END7A"
# Clear it (back to single-day)
PATCH7B=$(req PATCH "/api/agenda-tasks/$ID7" '{"endDate":null,"isAllDay":1,"date":"2026-09-10"}')
END7B=$(printf "%s" "$PATCH7B" | grep -o '"endDate":null' | wc -l | tr -d ' ')
assert "PATCH clears endDate (back to single-day)" "1" "$END7B"
# Reject backward
STATUS7C=$(req_status PATCH "/api/agenda-tasks/$ID7" '{"endDate":"2026-09-08","isAllDay":1,"date":"2026-09-10"}')
assert "PATCH rejects endDate < date (HTTP 400)" "400" "$STATUS7C"

# ---- summary ----
hr
say "Phase 3c backend results: PASS=$PASS  FAIL=$FAIL"
if (( FAIL > 0 )); then
  say ""
  say "Failures:"
  for f in "${FAILURES[@]}"; do say "  - $f"; done
  exit 1
fi
say "All checks passed."
