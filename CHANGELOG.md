# Changelog

Release notes for each version are also generated on the GitHub Releases page when a version is published. This file keeps the notes that need more than a line, such as a compatibility window.

## Unreleased

### Changed

- **One reply family: every reply has a `kind`.** Each prompt now asks for one JSON object with a `kind` (`draft`, `question`, `critique`, `revision`, `post`, `objection`, `agree`, `block`, `plan`, `tool`, `check`, `ask`, `done` or `plan_tree`) and offers only its own kinds. The prompts and their snapshots show the new shape. A room entry's `type` and a loop step's `step` are now `kind`. A question is `{"kind": "question", "text": "..."}` instead of a text that starts with `Question:`. The list is in [Prompts and reply kinds](docs/maintainers/prompts.md).
- `docs/examples/role-model.mjs` replies in the new shape.

### Compatibility window

- **The old reply shapes are still accepted for one minor release.** A reply with no `kind`, a room entry with `type`, and a loop step with `step` (and the older loop aliases `stop`, `act` and a bare `{"text": ...}`) are read as before, so an `SDD_ROLE_MODEL` adapter written for the old prompts keeps working. They are removed in the next minor release after this one, or later, and only if the logs show no hits. Update a model adapter to send `kind` before then.
- **Each old shape that is read is logged once per run** as a `legacy_shape` line. A role run, a loop run, a hand-off and a network owner write it to their run log. A room round, a lead plan and `sdd go` write it to `.sdd/role-runs/legacy-shapes.jsonl`.
- A reply that has a `kind` is never read as an old shape. A `kind` the prompt did not offer gets one repair try, like any other reply that is not valid.
