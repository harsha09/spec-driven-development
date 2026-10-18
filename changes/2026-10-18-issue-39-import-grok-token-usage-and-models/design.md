# Design

> **Issue #39: import Grok token usage and models** · `2026-10-18-issue-39-import-grok-token-usage-and-models`

## Approach

Teach `importSessionMetrics` to recognize a Grok usage document, and teach the report to print and price a model id. Claude Code and Codex JSONL stay on the existing line parser. Metrics version stays `1`. Costs are still not written into `metrics.json`.

The persisted `usage.json` is not the headless spend object. On a real session file, `totalTokens = inputTokens + outputTokens`, and `cachedReadTokens` is less than or equal to `inputTokens`. Cache reads are inside `inputTokens`. Headless `usage.input_tokens` is uncached only. This importer follows the file, not the headless projector.

## Schema

`TokenUsageMetricSchema.provider` becomes `z.enum(["claude-code", "codex", "grok"])`.

Add `model: z.string().min(1).nullable().optional()`. Missing `model` still parses. New Grok rows set it to the model id. Claude and Codex parsers do not set it.

Dedupe key stays `` `${provider}\0${requestId}` ``.

## What is a Grok file

`importSessionMetrics` chooses a reader before any parse:

- If the path is a directory, the file is `<dir>/usage.json`. If that file is missing, throw `Grok usage.json is missing.` Do not include the path in the message.
- If the basename is `usage.json`, read the whole file as one JSON value. If the value is not an object with a non-empty string `sessionId` and an array `turns`, throw `usage.json is not a Grok usage file.`
- Otherwise stream JSONL exactly as today.

`assertSessionLogAllowed` still runs on the path the operator passed, before the file is opened. A directory is checked the same way. Disabled metrics still throw `Metrics are disabled in .sdd/config.yaml.` before that check.

Do not read `subagents/`, `chat_history.jsonl`, or `meta.json`.

## Rows

Ignore `session`. It repeats the sum of the turns. One stored request per entry of `turns[].modelUsage`.

For each turn:

- `turnNumber` must be a safe integer greater than or equal to 1. Otherwise ignore the turn and add one to `ignored`.
- Each `modelUsage` key must match `^[A-Za-z0-9._:/-]+$`. Otherwise ignore that entry and add one to `ignored`.
- The bucket must be an object. Otherwise ignore it and add one to `ignored`.
- `inputTokens`, `cachedReadTokens`, `cacheCreationTokens`, and `outputTokens` must each be a safe integer greater than or equal to 0. Otherwise ignore that entry and add one to `ignored`.
- Stored fields:
  - `provider`: `grok`
  - `model`: the key
  - `requestId`: `${sessionId}:${turnNumber}:${model}`
  - `inputTokens`: `max(0, inputTokens - cachedReadTokens - cacheCreationTokens)`
  - `cacheReadTokens`: `cachedReadTokens`
  - `cacheWriteTokens`: `cacheCreationTokens`
  - `outputTokens`: `outputTokens`
  - `measured`: `true`
- Do not read `reasoningTokens`, `totalTokens`, `modelCalls`, `costUsdTicks`, `primaryModelId`, or `turnCount`.

`startedAt` is the sibling `events.jsonl` `turn_started` timestamp when that line exists, otherwise the turn’s `endedAt`.

Sibling file: same directory as the `usage.json` that was read, name `events.jsonl`. Stream it. Use a line only when `type` is `turn_started`, `turn_number` equals that turn, and `ts` parses as a date. The first match wins. A missing file, a bad line, or no match falls through to `endedAt`. `endedAt` must parse. If it does not, ignore the turn’s model rows and add one `ignored` per row.

Normalize timestamps with the existing ISO conversion (`new Date(value).toISOString()`).

Phase match stays `[startedAt, endedAt)`. An open phase runs to positive infinity. Unmatched rows increment `unmatched` and are not stored. Duplicates increment `duplicates` and are not stored.

When the document is recognized, `providers` includes `grok` even if every row is ignored or unmatched.

`usageIsIncomplete` on `session`, or on any turn object, sets `MetricsImportResult.incomplete` to true. Default false. Claude and Codex imports leave it false. The flag is not stored in `metrics.json`.

Empty `turns`, or turns with no `modelUsage`, still count as a recognized Grok file (`providers` is `["grok"]`, `imported` is 0).

## CLI

`sdd metrics import` description: `Import measured token usage from a Claude Code, Codex, or Grok session log`.

Positional description: `Claude Code or Codex JSONL, a Grok usage.json, or a Grok session directory`.

