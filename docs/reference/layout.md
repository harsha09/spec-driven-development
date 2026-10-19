---
title: Project folders after sdd init
description: What folders sdd creates in your app — .sdd, memory, changes, and optional AI host files — explained simply.
---

# Project folders

After `sdd init`, your app looks roughly like this:

```text
.sdd/                 ← sdd settings and the short playbook
  config.yaml
  protocol.md         ← rules for you + the AI
  active-context.md   ← what you’re doing right now
  handoff.md          ← brief the AI just saw
  mcp.yaml            ← external MCP sources sdd calls (optional)
  workflows/          ← paths like hotfix, feature, greenfield
  templates/
memory/               ← longer-lived product notes (keep short)
  index.md
  constitution.md     ← non-negotiables
  …
changes/              ← one folder per piece of work
  <id>/
    meta.yaml         ← stage + status
    *.md              ← short notes for this work
domains/              ← optional extra docs by area
AGENTS.md             ← tiny pointer for AIs
# only for the AI you picked:
# .github/agents/  or  .grok/rules/  or  .claude/agents/  or  .ollama/
```

## What belongs in git

Commit the shared process: `.sdd/config.yaml`, `.sdd/workflows/`, `.sdd/templates/`, `.sdd/protocol.md`, `memory/`, and each change pack under the configured changes directory.

Ignore per-machine files. Init writes `.sdd/.gitignore` for `handoff.md` and `active-context.md`, and `<changes_path>/.gitignore` for `.active` (by default `changes/.active`). `.active` is the live change pointer. `handoff.md` and `active-context.md` are a repo-relative handoff and task brief. Commands that move or launch work rewrite them; they do not change on every command. If git already tracks one of them, init warns and leaves the index alone. A second non-interactive `sdd init` without `--force` appends missing ignore lines, including `role-runs/`, and does not rewrite config, memory, or workflows. Confirming the re-init prompt in a terminal still behaves like `--force`. `sdd init --force` appends any missing ignore lines and refreshes unchanged generated files. `.sdd/prices.yaml` is committed project config, written by init when missing, and not regenerated over a user edit.

## Keep project data together

Use `--root` during initialization to place SDD's project data under one relative directory while keeping `.sdd/config.yaml`, workflows, and templates at their normal locations:

```bash
sdd init --here --root .sdd --ai copilot
```

This sets `memory_path`, `changes_path`, `domains_path`, and `archive_path` to `.sdd/memory`, `.sdd/changes`, `.sdd/domains`, and `.sdd/archive` before those folders are created. Without `--root`, existing defaults remain `memory/`, `changes/`, `domains/`, and `archive/`. If the default `memory/` already contains files, init preserves them and warns; use `--root .sdd` to avoid adding SDD memory documents alongside application documents.

### Optional: external MCP sources

`sdd init` creates an empty **`.sdd/mcp.yaml`**. Register design-system / org / AST servers with `sdd mcp sources add …` so sdd can pull context at the right stage. See [MCP sources](../guides/mcp).

After a **new product** path finishes, you may also see:

- `memory/product.md`
- `memory/requirements.md`
- `memory/features.md`
- `memory/architecture.md`

## Related

- [Change packs & memory](../concepts/change-packs)
- [Set up your AI](../guides/agents)
- [MCP sources](../guides/mcp)

