# Design

> **Warn when doctor sees Node 20** · `2026-11-08-warn-when-doctor-sees-node-20`

This is a reading. The person has not signed it.

## Approach

`packages/cli/src/node-support.ts` owns the two majors. Doctor, help, and the tests read that module. Each `engines.node` value is `>=20`. A test fails when a manifest, the README Needs line, or the CI test matrix drifts from the module.

A search of `packages/`, `scripts/`, and `skills/` found no `fs.glob`, `node:sqlite`, `process.getBuiltinModule`, `Promise.withResolvers`, `Array.fromAsync`, `Object.groupBy`, `Error.isError`, `RegExp.escape`, or an `--experimental-` flag. The TypeScript target is ES2022. `better-sqlite3@12.8.0` allows `20.x`. `vitest@4.1.11` allows `^20`. `pnpm test` on the unchanged tree exited 0 on Node v20.19.5 (core 384 tests, CLI 59 tests) and on Node v24.22.2. Option 2 is not required.

## Components / modules

`nodeSupportLevel` returns `fail`, `warn`, or `pass`. Doctor prints `WARN` for a warning and does not set the failure flag. `FAIL` stays red and sets exit 1. The CI test job matrix is Node 20 and Node 24. Docs and the manual release stay on Node 24.

## Data flow

Doctor reads `process.versions.node` and prints one line. npm and pnpm read `engines.node` at install. They cannot import the TypeScript module, so the range is written in each manifest and the test compares it to `nodeEnginesRange()`.

## Alternatives considered

Option 1 would drop the warning and treat Node 20 as current. Node.js 20 (Iron) ended on 2026-04-30 in the upstream release schedule, so the warning stays. Option 2 would keep `>=24` and fail install. The suite passes on Node 20, so that floor would be false.

## Risks

A later dependency can require Node 24. This rule will not notice until the suite fails. The engines string is copied into three manifests because each package is published on its own. The test is what keeps the copies equal.

## Out of scope

No new dependency. No npm publish. No `engine-strict` switch. Below Node 20, pnpm warns and doctor fails.
