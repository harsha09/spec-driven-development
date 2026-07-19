# `@structured-vibe-coding/cli`

CLI for **Structured Vibe Coding** (`sdd`) — flexible, local-first Spec-Driven Development.

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or
npx @structured-vibe-coding/cli init
```

Binary name: **`sdd`**

## Quick start (Speckit-style)

```bash
cd my-app
sdd init --here --ai copilot    # or: sdd init --here --ai claude
# interactive:
#   sdd init --here             # pick AI agent (default highlight: copilot)
sdd new "Add expense CSV export"
sdd status
sdd next
sdd verify
sdd complete
```

| Flag | Speckit analogue |
|------|------------------|
| `--here` / `.` | `specify init --here` / `specify init .` |
| `--ai copilot\|claude` | `--integration` / AI pick |
| `--ignore-agent-tools` | skip CLI-on-PATH check |
| `--force` | merge into existing dir / re-init |

Full documentation: [docs hub](https://github.com/structured-vibe-coding/spec-driven-development/blob/main/docs/README.md) · [repository README](https://github.com/structured-vibe-coding/spec-driven-development).

## License

MIT
