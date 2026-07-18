#!/usr/bin/env bash
# Publish @structured-vibe/core then @structured-vibe/cli.
# Fails if pnpm skips ("no new packages") so CI does not silently succeed.
set -euo pipefail

TAG="${1:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/ensure-unpublished-version.mjs
VERSION="$(node -e "process.stdout.write(require('./packages/core/package.json').version)")"
echo "Publishing version ${VERSION} with tag ${TAG}"

publish_one() {
  local filter="$1"
  local log
  log="$(mktemp)"
  set +e
  pnpm --filter "$filter" publish --access public --no-git-checks --tag "$TAG" 2>&1 | tee "$log"
  local code=${PIPESTATUS[0]}
  set -e

  if grep -qi "no new packages that should be published" "$log"; then
    echo "::error::pnpm skipped publishing ${filter} (version likely already on npm). Ran ensure-unpublished-version first — check package private flags / auth."
    rm -f "$log"
    exit 1
  fi
  if grep -qiE "ENEEDAUTH|403|EPUBLISHCONFLICT|cannot publish" "$log"; then
    echo "::error::Publish failed for ${filter} (auth or conflict). See log above."
    rm -f "$log"
    exit 1
  fi
  if [ "$code" -ne 0 ]; then
    rm -f "$log"
    exit "$code"
  fi
  rm -f "$log"
  echo "Published ${filter}@${VERSION}"
}

publish_one "@structured-vibe/core"
publish_one "@structured-vibe/cli"

echo "Done. npm i -g @structured-vibe/cli@${VERSION}"
