# Tasks

- [x] Add messaging on and off, preserving a valid timeout and refusing an invalid `role.yaml`.
- [x] Add `sdd role handoff` with the check order, both logs, one receiver call, and the sender summary.
- [x] Add `sdd role group` for accepted owners.
- [x] Add network classify: one scope, one service, connection, module lead, and product lead.
- [x] Store a pending plan, accept it, run ready nodes, and keep the parent open.
- [x] Rebuild when `rebuilds` is 0, or when `rebuilds` is 1, `stalled` is false, and the plan is accepted. Otherwise refuse. A no-progress reply keeps the nodes and sets `stalled`.
- [x] Document the commands in `docs/reference/cli.md`.
