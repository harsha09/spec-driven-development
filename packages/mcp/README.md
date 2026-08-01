# `@structured-vibe-coding/mcp`

**MCP server** for sdd AST code context.

Agents call tools to fetch **ranked TypeScript/JavaScript slices** instead of pasting whole packages into the chat (saves tokens).

## Install

```bash
npm install -g @structured-vibe-coding/mcp
# or use via the CLI:
# npm install -g @structured-vibe-coding/cli
# sdd mcp
```

## Run (stdio)

```bash
sdd-mcp
# or
sdd mcp
# or
npx @structured-vibe-coding/mcp
```

Set project root if the host does not start the server in your app directory:

```bash
export SDD_PROJECT_ROOT=/path/to/your-app
```

## Claude Code / Cursor config example

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

Or after global install:

```json
{
  "mcpServers": {
    "sdd-code-context": {
      "command": "sdd-mcp",
      "env": {
        "SDD_PROJECT_ROOT": "/absolute/path/to/your-app"
      }
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `code_context` | AST slices (markdown or compact JSON summary) |
| `code_context_help` | Short usage tips for agents |

### `code_context` inputs

- `paths` — seed files/dirs  
- `symbols` — function/class names  
- `query` — free-text focus  
- `maxTokens` — default **4000** (tighter than CLI)  
- `format` — `markdown` | `summary`  

## Related

- CLI: `sdd context` (same engine, terminal)  
- Docs: https://harsha09.github.io/spec-driven-development/guides/code-context/

## License

MIT
