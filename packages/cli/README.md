# `@structured-vibe-coding/cli`

**`sdd`** — local Spec-Driven Development process coach for you and your AI coding agent.

Keep intent, design, and verify notes next to the code. Hotfix, greenfield product spine, or enterprise ARB — same CLI.

**npm:** https://www.npmjs.com/package/@structured-vibe-coding/cli

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

- [What is sdd](https://github.com/harsha09/spec-driven-development/blob/main/docs/concepts/what-is-sdd.md)
- [Greenfield](https://github.com/harsha09/spec-driven-development/blob/main/docs/guides/greenfield.md)
- [Simple feature](https://github.com/harsha09/spec-driven-development/blob/main/docs/guides/simple-feature.md)
- [Enterprise](https://github.com/harsha09/spec-driven-development/blob/main/docs/guides/enterprise.md)
- [Workflows](https://github.com/harsha09/spec-driven-development/blob/main/docs/reference/workflows.md)
- [Agents](https://github.com/harsha09/spec-driven-development/blob/main/docs/reference/agents.md)
- Site: https://harsha09.github.io/spec-driven-development/

## License

MIT
