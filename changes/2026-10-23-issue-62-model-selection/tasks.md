# Tasks

> **Issue 62 model selection** · dev-lead proposal from the design seams. Not an acceptance.

## Breakdown

- [x] Add `WorkType` and `DecisionModel` beside `RoleModel`, and add a strict `models.yaml` schema with `loadModels` and `checkModels`.
- [x] Add `selectModel` with precedence bot, stage, role, work-type default, then fallback, and require each id to exist and match kind.
- [x] Move `modelFromEnv` into `role/models/command.ts` so it takes env. Add the rules provider and the Ollama HTTP preset. Do not change `launch-agent.ts` or `docs/examples/role-model.mjs`.
- [x] Add `decide`. Keep a reply only when the pick is an option, every option has a probability, and the probabilities sum to within 0.01 of 1. Below `min_confidence`, call `fallback_reason` once. A missing command or fetch asks the human. Rules return human and write no metric.
- [x] Call `decide` from `routeRole` only when the reason is exactly `No rule matched.` and `models.yaml` loads. Keep `matchRoute`, `takeRole`, and `chooseLead` model-free. Pass optional `{ env, fetch, runCommand, now }`.
- [x] Add `sdd models show`, `sdd models which`, and `sdd team check`. Register `models` in `commands.ts`. Reject a literal secret without printing it.
- [x] Add an optional `decisions` array and `recordDecisionMetric`. Print a second report section when it is non-empty. Leave the token header and the provider enum unchanged.
- [x] Lock the behavior with Vitest: no file matches today, two owners and a rule do not spawn, precedence, confidence, injected Ollama, secrets, old metrics, and the new report section.
- [x] Update the CLI reference sentence that says `sdd role route` never calls a model.

## Traceability

| Task | Design ref |
|---|---|
| Schema and types | Design: config and seams for schema.ts and types.ts |
| Precedence | Design: bot, stage, role, work type, fallback |
| Providers | Design: rules, command, ollama. Reason stdin stays `{ roleId, prompt }` |
| decide | Design: confidence, one fallback, human when the command or fetch is missing |
| routeRole | Design: only `No rule matched.` and only when the file exists |
| Commands | Design: `sdd models show`, `sdd models which`, `sdd team check` |
| Report | Design: `decisions` array, header unchanged, dollars from prices.yaml |
| Tests | Product owner checks in feature.md |
| Docs | Design: no file still does not call a model |

## Out of this change

- Escalation, rooms, and the evidence gate. Issues #63, #65, and #66.
- Hosted System-One and auto-tuning.
- Model keys on `team.yaml`.
- A live Ollama server and any edit to the `ollama run` launcher.
- Shipping the research assistant.
- Host stub text.
