# Design

> **Issue 60 configurable team workflow** · `2026-10-23-issue-60-configurable-team-workflow`

## Approach

Add optional fields to the workflow schema. A missing field keeps today's behavior. The software team is one example file, not a special case in the engine.

## Seams

The stage carries `owner` and `collaborates`. The gate carries `approvers`. `items_from` is a directory plus one star in the file name, such as `tasks/T-*.md`.

| Piece | Change |
|---|---|
| Stage schema | Optional `owner`, `collaborates`, and `items_from` |
| Gate schema | Optional `approvers` |
| Example | `packages/core/defaults/workflows/team-software.yaml` |
| Templates | `plan.md`, `story.md`, `task.md`, `review.md` |
| Items | `syncStageItems` writes `changes/<id>/items.yaml` when that stage is materialized |
| Handoff | Names the owner, the collaborators, and the approvers when the stage sets them |

Each item stores `id`, `stage`, `source`, and `status` (`open` or `done`). The id is the file name without its extension. Sync replaces items for that stage only and keeps `done` when the id is still present. A file that cannot be read as that list fails with `items.yaml is invalid`.

Human sign-off is the existing hard gate. `sdd next` stops until `sdd gate approve`. The name `human` is stored on the gate. This slice does not check the git user against that name. That check is issue #63.

`team-software` is not recommended for an ordinary title. Its only keyword is `team-software`, and its priority sits below feature.

## Risks

Two stages with `items_from` share one `items.yaml`. The example sets the pattern only on implement. A task file added after implement has started is included the next time that stage is materialized.
