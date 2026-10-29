# Tasks

> **Issue 80 product team on the host entrypoint** · dev-lead proposal from the design seams. Not an acceptance.

1. Count an existing `.sdd/roles/<name>.md` that `readRole` does not parse as a repo role file, so `loadProductTeam` returns a repo roster and does not use `SDD_HOME` or `~/.sdd`.
2. List that file on the name-order roster as job `not named` and accepts `not named`, with path `.sdd/roles/<name>.md`. A valid `team.yaml` still sets the order and still blocks the user default.
3. Leave hidden-role filtering and the rendered `~/.sdd` user path unchanged. Do not edit `team.ts`, `profile.ts`, `routing.ts`, `run.ts`, the stage hat, or the host stubs.
4. Extend `entrypoint-team.test.ts` so an unparsed repo role file keeps the product-team block and does not show the user default.
5. Run the Vitest file `packages/core/src/__tests__/entrypoint-team.test.ts`.

The rest of the entrypoint is already on this branch. The dev lead says that code is otherwise done.
