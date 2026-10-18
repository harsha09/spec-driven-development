# Tasks

> **Issue #22: search S1 keyword index and token budgets** · `2026-10-17-issue-22-search-s1-keyword-index-and-token-budgets`

## Breakdown

- [x] Add `better-sqlite3@12.8.0`, `gpt-tokenizer@4.0.3`, `web-tree-sitter@0.27.1`, and `ignore@7.0.12` to `packages/core` dependencies. Mark those four names `external` in `packages/core/tsup.config.ts`. Do not add `node:sqlite` and do not add the grammar npm packages.
- [x] Vendor the five WASM files named in `design.md` into `packages/core/vendor/tree-sitter/` and write `NOTICE` with package, version, SPDX `MIT`, and upstream URL for each. Resolve that directory from both `src/search/` (vitest) and `dist/index.js` (tsup), the same candidate pattern as `defaultsRoot()`.
- [x] Add `packages/core/defaults/search.yaml` with the exact body in `design.md`. Add `defaultSearchYamlPath()`. Init copies it with `writeTextIfMissing` on first init and on `--force`, with no `sdd:generated` marker and no `.generated.json` entry.
- [x] Extend `.sdd/.gitignore` required lines to `handoff.md`, `active-context.md`, `index.db`, `index.db-journal`, `index.db-wal`, `index.db-shm`. Add `.sdd/index.db` to the tracked-path warning list. Update `init-force.test.ts` expected ignore text. Do not run `git rm`.
- [x] Implement `packages/core/src/search/` as named in `design.md`: config zod, exclusion (secrets, `isIgnoredPath`, `.sdd/**`, root and nested `.gitignore`, root `.sddignore`, `exclude`), tree-sitter code chunks, Markdown heading chunks, SQLite schema, per-file sha256 reindex, FTS5 query, `packHits`, and provider fallback. Export the public API from `packages/core/src/index.ts`.
- [x] `countTokens` uses `gpt-tokenizer/encoding/cl100k_base` only. FTS tokens are split with a character loop. Trailing-slash stripping uses a loop. No polynomial regex.
- [x] `index()` with no list rewrites only files whose raw-byte hash changed, plus adds and deletes. `index(["src/budget.ts"])` does not rewrite any other path. Persist `last_files_considered` and `last_files_reindexed` in `meta`. Use `PRAGMA journal_mode = DELETE`.
- [x] Remove the `chars / 4` cap and `markdown.slice` tail from `packages/core/src/code-context/formatter.ts`. Stop appending `…(truncated)`. Drop `## Structural notes` on the success path. `generateCodeContext` indexes, searches scope `code`, packs with an empty preamble, and ignores `deps.adapters` and `maxLinesPerSlice`. Keep the no-focus hard failure.
- [x] Append the retrieved-context markers from `design.md` in `buildAgentPrompt`. Thread optional `budget` through `writeAgentHandoff`. Do not edit `packages/core/src/report.ts` or the code-point estimate.
- [x] Add `sdd search` in `packages/cli/src/search-cmd.ts` and register it. It must not call `launchConfiguredAgent` or `writeAgentHandoff`. Add `--budget` to `sdd context` and `sdd agent` only. `--max-tokens` remains an alias; `--budget` wins when both are set. Error sentences are exactly the ones in `design.md`.
- [x] Update the existing context tests that assume a 3-line slice, a Python `unsupported_language` gap, or the mock adapter winning. Add the fixture tests in `local-test-plan.md`.
- [x] Update `docs/reference/cli.md` and the opening of `docs/guides/code-context.md` as `design.md` specifies. Leave the `sdd report` code-point estimate paragraph in place.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Dependencies, tsup external, vendored WASM, NOTICE | Licenses; Alternatives considered |
| `search.yaml` write-if-missing | Config file |
| `.sdd/.gitignore` index lines | Gitignore; Safety |
| Search modules, schema, exclusions, chunkers | Index schema; Exclusions; Chunking |
| Per-file hash reindex | Feature per-file reindex; not #23 |
| Tokenizer and packer | Packing; pinned budgets 120, 105, 30, 19 |
| Context formatter | Context behavior; replaces `formatter.ts` slice |
| Handoff retrieved section | Handoff; stage budget; `sdd agent --budget` |
| CLI search / context / agent flags | CLI; search does not launch an agent |
| Fixture tests | `local-test-plan.md` cases 1–16 |
| Docs | Docs section; do not change the report estimate |
