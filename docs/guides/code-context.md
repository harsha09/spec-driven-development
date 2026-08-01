---
title: Code context (local AST)
description: Use sdd context for structure-aware TypeScript/JavaScript slices — symbols and imports under a token budget, without dumping the monorepo.
---

# Code context (local AST)

For **this repo’s TypeScript/JavaScript**, sdd can build **ranked symbol slices** with a local AST:

```bash
sdd context --path src/app.ts --symbol main --stdout
sdd context --path src/app.ts --symbol main --out change
sdd context -p src/foo.ts -s bar --json
```

Use during **implement** / review. Prefer slices over pasting whole packages.

---

## Org libraries & remote AST engines

If the knowledge lives in another MCP server (design system, monorepo indexer, API catalog), configure it as an **external source**:

```bash
sdd mcp sources add …
sdd mcp fetch
```

sdd will call those servers at the right stage. Full guide: **[External MCP sources](./mcp)**.

---

## Specs vs code

| Content | Store |
|---------|--------|
| Intent, design, tasks | Markdown under `changes/` / `memory/` |
| This repo’s source | `sdd context` slices |
| Org / UI / remote AST | `.sdd/mcp.yaml` sources |

## Related

- [MCP sources](./mcp)  
- [CLI reference](../reference/cli)  
