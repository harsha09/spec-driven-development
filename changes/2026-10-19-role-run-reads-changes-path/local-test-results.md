# Local test results

> **Role run reads changes_path** · `2026-10-19-role-run-reads-changes-path`

| # | Result |
|---|--------|
| 1 | PASS. The layout-root test calls the model once and prints `draft from layout`. |
| 2 | PASS. A missing section exits 1 with `This needs an accepted section before a draft.` and makes no model call. |
| 3 | PASS. `role.test.ts` 17 tests passed, including the repo-root cases. |
| 4 | PASS. `sdd verify` ran `pnpm test` and it exited 0. |

---

## Latest run (2026-10-19T12:03:36.217Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="cb20443d5b0c143f2175d53c56cbcbe4f643a977" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
