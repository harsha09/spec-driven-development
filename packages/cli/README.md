# `@structured-vibe-coding/cli`

CLI for **Structured Vibe Coding** (`sdd`) — flexible, local-first Spec-Driven Development.

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or
npx @structured-vibe-coding/cli init
```

Binary name: **`sdd`**

## Quick start

```bash
cd my-app
# ONE command: SDD project + a single AI agent (not all hosts)
sdd init --here --ai grok       # or: copilot | claude
sdd new "Add expense CSV export"
sdd status
sdd next
sdd verify
sdd complete
```

| Flag | Meaning |
|------|---------|
| `--here` / `.` | Current directory |
| `--ai grok\|copilot\|claude` | Install **only** that AI host’s files |
| `--no-agents` | Skip agent files (shared SDD dirs still created) |
| `--force` | Re-init / overwrite defaults |

`sdd agents install` is optional **later** (switch AI host). First-time setup is just `sdd init`.

Full documentation: [docs hub](https://github.com/structured-vibe-coding/spec-driven-development/blob/main/docs/README.md) · [repository README](https://github.com/structured-vibe-coding/spec-driven-development).

## License

MIT
