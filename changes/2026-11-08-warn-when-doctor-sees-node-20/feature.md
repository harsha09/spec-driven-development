# Feature

> **Warn when doctor sees Node 20** · `2026-11-08-warn-when-doctor-sees-node-20` · 2026-11-08

Issue #105. This is a reading. The person has not signed it.

## Problem / opportunity

On v0.24.0, `sdd doctor` fails Node.js v20.19.5 and prints `24+ required`. The root, CLI, and core manifests set `engines.node` to `>=24`. The same tree's tests pass on that Node 20 runtime. The README Needs line on v0.24.0 says Node 24+, so the remembered "Node 20+" line is not what that tag contains. Doctor, install, and the README still disagree with a runtime the CLI already runs.

## Users & value

A person or a CI job that stays on Node 20. Doctor should not go red for a runtime the suite passes on. Node 24 stays the recommendation because Node 20 is past upstream end of life.

## Scope

One Node rule. The minimum major is 20. The recommended major is 24. Doctor warns on 20, 21, 22, and 23. Doctor fails below 20. A pass on 24 prints the version and no failure line. `engines.node` is `>=20` in the root, the CLI, and core. The README Needs line, help, the tutorial, the docs index, and the maintainer note use that same rule. The CI test job runs on Node 20 and Node 24.

## Non-goals

Publishing npm. Treating Node 22 as a failure. Requiring Node 24 because a 24-only API is in this tree. An `engine-strict` install failure. Closing any issue other than #105.

## Success criteria

- The doctor check fails Node 18, warns on Node 20 and Node 22, and passes Node 24.
- `pnpm test` exits 0 on Node v20.19.5 and on Node v24.22.2.
- `pnpm install --frozen-lockfile` on Node v20.19.5 exits 0 and does not print an unsupported-engine warning.

## Product owner

The slice matches option 3 of issue #105. The person has not signed this reading.
