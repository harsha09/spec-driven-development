# Design

> **Wrap an MCP source as a search provider** · `2026-10-30-wrap-an-mcp-source-as-a-search-provider`

This is the architect's reading. The person has not signed it.

## Approach

Add `packages/core/src/search/mcp-provider.ts`. `resolveSearchProvider` uses it when `provider` is `mcp`. `sdd search` (`executeSearch`) is the only command that calls it. `buildRetrievedInner` keeps `createBuiltinProvider` and `rankScope`, so a handoff does not open an MCP source.

`SearchResult.provider` and `IndexStats.provider` become `string`. The built-in provider still reports `builtin`. A successful MCP search reports `mcp`. Fallback still reports `builtin`. `resolveSearchProvider` stops rewriting a successful external `provider` field to `builtin`.

## Config

`.sdd/search.yaml` gains optional `mcp_source` and `mcp_tool`. Both are non-empty strings when present. Any other shape fails with `search.yaml is invalid`, the same as a bad `k`.

The source is the enabled `.sdd/mcp.yaml` entry named by `mcp_source`. When `mcp_source` is omitted and exactly one source is enabled, that source is used. Zero sources, two sources, a disabled source, or an unknown id is a fallback. The tool is `mcp_tool`, otherwise `invoke.tool`. A missing tool is a fallback. A `tools` allowlist that omits the tool is a fallback.

## Wire

Search sends `{ query, scope }` and nothing else. Index sends `{ paths }` only when the caller passed changed paths, and only after `loadExcluder`. Paths that are absolute, empty, contain `.` or `..`, or fail the excluder are dropped and not sent. If none remain, index makes no call. `sdd search` calls `index()` with no path list, so that call sends nothing.

The tool returns JSON `{ "hits": [ { "path", "startLine", "endLine", "symbol", "body" } ] }`. `signature`, `language`, and `score` are optional. Extra keys are ignored. Invalid JSON, a missing `hits` array, or `ok: false` throws inside the provider so the registry falls back. `{ "hits": [] }` is packed as the MCP preamble and does not fall back. A hit with an unsafe or excluded path is dropped. sdd does not re-rank the remaining hits. It packs them in the returned order with `packHits` and `Provider: mcp`.

The call is wrapped in a timeout (`mcpTimeoutMs` on the run options, otherwise `SDD_MCP_TIMEOUT_MS`, otherwise 30 seconds). A timeout throws and falls back.

This provider does not read file bodies, does not read `.env`, and does not read or write `.sdd/index.db` or the result cache.

## Docs

`docs/reference/search-providers.md` is the language matrix. `docs/reference/cli.md` gains one sentence on the `sdd search` row and a short paragraph that links to the matrix. The VitePress sidebar links the new page. `docs/guides/code-context.md` links it in one sentence.

## Out of scope

No new dependency. No inbound `sdd mcp` search server. No change to keyword scoring, embeddings, or handoff packing.
