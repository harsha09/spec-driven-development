# Design

> **Roles follow the workflow you name** · `2026-10-29-roles-follow-the-workflow-you-name`

This is a proposal. The person has not signed it.

| Piece | Change |
| --- | --- |
| Role file | Optional `stages` list of stage ids |
| `sdd role create` and `sdd role edit` | `--stages intent,design` replaces or sets that list |
| `matchRoute` | After an owns or skill match, one role that lists the stage wins. Two roles ask. Then the workflow `owner`, when the role file exists |
| Room members | A stage with an owner keeps that owner and `collaborates`. A stage with neither uses the roles that list the stage id |
| `packages/core/defaults/teams/software/routing.yaml` | One skill rule for the dev lead. No stage ids |
| Docs | `docs/reference/workflows.md` and `docs/reference/cli.md` |

The route order stays rules, then owns or skill, then the role's stage list, then the workflow owner.
