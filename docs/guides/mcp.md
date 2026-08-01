---
title: Configure MCP for sdd
description: Use-case based MCP setup for Cursor, Claude Code, VS Code, and Claude Desktop — sdd mcp setup writes the right config so agents can run sdd process tools and AST code context.
---

# Configure MCP for sdd

You should **not** hand-write random JSON unless you want to.  
sdd knows the common **hosts** and **use cases**, and can print or write the config for you.

## What MCP is for (use cases)

| Use case | Client | What you get |
|----------|--------|----------------|
| Edit in **Cursor** and let the agent drive sdd | `cursor` | Process tools + AST slices in Cursor chat |
| Work in **Claude Code** | `claude-code` | Same tools inside Claude Code |
| **VS Code** with MCP / Copilot tools | `vscode` | Project `.vscode/mcp.json` |
| **Claude Desktop** app | `claude-desktop` | Global app config + `SDD_PROJECT_ROOT` |
| Other MCP host | `print` | Snippet to paste |

MCP exposes the **same process** as the CLI (`sdd_new`, `sdd_next`, `sdd_complete`, …) plus **`sdd_code_context`** for token-safe code.

---

## One-time: install + init project

```bash
npm install -g @structured-vibe-coding/cli
cd your-app
sdd init --here --ai copilot    # or claude | grok | ollama
sdd doctor
```

---

## Configure a host (recommended)

List use cases:

```bash
sdd mcp clients
```

### Cursor

```bash
cd your-app
sdd mcp setup --client cursor --write
```

Creates/merges **`.cursor/mcp.json`** with:

- `command`: `sdd`
- `args`: `["mcp", "serve"]`
- `env.SDD_PROJECT_ROOT`: this project’s absolute path  

Restart Cursor → open the project → tools like `sdd_status` should appear.

### Claude Code

```bash
sdd mcp setup --client claude-code --write
```

Writes **`.mcp.json`** in the project root.

### VS Code

```bash
sdd mcp setup --client vscode --write
```

Writes **`.vscode/mcp.json`** (stdio server entry).

### Claude Desktop (global)

```bash
sdd mcp setup --client claude-desktop --write --global
```

Merges into the desktop app config. Set project path carefully — Desktop is not always “cwd = repo”.

### Only print (any host)

```bash
sdd mcp setup --client print
# or
sdd mcp config --client cursor
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `sdd mcp clients` | List hosts + use cases |
| `sdd mcp setup --client <id> [--write]` | Generate or write config |
| `sdd mcp config --client <id>` | Print JSON only |
| `sdd mcp serve` | Start stdio server (what configs launch) |
| `sdd mcp` | Same as `serve` (bare command) |

### Useful flags for `setup`

| Flag | Meaning |
|------|---------|
| `--client` / `-c` | `cursor` \| `claude-code` \| `vscode` \| `claude-desktop` \| `print` |
| `--write` | Write file (merge if exists) |
| `--project` / `-p` | Project root for `SDD_PROJECT_ROOT` |
| `--npx` | Use `npx @structured-vibe-coding/cli` instead of global `sdd` |
| `--path` | Explicit config file path |
| `--global` | Prefer user-global path (Claude Desktop) |

Interactive pick if you omit `--client`:

```bash
sdd mcp setup --write
```

---

## After setup: developer loop

1. Restart the host (Cursor / Claude / VS Code).  
2. Open **your-app**.  
3. Ask the agent, e.g. “Use sdd tools: start a hotfix for empty list crash.”  
4. Agent should call `sdd_new` / edit files / `sdd_next` / `sdd_code_context` as needed.  
5. You can still run `sdd status` in a terminal — **same** change pack.

---

## Without MCP

Everything still works from the terminal only:

```bash
sdd new "…" -w hotfix -y --no-agent
sdd next --no-agent
```

MCP is optional integration for agents, not a second process model.

## Related

- [Code context + tools list](./code-context)  
- [CLI reference](../reference/cli)  
