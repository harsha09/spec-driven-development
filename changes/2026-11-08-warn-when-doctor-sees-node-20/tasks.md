# Tasks

> **Warn when doctor sees Node 20** · `2026-11-08-warn-when-doctor-sees-node-20`

This list is a proposal. The person has not signed it. One developer.

- [x] Keep the minimum major and the recommended major in `packages/cli/src/node-support.ts`.
- [x] Warn in `sdd doctor` on Node 20–23. Fail only below 20.
- [x] Set `engines.node` to `>=20` and use the same requirement line in help, the README, and the CI test matrix.
- [x] Cover Node 18, 20, 22, and 24 in the doctor version tests.
