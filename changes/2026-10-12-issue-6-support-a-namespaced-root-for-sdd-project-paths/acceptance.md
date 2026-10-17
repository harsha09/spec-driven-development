# Acceptance

> **Issue #6: support a namespaced root for SDD project paths** · `2026-10-12-issue-6-support-a-namespaced-root-for-sdd-project-paths`

## Cases

| # | Scenario | Expected (local) |
|---|----------|------------------|
| 1 | Namespaced init | Run `sdd init --here --root .sdd --no-agent` | Config stores all four paths under `.sdd/`; folders and gitkeep files are created there, not at repo root |
| 2 | Brownfield memory | Seed `memory/PRD.md`, run default init | PRD remains byte-identical and init reports that existing non-SDD memory content is present |
| 3 | Invalid root | Pass absolute, parent-traversal, or empty root values | Init rejects unsafe paths before project folders/config are written |
| 4 | Runtime lifecycle | With namespaced paths, create and advance a change | `sdd new`, `status`, and `next` use configured change paths correctly |
| 5 | Compatibility | Run init without `--root` in an empty repo | Existing root-level path defaults remain unchanged |

## Explicitly not testing

- Automatic migration of existing memory/change/domain/archive directories.
- Custom path selection after initialization; users may continue editing `.sdd/config.yaml` manually.
