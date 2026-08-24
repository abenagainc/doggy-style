#!/usr/bin/env bash
# Debug the digest send: call the function with verbose output and show Resend's error.
set -euo pipefail
cd "$(dirname "$0")/.."

URL=$(grep '^VITE_SUPABASE_URL=' apps/web/.env.local | cut -d= -f2- | tr -d '[:space:]')
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '[:space:]')

echo "Calling edge function..."
curl -s -X POST "${URL}/functions/v1/notification-digest?debug=1" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json"
echo ""
