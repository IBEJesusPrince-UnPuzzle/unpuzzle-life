#!/usr/bin/env bash
# ============================================================
# Phase 2 verify script
# Exercises Phase 2 endpoints (project_tasks, agenda_tasks, agenda
# window query, agenda default view) against a freshly-booted dev
# server. Asserts schema, recurrence expansion, and override behavior.
# Prints PASS/FAIL summary at the end.
# ============================================================
set -u
set -o pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase2-cookies.XXXXXX)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@verify.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set so login is deterministic}"

PASS=0
FAIL=0
FAILURES=()

trap 'rm -f "$COOKIE_JAR"' EXIT

# ---- helpers ----
say()  { printf "%s\n" "$*"; }
hr()   { printf -- "------------------------------------------------------------\n"; }

# assert <label> <expected> <actual>
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

# req <method> <path> [json-body] -> stdout = response body
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

# req_status <method> <path> [json-body] -> stdout = HTTP status
req_status() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR"
  fi
}

# ============================================================
# 0. Wait for server, log in
# ============================================================
hr; say "[0] Waiting for server at $BASE"
for i in {1..30}; do
  if curl -sS -o /dev/null "$BASE/api/auth/me"; then break; fi
  sleep 1
done

hr; say "[1] Logging in as $ADMIN_EMAIL"
LOGIN_RES="$(req POST /api/auth/login "$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')")"
LOGIN_ID="$(printf '%s' "$LOGIN_RES" | jq -r '.id // empty')"
if [[ -z "$LOGIN_ID" ]]; then
  say "  FAIL  login response: $LOGIN_RES"
  FAIL=$((FAIL + 1))
  FAILURES+=("login failed")
  exit 1
fi
say "  logged in as user id=$LOGIN_ID"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ============================================================
# 2. AGENDA DEFAULT VIEW
# ============================================================
hr; say "[2] Agenda default view get/set"
DV1="$(req GET /api/agenda-default-view | jq -r '.view')"
assert "default view is one of allowed" "true" "$([[ "$DV1" =~ ^(day|3day|week|month)$ ]] && echo true || echo false)"

DV2="$(req PATCH /api/agenda-default-view '{"view":"3day"}' | jq -r '.view')"
assert "PATCH default view -> 3day" "3day" "$DV2"
DV3="$(req GET /api/agenda-default-view | jq -r '.view')"
assert "GET default view persists -> 3day" "3day" "$DV3"

BAD_VIEW="$(req_status PATCH /api/agenda-default-view '{"view":"year"}')"
assert "PATCH invalid view -> 400" "400" "$BAD_VIEW"

# ============================================================
# 3. PROJECT TASKS  (need a project first)
# ============================================================
hr; say "[3] Project tasks CRUD"
PROJECT_ID="$(req POST /api/projects \
  "$(jq -n --arg n 'Phase 2 Verify Project' --arg t "$NOW" '{title:$n,createdAt:$t}')" | jq -r '.id')"
assert "created project (id is number)" "number" "$(req GET /api/projects | jq -r --arg id "$PROJECT_ID" '.[] | select((.id|tostring)==$id) | (.id|type)')"

PT_CREATE="$(req POST /api/project-tasks \
  "$(jq -n --arg pid "$PROJECT_ID" --arg uid "$LOGIN_ID" --arg t "$NOW" \
     '{userId:($uid|tonumber), projectId:($pid|tonumber), title:"Project task A", status:"open", createdAt:$t}')")"
PT_ID="$(printf '%s' "$PT_CREATE" | jq -r '.id // empty')"
assert "POST /api/project-tasks returns id" "true" "$([[ -n "$PT_ID" ]] && echo true || echo false)"
assert "project task status=open" "open" "$(printf '%s' "$PT_CREATE" | jq -r '.status')"

PT_LIST_LEN="$(req GET "/api/project-tasks?projectId=$PROJECT_ID" | jq 'length')"
assert "GET /api/project-tasks?projectId=N returns 1" "1" "$PT_LIST_LEN"

PT_PATCH_STATUS="$(req PATCH "/api/project-tasks/$PT_ID" '{"status":"done"}' | jq -r '.status')"
assert "PATCH project task status -> done" "done" "$PT_PATCH_STATUS"

BAD_PT_STATUS="$(req_status PATCH "/api/project-tasks/$PT_ID" '{"status":"foo"}')"
assert "PATCH project task invalid status -> 400" "400" "$BAD_PT_STATUS"

req DELETE "/api/project-tasks/$PT_ID" >/dev/null
PT_LIST_AFTER="$(req GET "/api/project-tasks?projectId=$PROJECT_ID" | jq 'length')"
assert "DELETE project task -> list empty" "0" "$PT_LIST_AFTER"

# ============================================================
# 4. AGENDA TASKS — masters, expansion, overrides
# ============================================================
hr; say "[4] Agenda recurrence + override behavior"

# Pick a fixed Monday so weekly expansion is predictable.
# 2026-06-01 is a Monday. Window: 2026-06-01 .. 2026-06-28 (4 Mondays).
WIN_FROM="2026-06-01"
WIN_TO="2026-06-28"
EXPECTED_DATES=("2026-06-01" "2026-06-08" "2026-06-15" "2026-06-22")

