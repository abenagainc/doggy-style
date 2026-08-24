#!/usr/bin/env bash
# Test the notification-digest edge function with a properly extracted anon key.
set -euo pipefail
cd "$(dirname "$0")/.."

URL=$(grep '^VITE_SUPABASE_URL=' apps/web/.env.local | cut -d= -f2- | tr -d '[:space:]')
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '[:space:]')

echo "URL: $URL"
echo "Key length: ${#KEY}"

curl -s -X POST "${URL}/functions/v1/notification-digest" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json"
