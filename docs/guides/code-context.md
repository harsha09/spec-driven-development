---
title: Code context (AST) and MCP
description: Use sdd context or built-in sdd mcp for AST slices and full process tools — integrate Claude Code, Cursor, and other MCP clients with one CLI.
---

# Code context + MCP (built into the CLI)

Agents often burn tokens on whole-repo dumps.  
**sdd** can give them:

1. **Process tools** — same engine as the terminal (`new`, `next`, `complete`, …)  
2. **AST code slices** — ranked TypeScript/JavaScript symbols under a token budget  

Both ship **inside `@structured-vibe-coding/cli`**. No second package.

```bash
sdd mcp          # start MCP server (stdio)
sdd context …    # same AST engine from the terminal
```

---

## Integrate MCP (one install)

You only need the **sdd CLI**:

```bash
npm install -g @structured-vibe-coding/cli
```

### Claude Code / Cursor / VS Code MCP config

```json
{
  "mcpServers": {
    "sdd": {
      "command": "sdd",
      "args": ["mcp"],
      "env": {
        "SDD_PROJECT_ROOT": "/absolute/path/to/your-app"
      }
    }
  }
}
```

Or with npx (no global install):

```json
{
  "mcpServers": {
    "sdd": {
      "command": "npx",
      "args": ["-y", "@structured-vibe-coding/cli", "mcp"],
      "env": {
        "SDD_PROJECT_ROOT": "/absolute/path/to/your-app"
      }
    }
  }
}
```

Set **`SDD_PROJECT_ROOT`** to your app so tools hit the right repo when the host starts the server from another directory.

Init the app once:

```bash
cd /absolute/path/to/your-app
sdd init --here --ai copilot   # or claude | grok | ollama
```

---

## MCP tools (same as CLI)

| Tool | CLI equivalent |
|------|----------------|
| `sdd_help` | overview |
| `sdd_doctor` | `sdd doctor` |
| `sdd_status` | `sdd status` / `--list` |
| `sdd_workflows` | `sdd workflows` |
| `sdd_new` | `sdd new` |
| `sdd_greenfield` | `sdd greenfield` |
| `sdd_feature_list` | `sdd feature list` |
| `sdd_feature_start` | `sdd feature start` |
| `sdd_next` | `sdd next` |
| `sdd_skip` | `sdd skip` |
| `sdd_use` | `sdd use` |
| `sdd_gate` | `sdd gate` |
| `sdd_verify` | `sdd verify` |
| `sdd_complete` | `sdd complete` |
| `sdd_handoff` | `sdd agent --print` |
| `sdd_code_context` | `sdd context` (AST slices) |

**Note:** Process tools **do not spawn** your AI host (no recursive agent launch). The MCP client *is* the agent.

### AST tool tips (`sdd_code_context`)

1. Pass `symbols` and/or `paths` — don’t call with no focus on a huge monorepo.  
2. Prefer `format: "summary"` first, then a focused markdown call.  
3. Default **maxTokens ≈ 4000**.  
4. Optional `writeToChange: true` writes `changes/<id>/code-context.md`.

---

## Terminal CLI (same engine)

```bash
sdd context --path src/app.ts --symbol main --stdout
sdd context --path src/app.ts --symbol main --out change
sdd context -p src/foo.ts -s bar --json
```

---

## Specs vs code

| Content | Store | Why |
|---------|--------|-----|
| Intent, design, vision, tasks | **Markdown** under `changes/` / `memory/` | PR-reviewable process trail |
| Product source for implement | **`sdd_code_context` / `sdd context`** | Token-safe slices on demand |

Markdown specs are the right structure for process. Save tokens on **code**, not by inventing a private spec database.

## Related

- [CLI reference](../reference/cli)  
- [Everyday loop](./everyday-loop)  
- [Start in 10 minutes](../tutorials/first-change)  
