---
title: Code context (local AST)
description: Use sdd context for keyword slices across TypeScript, JavaScript, Rust, and Python under a token budget.
---

# Code context (local keyword index)

Keyword search covers TypeScript, JavaScript, Rust, and Python. A budget keeps the top hit whole and demotes a later hit to a one-line signature instead of cutting a function.

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
