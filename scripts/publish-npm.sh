#!/usr/bin/env bash
# Publish @structured-vibe-coding/core then @structured-vibe-coding/cli from package dirs.
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

# Quick auth diagnostic (helps when publish fails with 404/403)
echo "npm whoami (auth check):"
npm whoami 2>&1 || echo "(npm whoami failed — token may be invalid or lack scope access)"

# Ensure .npmrc exists for this shell (CI also writes one)
if [ ! -f .npmrc ]; then
  echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > .npmrc
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
    if grep -qiE "(404|not found|permission|access|403|unauthorized|E404)" "$log"; then
      cat <<'EOM' >&2
::error::Publish failed with a 404/403-style error from npm.
This usually means the NPM_TOKEN secret lacks permission to publish to the @structured-vibe-coding scope.

Common causes (2026+):
- Using a classic token that bypasses 2FA (npm is restricting these for direct publishing).
- The token does not have "Read and write" for Packages on the scoped packages.
- The token belongs to an account that is not an owner/maintainer of @structured-vibe-coding/*.

Fix:
1. On npmjs.com, create a new **Granular Access Token** (not a classic token).
   - Go to: https://www.npmjs.com/settings/<your-username>/tokens
   - Choose "Granular Access Token"
   - Packages → Read and Write
   - Limit to the @structured-vibe-coding packages you maintain, or "All packages you maintain".
2. Copy the token.
3. In GitHub: Settings → Secrets and variables → Actions → update the NPM_TOKEN secret.
4. Re-run the workflow.

See also: https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/
EOM
    fi
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
    echo "::error::Published ${name} but npm view ${name}@${VERSION} failed. Check npm access for scope @structured-vibe-coding."
    rm -f "$log" packages/core/.npmrc packages/cli/.npmrc
    exit 1
  fi

  echo "OK: ${name}@${VERSION} is on npm"
  rm -f "$log"
}

publish_pkg "packages/core" "@structured-vibe-coding/core"
publish_pkg "packages/cli" "@structured-vibe-coding/cli"

rm -f packages/core/.npmrc packages/cli/.npmrc

echo ""
echo "Done."
echo "  npm i -g @structured-vibe-coding/cli@${VERSION}"
