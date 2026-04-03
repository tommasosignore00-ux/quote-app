#!/usr/bin/env bash
set -euo pipefail

# dev-start: export NODE_EXTRA_CA_CERTS if SUPABASE_CA_BUNDLE is set, then start web and mobile
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${SUPABASE_CA_BUNDLE:-}" ]]; then
  if [[ -f "$SUPABASE_CA_BUNDLE" ]]; then
    export NODE_EXTRA_CA_CERTS="$SUPABASE_CA_BUNDLE"
    echo "Using SUPABASE_CA_BUNDLE as NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS"
  else
    echo "SUPABASE_CA_BUNDLE is set but file does not exist: $SUPABASE_CA_BUNDLE" >&2
    exit 1
  fi
fi

if [[ ! -f "$ROOT_DIR/web/.env.local" ]]; then
  echo "Warning: missing $ROOT_DIR/web/.env.local. Web may start but API features can fail."
fi

if [[ ! -f "$ROOT_DIR/mobile/.env" ]]; then
  echo "Warning: missing $ROOT_DIR/mobile/.env. Mobile app may not connect to Supabase or local API."
fi

echo "Starting web and mobile dev servers..."

# Start web and mobile in background so logs interleave in the terminal.
WEB_PID=""
if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Web dev server already running on port 3000; skipping web startup."
else
  npm --prefix "$ROOT_DIR/web" run dev &
  WEB_PID=$!
fi

npm --prefix "$ROOT_DIR/mobile" run start &
MOBILE_PID=$!

echo "web PID=$WEB_PID mobile PID=$MOBILE_PID"

if [[ -n "$WEB_PID" ]]; then
  wait $WEB_PID
fi
wait $MOBILE_PID