# Create a responsibility to anchor the weekly master (with color per §23).
RESP_ID="$(req POST /api/responsibilities \
  "$(jq -n --arg n 'Verify Resp' --arg c '#3366ff' --arg t "$NOW" \
     '{name:$n, color:$c, createdAt:$t}')" | jq -r '.id')"
assert "created responsibility with color" "true" "$([[ -n "$RESP_ID" && "$RESP_ID" != "null" ]] && echo true || echo false)"

# Create the MASTER agenda task: weekly on Monday, no end date.
MASTER_BODY="$(jq -n \
  --arg uid "$LOGIN_ID" \
  --arg rid "$RESP_ID" \
  --arg t "$NOW" \
  --arg start "$WIN_FROM" \
  '{
     userId:        ($uid|tonumber),
     origin:        "responsibility",
     originId:      ($rid|tonumber),
     responsibilityId: ($rid|tonumber),
     title:         "Weekly Mon Master",
     date:          $start,
     time:          "09:00",
     status:        "ready",
     color:         "#3366ff",
     recurrenceRule:"FREQ=WEEKLY;BYDAY=MO",
     isOverride:    0,
     createdAt:     $t
   }')"
MASTER_RES="$(req POST /api/agenda-tasks "$MASTER_BODY")"
MASTER_ID="$(printf '%s' "$MASTER_RES" | jq -r '.id // empty')"
assert "create master agenda task" "true" "$([[ -n "$MASTER_ID" && "$MASTER_ID" != "null" ]] && echo true || echo false)"
MASTER_SERIES="$(printf '%s' "$MASTER_RES" | jq -r '.seriesId // empty')"
assert "master.seriesId == master.id (auto-assigned)" "$MASTER_ID" "$MASTER_SERIES"

# Window query: expect 4 Mondays.
WIN_RES="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
WIN_LEN="$(printf '%s' "$WIN_RES" | jq 'length')"
assert "window returns 4 instances" "4" "$WIN_LEN"

WIN_DATES="$(printf '%s' "$WIN_RES" | jq -r '.[].date' | sort | tr '\n' ',' | sed 's/,$//')"
EXPECT_DATES_CSV="$(IFS=,; echo "${EXPECTED_DATES[*]}")"
assert "window dates are the 4 Mondays" "$EXPECT_DATES_CSV" "$WIN_DATES"

ALL_VIRTUAL="$(printf '%s' "$WIN_RES" | jq '[.[] | select(.isVirtual==true)] | length')"
assert "all 4 instances are virtual" "4" "$ALL_VIRTUAL"

# ----- Override on instance #2 (2026-06-08), color=red, same date -----
OVR1_BODY="$(jq -n \
  --arg uid "$LOGIN_ID" \
  --arg rid "$RESP_ID" \
  --arg sid "$MASTER_SERIES" \
  --arg t "$NOW" \
  --arg d "2026-06-08" \
  '{
     userId:        ($uid|tonumber),
     origin:        "responsibility",
     originId:      ($rid|tonumber),
     responsibilityId: ($rid|tonumber),
     title:         "Overridden instance",
     date:          $d,
     originalDate:  $d,
     time:          "10:00",
     status:        "ready",
     color:         "red",
     seriesId:      ($sid|tonumber),
     isOverride:    1,
     createdAt:     $t
   }')"
OVR1_ID="$(req POST /api/agenda-tasks "$OVR1_BODY" | jq -r '.id')"
assert "create override (in-place)" "true" "$([[ -n "$OVR1_ID" && "$OVR1_ID" != "null" ]] && echo true || echo false)"

WIN_RES2="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
assert "window total count still 4" "4" "$(printf '%s' "$WIN_RES2" | jq 'length')"
COL_0608="$(printf '%s' "$WIN_RES2" | jq -r '[.[] | select(.date=="2026-06-08")][0].color')"
assert "instance 2026-06-08 color=red" "red" "$COL_0608"
VIRT_0608="$(printf '%s' "$WIN_RES2" | jq -r '[.[] | select(.date=="2026-06-08")][0].isVirtual')"
assert "instance 2026-06-08 isVirtual=false" "false" "$VIRT_0608"

# ----- Move override to a different date (2026-06-10, off-pattern) -----
req PATCH "/api/agenda-tasks/$OVR1_ID" '{"date":"2026-06-10"}' >/dev/null
WIN_RES3="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
LEN3="$(printf '%s' "$WIN_RES3" | jq 'length')"
assert "moved override: window total still 4 (3 virtual Mondays + override)" "4" "$LEN3"
HAS_0608="$(printf '%s' "$WIN_RES3" | jq '[.[] | select(.date=="2026-06-08")] | length')"
assert "no virtual instance on 2026-06-08 (suppressed by override)" "0" "$HAS_0608"
HAS_0610="$(printf '%s' "$WIN_RES3" | jq '[.[] | select(.date=="2026-06-10")] | length')"
assert "override appears on 2026-06-10" "1" "$HAS_0610"

