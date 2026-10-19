# Design

> **Hand off work and the task network** · `2026-10-19-hand-off-work-and-the-task-network`

The sentences in `feature.md` are the contract.

## Modules

Add `packages/core/src/role/handoff.ts` for messaging, handoff, group, and the network. `packages/core/src/role/run.ts` keeps the accuracy loop. Handoff imports the existing accepted-section reader, conversation path, model call, and finish path only if those stay exported. If they are private, duplicate the small accepted-section parser in `handoff.ts` rather than changing critique or revision prompt strings.

`packages/core/src/role/index.ts` exports the new functions. `packages/cli/src/role-cmd.ts` adds `messaging`, `handoff`, `group`, and `network` as thin wrappers. Story sentences go to stdout with no consola prefix.

## Files

- `.sdd/role.yaml` keys `role_messaging` and the existing `approval_timeout_minutes`.
- Receiver and sender logs stay `.sdd/role-runs/conversation/<name>/<run-id>.jsonl`.
- Plan file: `.sdd/role-runs/plans/<change>/<section>.json`.

## Tests

`packages/core/src/__tests__/role-handoff.test.ts` uses a fake clock and a fake `RoleModel`. Count `complete` calls and assert `roleId`. One CLI test in `packages/cli/src/__tests__/role.integration.test.ts` runs messaging off and a refused self handoff through the built CLI.

Do not edit the shipped `feature.yaml` files.
