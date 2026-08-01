---
title: Why sdd exists
description: Why local Spec-Driven Development beats pure vibe coding and heavy enterprise SDD. sdd pairs a CLI process spine with your AI coding agent — portable, progressive, no IDE lock-in.
---

# Why sdd exists

> Agents need a process spine. Humans need it light enough to keep.

## Two failures you already know

**Unstructured vibe coding** ships. Then the *why* evaporates — chat threads, lost context windows, PRs that only show the diff.

**Heavy enterprise SDD** keeps the trail — and often blocks solos, weekend projects, and anyone who just needed a three-line fix.

Teams bounce between “move fast and forget” and “process theater.” Neither is good enough when the agent can generate a thousand lines before you finish a ticket title.

## The bet

**`sdd` is the spine. The agent is the writer.**

- Process lives in the **repo** (YAML workflows, markdown packs, optional gates) — not in a cloud SDD product you cannot take home.  
- Ceremony **scales with risk**: hotfix stays three stages; feature can deepen; enterprise can require ARB.  
- **One playbook** (`.sdd/protocol.md`) and live context — not a zoo of skills packs and IDE plugins.  
- **Spec Kit–style** init: pick **one** AI host (`--ai grok|copilot|claude|ollama`). Use any editor.

## What we refuse

- Required IDE extensions  
- Hosted collaboration suite as the source of process truth  
- Skills packs replacing a single readable playbook  
- Mandatory archive or evidence folders (opt-in only)

## Who this is for

| You | Why you care |
|-----|----------------|
| Solo / small team | Structure without ceremony tax |
| Product team | Same trail in every PR; agents share `memory/` |
| Enterprise | Hard gates and reviewable packs **next to the code** |

## Prove it in ten minutes

Do not take the manifesto on faith. Run one loop:

**→ [Your first change](../tutorials/first-change)**  
Then the daily rhythm: [Everyday loop](../guides/everyday-loop)  
Or a full product spine: [Greenfield](../guides/greenfield)

## Related

- [What is sdd](./what-is-sdd)  
- [Change packs & memory](./change-packs)  
- [Agents vs IDEs](./agents-vs-ides)  
