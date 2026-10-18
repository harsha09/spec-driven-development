# Feature

> **Issue #39: import Grok token usage and models** · `2026-10-18-issue-39-import-grok-token-usage-and-models` · 2026-10-18

## Problem / opportunity

`sdd metrics import` reads Claude Code and Codex JSONL only. Grok Build records measured tokens in a session `usage.json` (the same document `grok usage` prints): each turn has input, output, cache read, cache write, and a `modelUsage` map keyed by model id. `events.jsonl` records `model_id` on `turn_started` and does not record token counts.

A change done in Grok therefore keeps `requests` empty. `sdd report` and `sdd cost` fall back to the handoff code-point estimate. The token table has no model column. `TokenUsageMetricSchema.provider` is only `claude-code` or `codex`.

Issue #26 refused a model field inside that report change. This change is the follow-up that stores the model and imports Grok.

## Users & value

Maintainers who run Grok against an sdd repo can import one `usage.json` and see, per phase, the model, the measured input, cache, and output, and a price-table cost. Claude Code and Codex imports keep working.

## Scope

- Import a Grok `usage.json`, or a directory that contains one, with `sdd metrics import`.
- Store one measured request per turn per model: provider `grok`, the model id, uncached input, cache read, cache write, and output.
- Show that model on `sdd report` and `sdd cost`. Price lookup tries `models.<model>`, then `models.<provider>`, then `models.default`.
- Keep metrics schema version 1. Existing files without a model field still parse. Claude and Codex rows stay unchanged and display model `n/a`.
- Warn once when the Grok document says usage is incomplete, and still import the counts that are present.
- Update the CLI reference sentences that still say Claude Code or Codex only.

## Non-goals

- Do not rewrite the Claude Code or Codex parsers, their dedupe key, or their cache split.
- Do not store `costUsdTicks`, `reasoningTokens`, the session rollup, the log path, or any prompt or response text. Cost stays a `prices.yaml` estimate and is not written into `metrics.json`.
- Do not recurse into `subagents/` or read `meta.json`.
- Do not auto-discover `~/.grok/sessions`. The operator passes the file or the session directory.
- Do not add a shipped Grok rate card. The default `prices.yaml` stays the illustrative `models.default` card.
- Do not change search, embeddings, phase timing, or the handoff estimate formula.
- Do not treat a live session’s token totals as a test fixture. Tests use synthetic documents.

## Success criteria

- A synthetic Grok `usage.json` with two models on one turn imports two requests. Re-import counts them as duplicates. A timestamp outside every phase is unmatched and not stored.
- Uncached input is `inputTokens` minus cache read minus cache write, and never negative. The session rollup is not stored again.
- The report header includes `model`. A model rate card wins over the provider card, which wins over `models.default`.
- A Claude Code JSONL import still stores one request and does not store the prompt text or the log path.
- An incomplete Grok document still imports and the CLI warns once: `Grok usage is incomplete; recorded tokens may under-count.`
- `metrics.json` gains neither the file path nor prompt text.

## Risks / open questions

No product decisions are left open. The locks are in `design.md`.

Residual risk, already accepted: a parent `usage.json` and a child session `usage.json` are separate files. This change imports only the path the operator passes. Importing both can double-count if the parent rollup already includes the child. The incomplete warning is the signal that the parent file may under-count subagents; it is not a second import.
