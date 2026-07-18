#!/usr/bin/env bash
# Publish @structured-vibe/core then @structured-vibe/cli from package dirs.
# Fails hard if pnpm skips or registry does not show the new version.
set -euo pipefail

TAG="${1:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${NODE_AUTH_TOKEN:-}${NPM_TOKEN:-}" ]; then
  echo "::error::NODE_AUTH_TOKEN or NPM_TOKEN must be set for publish"
  exit 1
fi

# Prefer NODE_AUTH_TOKEN for npm
export NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$NPM_TOKEN}"

node scripts/ensure-unpublished-version.mjs
VERSION="$(node -e "process.stdout.write(require('./packages/core/package.json').version)")"
echo "========================================"
echo "Publishing version ${VERSION} (tag=${TAG})"
echo "========================================"

# Ensure .npmrc exists for this shell (CI also writes one)
if [ ! -f .npmrc ]; then
  echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > .npmrc
  echo "always-auth=true" >> .npmrc
fi
# Package dirs need auth too when publishing from subdirectory
cp .npmrc packages/core/.npmrc
cp .npmrc packages/cli/.npmrc

publish_pkg() {
  local dir="$1"
  local name="$2"
  echo ""
  echo ">>> Publishing ${name}@${VERSION} from ${dir}"
  local log
  log="$(mktemp)"

  # Publish from the package directory so pnpm treats it as a single package
  set +e
  (
    cd "$dir"
    # --no-git-checks: CI tree may be dirty after version bump
    pnpm publish --access public --no-git-checks --tag "$TAG"
  ) >"$log" 2>&1
  local code=$?
  set -e
  cat "$log"

  if [ "$code" -ne 0 ]; then
    echo "::error::pnpm publish failed for ${name} (exit ${code})"
    rm -f "$log" packages/core/.npmrc packages/cli/.npmrc
    exit "$code"
  fi

  if grep -qi "no new packages that should be published" "$log"; then
    echo "::error::pnpm skipped ${name}@${VERSION}. Is this version already on npm?"
    rm -f "$log" packages/core/.npmrc packages/cli/.npmrc
    exit 1
  fi

  # Verify registry actually has the version (eventual consistency: retry)
  local ok=0
  for i in 1 2 3 4 5 6; do
    if npm view "${name}@${VERSION}" version 2>/dev/null | grep -q "${VERSION}"; then
      ok=1
      break
    fi
    echo "Waiting for registry to show ${name}@${VERSION} (attempt ${i})..."
    sleep 5
  done
  if [ "$ok" -ne 1 ]; then
    echo "::error::Published ${name} but npm view ${name}@${VERSION} failed. Check npm access for scope @structured-vibe."
    rm -f "$log" packages/core/.npmrc packages/cli/.npmrc
    exit 1
  fi

  echo "OK: ${name}@${VERSION} is on npm"
  rm -f "$log"
}

publish_pkg "packages/core" "@structured-vibe/core"
publish_pkg "packages/cli" "@structured-vibe/cli"

rm -f packages/core/.npmrc packages/cli/.npmrc

echo ""
echo "Done."
echo "  npm i -g @structured-vibe/cli@${VERSION}"
