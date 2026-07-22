#!/usr/bin/env bash
# CLI smoke: init → new hotfix → fill intent → next → next → complete (in place).
# Used by CI and release workflows so substantive-artifact gates stay green.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDD="${SDD:-$ROOT/packages/cli/dist/index.js}"
if [[ ! -f "$SDD" ]]; then
  echo "CLI not built: $SDD" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export SDD_NO_AGENT=1
cd "$WORK"

node "$SDD" init --here --ai copilot
node "$SDD" new "CI smoke hotfix typo" -w hotfix -y --no-agent

CHANGE_DIR="$(find changes -mindepth 1 -maxdepth 1 -type d | head -1)"
if [[ -z "$CHANGE_DIR" || ! -f "$CHANGE_DIR/meta.yaml" ]]; then
  echo "No change pack created under changes/" >&2
  exit 1
fi

# Substantive intent — empty templates fail sdd next (TS/CI parity)
cat >"$CHANGE_DIR/intent.md" <<'EOF'
# Intent

CI smoke: prove hotfix lifecycle advances with real intent content, not an empty template.
Success: next reaches local_verify and complete leaves the pack under changes/.
EOF

node "$SDD" next --no-agent   # intent → implement
node "$SDD" next --no-agent   # implement → local_verify

cat >"$CHANGE_DIR/local-test-results.md" <<'EOF'
# Results

Smoke-checked on CI: stages advanced and complete works with default complete-in-place settings.
EOF

node "$SDD" complete --no-agent

ID="$(basename "$CHANGE_DIR")"
test -d "changes/$ID"
grep -q 'status: completed' "changes/$ID/meta.yaml"
if [[ -d "archive/$ID" ]]; then
  echo "Unexpected: change was archived (defaults should keep packs under changes/)" >&2
  exit 1
fi

echo "CLI smoke OK"
