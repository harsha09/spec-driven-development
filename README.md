# Structured Vibe Coding (`sdd`)

**Local Spec-Driven Development** for solo engineers, product teams, and enterprises.

A CLI process coach plus your AI coding agent (GitHub Copilot, Grok Build, Claude Code, or **Ollama** for local models). Spec-first change packs in git — no cloud SDD product and no required IDE extension.

| | |
|---|---|
| **What** | Stages, workflows, change packs, agent handoff |
| **Who** | Hotfix on a laptop → multi-team ARB |
| **Needs** | Node 20+ (24 recommended) · one AI host at init |

---

## Documentation

| Question | Page |
|----------|------|
| What is sdd? | [docs/concepts/what-is-sdd.md](./docs/concepts/what-is-sdd.md) |
| What can I achieve? | [docs/concepts/what-you-can-achieve.md](./docs/concepts/what-you-can-achieve.md) |
| Which agents? | [docs/reference/agents.md](./docs/reference/agents.md) |
| Which workflows? | [docs/reference/workflows.md](./docs/reference/workflows.md) |
| Simple feature | [docs/guides/simple-feature.md](./docs/guides/simple-feature.md) |
| Enterprise | [docs/guides/enterprise.md](./docs/guides/enterprise.md) |
| First-run tutorial | [docs/tutorials/first-change.md](./docs/tutorials/first-change.md) |
| **Docs site** | https://harsha09.github.io/spec-driven-development/ · **Pages must use branch `gh-pages` (root) or GitHub Actions** — not “branch main /docs” (that serves Jekyll and breaks links) |

Local: `pnpm docs:dev`

---

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or: npx @structured-vibe-coding/cli --help
```

From this monorepo (if needed):

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
sdd new "Add CSV export" -w feature -y
# fill feature.md (real scope), then:
sdd next
# … design → tasks → implement → verify …
sdd complete
```

Hotfix: `-w hotfix`. Enterprise ARB path: `-w enterprise-feature` — see [enterprise guide](./docs/guides/enterprise.md).

---

## Develop this monorepo

```bash
pnpm install && pnpm build && pnpm test
pnpm docs:dev
```

---

## License

MIT
