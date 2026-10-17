# Design

> **Issue #26: report phase time, tokens, and cost** · `2026-10-17-issue-26-report-phase-time-tokens-and-cost`

## Approach

Add a read-only report on top of the #28 `metrics.json` file. Do not change how phases are opened or closed, how requests are attributed, or how imports are deduped. The dedupe key stays `` `${provider}\0${requestId}` ``. `TokenUsageMetricSchema` stays as it is: `measured` is the literal `true`, `provider` is `claude-code` or `codex`, and there is no model field.

`sdd report` and `sdd cost` share one pure calculator and one text renderer. `sdd cost` is not a second formula. Neither command launches an agent, rewrites `.sdd/handoff.md`, writes `metrics.json`, or writes `prices.yaml`.

`sdd status` keeps its current `Phase times (local):` block and does not gain cost.

### Commands

| Command | Selection | Output |
|---------|-----------|--------|
| `sdd report` | Active change, via existing `resolveChangeId` | One change report |
| `sdd report --change <id>` | That change | One change report |
| `sdd report --all` | Every direct child of the changes directory that has a `metrics.json` file | Those one-change reports, concatenated |
| `sdd cost` | Active change | Same text as `sdd report` for that change |
| `sdd cost --change <id>` | That change | Same text as `sdd report --change <id>` |

`--all` and `--change` together exit 1 with `Use either --change or --all, not both.` and write nothing. `sdd cost` does not define `--all`.

Check `config.metrics.enabled` before resolving a change. When it is false, print exactly `Metrics are disabled` and exit 0. Do this even when no change is active, so a disabled project does not hit `No active change`. Do not create `prices.yaml` on this path.

When metrics are enabled, a missing active change still uses today's `resolveChangeId` error and exits 1.

### Time

Use stored phase visits in array order. Do not merge visits that share a phase name. Do not read `meta.yaml` gates. Ignore `gates.*.at` even though that optional field exists. Do not add a QA or PO clock.

For each phase:

- Closed (`endedAt` present): active milliseconds are `max(0, endedAt - startedAt)`.
- Open (`endedAt` absent): active milliseconds are `max(0, now - startedAt)`, where `now` is the report clock. The open end renders as `in progress`, the same words `sdd status` uses. The clock is not printed as a third timestamp.

Human wait is only the gaps between consecutive stored phases. For each index `i` where phase `i` has `endedAt` and phase `i + 1` exists, add `max(0, next.startedAt - phase.endedAt)`. A missing `endedAt` starts no gap. A negative gap adds 0. Time after the last closed phase, through the report clock, is neither active nor wait.

Active is the sum of those phase durations. Total is active plus wait. Sum stored intervals. Do not collapse them into a wall-clock union. A shared boundary (`endedAt` of one phase equal to `startedAt` of the next) is a zero gap and both intervals are kept.

Render a duration as `H h M m S s` from `Math.floor(ms / 1000)`: hours unpadded, minutes and seconds unpadded, all three units always present. `90000` is `0h 1m 30s`. Negative inputs become `0h 0m 0s`.

The clock is an argument, defaulting to `new Date()` once per command. `sdd report --all` uses that single `now` for every change. Tests pass a fixed `Date`. There is no `display_timezone` config. Stored values stay UTC ISO 8601 with a `Z` suffix. Displayed start and end use `new Date(iso).toLocaleString()`, the same call `sdd status` uses in `packages/cli/src/commands.ts`.

Worked fixture, clock `2026-01-01T01:05:30.000Z`:

| Phase | Start | End | Active |
|-------|-------|-----|--------|
| intent | 00:00:00Z | 00:10:00Z | 0h 10m 0s |
| implement | 00:40:00Z | 00:40:00Z | 0h 0m 0s |
| local_verify | 01:00:00Z | open | 0h 5m 30s |

Gaps are 30 minutes and 20 minutes. Human wait is `0h 50m 0s`. Active is `0h 15m 30s`. Total is `1h 5m 30s`.

Closed-only check: intent `00:00Z–00:10Z`, implement `00:40Z–01:00Z`, clock `03:00Z`. Active `0h 30m 0s`, human wait `0h 30m 0s`, total `1h 0m 0s`. The two hours after `01:00Z` are not in the total.

### Prices

Ship `packages/core/defaults/prices.yaml`. It is packaged because `packages/core/package.json` already publishes the `defaults` directory. Do not add an `sdd:generated` marker and do not record the file in `.sdd/.generated.json`.

Init copies it with the same write-if-missing behavior as `.sdd/mcp.yaml`, on first init and on `--force`. An existing file, including a user edit, is left byte for byte. The destination is `.sdd/prices.yaml` under `sddRoot`, not under a `--root` memory or changes directory.

