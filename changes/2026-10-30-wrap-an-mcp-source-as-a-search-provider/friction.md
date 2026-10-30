# Friction

> **Wrap an MCP source as a search provider** · `2026-10-30-wrap-an-mcp-source-as-a-search-provider`

This note is a proposal. The person has not signed it.

- Issue #25 calls Serena permissive. Serena's application is GPL-3.0-or-later as of the v2 license change (SolidLSP stays MIT; a combined distribution is GPL-3.0-or-later). This phase does not vendor it. The matrix marks it not recommended.
- LanceDB OSS and Qdrant OSS are Apache-2.0. The Ollama application is MIT. None of those programs are installed here, and none are added as dependencies. Model weights are not pulled.
- AstroApp adapter rows are blank. Copying the Search S3 builtin counts into an S4 table would invent a comparison. The live AstroApp checkout was not modified.
- Handoff stays on the built-in ranker so this phase does not change the S3 handoff path.
- An older empty pack at `changes/2026-10-19-issue-25-external-search-provider-adapters-and-docs-language/` stays untracked and is not this change.
