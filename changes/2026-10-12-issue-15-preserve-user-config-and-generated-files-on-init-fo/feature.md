# Feature

> **Issue #15: preserve user config and generated files on init --force** · `2026-10-12-issue-15-preserve-user-config-and-generated-files-on-init-fo` · 2026-10-12

## Problem / opportunity

`sdd init --force` resets `.sdd/config.yaml` to bare defaults and overwrites customized workflow/template files. Users run it while upgrading and can lose path settings, gates, and team prompts without warning.

## Users & value

Teams maintaining project-specific SDD paths, workflows, and templates need upgrades to add new defaults without discarding their existing configuration or local edits.

## Scope

- On force init, merge defaults with the existing parsed config so current user values win, including nested `per_change`, `persistence`, and `policy` settings.
- Track the last SDD-generated contents for workflow/template files in a manifest under `.sdd/`.
- Refresh a tracked file only when its current content still matches the prior generated hash; retain and report files changed by users.
- Treat files without a manifest entry as user-owned and never overwrite them.
- Test custom `*_path` values, edited workflows/templates, unedited default refresh, missing manifest entries, and non-force behavior.

## Non-goals

- Do not add markers inside templates or workflow YAML that would leak into change artifacts.
- Do not modify stable memory files or agent-file ownership behavior.

## Success criteria

- `sdd init --here --force` preserves all supported existing config values while adding new default keys.
- An edited workflow/template remains byte-identical and is listed as kept; an unedited generated file refreshes to the new default and updates the manifest hash.
- Existing workflow/template files with no manifest entry are kept as user-owned.
- Focused core and CLI tests cover nested config preservation, file hashes, reporting, and legacy projects without a manifest.

## Risks / open questions

- A malformed manifest must not authorize overwriting user files; fail safely or treat unknown entries as user-owned.
- Legacy files created before the manifest existed must remain untouched on the first forced upgrade.
- The config merge must preserve user values without retaining unsupported malformed keys that would fail the runtime schema.
