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
  .generated.json     ← hashes of the workflows/templates sdd wrote (commit it)
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

### Re-running `sdd init --force`

Your edits under `.sdd/` survive an upgrade:

- **`config.yaml`:** your values always win. Only keys added in a newer sdd version are filled in, and comments are kept. When nothing is missing, the file is not touched.
- **`workflows/` and `templates/`:** a file is refreshed to the new default only while it still matches the hash in `.sdd/.generated.json`, meaning nobody has changed it since sdd wrote it. Edited files, and files sdd has no record of writing, are kept and listed. Without `--force`, existing files are never replaced.
- To take the new default for a file you edited, delete it and re-run `sdd init --force`.
- **`active-context.md` and `handoff.md`:** these are generated briefs. sdd rewrites them on every stage change, so don't keep notes there.
- **`agents.json`:** sdd updates its own keys and keeps any others.

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

