#!/usr/bin/env bash
# Blocks commits and CI runs that contain credentials.
#   scan-secrets.sh          check the lines added in the staged diff
#   scan-secrets.sh --all    check every tracked file
# Matches are reported by file only, so the secret never reaches logs.
set -euo pipefail

PATTERN='eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|rk_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9+/]{16,}|sk-(proj-)?[A-Za-z0-9_-]{32,}|\bre_[A-Za-z0-9]{8}_[A-Za-z0-9_]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sbp_[a-f0-9]{32,}'
SELF='scripts/scan-secrets.sh'
found=0

if [[ "${1:-}" == "--all" ]]; then
  while IFS= read -r file; do
    if git grep -qIE "$PATTERN" -- "$file"; then
      echo "Possible secret in: $file" >&2
      found=1
    fi
  done < <(git ls-files | grep -v -x -F "$SELF")
else
  while IFS= read -r file; do
    [[ "$file" == "$SELF" ]] && continue
    if git diff --cached -U0 --no-color -- "$file" | grep -E '^\+' | grep -v -E '^\+\+\+' | grep -qE "$PATTERN"; then
      echo "Possible secret in staged changes: $file" >&2
      found=1
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)
fi

if [[ $found -ne 0 ]]; then
  echo "Remove the secret and load it from an environment variable." >&2
  exit 1
fi
