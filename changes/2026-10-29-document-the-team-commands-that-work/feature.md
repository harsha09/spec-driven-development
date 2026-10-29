# Feature

> **Document the team commands that work** · `2026-10-29-document-the-team-commands-that-work` · 2026-10-29

This is a proposal. The person has not signed it.

## Problem

The CLI reference says `` `sdd role room [change]` `` prints a room. Running that form reads the change id as an unknown command. `sdd role room` with no extra words prints the active room. `sdd role room --stage=<stage>` prints that stage. `sdd role room --stage <stage>` reads the stage id as a command. `sdd role room post` accepts `--change` and `--stage` as separate words.

The README, the npm package README, the home page, the agents guide, and the everyday loop do not mention a named team. Readers of those pages still see only the day-one loop.

## Users

A person installing `sdd` from npm or reading the docs site.

## Scope

Correct the room sentences in `docs/reference/cli.md`. Add the working team commands to `docs/guides/everyday-loop.md`, a short distinction in `docs/guides/agents.md`, one row on `docs/index.md`, and the same commands on `README.md` and `packages/cli/README.md`.

## Out of this change

Issue #88 stays open. This change does not teach `sdd role room` to accept a change id. Issue #54 stays open. Issue #41 stays untouched. This change does not bump a version and does not publish. The release workflow does that after the docs are on main. No product TypeScript changes.

## Success

The pages above show `sdd team init --template software`, `sdd team show`, `sdd role room`, and `sdd role room post`. They do not say that `sdd role room [change]` prints a room.
