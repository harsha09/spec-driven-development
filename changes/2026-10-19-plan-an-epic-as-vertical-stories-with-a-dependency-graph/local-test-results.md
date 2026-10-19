# Local test results

> **Plan an epic as vertical stories with a dependency graph** · `2026-10-19-plan-an-epic-as-vertical-stories-with-a-dependency-graph`

`pnpm lint` passed (132 files). `pnpm typecheck` passed. `pnpm test` passed: core 255, CLI 42.

| # | Result |
|---|--------|
| 1 | PASS. A second `S-001` exits 1 with `Story S-001 already exists.` |
| 2 | PASS. Archived completed `S-001` stays in wave 1 and satisfies `S-002`. |
| 3 | PASS. Cycle and unknown dependency use the spec sentences. |
| 4 | PASS. `sdd branch` for `S-002` exits 1 with `S-002 waits on S-001.` and does not create `story/issue-37/S-002`. |
| 5 | PASS. `sdd branch` checks out `story/issue-37/S-001` from `main` and keeps an untracked file. |
| 6 | PASS. A dirty tracked file exits 1 with `Working tree has uncommitted changes.` |
| 7 | PASS. Fake `gh` URL is saved. The body has no `Closes` until `--closes 44`. |
| 8 | PASS. The existing greenfield test still lists and starts `F-001`. |

---

## Latest run (2026-10-19T11:20:29.850Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="f105a3fa037ce16571d2ec70c18ab8ddcfa09207" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)

---

## Latest run (2026-10-19T11:46:07.545Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="f105a3fa037ce16571d2ec70c18ab8ddcfa09207" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