Default body:

```yaml
# Operator-owned token prices. sdd does not refresh this file.
# Rates are USD per 1,000,000 tokens. Edit them; init will not overwrite.
usd_to_inr: 84
models:
  default:
    input_per_million_usd: 3
    cache_read_per_million_usd: 0.3
    cache_write_per_million_usd: 3.75
    output_per_million_usd: 15
```

These rates are illustrative, not current vendor prices. The default file has no `claude-code` or `codex` card, so imports cost at `models.default` until the operator adds a provider key.

Schema, parsed with the existing `yaml` package and zod:

- `usd_to_inr`: finite number `>= 0`. Omitted in a user file means 84. The shipped file sets 84 explicitly.
- `models.default` is required. Each card has all four `*_per_million_usd` fields, each a finite number `>= 0`.
- Other `models` keys are full cards. `models.claude-code`, when present, replaces the whole default card for that provider. Do not mix fields across cards.
- A missing file is not a schema failure. Every usd and inr cell is `n/a`, and the report includes the line `prices.yaml is missing`. Do not invent zeros.
- A present file that fails the schema exits 1 with `prices.yaml is invalid`, prints no report body, and writes nothing.

Lookup: request `provider` is `claude-code` or `codex`. Use `models[provider]` when that key exists, otherwise `models.default`. The estimate row always uses `models.default`.

### Cost math

Category USD is `tokens / 1_000_000 * price`. Sum the unrounded category amounts for which the token count is a number. Round that sum once for display. INR is that same unrounded USD sum times `usd_to_inr`, then round once. Do not multiply the already-rounded USD by the rate.

Null counts are excluded from sums. A column whose every contributing count is null renders `n/a`, not `0`. A numeric `0` is a real zero and costs `0`. A row or total whose every token category is null has usd `n/a` and inr `n/a` even when a price file exists. One null category does not blank the other categories. Codex rows already store `cacheWriteTokens: null`; that cell stays `n/a` and adds nothing.

Round half away from zero. USD shows 4 decimal places. INR shows 2. Always show the trailing zeros (`1.5000`, `126.00`).

Pinned fixtures:

- 1_500_000 input tokens at 1 USD per million and `usd_to_inr` 84 display `1.5000` and `126.00`. Output null stays `n/a` and adds nothing.
- 5 input tokens at 10 USD per million and `usd_to_inr` 84: exact USD is 0.00005, display `0.0001`. Exact INR is 0.0042, display `0.00`. Rounding USD before converting would show INR `0.01` and is wrong.
- Provider lookup: `models.default.input_per_million_usd` 3 and `models.claude-code.input_per_million_usd` 9. One million input tokens cost `9.0000` for `claude-code` and `3.0000` for `codex` when `models.codex` is absent.

### Tokens on the report

Group measured requests by the stored `phase` string and `provider`. Do not re-attribute by timestamp at report time. Each stored row is added to exactly one group and exactly once in the change total. The report does not dedupe. Import still does, so a second import of the same log does not add a second row for the calculator to sum.

Order groups by first appearance of that phase name in `metrics.phases`, then by provider name ascending. A request whose phase matches no stored phase still counts, after the known phases, so tokens are not dropped.

The total row is `measured`, phase `total`, provider `all`.

### Estimate

A real BPE tokenizer is out of scope. Do not add a tokenizer dependency.

If `metrics.requests.length > 0`, do not estimate, and do not mention a missing handoff.

If there are zero measured requests:

- Read only `.sdd/handoff.md` (the project handoff, not a change-pack file).
- Token count is Unicode code points divided by 4, rounded down. Code points, not UTF-16 code units and not UTF-8 bytes. `Array.from(text).length` is the count. Do not trim. Fixture `"abcd😀"` has 5 code points and estimates 1 input token. `"abc"` estimates 0.
- The row is display-only: source text `estimated (handoff code points / 4)`, phase `n/a`, provider `default`, requests `1`, input tokens as computed, cache read `n/a`, cache write `n/a`, output `n/a`, cost from `models.default` input price only.
- There is no measured total row in this case.
- If the handoff file is missing (`ENOENT`), skip the row and print `No estimate: .sdd/handoff.md is missing.` Do not invent zero tokens.
- Any other read failure exits 1 with `Could not read .sdd/handoff.md.` and no absolute path.

### Report text

Plain text, no picocolors, so `sdd cost` and `sdd report` can be compared without color codes. Column separator is two spaces. Header row is exactly:

`source  phase  provider  requests  input  cache_read  cache_write  output  usd  inr`

Shape:

