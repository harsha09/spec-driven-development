# Clarify design

> **Issue 62 model selection** · architect seams checked against the reading. Not an acceptance.

## Q1. What is the metrics key for a decision call?

The issue says to log every decision call with tokens and cost. It does not name the JSON key. The key is `decisions`, beside `requests`. A rules decision writes no row. Command and Ollama rows store tokens, model, work type, kind, and provider. Dollars stay out of the file.

## Q2. Are the secret length and the probability tolerance part of the issue text?

No. They are proposal bounds so the check is testable. PEM (`-----BEGIN`), a `name=value` assignment, or a no-whitespace value of at least 32 characters that is not an env-var name fails `sdd team check`. Probabilities must sit in `[0, 1]` and sum to within `0.01` of `1`. An env-var name such as `SDD_ROLE_MODEL` stays legal.

## Q3. Does routeRole grow a required dependency argument?

No. The third argument is optional: `{ env, fetch, runCommand, now }`. Callers that omit it keep today's path when `models.yaml` is absent. When the file exists and the reason is `No rule matched.`, a missing `runCommand` or `fetch` resolves to human. Core does not read `process.env`.

## Q4. Does Ollama assume a default host?

No. `base_url_env` must name a variable, and that variable must be set in the env the CLI passes. There is no default URL and no socket in tests.

## Q5. Does a decision write need a file lock?

No. `decide` awaits each `recordDecisionMetric` before the next write. That matches `startPhase`, which can already drop a row on overlap. This change does not add a lock.

## Q6. What does the route decider see?

The state is a JSON string of `stage`, `artifact`, `skill`, and `id`, each null when absent. The question is exactly `No rule matched.` Options are the role names sorted with `localeCompare`, then `human` once. A kept role prints `role <pick>` and `reason Model <id> picked <pick>.` There is no rule line. Every human result of that path prints `Ask the human.` and `No rule matched.`

## Q7. Where do the token counts come from?

A command reply may include `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, and `output_tokens`. Ollama uses `prompt_eval_count` and `eval_count`. When the reply JSON itself names token fields, those override the Ollama counters. A missing count stays null. A command model is null unless the reply names one. An Ollama model is the response model, or the configured name such as `qwen2.5:7b`. The choice id is not stored as a model.

## Q8. Which Ollama request is sent?

`POST {base}/api/chat`, with `stream: false` and a JSON object format that requires `pick` and `probs`. The user content is JSON of `{ state, question, options }`. There is no `/api/generate` and no default host. An invalid base URL is not called. A throw or a non-OK response is a call with null tokens and confidence 0. The function is `ollamaDecision`.

## Q9. Which change receives the row?

`recordDecisionMetric` uses the active change id and honors `metrics.enabled`, the same as `startPhase`. No active change, or a config that cannot be read, skips the write and still routes.

## Q10. What do `sdd models show` and `sdd models which` print when the file is bad?

A missing file exits 1 and prints `No models.yaml.` A parse error, a schema error, or a secret uses the `loadModels` message. `which` without a known work type prints `Work type is invalid.` and exits 1.

## Q11. What is a failed command, and when does it escalate?

A throw, a non-zero exit, or a non-JSON reply is confidence 0, recorded with null tokens. It escalates only when a minimum is set. A missing env name, a missing `runCommand`, or a missing `fetch` asks the human, does not escalate, and writes no row.

## Q12. How is the fallback judged when it has no minimum of its own?

The fallback uses its own `min_confidence` when it has one. Otherwise it uses the first model's minimum. A still-low or invalid fallback asks the human. A second failure does not call a third model. A direct call with no minimum keeps a valid probability of `0.01` and does not escalate an invalid reply. The sum check is `abs(sum - 1) > 0.01 + 1e-9`, so a true difference of `0.01` is kept and `1.02` is not.

## Q13. Where does `--bot` go?

`--bot` is an option on `sdd role route` only. `sdd role take` keeps its positional bot and stays model-free.

## Open

No design question remains for this change. These answers are a proposal. The person has not accepted the reading.
