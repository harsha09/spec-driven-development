# Clarify design

> **Issue 80 product team on the host entrypoint** · architect seams checked against the reading. Not an acceptance.

The seams are in the design. `loadProductTeam` owns the roster. `agents.ts` inserts the block and leaves an edited generated file alone. Host stubs stay the four stage hats.

One change was required. A `.sdd/roles/<name>.md` file that `readRole` does not parse still counts as a repo role file. The user default is not used. The name-order line says job `not named` and accepts `not named`.
