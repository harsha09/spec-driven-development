# Feature

> **Issue #37: role create, run, and the accuracy loop** · `2026-10-19-issue-37-role-create-run-and-the-accuracy-loop` · 2026-10-19

Issue #37 is an epic. This change is slice 1 from that issue's development order. The epic stays open. This pull request does not close #37.

## Problem / opportunity

A person can install a host stub with `sdd agents install`, and that stub is not a product role. There is no role file, no separate conversation, and no stop that names one action before it runs. A draft is not checked by a different role.

## Users & value

The person messages one role about the product from the CLI. The role has one job and a durable description. Work that needs a decision stops in the person's words. Allow once runs only the action the stop named. A second role can critique a draft against an accepted section. The person still accepts the spec, the QA result, and the release.

## Scope

Slice 1, in `packages/core` and a thin `packages/cli` wrapper:

- `sdd role create`, `edit`, `pin`, `hide`, `show`, `duplicate`, `delete`, `run`, and `allow`.
- A role file at `.sdd/roles/<name>.md`. The file is the profile the product repo can commit. It holds the name, label, job, description, ask-first flag, pin, and hide. It does not hold a conversation, memory, or a secret.
- A run log at gitignored `.sdd/role-runs/conversation/<name>/<run-id>.jsonl`. The runner does not commit it and does not write `.sdd/handoff.md`. Delete removes that conversation directory.
- A plain-language stop, then Allow once, Always allow, Deny, and Ask first.
- The accuracy loop for one accepted section: plan check ids are stored by the runner, then one draft, one critique, and one revision. Pass 4 does not start.
- `sdd role run <role> --stop` ends the turn and does not undo a finished action.
- Init appends `role-runs/` to `.sdd/.gitignore`. `roles/` is not ignored.

The model is a port. Tests pass a fake. The CLI uses the command in `SDD_ROLE_MODEL` when a call is required. That command reads one JSON object on stdin and writes one JSON object on stdout. No new dependency and no network call from this slice.

## Non-goals

- A page, a hosted chat, accounts, Slack, Teams, and every other connector.
- Handoff between roles, groups, and the task network for services and modules. That is slice 2.
- Routines, schedules, and tracker clients. That is slice 3.
- Executing commit, push, tag, pull request, merge, or deploy. Slice 1 does not run git or a host. Those names are recognized so a file edit cannot trigger them. Allowing one of them records that this slice cannot run it.
- `sdd agents install`, host stubs, `packages/core/src/agents.ts` behavior, search, `report.ts`, and `createChange`.
- Accepting a spec, replacing a decision, writing a QA result, or generating a release. No approval grants those.
- An inbound MCP server, X, voice, and a second repository.
- Closing issue #37.

## Success criteria

- [x] An empty job writes nothing and exits non-zero.
- [x] Hide removes the role from the default list and does not write a paused flag. Duplicate creates `<name> copy`, copies the profile, and does not copy the conversation or memory.
- [x] Delete removes that role's file, conversation, and memory. A file outside `.sdd/roles/` and `.sdd/role-runs/` stays.
- [x] `sdd role run <role> --with <role>` exits non-zero, calls no model, and writes no record.
- [x] A task that contains `@X`, `x.com`, or `twitter.com` exits non-zero before a model call and writes no record.
- [x] `--kind code`, `scenario`, or `release` with no accepted section stops before a draft. The text does not offer Allow once, Always allow, or Deny.
- [x] A reading can be drafted. The runner does not mark the section accepted.
- [x] Ask first stays stopped even when an always-allow rule matches the same tool and the same inputs.
- [x] Allow once runs only the named `write_file`. It does not commit. Always allow matches the tool and the inputs. Deny applies nothing.
- [x] An approval older than the timeout is Expired and does not run. The default timeout is 10 minutes. Saving a rule from an expired stop does not run the action.
- [x] `accept_spec`, `replace_decision`, `write_qa`, `generate_release`, `sdd_next`, `sdd_complete`, and `create_change` are rejected before they run.
- [x] The runner does not call `createChange` and does not change the active change pointer.
- [x] With a different `--with` role, the runner stores the section's check ids, uses a separate model call per role id, rejects a bad cite, and does not make a fourth call.
- [x] Stop now writes a stop line and leaves an already applied `write_file` in place.
- [x] `sdd agents install` still only installs a host stub.

## Risks / open questions

- Slice 1 does not execute commit, push, tag, pull request, merge, or deploy. The epic checkbox that those actions run when named stays open for the connector slice.
- The person marks a section accepted by writing `changes/<id>/accepted.md`. The runner only reads it.
- No product choice is left open inside this slice. Slices 2 and 3 stay on issue #37.
