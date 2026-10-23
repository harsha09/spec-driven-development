# Clarify tasks

> **Issue 62 model selection** · task check against the design. Not an acceptance.

## Q1. Does any task need a behavior the design does not name?

No. The task list follows the seam table. `matchRoute`, `takeRole`, and `chooseLead` stay model-free. `decide` has one production caller, `routeRole`.

## Q2. Does the report task change the existing cost rows?

No. The token header stays. Decision rows are a second section, and only when `decisions` is non-empty. Dollars are computed at report time.

## Q3. Is the Ollama task a live server?

No. The task is an HTTP preset tested with an injected `fetch`. `launch-agent.ts` stays as it is.

## Q4. What is in the decide state?

The dev lead asked. The state is JSON of `stage`, `artifact`, `skill`, and `id`. The question text is exactly `No rule matched.`

## Q5. Which numbers are stored?

Command replies may name the four token fields. Ollama stores `prompt_eval_count` and `eval_count` unless the reply JSON names token fields, which then win. Missing stays null. The stored model is the reply's model, or the Ollama model name. It is not the choice id.

## Q6. Which HTTP call does the Ollama task make?

`POST {base}/api/chat` with `stream: false` and a JSON schema that requires `pick` and `probs`. No default host.

## Q7. When does the metrics task write?

It uses the active change and `metrics.enabled`. If either is missing, the route still returns and the file is left alone.

## Q8. What failure text do the command tasks print?

Missing file: `No models.yaml.` Bad work type: `Work type is invalid.` A secret or a bad file uses the loader message and does not print the secret.

## Q9. What does a broken command count as?

A throw, a non-zero exit, or non-JSON is confidence 0. It escalates only when a minimum is set. A missing command or fetch does not escalate.

## Q10. What minimum does the fallback task use?

The fallback's own minimum, or the first model's minimum when the fallback has none. A still-low strong reply asks the human. The sum tolerance keeps a difference of `0.01` and rejects `1.02`, using a `1e-9` epsilon so a binary `0.01` is not rejected.

## Open

No task question remains for this change. The dev lead's questions are answered here as a proposal. The person has not accepted the reading.
