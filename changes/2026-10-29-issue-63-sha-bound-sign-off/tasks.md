# Tasks

> **Issue 63 SHA-bound sign-off** · dev-lead proposal from the design seams. Not an acceptance.

1. Add `packages/core/src/role/signoff.ts` and export `recordSignoff` and `recordDecisionRequest`. The review file carries kind, sha, reviewer, verdict, and evidence. Refusals write nothing. A second valid sign-off appends a decisions line and does not rewrite the review file.
2. Add `sdd team signoff` and `sdd role decide`. Both take `--note` and an optional `--change`. Neither takes a role or a reviewer. Decide does not call the model picker and does not set `meta.gates`.
3. Pass the project root into `canLeaveStage` from `advanceStage` and `completeChange`. A hard gate that lists `human` requires the review file for this HEAD. Waive still leaves. Failed still blocks. Approve alone does not.
4. Store the HEAD sha on always allow. `readRule` returns null when HEAD exists and the stored sha is missing or different. No HEAD keeps today's match.
5. Extend `team-workflow.test.ts`, `role.test.ts`, and add `signoff.test.ts`. Leave `team-software.yaml` approvers as they are. Add two sentences to `docs/reference/cli.md`.
