# Structured Vibe Coding (`sdd`)

Local-first Spec-Driven Development: a CLI process coach plus your AI coding agent (Copilot, Grok, or Claude). Spec-first change packs without cloud lock-in or a required IDE extension.

**Needs:** Node.js 20+ (24 recommended) · about **10 minutes** for the first loop.

| | |
|---|---|
| **Who** | Solo engineers and small teams |
| **Where** | Your laptop, in the app repo |
| **How** | Terminal + optional AI agent |

---

## Documentation

| | |
|---|---|
| **Start here** | [Tutorial: first change](./docs/tutorials/first-change.md) |
| **Docs site** | `https://harsha09.github.io/spec-driven-development/` (enable Pages → Actions) |
| **Local docs** | `pnpm docs:dev` |
| **CLI list** | [docs/reference/cli.md](./docs/reference/cli.md) |

---

## Install

### Users (preferred)

```bash
# One-shot (no global install)
npx @structured-vibe-coding/cli --help

# Or global
npm install -g @structured-vibe-coding/cli
sdd --help
```

If the package isn’t on npm yet, build from this repo (below).

### From this repository

```bash
git clone https://github.com/harsha09/spec-driven-development.git
cd spec-driven-development
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
sdd --help
```

---

## 10-minute path

```bash
cd your-app

# Pick ONE AI: copilot | grok | claude   (or --no-agents to learn process only)
sdd init --here --ai copilot
sdd doctor

sdd new "Fix empty list crash" -w hotfix -y --no-agent
# Open the file path printed under "Next steps" (intent.md)
# Paste a short problem + fix + success (see tutorial for a ready sample)

sdd next --no-agent    # after intent is filled
# implement the fix…
sdd next --no-agent
sdd complete --no-agent
```

Full walkthrough with sample `intent.md` and troubleshooting: **[docs/tutorials/first-change.md](./docs/tutorials/first-change.md)**.

---

## Develop this monorepo

```text
packages/core   engine
packages/cli    sdd binary
```

```bash
pnpm install && pnpm build && pnpm test
pnpm docs:dev
```

CI: [docs/maintainers/ci-cd.md](./docs/maintainers/ci-cd.md).

---

## License

MIT
