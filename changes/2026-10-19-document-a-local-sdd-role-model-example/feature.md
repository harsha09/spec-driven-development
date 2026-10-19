# Feature

> **Document a local SDD_ROLE_MODEL example** · `2026-10-19-document-a-local-sdd-role-model-example` · 2026-10-19

Issue #47. Epic `issue-37`, story `S-003`. This story does not close #37. There is no hosted model.

## Problem / opportunity

`sdd role run` calls a model only through `SDD_ROLE_MODEL`. The child reads one JSON object `{"roleId","prompt"}` on stdin and writes one JSON object on stdout. `docs/reference/cli.md` describes the role command and does not show a child. A person who wants the three-pass loop has to reconstruct the prompt shapes from source.

## Users & value

A person wiring a local adapter. The example shows how pass 1, pass 2, and pass 3 differ, how a gap cite names a stored check id, how a revision lists every gap cite, and how a `write_file` action stops for Allow once, Always allow, or Deny.

## Scope

Add `docs/examples/role-model.mjs`. It uses only Node. It reads stdin, parses one JSON object, and writes one JSON object. It does not open a network connection and adds no dependency.

Prompt rules, matched in this order:

- The prompt contains `changed must list every gap cite.` This is the revision pass. The object has `text` `Revised draft.`, `changed` listing every cite in the `Gaps:` block (`<cite>: <text>` lines), and `action` `{name:"write_file", words:"Write the draft.", inputs:{path:"notes/draft.md", contents:<text>}}`.
- The prompt contains both `Draft:` and `Cite:`. This is the critique pass. The object has `text` `Checked the draft.` and `gaps` with one item. That item's `cite` is the first check id listed under `Check ids:`. That item's `text` is `The draft misses this check.`
- Otherwise this is the author pass. The object is `{text:"Draft from the local example."}` and has no `gaps`, `changed`, or `action`.

`docs/reference/cli.md` section `sdd role` shows this command and those three rules in a few sentences:

`SDD_ROLE_MODEL="node docs/examples/role-model.mjs" sdd role run builder --kind code --change <id> --section <section> --task "..."`

A test spawns the script with three fixture prompts and checks the JSON. The runner's existing stop still applies to `write_file`. This story does not change that stop.

## Non-goals

- Do not add a hosted model, an API key, or a network call.
- Do not change `runRole` prompt text.
- Do not close #37.
- Do not implement #45 or #46 in this story. Do not edit the gitignore paragraph in `docs/reference/cli.md`.

## Success criteria

- [x] The example script prints the author, critique, and revision objects for the three prompt shapes above.
- [x] The critique cite is a check id from the prompt, not a free-form sentence.
- [x] The critique object has its own `text`, and the gap `text` is `The draft misses this check.`
- [x] The revision object has `text` `Revised draft.`, `changed` equal to every gap cite, and a `write_file` action on `notes/draft.md`.
- [x] `docs/reference/cli.md` shows the `SDD_ROLE_MODEL` command and says the action stops for Allow once, Always allow, or Deny.
- [x] The script imports no package and does not reference a network host.

## Risks / open questions

The example is a fixture, not a model. It always returns the same author text. That is enough to show the contract.
