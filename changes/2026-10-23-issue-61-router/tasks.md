# Tasks

> **Issue 61 router** · `2026-10-23-issue-61-router`

1. Add `matchRoute`, `routeRole`, `queueRole`, and `takeRole`. Rules in `.sdd/routing.yaml` win. Then one `owns` or `skills` match. Then the active stage owner. No match asks the human and does not call a model.
2. Store work items in `.sdd/agents/<name>/inbox.jsonl`. `take` refuses a bot at `wip` and a role at `role_wip`. An invalid inbox or rules file fails closed.
3. Append the existing handoff record to both inboxes. When several leads are named and no rule matches, ask the human. One named lead stays.
4. Add `sdd role route`, `sdd role queue`, and `sdd role take`. Copy `routing.yaml` from the software template on `sdd team init`. Point the `sdd` host stub at the router.
5. Cover a winning rule, two owners, a busy bot, the role cap, both inboxes, and the single named lead with Vitest. Document the three commands.
