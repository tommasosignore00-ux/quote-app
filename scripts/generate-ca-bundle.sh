#!/usr/bin/env bash
set -euo pipefail

# generate-ca-bundle.sh
# Fetch certificate chains for given hosts and concatenate them into a PEM bundle
# Usage: ./scripts/generate-ca-bundle.sh output.pem host1 host2 ...

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 output.pem host1 [host2 ...]" >&2
  exit 2
fi

OUT="$1"
shift
mkdir -p "$(dirname "$OUT")"
>"$OUT"

for host in "$@"; do
  echo "Fetching cert chain from $host..."
  # Use openssl s_client to get the certs; extract PEM blocks
  certs=$(openssl s_client -showcerts -servername "$host" -connect "$host:443" </dev/null 2>/dev/null || true)
  if [[ -z "$certs" ]]; then
    echo "Warning: failed to fetch certs for $host" >&2
    continue
  fi
  echo "$certs" | awk 'BEGIN{found=0}/-----BEGIN CERT/{found=1} found{print} /-----END CERT/{if(found){print; found=0}}' >>"$OUT"
done

echo "Wrote CA bundle to $OUT"
