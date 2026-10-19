# Design

> **Issue #37: role create, run, and the accuracy loop** · `2026-10-19-issue-37-role-create-run-and-the-accuracy-loop` · 2026-10-19

Slice 1 only. Modules live under `packages/core/src/role/`. The CLI file is `packages/cli/src/role-cmd.ts`. It calls core. Do not add role branches to `packages/cli/src/commands.ts` beyond one `role` entry. Do not edit `packages/core/src/agents.ts` or `packages/core/src/report.ts`.

## Role file

Path: `.sdd/roles/<name>.md`. Create the directory on create.

The name is trimmed. Reject an empty name, `.`, `..`, a name containing `/` or `\`, and a name longer than 80 characters. The file name is the name plus `.md`. Spaces are allowed. `builder copy` is a legal name.

Front matter is YAML between two `---` lines:

```yaml
name: builder
label: Builder
job: Implement the accepted change
ask_first: false
pinned: false
hidden: false
```

The body after the front matter is the description. `ask_first`, `pinned`, and `hidden` default to false. An empty or missing `job` makes create and edit exit 1 with `A role needs a job.` and write nothing. Run of a stored role whose job is empty does the same.

## Commands

| Command | Behavior |
|---|---|
| `sdd role create --name <name> --label <label> --job <job>` | Writes the file. Optional `--description <text>` and `--ask-first`. Exit 1 if the file exists. |
| `sdd role edit <name> [--label] [--job] [--description] [--ask-first true\|false]` | Updates only the flags that were passed. Does not touch conversation or memory. |
| `sdd role pin <name>` | Sets `pinned: true`. |
| `sdd role hide <name>` | Sets `hidden: true`. Does not write a paused or routine field. |
| `sdd role show` | Lists roles that are not hidden. Pinned roles first, then name. One line: `<name> <label>`. |
| `sdd role show <name> [--all]` | Prints that role. `show` with no name and `--all` includes hidden roles. |
| `sdd role duplicate <name>` | Writes `<name> copy` with the same label, job, description, ask-first, pin, and hide. Does not copy `.sdd/role-runs/memory/<name>/` or the conversation. Exit 1 if the copy name exists. |
| `sdd role delete <name>` | Deletes the role file, `.sdd/role-runs/conversation/<name>/`, and `.sdd/role-runs/memory/<name>/`. Removes that role's key from `allow.json`. Does not delete another role's files or any product file. |
| `sdd role run <name> --task <text>` | Starts a run. Optional `--with`, `--kind`, `--section`, `--change`. |
| `sdd role run <name> --stop` | Appends one stop line for that role's latest run and exits 0. No model call. |
| `sdd role allow <run-id> --once\|--always\|--deny` | Resolves the pending stop. |

Exit 1 with `Role not found.` when the name is missing. Stdout for a stop that offers a choice ends with the line `Allow once, Always allow, or Deny.` A stop that must not offer a choice does not contain those three phrases.

## Model port

```ts
interface RoleModel {
  complete(input: { roleId: string; prompt: string }): Promise<string>;
}
```

Core functions take the port as an argument. The CLI builds it from `SDD_ROLE_MODEL` only when a call is required. The child receives one JSON line on stdin: `{"roleId","prompt"}`. Its stdout must be one JSON object. A missing variable, a non-zero child, or a non-JSON stdout is a failed call.

These exits happen before the port is used, write no run file, and do not require `SDD_ROLE_MODEL`:

- empty job
- `--with` equal to the author role: stdout `A role cannot review itself.`
- task contains `@X`, `x.com`, or `twitter.com`: stdout `X is not a role tool.`
- `--kind` is `code`, `scenario`, or `release` and the named section is not accepted

The last of those writes no draft. Stdout is `This needs an accepted section before a draft.`

A reading (`--kind` omitted or `reading`) may call the model. The runner does not write `accepted.md`.

## Accepted section

The person owns `changes/<change-id>/accepted.md`. The runner never writes it. `--change` selects the directory and does not read or write `.sdd` active pointer or `changes/*/.active`.

A section starts at a heading `## <section-id>` and continues until the next `## ` heading. Inside it, a line `decision: <id>` and a line `accepted: yes` mark it accepted. Lines `- check: <id>` are the check ids, in file order. The runner stores those ids on the run before any model call. The model does not choose them.

`--section` is required for `code`, `scenario`, and `release`. `--change` is required for those kinds too.

## Run record

Directory `.sdd/role-runs/conversation/<name>/`. File `<run-id>.jsonl`, one JSON object per line. `run-id` is the UTC compact stamp from the injected clock. The runner appends between calls. It does not commit the file. Delete removes this directory. Duplicate does not copy it.

Init's `.sdd/.gitignore` list gains `role-runs/` after `models/`. `ensureIgnoreEntries` appends it when missing. `roles/` is not an ignore entry. Update the tests that pin the full ignore text.

Memory for a role is `.sdd/role-runs/memory/<name>/notes.md`. Slice 1 creates that file only when `sdd role edit` is not the path. A run does not rewrite memory. Delete removes that directory. Duplicate does not create one for the copy.

## Model JSON

The port returns one object:

```json
{
  "text": "plain sentence",
  "gaps": [{ "cite": "CHK-001", "text": "what is missing" }],
  "changed": ["CHK-001"],
  "action": { "name": "write_file", "words": "Save the empty state in src/a.ts", "inputs": { "path": "src/a.ts", "contents": "ok\n" } }
}
```

`gaps` and `changed` and `action` may be omitted. `text` is required. A missing `text` or invalid JSON spends that pass: append `{"type":"bad_call","roleId":"..."}` and do not retry that pass.

## Accuracy loop

Used only when `--with` is a different role and `--section` names an accepted section. Otherwise one author call, then the stop.

Order, and then stop:

1. Author draft. Pass 1.
2. Other role critique. Pass 2. The prompt includes the stored check ids and the draft text. A gap cite must be one of those check ids, or the exact string `<section-id>:<decision-id>`. Any other cite makes the critique bad. A bad critique spends pass 2 and does not start a revision.
3. Author revision only when the critique has at least one valid gap. Pass 3. `changed` must list every gap cite. A mismatch spends pass 3.
4. No fourth `complete` call.

An empty gap list after a valid critique ends the loop before pass 3. Each `complete` call receives only that call's `roleId`.

The check against an accepted section is this loop. The runner compares cites to the stored ids. It does not ask the model whether the spec covers the task.

## Stop and allow

After the loop, if `action` is present, append `{"type":"pending","action":...}` and print `action.words`, then the choice line. If `action` is absent, print `text` and do not print the choice line.

`ask_first: true` on the author role prints `Ask first. This stays stopped.` and does not apply an always-allow rule. The pending record remains pending until Deny or until it expires. Allow once and Always allow are refused while ask-first is set, with stdout `Ask first. This stays stopped.`

Timeout is `approval_timeout_minutes` in `.sdd/role.yaml`. Missing file means 10. A non-number or a number below 0 exits 1 with `role.yaml is invalid` before a model call. `expiresAt` is the run clock plus that many minutes.

`sdd role allow <run-id> --deny` appends `{"type":"denied"}` and writes no product file.

`--once` on `write_file` writes `inputs.contents` to `inputs.path` only when that path is relative, has no empty, `.`, or `..` segment, is not under `.sdd/`, does not have `accepted.md` as its last segment, and has no segment named `.active`. `not-accepted.md` is allowed. Otherwise stdout is `A role cannot do that.` and no file is written. A successful write appends `{"type":"applied","name":"write_file"}`. It does not run git. The runner never writes `accepted.md` and never writes an active-change pointer.

`--always` saves `{tool, inputs}` in `.sdd/role-runs/allow.json` under the role name, then applies the same write. A later run whose action name and inputs deep-equal that rule applies the write without a new pending stop, unless ask-first is set. Inputs are compared as JSON with sorted keys.

`--once` or `--always` on `commit`, `push`, `tag`, `pull_request`, `merge`, or `deploy` does not run a process and does not write a product file. Stdout is `This action is not available in this slice.` The pending record becomes `{"type":"unavailable"}`.

These names are rejected before apply, including when the stop names them and the person passes `--once`: `accept_spec`, `replace_decision`, `write_qa`, `generate_release`, `sdd_next`, `sdd_complete`, `create_change`. Stdout is `A role cannot do that.` Append `{"type":"rejected"}`. The same sentence is used when the action name is one of those during the run, before `allow`. The pending stop is not created for them. The draft text is still printed without the choice line.

Allow after `expiresAt` prints `Expired. The action did not run.` and does not write a product file. `--always` on an expired stop does not add a rule.

`--stop` appends `{"type":"stopped"}` to the latest run for that role. It does not delete a file that an earlier `applied` line wrote.

The active change id is read only to assert it is unchanged at the end of `run` and `allow`. Tests set a known id and expect the same id.

## Docs

Add one short section `sdd role` to `docs/reference/cli.md` after the agents install section. State that a role file is not a host stub, that Allow once writes only the named file, and that connectors are not in this slice. Do not add a page under `docs/guides/`.

## Tests

`packages/core/src/__tests__/role.test.ts` covers the success criteria with a fake clock and a fake port. Count `complete` calls. A CLI test runs `role create`, `role show`, and `role run` against the fake by spawning the CLI with `SDD_ROLE_MODEL` set to a fixture script. `sdd agents install --help` still describes one host.

Do not call a network. Do not add a dependency.
