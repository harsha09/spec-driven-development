# Feature

> **Hand off work and the task network** · `2026-10-19-hand-off-work-and-the-task-network` · 2026-10-19

Issue #37, development-order item 2. Epic `issue-37`, story `S-004`. This story does not close #37.

## Problem / opportunity

`sdd role run` can draft and can ask a different role to critique. It cannot hand a task to another role, and it cannot tell one named service from a cross-scope task. A lead must not start writing before the person accepts a plan.

## Users & value

A person who already has role files and an accepted section. They hand one task to the owner of that section, or they ask which service, connection, or lead plan applies. Messaging between roles can be turned off.

## Scope

Slice 1 behavior stays. This story adds messaging, handoff, group, and the task network. Names below are the stdout sentences.

### Messaging

`.sdd/role.yaml` may contain `role_messaging`. Missing, or boolean `true`, means on. Boolean `false` means off. Any other value is invalid.

`sdd role messaging on` writes `role_messaging: true` and prints `Messaging between roles is on.`
`sdd role messaging off` writes `role_messaging: false` and prints `Messaging between roles is off.`

An existing `approval_timeout_minutes` stays. A missing file is created with only the messaging key. An invalid file prints `role.yaml is invalid` and is not rewritten.

### Accepted section lines

Inside an accepted section (`decision:` and `accepted: yes`, same rules as today), these trimmed lines are read. Other lines, including the words frontend and backend, are not names.

- `service: <id>` and `module: <id>` and each id in `connection: <id> <id>` match `/^[a-z][a-z0-9-]{0,39}$/`.
- `owner: <role>` and `lead: <role>` use a canonical role name.
- `connection:` has exactly two ids.
- `scope: product` marks the product-lead section.

A section that is not accepted does not contribute names. This story does not rewrite `accepted.md`.

### Handoff

`sdd role handoff <from> --to <role> --task "..." --change <id> --section <id>`

Check order. The first failure returns and writes no conversation line:

1. A name that is not canonical prints `A role name is not valid.`
2. The same role on both sides prints `A role cannot hand off to itself.` No model call.
3. A missing role prints `Role not found.`
4. A task that matches `/@X|x\.com|twitter\.com/` prints `X is not a role tool.`
5. A missing accepted section prints `This needs an accepted section before a draft.`
6. The section lists one or more `owner:` lines and `--to` is not one of them. Print `One owner handles this section.`
7. Messaging is off. Exit 0. Print `Messaging between roles is off.` No model call and no conversation line.
8. No model prints `No role model is configured.`
9. Invalid `role.yaml` prints `role.yaml is invalid`

On success the runner appends the same object to both conversation logs, then calls the model once with `roleId` equal to `--to`:

`{"type":"handoff","from":"<from>","to":"<to>","change":"<id>","section":"<id>","decision":"<decision>"}`

The prompt is Job, Description, Task, `Kind: handoff`, Section, Decision, and Section text. It does not include the sender memory file or the sender transcript.

The receiver log then follows the existing finish rules for that one reply: text only, Allow once / Always allow / Deny, Ask first, a forbidden action, or `This action is not available in this slice.` The sender log gets one more object and nothing else from the receiver transcript:

`{"type":"handoff_reply","from":"<to>","to":"<from>","change":"<id>","section":"<id>","decision":"<decision>","summary":"<reply text>"}`

A failed model call writes no `handoff_reply`. Stdout and the exit code are the receiver's. The approval stop is only in the receiver log.

### Group

`sdd role group --change <id>` prints each `owner:` from accepted sections, in file order, once. No owners prints `No roles in this group.` Exit 0. It does not call a model and does not post anywhere.

### Task network

`sdd role network --change <id> --section <id> --task "..."` reads that section and the other sections in the same file. It does not rewrite the file. A missing file, a missing section, or a section that is not accepted prints `This needs an accepted section before a draft.` No model call and no plan file.

The first matching case wins. The other cases do not run.

1. Connection. The section itself is an accepted connection, or an accepted connection's two ids include the `service:` on this section. Use the first such connection section in the file. Its `owner:` lines, in file order and without duplicates, are the owner list. Print `Connection hands off. Lead is absent.` and then each owner on its own line. For each consecutive pair, append the handoff object to both conversation logs. The object cites that connection section and its decision. No model call. Messaging off prints only `Messaging between roles is off.` and writes no handoff line. `accepted.md` bytes stay the same.
2. No `service:` line on any accepted section. Print `One scope. No lead.` No plan file and no model call.
3. Exactly one distinct `service:` value, and case 1 did not match. Print `Service <name> runs <owner>.` The owner is the `owner:` on the accepted section that has that `service:`. No plan file and no model call. A missing owner line prints `This service needs an owner.` A missing role file prints `Role not found.`
4. Cross-scope. This is the only case that calls the lead. A service's module is the `module:` line on the accepted section that has that `service:`. A missing `module:` line means that service has no module. All distinct services in the file are involved. A module lead applies only when every involved service has the same module and that module has more than one service. The lead is the first `lead:` on an accepted section with that `module:`. A product lead applies only when the involved services have more than one module id. The lead is the first `lead:` on an accepted section with `scope: product`. Anything else, including two services that have no module, prints `One scope. No lead.` and does not call a lead. A missing lead line prints `This module needs a lead.` or `This product needs a lead.` A missing lead role prints `Role not found.`