When `providers` is empty, throw `No Claude Code, Codex, or Grok token usage records found in the session log.`

Success text stays `Imported ${n} measured request(s) into ${changeId}.` then the duplicates / unmatched / ignored line, then `Providers:`.

When `incomplete` is true, `consola.warn` exactly `Grok usage is incomplete; recorded tokens may under-count.` Core does not print.

Do not add a `Models:` line. The model is visible in `sdd report`.

## Report

Header becomes:

```text
source  phase  provider  model  requests  input  cache_read  cache_write  output  usd  inr
```

Group key is phase, provider, and model (`model` missing or null groups as the same empty model). Sort by phase visit order, then provider, then model. An empty model sorts first.

Model cell: the id, or `n/a` when missing or null. The total row uses provider `all` and model `all`. The estimate row stays source `estimated (handoff code points / 4)`, phase `n/a`, provider `default`, and uses model `n/a`.

Price card for a request:

1. `models[<model>]` when `model` is a non-empty string and that key exists
2. else `models[<provider>]` when that key exists
3. else `models.default`

The total USD/INR sum uses that card per request. Token cells stay a plain sum. `packages/core/defaults/prices.yaml` is not edited.

## Docs

In `docs/reference/cli.md`, replace the two sentences that say import is Claude Code or Codex only so they name Grok `usage.json` and a session directory.

Replace the price sentence so lookup order is model, then provider, then `models.default`.

Add one sentence after the “session imports store measured token counts” sentence:

`A Grok usage.json stores one request per turn and model. inputTokens in that file includes cache reads; sdd stores the uncached remainder as input and the cache buckets separately. The model id is stored. Server cost ticks are not imported. When a sibling events.jsonl has turn_started for that turn, that timestamp is the request time; otherwise the turn endedAt is used.`

Do not rewrite the handoff-estimate paragraph or the search paragraphs.

## Files

- `packages/core/src/metrics.ts`
- `packages/core/src/report.ts`
- `packages/core/src/__tests__/metrics.test.ts`
- `packages/core/src/__tests__/report.test.ts`
- `packages/cli/src/metrics-cmd.ts`
- `packages/cli/src/__tests__/cli.integration.test.ts` (one Grok import case; the existing Claude case stays)
- `docs/reference/cli.md`

## Tests

Synthetic documents only. No home-directory session path.

1. Two models on turn 1. Input 100, cache read 40, cache write 10, output 7 for model `grok-4`. Input 5, all cache 0, output 2 for `grok-4.7-build`. Stored uncached input is 50 and 5. `requestId` values are `sess:1:grok-4` and `sess:1:grok-4.7-build`. Provider `grok`. Session totals are not copied.
2. Re-import is one duplicate per row and does not append.
3. `endedAt` outside the open phase, and no `events.jsonl`, is unmatched.
4. Sibling `events.jsonl` `turn_started` `ts` inside the phase wins over an `endedAt` outside it, and that request is imported.
5. Cache read plus cache write greater than input stores input 0, not a negative.
6. A non-integer token, a blank model id, and a model id with a space are ignored. A prompt-like extra field is not written.
7. `session.usageIsIncomplete: true` sets `incomplete` and still imports.
8. Basename `usage.json` that is a Claude JSONL line throws `usage.json is not a Grok usage file.` A directory without `usage.json` throws `Grok usage.json is missing.`
9. The existing Claude JSONL test still stores one request and omits `model`.
10. Report header contains `model`. Grouping splits two models in one phase. Card order is model, then provider, then default. Existing pinned rows gain one cell after `provider`: `n/a` when the request has no model, and `all` on the total row. The estimate fragment `n/a  default  1  1  n/a  n/a  n/a` becomes `n/a  default  n/a  1  1  n/a  n/a  n/a`. The zero-estimate fragment `n/a  default  1  0  n/a  n/a  n/a  0.0000  0.00` becomes `n/a  default  n/a  1  0  n/a  n/a  n/a  0.0000  0.00`. `measured  total  all  2  2000000` becomes `measured  total  all  all  2  2000000`. `measured  intent  claude-code  1  1000000` becomes `measured  intent  claude-code  n/a  1  1000000`.
11. CLI import of a tiny `usage.json` exits 0, prints the imported count, and the stored file has no absolute path. The existing Claude JSONL CLI test stays green, including `Imported 1 measured request`.

## Out of scope reminder

Do not discover sessions, recurse into subagents, import cost ticks, or edit `prices.yaml`.