# Clean up override before next assertion.
req DELETE "/api/agenda-tasks/$OVR1_ID" >/dev/null
WIN_RES4="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
assert "after deleting override: window back to 4 virtual" "4" "$(printf '%s' "$WIN_RES4" | jq 'length')"

# ============================================================
# 5. recurrence_end_date caps the series
# ============================================================
hr; say "[5] recurrence_end_date caps expansion"
req PATCH "/api/agenda-tasks/$MASTER_ID" '{"recurrenceEndDate":"2026-06-09"}' >/dev/null
WIN_RES5="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
LEN5="$(printf '%s' "$WIN_RES5" | jq 'length')"
assert "with end_date=2026-06-09: 2 instances (Mon 6/1 and 6/8)" "2" "$LEN5"
# Lift the cap so subsequent tests have a clean master.
req PATCH "/api/agenda-tasks/$MASTER_ID" '{"recurrenceEndDate":null}' >/dev/null

# ============================================================
# 6. Standalone task in window
# ============================================================
hr; say "[6] Standalone agenda task"
STA_BODY="$(jq -n \
  --arg uid "$LOGIN_ID" \
  --arg t "$NOW" \
  '{
     userId:    ($uid|tonumber),
     origin:    "standalone",
     title:     "One-off",
     date:      "2026-06-15",
     time:      "14:00",
     status:    "ready",
     isOverride:0,
     createdAt: $t
   }')"
STA_ID="$(req POST /api/agenda-tasks "$STA_BODY" | jq -r '.id')"
WIN_RES6="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
LEN6="$(printf '%s' "$WIN_RES6" | jq 'length')"
assert "window includes standalone -> 5 results" "5" "$LEN6"

# Standalone outside window not returned.
STA2_BODY="$(jq -n \
  --arg uid "$LOGIN_ID" --arg t "$NOW" \
  '{userId:($uid|tonumber), origin:"standalone", title:"Out-of-window",
    date:"2027-01-01", status:"ready", isOverride:0, createdAt:$t}')"
req POST /api/agenda-tasks "$STA2_BODY" >/dev/null
WIN_RES7="$(req GET "/api/agenda?from=$WIN_FROM&to=$WIN_TO")"
assert "out-of-window standalone excluded" "5" "$(printf '%s' "$WIN_RES7" | jq 'length')"

# ============================================================
# 7. Validation: invalid recurrence_rule rejected
# ============================================================
hr; say "[7] Validation: invalid recurrence_rule"
BAD_BODY="$(jq -n \
  --arg uid "$LOGIN_ID" --arg t "$NOW" \
  '{userId:($uid|tonumber), origin:"standalone", title:"BadRule",
    date:"2026-06-01", status:"ready", isOverride:0,
    recurrenceRule:"NOT_A_RULE", createdAt:$t}')"
BAD_STATUS="$(req_status POST /api/agenda-tasks "$BAD_BODY")"
assert "POST agenda task with bad recurrenceRule -> 400" "400" "$BAD_STATUS"

# ============================================================
# 8. Validation: bad window args
# ============================================================
hr; say "[8] Validation: window args"
assert "missing from/to -> 400" "400" "$(req_status GET '/api/agenda')"
assert "from > to -> 400"        "400" "$(req_status GET '/api/agenda?from=2026-06-28&to=2026-06-01')"

# ============================================================
# 9. Validation: invalid origin / status
# ============================================================
hr; say "[9] Validation: enums"
INV_ORIGIN_BODY="$(jq -n --arg uid "$LOGIN_ID" --arg t "$NOW" \
  '{userId:($uid|tonumber), origin:"alien", title:"x", date:"2026-06-01", status:"ready", isOverride:0, createdAt:$t}')"
assert "invalid origin -> 400" "400" "$(req_status POST /api/agenda-tasks "$INV_ORIGIN_BODY")"

INV_STATUS_BODY="$(jq -n --arg uid "$LOGIN_ID" --arg t "$NOW" \
  '{userId:($uid|tonumber), origin:"standalone", title:"x", date:"2026-06-01", status:"weird", isOverride:0, createdAt:$t}')"
assert "invalid status -> 400" "400" "$(req_status POST /api/agenda-tasks "$INV_STATUS_BODY")"

# ============================================================
# 10. Cleanup (best-effort)
# ============================================================
hr; say "[10] Cleanup"
req DELETE "/api/agenda-tasks/$STA_ID" >/dev/null || true
req DELETE "/api/agenda-tasks/$MASTER_ID" >/dev/null || true
req DELETE "/api/responsibilities/$RESP_ID" >/dev/null || true
req DELETE "/api/projects/$PROJECT_ID" >/dev/null || true

# ============================================================
# Summary
# ============================================================
hr
say "RESULTS  PASS=$PASS  FAIL=$FAIL"
if (( FAIL > 0 )); then
  hr
  say "FAILURES:"
  for f in "${FAILURES[@]}"; do say "  - $f"; done
  exit 1
fi
exit 0
