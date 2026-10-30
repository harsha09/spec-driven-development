---
title: Search providers
description: Which search provider is bundled, which languages it covers, and how to opt in to an MCP source.
---

# Search providers

`sdd search` uses the built-in keyword index unless `.sdd/search.yaml` sets `provider: mcp`. Handoff and `sdd context` stay on that built-in index. This page does not add an inbound sdd search server.

## Enable an MCP source

```yaml
# .sdd/search.yaml
version: 1
provider: mcp
mcp_source: code-search
mcp_tool: search
exclude:
  - "*.jhd"
  - "review-private/"
```

`mcp_source` names an enabled source in `.sdd/mcp.yaml`. When it is omitted and exactly one source is enabled, that source is used. `mcp_tool` names the tool. When it is omitted, sdd uses `invoke.tool`.

`sdd search` sends `{ "query", "scope" }` only. It does not send file contents, `.env`, or excluded paths. The tool returns JSON:

```json
{ "hits": [{ "path": "src/ok.ts", "startLine": 1, "endLine": 3, "symbol": "okWidget", "body": "export function okWidget(): number {\n  return 1;\n}" }] }
```

`signature`, `language`, and `score` are optional. An empty `hits` array is an answer. Prose is not. A hit whose path is excluded, secret, absolute, or contains `..` is dropped.

A missing source, a bad `.sdd/mcp.yaml`, a tool error, invalid JSON, or a timeout prints `Search provider "mcp" is unavailable. Using built-in keyword search.` and continues with the keyword index. `sdd search` does not write the MCP answer into `.sdd/index.db`. Keep any index the remote creates outside git.

`index` can be given changed relative paths. sdd sends `{ "paths" }` after the exclude list, and only those paths. `sdd search` does not pass a path list. The remote is not promised to reindex only that file.

## Language matrix

Measured on this repo's built-in index. Serena, LanceDB, Qdrant, and Ollama were not run, so their quality cells are not filled in. They are not recommended until that measurement exists. Nothing in this phase is AGPL, and none of those four are bundled.

| Provider | Bundled | Chunking | Symbols | Semantic | How to enable | One changed file | License | Recommended |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Built-in keyword | Yes | JS, JSX, TS, TSX, Python, Rust by tree-sitter symbol. Specs and memory by Markdown heading. | Those languages | No | Default `provider: builtin` | Yes. The keyword index reindexes that file. | Tree-sitter grammars and the tokenizer already ship with sdd. SQLite FTS is the bundled keyword store. This phase adds no package. | Yes. Works offline. |
| Built-in hybrid | Yes. The model downloads only when you opt in. | Same as keyword | Same as keyword | Local `BAAI/bge-small-en-v1.5` via `Qdrant/bge-small-en-v1.5-onnx-Q` | `embeddings: true` | Yes, on the built-in index | Model card MIT. Weights are not pulled unless embeddings are on. | Only when you want hybrid ranking. A missing model falls back to keyword search. |
| MCP wrapper | The wrapper is in sdd. The server is not. | Whatever the server returns. sdd does not chunk for it. | Whatever the server returns | Not done by sdd | `provider: mcp` plus one source | sdd can send the allowed relative paths. `sdd search` sends none. The remote may still reindex more. | This repo's license for the wrapper. The server's license is yours to accept. | Only for a server you already run. A broken server falls back to keyword search. |
| Serena | No | Not measured | Not measured | Not measured | Not enabled by sdd | Not measured | Application GPL-3.0-or-later as of the v2 license change. SolidLSP is MIT. A combined distribution is GPL-3.0-or-later. See the Serena license page. | No. Not bundled. |
| LanceDB | No | Not measured | Not measured | Not measured | Not enabled by sdd | Not measured | Apache-2.0 for LanceDB OSS | No. Not bundled. |
| Qdrant | No | Not measured | Not measured | Not measured | Not enabled by sdd | Not measured | Apache-2.0 for Qdrant OSS. This is the server, not the built-in ONNX weights above. | No. Not bundled. |
| Ollama | No | Not measured | Not measured | Not measured | Not enabled by sdd | Not measured | The Ollama application is MIT. Model weights are not pulled and keep their own licenses. | No. Not bundled. |
