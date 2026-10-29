---
title: Roles and duties
description: What a role and a duty are, why they help, and how to set up planner, architect, and builder — or a software team — so each one follows the workflow you name.
---

# Roles and duties

A **role** is a job that lives in your repo. A **duty** is the kind of work that job does. **Workflow mapping** is the list of stages that duty follows on the workflow you name.

You set that up once. Then `sdd go` asks the role that owns the current stage. When `SDD_ROLE_MODEL` is set, that role writes the note and the guide hands the next stage to the next role. You still decide.

---

## What they are

A role is the file `.sdd/roles/<name>.md`. The file holds:

| Field | What it is |
|-------|------------|
| Job | The one sentence this role is here to do |
| Owns | The thing this role is responsible for |
| Skill | The line another rule can match, such as `plan the change` |
| Never | Work this role leaves alone |
| Asks | Questions `sdd go` puts to you, one at a time |
| Stages | The stage ids of a workflow that this role follows |

A duty is one of three kinds of work. `sdd setup` writes one role for each:

| Role | Duty | What that duty is |
|------|------|-------------------|
| planner | planning | Turn the request into a plan the person can answer |
| architect | architecture | Name the modules the change touches |
| builder | construction | Build the change pack: tasks, the implementation note, and the local check |

The mapping is which stage ids of which workflow land on which duty. `intent` is planning on hotfix, patch, feature, and spike. `design` is architecture on feature. `implement` is construction on every workflow that has it. You choose the workflow with `sdd setup -w`. The default is `feature`.

A role proposes. The person decides. A role prepares a page and does not sign a gate.

---

## How they help

You describe the work once. The guide picks the next stage from the role's list.

With `SDD_ROLE_MODEL` set:

- The planner asks who the change is for, then how you will know it worked, and writes the reading.
- The architect asks which module owns the change, and writes the design.
- The builder writes the tasks and the implementation note.
- `sdd go` prints `Handoff: planner to architect.` when the work moves. The next role sees the request and the answers already given.
- The planner and the architect have `write product code` on their never list, so during `sdd go` their writes stay inside the change pack. The builder does not generate a release. Push, a pull request, and merge stay with you.
- The same three duties follow a hotfix, a feature, a new product, or `team-software`. A hotfix has no design stage, so the architect has no stage there and the builder takes implement and the local check.
- A software team can use named jobs — product manager, QA, product owner — and `team-software` already names who prepares each stage. Each of those stages waits until you sign that commit.

`sdd role route` prints who has a stage. Two roles listing the same stage asks you, so the handoff has one owner.

---

## Set up the three duties

Run this in your app folder **before any role files exist**:

```bash
sdd setup --no-agent
```

Setup initializes the folder and writes planner, architect, and builder for the `feature` workflow. You should see:

```text
Ready.
Workflow: feature.
planner: intent, clarify_intent, brainstorm
architect: design, clarify_design
builder: tasks, clarify_tasks, implement, local_verify
Next: sdd go "what you want to build"
```

Then ask the planner its questions:

```bash
sdd go "Fix empty list crash" --no-agent
sdd go --answer "People who open an empty list" --no-agent
sdd go --answer "An empty list shows a message" --no-agent
```

The first command prints `Who is this for?` The second prints `How will you know it worked?` On a terminal, `sdd go` asks in place, so you can type the answer there.

The questions do not need a model. The draft does. Set `SDD_ROLE_MODEL` to a command that reads one JSON object (`roleId` and `prompt`) on stdin and writes one JSON object on stdout. With that set, the `sdd go` that finishes the planner's questions writes the reading, skips the optional clarify and brainstorm stages, and prints `Handoff: planner to architect.` The architect then asks which module owns the change. After that answer, the architect writes the design and the builder takes the tasks. Without the variable, that step prints `No role model is configured.`

`--no-agent` means no AI host is installed. It does not set `SDD_ROLE_MODEL`. `--ai copilot` installs the host that `sdd new` and `sdd next` open. The guide still writes through `SDD_ROLE_MODEL`.

Name the workflow while the roles folder is still empty. These are the same command, one workflow each:

```bash
sdd setup -w hotfix --no-agent
sdd setup -w greenfield --no-agent
sdd setup -w team-software --no-agent
```

On hotfix the print is `planner: intent`, `architect: no stage on this workflow`, and `builder: implement, local_verify`.

Add your AI host in the same setup when you want it:

```bash
sdd setup --ai copilot
sdd doctor
sdd go "Fix empty list crash"
```

When role files are already in `.sdd/roles`, setup prints `Roles are already here.` and leaves them. Change a list with `sdd role edit`.

Give a role facts about this repo. The next run includes them:

```bash
sdd role context planner --text "This app is an expense tracker. An empty list should show a message."
```

### What each duty does

| Role | Job | Owns | Skill | Never | Asks |
|------|-----|------|-------|-------|------|
| planner | Plan the change | the request, the plan | plan the change | accept a spec, write product code | Who is this for? How will you know it worked? |
| architect | Name the modules | the design | name the modules | accept a spec, write product code | Which module owns this change? |
| builder | Build the change | the change pack | build the change | accept a spec, generate a release | |

The builder has an empty ask list. It drafts and hands on.

### Which stages each duty follows

`sdd setup -w <workflow>` writes this map onto the three role files. A stage id is shared, so a role that lists `intent` also matches every workflow that has `intent`.

