# Design

> **Issue 59 role and team config** · `2026-10-23-issue-59-role-and-team-config`

## Approach

Extend the role file the current parser already reads. Add the new fields as string lists. Leave them off the file when they are empty, so a role created with only a label and a job stays the same shape. Put the team in `.sdd/team.yaml`, validated by a Zod schema in `packages/core/src/role/schema.ts`. Ship templates as files under `packages/core/defaults/teams/<name>/`.

## Team file

```yaml
template: software
branch: bot/{bot}/{change}
rooms:
  commit: false
bots:
  - name: developer
    role: developer
    wip: 1
humans:
  - name: Ada Lovelace
role_wip:
  developer: 2
```

`branch` must include `{bot}`. Bot names are unique. `wip` is a positive integer. `rooms.commit` is the rooms commit switch and is false in every shipped template. `role_wip` is optional. Humans are names compared with `git config user.name` by exact match after trim. Init fills `humans` from that git name only when the template list is empty.

## Commands

| Command | Result |
|---|---|
| `sdd team init --template software` | Writes the team file and each role. Refuses when `.sdd/team.yaml` or any of those role files already exists, and writes nothing in that case. |
| `sdd team show` | Prints the template, branch, rooms switch, bots, humans, and role limits. A matching git name is marked `(you)`. |
| `sdd role create <name> --template software/developer` | Copies that role under the new name. `--name` still works. `--label` and `--job` override the template. |
| `sdd role create --name <name> --label <label> --job <job>` | Unchanged. Label and job stay required when there is no template. |

`developer` matches `software/developer` and `solo/developer`, so the command asks for one of those ids. `product-manager` and `researcher` are unique and work as short names.

## Templates

| Template | Roles |
|---|---|
| software | product-manager, architect, product-owner, dev-lead, developer |
| solo | developer |
| research | researcher |

Each role's `never` list includes accepting a spec. `approvers` contains `human`, which means the people in `team.yaml`.

## Host stubs

`SDD_AGENT_ROLES` gains four lines on each of `sdd`, `sdd-planner`, `sdd-implementer`, and `sdd-reviewer`: Owns, Never, Checks, and Ask when. The previous rules stay. The concise-body check moves from 1200 to 1400 characters because the router stub now carries those four lines.

## Failure

A bad `team.yaml` prints `team.yaml is invalid:` and the first schema path. A missing team prints the init command. An unknown template lists the names that exist.
