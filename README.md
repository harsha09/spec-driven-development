# sdd — Structured Vibe Coding

**Local Spec-Driven Development** for AI coding agents.

Your agent ships code in minutes. The *decisions* still vanish into chat. **`sdd`** is a CLI process coach that keeps intent, design, and verify notes **next to the code** — from a one-line hotfix to a new product or enterprise ARB.

No cloud SDD product. No required IDE extension. One AI host at init (Copilot, Grok, Claude Code, or **Ollama**).

| | |
|---|---|
| **What** | Stages, workflows, change packs, agent handoff |
| **Who** | Solo hotfixes → multi-team ARB |
| **Needs** | Node 20+ (24 recommended) · one AI host at init |
| **Docs** | https://harsha09.github.io/spec-driven-development/ |
| **npm** | [`@structured-vibe-coding/cli`](https://www.npmjs.com/package/@structured-vibe-coding/cli) |

---

## Documentation

| Question | Page |
|----------|------|
| **Start in 10 minutes** | [First change tutorial](./docs/tutorials/first-change.md) |
| What is sdd? | [docs/concepts/what-is-sdd.md](./docs/concepts/what-is-sdd.md) |
| Why this exists | [docs/concepts/why-sdd.md](./docs/concepts/why-sdd.md) |
| New product (greenfield) | [docs/guides/greenfield.md](./docs/guides/greenfield.md) |
| Simple feature | [docs/guides/simple-feature.md](./docs/guides/simple-feature.md) |
| Enterprise | [docs/guides/enterprise.md](./docs/guides/enterprise.md) |
| Workflows · Agents · CLI | [docs site](https://harsha09.github.io/spec-driven-development/) |

Local docs: `pnpm docs:dev`

---

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or: npx @structured-vibe-coding/cli --help
```

From this monorepo:

```bash
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
```

---

## Quick start

```bash
cd your-app
sdd init --here --ai copilot     # or grok | claude | ollama (required)
sdd doctor
sdd new "Fix empty list crash" -w hotfix -y
# fill intent.md with real sentences, then:
sdd next
# … implement → verify …
sdd complete
```

**New product from a one-liner:**

```bash
sdd greenfield "Team expense tracker for remote startups"
# vision → requirements → features → architecture → sdd complete
sdd feature list
sdd feature start F-001
```

Hotfix: `-w hotfix`. Feature: `-w feature`. Enterprise ARB: `-w enterprise-feature`.  
Guides: [first change](./docs/tutorials/first-change.md) · [greenfield](./docs/guides/greenfield.md) · [enterprise](./docs/guides/enterprise.md).

---

## Keywords

`sdd` · spec-driven development · structured vibe coding · AI coding agent · local SDD · greenfield · Copilot · Claude Code · Grok · Ollama

---

## Develop this monorepo

```bash
pnpm install && pnpm build && pnpm test
pnpm docs:dev
```

---

## License

MIT
