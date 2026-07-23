# Project layout

> **Reference:** Directories after `sdd init` in an **app** repo.

## What / When / How

| | |
|--|--|
| **What** | Scaffold paths |
| **When** | After init; when debugging “where is X?” |
| **How** | Paths below |

```text
.sdd/
  config.yaml
  protocol.md
  active-context.md
  handoff.md
  workflows/
  templates/
memory/
  index.md
  constitution.md
  …
changes/
  <id>/
    meta.yaml
    *.md artifacts
domains/                 # optional
AGENTS.md                # if an agent was installed
.github/agents/          # copilot only
.claude/agents/          # claude only
.grok/rules/             # grok only
```

## Related

- [Change packs concept](/concepts/change-packs)  
- [Agents guide](/guides/agents)  
