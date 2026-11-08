# Local test plan

> **Validate config with Zod 4** · `2026-11-08-validate-config-with-zod-4`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Expected |
| --- | --- | --- |
| 1 | `ConfigSchema.parse({})` | The same defaults as Zod 3, including `memory_path: "memory"` and `policy.gates: "soft"`. |
| 2 | `memory_path: false` | The sentence is `Expected string, received boolean`. |
| 3 | `team.yaml` with an extra key, a repeated space in a role key, and a float `wip` | `Unrecognized key(s) in object: '…'`, the string-length sentence, and `Expected integer, received float`. |
| 4 | A partial `by_work_type` | The models file parses. Missing work types are allowed. |
| 5 | `version: Infinity` and a `wip` past `Number.MAX_SAFE_INTEGER` | Both are rejected. The sentences are recorded in `zod-compat.test.ts`. |
| 6 | Workspace | `pnpm build`, `pnpm typecheck`, and `pnpm test` exit 0. |
