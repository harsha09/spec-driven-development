# Local test plan

> **Issue 62 model selection** · `2026-10-23-issue-62-model-selection`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

QA proposes these checks. They are not a recorded QA result. The person has not signed them.

| # | Check | Expected |
|---|--------|----------|
| 1 | No `models.yaml`. Reason call with `SDD_ROLE_MODEL`. Route with no match. | Reason uses that command and writes no decision row. Unset prints `No role model is configured.` and exits 1. Route prints `Ask the human.` and `No rule matched.` and does not spawn. |
| 2 | Rule, one owns phrase, skill `implement one change pack`, stage owner, two owners. Route set to a local decider. | None of them spawn. Two owners print `Two roles own this.` A no-rule take writes no inbox. |
| 3 | Command pick at 0.8 with minimum 0.7. Pick at 0.69. Strong reply also 0.69. | The 0.8 pick prints `role developer` once. 0.69 calls strong once in decide mode. A still-low strong reply asks the human. |
| 4 | `selectModel` and `sdd models which` with bot, stage, and role. | Bot beats stage, stage beats role, role beats the work-type default. Draft, design, code, and review default to strong. |
| 5 | `sdd team check` and `loadModels`. | A missing models file is valid. A PEM, a `TOKEN=` assignment, or a 35-character no-whitespace value fails and is not printed. A 31-character env-shaped value passes. A secret in a role file passes. A `models:` key on `team.yaml` fails as `team.yaml is invalid`. A missing `command_env` fails the schema. |
| 6 | Injected Ollama `fetch` to `http://127.0.0.1:9/api/chat`, model `qwen2.5:7b`. | A valid body is kept and stores `prompt_eval_count`. An invalid body calls strong once. An unset host does not call `fetch`. |
| 7 | Report and metrics. | The request header and the `3.0000` / `252.00` row stay. A second section appears only when `decisions` is non-empty. An empty array prints no second section. Command model is null. Ollama model is `qwen2.5:7b`. The file has no dollar fields. An old file and a session import keep or omit `decisions` as written. Rules write no row. |
| 8 | Omitted `routeRole` deps, probability edges, a pick outside the options. | Omitted deps ignore `process.env`. Sum `1.01` is kept. Sum `1.02` and `1.5` escalate. An omitted option escalates. No minimum keeps a valid `0.01` and does not escalate an invalid reply. |
| 9 | `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit`, CLI `tsc --noEmit` after the core build, and `biome check` on the edited sources. | Exit 0. |
| 10 | `sdd verify` | Workspace tests (`pnpm test`) exit 0. |

Explicitly not in this plan: a live Ollama server, a hosted System-One adapter, escalation, rooms, the evidence gate, model keys on `team.yaml` as a feature, decide mode in `docs/examples/role-model.mjs`, and host-stub length.
