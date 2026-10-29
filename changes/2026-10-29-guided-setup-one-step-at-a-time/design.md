# Design

> **Guided setup one step at a time** · `2026-10-29-guided-setup-one-step-at-a-time`

The architect proposes these seams. The person has not signed this change.

## Modules

`sdd setup` stays the command. Prompts stay in `packages/cli/src/commands.ts`. A new file `packages/core/src/role/setup-tour.ts` owns the step ids, the status lines, and one function that runs a step. It calls `initProject`, `prepareGuide`, `initTeam`, `installAgentIntegration`, and `loadModels`. It does not prompt and it does not open a change.

## Steps

The ids are folder, workflow, host, roles, model, check, and start. Done means the file is already there. Folder looks for `.sdd/config.yaml`. Host looks for `.sdd/agents.json`. Roles look for any markdown file in `.sdd/roles`. Model looks for `SDD_ROLE_MODEL` or a valid `.sdd/models.yaml`. The tour does not write `models.yaml`.

The roles piece can ask for the three duties, the software team, or to keep what is here. `--yes` always means the three duties. The software writer is `initTeam`. Both architects are `.sdd/roles/architect.md`, so a duty file already there makes the team writer stop and write nothing.

## Scripts

`--yes` with no `--step`, and a run with no terminal and no `--step`, call `prepareGuide` as they do today. `--step` off a terminal needs `--yes`, except `check`, which only prints.

## Out of this design

No merge command. No change to shipped software role templates. No fix for the sandbox or the room parser.
