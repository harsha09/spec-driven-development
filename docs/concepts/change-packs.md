---
title: Change packs and product memory
description: How sdd separates PR-scoped change packs from durable product memory — discovery vs delivery packs, greenfield promote, and constitution.
---

# Change packs and memory

Long wikis get ignored. Chat disappears. Reviews need something in the middle.

**`sdd` keeps two kinds of notes:**

1. **Change pack** — for *this* task or PR (short-lived, easy to review)  
2. **Memory** — for product truths that should last (keep it short)

After work finishes, copy lasting rules into `memory/constitution.md` when they truly matter. The refine command never rewrites constitution for you.

**Pack = this work. Memory = product law.**

### Why markdown (not a binary store)?

Specs can look long, but **git markdown is the right default**:

- Reviewable in PRs next to code  
- Works offline with any editor  
- Agents and humans share the same files  
- No second database to sync  

Save **tokens on product source code** with `sdd context` (local AST) or **external MCP sources** ([guide](../guides/mcp)), not by inventing a private format for intent/design.

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
