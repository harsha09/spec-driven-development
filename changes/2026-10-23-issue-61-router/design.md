# Design

> **Issue 61 router** · `2026-10-23-issue-61-router`

## Approach

Add a router next to the team config. It does not call a model. Issue #62 owns that pick. A missing rule asks the human.

## Seams

| Piece | Change |
|---|---|
| `matchRoute` | Returns a role, a reason, and a rule id, or ask-the-human |
| Rules file | `.sdd/routing.yaml`, tried in order |
| Owns and skills | After the file, one role file match |
| Stage owner | After that, the active workflow stage `owner` |
| Inbox | `.sdd/agents/<name>/inbox.jsonl` |
| Commands | `sdd role route`, `sdd role queue`, `sdd role take` |
| Handoff | The same typed note is appended to both inboxes |
| Lead | A matching rule names the lead. Otherwise one `lead:` in the accepted section is kept. Two named leads ask the human |
| Host stub | The `sdd` stub no longer maps stage names to planner, implementer, or reviewer |

A rule has `id`, `role`, and at least one of `stage`, `artifact`, `owns`, or `skill`. Every field that is set must match the item. The first match wins. Duplicate ids and unknown keys fail with `routing.yaml is invalid`. A missing file is not an error.

An `owns` rule matches the item artifact. A `skill` rule matches the item skill. The fallback does the same against role files. Zero matches continue. Two matches stop with `Two roles own this.`

`sdd role route` prints three lines: `role`, `reason`, and `rule`. With no flags it uses the active change stage and that stage's first artifact path. No active change prints `No active change.`

`sdd role take` writes one `type: item` line with `status: active` onto a bot of the routed role. A named bot must have that role. The bot's `wip` counts its active items. `role_wip` counts active items for every bot of that role. Either cap prints `<name> is at the limit.` An item id that is already active is not written again. Take writes nothing when the router asks the human.

`sdd role queue` prints each bot, then each inbox line. An empty inbox prints `(empty)`. A line that is not JSON fails with `inbox.jsonl is invalid`.

Handoff notes use the existing record: `type`, `from`, `to`, `change`, `section`, `decision`. They do not count as active items. Messaging that is off still writes nothing.

The software template ships `routing.yaml` and `sdd team init` copies it. Init still writes nothing when `team.yaml`, a template role, or that routing file already exists. Solo and research ship no routing file. Their roles still match on `owns` and `skills`.

The host stub line replaces the three stage-name rules. The rendered stub stays under 1400 characters.

## Risks

`pickLead` still decides that a lead is needed when several services share a module, or when services span modules. The choice of which lead is no longer the first section that mentions one. A project rule can name a different lead than the accepted section. That is the point of the rules file.