```text
Change: <id>
Active: <duration>
Human wait: <duration>
Total: <duration>
Phases:
  <phase>  <local start> → <local end or in progress>  active <duration>
Tokens:
  source  phase  provider  requests  input  cache_read  cache_write  output  usd  inr
  measured  <phase>  <provider>  <n>  <n or n/a>  <n or n/a>  <n or n/a>  <n or n/a>  <usd or n/a>  <inr or n/a>
  measured  total  all  <n>  ...
```

No phases renders `  (none)` under `Phases:`. Zero measured requests and no estimate render `  (none)` under the header, then the missing-handoff sentence when that is why. When the price file is missing, every usd and inr cell is `n/a` and the block ends with `prices.yaml is missing`. When the file is present and valid, that line is absent.

`--all` prints those blocks in order, separated by one blank line. A directory with no `metrics.json` is omitted. None at all prints `No change metrics found.` and exits 0.

Sort key for a valid file: first phase `startedAt` ascending. UTC `Z` strings from `toISOString` sort chronologically as strings. Tie-break with change id `localeCompare`. A valid file with an empty `phases` array sorts after any change that has a first start, then by change id.

A `metrics.json` that fails `ChangeMetricsSchema` does not fail `--all`. Its block is:

```text
Change: <id>
metrics.json is invalid
```

Those blocks sort after valid ones, then by change id. Do not print the parser exception. A one-change report whose file fails the schema exits 1 with `metrics.json is invalid` and no token table. A missing `metrics.json` on a direct one-change report stays today's empty metrics object (`readChangeMetrics` does not write). The report may then show the estimate. `--all` still skips that change because the file is absent.

The report does not print request ids, prompt text, session-log paths, or any absolute path.

### Exclude

Extend config:

```ts
metrics: z.object({
  enabled: z.boolean().default(true),
  exclude: z.array(z.string().min(1)).default([]),
}).default({})
```

`ConfigSchema.parse({})` still has `enabled: true` and `exclude: []`. Existing config files that omit `exclude` keep that default. `mergeConfigDefaults` must keep filling it.

On `importSessionMetrics`, after the existing disabled check and before opening the log:

