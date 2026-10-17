# Design

> **Issue #15: preserve user config and generated files on init --force** · `2026-10-12-issue-15-preserve-user-config-and-generated-files-on-init-fo`

## Approach

Treat existing config as user-owned values overlaid on current defaults. Deep-merge plain objects recursively, replace arrays/scalars with the user's value, then validate the merged result with `ConfigSchema` before writing anything. This preserves supported nested settings while adding newly introduced defaults.

Track only SDD-copied workflow and template files in `.sdd/.generated.json` as `{ version: 1, files: { "relative/path": "sha256-of-last-SDD-body" } }`. No marker is inserted into YAML or Markdown. For each packaged default: create and record it when the destination is absent; on `--force`, refresh an existing file only when its current content hash matches the manifest's last-generated hash; otherwise preserve it and report `edited` or `not-generated`. Keep an edited file's prior generated hash so a later user revert can be recognized. Files absent from an old/missing manifest are user-owned and are never overwritten.

Load and validate both existing config and the manifest before the first write. A malformed config or manifest fails safely before modifying project files. Never remove stale/untracked workflow or template files as part of this refresh.

## Components / modules

- `packages/core/src/config.ts`: recursive defaults-over-user merge followed by existing Zod validation.
- `packages/core/src/generated.ts` or a focused generated-defaults helper: versioned manifest validation, recursive workflow/template reconciliation, and content-hash tracking using the existing `contentHash` helper.
- `packages/core/src/init.ts`: load preflight state before writes; persist merged config; replace overwrite-style `copyDir` for workflows/templates with manifest-aware reconciliation and return kept-file reasons.
- Core init tests: nested config/path preservation, edited and untracked files, refresh of untouched defaults using an injected source tree, malformed manifest fail-before-write, and compatibility with projects lacking a manifest.
- CLI init tests: `--force` continues to list preserved files and does not change non-force behavior.

## Data flow

1. `initProject` checks the existing config/manifest and validates them before writing anything.
2. The supported existing config is recursively merged over `defaultConfig()` and validated.
3. For each shipped workflow/template file, compare the destination body hash to the prior manifest entry.
4. Copy missing defaults and record their hashes; refresh only unchanged tracked files on force; preserve edited or untracked files and return them in `InitResult.kept`.
5. Write the updated config and manifest after reconciliation, retaining hashes for generated files that users have edited so their ownership remains recognizable.

## Alternatives considered

- Put generated markers into workflow YAML and template bodies: rejected because template markers leak into change artifacts and YAML comment markers complicate parsing.
- Blindly deep-merge the existing raw file without schema validation: rejected because malformed or unsupported values could be persisted as if valid configuration.
- Treat every pre-manifest file as SDD-generated because it matches a default today: rejected because byte equality does not prove ownership; legacy files remain user-owned unless a prior hash was recorded.
- Overwrite edited files but save them as `.new`: rejected for this fix because retaining and reporting the original is sufficient and avoids creating competing active configuration.

## Risks

- A malformed manifest must stop init before other writes; tests must lock this ordering.
- Hashes normalize CRLF to LF, matching the existing generated-file ownership helper.
- User-added config keys unknown to the current schema are not supported and will be stripped by schema parsing; document errors for invalid supported values.
- A manifest can become large as the workflow/template catalog grows, but it remains proportional to shipped files and is simple to inspect.
