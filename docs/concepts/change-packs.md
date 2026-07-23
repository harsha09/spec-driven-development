# Change packs and memory

> **What:** Two lifetimes of knowledge — stable product memory vs PR-scoped packs.

## What · When · How

| | |
|--|--|
| **What** | `changes/<id>/` packs + `memory/*.md` |
| **When** | Every change gets a pack; memory only for durable truths |
| **How** | `sdd new` creates packs; promote lessons into memory after complete |

## PREP

**Point:** Don’t dump every feature into one living wiki page.

**Reason:** PR-scoped docs stay reviewable; memory stays short and agent-loadable.

**Example:** After complete, move a non-negotiable into `memory/constitution.md` — never auto-edit constitution during refine.

**Point:** Packs are the unit of work; memory is the unit of product law.

## Layout

```text
memory/index.md       ← map (stable)
memory/constitution.md
changes/<id>/         ← this PR’s specs + meta.yaml
.sdd/protocol.md      ← process rules for agents
.sdd/active-context.md
```

## So what / Now what

**So what:** Agents and humans share the same trail for *this* change.

**Now what:** [First change tutorial](/tutorials/first-change) · [Refine](/guides/refine)  
