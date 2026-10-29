---
title: Built-in sdd workflows
description: Default Spec-Driven Development workflow packs — hotfix, patch, feature, greenfield, spike, enterprise-feature, team-software — plus the roles, duties, and the stage each duty follows.
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

## Roles, duties, and the workflow they follow

A role is a markdown file in `.sdd/roles`. The job in that file is its duty. The stage ids on its `stages` list are the stages it follows. `sdd setup` writes three roles when that folder has no markdown files. Pass `-w` to name the workflow those lists come from. The default is `feature`. Role files that are already there stay as they are, and setup prints `Roles are already here.`

### The three duties

`sdd setup` writes these roles. Each one proposes. The person decides.

| Role | Duty | Job | Owns | Skill | Never | Asks |
|------|------|-----|------|-------|-------|------|
| planner | planning | Plan the change | the request, the plan | plan the change | accept a spec, write product code | Who is this for? How will you know it worked? |
| architect | architecture | Name the modules | the design | name the modules | accept a spec, write product code | Which module owns this change? |
| builder | construction | Build the change | the change pack | build the change | accept a spec, generate a release | |

Builder has an empty ask list.

A named stage id keeps that duty on every workflow:

| Duty | Stage ids |
|------|-----------|
| planning | intent, vision, requirements, feature, stories, clarify_intent, brainstorm, hl_arb, research, outcome, plan |
| architecture | design, architecture, clarify_design, lld, db_design, code_research |
| construction | tasks, clarify_tasks, implement, local_verify, acceptance, pr_review |

A stage id outside those lists takes its duty from where it sits in that workflow. Before the first architecture id, it is planning. From the first construction id onward, it is construction. Between those two, it is architecture. On `team-software`, `clarifications` and `hld` sit before `lld`, so they are planning. `test_plan` sits between `lld` and `implement`, so it is architecture. `qa_testing`, `qa_signoff`, `po_review`, and `po_signoff` sit at or after `implement`, so they are construction. `stories` and `plan` are named planning ids, so they stay planning after the architecture stages.

### Which duty follows which stage

`sdd setup -w <workflow>` gives each role the stages of that one workflow. A stage id is shared, so a role that lists `intent` also matches `hotfix`, `patch`, `feature`, and `spike`.

| Workflow | Planner (planning) | Architect (architecture) | Builder (construction) |
|----------|--------------------|--------------------------|------------------------|
| hotfix | intent | no stage on this workflow | implement, local_verify |
| patch | intent | no stage on this workflow | acceptance, implement, local_verify |
| feature | intent, clarify_intent, brainstorm | design, clarify_design | tasks, clarify_tasks, implement, local_verify |
| greenfield | vision, requirements, features | architecture | no stage on this workflow |
| spike | intent, research, outcome | no stage on this workflow | no stage on this workflow |
| enterprise-feature | feature, hl_arb, stories | lld, db_design, code_research | tasks, implement, local_verify |
| team-software | requirements, clarifications, hld, plan | lld, test_plan | implement, pr_review, qa_testing, qa_signoff, po_review, po_signoff |

Name your own roles and the stages they follow:

```bash
sdd role create analyst --label "Analyst" --job "Write the reading" --stages intent,design
sdd role create builder --label "Builder" --job "Build the change" --stages implement,local_verify
sdd new "Add CSV export" -w feature -y
sdd role route
```

`--stages` is a comma-separated list of stage ids. `sdd role edit <name> --stages ...` replaces the list. Two roles listing the same stage asks you.

### Software roles and the team-software owners

`sdd team init --template software` writes six roles. Each file carries the job, what the role owns, and what it never does. Add stage ids with `--stages`. Until you do, `sdd role route` uses the workflow stage `owner` when a role file of that name exists. `solo` writes one developer whose job is "Build the accepted change on your own." `research` writes one researcher whose job is "Answer one question and leave the notes in the repo."

| Role | Job |
|------|-----|
| product-manager | Turn a request into a short reading the person can accept |
| architect | Name the modules and the seams between them |
| product-owner | Say whether the reading matches the request |
| dev-lead | Name who builds the next piece when more than one role is involved |
| developer | Build the accepted change for one service |
| qa | Propose what to try and the evidence the person can record |

The shipped routing file has one rule. The skill `name the next owner` goes to dev-lead.

Setup's architect and the software template's architect are the same file, `.sdd/roles/architect.md`. Setup writes that file when `.sdd/roles` has no markdown files. With the software roles already present, add stages with `sdd role edit architect --stages lld,pr_review`.

On `team-software`, each stage names an owner and who they work with:

| Stage | Owner | Works with |
|-------|-------|------------|
| requirements | product-manager | architect, research-assistant |
| clarifications | product-manager | research-assistant |
| hld | architect | product-manager |
| lld | architect | developer |
| plan | dev-lead | architect, developer |
| test_plan | qa | developer |
| implement | developer | dev-lead |
| pr_review | architect | dev-lead |
| qa_testing | qa | developer |
| qa_signoff | qa | product-owner |
| po_review | product-owner | product-manager |
| po_signoff | product-owner | qa |

`research-assistant` is the collaborator on requirements and clarifications. Create that role when you want it in the repo. The six roles above are the ones the software template writes.

A role prepares the page. The person signs with `sdd team signoff`. Every `team-software` gate is a hard human gate. Merge stays a person action after `po_signoff`.

### How a stage picks a role

`sdd role route` tries these, in order:

1. A rule in `.sdd/routing.yaml` whose stage, artifact, owns, or skill matches.
2. One role whose `owns` list names the artifact, or whose `skills` list names the skill. Two matches print `Ask the human.` and `Two roles own this.`
3. One role whose `stages` list contains the stage id. Two matches print `Ask the human.` and `Two roles list this stage.`
4. The workflow stage's `owner`, when a role file has that name.
5. `Ask the human.` and `No rule matched.`

The handoff writes `Owner` from the workflow stage's `owner` field. Hotfix, patch, feature, greenfield, spike, and enterprise-feature leave that field unset, so the handoff has no Owner line. `team-software` sets it to the owner in the table above.

## Stage owners

The people for `team-software` are in [Roles, duties, and the workflow they follow](#roles-duties-and-the-workflow-they-follow). A stage may name who produces it and who they work with. A gate may name who approves it. Older packs omit these fields and keep working.

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
