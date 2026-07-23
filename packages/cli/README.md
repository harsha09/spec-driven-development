# `@structured-vibe-coding/cli`

CLI for **Structured Vibe Coding** (`sdd`) — local Spec-Driven Development.

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or without global install:
npx @structured-vibe-coding/cli --help
```

Binary: **`sdd`**

## Quick start

```bash
cd my-app
sdd init --here --ai copilot    # or grok | claude
sdd doctor
sdd new "Fix empty list crash" -w hotfix -y --no-agent
# edit the intent.md path printed by the CLI
sdd next --no-agent
sdd complete --no-agent
```

| Flag | Meaning |
|------|---------|
| `--here` | Current directory |
| `--ai copilot\|grok\|claude` | Install **only** that AI host |
| `--no-agents` | Skip agent files |
| `--force` | Re-init defaults |

## Docs

- Tutorial: [First change](https://github.com/harsha09/spec-driven-development/blob/main/docs/tutorials/first-change.md)
- Site: https://harsha09.github.io/spec-driven-development/
- CLI reference: [docs/reference/cli.md](https://github.com/harsha09/spec-driven-development/blob/main/docs/reference/cli.md)

## License

MIT
