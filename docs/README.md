# Documentation hub

Parent page for **Structured Vibe Coding (`sdd`)**. Start here; open only the leaf you need.

Root [README](../README.md) = product pitch + install + quickstart.  
**This folder** = durable how-to and ops docs for the tool.

---

## Read this next

| If you want… | Open |
|--------------|------|
| Install and first change | [../README.md](../README.md) → *How to use it* |
| AI agents (Copilot / Claude), not IDEs | [ide-and-agents.md](ide-and-agents.md) |
| CI, Node version, publish automation | [ci-cd.md](ci-cd.md) |
| VS Marketplace / VSIX publish | [marketplace-publish.md](marketplace-publish.md) |
| When SDD fits real teams | [scenario-evaluation.md](scenario-evaluation.md) |

---

## Package READMEs (install-focused)

| Package | Doc |
|---------|-----|
| CLI (`sdd`) | [../packages/cli/README.md](../packages/cli/README.md) |
| Core library | [../packages/core/README.md](../packages/core/README.md) |
| VS Code / Cursor extension | [../packages/vscode/README.md](../packages/vscode/README.md) |
| IntelliJ plugin | [../packages/intellij/README.md](../packages/intellij/README.md) |

---

## How *app teams* should maintain docs (using `sdd`)

`sdd` does not replace your org wiki. It models **two lifetimes** in the app repo:

| Lifetime | Where | Owner |
|----------|--------|--------|
| **Stable** (product, architecture, conventions) | `memory/` | Tech lead / architect |
| **Change-scoped** (this PR/feature) | `changes/<id>/` | Change author |
| **History** | `archive/<id>/` | — |
| **Optional domains** | `domains/` | Domain owners |

**Parent router in the app:** after `sdd init`, use **`memory/index.md`** as the map. Agents and humans start there, then open the linked stable pages, then the active change pack (see `.sdd/active-context.md`).

```text
memory/index.md          ← hub (stable map)
memory/product.md
memory/architecture.md
memory/conventions.md
changes/<id>/…           ← feature docs for this work
.sdd/protocol.md         ← SDD process rules for agents
.sdd/active-context.md   ← live stage snapshot
```

**Do not** dump every feature design into one living mega-doc. Prefer change packs; promote durable lessons into `memory/` when the change completes.

---

## Contributing to these docs

- Prefer **small leaf pages** over growing the root README.
- Link from this hub when you add a new leaf under `docs/`.
- Keep package READMEs short; deep content lives here or in the root quickstart.
