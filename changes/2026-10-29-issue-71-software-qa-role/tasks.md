# Tasks

> **Issue 71 software QA role** · dev-lead proposal from the design seams. Not an acceptance.

1. Add `packages/core/defaults/teams/software/roles/qa.md`. The job proposes what to try and the evidence the person can record. `never` is accept a spec, record a QA result, and generate a release. `approvers` is human. `owns` and `skills` use strings no other software role uses.
2. Add one bot after developer in `software/team.yaml`: name qa, role qa, wip 1. Leave `role_wip` as developer 2. Do not edit `routing.yaml`, workflows, solo, or research.
3. Name qa in the software roster sentence in `docs/reference/cli.md`. Add qa to the options list in `role-decide.test.ts`, after product-owner and before human. Extend `team.test.ts` so software init writes the file and the bot, role create copies it, and solo and research do not write it.
4. Run `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team.test.ts src/__tests__/role-decide.test.ts src/__tests__/router.test.ts`.
