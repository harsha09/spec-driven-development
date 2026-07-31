# Project layout

> Directories after `sdd init` in an **app** repo.

```text
.sdd/
  config.yaml
  protocol.md
  active-context.md
  handoff.md
  workflows/             # includes greenfield.yaml after init
  templates/
memory/
  index.md               # documentation map
  constitution.md
  conventions.md
  product.md             # after greenfield complete (from vision)
  requirements.md        # after greenfield
  features.md            # F-NNN backlog; sdd feature start
  architecture.md
changes/
  <id>/
    meta.yaml
    *.md artifacts       # e.g. vision.md, feature.md, intent.md
domains/                 # optional
AGENTS.md                # if an agent was installed
.github/agents/          # copilot only
.claude/agents/          # claude only
.grok/rules/             # grok only
# ollama: same AGENTS.md + protocol pattern
```

## Related

- [Change packs concept](../concepts/change-packs)  
- [Greenfield guide](../guides/greenfield)  
- [Agents guide](../guides/agents)  
