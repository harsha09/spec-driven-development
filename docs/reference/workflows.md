---
title: Built-in sdd workflows
description: Default Spec-Driven Development workflow packs — hotfix, patch, feature, greenfield, spike, enterprise-feature, team-software — stages and when to use each.
---

# Built-in workflows

Shipped under `.sdd/workflows/` after `sdd init` (from package defaults). List anytime:

```bash
sdd workflows
```

The same command prints a cl100k token count for each workflow file and for each artifact template. When a change is active, it also counts that change's artifact files. It does not print a dollar cost.

A project initialized by an older `sdd` may be missing packs this CLI ships. `sdd workflows` names those under `Not copied yet`. Copy them with `sdd init --here --force`. That command leaves a file alone when its bytes differ from the bundled file. A file that still matches is recorded, so a later upgrade can refresh it.

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
| **`spike`** | Time-boxed research / PoC | intent → research → outcome |
| **`enterprise-feature`** | Platform / regulated / multi-team work | feature → hl_arb (hard gate) → lld → db_design → code_research → stories → tasks → implement → local_verify |
| **`team-software`** | An optional stage pack you can name with `-w` | requirements → clarifications → hld → lld → plan → test_plan → implement → pr_review → qa_testing → qa_signoff → po_review → po_signoff. Each stage is a hard human gate |

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

`sdd new` scores keywords and complexity hints in the title (e.g. “typo” → hotfix, “ARB” / “migration” → enterprise-feature). You can always force `-w <name>`. `team-software` is selected by name, or when the title contains `team-software`. It is one stage pack.

## Roles follow the workflow you name

A role is a file you create. The stages it follows are the stages of the workflow you pass to `sdd new -w`.

```bash
sdd role create analyst --label "Analyst" --job "Write the reading" --stages intent,design
sdd role create builder --label "Builder" --job "Build the change" --stages implement,local_verify
sdd new "Add CSV export" -w feature -y
sdd role route
```

`--stages` is a comma-separated list of stage ids from that workflow. The same role can list ids from more than one workflow, such as `intent` on `feature` and `intent` on `hotfix`. `sdd role route` uses the list for the active stage. Two roles listing the same stage asks you. When no role lists the stage, a workflow that already names an `owner` still uses that owner. `sdd role edit <name> --stages ...` replaces the list.

## Stage owners

A stage may name who produces it and who they work with. A gate may name who approves it. Older packs omit these fields and keep working.

```yaml
owner: product-manager
collaborates: [architect]
gate:
  type: hard
  mode: human_approval
  approvers: [human]
```

`items_from: tasks/T-*.md` writes one row to `items.yaml` for each matching file when that stage starts. The row id is the file name without its extension. A later sync keeps `done` on the same id. `team-software` sets this on implement, and the plan stage writes `tasks/T-001.md`. Every `team-software` stage is a hard gate whose approver is `human`, so `sdd next` waits for `sdd team signoff` on that commit. Merge stays a person action after `po_signoff`.

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
