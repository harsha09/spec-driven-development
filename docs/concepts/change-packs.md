# Change packs and memory

> Two lifetimes of knowledge: stable product memory, and PR-scoped packs.

Don’t dump every feature into one living wiki page. PR-scoped docs stay reviewable; memory stays short and agent-loadable.

After complete, promote a true non-negotiable into `memory/constitution.md`. Refine never auto-edits constitution.

**Packs are the unit of work. Memory is the unit of product law.**

## Layout

```text
memory/index.md       ← map (stable)
memory/constitution.md
changes/<id>/         ← this PR’s specs + meta.yaml
.sdd/protocol.md      ← process rules for agents
.sdd/active-context.md
```

| | |
|--|--|
| **Packs** | Every change via `sdd new` |
| **Memory** | Durable truths only — promote after complete |
| **Shared trail** | Agents and humans read the same files for *this* change |

## Related

- [First change tutorial](../tutorials/first-change)  
- [Refine](../guides/refine)  
