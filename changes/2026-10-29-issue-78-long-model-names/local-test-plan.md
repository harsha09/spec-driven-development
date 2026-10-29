# Local test plan

> **Issue 78 long model names** · `2026-10-29-issue-78-long-model-names`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

QA proposes these checks. They are not a recorded QA result. The person has not signed them.

| # | Check | Expected |
|---|--------|----------|
| 1 | Long id load and team check | `model` set to `hf.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M` loads. `loadModels` returns config version 1 with `models.nearby.model` equal to that id. `initTeam` for the software template exits 0. `checkTeam` exits 0 and prints `Team config is valid.` It does not report `models.yaml has a secret value.` |
| 2 | PEM and `TOKEN=` in the `model` field | `model: -----BEGIN FAKE-----` and `model: TOKEN=abcdEFGH-0123456789abcdef0123456789` each make `loadModels` return exactly `{ error: "models.yaml has a secret value." }`. The error does not include `BEGIN` or the token. |
| 3 | Existing `command_env` locks | On a `command_env` value, `-----BEGIN FAKE-----`, `TOKEN=<token>`, and the bare token `abcdEFGH-0123456789abcdef0123456789` each still return that error and do not include the value. |
| 4 | `qwen2.5:7b` | The fixture id still loads as config version 1. |
| 5 | 31-character allow | `abcdefghijklmnopqrstuvwxyz01234` on a field other than `model` still loads as config version 1. |
| 6 | Vitest file `packages/core/src/__tests__/role-models.test.ts` | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/role-models.test.ts` exits 0. |
| 7 | Core `tsc --noEmit` | `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit` exits 0. |
| 8 | `sdd verify` (`pnpm test`) | Workspace tests exit 0. The `EBADENGINE` warning is expected and is not a failure. |
