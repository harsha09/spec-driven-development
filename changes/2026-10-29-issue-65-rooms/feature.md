# Feature

> **Issue 65 rooms** · `2026-10-29-issue-65-rooms` · 2026-10-29

## Reading

A stage of one change has a room at `.sdd/rooms/<change>/<stage>.jsonl`. Members are the stage owner plus the roles in `collaborates`. Requirements on the software workflow is product-manager and architect. Stories is product-owner and dev-lead. A stage whose collaborates list has three names, and no extra owner, has three members. Two bots that share a role use the first bot in the team file. `sdd role review --roles` names a bot instead.

An entry is `post`, `objection`, `agree`, `block`, or `decision`. An objection without a cite is not written. `sdd role review` calls each member once. The prompt includes the critique lines. When an earlier round left an objection, the owner's prompt also includes the revision lines. Those two prompt functions are unchanged. A JSON reply is stored. One line of free text is a post when `models.yaml` is missing. When that file loads, `decide()` types the line. A rules decider still returns human, and the line stays a post.

`limits.room_rounds` sets the cap. The default is 2. After the capped round, an open objection or block appends one `room` line to `decisions.md` (who agreed, the sha or `none`, and the open cites) and one `decision-needed` line. The stage file is not rewritten. `meta.yaml` gates stay as they are. `sdd next` is not blocked.

`sdd role room` prints the room. `sdd role room post` appends one line a person wrote. No team file writes nothing.

Shipped team templates set `rooms.commit` to true, so a new team does not ignore rooms. `rooms.commit: false` appends `rooms/` to `.sdd/.gitignore`. `rooms.commit: true` removes that line and leaves the other lines. A bot loop reads a room file that already exists and, on `done`, appends one post. It does not create a room.

## Source

Issue #65 and the implementation plan on that issue. The research assistant, product manager, product owner, and architect proposed pieces of this reading. It is not an acceptance. The person accepts or corrects it.

## Product owner

A reading that left the templates at `commit: false`, omitted `room_rounds`, and never called the critique prompt would not match the issue. This reading turns the shipped switch on, stores the round cap, calls those prompts, and writes the consensus line.

Proposed checks, not a recorded decision: a citeless objection is refused; requirements names the two roles; three collaborator names make three posts; the first shared-role bot is used unless `--roles` names the other; a capped open room writes the cite and `decision-needed`; a person can post; free text is a post without models and `agree` when a decider says so; `commit: true` removes a `rooms/` ignore line; a loop posts only into a room that already exists; the stage file and the stage gate stay put.

## Non-goals

- Evidence by SHA, allowlisted checks, and worktrees (#66). Evidence ids may be stored and are not checked.
- A chat UI, a room that spans changes, and a rewrite of the stage file.
- Blocking `sdd next`, a `waiting_human` status, or a new gate.
- Calling the work router. The bot is the first of that role, or the bot `--roles` names.
- Rooms, tools, or a 13-stage sequence beyond this file.
