# Local test results

> **Issue 62 model selection** · `2026-10-23-issue-62-model-selection`

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected.

| # | Result |
|---|--------|
| 1 | PASS. `role-decide`, `role-models`, `report`, `metrics`, `router`, `role`, and `team`: 63 tests, 7 files, exit 0. After the extra assertions, `role-decide`, `role-models`, and `report`: 22 tests, 3 files, exit 0. No models file does not spawn. A rules decider asks the human and writes no decision row. |
| 2 | PASS. A rule, one owner, the skill `implement one change pack`, a stage owner, and two owners do not spawn. A confident 0.8 pick prints the role once. 0.69 calls the strong model once. A still-low strong reply asks the human. |
| 3 | PASS. Precedence is bot, then stage, then role, then the work-type default. PEM, `TOKEN=…`, and the 35-character token are rejected and not printed. A 31-character value passes. A secret in `developer.md` leaves `sdd team check` at exit 0. A `models:` key on `team.yaml` is `team.yaml is invalid`. A missing `command_env` fails the schema. |
| 4 | PASS. Injected Ollama `fetch` hits `http://127.0.0.1:9/api/chat`, stores model `qwen2.5:7b` and 11 input tokens, and does not fetch when the host is unset. An invalid body calls strong once. |
| 5 | PASS. The report keeps `source  phase  provider  model  requests` and the `3.0000` / `252.00` request row. `Decisions:` appears for a non-empty array and not for `[]`. The session import keeps the decision row. The metrics JSON has no `usd`. |
| 6 | PASS. Omitted deps ignore `process.env`. Sum `1.01` stays. Sum `1.02` and `1.5`, an omitted option, and a pick outside the options escalate. No minimum keeps `0.01` and does not call strong for an invalid reply. |
| 7 | PASS. CLI `models.integration` and `role.integration`: 5 tests, 2 files, exit 0. `sdd models which` prints the draft line. A secret is rejected and not printed. Route without a file asks the human. Route with a decide script prints `role developer`. `sdd role run` still prints `hello builder`. Unset `SDD_ROLE_MODEL` is covered by `role.test.ts` and `role.integration.test.ts`. |
| 8 | PASS. Core `tsc --noEmit` exit 0. CLI `tsc --noEmit` exit 0 after the core build. `biome check` on the edited sources exit 0. |
| 9 | PASS. `sdd verify` ran `pnpm test` and recorded exit 0. |

QA proposes this result. The person has not recorded it. A role does not accept the spec. Epic #58 stays open. Issues #63, #65, and #66 are not started. The research assistant stays a local role and is not in this change.

The stamp below is the verify run. It records the git HEAD before this change is committed.

---

## Latest run (2026-10-23T12:58:07.782Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="b11dfd5377ed51868fba6f3d00df89959f20b011" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
