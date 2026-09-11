#!/usr/bin/env bash
# Idempotent Cloudflare provisioning for OrahDEX.
#
# Required env:
#   CF_API_TOKEN        API token with: Account.Cloudflare Pages (edit),
#                       Account.Hyperdrive (edit), Account Rules Lists (edit),
#                       Account Rules (edit), Zone.DNS (edit)
#   CF_ACCOUNT_ID       Cloudflare account id
# Optional env:
#   DOMAIN              Canonical domain (default: orahdex.app)
#   DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD  -> creates Hyperdrive configs
#                                                   if not already present
set -euo pipefail

DOMAIN="${DOMAIN:-orahdex.app}"
API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

for v in CF_API_TOKEN CF_ACCOUNT_ID; do
  if [ -z "${!v:-}" ]; then echo "Missing $v" >&2; exit 1; fi
done

jqq() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

# ---------------------------------------------------------------------------
# 1. Pages project (frontend)
# ---------------------------------------------------------------------------
echo "==> Pages project"
if curl -sf "${AUTH[@]}" "$API/accounts/${CF_ACCOUNT_ID}/pages/projects/orahdex-app" >/dev/null; then
  echo "    orahdex-app already exists"
else
  curl -sf "${AUTH[@]}" -X POST "$API/accounts/${CF_ACCOUNT_ID}/pages/projects"     -d '{"name":"orahdex-app","production_branch":"Main"}' >/dev/null
  echo "    created orahdex-app"
fi

# ---------------------------------------------------------------------------
# 2. Hyperdrive configs (only when origin credentials are provided)
# ---------------------------------------------------------------------------
if [ -n "${DB_HOST:-}" ]; then
  echo "==> Hyperdrive"
  for env in production staging; do
    name="orahdex-${env}"
    exists=$(curl -sf "${AUTH[@]}" "$API/accounts/${CF_ACCOUNT_ID}/hyperdrive/configs"       | jqq "'yes' if any(c['name']=='${name}' for c in d['result']) else 'no'")
    if [ "$exists" = "no" ]; then
      id=$(curl -sf "${AUTH[@]}" -X POST "$API/accounts/${CF_ACCOUNT_ID}/hyperdrive/configs"         -d "{"name":"${name}","origin":{"database":"${DB_NAME:-postgres}","host":"${DB_HOST}","port":${DB_PORT:-5432},"user":"${DB_USER}","password":"${DB_PASSWORD}","scheme":"postgres"},"caching":{"disabled":false}}"         | jqq "d['result']['id']")
      echo "    created ${name}  id=${id}  -> put this id into worker/wrangler.toml ([env.${env}.hyperdrive])"
    else
      echo "    ${name} already exists"
    fi
  done
fi

# ---------------------------------------------------------------------------
# 3. Bulk Redirect list: www -> apex, legacy domains -> apex
# ---------------------------------------------------------------------------
echo "==> Canonical-domain redirects"
LIST_NAME="orahdex-canonical-redirects"

list_id=$(curl -sf "${AUTH[@]}" "$API/accounts/${CF_ACCOUNT_ID}/rules/lists"   | jqq "next((l['id'] for l in d['result'] if l['name']=='${LIST_NAME}'), '')")

if [ -z "$list_id" ]; then
  list_id=$(curl -sf "${AUTH[@]}" -X POST "$API/accounts/${CF_ACCOUNT_ID}/rules/lists"     -d "{"name":"${LIST_NAME}","description":"Canonical domain redirects for OrahDEX","kind":"redirect"}"     | jqq "d['result']['id']")
  echo "    created redirect list ${list_id}"
fi

redirect_item() { # host status
  python3 - "$1" "$2" <<'PY'
import json,sys
host,status=sys.argv[1],sys.argv[2]
print(json.dumps({"redirect":{"source_url":f"{host}/*","target_url":f"https://${DOMAIN}/$1","status_code":status,"preserve_query_string":True,"include_subdomains":False,"subpath_matching":True}}))
PY
}

items=$(printf '%s
'   "$(redirect_item "www.${DOMAIN}" 301)"   "$(redirect_item "orahdex.com" 301)"   "$(redirect_item "www.orahdex.com" 301)"   "$(redirect_item "orahdex.org" 301)"   "$(redirect_item "www.orahdex.org" 301)"   "$(redirect_item "api.orahdex.com" 301)"   "$(redirect_item "api.orahdex.org" 301)")

curl -sf "${AUTH[@]}" -X PUT "$API/accounts/${CF_ACCOUNT_ID}/rules/lists/${list_id}/items"   -d "{"items":[$items]}" >/dev/null
echo "    redirect list populated (www + legacy domains -> ${DOMAIN}, api.* -> api.${DOMAIN} handled by worker custom domain)"

# Wire the list into the http_request_redirect phase (create or update ruleset).
ruleset_id=$(curl -sf "${AUTH[@]}" "$API/accounts/${CF_ACCOUNT_ID}/rulesets?phase=http_request_redirect"   | jqq "next((r['id'] for r in d['result'] if r['phase']=='http_request_redirect'), '')")

rule_body=$(python3 - "$LIST_NAME" <<'PY'
import json,sys
print(json.dumps({"description":"OrahDEX canonical redirects","expression":f"http.request.full_uri in ${sys.argv[1]}","action":"redirect","action_parameters":{"from_list":{"name":"$"+sys.argv[1]}}}))
PY
)

if [ -z "$ruleset_id" ]; then
  curl -sf "${AUTH[@]}" -X POST "$API/accounts/${CF_ACCOUNT_ID}/rulesets"     -d "{"name":"orahdex redirects","description":"Canonical domain redirects","kind":"root","phase":"http_request_redirect","rules":[${rule_body}]}" >/dev/null
  echo "    redirect ruleset created"
else
  rule_id=$(curl -sf "${AUTH[@]}" "$API/accounts/${CF_ACCOUNT_ID}/rulesets/${ruleset_id}"     | jqq "next((r['id'] for r in d['result']['rules'] if r['description']=='OrahDEX canonical redirects'), '')")
  if [ -z "$rule_id" ]; then
    curl -sf "${AUTH[@]}" -X POST "$API/accounts/${CF_ACCOUNT_ID}/rulesets/${ruleset_id}/rules"       -d "${rule_body}" >/dev/null
  else
    curl -sf "${AUTH[@]}" -X PATCH "$API/accounts/${CF_ACCOUNT_ID}/rulesets/${ruleset_id}/rules/${rule_id}"       -d "${rule_body}" >/dev/null
  fi
  echo "    redirect ruleset updated"
fi

echo "Done. Next: follow DEPLOY.md steps 4-7."
