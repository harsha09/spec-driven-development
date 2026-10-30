# Tasks

> **Wrap an MCP source as a search provider** · `2026-10-30-wrap-an-mcp-source-as-a-search-provider`

This list is a proposal. The person has not signed it. One developer.

- [x] Widen `provider` on `SearchResult` and `IndexStats` to `string`. Add optional `mcp_source` and `mcp_tool` to the search config. Give `searchPreamble` an optional provider argument that defaults to `builtin`.
- [x] Add the MCP search provider. `sdd search` uses it when `provider` is `mcp`. Keep a successful external provider name. Fall back on failure or timeout. Leave handoff on the built-in ranker.
- [x] Cover fallback, timeout, empty hits, reproducibility, exclude-before-send, the default tool arguments, and handoff with Vitest. No network and no real MCP server.
- [x] Add the language matrix and the `sdd search` sentence. Record that Serena, LanceDB, Qdrant, and Ollama are not bundled and not recommended.
