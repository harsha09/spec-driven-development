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

