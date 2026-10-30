# Local test plan

> **Wrap an MCP source as a search provider** · `2026-10-30-wrap-an-mcp-source-as-a-search-provider`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Steps | Expected |
| --- | --- | --- | --- |
| 1 | Built-in stays offline | `search-s4.test.ts` with `provider: builtin` | `Provider: builtin`, the symbol is packed, MCP is not called |
| 2 | Missing source | `provider: mcp` and no source | The unavailable warning, text equals the built-in search, provider `builtin` |
| 3 | Throw, `ok: false`, prose | Fake call | Same fallback. Prose is not turned into a hit |
| 4 | Hang | Fake call that never returns, 40ms timeout | Fallback in well under five seconds |
| 5 | Empty hits | Fake `{ "hits": [] }` | Provider `mcp`, no hit block, no `.sdd/index.db` |
| 6 | Same answer twice | Two identical fake payloads | Identical text and hits |
| 7 | Exclude before send | Excluded record, `.env`, `*.jhd`, absolute path, `..` | Outbound JSON has only `src/ok.ts` on index and `{ query, scope }` on search. Those secrets are absent from the print |
| 8 | Real client arguments | Mock `callMcpSourceTool` | One call, arguments are the query and the scope |
| 9 | Handoff | `buildRetrievedInner` with `provider: mcp` | MCP is not called |
| 10 | Bad config | `mcp_source: 1` | `search.yaml is invalid` |
| 11 | Workspace | `pnpm test` | Exit 0 |

## AstroApp

No Serena, LanceDB, Qdrant, or Ollama process was run. The live checkout at `/Users/harshabharadwaj/astroapp` was not modified. Adapter rows are blank on purpose. Search S3 already recorded a built-in measurement on a different commit. Those counts are not copied here.

| Adapter | Context tokens | Handoff tokens | Hit rate | Note |
| --- | --- | --- | --- | --- |
| Built-in keyword on this phase | blank | blank | blank | Not remeasured. Handoff still uses the built-in ranker. |
| MCP wrapper on AstroApp | blank | blank | blank | No live server. Fixture cases 2 and 5 cover fallback and an empty answer. |
| Serena | blank | blank | blank | Not bundled. Not recommended. Application license is GPL-3.0-or-later. |
| LanceDB | blank | blank | blank | Not bundled. Not recommended. Apache-2.0. |
| Qdrant | blank | blank | blank | Not bundled. Not recommended. Apache-2.0. |
| Ollama | blank | blank | blank | Not bundled. Not recommended. Application license is MIT. Weights were not pulled. |
