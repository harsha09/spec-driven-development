# Local test results

> **Issue #37: role create, run, and the accuracy loop** · `2026-10-19-issue-37-role-create-run-and-the-accuracy-loop`

## Commands

`pnpm lint` passed (128 files). `pnpm typecheck` passed. `pnpm test` passed: core 33 files, 252 tests; CLI 4 files, 40 tests. Node v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

The role suite covers the slice 1 success criteria with a fake clock and a fake model port. The CLI suite creates a role, lists it, and runs it through a local `SDD_ROLE_MODEL` script. `sdd agents install --help` still describes one host.

## Cases

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | Empty job and illegal names write no role file. |
| 2 | PASS | Hidden roles stay off the default list. Duplicate does not copy conversation or memory. |
| 3 | PASS | Delete removes one role's file, conversation, memory, and allow key. |
| 4 | PASS | Self-review, X, and a missing accepted section call no model and write no run file. |
| 5 | PASS | A reading prints the draft and leaves `accepted.md` and `changes/.active` unchanged. |
| 6 | PASS | The loop stores check ids first, stops at three calls, and rejects a bad cite. |
| 7 | PASS | Allow once writes only a safe relative file. `not-accepted.md` is allowed. `accepted.md` is not. |
| 8 | PASS | Ask first beats an always-allow rule. Timeout 0 and a 10-minute expiry do not run. |
| 9 | PASS | Forbidden names are rejected. Commit, push, tag, pull request, merge, and deploy record unavailable. |
| 10 | PASS | Stop leaves the applied file in place. |
| 11 | PASS | CLI create, show, and run. Agents install help still says one host. |
| 12 | PASS | Init ignore text includes `role-runs/` and does not ignore `roles/`. |

No network call was made. Issue #37 stays open.

---

## Latest run (2026-10-19T07:20:55.046Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="050e0b768e8a77c372bcc0f4617855f448ff958b" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
