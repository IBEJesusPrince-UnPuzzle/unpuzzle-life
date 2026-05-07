#!/usr/bin/env bash
# ============================================================
# Phase 1 verify script
# Exercises every Phase 1 endpoint against a freshly-booted dev server
# and asserts shape with jq. Prints PASS/FAIL summary at the end.
# ============================================================
set -u
set -o pipefail

BASE="${BASE:-http://localhost:5000}"
COOKIE_JAR="$(mktemp -t phase1-cookies.XXXXXX)"
ADMIN_EMAIL="${ADMIN_EMAIL:-tab@theesweetesttaboo.com}"
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
# 2. Create one of each support category
# ============================================================
hr; say "[2] Creating one record in each support category"

PERSON_ID="$(req POST /api/environment/people \
  "$(jq -n --arg n 'Verify Person' --arg t "$NOW" '{name:$n,createdAt:$t}')" | jq -r '.id')"
assert "create person"     "1" "$([[ "$PERSON_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

PLACE_ID="$(req POST /api/environment/places \
  "$(jq -n --arg n 'Verify Place' --arg t "$NOW" '{name:$n,createdAt:$t}')" | jq -r '.id')"
assert "create place"      "1" "$([[ "$PLACE_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

THING_ID="$(req POST /api/environment/things \
  "$(jq -n --arg n 'Verify Thing' --arg t "$NOW" '{name:$n,createdAt:$t}')" | jq -r '.id')"
assert "create thing"      "1" "$([[ "$THING_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

PROVIDER_ID="$(req POST /api/environment/providers \
  "$(jq -n --arg n 'Verify Provider' --arg t "$NOW" '{name:$n,createdAt:$t}')" | jq -r '.id')"
assert "create provider"   "1" "$([[ "$PROVIDER_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

CONDITION_ID="$(req POST /api/environment/conditions \
  "$(jq -n --arg n 'Verify Condition' --arg t "$NOW" '{name:$n,createdAt:$t}')" | jq -r '.id')"
assert "create condition"  "1" "$([[ "$CONDITION_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

# default state should be 'available'
PERSON_STATE="$(req GET /api/environment/people | jq -r --argjson id "$PERSON_ID" '.[] | select(.id==$id) | .state')"
assert "person default state=available" "available" "$PERSON_STATE"

# ============================================================
# 3. Set support state on each category
# ============================================================
hr; say "[3] Setting state on each support category"
for pair in "people:$PERSON_ID:at_risk" "places:$PLACE_ID:unavailable" \
            "things:$THING_ID:archived" "providers:$PROVIDER_ID:at_risk" \
            "conditions:$CONDITION_ID:unavailable"; do
  IFS=":" read -r TYPE ID STATE <<<"$pair"
  RES_STATE="$(req PATCH "/api/environment/$TYPE/$ID/state" \
    "$(jq -n --arg s "$STATE" '{state:$s}')" | jq -r '.state')"
  assert "set $TYPE state=$STATE" "$STATE" "$RES_STATE"
done

# Bad state should 400
BAD_STATE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PATCH "$BASE/api/environment/people/$PERSON_ID/state" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" -d '{"state":"bogus"}')"
assert "invalid state rejected (400)" "400" "$BAD_STATE_CODE"

# ============================================================
# 4. Create a responsibility, role, project
# ============================================================
hr; say "[4] Creating responsibility, role, project"

RESP_ID="$(req POST /api/responsibilities \
  "$(jq -n --arg n 'Verify Resp' --arg t "$NOW" '{name:$n,cadence:"weekly",createdAt:$t}')" | jq -r '.id')"
assert "create responsibility" "1" "$([[ "$RESP_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

ROLE_ID="$(req POST /api/roles \
  "$(jq -n --arg n 'Verify Role' --arg t "$NOW" '{name:$n,cadence:"weekly",createdAt:$t}')" | jq -r '.id')"
assert "create role"           "1" "$([[ "$ROLE_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

PROJECT_ID="$(req POST /api/projects \
  "$(jq -n --arg n 'Verify Project' --arg trig 'missing_support' --arg s '2026-05-01' --arg e '2026-06-01' --arg t "$NOW" \
     '{title:$n,trigger:$trig,startDate:$s,endDate:$e,createdAt:$t}')" | jq -r '.id')"
assert "create project"        "1" "$([[ "$PROJECT_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

# Verify trigger/start/end persisted
PROJECT_TRIGGER="$(req GET /api/projects | jq -r --argjson id "$PROJECT_ID" '.[] | select(.id==$id) | .trigger')"
PROJECT_START="$(req GET /api/projects | jq -r --argjson id "$PROJECT_ID" '.[] | select(.id==$id) | .startDate')"
PROJECT_END="$(req GET /api/projects | jq -r --argjson id "$PROJECT_ID" '.[] | select(.id==$id) | .endDate')"
assert "project trigger persisted"    "missing_support" "$PROJECT_TRIGGER"
assert "project start_date persisted" "2026-05-01"      "$PROJECT_START"
assert "project end_date persisted"   "2026-06-01"      "$PROJECT_END"

