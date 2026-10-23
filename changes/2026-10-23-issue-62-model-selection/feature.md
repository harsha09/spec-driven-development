# Feature

> **Issue 62 model selection** · `2026-10-23-issue-62-model-selection` · 2026-10-23

## Reading

SDD picks a model by the type of work. Routing, classify, and check use a small or local decider. Architecture, drafting, code, and reviews use a strong model. A person overrides that per bot, per stage, or per role in `.sdd/models.yaml`. With no `models.yaml`, a role run still uses `SDD_ROLE_MODEL`, and `sdd role route` still does not call a model.

`decide({ state, question, options })` returns `{ pick, probs }` from a rules provider or a generic command provider. An Ollama HTTP preset is available behind that same config. The decider may answer only when the router would say `No rule matched.` A matched rule, one owner, a stage owner, or `Two roles own this.` does not call it. Below the confidence minimum the cheap pick is not kept. The strong model is asked once. If that reply is still low, or the command is missing, the human is asked. Every decision call records tokens so `sdd report` can show cost.

Bots still cannot accept a spec, run `sdd next`, or merge.

## Source

Issue #62, as filed, plus the owner's implementation comment on that issue. Where the comment and the issue disagree, this reading follows the issue. The research assistant gathered the file paths. The product manager proposes this reading. The product owner and the architect reviewed the same brief. It is not an acceptance. The person accepts or corrects it.

## Scope

- Work types are exactly `route`, `classify`, `check`, `draft`, `design`, `code`, and `review`. Design is the architecture work named in the issue.
- Defaults: `route` uses rules. `classify` and `check` use a local command decider. `draft`, `design`, `code`, and `review` use the strong reason model (`SDD_ROLE_MODEL`).
- Precedence is bot, then stage, then role, then the work-type default, then the fallback. A missing work-type key uses `fallback_decide` for route, classify, and check, and `fallback_reason` for the strong kinds. Every id must exist and its kind must match the slot.
- The rules provider is deterministic. It returns `human` when that option is present. It does not invent a role and it does not read confidence.
- A command or Ollama reply is kept only when `pick` is one of the options, every option has a probability in `[0, 1]`, and the probabilities sum to within `0.01` of `1`. Otherwise confidence is `0`. Confidence is the probability of the pick. No `min_confidence` means no escalation.
- `sdd models show` prints each resolved row and why. `sdd models which` takes `--work-type`, and optional `--role`, `--stage`, and `--bot`.
- `sdd team check` rejects a literal secret in `models.yaml` and accepts an env-var name such as `SDD_ROLE_MODEL`. It does not print the secret on success. It checks that file only.
- Ollama is an HTTP preset, used only when a slot says `provider: ollama`. Tests inject `fetch`. There is no live server and no `ollama` CLI spawn.
- Decision rows live in a `decisions` array on `metrics.json`. The existing token table header stays. Dollars stay computed by the report from `prices.yaml`.

## Product owner

Proposed checks, not a recorded decision:

- No `models.yaml`: a reason call uses `SDD_ROLE_MODEL`. Unset exits 1 and prints `No role model is configured.` `sdd role route` with no match prints `Ask the human.` and `No rule matched.` and does not spawn a model.
- A matching routing rule, one `owns` or `skills` role, or a stage owner still prints the role, the reason, and the rule. The decide command is not spawned.
- Two owners print `Ask the human.` and `Two roles own this.` The decide command is not spawned.
- When the no-rule path names a command decider, a Zod-valid pick at or above `min_confidence` prints that role. A probability below the minimum, or a reply that fails the check, calls the strong model once. If that reply is still low or invalid, the command prints `Ask the human.` and no role line.
- `sdd models which --work-type draft` (and design, code, review) resolves to strong. Route, classify, and check resolve to the cheap decider. `--bot` beats `--stage`, which beats `--role`, which beats the work-type default. `sdd models show` prints each row and a why.
- `sdd team check` exits 1 when `models.yaml` holds a literal secret, and exits 0 when the slot is an env-var name. A model block in `team.yaml` is not read. `TeamSchema` stays strict.
- An injected Ollama body that passes the schema can be selected. An invalid body follows the low-confidence path. The test does not spawn `ollama` and does not open a socket.
- A command or Ollama call records tokens, model, and work type. `sdd report` shows them in a new section. Existing cost rows stay, and `sdd cost` still matches those rows. A rules decision adds no model request row.
- An old `metrics.json` still parses. The file stores tokens, not dollars.

## Non-goals

- No hosted System-One adapter and no auto-tuning.
- No escalation, no rooms, and no evidence gate. Those are issues #63, #65, and #66.
- No change to the existing `ollama run` launcher.
- No model keys on `team.yaml`. The issue text allows that file. Today's schema rejects unknown keys, so this change does not weaken it.
- `sdd team init` does not write `models.yaml`.
- No edit to `docs/examples/role-model.mjs`. Point `SDD_DECIDE_MODEL` at a decide command.
- Ordinary role runs stay on `SDD_ROLE_MODEL`. They do not switch onto `selectModel`, and they still do not write `metrics.json`.
- No QA role on the software template. That is issue #71.
- The research assistant is a local dogfood role. This change does not ship it.
- Epic #58 stays open. This change does not start issues #63 through #66.
- A role still cannot accept a spec, record a QA result, or generate a release.

## Success criteria

- With no `models.yaml`, route output and reason calls match today.
- With a config file, only the exact reason `No rule matched.` can call a decider.
- Precedence, `sdd models show`, `sdd models which`, and the secret check behave as the product owner checks say.
- The report keeps its current header and adds a second section only when decision rows exist.
