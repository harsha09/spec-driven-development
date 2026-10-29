# Local test plan

> **Issue 71 software QA role** · `2026-10-29-issue-71-software-qa-role`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

QA proposes these checks. They are not a recorded QA result. The person has not signed them.

| # | Check | Expected |
|---|--------|----------|
| 1 | Fresh `sdd team init --template software` | Exit 0. Writes `.sdd/roles/qa.md` and a bot named qa with role qa and wip 1 after developer. Prints `Wrote .sdd/team.yaml from software.` |
| 2 | Software init again when `.sdd/team.yaml` already exists | Exit 1. Prints that the team config already exists and nothing was written. |
| 3 | `sdd team show` after that init | Prints `- qa role qa wip 1`. `role_wip` still lists developer 2. |
| 4 | `sdd role create checker --template software/qa` | Exit 0. The copy is named checker and keeps owns, never, ask_human_when, and approvers. |
| 5 | The never list | Accept a spec, record a QA result, and generate a release. Approvers is human. |
| 6 | Solo init | Exit 0. No qa role file and no routing file. |
| 7 | Research init | Exit 0. No qa role file. |
| 8 | Software routing and the team-software workflow | Unchanged. Implement stays developer. Acceptance stays product-owner. No rule names qa. |
| 9 | `team.test.ts`, `role-decide.test.ts`, and `router.test.ts` | Each Vitest file exits 0. The decide option list includes qa. Implement still resolves to developer. |
| 10 | Core `tsc --noEmit` | Exit 0. |
| 11 | `sdd verify` | `pnpm test` exits 0. The `EBADENGINE` warning is expected and is not a failure. |