# ============================================================
# 5. Responsibility ↔ Role link
# ============================================================
hr; say "[5] Linking responsibility to role"
RR_LINK_ID="$(req POST "/api/responsibilities/$RESP_ID/roles" \
  "$(jq -n --argjson r "$ROLE_ID" '{roleId:$r}')" | jq -r '.id')"
assert "link responsibility-role" "1" "$([[ "$RR_LINK_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

RR_COUNT="$(req GET "/api/responsibilities/$RESP_ID/roles" | jq 'length')"
assert "responsibility-role list count=1" "1" "$RR_COUNT"

# ============================================================
# 6. Responsibility ↔ Support links (5 categories)
# ============================================================
hr; say "[6] Linking responsibility to all 5 support categories"

declare -A LINK_IDS
for pair in "people:personId:$PERSON_ID" "places:placeId:$PLACE_ID" \
            "things:thingId:$THING_ID" "providers:providerId:$PROVIDER_ID" \
            "conditions:conditionId:$CONDITION_ID"; do
  IFS=":" read -r TYPE FK_FIELD FK_ID <<<"$pair"
  LINK_BODY="$(jq -n --arg f "$FK_FIELD" --argjson v "$FK_ID" \
    '{($f): $v, relationshipType:"primary", importance:"critical"}')"
  LINK_RES="$(req POST "/api/responsibilities/$RESP_ID/support/$TYPE" "$LINK_BODY")"
  LINK_ID="$(printf '%s' "$LINK_RES" | jq -r '.id')"
  LINK_IDS[$TYPE]="$LINK_ID"
  assert "link resp→$TYPE created"            "1"        "$([[ "$LINK_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"
  assert "link resp→$TYPE relationshipType"   "primary"  "$(printf '%s' "$LINK_RES" | jq -r '.relationshipType')"
  assert "link resp→$TYPE importance"         "critical" "$(printf '%s' "$LINK_RES" | jq -r '.importance')"
done

# Update relationship_type + importance on the people link
PEOPLE_LINK_ID="${LINK_IDS[people]}"
UPDATED="$(req PATCH "/api/responsibilities/$RESP_ID/support/people/$PEOPLE_LINK_ID" \
  '{"relationshipType":"secondary","importance":"helpful"}')"
assert "patch people link relationshipType" "secondary" "$(printf '%s' "$UPDATED" | jq -r '.relationshipType')"
assert "patch people link importance"       "helpful"   "$(printf '%s' "$UPDATED" | jq -r '.importance')"

# Bad relationship_type rejected
BAD_REL_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PATCH "$BASE/api/responsibilities/$RESP_ID/support/people/$PEOPLE_LINK_ID" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" -d '{"relationshipType":"bogus"}')"
assert "invalid relationshipType rejected (400)" "400" "$BAD_REL_CODE"

# Get list, expect 1 link for each category
for TYPE in people places things providers conditions; do
  COUNT="$(req GET "/api/responsibilities/$RESP_ID/support/$TYPE" | jq 'length')"
  assert "list resp→$TYPE count=1" "1" "$COUNT"
done

# ============================================================
# 7. Project ↔ Responsibility link
# ============================================================
hr; say "[7] Linking project to responsibility"
PR_LINK_ID="$(req POST "/api/projects/$PROJECT_ID/responsibilities" \
  "$(jq -n --argjson r "$RESP_ID" '{responsibilityId:$r,isPrimary:true}')" | jq -r '.id')"
assert "link project-responsibility" "1" "$([[ "$PR_LINK_ID" =~ ^[0-9]+$ ]] && echo 1 || echo 0)"

PR_PRIMARY="$(req GET "/api/projects/$PROJECT_ID/responsibilities" \
  | jq -r --argjson id "$PR_LINK_ID" '.[] | select(.id==$id) | .isPrimary')"
assert "project-responsibility isPrimary=1" "1" "$PR_PRIMARY"

# ============================================================
# 8. Cleanup unlinks
# ============================================================
hr; say "[8] Unlinking everything"
req DELETE "/api/projects/$PROJECT_ID/responsibilities/$PR_LINK_ID" >/dev/null
PR_LIST_AFTER="$(req GET "/api/projects/$PROJECT_ID/responsibilities" | jq 'length')"
assert "project-responsibility deleted" "0" "$PR_LIST_AFTER"

for TYPE in people places things providers conditions; do
  req DELETE "/api/responsibilities/$RESP_ID/support/$TYPE/${LINK_IDS[$TYPE]}" >/dev/null
  COUNT="$(req GET "/api/responsibilities/$RESP_ID/support/$TYPE" | jq 'length')"
  assert "resp→$TYPE link deleted" "0" "$COUNT"
done

req DELETE "/api/responsibilities/$RESP_ID/roles/$RR_LINK_ID" >/dev/null
RR_AFTER="$(req GET "/api/responsibilities/$RESP_ID/roles" | jq 'length')"
assert "responsibility-role deleted" "0" "$RR_AFTER"

# ============================================================
# Summary
# ============================================================
hr
say "Phase 1 verify summary:  PASS=$PASS  FAIL=$FAIL"
if (( FAIL > 0 )); then
  hr
  say "Failures:"
  for f in "${FAILURES[@]}"; do say "  - $f"; done
  exit 1
fi
say "ALL CHECKS PASSED"
exit 0
