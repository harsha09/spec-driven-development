# `@structured-vibe-coding/cli`

**`sdd`** — local Spec-Driven Development process coach for you and your AI coding agent.

Keep intent, design, and verify notes next to the code. Hotfix, greenfield product spine, or enterprise ARB — same CLI.

**npm:** https://www.npmjs.com/package/@structured-vibe-coding/cli  
**Docs:** https://harsha09.github.io/spec-driven-development/  
**Start:** https://harsha09.github.io/spec-driven-development/tutorials/first-change/

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
sdd init --here --ai copilot    # or grok | claude | ollama
sdd doctor
sdd new "Add expense CSV export" -w feature -y
# edit feature.md, then sdd next … sdd complete
```

**New product:**

```bash
sdd greenfield "Team expense tracker for remote startups"
sdd feature list && sdd feature start F-001
```

## External MCP sources (sdd as client)

Attach org design systems, libraries, or AST engines so **sdd pulls context** at the right stage:

```bash
sdd mcp sources add \
  --id design-system \
  --command npx --arg -y --arg @acme/design-system-mcp \
  --stages design,implement \
  --tool search_components \
  --tool-arg query={{query}}

sdd mcp sources list
sdd mcp fetch --query "primary button"
```

See: https://harsha09.github.io/spec-driven-development/guides/mcp/

## Docs

| Topic | Link |
|-------|------|
| Start in 10 minutes | https://harsha09.github.io/spec-driven-development/tutorials/first-change/ |
| MCP sources | https://harsha09.github.io/spec-driven-development/guides/mcp/ |
| Simple feature | https://harsha09.github.io/spec-driven-development/guides/simple-feature/ |
| CLI | https://harsha09.github.io/spec-driven-development/reference/cli/ |

## License

MIT
