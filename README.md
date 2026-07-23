# Structured Vibe Coding (`sdd`)

Flexible, **local-first Spec-Driven Development** for software engineers.

**What:** A CLI process coach (`sdd`) plus your AI coding agent (Grok, Copilot, or Claude).  
**So what:** Spec-first change packs without cloud lock-in or a required IDE extension (Spec Kit–style).  
**Now what:** Install, init once, run your first change — full narrative lives in the docs site.

| | |
|---|---|
| **Who** | Solo engineers and small teams (YAML scales policy) |
| **Where** | Your laptop only |
| **How** | CLI + one AI agent host |

---

## Documentation (start here)

**Beautiful, structured docs (Diátaxis + PREP / PSB / What·So what·Now what):**

| | |
|---|---|
| **Docs site** | After Pages is enabled: `https://harsha09.github.io/spec-driven-development/` |
| **In repo** | [`docs/`](./docs/) — run `pnpm docs:dev` locally |
| **Tutorial** | [First change](./docs/tutorials/first-change.md) |
| **Why** | [Why sdd exists](./docs/concepts/why-sdd.md) |
| **CLI** | [Command reference](./docs/reference/cli.md) |

How we write docs: [`docs/how-we-write.md`](./docs/how-we-write.md).

---

## Install

**Requirements:** Node.js 24+ · [pnpm](https://pnpm.io) for building from source

### npm (when published)

```bash
npm install -g @structured-vibe-coding/cli
sdd --help
```

### From this repository

```bash
git clone https://github.com/harsha09/spec-driven-development.git
cd spec-driven-development
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
sdd --help
```

Packages: `@structured-vibe-coding/cli` · `@structured-vibe-coding/core`

---

## 5-minute path

```bash
cd your-app
sdd init --here --ai grok          # or copilot | claude
sdd new "Fix empty list crash" -w hotfix -y
# fill changes/<id>/intent.md (real text, not empty template)
sdd next
# implement…
sdd next
sdd complete
```

Everyday loop, refine, agents, AST context → **[docs guides](./docs/guides/everyday-loop.md)**.

---

## Develop this monorepo

```text
packages/
  core/   engine + workflows + code-context + refine
  cli/    sdd binary
```

```bash
pnpm install    # husky pre-commit → typecheck
pnpm build
pnpm test
pnpm docs:dev   # VitePress docs site
pnpm docs:build
```

CI, releases: [docs/maintainers/ci-cd.md](./docs/maintainers/ci-cd.md).

---

## License

MIT
