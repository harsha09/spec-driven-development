---
title: Change packs and product memory
description: How sdd separates PR-scoped change packs from durable product memory — discovery vs delivery packs, greenfield promote, and constitution.
---

# Change packs and memory

Wiki pages grow forever. Chat disappears. PR reviews need something in between.

**`sdd` uses two lifetimes of knowledge:** short, reviewable **change packs** for this PR, and short **product memory** for what must stay true after the PR.

After complete, promote a true non-negotiable into `memory/constitution.md`. Refine never auto-edits constitution.

**Packs are the unit of work. Memory is the unit of product law.**

## Layout

```text
memory/index.md            ← map (stable)
memory/constitution.md
memory/product.md          ← after greenfield (from vision)
memory/requirements.md     ← after greenfield
memory/features.md         ← backlog; sdd feature start F-001
memory/architecture.md
changes/<id>/              ← this PR’s specs + meta.yaml
.sdd/protocol.md           ← process rules for agents
.sdd/active-context.md
```

| | |
|--|--|
| **Packs** | Every change via `sdd new` or `sdd greenfield` / `sdd feature start` |
| **Memory** | Durable truths only — promote after complete (greenfield auto-promotes product spine) |
| **Shared trail** | Agents and humans read the same files for *this* change |

## Two kinds of packs

| Kind | How it starts | What it produces |
|------|---------------|------------------|
| **Discovery (greenfield)** | `sdd greenfield "idea"` | Vision, requirements, `F-NNN` backlog, architecture → promoted into `memory/` on complete |
| **Delivery (feature / hotfix / …)** | `sdd new "…"` or `sdd feature start F-001` | Specs + code for one PR-sized slice |

Greenfield does **not** implement the whole product in one pack. It writes the product spine; each backlog row becomes its own delivery pack.

## Related

- [Greenfield guide](../guides/greenfield)  
- [First change tutorial](../tutorials/first-change)  
- [Refine](../guides/refine)  
