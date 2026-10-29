# Design

> **Issue 71 software QA role** · `2026-10-29-issue-71-software-qa-role`

## Approach

Add `packages/core/defaults/teams/software/roles/qa.md` and one bot after developer in `packages/core/defaults/teams/software/team.yaml`: name qa, role qa, wip 1. Leave `role_wip` as `developer: 2`. Do not edit `routing.yaml`, any workflow, solo, or research.

`initTeam` already copies every role file and refuses the write when `.sdd/team.yaml` exists. `software/qa` is a new template id. Short name `developer` stays ambiguous.

The role's `owns` and `skills` strings are new, so they do not turn an existing single owner into two owners. Update the software roster sentence in `docs/reference/cli.md`. Add `qa` to the decide-test option list, after `product-owner` and before `human`, because `scoreReply` requires the reply keys to match the live role list.

## Seams

| Piece | Change |
|---|---|
| `software/roles/qa.md` | New role file. Filename is the role name |
| `software/team.yaml` | One bot after developer |
| `initTeam` and `createRoleFromTemplate` | Unchanged. They already copy template files |
| `routing.yaml` and `team-software.yaml` | Unchanged |
| `docs/reference/cli.md` | The roster sentence names qa |
| `role-decide.test.ts` | Options include qa so the probability keys still match |

## Risks

A fresh init can offer qa on the no-rule decide path, because options come from role files. Stage rules still do not name qa. An already written `.sdd/team.yaml` is not rewritten. This repo's `.sdd/roles/qa.md` is the host product team, not the template, and is not edited.
