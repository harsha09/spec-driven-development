---
title: Built-in sdd workflows
description: Default Spec-Driven Development workflow packs — hotfix, patch, feature, greenfield, spike, enterprise-feature — stages and when to use each.
---

# Built-in workflows

Shipped under `.sdd/workflows/` after `sdd init` (from package defaults). List anytime:

```bash
sdd workflows
```

Pick a pack at change start:

```bash
sdd new "My title" -w feature -y
# or let recommend pick from the title
sdd new "Fix null pointer on empty list" -y
```

## Packs

| Workflow | Best for | Stages (high level) |
|----------|----------|---------------------|
| **`hotfix`** | Typos, tiny fixes, renames | intent → implement → local_verify |
| **`patch`** | Small bugs / scoped fixes | intent → acceptance → implement → local_verify |
| **`feature`** | Normal product features | intent → optional clarify/brainstorm → design → optional clarify → tasks → optional clarify → implement → local_verify |
| **`greenfield`** | New product from a one-line idea | vision → requirements → features → architecture (then `sdd backlog start F-001`) |
| **`spike`** | Time-boxed research / PoC | intent → research → (notes) |
| **`enterprise-feature`** | Platform / regulated / multi-team work | feature → hl_arb (hard gate) → lld → db_design → code_research → stories → tasks → implement → local_verify |

Prefer the CLI entrypoint for product bootstrap:

```bash
sdd greenfield "Team expense tracker for remote startups"
# … fill stages …
sdd complete          # promotes vision/requirements/features/architecture → memory/
sdd backlog list
sdd backlog start F-001
```

See [Greenfield guide](../guides/greenfield).

## How recommendation works

`sdd new` scores keywords and complexity hints in the title (e.g. “typo” → hotfix, “ARB” / “migration” → enterprise-feature). You can always force `-w <name>`.

## Per-change controls

```bash
sdd skip clarify_intent -r "scope is clear"
sdd use feature -r "grew past a patch"
sdd gate approve -n "ARB approved with condition …"
```

## Related

- [Greenfield (new product)](../guides/greenfield)  
- [Simple feature](../guides/simple-feature)  
- [Enterprise guide](../guides/enterprise)  
- [Customize workflows](../guides/customize)  
