# sdd — Spec-Driven Development CLI for AI coding agents

Your AI writes fast. The reasons disappear into chat.

**`sdd`** is a **local Spec-Driven Development CLI**: short steps, notes **in your repo**, so you, your team, and Copilot / Claude Code / Grok / Ollama stay aligned.

- No cloud process product  
- No required IDE extension  
- One AI at setup: Copilot, Grok, Claude Code, or Ollama  

| | |
|---|---|
| **Docs (start here)** | https://harsha09.github.io/spec-driven-development/tutorials/first-change/ |
| **Site** | https://harsha09.github.io/spec-driven-development/ |
| **npm** | https://www.npmjs.com/package/@structured-vibe-coding/cli |
| **MCP sources** | sdd *calls* org design-system / AST / API MCPs (`.sdd/mcp.yaml`) |
| **Needs** | Node 20+ · about 10 minutes for the first loop |

---

## Install

```bash
npm install -g @structured-vibe-coding/cli
```

---

## First loop (about 10 minutes)

```bash
cd your-app
sdd init --here --ai copilot     # or grok | claude | ollama
sdd doctor
sdd new "Fix empty list crash" -w hotfix -y --no-agent
# open the intent.md path it prints → write a few real sentences
sdd next --no-agent
sdd complete --no-agent
```

Use `--no-agent` while learning so nothing launches an AI window. Drop the flag later when you want help.

Full walkthrough: [docs/tutorials/first-change.md](./docs/tutorials/first-change.md)

---

## Common paths

```bash
# Normal feature
sdd new "Add CSV export" -w feature -y

# New product from one sentence
sdd greenfield "Team expense tracker for remote startups"
sdd backlog list
sdd backlog start F-001
```

| Guide | Link |
|-------|------|
| What is sdd? | [docs/concepts/what-is-sdd.md](./docs/concepts/what-is-sdd.md) |
| Everyday commands | [docs/guides/everyday-loop.md](./docs/guides/everyday-loop.md) |
| New product | [docs/guides/greenfield.md](./docs/guides/greenfield.md) |
| Enterprise | [docs/guides/enterprise.md](./docs/guides/enterprise.md) |

---

## Develop this monorepo

```bash
pnpm install && pnpm build && pnpm test
pnpm docs:dev
```

---

## License

MIT
