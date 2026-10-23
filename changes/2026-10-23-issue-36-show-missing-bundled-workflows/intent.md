# Intent

> **Issue #36: show missing bundled workflows and adopt matching files** · `2026-10-23-issue-36-show-missing-bundled-workflows` · 2026-10-23

## Problem

An upgraded `sdd` ships workflows the project does not have. `sdd workflows` lists only the files under `.sdd/workflows/`. `sdd new -w feature` then says the workflow is not available and does not say that this CLI ships it, or that `sdd init --here --force` copies it.

`sdd init --force` does copy a missing file. It does not record a file that is already there when `.sdd/.generated.json` has no hash for it, even when the bytes match the bundled file. A later `--force` can never refresh that file.

## Decision

1. `sdd workflows` keeps listing the project workflows. When the CLI ships names that are not in the project, it adds one line: `Not copied yet: <names>. Run sdd init --here --force to copy new defaults.`
2. `sdd new -w <name>` keeps refusing a name that is not in the project. When that name is bundled, the error still starts with `Workflow "<name>" is not available. Available: <project names>.` and then says `This CLI ships <name>. Run sdd init --here --force to copy new defaults.`
3. On init, a workflow or template with no manifest hash whose bytes match the bundled file (line endings aside) is recorded as generated. The file is not rewritten when the bytes are already the same. A later `--force` can refresh it. A file that differs stays kept and gets no hash.
4. Non-interactive `sdd init` without `--force` still does not copy workflows or rewrite config.

## Out of scope

- Loading a bundled workflow that was never copied into the project.
- Rewriting an unmarked file that differs from the current bundle.
- Changing prices, search config, or memory files.
