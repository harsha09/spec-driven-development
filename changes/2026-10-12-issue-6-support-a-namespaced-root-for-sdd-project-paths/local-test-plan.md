# Local test plan

> **Issue #6: support a namespaced root for SDD project paths** · `2026-10-12-issue-6-support-a-namespaced-root-for-sdd-project-paths`

## Environment

 How to run locally: Node 20.19.3 and pnpm 9.15.0; use core temp-project tests and built CLI integration tests.
 Branch / flags / seed data: isolated projects; seed an existing `memory/PRD.md`; test `.sdd` as the selected project-data root.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Namespaced init | Initialize with `--root .sdd --no-agent` | All four config paths and folders use `.sdd/<path>`; root folders are absent |
| 2 | Lifecycle under custom paths | Create a hotfix change after namespaced init | Change pack is created under `.sdd/changes` |
| 3 | Existing memory | Seed `memory/PRD.md` and initialize with default paths | PRD is byte-identical and init emits the memory collision warning |
| 4 | Unsafe root | Try empty, absolute, and parent-traversal values | Init rejects before writing config or project folders |
| 5 | Compatibility | Initialize without `--root` | Existing root-level path defaults remain unchanged |

## Out of scope this change

 Moving existing project data or changing the paths of an already initialized project.
 Changing the default layout for existing or new installations without `--root`.