| Workflow | Planner | Architect | Builder |
|----------|---------|-----------|---------|
| hotfix | intent | no stage on this workflow | implement, local_verify |
| patch | intent | no stage on this workflow | acceptance, implement, local_verify |
| feature | intent, clarify_intent, brainstorm | design, clarify_design | tasks, clarify_tasks, implement, local_verify |
| greenfield | vision, requirements, features | architecture | no stage on this workflow |
| spike | intent, research, outcome | no stage on this workflow | no stage on this workflow |
| enterprise-feature | feature, hl_arb, stories | lld, db_design, code_research | tasks, implement, local_verify |
| team-software | requirements, clarifications, hld, plan | lld, test_plan | implement, pr_review, qa_testing, qa_signoff, po_review, po_signoff |

Named stage ids keep their duty on every workflow. Planning ids are `intent`, `vision`, `requirements`, `feature`, `stories`, `clarify_intent`, `brainstorm`, `hl_arb`, `research`, `outcome`, and `plan`. Architecture ids are `design`, `architecture`, `clarify_design`, `lld`, `db_design`, and `code_research`. Construction ids are `tasks`, `clarify_tasks`, `implement`, `local_verify`, `acceptance`, and `pr_review`.

Any other stage id takes its duty from where it sits. Before the first architecture id, it is planning. From the first construction id onward, it is construction. Between those two, it is architecture. That is why `hld` is planning and `test_plan` is architecture on `team-software`, and why `stories` and `plan` stay planning after the design stages.

To point the three roles at a different workflow after setup, replace each list:

```bash
sdd role edit planner --stages intent
sdd role edit architect --stages design,clarify_design
sdd role edit builder --stages implement,local_verify
sdd role route --stage=intent
```

`--stages` replaces the whole list. One role per stage id. Two roles listing the same id makes `sdd role route` ask you.

---

## Set up your own roles

Use this when the three duties are the wrong split for your repo.

```bash
sdd role create analyst --label "Analyst" --job "Write the reading" --stages intent,requirements
sdd role edit analyst --job "Write the reading" --stages intent,clarify_intent,brainstorm
sdd new "Add CSV export" -w feature -y
sdd role route
```

`--stages` is a comma-separated list of stage ids from the workflow you pass to `sdd new -w`. The same role can list ids that appear on more than one workflow.

---

## Set up a software team

Use this when you want named jobs and a sign-off on every stage. Start from a folder that does **not** already have `.sdd/roles/architect.md`. Setup's architect and this template's architect are that same file, and the template writes nothing if one of its role files is already there.

```bash
sdd team init --template software
sdd team show
sdd new "Ship the export" -w team-software -y
```

The template writes six roles. Each file carries the job, what the role owns, and what it never does. It does not list stage ids. `solo` writes one developer whose job is "Build the accepted change on your own." `research` writes one researcher whose job is "Answer one question and leave the notes in the repo."

| Role | Job | Useful for |
|------|-----|------------|
| product-manager | Turn a request into a short reading the person can accept | The reading and the clarifications |
| architect | Name the modules and the seams between them | High-level design, low-level design, and the pull-request review |
| product-owner | Say whether the reading matches the request | The review and the final sign-off |
| dev-lead | Name who builds the next piece when more than one role is involved | The plan, and the skill `name the next owner` |
| developer | Build the accepted change for one service | Development |
| qa | Propose what to try and the evidence the person can record | The test plan, the testing note, and the QA sign-off |

The shipped routing file has one rule. The skill `name the next owner` goes to dev-lead.

Give each role the stages you want it to follow. This is the mapping that matches the workflow owners:

```bash
sdd role edit product-manager --stages requirements,clarifications
sdd role edit architect --stages hld,lld,pr_review
sdd role edit dev-lead --stages plan
sdd role edit developer --stages implement
sdd role edit qa --stages test_plan,qa_testing,qa_signoff
sdd role edit product-owner --stages po_review,po_signoff
sdd role route --stage=requirements
```

Until you add a list, `sdd role route` uses the owner on the workflow stage when a role file of that name exists.

| Stage | Who prepares it | Works with |
|-------|-----------------|------------|
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

`research-assistant` is named on requirements and clarifications. Create that role when you want it in the repo:

```bash
sdd role create research-assistant --label "Research assistant" --job "Gather evidence for the reading" --stages research
```

Every `team-software` stage is a hard gate. `sdd go` and `sdd next` stop until you sign the current commit. A role prepares the page. You sign. Merge stays a person action after `po_signoff`.

```bash
sdd team signoff --note "I accept this stage"
```

The sign-off stores your git name and the commit SHA. A new commit needs a new sign-off. Your git name has to be listed under humans in `.sdd/team.yaml`.

---

## See who has the stage

```bash
sdd role route
sdd role route --stage=implement
```

Route tries these, in order:

1. A rule in `.sdd/routing.yaml`.
2. One role whose `owns` list names the artifact, or whose `skills` list names the skill. Two matches print `Ask the human.` and `Two roles own this.`
3. One role whose `stages` list contains the stage id. Two matches print `Ask the human.` and `Two roles list this stage.`
4. The workflow stage's `owner`, when a role file has that name.
5. `Ask the human.` and `No rule matched.`

The handoff writes an `Owner` line from that workflow field. Hotfix, patch, feature, greenfield, spike, and enterprise-feature leave the field unset. `team-software` sets it to the owner in the table above.

Workflow packs and the gate fields are in [Workflows](../reference/workflows). Commands are in the [CLI reference](../reference/cli).
