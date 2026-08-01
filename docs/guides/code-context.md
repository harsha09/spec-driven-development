---
title: Code context (AST) and MCP
description: Use sdd context or the sdd MCP server for AST code slices — pull only ranked TypeScript/JavaScript symbols into the agent prompt to save tokens.
---

# Code context (AST slices) + MCP

Agents either get **huge noisy context** or miss the right function.  
sdd can build **ranked TypeScript/JavaScript slices** with a local AST so prompts stay small.

You can use that engine in two ways:

| How | When |
|-----|------|
| **CLI** `sdd context` | You want a file in the change pack, or a one-off in the terminal |
| **MCP** `sdd mcp` / `sdd-mcp` | Claude Code, Cursor, VS Code, etc. call tools **on demand** (best for token savings) |

> Specs stay markdown under `changes/` (process trail).  
> **Code** should come in as **slices**, not the whole monorepo.

## When to use it

During **implement** or **review** of product code — not for pure vision/intent stages.

---

## MCP (recommended for agents)

Start the server (stdio):

```bash
sdd mcp
# or: npx @structured-vibe-coding/mcp
# or: sdd-mcp
```

### Example client config (Claude Code / Cursor)

```json
{
  "mcpServers": {
    "sdd-code-context": {
      "command": "npx",
      "args": ["-y", "@structured-vibe-coding/mcp"],
      "env": {
        "SDD_PROJECT_ROOT": "/absolute/path/to/your-app"
      }
    }
  }
}
```

### Tools the agent can call

| Tool | What it does |
|------|----------------|
| `code_context` | Ranked AST slices (`markdown`) or compact `summary` JSON |
| `code_context_help` | Short “how to save tokens” blurb |

**Token tips for agents:**

1. Prefer `format: "summary"` first, then a focused markdown call.  
2. Pass `symbols` and/or `paths` — avoid empty “whole repo” calls.  
3. Default MCP budget is **~4000 tokens** (tighter than the CLI default).  
4. Raise `maxTokens` only when the task is wide.

Install package: [@structured-vibe-coding/mcp](https://www.npmjs.com/package/@structured-vibe-coding/mcp) (after publish) or build from this monorepo.

---

## CLI commands

```bash
# Symbol-focused
sdd context --path packages/core/src/agent-handoff.ts --symbol buildAgentPrompt --stdout

# Write into active change pack
sdd context --path src/app.ts --symbol main --out change
# → changes/<id>/code-context.md

# JSON summary
sdd context -p src/foo.ts -s bar --json
```

Prefer slices over pasting the monorepo. Caps (files, lines, tokens) keep agent context bounded.

Handoff on implement / local_verify **points** at `sdd context`; it does **not** auto-run on every status. Regenerate with `--out change` when code moves.

---

## Specs vs code: what should stay bulky?

| Content | Keep as | Why |
|---------|---------|-----|
| Intent, design, tasks, vision | **Markdown in git** | Humans review in PRs; agents and people share one trail |
| Product memory | Short **markdown** under `memory/` | Durable, linkable, no special DB |
| Product **source** for implement | **AST slices / MCP** (or agent tools) | Code is huge; never dump the monorepo into chat |

Markdown specs can feel “bulky,” but they are the **right** store for process: readable, diffable, offline, no second system of record.  
The token problem is almost always **code dumps**, not a 1–2 page `feature.md`.

If a stage template feels long: write fewer real sentences, skip optional stages, or `sdd refine` — don’t replace git markdown with a private binary format.

## Related

- [CLI reference](../reference/cli)  
- [Refine specs first](./refine) if the task list is still fuzzy  
- [Everyday loop](./everyday-loop)  