The lead prompt includes `--task`, the service ids, the module id of each service or `none`, the owners, and the decision ids. It does not include any file under `.sdd/role-runs/memory/` and does not include `allow.json`.

The reply has `text` and `plan`. `plan` is a list of root nodes. Each node has `scope`, `owner`, `decision`, `after`, `artifact`, `boundary`, and optional `children`. `boundary` is `ask` or `stop`. `scope` is a named service or module id. `owner` is an existing role. `decision` and every `after` id are decision ids already on accepted sections. `artifact` must pass the slice 1 safe relative path check, or the plan is not valid. `children` is a list of nodes. A child that has a non-empty `children` list is depth 3.

A bad plan prints `The plan is not valid.` A plan deeper than 2 prints `A plan is deeper than 2.` Neither writes a plan file and neither changes `rebuilds` or `stalled`. That call does not block a later `sdd role network` on the same section.

A valid plan is stored at `.sdd/role-runs/plans/<change>/<section>.json` with `status: pending`, `rebuilds: 0`, `stalled: false`, `task` set to the `--task` string, and no `results` yet. Stdout is `Accept this plan before anyone writes.` then one line per node, parent before its children: `<scope> <owner> <decision> after <ids-or-none> artifact <artifact> boundary <boundary>`. No specialist is called.

`sdd role network accept --change <id> --section <id>` with no plan file prints `No plan is stored.` A plan whose status is not `pending` prints `The plan is not waiting for acceptance.` A pending plan becomes `accepted` and prints `Plan accepted.` Accept does not call a model and does not reset `rebuilds` or `stalled`.

`sdd role network run --change <id> --section <id>` with no plan file prints `No plan is stored.` A `pending` plan prints `Accept this plan before anyone writes.` A `done` plan prints `The parent is done.` Only `accepted` or `open` runs nodes. One command runs every node that is ready, then any node that became ready because those results arrived, including a parent after its children in that same command. A node is ready when every `after` id has a result and every child has a result. Each ready node is one model call as that owner. The prompt includes the task text stored on the plan, the node artifact, and the boundary. It does not include another role's memory or transcript. The result stored on the plan is only `{decision, artifact, summary}` where `summary` is the reply `text`. The plan file has no transcript. The owner's conversation log can hold the model line. An action still stops on that owner's run and is not applied.

A node that is still not ready is not called. Stdout includes `A branch is waiting for its prerequisites.` While any node has no result, status is `open` and stdout includes `The parent stays open.` When every node has a result, status is `done` and stdout includes `The parent is done.`

`sdd role network rebuild --change <id> --section <id>` with no plan file prints `No plan is stored.` It calls the lead once when `rebuilds` is 0, or when `rebuilds` is 1, `stalled` is false, and the current plan is `accepted`. Otherwise it prints `A second rebuild does not start.` and does not call the model. A bad or too-deep reply leaves the plan, `rebuilds`, and `stalled` unchanged. A reply with the same artifact ids leaves the nodes and the status in place, prints `Stopped. The plan made no progress.`, sets `stalled` true, and increments `rebuilds`. A later rebuild while `stalled` is true does not call the model. A reply with different artifact ids stores the new plan as `pending`, sets `stalled` false, and increments `rebuilds`. Specialists do not run until the person accepts that plan.

### Docs

`docs/reference/cli.md` section `sdd role` gains these commands in a few sentences. The local model example stays. The connectors sentence becomes `Connectors and routines are not in this slice.`

## Non-goals

- Do not add connectors, routines, Slack, Teams, a page, or a schedule.
- Do not run commit, push, tag, pull request, merge, or deploy.
- Do not call `createChange`, `sdd next`, or `sdd complete`.
- Do not close #37.
- Do not change the critique or revision prompt text.
- Do not edit `packages/core/src/report.ts`, `packages/core/src/agents.ts`, or a `feature.yaml`.

## Success criteria

- [x] Messaging off blocks a handoff before any model call or conversation line, and turns back on.
- [x] A handoff to the same role writes nothing and calls no model.
- [x] A handoff to the section owner writes the same handoff object on both logs, calls the receiver once, and stores only a summary on the sender log.
- [x] An owner line that does not name `--to` prints `One owner handles this section.`
- [x] One named service prints `Service <name> runs <owner>.` and creates no plan file. Frontend and backend in the body add no service.
- [x] An accepted connection prints `Connection hands off. Lead is absent.`, writes handoff lines, and leaves every decision line unchanged.
- [x] A cross-scope plan is not stored until it is valid and at most depth 2, and no specialist runs before accept.
- [x] A branch with an unmet `after` id does not call the model. The parent stays open until every node has a result. The stored result has no transcript.
- [x] A second rebuild does not start unless the previous rebuild was accepted. A no-progress rebuild keeps the nodes.
- [x] `sdd role group` lists accepted owners and does not call a model.

## Risks / open questions

The lead plan is a file under `.sdd/role-runs/`, which is gitignored. The person accepts it with `sdd role network accept` on this machine. This story does not copy that file into the change pack.
