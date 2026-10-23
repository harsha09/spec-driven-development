# Feature

> **Issue 61 router** · `2026-10-23-issue-61-router` · 2026-10-23

## Reading

A router sends one work item to the role that owns it. Plain rules in `.sdd/routing.yaml` are tried first. If none match, a role file whose `owns` or `skills` list names the item is used. A workflow stage owner is used after that. No match asks the human. This slice does not call a model. Each bot takes one active item unless its own limit says otherwise, and an optional per-role limit caps every bot of that role. `sdd role route`, `sdd role queue`, and `sdd role take` are the commands. A handoff writes the same typed note into both inboxes.

## Source

Issue #61, as filed. The product manager proposes this reading. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue already names the rules file, the inbox path, the three commands, the per-bot limit, and the optional per-role limit. That request is one product. The question for the person is whether leaving the model pick for issue #62 still matches the request.

Proposed checks, not a recorded decision:

- `sdd role route` prints a role, a reason, and a rule id. The first matching rule in `.sdd/routing.yaml` wins.
- When no rule matches, one role that lists the artifact under `owns`, or the skill under `skills`, is chosen. Two such roles ask the human.
- When that still misses, the active workflow stage's `owner` is used. Otherwise the command prints `Ask the human.` and does not call a model.
- A bot at its `wip` limit cannot take another active item. `role_wip` caps every bot of that role. The software template already sets developer `wip` 1 and `role_wip` 2.
- `sdd role queue` shows each inbox. `sdd role take` writes one active item into a bot that has room.
- A handoff appends one typed note to both `.sdd/agents/<name>/inbox.jsonl` files.
- A missing owner on the task network asks the human when more than one lead is named. One named lead in the accepted section still works when no rule matches.

## Non-goals

- No model selection. That is issue #62.
- No approval matrix and no review tied to a commit SHA. That is issue #63.
- No QA role on the software template. That is issue #71.
- A role still cannot accept a spec, record a QA result, or generate a release.
- Epic #58 stays open. This change does not start issues #62 through #66.
