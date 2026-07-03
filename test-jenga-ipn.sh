#!/usr/bin/env bash
# test-jenga-ipn.sh — smoke test for the Swyft /jenga/ipn endpoint.
set -uo pipefail

: "${IPN_URL:?set IPN_URL}"
: "${JENGA_IPN_USER:?set JENGA_IPN_USER}"
: "${JENGA_IPN_PASS:?set JENGA_IPN_PASS}"
ACCT="${ACCT:-102030404}"

AUTH="Basic $(printf '%s' "$JENGA_IPN_USER:$JENGA_IPN_PASS" | base64 | tr -d '\n')"
WRONG="Basic $(printf '%s' "wrong:creds" | base64 | tr -d '\n')"

GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'
pass=0; fail=0

payload() { # $1=ref $2=status $3=billNumber
  cat <<JSON
{"callbackType":"IPN",
 "customer":{"name":"Test Tenant","mobileNumber":"254712345678","reference":"cust-$1"},
 "transaction":{"date":"2026-06-19 14:15:20","reference":"$1","paymentMode":"MPESA",
   "amount":15000,"currency":"KES","billNumber":"$3","status":"$2","remarks":"00:Approved"},
 "bank":{"reference":"$1","transactionType":"C","account":null}}
JSON
}

check() { # $1=name $2=expected(2xx|401) $3=actual
  if { [ "$2" = "2xx" ] && [ "$3" -ge 200 ] && [ "$3" -lt 300 ]; } || [ "$2" = "$3" ]; then
    printf "%sPASS%s %-42s %s(HTTP %s)%s\n" "$GREEN" "$NC" "$1" "$DIM" "$3" "$NC"; pass=$((pass+1))
  else
    printf "%sFAIL%s %-42s %s(HTTP %s, expected %s)%s\n" "$RED" "$NC" "$1" "$DIM" "$3" "$2" "$NC"; fail=$((fail+1))
  fi
}

fire() { # $1=name $2=expected $3=auth(none|header) $4=body
  local code
  if [ "$3" = "none" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$IPN_URL" -H "Content-Type: application/json" --data "$4")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$IPN_URL" -H "Content-Type: application/json" -H "Authorization: $3" --data "$4")
  fi
  check "$1" "$2" "$code"
}

echo; echo "${BOLD}Jenga IPN smoke test${NC}"
echo "  endpoint : $IPN_URL"; echo "  account  : $ACCT"; echo

R_OK="OK-$(date +%s)-$RANDOM"; R_FAIL="FL-$(date +%s)-$RANDOM"
R_UNK="UNK-$(date +%s)-$RANDOM"; R_FORGE="FORGE-$(date +%s)-$RANDOM"; R_IDEM="IDEM-$(date +%s)"

fire "valid auth + SUCCESS accepted"          2xx "$AUTH"  "$(payload "$R_OK"   SUCCESS "$ACCT")"
fire "missing auth rejected"                  401 "none"   "$(payload "miss-$RANDOM" SUCCESS "$ACCT")"
fire "wrong auth rejected"                    401 "$WRONG" "$(payload "bad-$RANDOM"  SUCCESS "$ACCT")"
fire "FAILED status accepted"                 2xx "$AUTH"  "$(payload "$R_FAIL" FAILED "$ACCT")"
fire "unknown account accepted"               2xx "$AUTH"  "$(payload "$R_UNK"  SUCCESS "999999999")"
fire "forged ref accepted (expect review)"    2xx "$AUTH"  "$(payload "$R_FORGE" SUCCESS "$ACCT")"
fire "idempotency 1st send"                   2xx "$AUTH"  "$(payload "$R_IDEM" SUCCESS "$ACCT")"
fire "idempotency 2nd send (same ref)"        2xx "$AUTH"  "$(payload "$R_IDEM" SUCCESS "$ACCT")"

echo; echo "${BOLD}HTTP:${NC} ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}"; echo
echo "${BOLD}Check these in the Convex dashboard (payments table):${NC}"
echo "  • $R_OK    → routed (companyId set) if $ACCT is VERIFIED; unrouted if PENDING — the gating test"
echo "  • $R_FAIL  → recorded, NOT reconciled (FAILED)"
echo "  • $R_UNK   → recorded, companyId null (no source owns 999999999)"
echo "  • $R_FORGE → matchState needs_review, NOT auto-reconciled"
echo "  • $R_IDEM  → exactly ONE row, not two (idempotency)"
echo "  • $ACCT routed via transaction.billNumber though bank.account was null (field mapping)"
echo
[ "$fail" -eq 0 ] && exit 0 || exit 1
