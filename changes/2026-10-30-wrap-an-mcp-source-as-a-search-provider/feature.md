# Feature

> **Wrap an MCP source as a search provider** · `2026-10-30-wrap-an-mcp-source-as-a-search-provider` · 2026-10-30

Issue #25, phase S4 of epic #21. This is the product manager's reading. The person has not signed it. A role does not accept it.

## Problem / opportunity

`sdd search` already ranks with the built-in keyword index. `.sdd/search.yaml` can name another provider, and a missing name falls back, but nothing in the product turns an MCP source the operator already configured into that provider. The docs do not say which languages each provider covers, which ones are bundled, or which ones are not recommended.

## Users & value

A person who already runs `sdd search`. They can point it at one MCP source. Keyword search still works when they do not. A broken source does not stop the search.

## Scope

`provider: mcp` in `.sdd/search.yaml`, with optional `mcp_source` and `mcp_tool`. `sdd search` sends that source `{ query, scope }` only. `index`, when given changed paths, sends only the relative paths that pass the exclude list, gitignore, `.sddignore`, and the secrets filter. It does not send file contents. `sdd search` does not send a path list.

A missing source, an unreadable `.sdd/mcp.yaml`, a tool error, invalid JSON, a throw, or a timeout uses built-in keyword search and the existing unavailable warning. An empty `hits` array is an answer and stays on `mcp`. Hits whose path is excluded, secret, absolute, or contains `..` are dropped. This path does not read or write `.sdd/index.db`.

Handoff and `sdd context` stay on the built-in ranker.

The docs language matrix covers the built-in index and the external names from #25. Serena, LanceDB, Qdrant, and Ollama are not bundled. Serena's application is GPL-3.0-or-later as of its v2 license change, so it is not recommended and is not vendored. LanceDB OSS and Qdrant OSS are Apache-2.0. The Ollama application is MIT. Model weights are not pulled by this phase. Nothing AGPL is bundled.

AstroApp adapter rows stay blank. This reading does not invent token counts.

## Non-goals

An inbound sdd search MCP server. Bundling Serena, LanceDB, Qdrant, or Ollama. Changing built-in handoff packing. Closing #54 or #37. Publishing npm.

## Success criteria

- A fake MCP call that throws, returns `ok: false`, returns prose, or never returns falls back to built-in keyword search. The printed text matches the built-in search. The warning is `Search provider "mcp" is unavailable. Using built-in keyword search.`
- Two identical fake answers print the same text. `Provider:` is `mcp`. An empty `hits` array does not fall back.
- With an adapter enabled, a fake private record on an excluded path is absent from the outbound JSON and from the printed result. `.env` contents are absent too.
- Built-in keyword search still prints `Provider: builtin` and does not call MCP. Handoff does not call MCP.
- The docs matrix marks Serena, LanceDB, Qdrant, and Ollama not bundled and not recommended, and records the licenses above.
- `pnpm test` passes.

## Risks / open questions

No Serena, LanceDB, Qdrant, or Ollama process is installed for a live AstroApp comparison. The quality gate allows the matrix to mark an adapter not recommended. Those AstroApp cells stay blank.

## Product owner

The slice matches #25: one MCP wrapper, the matrix, exclude-before-send, and fallback. It does not add an inbound search server. The person has not signed this reading.
