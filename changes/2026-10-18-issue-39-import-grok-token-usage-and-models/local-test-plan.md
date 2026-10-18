# Local test plan

> **Issue #39: import Grok token usage and models** · `2026-10-18-issue-39-import-grok-token-usage-and-models`

Synthetic fixtures only. No home-directory session file.

| # | Case | Expect |
|---|------|--------|
| 1 | `usage.json` with two models on one turn, plus a session rollup and a prompt field | Two `grok` requests. Uncached input 50 and 5. Request ids `sess:1:grok-4` and `sess:1:grok-4.7-build`. Rollup, prompt, path, and cost ticks are absent. |
| 2 | Import that file again | `duplicates: 2`. Still two requests. |
| 3 | `endedAt` in 1999 and no `events.jsonl` | `unmatched: 1`, nothing stored, `providers: ["grok"]`. |
| 4 | Sibling `turn_started` inside the phase, `endedAt` in 1999, cache larger than input | Imported. `startedAt` is the event time. Stored input is 0. |
| 5 | Bad model id, non-integer tokens, and `usageIsIncomplete: true` | The valid sibling is stored. `ignored: 2`. `incomplete: true`. |
| 6 | Basename `usage.json` that is not a Grok document; directory with no `usage.json` | Throws `usage.json is not a Grok usage file.` and `Grok usage.json is missing.` |
| 7 | Existing Claude JSONL import | One request, no `model`, no prompt, no path. |
| 8 | Report with model card 9, provider card 4, and default 3 | Header includes `model`. Rows price 9, 4, and 3. Total is 16.0000 / 1344.00. Old rows show model `n/a`. Total model cell is `all`. |
| 9 | CLI import of a session directory | Exit 0, `Imported 1 measured request`, incomplete warning, stored input 50, no path and no prompt. |
| 10 | Workspace | `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass. |
