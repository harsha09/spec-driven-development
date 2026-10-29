# Feature

> **Issue 71 software QA role** · `2026-10-29-issue-71-software-qa-role` · 2026-10-29

## Reading

`sdd team init --template software` writes `.sdd/roles/qa.md` with the other role files and lists one more bot in `.sdd/team.yaml`. `sdd team show` prints that bot after the current five: product-manager, architect, product-owner, dev-lead, developer, then qa, with role qa and wip 1. `role_wip` stays `developer: 2`. `sdd role create --template software/qa` copies that file. The existing software routing file is still copied and is not given a QA rule.

The role proposes what to try and the evidence the person can record. It has the same shape as the other software roles: `owns`, `never`, `ask_human_when`, and `approvers: human`. Its `never` list is accept a spec, record a QA result, and generate a release. The recorded result stays the person's words plus the git SHA.

## Source

Issue #71, as filed. The product manager proposes this reading. The product owner and the architect reviewed the same brief. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue names init, role create, and the never list. This change is that role on the software template. One product.

Proposed checks, not a recorded decision:

- `sdd team init --template software` writes `.sdd/roles/qa.md` and lists a bot whose role is qa. `sdd team show` prints that bot.
- `sdd role create --template software/qa` copies `owns`, `never`, `ask_human_when`, and `approvers`.
- `never` includes accept a spec, record a QA result, and generate a release. `approvers` is human.
- Solo and research do not write `qa.md` or a qa bot.
- A second software init still writes nothing when the team file or a role file already exists.

## Non-goals

- No QA stage on the team workflow. Acceptance stays owned by the product owner.
- `software/routing.yaml` gains no rule whose role is qa.
- No `role_wip` entry for qa.
- Solo, research, issue #74, the secret scan, and this repo's already written `.sdd/roles/qa.md` stay as they are.
- A team that already has `.sdd/team.yaml` is not rewritten.
