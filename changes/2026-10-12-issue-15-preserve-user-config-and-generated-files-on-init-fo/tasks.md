# Tasks

> **Issue #15: preserve user config and generated files on init --force** · `2026-10-12-issue-15-preserve-user-config-and-generated-files-on-init-fo`

## Breakdown

- [x] Add a recursive defaults-over-existing config merge with schema validation; test nested user settings, custom `*_path` values, new default keys, arrays, and malformed config.
- [x] Add a versioned `.sdd/.generated.json` manifest and recursive workflow/template reconciliation using normalized SHA-256 hashes; test new files, untouched refresh, edits, untracked files, and malformed manifest.
- [x] Integrate preflight and reconciliation into `initProject`; preserve legacy files without manifest entries, report edited/untracked files, and verify invalid input causes no partial writes.
- [x] Add CLI coverage for repeated `sdd init --force`, update any init reference docs, and confirm memory/agent ownership behavior remains unchanged.
- [x] Run focused core/CLI tests, `pnpm test`, typecheck, lint, build, and smoke; record outcomes in the local verification artifacts.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Config merge | Design: defaults overlaid by validated user values |
| Manifest reconciliation | Design: content-hash ownership for workflows/templates |
| Init integration | Design: fail-safe preflight and legacy compatibility |
| CLI/tests/docs | Issue #15 expected behavior and user-visible kept-file reporting |
| Local verification | Issue #15 success criteria and repository checks |
