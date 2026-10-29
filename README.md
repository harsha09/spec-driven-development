# sdd — Spec-Driven Development CLI for AI coding agents

Your AI writes fast. The reasons disappear into chat.

**sdd** (**Structured Vibe Coding**, npm `@structured-vibe-coding/cli`) is a **local Spec-Driven Development CLI**: short steps, notes **in your repo**, so you, your team, and Copilot / Claude Code / Grok / Ollama / Kilo Code stay aligned.

- No cloud process product
- No required IDE extension
- One AI at setup: Copilot, Grok, Claude Code, Ollama, or Kilo Code

| | |
|---|---|
| **Docs (start here)** | https://harsha09.github.io/spec-driven-development/tutorials/first-change/ |
| **Site** | https://harsha09.github.io/spec-driven-development/ |
| **npm** | https://www.npmjs.com/package/@structured-vibe-coding/cli |
| **Roadmap** | [ROADMAP.md](./ROADMAP.md) (priorities P0–P3, intent for implementers) |
| **MCP sources** | sdd *calls* org design-system / AST / API MCPs (`.sdd/mcp.yaml`) |
| **Needs** | Node 24+ · about 10 minutes for the first loop |

---

## Install

```bash
npm install -g @structured-vibe-coding/cli
```

---

## First loop (about 10 minutes)

```bash
cd your-app
sdd setup --no-agent
sdd go "Fix empty list crash" --no-agent
# answer the question it prints
sdd go --answer "People who open an empty list" --no-agent
```

`sdd setup` creates three roles when the folder has no roles yet. A **role** is a job in the repo. A **duty** is the kind of work it does: the planner plans the change, the architect names the modules, and the builder builds the change pack. The **mapping** is which stages of the workflow you named belong to that duty. `sdd go` asks one question at a time. With `SDD_ROLE_MODEL` set, the role writes the note and the guide hands the next stage to the next role. You still decide.

What they are, why that split helps, and how to set up a software team: [docs/guides/roles.md](./docs/guides/roles.md).

To pick one AI host yourself:

```bash
sdd init --here --ai copilot     # or grok | claude | ollama | kilo
sdd new "Fix empty list crash" -w hotfix -y --no-agent
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
| Start in 10 minutes | [docs/tutorials/first-change.md](./docs/tutorials/first-change.md) |
| Roles and duties | [docs/guides/roles.md](./docs/guides/roles.md) |
| Everyday commands | [docs/guides/everyday-loop.md](./docs/guides/everyday-loop.md) |
| New product | [docs/guides/greenfield.md](./docs/guides/greenfield.md) |
| Enterprise | [docs/guides/enterprise.md](./docs/guides/enterprise.md) |

---

## Name a team (optional)

The first loop does not need this.

```bash
sdd team init --template software
sdd team show
sdd role context developer --text "This app uses pnpm."
sdd new "Ship the export" -w team-software -y
sdd team signoff --note "I accept this stage"
```

`team-software` stops on every stage until a person signs that commit. A role prepares the page and does not sign. Merge stays with you after product-owner sign-off. Who owns each stage, and the commands that assign those stages, are in [docs/guides/roles.md](./docs/guides/roles.md).

`sdd role room` prints the active change. A change id in that position is read as a command. Notes: [docs/reference/cli.md](./docs/reference/cli.md).

---

## Develop this monorepo

```bash
pnpm install && pnpm build && pnpm test
pnpm docs:dev
```

---

## License

MIT
