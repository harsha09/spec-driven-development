# Design

> **Issue 62 model selection** · architect seams. A proposal. The person has not accepted the reading.

## Approach

Approach C from the brainstorm. Add model selection beside the router. `matchRoute` stays as it is. `routeRole` may call `decide` only after that function asks with the reason exactly `No rule matched.`, and only when `.sdd/models.yaml` loads. No file means today's ask text and no model spawn.

## Config

`.sdd/models.yaml` is the only config. `sdd team init` does not write it. `.sdd/models/` stays the embedding cache.

```yaml
version: 1
models:
  rules:  { kind: decide, provider: rules }
  local:  { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL, min_confidence: 0.7 }
  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }
  nearby: { kind: decide, provider: ollama, model: qwen2.5:7b, base_url_env: OLLAMA_HOST, min_confidence: 0.7 }
defaults:
  by_work_type:
    route: rules
    classify: local
    check: local
    draft: strong
    design: strong
    code: strong
    review: strong
  fallback_reason: strong
  fallback_decide: rules
overrides:
  bots:   { bob-dev: { code: strong } }
  stages: { pr_review: { review: strong } }
  roles:  { architect: { review: strong } }
```

There is no `command:` field, so a shell string is not stored. `command_env` and `base_url_env` are names only. The schema is strict. A missing file returns null. Ids in defaults and overrides must exist, and the model's `kind` must match the slot: decide for route, classify, and check; reason for draft, design, code, and review.

Precedence inside one work type is `overrides.bots[bot]`, then `overrides.stages[stage]`, then `overrides.roles[role]`, then `defaults.by_work_type`, then the fallback for that kind. A missing work-type key uses `fallback_decide` for route, classify, and check, and `fallback_reason` for the strong kinds.

## Seams

| Piece | Change |
|---|---|
| `packages/core/src/role/types.ts` | Add `WorkType` and `DecisionModel` beside `RoleModel` |
| `packages/core/src/role/models/schema.ts` | `ModelsConfigSchema`, `loadModels`, `checkModels`. Strict. Missing file returns null |
| `packages/core/src/role/models/select.ts` | `selectModel` is pure precedence and returns id, kind, provider, and why |
| `packages/core/src/role/models/decide.ts` | `decide`. Tests call it. The only production caller is `routeRole` |
| `packages/core/src/role/models/command.ts` | `modelFromEnv(env)` moves here. Reason stdin stays `{ roleId, prompt }`. Decide stdin is `{ mode: "decide", state, question, options }` |
| `packages/core/src/role/models/rules.ts` | `rulesDecision` returns `human` when that option is present. No role table |
| `packages/core/src/role/models/ollama.ts` | `ollamaDecision({ baseUrl, model, fetch })` only when `provider: ollama`. `POST {base}/api/chat`. No default URL |
| `packages/core/src/role/routing.ts` | `routeRole(root, input, deps?)`. After `matchRoute`, call `decide` only for ask plus `No rule matched.` when `loadModels` is non-null. Options are sorted role names plus `human` |
| `packages/core/src/role/index.ts` | Export the new functions and types |
| `packages/cli/src/role-cmd.ts` | `modelFromEnv(process.env)`. Pass `env` into `routeRole` |
| `packages/cli/src/models-cmd.ts` | `sdd models show` and `sdd models which`. Register `models` in `commands.ts` |
| `packages/core/src/role/team.ts` and `packages/cli/src/team-cmd.ts` | `checkTeam` reads the team, then `checkModels`. `sdd team check` |
| `packages/core/src/metrics.ts` | Optional `decisions` array and `recordDecisionMetric`. Do not edit `importSessionMetrics` |
| `packages/core/src/report.ts` | Second section when `decisions` is non-empty. Cost from `prices.yaml`. Header unchanged |

`routeRole` deps are `{ env, fetch, runCommand, now }`. Existing callers omit them. Core does not read `process.env`. A missing env, `runCommand`, or `fetch` resolves to human.

A decide reply is accepted only when `pick` is one of `options`, every option has a probability in `[0, 1]`, and the probabilities sum to within `0.01` of `1`. The comparison is `abs(sum - 1) > 0.01 + 1e-9`. Otherwise confidence is `0`. Below `min_confidence`, call `fallback_reason` once with mode decide. The fallback uses its own minimum, or the first model's minimum when it has none. Still low resolves to human. A missing command or fetch resolves to human and does not escalate. A throw, a non-zero exit, or non-JSON is confidence 0 and escalates only when a minimum is set. Rules never read confidence. A direct call with no `min_confidence` does not escalate.

Secret check, proposal bounds: PEM (`-----BEGIN`), a `name=value` assignment, or a no-whitespace value of at least 32 characters that is not an env-var name. Env names such as `SDD_ROLE_MODEL` stay legal. Check that file's values only. Do not print the secret.

`docs/examples/role-model.mjs` stays a reason example. It returns `{ text }` and fails a decide check on purpose.

Host stubs in `agents.ts` are not lengthened. `takeRole` and `chooseLead` do not gain a model. Ordinary `runRole` kinds stay `reading`, `code`, `scenario`, and `release`.

## Report

Decision rows are separate from `requests`. Suggested row fields: `workType`, `model` (nullable), `kind` (`reason` or `decide`), `provider` (`rules`, `command`, or `ollama`), token counts, and `startedAt`. Rules rows are not written. Dollars are computed at report time. `importSessionMetrics` writes the parsed object back, so a round-trip must keep `decisions`. An old file with no `decisions` key still parses.

## Risks

1. The decision provider cannot go on `TokenUsageMetricSchema.provider`. A separate array avoids a false provider and keeps the cost rows. The issue never named the key `decisions`.
2. A rules table would be invented. `rulesDecision` returns human and does not rank roles. `decide` is not inside `matchRoute`.
3. `role-model.mjs` will not satisfy the decide check. One fallback, then human. Point `SDD_DECIDE_MODEL` at a decide command. Do not change the example.
4. `metrics.json` is read-modify-write and can drop a row, which is already true of `startPhase`. `decide` awaits each `recordDecisionMetric` before the next write and does not add a lock. The secret length `32` and the sum tolerance `0.01` are proposal bounds.
