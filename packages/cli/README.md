# `@structured-vibe-coding/cli`

**`sdd`** — local Spec-Driven Development process coach for you and your AI coding agent.

Keep intent, design, and verify notes next to the code. Hotfix, greenfield product spine, or enterprise ARB — same CLI.

**npm:** https://www.npmjs.com/package/@structured-vibe-coding/cli  
**Docs (GitHub Pages):** https://harsha09.github.io/spec-driven-development/  
**Start here:** https://harsha09.github.io/spec-driven-development/tutorials/first-change/

## MCP (built into this CLI)

Agents can drive **all major sdd commands** plus AST code context over MCP:

```bash
sdd mcp
```

Example client config:

```json
{
  "mcpServers": {
    "sdd": {
      "command": "sdd",
      "args": ["mcp"],
      "env": { "SDD_PROJECT_ROOT": "/absolute/path/to/your-app" }
    }
  }
}
```

Tools include `sdd_new`, `sdd_next`, `sdd_complete`, `sdd_code_context`, and more (same engine as the terminal).

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or
npx @structured-vibe-coding/cli --help
```

Binary: **`sdd`**

## Quick start

```bash
cd my-app
sdd init --here --ai copilot    # or grok | claude | ollama (required)
sdd doctor
sdd new "Add expense CSV export" -w feature -y
# edit feature.md, then sdd next … sdd complete
```

**New product:**

```bash
sdd greenfield "Team expense tracker for remote startups"
# … stages … sdd complete
sdd feature list && sdd feature start F-001
```

| Flag | Meaning |
|------|---------|
| `--here` | Current directory |
| `--ai copilot\|grok\|claude\|ollama` | Install **only** that AI host (required choice) |
| `--force` | Re-init defaults |

## Docs

Full site: **https://harsha09.github.io/spec-driven-development/**

| Topic | Link |
|-------|------|
| Start in 10 minutes | https://harsha09.github.io/spec-driven-development/tutorials/first-change/ |
| What is sdd? | https://harsha09.github.io/spec-driven-development/concepts/what-is-sdd/ |
| New product | https://harsha09.github.io/spec-driven-development/guides/greenfield/ |
| Simple feature | https://harsha09.github.io/spec-driven-development/guides/simple-feature/ |
| Enterprise | https://harsha09.github.io/spec-driven-development/guides/enterprise/ |
| Workflows | https://harsha09.github.io/spec-driven-development/reference/workflows/ |
| Agents | https://harsha09.github.io/spec-driven-development/reference/agents/ |
| CLI | https://harsha09.github.io/spec-driven-development/reference/cli/ |

## License

MIT
