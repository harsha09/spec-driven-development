# Local test plan

> **Issue #15: preserve user config and generated files on init --force** · `2026-10-12-issue-15-preserve-user-config-and-generated-files-on-init-fo`

## Environment

- How to run locally: Node 20.19.3 and pnpm 9.15.0; use temporary initialized projects and the core/CLI commands listed in the results artifact.
- Branch / flags / seed data: no repository mutations beyond temporary project fixtures; seed custom nested config, edited workflow/template files, and legacy projects without `.generated.json`.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Config merge | Set custom memory/changes/domains/archive paths and nested per-change/persistence/policy settings; run force init | Existing supported values remain; newly introduced defaults are present |
| 2 | Edited defaults | Edit one shipped workflow and one template; run force init | Both files remain byte-identical and are listed as edited/kept |
| 3 | Untouched defaults | Leave tracked files unchanged, alter packaged-source fixture, run force reconciliation | Unchanged files refresh and manifest hashes update |
| 4 | Legacy no-manifest | Remove `.sdd/.generated.json` and run force init | Existing workflow/template files remain byte-identical and are reported as not generated |
| 5 | Invalid manifest/config | Seed malformed manifest/config and run force init | Command fails before config/workflow/template files change |
| 6 | CLI UX | Run `sdd init --force --no-agent` after customization | Safe behavior is described and kept files are printed |
| 7 | Existing safety | Run agent and memory preserve suites | Agent ownership and stable memory behavior do not regress |

## Out of scope this change

- Rewriting user-owned memory files or changing agent host ownership/marker semantics.
- Removing stale/untracked workflow or template files not present in current package defaults.
