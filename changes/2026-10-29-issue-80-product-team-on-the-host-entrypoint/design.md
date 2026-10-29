# Design

> **Issue 80 product team on the host entrypoint** · `2026-10-29-issue-80-product-team-on-the-host-entrypoint`

## Approach

Option 1 from the issue. Generate the block from `.sdd/team.yaml` when that file loads, and from `.sdd/roles/*.md` in name order when it does not. Put the same block on the files the host already reads. A user default applies only when the repo has neither a team file nor a role file.

## Seams

| Piece | Change |
|---|---|
| `loadProductTeam` | Repo roster, or the user default only when the repo has no team file and no role file |
| `renderProductTeamSection` | One numbered line: order, name, job, who accepts, role path. The stage hat does not replace this team |
| `agents.ts` | Insert that block into protocol, `AGENTS.md`, the installed host stub, active context, and the handoff |
| Refresh | Rewrite protocol, `AGENTS.md`, and the host stub only when the generated marker is unmodified |
| Stored source | Bot order, `job`, and `approvers` stay in `team.ts` and `profile.ts`. This change does not edit them |
| Host stubs | Stay `sdd`, `sdd-planner`, `sdd-implementer`, and `sdd-reviewer` |

`loadProductTeam` lives in `packages/core/src/role/entrypoint-team.ts`. It may read one root and return an ordered roster. It must not write host files, call `matchRoute` or `routeRole`, or run a role.

Order is the `bots` array, first `role` kept. If that file is missing or is not a valid team, order is the parsed role names, sorted by name, skipping hidden roles. Job is the role `job`. Who accepts is `approvers`, or `not named` when that list is empty or the role file is missing.

A `.sdd/roles/<name>.md` file that `readRole` does not parse still counts as a repo role file. The name-order roster lists it as job `not named` and accepts `not named`. The user default is not used. A valid `team.yaml` still sets the order and does not add role files the bot list does not name.

`productTeamHome()` is `SDD_HOME` or the home directory. The rendered user path stays `~/.sdd`.

`agents.ts` inserts the block and leaves an edited or unmarked generated file as it is. `## Stage behavior` and `## Role rules` stay. Active context and the handoff are rewritten when those writers run. With no active change, active context still gets the block. The handoff is written when a change id resolves.

## Risks

An unparsed role file used to be ignored, so a user team could replace the repo. The name-order line closes that. A hidden role stays off the name-order list. A valid bot list can still name it. Refresh does not create a missing `AGENTS.md` or host rule.
