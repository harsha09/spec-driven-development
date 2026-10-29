# Tasks

> **Issue 74 AIDLC sign-off sequence before merge**

The dev lead proposes this list. The person has not signed it.

1. Replace the `team-software` stage list with the twelve sign-off stages. Keep `items_from` on implement and write `tasks/T-001.md` from the plan stage.
2. Add the QA testing template and the sign-off template.
3. Update `team-workflow.test.ts` so every stage refuses to advance until `recordSignoff`, and the task-item sync still sees `T-001`.
4. Update the workflows doc row and the sentence that tells `sdd next` to wait for `sdd team signoff`.

No CLI command change. No merge command.
