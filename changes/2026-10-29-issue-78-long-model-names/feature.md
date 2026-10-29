# Feature

> **Issue 78 long model names** · `2026-10-29-issue-78-long-model-names` · 2026-10-29

## Reading

A person who set the Ollama `model` field to `hf.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M` gets a loaded config from `loadModels`. `sdd team check` prints `Team config is valid.` and exits 0 when the rest of the team file is valid. On the no-rule path, `sdd role route` does not exit 1 because of that id. It follows the same path it already follows for `qwen2.5:7b`.

PEM (`-----BEGIN`) and a no-whitespace `name=value` assignment stay rejected on every string, including a value whose key is `model`. The error stays `models.yaml has a secret value.` The rejected value is not printed. A no-whitespace string of 32 characters or more that is not an env-var name stays a secret on every other field. The bare token and `TOKEN=<32-character token>` stay rejected. A 31-character alphabet string still loads.

## Source

Issue #78, as filed. The product manager proposes this reading. The product owner and the architect reviewed the same brief. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue names one file, one field, and the two shapes that must stay rejected. This change is that field. One product.

Proposed checks, not a recorded decision:

- `hf.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M` loads. `sdd team check` does not fail that file with `models.yaml has a secret value.`
- On the no-rule path, `sdd role route` does not exit 1 because of that id.
- A PEM fragment `-----BEGIN` is still rejected, including in the `model` field, and the value is not printed.
- A `name=value` assignment such as `TOKEN=<token>` is still rejected, including in the `model` field, and the value is not printed.
- The bare token `abcdEFGH-0123456789abcdef0123456789` is still rejected when it is not the `model` field, and the value is not printed.
- `qwen2.5:7b` and the 31-character string `abcdefghijklmnopqrstuvwxyz01234` still load.

## Non-goals

- No change to `routing.ts`, `team.ts`, the error sentence, or the CLI wording.
- The 32-character rule stays for every field other than `model`.
- This change does not reopen issue #79, the product-team entrypoint, routing match rules, or model precedence.
