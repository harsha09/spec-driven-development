# Design

> **Role run reads changes_path** · `2026-10-19-role-run-reads-changes-path`

The sentences in `feature.md` are the contract.

## Path

`runRole` in `packages/core/src/role/run.ts` builds the accepted-file path from `changesDir(root, config)` when `.sdd/config.yaml` exists. `loadConfig` supplies `changes_path`. When the config file is absent, the directory stays `join(root, "changes")`.

No other role path changes. The runner still only reads `accepted.md`.

## Tests

Add one case in `packages/core/src/__tests__/role.test.ts`: `initProject` with `layoutRoot: ".sdd"`, write the accepted section only under `.sdd/changes/<id>/accepted.md`, and expect a model call. A missing section still makes no call. Existing repo-root cases stay.