- Reject a prefix that is absolute or whose `/` or `\` segments include empty, `.`, or `..`. Error: `metrics.exclude prefix is invalid.` Do not echo an absolute path.
- Resolve the log path. If it is outside the project root (`relative` starts with `..` or is absolute), it is not excluded.
- Otherwise normalize the repo-relative path to forward slashes. A prefix matches when the relative path equals the prefix or starts with `prefix + "/"`. Strip a leading `./` and trailing slashes on the prefix before compare.
- Prefix `secret` excludes `secret` and `secret/session.jsonl`. It does not exclude `secret-file.jsonl` or `secrets/log`.
- On a match, throw before reading. Message: `Refusing to import a session log under excluded prefix "<prefix>".` No log path in the message. CLI exit stays 1 through the existing throw path. Do not modify `metrics.json`.

Report does not apply `exclude` and does not read session logs.

### What #28 already decided

Leave these alone: phase start and end writes, request-to-open-phase attribution, cache columns, measured literal, provider enum, disabled import throw (`Metrics are disabled in .sdd/config.yaml.`), and status local timestamps. This change only adds the exclude check in front of the import read.

## Components / modules

- `packages/core/defaults/prices.yaml`: shipped default rates above.
- `packages/core/src/defaults.ts`: `defaultPricesYamlPath()`, beside `defaultMcpYamlPath()`.
- `packages/core/src/init.ts`: write `.sdd/prices.yaml` only when missing. Not a generated-tree file.
- `packages/core/src/schemas.ts`: `metrics.exclude` as specified. No price schema in config.
- `packages/core/src/metrics.ts`: exclude check only. No cost math. No dedupe-key change.
- `packages/core/src/report.ts` (new): pure timing, price load, cost, estimate inputs, sort, and `renderChangeReport`. No `writeText`. Exported through `packages/core/src/index.ts`.
- `packages/cli/src/report-cmd.ts` (new): `report` and `cost` commands. Register both on `commands` in `packages/cli/src/commands.ts`. Compose read, one clock, prices, handoff code points, and the renderer. Disabled short-circuit lives here.
- Tests named in `local-test-plan.md`.
- Docs, after approval, edited only as specified under Docs below. No other product docs.

Suggested pure entry points, so tests can inject `now` and a handoff count without the CLI:

- `phaseTiming(phases, now)`
- `loadPrices(projectRoot)` returning the table, `null` when the file is missing, or throwing a `prices.yaml is invalid` error
- `costFor(counts, card, usdToInr)`
- `renderChangeReport({ changeId, metrics, prices, handoffCodePoints, now })` where `handoffCodePoints: number | null` (`null` means the handoff file is missing)
- `compareChangesByFirstPhase(left, right)` for the `--all` order

The CLI reads `.sdd/handoff.md` and passes the count or `null`. `renderChangeReport` does not touch the filesystem.

## Data flow

1. CLI loads config. If metrics are disabled, it prints `Metrics are disabled`, exits 0, and returns.
2. It resolves one change, or lists change directories and keeps those with `metrics.json`.
3. It loads prices once. Missing becomes `n/a` costs. Invalid aborts with exit 1.
4. It reads each `metrics.json` through `readChangeMetrics` (no write). Invalid JSON on `--all` becomes the short invalid block.
5. It reads `.sdd/handoff.md` only when rendering a change whose `requests` array is empty.
6. The renderer returns text. The CLI logs it. Disk state of `metrics.json` and `prices.yaml` is unchanged.
7. Import, separately, refuses excluded paths before the read stream and otherwise behaves as #28.

## Alternatives considered

- A second cost command with its own arithmetic: rejected. `sdd cost` calls the same renderer as one-change `sdd report`.
- Writing USD back into `metrics.json`: rejected. The file stays counts and timestamps. Prices can change without rewriting history.
- Treating a missing price file as zero: rejected. The report says `prices.yaml is missing` and shows `n/a`.
- Using gate `at`, or adding a QA/PO timer, for human wait: rejected. Wait is only the gap between consecutive phase records.
- Including time from the last `endedAt` until the report clock as wait: rejected. That idle tail is outside active and outside wait.
- Estimating with `tiktoken` or a downloaded BPE tokenizer: rejected. The estimate is handoff code points divided by 4, and only when nothing was measured.
- Bundling or spawning LiteLLM, or parsing proxy logs: rejected. One docs sentence points operators at their own proxy.
- Marking `prices.yaml` as `sdd:generated`: rejected. Init must not regenerate a user edit.
- Printing costs from `sdd status` as well: rejected. Status stays a phase-time list.

## Risks

- Illustrative default rates will not match an invoice. The file comment says the operator owns them.
- Locale-dependent timestamps can differ across machines. Duration text does not. Tests assert `toLocaleString()` from the same process.
- An overlapping hand-edited phase pair counts both intervals in active. SDD-written files do not overlap. The report does not silently union them.
- Exclude does not cover logs outside the repo. That matches #28, which already imports an external path and stores neither the path nor the prompt.

## Docs

The implementer edits these docs after the spec is approved. Use these sentences. Do not add a proxy config, a tokenizer section, or a second cost formula.

`docs/reference/cli.md`, "I want to…" table, three rows:

| Report phase time, tokens, and cost | `sdd report` |
| Report every change that has metrics | `sdd report --all` |
| Print the one-change cost report | `sdd cost` |

`docs/reference/cli.md`, "All commands" table, three rows:

| `sdd report` | Print active time, human wait, measured tokens, and cost for the active change. Use `--change <id>` to select one change. | After metrics exist |
| `sdd report --all` | Print that report for every change that has a metrics.json, sorted by first phase start. | Compare changes |
| `sdd cost` | Print the same one-change report as `sdd report`, including the same cost figures. Use `--change <id>` to select one change. | Check cost |

Replace the Never-open-AI sentence with:

`**Never open AI:** `status`, `report`, `cost`, `init`, `workflows`, `context`, `backlog list`, `help`, `doctor`.`

Replace the metrics yaml example with:

```yaml
metrics:
  enabled: false
  exclude: []
```

Keep the sentence that phase timing and token metrics are enabled by default. After that example, add:

``metrics.exclude` lists repo-relative prefixes. Import refuses to read a session log under an excluded prefix. The default is `[]`.`

``When metrics are disabled, `sdd report` and `sdd cost` print `Metrics are disabled` and exit 0.`

Immediately after the existing sentence that session imports store counts only and do not store the session-log path or prompt text, add:

`Tools without session logs can use a local proxy that the operator runs; sdd does not read proxy logs in this version.`

Prices paragraph, in that same metrics section:

``.sdd/prices.yaml` holds USD rates per one million tokens and `usd_to_inr` (default 84). `sdd init` writes it only when missing. Cost uses `models.<provider>` when that key exists, otherwise `models.default`. If the file is missing, every cost is `n/a` and the report says `prices.yaml is missing`. Costs are not written into `metrics.json`.`

Estimate sentence, in that same section:

`If a change has no measured requests, the report adds one `estimated (handoff code points / 4)` row from `.sdd/handoff.md` and labels it as an estimate, not a model tokenizer. This version does not include a BPE tokenizer.`

`docs/reference/layout.md`, one sentence at the end of "What belongs in git":

``.sdd/prices.yaml` is committed project config, written by init when missing, and not regenerated over a user edit.`
