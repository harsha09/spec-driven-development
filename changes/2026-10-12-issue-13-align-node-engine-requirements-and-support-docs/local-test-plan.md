# Local test plan

> **Issue #13: align Node engine requirements and support docs** · `2026-10-12-issue-13-align-node-engine-requirements-and-support-docs`

## Environment

- How to run locally: Node 20.19.3 with pnpm 9.15.0; run the pure version tests and inspect the maintained docs/package engine declarations.
- Branch / flags / seed data: no special flags; package manifests remain the source for the supported minimum.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Documentation contract | Search README, first-change tutorial, CLI help, and doctor | Every maintained minimum statement says Node 24+; no user-facing Node 20+ claim remains |
| 2 | Package metadata | Inspect root/core/CLI package manifests | All declare Node `>=24` |
| 3 | Version predicate | Unit-test Node 18, 20, 22, 23, 24, and 25 values | Majors below 24 unsupported; 24+ supported |
| 4 | Doctor behavior | Run doctor on this Node 20 environment | Reports `(24+ required)` and returns unsupported status |
| 5 | Regression | Run full tests, typecheck, lint, build, and docs build | All available checks pass |

## Out of scope this change

- Running Node 24 in this environment; the package contract and pure major-version predicate cover support messaging locally.
- Adding Node 20/22 to CI or lowering package engine constraints.
