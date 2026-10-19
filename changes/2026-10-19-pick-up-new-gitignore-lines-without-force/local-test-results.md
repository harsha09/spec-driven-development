# Local test results

> **Pick up new gitignore lines without --force** · `2026-10-19-pick-up-new-gitignore-lines-without-force`

| # | Result |
|---|--------|
| 1 | PASS. `init-force.test.ts` appends `role-runs/` after `extra` and leaves config and `feature.yaml` unchanged. A second call keeps the same ignore bytes. |
| 2 | PASS. Custom `changes_path: .sdd/changes` gains `.active` under `extra`. Config stays edited. Default `changes/.gitignore` stays `.active`. |
| 3 | PASS. CLI test `re-running init --no-agent adds missing ignore lines and leaves config alone (#45)` passed inside `pnpm test`. |
| 4 | PASS. `pnpm test` includes `init --force preserves custom config paths and lists edited workflows/templates (#15)` and it passed. |
| 5 | Waived. The decline branch still calls `p.cancel` and `process.exit(0)` before any write. This story did not edit that branch, and there is no TTY harness. |
| 6 | PASS. `sdd verify --no-agent` ran `pnpm test` and exited 0. |

---

## Latest run (2026-10-19T12:14:39.495Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="03f7da8dc931bd299bcf6aab4968782a7e1731ec" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
