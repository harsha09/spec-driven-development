# Tasks

> **Issue 60 configurable team workflow** · `2026-10-23-issue-60-configurable-team-workflow`

1. Add optional `owner`, `collaborates`, and `items_from` on a stage, and optional `approvers` on a gate. Leave older packs valid.
2. Ship `team-software.yaml` with requirements, architecture, stories, plan, tasks, implement, pr_review, and acceptance. Human sign-off is a hard gate on requirements and acceptance.
3. Add templates `plan.md`, `story.md`, `task.md`, and `review.md`. Seed `stories/S-001.md`, `tasks/T-001.md`, and `reviews/R-001.md`.
4. When implement is materialized, write one `items.yaml` row per `tasks/T-*.md` file. Keep `done` on the same id.
5. Show owner, collaborators, and approvers in the handoff when the stage sets them.
6. Cover the pack, the hard gate, item sync, and an old workflow with Vitest. Document the pack and the fields.
