# `@structured-vibe-coding/cli`

CLI for **Structured Vibe Coding** (`sdd`) — local Spec-Driven Development for solo through enterprise teams.

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
sdd init --here --ai copilot    # or grok | claude (required)
sdd doctor
sdd new "Add expense CSV export" -w feature -y
# edit feature.md, then sdd next … sdd complete
```

| Flag | Meaning |
|------|---------|
| `--here` | Current directory |
| `--ai copilot\|grok\|claude` | Install **only** that AI host (required choice) |
| `--force` | Re-init defaults |

## Docs

- [What is sdd](https://github.com/harsha09/spec-driven-development/blob/main/docs/concepts/what-is-sdd.md)
- [Simple feature](https://github.com/harsha09/spec-driven-development/blob/main/docs/guides/simple-feature.md)
- [Enterprise](https://github.com/harsha09/spec-driven-development/blob/main/docs/guides/enterprise.md)
- [Workflows](https://github.com/harsha09/spec-driven-development/blob/main/docs/reference/workflows.md)
- [Agents](https://github.com/harsha09/spec-driven-development/blob/main/docs/reference/agents.md)
- Site: https://harsha09.github.io/spec-driven-development/

## License

MIT
