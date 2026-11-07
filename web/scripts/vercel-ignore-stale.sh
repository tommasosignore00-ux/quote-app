#!/bin/bash
# Vercel "Ignored Build Step": exit 0 skips the build, exit 1 builds.
#
# GitHub sometimes delivers push events late: an older commit could then be built
# after a newer one and replace it in production. Production builds therefore run
# only for the commit that is currently the tip of the branch. When anything cannot
# be checked (CLI deploy, no git, fetch error) the build goes ahead.

if [ "$VERCEL_ENV" != "production" ] || [ -z "$VERCEL_GIT_COMMIT_SHA" ] || [ -z "$VERCEL_GIT_COMMIT_REF" ]; then
  exit 1
fi

# Vercel clones shallow: keep it shallow there, but never truncate a full clone.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  FETCH_DEPTH="--depth=1"
else
  FETCH_DEPTH=""
fi

if ! git fetch $FETCH_DEPTH origin "$VERCEL_GIT_COMMIT_REF" >/dev/null 2>&1; then
  echo "Could not check the branch tip, building."
  exit 1
fi

LATEST="$(git rev-parse FETCH_HEAD 2>/dev/null)"
if [ -z "$LATEST" ] || [ "$LATEST" = "$VERCEL_GIT_COMMIT_SHA" ]; then
  exit 1
fi

echo "Skipping stale commit $VERCEL_GIT_COMMIT_SHA: $VERCEL_GIT_COMMIT_REF is already at $LATEST."
exit 0
