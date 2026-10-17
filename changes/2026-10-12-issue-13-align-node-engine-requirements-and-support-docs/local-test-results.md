# Local verify results

> **Issue #13: align Node engine requirements and support docs** · `2026-10-12-issue-13-align-node-engine-requirements-and-support-docs`
> Overall: PASS for the available local checks

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | README and first-change tutorial now state Node 24+; CLI help and doctor use the same minimum. |
| 2 | PASS | Root, core, and CLI package manifests retain `engines.node >=24`. |
| 3 | PASS | Seven pure version tests reject 18/20/22/23 and accept 24/25. |
| 4 | PASS | CLI doctor integration on Node 20 reports `(24+ required)` and returns unsupported. |
| 5 | PASS | Full test, lint, typecheck, package build, docs build, and CLI smoke chain exited 0. |
| 6 | NOT RUN BY SDD | `sdd verify` reports NOT RUN because patch workflow has no configured verify commands; the checks above were run directly. |

## Commands run

```text
pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/node-support.test.ts src/__tests__/cli.integration.test.ts -t "Node.js support|installs no AI host"
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm docs:build
bash scripts/cli-smoke.sh
sdd verify --change 2026-10-12-issue-13-align-node-engine-requirements-and-support-docs --no-agent
```

## Checklist

- [x] Acceptance cases checked locally.
- [x] No obvious regressions on touched paths.

## Notes

- Validation ran on Node 20.19.3, intentionally below the declared support minimum; pnpm displayed expected EBADENGINE warnings.
- Node 24+ is not installed here, so a supported-runtime execution was not performed.

## Sign-off

- Tested by: Agent-run local checks
- Date: 2026-10-12
