# Clarify intent

> **Issue 62 model selection** · proposals from the research assistant, product manager, product owner, and architect. Not an acceptance.

## Q1. Does draft default to the comment's fast model or the issue's strong model?

The owner's comment example sets `draft: fast`. The issue says a strong model handles drafting. The reading follows the issue. `draft`, `design`, `code`, and `review` default to the strong reason model. The comment's `draft: fast` is not the default.

## Q2. Do overrides live in models.yaml or team.yaml?

The issue says `.sdd/models.yaml` or `team.yaml`. `TeamSchema` is strict, so a model map in `team.yaml` fails today's check. This change reads `.sdd/models.yaml` only. It does not add model keys to the team file and it does not weaken the schema. If both files set a slot, `models.yaml` is the only file that counts.

## Q3. When may the decider run?

Only inside `routeRole`, and only when `matchRoute` returns ask with the reason exactly `No rule matched.`, and only when `models.yaml` exists. A routing rule, one `owns` or `skills` hit, a stage owner, or `Two roles own this.` never calls a model. `matchRoute`, `takeRole`, and `chooseLead` stay model-free. A no-rule take still fails with ask and writes nothing.

## Q4. What happens below the confidence minimum?

Confidence is the probability of `pick`. A reply that fails the Zod check has confidence `0`. Below `min_confidence`, ask `fallback_reason` once in decide mode. If that reply is still low, or the command or fetch is missing, ask the human. No `min_confidence` means no escalation. The rules provider never reads confidence. A missing env, `runCommand`, or `fetch` is human. Core does not read `process.env`. The CLI passes env in.

## Q5. Where do decision tokens go?

Do not add `rules`, `command`, or `ollama` to the token-usage provider enum, and do not map them onto `grok`. Do not change the report header `source  phase  provider  model  requests  input  cache_read  cache_write  output  usd  inr`. Add a `decisions` array. When it is non-empty, the report prints a second section. Dollars stay computed by `report.ts` from `prices.yaml`. They are not stored in `metrics.json`.

## Q6. Is the Ollama preset in this change?

Yes, behind config, as the issue says it comes right after the rules and command providers. Tests inject `fetch`. There is no live server, no `ollama` CLI spawn, and no change to the `ollama run` launcher. Hosted System-One stays out.

## Q7. Which directory holds the new modules?

The owner's comment names `packages/core/src/team/`. That directory does not exist. The router is `packages/core/src/role/routing.ts`. New modules go under `packages/core/src/role/models/`.

## Open

No intent question remains for this change. The person has not accepted the reading.
