# Tasks

> **Issue #37: role create, run, and the accuracy loop** · `2026-10-19-issue-37-role-create-run-and-the-accuracy-loop` · 2026-10-19

Implement slice 1 from `design.md`. Do not add a page, a connector, or slice 2 or 3. Do not edit `packages/core/src/agents.ts` or `packages/core/src/report.ts`. Do not call `createChange` or `getActiveChangeId`. Do not close issue #37.

## Role profile

- [x] Add `packages/core/src/role/` and export it from `packages/core/src/index.ts`. A role file is `.sdd/roles/<name>.md` with YAML front matter (`name`, `label`, `job`, `ask_first`, `pinned`, `hidden`) and a description body.
- [x] Reject an empty name, `.`, `..`, `/`, `\`, and a name longer than 80 characters with `A role name is not valid.` Spaces are allowed. An empty job on create, edit, or run exits 1 with `A role needs a job.` and writes no run file.
- [x] Implement create, edit, pin, hide, show, duplicate, and delete as in `design.md`. Hide only sets `hidden: true`. Show lists `<name> <label>`, pinned first, and omits hidden roles unless `--all`. Duplicate writes `<name> copy` and does not copy conversation or memory. Delete removes the role file, `.sdd/role-runs/conversation/<name>/`, `.sdd/role-runs/memory/<name>/`, and that role's key in `allow.json`.

## Run, stop, and allow

- [x] `run` takes an injected clock and a `RoleModel` port. The run id is the UTC compact stamp (`2026-10-19T00:00:00.000Z` → `20261019T000000Z`). The log is `.sdd/role-runs/conversation/<name>/<run-id>.jsonl`.
- [x] Before any model call, and with no run file: empty job, `--with` equal to the author (`A role cannot review itself.`), a task containing `@X`, `x.com`, or `twitter.com` (`X is not a role tool.`), and `--kind` `code`, `scenario`, or `release` without an accepted section (`This needs an accepted section before a draft.`). That last sentence does not contain Allow once, Always allow, or Deny.
- [x] Read `changes/<change-id>/accepted.md` only. A section is `## <section-id>` until the next `## `. It is accepted when it has `decision: <id>` and `accepted: yes`. Store `- check: <id>` lines on the run before the model call. Do not write `accepted.md` or any active-change pointer.
- [x] Missing `SDD_ROLE_MODEL` when a call is required: `No role model is configured.`, exit 1, no run file. The CLI spawns that command with one JSON line on stdin and requires one JSON object on stdout. A non-zero child or non-JSON stdout spends the pass as `{"type":"bad_call","roleId":"..."}`.
- [x] One author call unless `--with` is a different role and the section is accepted. Then author, critic, and at most one revision. A gap cite must be a stored check id or `<section-id>:<decision-id>`. `changed` must list every gap cite. No fourth `complete` call.
- [x] Pending stops print `action.words` and `Allow once, Always allow, or Deny.` Ask first prints `Ask first. This stays stopped.` and does not apply an always-allow rule. Forbidden names (`accept_spec`, `replace_decision`, `write_qa`, `generate_release`, `sdd_next`, `sdd_complete`, `create_change`) print the draft and `A role cannot do that.` with no pending stop.
- [x] Allow once writes `write_file` only when the path is relative, has no empty, `.`, or `..` segment, is not under `.sdd/`, has no `.active` segment, and its last segment is not `accepted.md` (`not-accepted.md` stays allowed). `commit`, `push`, `tag`, `pull_request`, `merge`, and `deploy` record `unavailable` and do not run. Always allow matches the action name and deep-equal inputs. Deny writes nothing. Timeout comes from `.sdd/role.yaml` (`approval_timeout_minutes`, default 10). Expired allow does not run and does not save a rule. `--stop` appends `stopped` and leaves an applied file in place.

## Init, docs, and tests

- [x] Append `role-runs/` after `models/` in init's ignore list and update the full-string pins in `init-force.test.ts` and `search-s2.test.ts`. Do not ignore `roles/`.
- [x] Add `packages/cli/src/role-cmd.ts` and one `role` entry in `packages/cli/src/commands.ts`. Print role stdout without a consola prefix.
- [x] Add one short `sdd role` section to `docs/reference/cli.md`. A role file is not a host stub. Allow once writes only the named file. Connectors are not in this slice. Do not add a guide page and do not mention `sdd cost` in that section.
- [x] Cover the success criteria in `packages/core/src/__tests__/role.test.ts` with a fake clock and a fake port. Add a CLI test that runs create, show, and run with `SDD_ROLE_MODEL`. `sdd agents install --help` still describes one host.

## Checks

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
