# Design

`sdd setup` calls `prepareGuide`. It initializes the folder when needed and creates planner, architect, and builder only when `.sdd/roles` has no markdown files. An existing role file is left as it is. Stage ids are split into planning, architecture, and construction. `plan` stays on the planner even when it sits after architecture. A stage id that is not in those sets follows the nearest known stage.

`sdd go` calls `runGuide`. It creates the change from the title, then loops. An optional clarify or brainstorm stage is skipped with the reason "No role runs this optional stage." The active stage is routed with `matchRoute`. The role's unanswered `ask_human_when` lines are asked one at a time and stored in `.sdd/role-runs/guide.yaml`. The model then writes one draft. If the draft starts with `Question:`, the guide waits. Otherwise the guide writes the required stage artifacts that are still stubs, marking them as unsigned, and calls `advanceStage`.

A human gate's error is printed and the loop stops. `sdd team signoff` is not called. When the workflow has no next stage, the guide tells the person to run `sdd complete`.

Guide runs do not enter the team tool loop. A write is applied only when it is inside the role. `write product code` in `never` locks writes to the change directory. A secret path is refused. The author prompt gains the role's stages, owns, skills, never, and ask-when lines. Critique and revision prompts stay as they are.

This design is a proposal. The person has not signed it.
