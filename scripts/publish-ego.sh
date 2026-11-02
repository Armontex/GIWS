#!/usr/bin/env bash
# Uploads an extension archive to extensions.gnome.org through the API that
# `gnome-extensions upload` uses: the login returns a token, and the upload
# confirms the two statements of the site's upload form. Review on the site
# still decides when the version reaches users.
#
# Usage: EGO_USERNAME=… EGO_PASSWORD=… scripts/publish-ego.sh ARCHIVE
set -euo pipefail

archive="$1"
if [[ -z "${EGO_USERNAME:-}" || -z "${EGO_PASSWORD:-}" ]]; then
  echo "::warning::EGO_USERNAME or EGO_PASSWORD is not set; upload $archive to extensions.gnome.org by hand"
  exit 0
fi

umask 077
# The password goes through stdin and the token through a file, so neither
# shows up in the process list.
if ! login="$(jq -n --arg login "$EGO_USERNAME" --arg password "$EGO_PASSWORD" \
    '{login: $login, password: $password}' \
  | curl -sS --fail-with-body -X POST \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    --data @- https://extensions.gnome.org/api/v1/accounts/login/)"; then
  echo "::error::extensions.gnome.org refused the login: $(jq -r '.detail // .' <<< "$login" 2>/dev/null)"
  exit 1
fi
token="$(jq -r '.token.token // empty' <<< "$login")"
if [[ -z "$token" ]]; then
  echo "::error::extensions.gnome.org returned no token: $(jq -r '.token.error // .detail // "unknown reason"' <<< "$login")"
  exit 1
fi
echo "::add-mask::$token"
auth="$(mktemp)"
response="$(mktemp)"
trap 'rm -f "$auth" "$response"' EXIT
printf 'Authorization: Token %s\n' "$token" > "$auth"

status="$(curl -sS -o "$response" -w '%{http_code}' -X POST \
  -H @"$auth" -H 'Accept: application/json' \
  -F "source=@$archive" \
  -F shell_license_compliant=true \
  -F tos_compliant=true \
  https://extensions.gnome.org/api/v1/extensions)"
if [[ "$status" != 201 ]]; then
  echo "::error::extensions.gnome.org refused the upload with HTTP $status"
  cat "$response"
  exit 1
fi
echo "Uploaded $archive to extensions.gnome.org; the version now waits for review."
